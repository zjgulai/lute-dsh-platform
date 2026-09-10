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
# 竞态锁：dmg/pkg 共用 release 目录，串行执行防互删（2026-09-10 实战竞态教训）
LOCK="$REL/.build.lock"
if [ -d "$LOCK" ]; then echo "[$(basename "$0")] 另一构建进行中（$LOCK 存在），请串行执行"; exit 1; fi
mkdir -p "$REL" && mkdir "$LOCK"
trap 'rm -rf "$LOCK"' EXIT
DMG="$REL/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg"
VOLNAME="DSH Desktop LUTE $VERSION"
say(){ echo "[dmg] $*"; }

[ -f "$PAYLOAD/install.sh" ] || { echo "[dmg] payload 不完整: $PAYLOAD"; exit 1; }
[ -d "$PAYLOAD/LUTE Setup.app" ] || { echo "[dmg] 缺少 LUTE Setup.app"; exit 1; }

# 0. payload 无 quarantine 断言（防打包侧混入隔离属性——客户 Operation not permitted
#    的历史坑；若检测到则就地清除并提示）
QA_HITS="$(find "$PAYLOAD" -maxdepth 1 \( -name '*.tar.gz' -o -name 'install.sh' \) -exec sh -c 'xattr -p com.apple.quarantine "$1" 2>/dev/null && echo "$1"' _ {} \; 2>/dev/null)"
if [ -n "$QA_HITS" ]; then
  say "⚠ payload 检测到 quarantine（打包侧混入），就地清除：$QA_HITS"
  find "$PAYLOAD" -maxdepth 1 \( -name '*.tar.gz' -o -name 'install.sh' \) -exec xattr -d com.apple.quarantine {} \; 2>/dev/null || true
else
  say "payload 无 quarantine ✓"
fi

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
