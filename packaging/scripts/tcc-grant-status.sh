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
# ## 为什么只需要两项（2026-09-13 15:41 实测，推翻了此前的三项写法）
#
# 只授权「辅助功能」+「屏幕录制」两个面板后，`macos-harness doctor` 三项读数全为 true，
# 而此时系统库里 `kTCCServiceListenEvent`（输入监控）**连一行记录都没有**——`post_events`
# 由「辅助功能」承载。harness 源码同证：全库无 `kTCCServiceListenEvent` 引用，自报
# `input_monitoring_required: false`。故「输入监控」列为**非必需**：把它算进结论，会让用户
# 白授一个「读取全部按键」的高敏权限，还以为是必须的。
#
# ## 判定为什么必须先验封条
#
# `codesign --verify -R=<要求>` 会**先验封条再判要求**。封条破损的 app 对任何要求都返回
# 不满足，与「要求不匹配」无法从退出码区分（同日实测：旧 adhoc app 封条确为破损——开发期
# 在签名后就地打过补丁）。故本脚本先单独验封条，破损时判「未知」而不是判「死授权」。
#
# ## 契约（唯一实现，别的脚本不得再复制一份）
#
# `--format=tsv` 输出 6 列 TSV，每行一项，必需项在前：
#   service <TAB> required|optional <TAB> auth_value|无记录 <TAB> 要求文本|解不出 <TAB> 形态 <TAB> 满足|不满足|判不了|无记录
# 第 2 列用 **ASCII** 而非「必需/非必需」：本机 awk（macOS awk 20200816）实测把「非必需」
# 判成等于「必需」（`awk 'BEGIN{print ("非必需"=="必需")?"EQ":"NE"}'` → EQ），于是按第 2 列过滤
# 的判据会**把非必需项当成必需项**——中文串比较在这台机器上不可靠，数据列就不能放中文。
# 读库逻辑只有这一个实现；`verify-tcc-runtime.sh` 的验收读数也调本脚本取数，
# 以免两处各判一次、各错一次（ADR-0009：一份事实只有一个家）。
#
# 用法: tcc-grant-status.sh [--quiet] [--format=tsv]
# 环境: LUTE_TCC_BUNDLE_ID（默认 ai.deepseek.dsh.desktop）、LUTE_TCC_APP（默认 /Applications/DSH Desktop.app）、
#       LUTE_TCC_DB（默认系统库路径；**只为反向自测**而存在——自测要造出「死授权」那一行，
#       而系统库里造不出来：造它需要一次真实的授权动作）
# 退出码: 0 = 无死授权（可能「尚未授权」）；3 = 检出死授权（界面会骗人）；4 = 判不了（库/app/封条/要求读不出）
set -uo pipefail

FORMAT=text
QUIET=0
for arg in "$@"; do
  case "$arg" in
    --quiet)      QUIET=1 ;;
    --format=tsv) FORMAT=tsv ;;
    *) printf '[TCC] 未知参数: %s（用法: %s [--quiet] [--format=tsv]）\n' "$arg" "$0" >&2; exit 2 ;;
  esac
done

BID="${LUTE_TCC_BUNDLE_ID:-ai.deepseek.dsh.desktop}"
APP="${LUTE_TCC_APP:-/Applications/DSH Desktop.app}"
SDB="${LUTE_TCC_DB:-/Library/Application Support/com.apple.TCC/TCC.db}"

# 必需两项：这两项不为 true 时，截图 / 键盘鼠标 / 点击类能力直接不可用。
REQUIRED_SERVICES="kTCCServiceAccessibility kTCCServiceScreenCapture"
# 非必需：曾经被旧文档引导授过（ListenEvent），或系统别处在用（AllFiles）。
# 它们**不参与结论与退出码**——只保证「库里有残留」这件事看得见。
OPTIONAL_SERVICES="kTCCServiceListenEvent kTCCServiceSystemPolicyAllFiles"

pane_of() {
  case "$1" in
    kTCCServiceAccessibility)        echo "辅助功能" ;;
    kTCCServiceScreenCapture)        echo "屏幕录制" ;;
    kTCCServiceListenEvent)          echo "输入监控" ;;
    kTCCServiceSystemPolicyAllFiles) echo "完全磁盘访问" ;;
    *)                               echo "$1" ;;
  esac
}

# TSV 的 kind 列是 ASCII（见文件头「契约」），给人看时再翻回中文。
label_of() { [ "$1" = "required" ] && echo "必需" || echo "非必需"; }

# TSV 模式下 stdout 只能是数据：所有给人看的散文都必须经过 say，由这里统一掐掉。
say() { [ "$QUIET" = 1 ] && return 0; [ "$FORMAT" = tsv ] && return 0; printf '%s\n' "$*"; }

[ -r "$SDB" ] || { printf '[TCC] 读不出 %s —— 判不了（不是「健康」）\n' "$SDB" >&2; exit 4; }
[ -d "$APP" ]  || { printf '[TCC] app 不存在: %s —— 判不了\n' "$APP" >&2; exit 4; }

SEAL=ok
codesign --verify --deep --strict "$APP" >/dev/null 2>&1 || SEAL=broken

