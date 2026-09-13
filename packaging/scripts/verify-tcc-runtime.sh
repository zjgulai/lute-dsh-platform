#!/bin/bash
# verify-tcc-runtime.sh —— 换签后验收 · ADR-0063 判据④ 与判据⑤ 的运行时确认
#
# 必须在**跑着新 app 的会话**里执行：TCC 的授权查询归因于当前进程所属的 app，
# 因此本脚本的 doctor 读数就是「这个 app 现在有没有被授权」。
#
# 用法:
#   bash verify-tcc-runtime.sh          # 打印读数并写一份快照
#   bash verify-tcc-runtime.sh --diff   # 与上一份快照对比（判据⑤ 的运行时读法）
#
# ## 为什么判据⑤ 需要「快照 + 对比」
#
# 判据⑤ 的命题是「升级**不改变**这两项读数」。单独一次读 true 说明不了它——必须在
# 授权生效后取一次基线，升级并重启后再取一次，两次逐项相同才算成立。
# 因此本脚本把每次读数落成 JSON，--diff 做逐项比较。
#
# ## 读库这件事只有一份实现（2026-09-13 修正）
#
# 第 2 节早先自带一份 `snap_services()`，与 `tcc-grant-status.sh` 各读一遍库。两份实现里
# 只有一份有测试，于是错的那一份活了很久，并在今天真实骗了一次人：库里**根本没有**那项授权
# （`auth_value` 读不出）时，`writefile()` 没写出文件，`csreq` 把
# `/tmp/.csreq-….bin: No such file or directory` 打到 **stdout**，那份实现把**这句错误文本**
# 当成了「库里存的要求」打印出来，还据此给出「授权绑定在旧字节上，需重授一次」——
# 一个把「从来没有授权」说成「重授一次就好」的假阴性。
# 现在第 2 节改为调 `tcc-grant-status.sh --format=tsv` 取数（ADR-0009：一份事实只有一个家），
# 那份实现有 9 条反向断言 + 一次恒真桩突变守着，错的形态不会再活下来。
#
# ## 这次换签的完整时间线（2026-09-13 实测，非推测）
#
# 11:58–12:00 用户在**还是 adhoc 的** app 上重授过一次（库写入 cdhash 型要求，auth_value=2）；
# 12:57       固定身份的 2.3.0 就位 → 那三条要求立即失配，而开关值原样留着；
# 12:57–15:26 三项能力静默死亡 2.5 小时，隐私界面里它们一直显示「已开启」；
# 15:41–15:44 用户在**新身份**的 app 上重授两项 → 库里改写为
#             `identifier "ai.deepseek.dsh.desktop" and certificate leaf = H"ba3372a3…"`，
#             已装 app 满足它 → 判据④ 通过。这条**身份型**要求就是判据⑤ 的前提：
#             它绑在证书上而不是字节上，下一版换字节仍应有效。
#
# 第三项 `post_events` 由「辅助功能」承载，「输入监控」非必需——见 tcc-grant-status.sh 文件头。
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DETECTOR="$HERE/tcc-grant-status.sh"
APP="/Applications/DSH Desktop.app"
SNAPDIR="$HOME/Library/Application Support/LUTE/tools/tcc-snapshots"

export PATH="$HOME/.local/bin:$PATH"

