#!/bin/bash
# build-pkg.sh —— payload → 双击向导 .pkg（面向无终端客户；Installer 图形安装）
# 用法: ./build-pkg.sh <payload-dir> <version> [build]
# 产物: release/<version>/DSH-Desktop-LUTE-<version>-mac-arm64.pkg + PKG-SHA256SUMS
# 机制: pkg 载荷装到 /Library/Application Support/LUTE/payload（root，只读），
#       postinstall(root) 落位 app + 切登录用户跑 install.sh（~/.dsh 用户属主）
set -euo pipefail
PKG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAYLOAD="${1:?用法: build-pkg.sh <payload-dir> <version> [build]}"
VERSION="${2:-1.0.0}"
PAYLOAD="$(cd "$PAYLOAD" && pwd)"
BUILD="${3:-$(date +%Y%m%d-%H%M%S)}"
REL="$PKG_ROOT/release/$VERSION"
# 竞态锁：dmg/pkg 共用 release 目录，串行执行防互删（2026-09-10 实战竞态教训）
LOCK="$REL/.build.lock"
if [ -d "$LOCK" ]; then echo "[$(basename "$0")] 另一构建进行中（$LOCK 存在），请串行执行"; exit 1; fi
mkdir -p "$REL" && mkdir "$LOCK"
trap 'rm -rf "$LOCK"' EXIT
PKG="$REL/DSH-Desktop-LUTE-$VERSION-mac-arm64.pkg"
say(){ echo "[pkg] $*"; }

[ -f "$PAYLOAD/install.sh" ] || { echo "[pkg] payload 不完整: $PAYLOAD"; exit 1; }
[ -f "$PAYLOAD/DSH Desktop.app.tar.gz" ] || { echo "[pkg] 缺少 app 载荷"; exit 1; }

# 1. 载荷根：payload 内容 → /Library/Application Support/LUTE/payload
say "1/4 组装载荷根"
ROOT_BUILD="$REL/.pkg-root"
rm -rf "$ROOT_BUILD"; mkdir -p "$ROOT_BUILD/Library/Application Support/LUTE/payload"
cp -R "$PAYLOAD/." "$ROOT_BUILD/Library/Application Support/LUTE/payload/"
# 载荷根内 install.sh/tools 保持可执行（cp -R 保留权限；再保险一次）
chmod 755 "$ROOT_BUILD/Library/Application Support/LUTE/payload/install.sh" \
          "$ROOT_BUILD/Library/Application Support/LUTE/payload/tools/"*.sh 2>/dev/null || true

# 2. scripts：postinstall（root 运行）
say "2/4 装配 postinstall"
SCRIPTS="$REL/.pkg-scripts"; rm -rf "$SCRIPTS"; mkdir -p "$SCRIPTS"
cp "$PKG_ROOT/installer/pkg-postinstall.sh" "$SCRIPTS/postinstall"
chmod 755 "$SCRIPTS/postinstall"

# 3. pkgbuild 组件包 + productbuild 分发包
#    签名说明：productbuild/productsign 不支持 adhoc（仅认真实证书）。无 Developer ID
#    时产出未签名 pkg——Gatekeeper 同样拦（与 adhoc 一致，右键打开绕过），Installer
#    内显示「未签名」警告但可继续。后续项：自签名证书（钥匙串）或 Developer ID 签名。
say "3/4 pkgbuild + productbuild（未签名；证书签名见 PLAN 后续项）…"
COMP="$REL/.component.pkg"
pkgbuild --root "$ROOT_BUILD" --scripts "$SCRIPTS" \
  --identifier "ai.lute.dsh.installer" --version "$VERSION-$BUILD" \
  --install-location / "$COMP"
productbuild --package "$COMP" --identifier "ai.lute.dsh" \
  --version "$VERSION-$BUILD" "$PKG"

# 4. 校验：签名 + 载荷清点
say "4/4 校验"
pkgutil --check-signature "$PKG" || true
( cd "$REL" && shasum -a 256 "$(basename "$PKG")" > PKG-SHA256SUMS )
# 清理中间产物（.pkg-root/.pkg-scripts/.component.pkg 仅构建期使用）
rm -rf "$ROOT_BUILD" "$SCRIPTS" "$COMP"
say "pkg 完成: $PKG ($(du -sh "$PKG" | cut -f1))"
ls -la "$PKG"
