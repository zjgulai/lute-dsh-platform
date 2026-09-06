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
# adhoc 签名（决策 D2；与 app 同策略）
codesign --force --deep --sign - "$APP"
say "编译完成: $APP"
