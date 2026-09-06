#!/bin/bash
# sign-and-dmg.sh —— Phase 3：payload → 可安装 dmg（hdiutil，含挂载后终验）
# 用法: ./sign-and-dmg.sh <payload-dir> <version>
# 产物: release/<version>/DSH-Desktop-LUTE-<version>-mac-arm64.dmg + SHA256SUMS + VERSION + manifest.json
set -euo pipefail
PKG_ROOT="$(cd "$(dirname "$0")" && pwd)"   # 本脚本位于 packaging/ 根
PAYLOAD="${1:?用法: sign-and-dmg.sh <payload-dir> <version>}"
VERSION="${2:-1.0.0}"
PAYLOAD="$(cd "$PAYLOAD" && pwd)"
REL="$PKG_ROOT/release/$VERSION"
DMG="$REL/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg"
VOLNAME="DSH Desktop LUTE $VERSION"
say(){ echo "[dmg] $*"; }

[ -f "$PAYLOAD/install.sh" ] || { echo "[dmg] payload 不完整: $PAYLOAD"; exit 1; }
[ -d "$PAYLOAD/LUTE Setup.app" ] || { echo "[dmg] 缺少 LUTE Setup.app"; exit 1; }
rm -rf "$REL"; mkdir -p "$REL"

# 1. 制 dmg（UDZO 压缩，卷名即产品名）
say "制作 dmg（约 665M 源 → UDZO，数分钟）…"
hdiutil create -volname "$VOLNAME" -srcfolder "$PAYLOAD" -ov -format UDZO "$DMG"
say "dmg 完成: $DMG ($(du -sh "$DMG" | cut -f1))"

# 2. 挂载终验：Setup.app 签名 + 关键文件可见
MOUNT="/Volumes/$VOLNAME"
hdiutil attach -readonly -nobrowse "$DMG" >/dev/null
cleanup(){ hdiutil detach "$MOUNT" >/dev/null 2>&1 || true; }
trap cleanup EXIT
say "挂载终验 @ $MOUNT"
codesign --verify --deep --strict "$MOUNT/LUTE Setup.app" && say "Setup.app 签名 OK"
[ -f "$MOUNT/install.sh" ] && say "install.sh 可见"
[ -f "$MOUNT/DSH Desktop.app.tar.gz" ] && [ -f "$MOUNT/profile.tar.gz" ] && say "载荷可见"
ls "$MOUNT"

# 3. 发布归档
cp "$PAYLOAD/VERSION" "$PAYLOAD/manifest.json" "$REL/" 2>/dev/null || true
( cd "$REL" && shasum -a 256 "$(basename "$DMG")" > SHA256SUMS )
say "发布目录: $REL"
ls -la "$REL"
