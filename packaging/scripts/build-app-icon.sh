#!/bin/bash
# build-app-icon.sh —— 用 lute-brand-icons 生成引擎产出 LUTE app 图标（icon.icns）
# 用法: ./build-app-icon.sh <输出.icns>
# 链条: generator.js(buildIcon) → SVG → sips PNG(1024) → iconset → iconutil icns
set -euo pipefail
OUT="${1:?用法: build-app-icon.sh <输出.icns>}"
SKILL="${LUTE_ICON_SKILL:-$HOME/.dsh/skills/lute-brand-icons}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. SVG（复用品牌头像引擎：程序员爸爸 dad-coder，方形徽章 + 品牌绿）
node - "$SKILL" "$TMP/app-icon.svg" <<'EOF'
const path = require('path');
const skill = process.argv[2];
const out = process.argv[3];
const { buildIcon } = require(path.join(skill, 'lib/generator.js'));
const entry = { id: 'dad-coder', name: 'LUTE', cat: 'app', skin: 's2', hair: ['short:black'], acc: ['glassesRect'], shirt: 'GD', collar: 'collarW', emblem: 'laptop' };
require('fs').writeFileSync(out, buildIcon(entry, 'lute-app'));
console.log('[app-icon] SVG 生成:', out);
EOF

# 2. SVG → PNG 1024
sips -s format png -Z 1024 "$TMP/app-icon.svg" --out "$TMP/icon-1024.png" >/dev/null 2>&1 \
  || qlmanage -t -s 1024 -o "$TMP" "$TMP/app-icon.svg" >/dev/null 2>&1 || true
[ -f "$TMP/icon-1024.png" ] || cp "$TMP/app-icon.svg.png" "$TMP/icon-1024.png" 2>/dev/null || { echo "[app-icon] SVG→PNG 失败"; exit 1; }

# 3. iconset（macOS 全尺寸组）
mkdir -p "$TMP/AppIcon.iconset"
for s in 16 32 128 256 512; do sips -z $s $s "$TMP/icon-1024.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null 2>&1; done
for s in 32 64 256 512; do d=$((s*2)); sips -z $d $d "$TMP/icon-1024.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null 2>&1; done

# 4. icns
mkdir -p "$(dirname "$OUT")"
iconutil -c icns "$TMP/AppIcon.iconset" -o "$OUT"
echo "[app-icon] icns 完成: $OUT ($(du -sh "$OUT" | cut -f1))"
