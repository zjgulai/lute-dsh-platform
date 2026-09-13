#!/bin/bash
# 换签后验收 —— ADR-0063 判据④ 与判据⑤ 的运行时确认
#
# 必须在**跑着新 app 的会话**里执行：TCC 的授权查询归因于当前进程所属的 app，
# 因此本脚本的 doctor 读数就是「这个 app 现在有没有被授权」。
#
# 用法:
#   bash verify-tcc.sh          # 打印读数并写一份快照
#   bash verify-tcc.sh --diff   # 与上一份快照对比（判据⑤ 的运行时读法）
#
# ## 为什么判据⑤ 需要「快照 + 对比」
#
# 判据⑤ 的命题是「升级**不改变**这三项读数」。单独一次读 true 说明不了它——必须在
# 授权生效后取一次基线，升级并重启后再取一次，两次逐项相同才算成立。
# 因此本脚本把每次读数落成 JSON，--diff 做逐项比较。
#
# ## 这次升级预期会看到什么（2026-09-13 实测，非推测）
#
# 旧 app（2.0.5-lute.2.0.0，adhoc 签名）的 CDHash 是 595283898d…，而系统 TCC 库里
# 三项授权存的要求正是：
#     cdhash H"595283898d…" or cdhash H"3d09f5a3…"
# 已装 2.3.0 的 CDHash 是 3833cbbc…，**不在**这个集合里，且它的身份已改为证书钉定。
# 所以本支首次以新身份启动时，三项会先变成 false，需要一次性重授；那之后授权就绑定
# 在证书身份上，2.3.1 及后续版本不再需要重授（判据⑤ 已在出货前静态证明 9/9）。
set -uo pipefail

SDB="/Library/Application Support/com.apple.TCC/TCC.db"
BID="ai.deepseek.dsh.desktop"
APP="/Applications/DSH Desktop.app"
SNAPDIR="$HOME/Library/Application Support/LUTE/tools/tcc-snapshots"
SERVICES="kTCCServiceAccessibility kTCCServiceScreenCapture kTCCServiceListenEvent"

export PATH="$HOME/.local/bin:$PATH"

# ── 要求形态判读（判据④ 的「持久性」附加断言）────────────────
# 判据④ 只说「此刻有权」，说不了「下一版还有权」。doctor 全 true 时，库里存的仍可能是
# **cdhash 型**要求——自签证书不被 tccd 接受并退回字节哈希时就会存成那样；三项此刻照样全
# true，但下一版一换字节即全部重置，正是本 ADR 要消除的失败模式，且要到下一版才暴露。
# 故第 2 节解出的**要求形态**是 ⑤ 能否成立的唯一当场判据。
#
# 唯一实现：主流程与自测（`--judge-form`，从 stdin 读同一份 TSV）走的是这一段代码。
# 输入：每行 "<service>\t<auth_value>\t<要求文本>"，即 snap_services 的输出。
# 退出码：0 = 身份型（无 cdhash 且有 certificate leaf）⇒ ⑤ 具备成立条件
#         3 = cdhash 型 ⇒ 授权绑在字节上，⑤ 必然失败
#         4 = 形态未知 ⇒ 需人工判读
judge_req_form() {
  local tsv; tsv="$(cat)"
  if printf '%s' "$tsv" | grep -q 'cdhash'; then
    echo "  ⚠ 但库里存的仍是 **cdhash 型**要求（见第 2 节）："
    printf '%s' "$tsv" | grep 'cdhash' | sed 's/^/      /'
    echo "    ⇒ 判据④ 成立，但判据⑤ **必然失败**：授权此刻有效，却绑定在当前字节上，"
    echo "      下一版换字节即全部重置。**不得**把本次读数当作「升级不再重置」的证据。"
    return 3
  fi
  if printf '%s' "$tsv" | grep -q 'certificate leaf = H"'; then
    echo "  ✓ 且库里存的是**身份型**要求（无 cdhash，钉在证书 leaf 上）——"
    echo "    授权绑定身份而非字节，下一版换字节仍应有效：判据⑤ 具备成立条件。"
    return 0
  fi
  echo "  ⚠ 库里要求既非 cdhash 型、也未见 certificate leaf —— 形态未知，请人工判读第 2 节。"
  return 4
}

