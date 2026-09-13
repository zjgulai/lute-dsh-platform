#!/bin/bash
# tcc-grant-status.sh —— 检出「开关显示已开启，但授权其实是死的」这一状态
#
# ## 为什么需要它（2026-09-13 实测的真实事故）
#
# 系统 TCC 库里，一次授权由**两个互相独立的事实**组成：
#
#   1. 开关值   `access.auth_value`（2=允许）——**隐私界面只显示这一个**
#   2. 绑定对象 `access.csreq`（该授权绑在哪段代码上）
#
# 换签名身份之后（ADR-0063：adhoc → 固定证书），app 的字节变了，于是第 2 个事实失配，
# 而第 1 个事实**原样留在库里**。结果是：界面显示「已开启」、`macos-harness doctor`
# 三项全 false——用户在界面上看不到任何异常，去授权面板里看也只会觉得「我明明开了」。
#
# 本机实际发生过（2026-09-13）：
#   11:58–12:00 用户在**还是 adhoc 的** app 上重授过一次（库写入 cdhash 型要求，auth_value=2）；
#   12:57       固定身份的 2.3.0 就位 → 上述三条要求立即失配；
#   12:57–15:26 三项能力静默死亡 2.5 小时，界面上它们一直是「开着」的。
#
# 因此「授权状态」不能只读开关值。本脚本每次同时读两个事实并给出裁判，退出码即结论。
#
# ## 判定为什么必须先验封条
#
# `codesign --verify -R=<要求>` 会**先验封条再判要求**。封条破损的 app 对任何要求都返回
# 不满足，与「要求不匹配」无法从退出码区分（同日实测：旧 adhoc app 封条确为破损——开发期
# 在签名后就地打过补丁）。故本脚本先单独验封条，破损时判「未知」而不是判「死授权」。
#
# 用法: tcc-grant-status.sh [--quiet]
# 环境: LUTE_TCC_BUNDLE_ID（默认 ai.deepseek.dsh.desktop）、LUTE_TCC_APP（默认 /Applications/DSH Desktop.app）、
#       LUTE_TCC_DB（默认系统库路径；**只为反向自测**而存在——自测要造出「死授权」那一行，
#       而系统库里造不出来：造它需要一次真实的授权动作）
# 退出码: 0 = 无死授权（可能「尚未授权」）；3 = 检出死授权（界面会骗人）；4 = 判不了（库/app/封条读不出）
set -uo pipefail

QUIET=0
[ "${1-}" = "--quiet" ] && QUIET=1

BID="${LUTE_TCC_BUNDLE_ID:-ai.deepseek.dsh.desktop}"
APP="${LUTE_TCC_APP:-/Applications/DSH Desktop.app}"
SDB="${LUTE_TCC_DB:-/Library/Application Support/com.apple.TCC/TCC.db}"

# 服务 → 用户看到的面板名。AllFiles 一并读：它同样是 cdhash 型的遗留行（2026-09-13 实测），
# 只是当前 auth_value=0，不构成「骗人的开关」，但必须可见。
SERVICES="kTCCServiceAccessibility kTCCServiceScreenCapture kTCCServiceListenEvent kTCCServiceSystemPolicyAllFiles"
pane_of() {
  case "$1" in
    kTCCServiceAccessibility)        echo "辅助功能" ;;
    kTCCServiceScreenCapture)        echo "屏幕录制" ;;
    kTCCServiceListenEvent)          echo "输入监控" ;;
    kTCCServiceSystemPolicyAllFiles) echo "完全磁盘访问" ;;
    *)                               echo "$1" ;;
  esac
}

say() { [ "$QUIET" = 1 ] || printf '%s\n' "$*"; }

[ -r "$SDB" ] || { printf '[TCC] 读不出 %s —— 判不了（不是「健康」）\n' "$SDB" >&2; exit 4; }
[ -d "$APP" ]  || { printf '[TCC] app 不存在: %s —— 判不了\n' "$APP" >&2; exit 4; }

SEAL=ok
codesign --verify --deep --strict "$APP" >/dev/null 2>&1 || SEAL=broken