# 读一行授权记录并给出裁判，输出 6 列 TSV（见文件头「契约」）。
read_row() {
  local svc="$1" v blob stored form sat
  v="$(sqlite3 "$SDB" "select auth_value from access where client='$BID' and service='$svc';" 2>/dev/null)"
  if [ -z "$v" ]; then
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$svc" "$2" "无记录" "<无记录>" "无" "无记录"
    return 0
  fi
  blob="/tmp/.tccgrant-$$.bin"; rm -f "$blob"
  sqlite3 "$SDB" "select writefile('$blob', csreq) from access where client='$BID' and service='$svc';" >/dev/null 2>&1
  # stderr 必须丢弃。踩过的坑：csreq 在文件不存在时会把 "/tmp/….bin: No such file or directory"
  # 打到 **stdout**（2>&1 时），早先这一行被当成「库里存的要求」原样打印，并据此给出
  # 「授权绑定在旧字节上，需重授一次」这个**完全错误的处置建议**——那一行其实压根没有授权。
  # 工具的错误文本绝不参与判定：解不出就是解不出。
  stored="$(csreq -r "$blob" -t 2>/dev/null | head -1)"; rm -f "$blob"

  form="形态未知"
  case "$stored" in
    "")                        form="解不出" ;;
    *cdhash*)                  form="cdhash 型（绑字节）" ;;
    *'certificate leaf = H"'*) form="身份型（绑证书）" ;;
  esac

  sat="判不了"
  if [ "$SEAL" != broken ] && [ -n "$stored" ]; then
    if codesign --verify -R="$stored" "$APP" >/dev/null 2>&1; then sat="满足"; else sat="不满足"; fi
  fi

  # 任何一列都不得为空串：`IFS=$'\t' read` 会把**连续制表符之间的空字段折叠掉**（制表符属于
  # IFS 空白，空白分隔符的连续段算一个），于是后面的列集体左移一列——R5 就是这么被抓出来的：
  # 要求为空的那些行，判定列读到了形态列的值，一个「判不了」的行被算成了「1 项授权有效」。
  # 缺值一律用尖括号占位符，别用空串。
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$svc" "$2" "$v" "${stored:-<解不出>}" "$form" "$sat"
}

DEAD=0; OK=0; PENDING=0; MISSING=0; UNKNOWN=0
REQ_TSV=""; OPT_TSV=""

for svc in $REQUIRED_SERVICES; do
  row="$(read_row "$svc" "required")"
  REQ_TSV="${REQ_TSV}${row}"$'\n'
  IFS=$'\t' read -r _ _ v _ _ sat <<<"$row"
  if   [ "$v" = "无记录" ];                     then MISSING=$((MISSING+1))
  elif [ "$sat" = "判不了" ];                   then UNKNOWN=$((UNKNOWN+1))
  elif [ "$v" = "2" ] && [ "$sat" = "不满足" ]; then DEAD=$((DEAD+1))
  elif [ "$v" = "2" ];                          then OK=$((OK+1))
  else                                               PENDING=$((PENDING+1))
  fi
done

for svc in $OPTIONAL_SERVICES; do
  OPT_TSV="${OPT_TSV}$(read_row "$svc" "optional")"$'\n'
done

if [ "$FORMAT" = tsv ]; then
  printf '%s%s' "$REQ_TSV" "$OPT_TSV"
else
  say "=============================================================="
  say " TCC 授权状态 · $BID"
  say "   app: $APP"
  say "   封条: $([ "$SEAL" = ok ] && echo '完整' || echo '破损（下面的判定不可采信）')"
  say "=============================================================="
  say "── 库里存的两个事实（开关值 / 绑定对象）────────────────────"
  while IFS=$'\t' read -r svc kind v stored form sat; do
    [ -n "$svc" ] || continue
    if [ "$v" = "无记录" ]; then
      say "$(printf '  [%s] %-30s %s' "$(label_of "$kind")" "$svc" "无记录（从未授权过）")"
    elif [ "$sat" = "判不了" ]; then
      say "$(printf '  [%s] %-30s auth_value=%s  判不了（要求 %s）' "$(label_of "$kind")" "$svc" "$v" "$form")"
    else
      say "$(printf '  [%s] %-30s auth_value=%s  %s  → 本 app %s' "$(label_of "$kind")" "$svc" "$v" "$form" "$sat")"
    fi
  done <<<"$REQ_TSV"
  say "  需授权的面板：辅助功能、屏幕录制（这两项之外都不需要）。"
  say ""
  say "── 非必需项（不参与结论，仅供排查残留）─────────────────────"
  while IFS=$'\t' read -r svc kind v stored form sat; do
    [ -n "$svc" ] || continue
    if [ "$v" = "无记录" ]; then
      say "$(printf '  [%s] %-30s %s' "$(label_of "$kind")" "$svc" "无记录")"
    elif [ "$sat" = "判不了" ]; then
      say "$(printf '  [%s] %-30s auth_value=%s  判不了（要求 %s）' "$(label_of "$kind")" "$svc" "$v" "$form")"
    else
      say "$(printf '  [%s] %-30s auth_value=%s  %s  → 本 app %s（授不授都不影响能力）' "$(label_of "$kind")" "$svc" "$v" "$form" "$sat")"
    fi
  done <<<"$OPT_TSV"
fi

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
if [ "$UNKNOWN" -gt 0 ]; then
  say "  判不了：${UNKNOWN} 项有授权记录，但库里存的要求解不出——既不能判它有效，"
  say "    也不能判它是死授权（封条或库读取有问题）。请人工核对上面的表格。"
  exit 4
fi
if [ "$OK" -eq 0 ]; then
  say "  ○ 尚未授权：${MISSING} 项在库里没有任何记录（界面里就是「关着」的，不骗人）。"
  say "    首次安装属正常：按 INSTALL-GUIDE 第 6 节授权即可——**只需「辅助功能」与「屏幕录制」两项**。"
  exit 0
fi
if [ "$PENDING" -gt 0 ]; then
  say "  ○ ${OK} 项授权有效；另有 ${PENDING} 项为「关着」状态（不骗人）。"
  say "    需要那几项能力时，去对应面板打开即可。"
  exit 0
fi
say "  ✓ ${OK} 项授权有效，无死授权。"
exit 0