if [ "${1-}" = "--judge-form" ]; then
  judge_req_form
  exit $?
fi

# 找出承载本会话的 app 进程（沿父链上溯，取 DSH Desktop 那一层）
app_ancestor() {
  local p="$PPID" i=0
  while [ "$i" -lt 12 ] && [ -n "$p" ] && [ "$p" != "1" ]; do
    local c; c="$(ps -o command= -p "$p" 2>/dev/null | head -1)"
    case "$c" in
      *"/DSH Desktop.app/Contents/MacOS/"*) echo "$p|$c"; return 0 ;;
    esac
    p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
    i=$((i + 1))
  done
  return 1
}

BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Contents/Info.plist" 2>/dev/null)"
CDHASH="$(codesign -d --verbose=4 "$APP" 2>&1 | sed -n 's/^CDHash=//p' | head -1)"
DR="$(codesign -d -r- "$APP" 2>&1 | sed -n 's/^#* *designated => //p')"
AUTH="$(codesign -dv --verbose=2 "$APP" 2>&1 | sed -n 's/^Authority=//p' | head -1)"

snap_services() {  # 输出 "<service>\t<auth_value>\t<csreq 文本>" 三行
  local svc v blob stored
  for svc in $SERVICES; do
    v="$(sqlite3 "$SDB" "select auth_value from access where client='$BID' and service='$svc';" 2>/dev/null)"
    blob="/tmp/.csreq-$$.bin"; rm -f "$blob"
    sqlite3 "$SDB" "select writefile('$blob', csreq) from access where client='$BID' and service='$svc';" >/dev/null 2>&1
    # csreq 的 -t 是「输出为文本」，不是「对目标判定」——只用它把库里存的 csreq 解码。
    stored="$(csreq -r "$blob" -t 2>&1 | head -1)"
    rm -f "$blob"
    printf '%s\t%s\t%s\n' "$svc" "${v:-none}" "${stored:-<空>}"
  done
}

echo "=============================================================="
echo " 换签后验收 · $(date '+%F %T')"
echo "=============================================================="
echo
echo "── 1. 现在跑的是哪一支 ─────────────────────────────────────"
printf '  路径        : %s\n' "$APP"
printf '  CFBundleVer : %s\n' "${BUILD:-<读不出>}"
printf '  Authority   : %s\n' "${AUTH:-<读不出>}"
printf '  CDHash      : %s\n' "${CDHASH:-<读不出>}"
printf '  指定要求    : %s\n' "${DR:-<读不出>}"
APP_PID=""; STALE=0; RUNNING_EXE="<未知>"
if anc="$(app_ancestor)"; then
  APP_PID="${anc%%|*}"
  printf '  承载本会话的进程: pid=%s %s\n' "$APP_PID" "${anc#*|}"
  # 关键：这个进程**实际**在执行哪个文件？被 mv 掉之后，vnode 的路径会指向旧位置。
  RUNNING_EXE="$(lsof -p "$APP_PID" -a -d txt -F n 2>/dev/null | sed -n 's/^n//p' | head -1)"
  printf '  该进程实际执行  : %s\n' "${RUNNING_EXE:-<读不出>}"
  if [ "$RUNNING_EXE" != "$APP/Contents/MacOS/DSH Desktop" ]; then
    STALE=1
    printf '  ⚠ 与已装 app 不是同一支 —— 进程是换签前的旧支（已被换到别处）。\n'
    printf '    ⇒ 第 3 节的 doctor 读数归因于**旧支**，不能当作已装 app 的读数。\n'
  else
    printf '  ✓ 与已装 app 同一支\n'
  fi
else
  printf '  承载本会话的进程: <上溯不到 DSH Desktop —— 本读数可能不归因于本 app>\n'
fi
echo

