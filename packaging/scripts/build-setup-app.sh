#!/bin/bash
# build-setup-app.sh —— 编译 LUTE Setup.app（swiftc，无第三方依赖）
# 用法: ./build-setup-app.sh <输出目录>   （产出 <输出目录>/LUTE Setup.app）
set -euo pipefail
PKG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?用法: build-setup-app.sh <输出目录>}"
APP="$OUT/LUTE Setup.app"

xcrun --find swiftc >/dev/null || { echo "[setup] 缺少 swiftc（需 Xcode Command Line Tools）"; exit 1; }
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

swiftc -O -o "$APP/Contents/MacOS/LUTE Setup" "$PKG_ROOT/installer/LUTE-Setup.swift"

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>LUTE Setup</string>
  <key>CFBundleDisplayName</key><string>LUTE Setup</string>
  <key>CFBundleIdentifier</key><string>ai.lute.dsh.setup</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>LUTE Setup</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
EOF
say(){ echo "[setup] $*"; }
# 固定身份签名（ADR-0063）。此处跟随 app 的身份，不是为了权限——Setup.app 不需要 TCC——
# 而是为了让「本包已改为固定证书签名、不再是 adhoc」这句话对**包内每一个可执行体**都成立；
# 一处遗留 adhoc 会让客户在两个不同的 Gatekeeper 提示之间困惑。
LUTE_SIGN_IDENTITY="${LUTE_SIGN_IDENTITY:-LUTE Code Signing}"
if ! security find-identity -v -p codesigning 2>/dev/null | grep -qF "\"${LUTE_SIGN_IDENTITY}\""; then
  echo "[setup] 签名身份不可用：${LUTE_SIGN_IDENTITY}（建立：packaging/scripts/ensure-signing-identity.sh）" >&2
  exit 1
fi
codesign --force --deep --sign "${LUTE_SIGN_IDENTITY}" "$APP"
say "编译完成: $APP（身份：${LUTE_SIGN_IDENTITY}）"
