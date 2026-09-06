#!/bin/bash
# DSH Desktop「C 形态完整打包」汇编器
# 产出：dsh-desktop-lute-bundle/（可分发目录 + 安装器），数据/凭据不随包。
#
# 组成（见 package-manifest.json）：
#   DSH Desktop.app.zip   —— 已补丁 app 本体（补丁在 app.asar.unpacked，官方机制）
#   profile.tar.gz        —— manifest + lockfile + cordis.patch + apply-patches + vendors + overrides
#   skills-presets.tar.gz —— 用户技能 + 预设
#   aeis-venv-rebuild.sh  —— 灵枢 Python 引擎重建（venv 不可直接移植）
#   install.sh            —— 目标机一键安装
#   README.md             —— 安装与 TCC 重新授权说明
#
# 用法: ./assemble-bundle.sh [输出目录]   （默认 ./dsh-desktop-lute-bundle）
set -euo pipefail
DSH_APP="${DSH_APP:-/Applications/DSH Desktop.app}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
DSH_VENDOR="${DSH_VENDOR:-$HOME/project/Magpie-Horch}"
OUT="${1:-$(dirname "$0")/../dist/dsh-desktop-lute-bundle}"
SRC="$(dirname "$0")"

say() { echo "[assemble] $*"; }
rm -rf "$OUT"; mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"   # 规范化绝对路径（避免子 shell cd 后相对路径失效）

# ── 1. app 本体（zip 压缩，不含数据）────────────────────────────────────────
say "打包 app 本体（1.3G，压缩中…）"
( cd "/Applications" && tar --exclude='.DS_Store' -cf - "DSH Desktop.app" | gzip -1 > "$OUT/DSH Desktop.app.tar.gz" ) 2>/dev/null || \
( cd "/Applications" && zip -qry "$OUT/DSH Desktop.app.zip" "DSH Desktop.app" -x '*.DS_Store' )
say "app 本体完成 ($(du -sh "$OUT"/DSH* | head -1 | cut -f1))"

