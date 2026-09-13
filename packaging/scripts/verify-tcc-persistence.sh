#!/bin/bash
# verify-tcc-persistence.sh —— 判据⑤（升级后 TCC 授权是否重置）的静态证明
#
# 为什么需要它（ADR-0063）：TCC 为一次授权保存的代码要求（csreq）**取自该 app 的指定要求**。
# 于是「这次升级会不会让用户重新授权」不是一个只能靠人工复测的经验问题，而是一个可判定的
# 命题：
#
#     新 app 满足旧 app 的指定要求  ⟺  已存授权在升级后仍然有效
#
# 本脚本把这条等价关系钉成机读判据。它回答的问题与「装完再点一次授权」完全相同，但
# 不需要人工、不需要重启、不需要消耗一次真实授权——因此每一版都能在出货前跑。
#
# ## 判定为什么必须带对照组
#
# 「取读数再比较」的判据会以两种方式假绿，本仓库两种都踩过：
#   1. 读数为空 → `[ "" = "" ]` 判为「一致」（2026-09-13，`codesign -d -r- <相对路径>` 静默
#      失败但退出码 0，见 tools/2.3.0-acceptance-evidence.md §9）；
#   2. 探测器恒真 → 任何输入都返回「通过」（同日，`csreq -t` 的 `-t` 是 **text output** 而非
#      test-file，它从不读目标，恒以 0 退出；用它做判据是纯粹的空转）。
# 所以本脚本：先断言读数非空，再用一条**必须不满足**的要求做反向对照，只有对照为假时才
# 采信正向读数为真。
#
# ## 「不满足」与「写错」必须分开
#
# `codesign --verify -R=` 会先验封条再判要求。**封条破损的 app 会因封条失败而返回不满足**，
# 与「要求不匹配」无法从退出码区分——2026-09-13 实测：旧 adhoc app 的封条确为破损
# （开发期在签名后被就地打补丁，多出 2903 个文件），它对任何要求都返回 not satisfied。
# 因此本脚本把三种结果分开：SAT / UNSAT / MALFORMED，并在判定前先确认目标封条完整；
# 封条破损时输出 INCONCLUSIVE 而不是硬判失败，避免把「输入坏了」说成「结论是坏的」。
#
# 用法: verify-tcc-persistence.sh <旧 app 路径> <新 app 路径>
# 退出码: 0 = 升级后授权保持（可采信）；1 = 会重置或读数不可采信；2 = 用法错误
set -u

OLD="${1-}"
NEW="${2-}"

if [ -z "$OLD" ] || [ -z "$NEW" ]; then
  echo "用法: verify-tcc-persistence.sh <旧 app 路径> <新 app 路径>" >&2
  echo "  含义：旧 app 是用户当前已授权的那一支；新 app 是即将发布的那一支。" >&2
  exit 2
fi

for p in "$OLD" "$NEW"; do
  if [ ! -d "$p" ]; then
    echo "[TCC 保持] 用法错误：app 不存在或不是目录: $p" >&2
    exit 2
  fi
done

PASS=0
FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

# 读指定要求。锚点必须容忍可选的 `# ` 前缀：隐式 DR（adhoc）打成 `# designated => …`，
# 显式 DR（证书签名）打成 `designated => …`。只锚 `^designated =>` 时对 adhoc 取到空串，
# 后续 `grep -q cdhash` 于是得假——判据会放行 adhoc（smoke-test.sh 亦记有同一坑）。
read_dr(){ codesign -d -r- "$1" 2>&1 | sed -n 's/^#* *designated => //p'; }

# 判定：SAT | UNSAT | MALFORMED。`-R=` 后面跟**裸**要求文本（不是 `=` 开头）；
# 误写成 `-R==…` 会得到 "unexpected token: ="——那是写错，不是不满足，必须单列。
verdict(){
  local req="$1" target="$2" out rc
  out="$(codesign --verify -R="$req" "$target" 2>&1)"; rc=$?
  case "$out" in
    *"syntax error"*|*"unexpected token"*|*"invalid or corrupted"*) echo "MALFORMED"; return ;;
  esac
  [ "$rc" -eq 0 ] && echo "SAT" || echo "UNSAT"
}

