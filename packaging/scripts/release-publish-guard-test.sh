#!/bin/bash
# release-publish-guard-test.sh —— sign-and-dmg.sh 发布安全回归测试
#
# 为什么存在（ADR-0057）：sign-and-dmg.sh 曾经是 `rm -rf "$REL"; mkdir -p "$REL"`——
# 每次重跑都先毁掉上一份已发布产物，而且毁在「新的一份还没做出来之前」：后续任何一步
# 失败，得到的是「旧的没了、新的也没有」。本测试把「重跑不得损坏已发布产物」钉成可执行
# 断言，防止这类语义被无声改回去。
#
# 全程沙箱：把待测脚本连同它依赖的 verify-app-signature.sh 复制进临时目录，
# PKG_ROOT 由 dirname "$0" 推出，因此 release/ 落在临时目录里——本测试**永不触碰**
# 仓库里 packaging/release/ 下的真实产物，可安全地在任何时刻运行。
#
# G7 覆盖 ADR-0058：入库清单（仓库根 release/<version>.sha256）在产物就位后生成、
# 带源凭据、可被 shasum -c 直接校验，且**失败版本不留清单**（清单绝不描述一份不存在
# 的产物）。沙箱里 REPO_ROOT 同样是临时目录，因此也不会碰仓库根 release/。
#
# 用法: bash packaging/scripts/release-publish-guard-test.sh
# 退出码: 0 = 全部通过；1 = 有断言失败
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PKG_ROOT="$(cd "$HERE/.." && pwd)"
SRC_SCRIPT="$PKG_ROOT/sign-and-dmg.sh"
SRC_GUARD="$PKG_ROOT/scripts/verify-app-signature.sh"

PASS=0
FAIL=0
ok(){   PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){   FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }
check(){ if [ "$1" = "0" ]; then ok "$2"; else no "$2"; fi; }

[ -f "$SRC_SCRIPT" ] || { echo "找不到待测脚本: $SRC_SCRIPT" >&2; exit 1; }
[ -f "$SRC_GUARD" ]  || { echo "找不到依赖: $SRC_GUARD" >&2; exit 1; }

SANDBOX="$(mktemp -d -t lute-publish-guard)"
cleanup(){ [ -n "$SANDBOX" ] && rm -rf "$SANDBOX"; }
trap cleanup EXIT

echo "沙箱: $SANDBOX"

# ── 沙箱骨架：脚本 + 依赖 + 合成载荷 ─────────────────────────────────────────
mkdir -p "$SANDBOX/pkg/scripts"
cp "$SRC_SCRIPT" "$SANDBOX/pkg/sign-and-dmg.sh"
cp "$SRC_GUARD"  "$SANDBOX/pkg/scripts/verify-app-signature.sh"
S="$SANDBOX/pkg/sign-and-dmg.sh"

mkapp(){  # mkapp <路径> <标识>；造一个最小可 adhoc 签名的 .app
  A="$1"; N="$2"; rm -rf "$A"; mkdir -p "$A/Contents/MacOS"
  cat > "$A/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>stub</string>
<key>CFBundleIdentifier</key><string>com.lute.test.${N}</string>
<key>CFBundleName</key><string>${N}</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
</dict></plist>
EOF
  printf '#!/bin/sh\necho %s\n' "$N" > "$A/Contents/MacOS/stub"
  chmod +x "$A/Contents/MacOS/stub"
  codesign --force --deep --sign - "$A" >/dev/null 2>&1
}

P="$SANDBOX/payload"; mkdir -p "$P"
printf '#!/bin/sh\necho stub\n' > "$P/install.sh"; chmod +x "$P/install.sh"
mkapp "$P/LUTE Setup.app" setup
mkapp "$SANDBOX/appbuild/DSH Desktop.app" dsh
( cd "$SANDBOX/appbuild" && tar -czf "$P/DSH Desktop.app.tar.gz" "DSH Desktop.app" )
printf 'stub profile\n' | gzip > "$P/profile.tar.gz"
# VERSION 带全套源凭据（ADR-0058）：G7 要求清单把它们**逐字**带出，而不是退化成 unknown
cat > "$P/VERSION" <<'EOF'
LUTE_VERSION=9.9.9
BUILD=20260913-999999
DSH_BASELINE=2.0.5
ARCH=arm64
SOURCE_COMMIT=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
SOURCE_DIRTY=1
PROFILE_SNAPSHOT=0123456789abcdef
EOF
printf '{}\n' > "$P/manifest.json"