# ── 2. profile（manifest + vendors + overrides，不含 node_modules 与 data）────
say "打包 profile（manifest + vendors + overrides）"
STAGE="$OUT/.stage-profile"; mkdir -p "$STAGE/profile"
cp "$DSH_HOME_DIR/profiles/desktop/package.json" "$STAGE/profile/"
cp "$DSH_HOME_DIR/profiles/desktop/pnpm-lock.yaml" "$STAGE/profile/" 2>/dev/null || true
cp "$DSH_HOME_DIR/profiles/desktop/pnpm-workspace.yaml" "$STAGE/profile/" 2>/dev/null || true
cp "$DSH_HOME_DIR/profiles/desktop/cordis.patch.yml" "$STAGE/profile/" 2>/dev/null || true
cp "$DSH_HOME_DIR/profiles/desktop/apply-patches.mjs" "$STAGE/profile/" 2>/dev/null || true
# vendors（真实 fork 源 + 补丁管理仓库）
mkdir -p "$STAGE/vendors"
for d in "$DSH_VENDOR"/*-local "$DSH_VENDOR"/dsh-patches "$DSH_VENDOR"/archify-local; do
  [ -d "$d" ] || continue
  bn=$(basename "$d")
  # 排除 node_modules 与 .git 与预览 HTML，缩小体积
  rsync -a --exclude node_modules --exclude .git --exclude '*.map' --exclude 'preview-*.html' --exclude dsh-desktop-lute-bundle --exclude dist --exclude '.stage-*' --exclude archive "$d/" "$STAGE/vendors/$bn/" 2>/dev/null || cp -R "$d" "$STAGE/vendors/$bn/"
done
# overrides（profile node_modules 里的 -override 副本，随包以防目标机版本漂移）
mkdir -p "$STAGE/overrides"
for o in dsh-llm dsh-tool-subagent dsh-file-reference-local; do
  src="$DSH_HOME_DIR/profiles/desktop/node_modules/@deepseek-ai/$o"
  [ -d "$src" ] && rsync -a --exclude node_modules "$src/" "$STAGE/overrides/$o/" 2>/dev/null
done
( cd "$STAGE" && tar -czf "$OUT/profile.tar.gz" profile vendors overrides ) 2>/dev/null
rm -rf "$STAGE"
say "profile 完成 ($(du -sh "$OUT/profile.tar.gz" | cut -f1))"

# ── 3. 技能 + 预设 ───────────────────────────────────────────────────────────
say "打包技能 + 预设"
STAGE="$OUT/.stage-sp"; mkdir -p "$STAGE/skills" "$STAGE/presets"
[ -d "$DSH_HOME_DIR/skills" ] && cp -R "$DSH_HOME_DIR/skills/." "$STAGE/skills/"
[ -d "$HOME/.agents/skills" ] && cp -R "$HOME/.agents/skills/." "$STAGE/skills/" 2>/dev/null
[ -d "$DSH_HOME_DIR/.agent-presets" ] && cp -R "$DSH_HOME_DIR/.agent-presets/." "$STAGE/presets/"
( cd "$STAGE" && tar -czf "$OUT/skills-presets.tar.gz" skills presets )
rm -rf "$STAGE"
say "技能+预设完成 ($(du -sh "$OUT/skills-presets.tar.gz" | cut -f1))"

# ── 4. 安装器与辅助脚本 ──────────────────────────────────────────────────────
cat > "$OUT/install.sh" <<'EOF'
#!/bin/bash
# DSH Desktop LUTE 2.0.4 目标机一键安装（幂等 + 冲突备份 + 失败回滚）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
APP_TARGET="/Applications/DSH Desktop.app"
say(){ echo "[install] $*"; }

# 前置校验
[ "$(uname -s)" = "Darwin" ] || { echo "[install] 仅支持 macOS"; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
ROLLBACK=()
trap 'for f in "${ROLLBACK[@]}"; do [ -e "$f" ] && rm -rf "$f"; done' ERR
trap 'rm -rf "$HERE/.install-staging"; exit 1' INT TERM

# 1/5 冲突检测 + 解包 app
if [ -d "$APP_TARGET" ]; then
  say "1/5 检测到已有 $APP_TARGET → 备份为 $APP_TARGET.pre-lute-$STAMP"
  mv "$APP_TARGET" "$APP_TARGET.pre-lute-$STAMP"
fi
tar -xzf "$HERE/DSH Desktop.app.tar.gz" -C /Applications 2>/dev/null || unzip -q "$HERE/DSH Desktop.app.zip" -d /Applications
ROLLBACK+=("$APP_TARGET")
say "1/5 app 就位"

# 2/5 解包 profile（已有则备份）
if [ -d "$DSH_HOME_DIR/profiles/desktop" ]; then
  say "2/5 已有 profile → 备份为 profiles/desktop.pre-lute-$STAMP"
  mv "$DSH_HOME_DIR/profiles/desktop" "$DSH_HOME_DIR/profiles/desktop.pre-lute-$STAMP"
fi
mkdir -p "$DSH_HOME_DIR/profiles/desktop"
tar -xzf "$HERE/profile.tar.gz" -C "$DSH_HOME_DIR/profiles/desktop"
ROLLBACK+=("$DSH_HOME_DIR/profiles/desktop")
mkdir -p "$HOME/project/Magpie-Horch"
[ -d "$DSH_HOME_DIR/profiles/desktop/vendors" ] && cp -R "$DSH_HOME_DIR/profiles/desktop/vendors/." "$HOME/project/Magpie-Horch/"
say "2/5 profile 就位"

# 3/5 pnpm 安装
PNPM="${PNPM:-$(ls "$HOME/Library/Application Support/DSH Desktop/runtime-commands/bin/pnpm" 2>/dev/null || command -v pnpm)}"
( cd "$DSH_HOME_DIR/profiles/desktop" && "$PNPM" install --no-frozen-lockfile )
say "3/5 依赖安装完成"

# 4/5 overrides
for o in dsh-llm dsh-tool-subagent dsh-file-reference-local; do
  src="$DSH_HOME_DIR/profiles/desktop/overrides/$o"
  [ -d "$src" ] && rm -rf "$DSH_HOME_DIR/profiles/desktop/node_modules/@deepseek-ai/$o" && cp -R "$src" "$DSH_HOME_DIR/profiles/desktop/node_modules/@deepseek-ai/$o"
done
say "4/5 overrides 恢复"

# 5/5 技能+预设（已有目录合并，不覆盖）
tar -xzf "$HERE/skills-presets.tar.gz" -C "$HERE/.install-staging"
[ -d "$DSH_HOME_DIR/skills" ] || mkdir -p "$DSH_HOME_DIR/skills"
cp -Rn "$HERE/.install-staging/skills/." "$DSH_HOME_DIR/skills/" 2>/dev/null || true
[ -d "$DSH_HOME_DIR/.agent-presets" ] || mkdir -p "$DSH_HOME_DIR/.agent-presets"
cp -Rn "$HERE/.install-staging/presets/." "$DSH_HOME_DIR/.agent-presets/" 2>/dev/null || true
rm -rf "$HERE/.install-staging"
say "5/5 技能+预设合并完成"

# 校验（可选，若 dsh-patches 已随包）
if [ -f "$HOME/project/Magpie-Horch/dsh-patches/verify-patches.sh" ]; then
  say "运行补丁校验…"
  ( cd "$HOME/project/Magpie-Horch/dsh-patches" && ./verify-patches.sh ) || say "⚠ 补丁校验未全绿——先重启 DSH 再复验"
fi

say "完成。① 重启 DSH Desktop；② 重新授权 TCC（录屏/辅助功能/自动化）；③ 可选：bash $HERE/aeis-venv-rebuild.sh"
EOF
chmod +x "$OUT/install.sh"

cat > "$OUT/aeis-venv-rebuild.sh" <<'EOF'
#!/bin/bash
# 重建灵枢（@furongjun1999/dsh-memory）依赖的 aeis Python 引擎
# venv 含绝对路径 shebang 不可直接移植，目标机需重建。
set -euo pipefail
VENV="${DSH_HOME:-$HOME/.dsh}/aeis-venv"
say(){ echo "[aeis] $*"; }
say "重建 $VENV"
rm -rf "$VENV"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip aeis
say "完成。DSH 重启后灵枢工具即恢复。"
EOF
chmod +x "$OUT/aeis-venv-rebuild.sh"

cat > "$OUT/README.md" <<'EOF'
# DSH Desktop LUTE 2.0.4 完整包

## 组成
- `DSH Desktop.app.tar.gz/.zip`：已补丁 app（P0 六项 + UI + 品牌，见 dsh-patches/patches-manifest.md）。
- `profile.tar.gz`：profile manifest + vendors + overrides（不含 node_modules，安装时 pnpm 重装）。
- `skills-presets.tar.gz`：用户技能 + 7 个预设。
- `aeis-venv-rebuild.sh`：灵枢 Python 引擎重建（可选）。
- `install.sh`：一键安装。

## 安装
```bash
bash install.sh
```
启动后：**重新授权 TCC**（系统设置 → 隐私与安全 → 屏幕录制/辅助功能/自动化，授权 DSH Desktop / LUTE Agentic System）。

## 校验
```bash
# 重启后：
cd ~/project/Magpie-Horch/dsh-patches && ./verify-patches.sh   # 应 ALL PATCHES VERIFIED
```

## 未随包（用户决策）
sessions/storages/记忆库/凭据（.credentials.yaml、.modlens/config.json）——需迁移时单独导出。
EOF

say "汇编完成：$OUT"
du -sh "$OUT" 2>/dev/null
ls -la "$OUT"