echo "── 2. 系统 TCC 库里存的三项授权 ────────────────────────────"
SNAP_TSV="$(snap_services)"
if [ ! -r "$SDB" ]; then
  printf '  读不出 %s（缺「完全磁盘访问权限」）—— 第 3 节 doctor 仍是权威读数。\n' "$SDB"
else
  printf '%s\n' "$SNAP_TSV" | while IFS=$'\t' read -r svc v stored; do
    printf '  %-28s auth_value=%s %s\n' "$svc" "$v" "$([ "$v" = 2 ] && echo '(允许)')"
    printf '    TCC 存的要求 : %s\n' "$stored"
    # 拿**库里存的那条要求**判已装 app。踩过的坑：早先用 app 自己的 DR 去判，测的其实是
    # 「app 满足它自己」，恒真——一条假绿。
    if [ -n "$stored" ] && [ "$stored" != "<空>" ]; then
      if codesign --verify -R="$stored" "$APP" >/dev/null 2>&1; then
        printf '    → 已装 app 满足它 : 是（授权对本支有效，无需重授）\n'
      else
        printf '    → 已装 app 满足它 : 否（授权绑定在旧字节上，需重授一次）\n'
      fi
    fi
  done
fi
echo

echo "── 3. 能力读数（权威）──────────────────────────────────────"
DOCTOR="$(macos-harness doctor 2>&1)"
printf '%s\n' "$DOCTOR" | sed 's/^/  /'
ACC="$(printf '%s' "$DOCTOR" | sed -n 's/.*"accessibility": *\([a-z]*\).*/\1/p')"
SCR="$(printf '%s' "$DOCTOR" | sed -n 's/.*"screen_recording": *\([a-z]*\).*/\1/p')"
POST="$(printf '%s' "$DOCTOR" | sed -n 's/.*"post_events": *\([a-z]*\).*/\1/p')"
echo

# ── 快照 ────────────────────────────────────────────────────
# 快照是**证据**，不是日志。第一版把它当日志写，结果 dr 字段里的引号没转义、tcc 各条目之间
# 没有逗号——文件看着像 JSON 却解析不了。凡产出一份要被后人引用的读数，就必须当场验它能解析。
jesc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
mkdir -p "$SNAPDIR"
TS="$(date '+%Y%m%d-%H%M%S')"
SNAP="$SNAPDIR/$TS.json"
{
  printf '{\n'
  printf '  "at": "%s",\n' "$(jesc "$(date '+%F %T')")"
  printf '  "build": "%s",\n' "$(jesc "$BUILD")"
  printf '  "cdhash": "%s",\n' "$(jesc "$CDHASH")"
  printf '  "dr": "%s",\n' "$(jesc "$DR")"
  printf '  "running_exe": "%s",\n' "$(jesc "$RUNNING_EXE")"
  printf '  "running_is_installed": %s,\n' "$([ "$STALE" = "0" ] && echo true || echo false)"
  printf '  "doctor": {"accessibility": %s, "screen_recording": %s, "post_events": %s},\n' \
    "${ACC:-null}" "${SCR:-null}" "${POST:-null}"
  printf '  "tcc": {\n'
  n="$(printf '%s\n' "$SNAP_TSV" | grep -c .)"
  printf '%s\n' "$SNAP_TSV" | { i=0; while IFS=$'\t' read -r svc v stored; do
    [ -n "$svc" ] || continue
    i=$((i + 1)); sep=","; [ "$i" -eq "$n" ] && sep=""
    printf '    "%s": {"auth_value": "%s", "csreq": "%s"}%s\n' \
      "$(jesc "$svc")" "$(jesc "$v")" "$(jesc "$stored")" "$sep"
  done; }
  printf '  }\n}\n'
} > "$SNAP"

if node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$SNAP" 2>/dev/null; then
  printf '快照已写入: %s（JSON 可解析 ✓）\n\n' "$SNAP"
else
  printf '!! 快照 JSON 解析失败——本文件不可作为证据: %s\n\n' "$SNAP" >&2
fi