# ── 要求形态判读（判据④ 的「持久性」附加断言）────────────────
# 判据④ 只说「此刻有权」，说不了「下一版还有权」。doctor 全 true 时，库里存的仍可能是
# **cdhash 型**要求——自签证书不被 tccd 接受并退回字节哈希时就会存成那样；两项此刻照样全
# true，但下一版一换字节即全部重置，正是本 ADR 要消除的失败模式，且要到下一版才暴露。
# 故第 2 节解出的**要求形态**是 ⑤ 能否成立的唯一当场判据。
#
# 只看**必需项**：非必需项的残留（例如早年被旧文档引导授过的「输入监控」）与 ⑤ 无关，
# 让它参与判决会得出「⑤ 必然失败」这种与自己无关的结论。
#
# 唯一实现：主流程与自测（`--judge-form`，从 stdin 读同一份 TSV）走的是这一段代码。
# 输入：`tcc-grant-status.sh --format=tsv` 的 6 列 TSV（第 2 列是 必需/非必需）。
#       旧格式（3 列、无 kind 列）会被过滤成空输入，从而判「形态未知」——fail-closed，
#       不认识的格式不许说通过。
# 退出码：0 = 身份型（无 cdhash 且有 certificate leaf）⇒ ⑤ 具备成立条件
#         3 = cdhash 型 ⇒ 授权绑在字节上，⑤ 必然失败
#         4 = 形态未知 ⇒ 需人工判读
judge_req_form() {
  # 只看 required 行。第 2 列必须是 ASCII 的 required/optional：本机 awk 实测把中文串
  # 「非必需」判成等于「必需」，用中文做过滤会把非必需项当成必需项（见 tcc-grant-status.sh 契约）。
  local tsv; tsv="$(awk -F'\t' 'NF>=6 && $2=="required"')"
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
  echo "  ⚠ 必需项里既未见 cdhash 型、也未见 certificate leaf —— 形态未知，请人工判读第 2 节。"
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

echo "── 2. 系统 TCC 库里存的授权（唯一实现: tcc-grant-status.sh）──"
SNAP_TSV=""
if [ ! -x "$DETECTOR" ] && [ ! -f "$DETECTOR" ]; then
  printf '  判不了：找不到 %s —— 本脚本**不再自带一份读库实现**（那样会出现两份逻辑、\n' "$DETECTOR"
  printf '  只有一份有测试）。请从仓库或出货包 tools/ 里取回该脚本后重跑。\n'
else
  SNAP_TSV="$(bash "$DETECTOR" --format=tsv 2>/dev/null || true)"
fi
if [ -z "${SNAP_TSV//[$'\n']/}" ]; then
  printf '  判不了：取不到库读数（%s 执行失败或输出为空）。第 3 节 doctor 仍是权威读数。\n' "$DETECTOR"
else
  printf '%s\n' "$SNAP_TSV" | while IFS=$'\t' read -r svc kind v stored form sat; do
    [ -n "$svc" ] || continue
    printf '  [%s] %s\n' "$([ "$kind" = "required" ] && echo 必需 || echo 非必需)" "$svc"
    if [ "$v" = "无记录" ]; then
      printf '    库里没有这一项的任何记录：从未授权过（界面上就是「关着」的）。\n'
      continue
    fi
    printf '    auth_value=%s%s\n' "$v" "$([ "$v" = 2 ] && echo '（允许）')"
    printf '    TCC 存的要求 : %s\n' "$stored"
    # 拿**库里存的那条要求**判已装 app。踩过的坑：早先用 app 自己的 DR 去判，测的其实是
    # 「app 满足它自己」，恒真——一条假绿。
    if [ "$stored" = "<解不出>" ]; then
      printf '    → 判不了：库里这一行的要求解不出，不能当有效、也不能当死授权。\n'
    elif codesign --verify -R="$stored" "$APP" >/dev/null 2>&1; then
      printf '    → 已装 app 满足它 : 是（授权对本支有效，无需重授）\n'
    else
      printf '    → 已装 app 满足它 : 否（授权绑定在旧字节上，需重授一次）\n'
    fi
  done
  printf '  注：非必需项（如「输入监控」）的残留不影响任何能力，也不参与下面的判决。\n'
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
  printf '%s\n' "$SNAP_TSV" | { i=0; while IFS=$'\t' read -r svc kind v stored form sat; do
    [ -n "$svc" ] || continue
    i=$((i + 1)); sep=","; [ "$i" -eq "$n" ] && sep=""
    printf '    "%s": {"kind": "%s", "auth_value": "%s", "csreq": "%s", "form": "%s", "satisfaction": "%s"%s\n' \
      "$(jesc "$svc")" "$(jesc "$kind")" "$(jesc "$v")" "$(jesc "$stored")" "$(jesc "$form")" "$(jesc "$sat")" "}$sep"
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
  echo "    依第 2 节：已装 app 不满足库里存的那条要求 ⇒ 重启后两项会先变 false。"
  echo "    动作：重启 DSH Desktop → 打开一个会话重跑本脚本 → 按提示一次性重授。"
elif [ "$ALL" = "true" ]; then
  echo "  判据④ 通过：本会话跑的就是已装 app，三项读数均为 true，授权已生效。"
  if [ -n "${SNAP_TSV//[$'\n']/}" ]; then
    printf '%s\n' "$SNAP_TSV" | judge_req_form
  else
    echo "  ⚠ 但取不到库读数（第 2 节）——⑤ 的前提（要求形态）本次**未判定**。"
  fi
  echo "  下一步（判据⑤）：现在就是基线。升级到下一版 → 重启 → 再跑一次 --diff，"
  echo "                   三项应保持不变，且 CDHash 必须不同。"
else
  echo "  判据④ 未通过：三项尚有为 false 的。"
  if [ "$(printf '%s' "$SNAP_TSV" | grep -c 'auth_value.*2' || true)" -gt 0 ]; then
    echo "  库里 auth_value 仍写着「允许」，但要求不匹配新身份 —— 这是换签的一次性代价，"
    echo "  不是用户把开关关掉了。"
  fi
  echo "  请到 系统设置 → 隐私与安全性 → 辅助功能 / 屏幕录制（只需这两项；"
  echo "  「输入监控」非必需，不要去授它），把「LUTE Agentic System」关掉再打开，然后重跑本脚本。"
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