# 封条是否完整——判定前的前置。破损则所有 verdict 都不可采信。
seal_ok(){ codesign --verify --deep --strict "$1" >/dev/null 2>&1; }

echo "== 判据⑤：TCC 授权跨升级保持 =="
echo "  旧 app: $OLD"
echo "  新 app: $NEW"
echo

echo "-- 前置：封条完整（破损则下述任何读数都不可采信）--"
OLD_SEAL=no; NEW_SEAL=no
seal_ok "$OLD" && OLD_SEAL=yes
seal_ok "$NEW" && NEW_SEAL=yes
[ "$OLD_SEAL" = yes ] && ok "旧 app 封条完整" || no "旧 app 封条破损——其判定读数为 INCONCLUSIVE（注意：这不代表升级会重置授权）"
[ "$NEW_SEAL" = yes ] && ok "新 app 封条完整" || no "新 app 封条破损——出货前必须修（签名后被写入，见 verify-app-signature.sh 头部）"

echo
echo "-- 指定要求可读出（防空读数假绿）--"
OLD_DR="$(read_dr "$OLD")"
NEW_DR="$(read_dr "$NEW")"
[ -n "$OLD_DR" ] && ok "旧 app 指定要求非空" || no "旧 app 指定要求读不出（空串会让后面的比较变成空测试）"
[ -n "$NEW_DR" ] && ok "新 app 指定要求非空" || no "新 app 指定要求读不出"

echo
echo "-- 身份是否与字节解耦（ADR-0063 的核心）--"
if printf '%s' "$OLD_DR" | grep -q 'cdhash'; then
  no "旧 app 的指定要求含 cdhash —— 身份绑定在二进制哈希上，任何重建都会让已存授权失配"
else
  ok "旧 app 的指定要求不含 cdhash"
fi
if printf '%s' "$NEW_DR" | grep -q 'cdhash'; then
  no "新 app 的指定要求含 cdhash —— 签名疑似静默回退 adhoc"
else
  ok "新 app 的指定要求不含 cdhash"
fi

echo
echo "-- 两次指定要求逐字节一致 --"
if [ -n "$OLD_DR" ] && [ "$OLD_DR" = "$NEW_DR" ]; then
  ok "逐字节一致"
else
  no "不一致：跨重建身份发生了变化，已存授权会在升级后失配"
  printf '       旧: %s\n       新: %s\n' "$OLD_DR" "$NEW_DR"
fi

echo
echo "-- 反向对照：探测器必须能说「不」（否则正向读数是空转）--"
BOGUS='identifier "com.lute.tcc-persistence.control-does-not-exist"'
if [ "$NEW_SEAL" = yes ]; then
  BV="$(verdict "$BOGUS" "$NEW")"
  if [ "$BV" = "UNSAT" ]; then
    ok "虚构身份被判不满足（探测器具备区分力）"
  elif [ "$BV" = "MALFORMED" ]; then
    no "对照要求本身写错了（MALFORMED）——本次判定结论不可采信"
  else
    no "虚构身份竟被判满足（SAT）——探测器恒真，本次判定结论不可采信"
  fi
else
  no "跳过反向对照（新 app 封条破损），本次判定结论不可采信"
fi

echo
echo "-- 命题：新 app 是否满足旧 app 的指定要求 --"
if [ "$NEW_SEAL" = yes ] && [ -n "$OLD_DR" ] && ! printf '%s' "$OLD_DR" | grep -q 'cdhash'; then
  V="$(verdict "$OLD_DR" "$NEW")"
  case "$V" in
    SAT)   ok "满足 —— 升级后已存授权继续有效（判据⑤ 成立）" ;;
    UNSAT) no "不满足 —— 升级后用户需重新授权（判据⑤ 不成立）" ;;
    *)     no "判定未成功（MALFORMED）——要求文本无法编译，结论不可采信" ;;
  esac
else
  echo "  [SKIP] 前置不满足，命题未判定（上方 FAIL 已说明原因）"
fi

echo
echo "== 结果: ${PASS} 通过 / ${FAIL} 失败 =="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
