#!/bin/bash
# verify-tcc-form-test.sh —— 「TCC 要求形态」判读的反向自测
#
# 为什么存在：判据④ 的命题是「装机后 `macos-harness doctor` 三项为 true」，但 doctor 全 true
# **推不出**判据⑤（「升级后授权不重置」）。真正决定 ⑤ 能否成立的，是 TCC 库里那条要求的**形态**：
#
#   · 身份型（钉 `certificate leaf = H"…"`）→ 换字节仍有效，⑤ 成立
#   · cdhash 型（钉字节哈希）              → 换字节即重置，⑤ 必然失败
#
# 而这两种形态下 doctor 都报 true。若不看形态就宣布 ④ 通过，交付的是一条**要到下一版才暴露**
# 的失败——正是 ADR-0063 要消除的那一类。所以这段判读必须被证明「在应当判红时确实判红」。
#
# 本测试直接驱动生产代码（`verify-tcc-runtime.sh --judge-form` 读 stdin），不复制逻辑：
# 复制的测试测的是副本，副本对了不等于生产对了。
#
#   F1 库里是旧支的 cdhash 型要求（**真实历史坏输入**）→ 必须退 3
#   F2 库里是身份型要求（**真实产物 DR 文本**）        → 必须退 0
#   F3 形态未知（apple 锚定等非我方形态）              → 必须退 4（不得当作通过）
#   F4 空输入                                          → 必须不为 0（防空转恒真）
#   F5 只有**非必需项**是 cdhash 型                    → 必须退 4，**不得**退 3
#   F6 旧格式（3 列、无 kind 列）                      → 必须不为 0（fail-closed）
#
# F5/F6 的由来（2026-09-13）：`post_events` 由「辅助功能」承载，「输入监控」已实测定为非必需。
# 若判决还去看非必需项，一条早年被旧文档引导授过的残留就会让验收喊「⑤ 必然失败」——一个与
# 自己无关的结论。而格式一旦漂移（列数变了却没人改判据），判据必须拒绝作答而不是默认通过。
#
# 全程只做文本判读，不读 TCC 库、不触碰 /Applications 与 ~/.dsh。
#
# 用法: bash packaging/scripts/verify-tcc-form-test.sh
# 退出码: 0 = 全部通过；1 = 有断言失败
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
UNDER_TEST="$HERE/verify-tcc-runtime.sh"

PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

if [ ! -f "$UNDER_TEST" ]; then
  echo "[自测] 找不到被测脚本: $UNDER_TEST" >&2; exit 1
fi

judge(){ # $1=TSV 文本 → 打印 "rc=<n>"
  local rc=0
  printf '%s' "$1" | bash "$UNDER_TEST" --judge-form >/dev/null 2>&1 || rc=$?
  printf 'rc=%s' "$rc"
}

echo "── TCC 要求形态判读 · 反向自测 ─────────────────────────────"

# 夹具格式 = `tcc-grant-status.sh --format=tsv` 的 6 列（kind 列是 ASCII，见该脚本「契约」）：
#   service <TAB> required|optional <TAB> auth_value <TAB> 要求文本 <TAB> 形态 <TAB> 判定
# F1：真实历史坏输入 —— 2026-09-13 直读 /Library/.../TCC.db 得到的换签前 adhoc 支要求
CDHASH_TSV="$(printf 'kTCCServiceAccessibility\trequired\t2\tcdhash H"595283898d1adbeffda047410679fc9480b67d05" or cdhash H"3d09f5a367190a09a4ac253f006ceabb21973731"\tcdhash 型（绑字节）\t不满足')"
r="$(judge "$CDHASH_TSV")"
if [ "$r" = "rc=3" ]; then ok "F1 cdhash 型要求被判红（${r}）"
else no "F1 期望 rc=3，实得 $r —— 会把「⑤ 必然失败」误判为通过"; fi

# F2：真实产物文本 —— 2026-09-13 15:41 用户在新身份 app 上重授后，库里实际存下的那条要求
LEAF_TSV="$(printf 'kTCCServiceAccessibility\trequired\t2\tidentifier "ai.deepseek.dsh.desktop" and certificate leaf = H"ba3372a39bf4fe09e467ab8565cfb3a0166babbe"\t身份型（绑证书）\t满足')"
r="$(judge "$LEAF_TSV")"
if [ "$r" = "rc=0" ]; then ok "F2 身份型要求被放行（${r}）"
else no "F2 期望 rc=0，实得 $r —— 正例被判红"; fi

# F3：形态未知 —— 不得当通过（我方 app 正常不可能是这个形态）
r="$(judge "$(printf 'kTCCServiceAccessibility\trequired\t2\tidentifier "com.apple.Terminal" and anchor apple\t形态未知\t不满足')")"
if [ "$r" = "rc=4" ]; then ok "F3 未知形态不被当作通过（${r}）"
else no "F3 期望 rc=4，实得 $r"; fi

# F4：空输入 —— 防止实现退化成「恒真」（历史上的 `csreq -t` 就是这样一条空转判据）
r="$(judge '')"
if [ "$r" != "rc=0" ]; then ok "F4 空输入不通过（${r}）"
else no "F4 空输入竟判通过 —— 实现已退化为恒真"; fi

# F5：非必需项是 cdhash 型 —— 与判据⑤ 无关，必须**不**触发「必然失败」
NONREQ_TSV="$(printf 'kTCCServiceListenEvent\toptional\t2\tcdhash H"595283898d1adbeffda047410679fc9480b67d05"\tcdhash 型（绑字节）\t不满足')"
r="$(judge "$NONREQ_TSV")"
if [ "$r" = "rc=4" ]; then ok "F5 非必需项的 cdhash 型残留不影响 ⑤（判形态未知，不判必败）"
else no "F5 期望 rc=4（只有非必需项时无可判形态），实得 $r —— 非必需项污染了判决"; fi

# F6：旧格式（3 列，无 kind 列）—— 格式漂移必须 fail-closed
r="$(judge "$(printf 'kTCCServiceAccessibility\t2\tidentifier "ai.deepseek.dsh.desktop" and certificate leaf = H"ba3372a39bf4fe09e467ab8565cfb3a0166babbe"')")"
if [ "$r" != "rc=0" ]; then ok "F6 旧格式不被当作通过（${r}）"
else no "F6 旧格式竟判通过 —— 判据在读不懂的输入上默认放行"; fi

echo
printf '断言：%d 通过 / %d 失败\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
