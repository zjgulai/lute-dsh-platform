#!/bin/bash
# build-app-icon.sh —— 产出 LUTE app 图标（icon.icns）
# 默认（2026-09-11 品牌治理）：从 ROOT 真相源复制
#   .dsh-root-brand-preview/root-icon/icon.icns（与 packaging/assets/app-icon.icns 同源）。
# 旧引擎（lute-brand-icons dad-coder 头像徽章）仅在 LUTE_ICON_ENGINE=1 时启用，
# 供头像类导出使用；app 图标不再使用引擎产物（pkg 投诉根因：头像徽章 ≠ RooT 品牌）。
# 用法: ./build-app-icon.sh <输出.icns>
set -euo pipefail
OUT="${1:?用法: build-app-icon.sh <输出.icns>}"
REPO="${DSH_VENDOR:-$HOME/project/Magpie-Horch}"
CANON="$REPO/.dsh-root-brand-preview/root-icon/icon.icns"

if [ "${LUTE_ICON_ENGINE:-0}" != "1" ]; then
  [ -f "$CANON" ] || { echo "[app-icon] 缺少 ROOT 真相源: $CANON"; exit 1; }
  mkdir -p "$(dirname "$OUT")"
  cp "$CANON" "$OUT"
  echo "[app-icon] 已从真相源复制: $OUT ($(du -h "$OUT" | cut -f1), sha1 $(shasum "$OUT" | awk '{print $1}'))"
  exit 0
fi

# ── 旧引擎路径（仅头像类导出，勿用于 app 图标）──────────────────────────────
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
echo "[app-icon] 引擎产物完成: $OUT ($(du -sh "$OUT" | cut -f1))"