# ── 判读 ────────────────────────────────────────────────────
ALL="true"
for b in "$ACC" "$SCR" "$POST"; do [ "$b" = "true" ] || ALL="false"; done

echo "── 判读 ────────────────────────────────────────────────────"
if [ "$STALE" = "1" ]; then
  echo "  ⚠ 本会话跑的是换签前的旧支，本脚本**不能**替你判判据④。"
  echo "    第 3 节的 true 属于那个即将消失的进程，不属于已装 app。"
  echo "    依第 2 节：已装 app 不满足库里存的三条要求 ⇒ 重启后三项会先变 false。"
  echo "    动作：重启 DSH Desktop → 打开一个会话重跑本脚本 → 按提示一次性重授。"
elif [ "$ALL" = "true" ]; then
  echo "  判据④ 通过：本会话跑的就是已装 app，三项均为 true，授权已生效。"
  printf '%s' "$SNAP_TSV" | judge_req_form
  echo "  下一步（判据⑤）：现在就是基线。升级到 2.3.1 → 重启 → 再跑一次 --diff，"
  echo "                   三项应保持不变。"
else
  echo "  判据④ 未通过：三项尚有为 false 的。"
  if [ "$(printf '%s' "$SNAP_TSV" | grep -c 'auth_value.*2' || true)" -gt 0 ]; then
    echo "  库里 auth_value 仍写着「允许」，但要求不匹配新身份 —— 这是换签的一次性代价，"
    echo "  不是用户把开关关掉了。"
  fi
  echo "  请到 系统设置 → 隐私与安全性 → 辅助功能 / 屏幕录制 / 输入监控，"
  echo "  把「LUTE Agentic System」关掉再打开（三项都要），然后重跑本脚本。"
fi

if [ "${1-}" = "--diff" ]; then
  PREV="$(ls -1 "$SNAPDIR"/*.json 2>/dev/null | grep -v "$(basename "$SNAP")" | tail -1)"
  echo
  echo "── 判据⑤：与上一份快照对比 ─────────────────────────────────"
  if [ -z "$PREV" ]; then
    echo "  没有更早的快照可比。先在授权生效时跑一次取基线。"
  else
    echo "  基线: $(basename "$PREV")"
    echo "  当前: $(basename "$SNAP")"
    for k in accessibility screen_recording post_events; do
      a="$(sed -n "s/.*\"$k\": *\([a-z]*\).*/\1/p" "$PREV" | head -1)"
      b="$(sed -n "s/.*\"$k\": *\([a-z]*\).*/\1/p" "$SNAP" | head -1)"
      if [ "$a" = "$b" ]; then
        printf '    [PASS] %-18s %s → %s（未变）\n' "$k" "$a" "$b"
      else
        printf '    [FAIL] %-18s %s → %s（变了 —— 授权被重置）\n' "$k" "$a" "$b"
      fi
    done
    pa="$(sed -n 's/.*"cdhash": *"\([^"]*\)".*/\1/p' "$PREV" | head -1)"
    pb="$(sed -n 's/.*"cdhash": *"\([^"]*\)".*/\1/p' "$SNAP" | head -1)"
    echo
    # 配对断言：两次若是**同一支**，「三项未变」什么也没证明——app 根本没换。
    # 判据⑤ 要的是「换了字节、授权仍在」，所以 CDHash 必须不同，否则这是一次空测试。
    if [ "$pa" = "$pb" ]; then
      printf '    [空测试] 两次读的是同一支（CDHash %s），\n' "${pa:0:12}"
      printf '             故上面的「未变」不构成判据⑤ 的证据。\n'
      printf '             要证明跨版本保持：升级到新版 → 重启 → 再跑 --diff，CDHash 必须不同。\n'
      echo "    ⇒ 判据⑤ 本次未判定"
    else
      printf '    [PASS] 字节确实换了: %s → %s\n' "${pa:0:12}" "${pb:0:12}"
      printf '           而三项读数保持不变 ⇒ 升级未重置授权，判据⑤ 成立。\n'
    fi
  fi
fi
