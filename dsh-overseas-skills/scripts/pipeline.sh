#!/bin/bash
# pipeline.sh — 一键管线（闸门式）：静态校验 → 分配头像 → 重建目录 → 同步 profile → 预设 lint
# 用法：
#   bash scripts/pipeline.sh            # 非破坏性：校验+头像+目录+同步+lint
#   bash scripts/pipeline.sh --import   # 额外先跑 81 转换安装（幂等，保留开关）
#   bash scripts/pipeline.sh --dry      # 只跑校验+重建（不写 profile、不 lint）
set -euo pipefail
cd "$(dirname "$0")/.."

DO_IMPORT=0; DRY=0
for a in "$@"; do case "$a" in --import) DO_IMPORT=1;; --dry) DRY=1;; esac; done

echo "== [1/6] 81 转换安装（幂等，保留开关）=="
if [ "$DO_IMPORT" = "1" ]; then node scripts/import-81skills.mjs; else echo "跳过（--import 才执行）"; fi

echo "== [2/7] 分配 LUTE 头像（出海 + AI全栈） =="
python3 scripts/assign_lute_icons.py

echo "== [3/8] AI全栈技能安装（幂等） =="
node scripts/import-fullstack.mjs || true
node scripts/normalize-zh.mjs || true
node scripts/verify-fullstack.mjs || true

echo "== [4/8] 指令软化（幂等） =="
node scripts/soften-clarify.mjs || true

echo "== [5/8] 重建 catalog =="
python3 scripts/build_preset_catalog.py

echo "== [6/8] 目录统一（幂等） =="
node scripts/unify-directories.mjs || true

echo "== [7/8] 静态闸门 =="
node scripts/verify_static.mjs

if [ "$DRY" = "1" ]; then echo "== dry：不写 profile / 不 lint =="; exit 0; fi

echo "== [8/8] 同步 profile + 预设 lint =="
PROFILE_LIB="$HOME/.dsh/profiles/desktop/node_modules/dsh-overseas-skills/lib"
for f in index.js catalog.js client.js; do
  s="lib/$f"; d="$PROFILE_LIB/$f"
  if [ -f "$d" ] && [ "$s" -ef "$d" ]; then echo "  $f: 同 inode（已穿透）"; else cat "$s" > "$d"; echo "  $f: 同步"; fi
done
node "$HOME/project/Magpie-Horch/dsh-patches/lint-preset.mjs" "$HOME/.dsh/.agent-presets/brand-marketing-growth" 2>&1 | tail -1 || true
echo "✓ 管线完成。catalog/client 变更需重启 DSH Desktop 生效。"