codesign --verify --deep --strict "$P/LUTE Setup.app" >/dev/null 2>&1
check $? "合成载荷：LUTE Setup.app 已签名"
(bash "$SANDBOX/pkg/scripts/verify-app-signature.sh" "$SANDBOX/appbuild/DSH Desktop.app" 前置 >/dev/null 2>&1)
check $? "合成载荷：载荷内 app 已签名"

VER=9.9.9
REL="$SANDBOX/pkg/release/$VER"
DMG="$REL/DSH-Desktop-LUTE-$VER-mac-arm64.dmg"
LOCK="$SANDBOX/pkg/release/.build.lock"

echo
echo "── G1. 首次构建：终验通过后原子就位 ─────────────────────────────"
OUT=$(bash "$S" "$P" "$VER" 2>&1); check $? "构建退出码 0"
echo "$OUT" | grep -q "临时构建区" && ok "先建了临时构建区" || no "未使用临时构建区"
[ -f "$DMG" ] && ok "dmg 已就位" || no "dmg 未就位"
( cd "$REL" && shasum -a 256 -c SHA256SUMS ) >/dev/null 2>&1; check $? "SHA256SUMS 复核通过"
[ "$(stat -f%Lp "$REL")" = "755" ] && ok "目录权限 755（与原 mkdir -p 一致）" || no "目录权限 $(stat -f%Lp "$REL")，应为 755"
ls -d "$SANDBOX/pkg/release/.staging."* >/dev/null 2>&1 && no "有 .staging 残留" || ok "无 .staging 残留"
[ -d "$LOCK" ] && no "锁未清理" || ok "锁已清理"
H_GOOD=$(shasum -a 256 "$DMG" | awk '{print $1}')

echo
echo "── G2. 同一版本重跑（不带 --force）：必须拒绝且产物一字不动 ──────"
OUT=$(bash "$S" "$P" "$VER" 2>&1); RC=$?
[ "$RC" = "1" ] && ok "退出码 1" || no "退出码 ${RC}，应为 1"
echo "$OUT" | grep -q "拒绝覆盖" && ok "给出拒绝覆盖说明" || no "未给出拒绝说明"
[ "$(shasum -a 256 "$DMG" | awk '{print $1}')" = "$H_GOOD" ] && ok "产物字节未变" || no "产物被改动！"

echo
echo "── G3. --force：重制，旧的归档而非删除 ─────────────────────────"
OUT=$(bash "$S" "$P" "$VER" --force 2>&1); RC=$?
[ "$RC" = "0" ] && ok "--force 退出码 0" || no "--force 退出码 $RC"
ARCH="$(ls -d "$SANDBOX/pkg/release/.archive/$VER-"* 2>/dev/null | head -1)"
[ -n "$ARCH" ] && ok "旧产物已归档" || no "未找到归档目录"
if [ -n "$ARCH" ]; then
  [ -f "$ARCH/DSH-Desktop-LUTE-$VER-mac-arm64.dmg" ] && ok "归档内含旧 dmg（是归档不是删除）" || no "归档内没有 dmg"
  [ "$(shasum -a 256 "$ARCH/DSH-Desktop-LUTE-$VER-mac-arm64.dmg" | awk '{print $1}')" = "$H_GOOD" ] && ok "归档的正是重制前那份字节" || no "归档字节不符"
fi
( cd "$REL" && shasum -a 256 -c SHA256SUMS ) >/dev/null 2>&1; check $? "新产物 SHA256SUMS 复核通过"

echo
echo "── G4. 终验失败：不得留下半成品 ───────────────────────────────"
BAD="$SANDBOX/badpayload"; rm -rf "$BAD"; cp -R "$P" "$BAD"
mkapp "$SANDBOX/badapp/DSH Desktop.app" bad >/dev/null 2>&1
printf 'x' > "$SANDBOX/badapp/DSH Desktop.app/Contents/MacOS/stub"   # 签名后改一个字节 → seal 破损
( cd "$SANDBOX/badapp" && tar -czf "$BAD/DSH Desktop.app.tar.gz" "DSH Desktop.app" )
BVER=9.9.8
OUT=$(bash "$S" "$BAD" "$BVER" 2>&1); RC=$?
[ "$RC" = "1" ] && ok "终验失败被拦下（退出码 1）" || no "退出码 ${RC}，应为 1"
[ -e "$SANDBOX/pkg/release/$BVER" ] && no "release/$BVER 竟然存在（留下半成品）" || ok "目标目录未出现（无半成品）"
ls -d "$SANDBOX/pkg/release/.staging."* >/dev/null 2>&1 && no "临时区未清理" || ok "临时区已清理"
[ -d "$LOCK" ] && no "锁未清理" || ok "锁已清理"

