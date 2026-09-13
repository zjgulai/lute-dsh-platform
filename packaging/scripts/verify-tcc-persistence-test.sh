#!/bin/bash
# verify-tcc-persistence-test.sh —— 判据⑤ 判据脚本的反向自测
#
# 为什么存在：一条只会说「通过」的判据不是判据。verify-tcc-persistence.sh 的结论
# （「本次升级不会让用户重新授权」）是一个**出货前的放行依据**，因此它必须被证明
# 「在应当判红时确实会判红」。本测试用最小合成 bundle 把它钉死：
#
#   G1 同身份重建（只改版本号）→ 必须放行     （⑤ 成立的正例）
#   G2 旧支是 adhoc            → 必须判红     （cdhash 形态必须被识别）
#   G3 签名后追加一个字节      → 必须拒绝认证 （封条破损 → INCONCLUSIVE，不得硬判通过）
#   G4 探测器自检              → 虚构身份必须被判「不满足」
#
# G4 单独存在的理由：2026-09-13 实测 `csreq -t` 的 `-t` 是 text output 而非 test-file，
# 它从不读目标、恒以 0 退出——拿它当判据会得到一条**永远通过**的空转。G4 就是防这一类：
# 若某天判定换成了恒真的实现，G2/G3 也会随之全部变绿，G4 则必然先红。
#
# 全程沙箱：合成 bundle 落在 mktemp 目录里，不触碰 /Applications 与 ~/.dsh。
#
# 用法: bash packaging/scripts/verify-tcc-persistence-test.sh
# 退出码: 0 = 全部通过（或声明了跳过）；1 = 有断言失败
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
UNDER_TEST="$HERE/verify-tcc-persistence.sh"
IDENTITY="LUTE Code Signing"

PASS=0; FAIL=0; SKIP=0
ok(){   PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){   FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }
skip(){ SKIP=$((SKIP+1)); printf '  [SKIP] %s\n' "$1"; }

if [ ! -x "$UNDER_TEST" ] && [ ! -f "$UNDER_TEST" ]; then
  echo "[自测] 找不到被测脚本: $UNDER_TEST" >&2; exit 1
fi

# 造一个最小可签名 bundle：真 Mach-O 作主可执行文件 + 最小 Info.plist。
make_app(){ # $1=目录 $2=版本号
  local dir="$1" ver="$2"
  mkdir -p "$dir/Contents/MacOS"
  cp /bin/echo "$dir/Contents/MacOS/TccApp"
  cat > "$dir/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.lute.tcc-persistence-test</string>
  <key>CFBundleExecutable</key><string>TccApp</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleName</key><string>TccApp</string>
  <key>CFBundleVersion</key><string>${ver}</string>
</dict></plist>
PLIST
}

TMP="$(mktemp -d -t tcc-persist-test)"
trap 'rm -rf "$TMP"' EXIT

echo "== verify-tcc-persistence.sh 反向自测 =="
echo

if ! security find-identity -v -p codesigning 2>/dev/null | grep -qF "$IDENTITY"; then
  skip "本机没有签名身份「${IDENTITY}」——合成 bundle 无法签名，G1~G3 未运行"
  skip "注意：这是**跳过**而不是通过。请在装有发布身份的机器上运行本自测。"
  echo
  echo "== 结果: ${PASS} 通过 / ${FAIL} 失败 / ${SKIP} 跳过 =="
  exit 0
fi

# --- 合成 appA / appB：同身份、不同字节 ---
make_app "$TMP/appA.app" "1.0"
make_app "$TMP/appB.app" "1.1"
codesign --force --sign "$IDENTITY" --identifier com.lute.tcc-persistence-test "$TMP/appA.app" 2>/dev/null
codesign --force --sign "$IDENTITY" --identifier com.lute.tcc-persistence-test "$TMP/appB.app" 2>/dev/null

DR_A="$(codesign -d -r- "$TMP/appA.app" 2>&1 | sed -n 's/^#* *designated => //p')"
CD_A="$(codesign -dv --verbose=4 "$TMP/appA.app" 2>&1 | sed -n 's/^CDHash=//p')"
CD_B="$(codesign -dv --verbose=4 "$TMP/appB.app" 2>&1 | sed -n 's/^CDHash=//p')"

# 前置：合成的两支必须真的是「同身份、不同字节」，否则后面的断言是空测试。
echo "-- 合成前置（保证 G1 不是空测试）--"
[ -n "$DR_A" ] && ok "能读出合成 app 的指定要求" || no "合成 app 的指定要求读不出——后续断言全部不可采信"
if [ -n "$CD_A" ] && [ -n "$CD_B" ] && [ "$CD_A" != "$CD_B" ]; then
  ok "appA 与 appB 的 CDHash 不同（字节确实变了）"
else
  no "appA 与 appB 的 CDHash 相同或读不出——G1 会退化成空测试"
fi
case "$DR_A" in *cdhash*) no "合成 app 竟得到 cdhash 指定要求——身份未生效";; *) ok "合成 app 的身份是证书而非字节哈希";; esac
echo

# --- G1：同身份重建必须放行 ---
echo "-- G1 同身份重建（只改版本号）应放行 --"
if bash "$UNDER_TEST" "$TMP/appA.app" "$TMP/appB.app" >/dev/null 2>&1; then
  ok "退出码 0（正确放行）"
else
  no "退出码非 0——同身份重建被误判为「升级会重置授权」"
fi

# --- G2：adhoc 旧支必须判红 ---
echo
echo "-- G2 旧支为 adhoc 应判红 --"
make_app "$TMP/adhoc.app" "1.0"
codesign --force --sign - --identifier com.lute.tcc-persistence-test "$TMP/adhoc.app" 2>/dev/null
if bash "$UNDER_TEST" "$TMP/adhoc.app" "$TMP/appB.app" >/dev/null 2>&1; then
  no "退出码 0——adhoc 旧支被放行，判据⑤ 对换签前的形态无效"
else
  ok "退出码非 0（正确判红）"
fi

# --- G3：签名后追加字节必须拒绝认证 ---
echo
echo "-- G3 签名后追加一个字节应拒绝认证 --"
cp -R "$TMP/appB.app" "$TMP/tampered.app"
printf 'x' >> "$TMP/tampered.app/Contents/MacOS/TccApp"
if bash "$UNDER_TEST" "$TMP/appA.app" "$TMP/tampered.app" >/dev/null 2>&1; then
  no "退出码 0——封条破损的 app 被认证为「升级安全」"
else
  ok "退出码非 0（正确拒绝认证）"
fi
# 同一支未篡改的必须仍放行——证明 G3 红的是篡改，不是别的
if bash "$UNDER_TEST" "$TMP/appA.app" "$TMP/appB.app" >/dev/null 2>&1; then
  ok "未篡改的同一支仍放行（G3 红的确实是篡改本身）"
else
  no "未篡改的对照也判红——G3 失败原因存疑"
fi

# --- G4：探测器自检 ---
echo
echo "-- G4 探测器必须能说「不」（防恒真空转）--"
if codesign --verify -R='identifier "com.lute.tcc-persistence-control-absent"' "$TMP/appB.app" >/dev/null 2>&1; then
  no "虚构身份竟被判满足——判定实现恒真，全部结论不可采信"
else
  ok "虚构身份被判不满足"
fi

echo
echo "== 结果: ${PASS} 通过 / ${FAIL} 失败 / ${SKIP} 跳过 =="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