DEAD=0; PENDING=0; OK=0; MISSING=0
ROWS=""

for svc in $SERVICES; do
  v="$(sqlite3 "$SDB" "select auth_value from access where client='$BID' and service='$svc';" 2>/dev/null)"
  if [ -z "$v" ]; then
    # 无记录 = 从未授权过（新机器形态）。必须单独计数：否则「一条记录都没有」会走到
    # 最后那句「✓ 0 项授权有效」——一句听着像通过、其实什么都没判的空话。
    MISSING=$((MISSING+1))
    ROWS="${ROWS}$(printf '%-28s %s\n' "$svc" "无记录")"$'\n'
    continue
  fi
  blob="/tmp/.tccgrant-$$.bin"; rm -f "$blob"
  sqlite3 "$SDB" "select writefile('$blob', csreq) from access where client='$BID' and service='$svc';" >/dev/null 2>&1
  # csreq 的 -t 是「输出为文本」，不是「对目标判定」——只用它把库里存的 csreq 解码。
  stored="$(csreq -r "$blob" -t 2>&1 | head -1)"; rm -f "$blob"

  form="未知"
  case "$stored" in
    *cdhash*)                  form="cdhash 型（绑字节）" ;;
    *'certificate leaf = H"'*) form="身份型（绑证书）" ;;
    "")                        form="解不出" ;;
  esac

  sat="判不了"
  if [ "$SEAL" = broken ]; then
    sat="判不了（封条破损）"
  elif [ -n "$stored" ] && codesign --verify -R="$stored" "$APP" >/dev/null 2>&1; then
    sat="满足"
  else
    sat="不满足"
  fi

  ROWS="${ROWS}$(printf '%-28s auth_value=%s  %s  → 本 app %s\n' "$svc" "$v" "$form" "$sat")"$'\n'

  if [ "$v" = "2" ] && [ "$sat" = "不满足" ]; then
    DEAD=$((DEAD+1))
  elif [ "$v" = "2" ] && [ "$sat" = "满足" ]; then
    OK=$((OK+1))
  elif [ "$v" != "2" ]; then
    PENDING=$((PENDING+1))
  fi
done

say "=============================================================="
say " TCC 授权状态 · $BID"
say "   app: $APP"
say "   封条: $([ "$SEAL" = ok ] && echo '完整' || echo '破损（下面的判定不可采信）')"
say "=============================================================="
say "── 库里存的两个事实（开关值 / 绑定对象）────────────────────"
printf '%s' "$ROWS" | sed 's/^/  /'

say ""
say "── 结论 ────────────────────────────────────────────────────"
if [ "$SEAL" = broken ]; then
  say "  判不了：app 封条破损。先修签名（见 docs/sop/dmg-release.md），再跑本脚本。"
  exit 4
fi
if [ "$DEAD" -gt 0 ]; then
  say "  ✗ 检出 ${DEAD} 项**死授权**：库里写着「允许」，但它绑的是**另一段代码**。"
  say "    隐私界面会把这 ${DEAD} 项显示成「已开启」——那不是真的开启，界面上看不出来。"
  say "    这是换签名身份后的遗留（旧身份写的要求，新 app 不满足）。"
  say "    处置：系统设置 → 隐私与安全性，进对应面板把「LUTE Agentic System」**关掉再打开**；"
  say "          仍不行就先 tccutil reset <面板> ${BID}，再用列表下方的「＋」把 app 加回来。"
  exit 3
fi
if [ "$OK" -eq 0 ]; then
  say "  ○ 尚未授权：${MISSING} 项在库里没有任何记录（界面里就是「关着」的，不骗人）。"
  say "    首次安装属正常：按 INSTALL-GUIDE 第 6 节授权即可。"
  exit 0
fi
if [ "$PENDING" -gt 0 ]; then
  say "  ○ ${OK} 项授权有效；另有 ${PENDING} 项为「关着」状态（不骗人）。"
  say "    需要那几项能力时，去对应面板打开即可。"
  exit 0
fi
say "  ✓ ${OK} 项授权有效，无死授权。"
exit 0