echo
echo "── G5. 锁语义：无主锁可回收，活锁必须挡住 ─────────────────────"
mkdir -p "$LOCK"   # 模拟旧版遗留：空目录、无 pid
OUT=$(bash "$S" "$P" "9.9.7" 2>&1)
echo "$OUT" | grep -q "回收无主锁" && ok "回收了无主锁（不再永久挡住构建）" || no "未回收无主锁"
rm -rf "$SANDBOX/pkg/release/9.9.7" "$LOCK"
sleep 120 & SLEEP_PID=$!
mkdir "$LOCK"; echo "$SLEEP_PID" > "$LOCK/pid"
OUT=$(bash "$S" "$P" "$VER" --force 2>&1); RC=$?
echo "$OUT" | grep -q "另一构建进行中" && ok "活锁：报出占用" || no "活锁：未报出占用"
[ "$RC" = "1" ] && ok "活锁：退出码 1" || no "活锁：退出码 $RC"
[ -d "$LOCK" ] && ok "活锁未被误删" || no "活锁被误删（会破坏互斥）"
kill "$SLEEP_PID" 2>/dev/null || true; wait "$SLEEP_PID" 2>/dev/null || true
rm -rf "$LOCK"

echo
echo "── G6. 参数守卫 ───────────────────────────────────────────────"
bash "$S" >/dev/null 2>&1;                              [ "$?" = "2" ] && ok "无参 → 退出码 2" || no "无参退出码非 2"
bash "$S" -h >/dev/null 2>&1;                           [ "$?" = "0" ] && ok "-h → 退出码 0" || no "-h 退出码非 0"
bash "$S" --nope x y >/dev/null 2>&1;                   [ "$?" = "2" ] && ok "未知选项 → 退出码 2" || no "未知选项退出码非 2"
bash "$S" "$P" "$VER" extra >/dev/null 2>&1;            [ "$?" = "2" ] && ok "多余参数 → 退出码 2" || no "多余参数退出码非 2"

echo
echo "── G7. 入库清单（ADR-0058）：就位后生成、可校验、失败不留 ────────"
MAN="$SANDBOX/release/$VER.sha256"
[ -f "$MAN" ] && ok "清单已生成（仓库根 release/<ver>.sha256）" || no "清单未生成"
grep -q '^# source_commit=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef$' "$MAN" 2>/dev/null && ok "清单逐字带出 source_commit" || no "source_commit 未带出（退化成 unknown？）"
grep -q '^# source_dirty=1$' "$MAN" 2>/dev/null && ok "清单逐字带出 source_dirty=1" || no "source_dirty 未带出"
grep -q '^# profile_snapshot=0123456789abcdef$' "$MAN" 2>/dev/null && ok "清单逐字带出 profile_snapshot" || no "profile_snapshot 未带出"
grep -q '^# build=20260913-999999$' "$MAN" 2>/dev/null && ok "清单逐字带出 build" || no "build 未带出"
M_H="$(grep -E '^[0-9a-f]{64}  ' "$MAN" 2>/dev/null | awk '{print $1}')"
[ "$M_H" = "$(shasum -a 256 "$DMG" | awk '{print $1}')" ] && ok "清单哈希 = 产物实际哈希" || no "清单哈希与产物不符"
# 注释行必须被 shasum 跳过，否则清单就不能直接用 -c 校验（macOS shasum 6.02 实测）
( cd "$REL" && shasum -a 256 -c "$MAN" ) >/dev/null 2>&1; check $? "清单可被 shasum -c 校验（# 注释行被跳过）"
# 失败方向：清单绝不描述一份不存在的产物
[ -f "$SANDBOX/release/$BVER.sha256" ] && no "终验失败版 $BVER 竟留下清单" || ok "失败版本无清单（不描述不存在的产物）"

echo
echo "════════════════════════════════════════════════════════"
echo "  通过 $PASS 项，失败 $FAIL 项"
[ "$FAIL" = "0" ] && echo "  结果：全部通过" || echo "  结果：有失败项"
echo "  （沙箱 $SANDBOX 将在退出时删除；仓库 release/ 全程未被触碰）"
echo "════════════════════════════════════════════════════════"
[ "$FAIL" = "0" ] || exit 1
exit 0
