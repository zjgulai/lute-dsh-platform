#!/bin/bash
# LUTE Agentic System 目标机离线安装器（DSH Desktop 2.0.4 + Magpie-Horch 全量定制层）
#
# 特性：
#   - 完全离线：不跑 pnpm / 不访问网络；node_modules 随包、node 运行时复用 Electron 二进制
#   - 幂等：可重复执行；已有安装自动备份（*.pre-lute-<stamp>）
#   - 回滚：任一步失败 → 删除新写入 + 恢复备份（双数组模型）
#   - 升级保留数据：只替换包拥有的 manifest/代码面，data/ 与其他用户文件不动
#   - 提权：仅「写 /Applications」一步经 osascript 管理员授权；其余全程用户态
#
# 环境覆盖（冒烟测试用）：DSH_HOME、APP_TARGET
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
APP_TARGET="${APP_TARGET:-/Applications/DSH Desktop.app}"
PROFILE_DIR="$DSH_HOME_DIR/profiles/desktop"
STAMP="$(date +%Y%m%d-%H%M%S)"
say(){ echo "[install] $*"; }
# 清除 Gatekeeper 隔离属性：下载的 dmg 挂载后卷内文件带 com.apple.quarantine，
# bsdtar 解包会传播到落盘文件 → Electron/python/noema 等二进制 exec 被 Gatekeeper
# 拒绝（Operation not permitted）。解包后立即递归清除（失败不阻塞；提权路径
# 文件 owner 是 root 用户态清不动——该场景在提权脚本内清）。
clear_qa(){ xattr -dr com.apple.quarantine "$1" 2>/dev/null || true; }

STAGING_DIR="$DSH_HOME_DIR/.lute-install"
cleanup_tmp(){ rm -rf "$STAGING_DIR"; }
elevate(){ # 以管理员权限执行一段 shell（AppleScript 双引号串转义）
  local script="$1"
  script="${script//\\/\\\\}"
  script="${script//\"/\\\"}"
  osascript -e "do shell script \"$script\" with administrator privileges" >/dev/null 2>&1
}

# 回滚模型：REMOVE=失败时删除的新写入；RESTORE_PROFILE/RESTORE_APP/RESTORE_AEIS=失败时搬回
REMOVE=()
RESTORE_PROFILE=""
RESTORE_APP=""
RESTORE_AEIS=""
rollback(){
  say "⚠ 安装失败，开始回滚…"
  for f in "${REMOVE[@]}"; do [ -e "$f" ] && rm -rf "$f" || true; done
  if [ -n "$RESTORE_PROFILE" ] && [ -d "$RESTORE_PROFILE" ]; then
    mkdir -p "$PROFILE_DIR"
    mv "$RESTORE_PROFILE"/. "$PROFILE_DIR"/ 2>/dev/null || true
  fi
  if [ -n "$RESTORE_AEIS" ] && [ -d "$RESTORE_AEIS" ]; then
    mv "$RESTORE_AEIS" "$DSH_HOME_DIR/aeis-venv" 2>/dev/null || true
  fi
  if [ -n "$RESTORE_APP" ] && [ -d "$RESTORE_APP" ]; then
    local parent; parent="$(dirname "$APP_TARGET")"
    if [ -w "$parent" ]; then
      rm -rf "$APP_TARGET" 2>/dev/null || true
      mv "$RESTORE_APP" "$APP_TARGET"
    else
      elevate "rm -rf '$APP_TARGET' 2>/dev/null; mv '$RESTORE_APP' '$APP_TARGET'" || true
    fi
  fi
  cleanup_tmp
}
trap rollback ERR
trap 'cleanup_tmp; exit 1' INT TERM

# ── 0. 前置校验 ─────────────────────────────────────────────────────────────
[ "$(uname -s)" = "Darwin" ] || { echo "[install] 仅支持 macOS"; exit 1; }
[ -f "$HERE/DSH Desktop.app.tar.gz" ] || { echo "[install] 缺少 DSH Desktop.app.tar.gz"; exit 1; }
[ -f "$HERE/profile.tar.gz" ] || { echo "[install] 缺少 profile.tar.gz"; exit 1; }
FREE_KB="$(df -k "$HOME" | awk 'NR==2{print $4}')"
[ "${FREE_KB:-0}" -ge 3000000 ] || { echo "[install] 磁盘空间不足（需 ≥3G，现有 $((FREE_KB/1024))M）"; exit 1; }

# ── node 运行时 shim：复用 Electron 二进制（离线免装 node）────────────────────
APP_BIN="$APP_TARGET/Contents/MacOS/DSH Desktop"
NODE_SHIM="$STAGING_DIR/node-shim/node"
mkdir -p "$(dirname "$NODE_SHIM")"
cat > "$NODE_SHIM" <<EOF
#!/bin/bash
exec env ELECTRON_RUN_AS_NODE=1 "$APP_BIN" "\$@"
EOF
chmod +x "$NODE_SHIM"
export PATH="$(dirname "$NODE_SHIM"):$PATH"

# ── 1/6 解包 app（目标父目录不可写时提权）─────────────────────────────────────
APP_PARENT="$(dirname "$APP_TARGET")"
if [ -w "$APP_PARENT" ] && { [ ! -d "$APP_TARGET" ] || [ -w "$APP_TARGET" ]; }; then
  if [ -d "$APP_TARGET" ]; then
    say "1/6 已有 $APP_TARGET → 备份为 $APP_TARGET.pre-lute-$STAMP"
    mv "$APP_TARGET" "$APP_TARGET.pre-lute-$STAMP"
    RESTORE_APP="$APP_TARGET.pre-lute-$STAMP"
  fi
  tar --no-same-owner -xzf "$HERE/DSH Desktop.app.tar.gz" -C "$APP_PARENT"
  clear_qa "$APP_TARGET"
  REMOVE+=("$APP_TARGET")
else
  say "1/6 写入 $APP_PARENT 需要管理员授权（系统将弹出密码框）"
  HELPER="$STAGING_DIR/place-app.sh"
  mkdir -p "$(dirname "$HELPER")"
  cat > "$HELPER" <<HEOF
#!/bin/bash
if [ -d '$APP_TARGET' ]; then mv '$APP_TARGET' '$APP_TARGET.pre-lute-$STAMP'; fi
tar --no-same-owner -xzf '$HERE/DSH Desktop.app.tar.gz' -C '$APP_PARENT'
xattr -dr com.apple.quarantine '$APP_TARGET' 2>/dev/null || true
HEOF
  if [ -d "$APP_TARGET" ]; then RESTORE_APP="$APP_TARGET.pre-lute-$STAMP"; fi
  elevate "bash '$HELPER'"
  REMOVE+=("$APP_TARGET")
fi
say "1/6 app 就位"

# ── 2/6 解包 profile（只替换包拥有的项，data/ 不动）───────────────────────────
OWNED=(package.json pnpm-lock.yaml pnpm-workspace.yaml cordis.patch.yml apply-patches.mjs node_modules vendor overrides)
if [ -d "$PROFILE_DIR" ]; then
  say "2/6 已有 profile → 包拥有的项备份为 $PROFILE_DIR.pre-lute-$STAMP"
  RESTORE_PROFILE="$PROFILE_DIR.pre-lute-$STAMP"
  mkdir -p "$RESTORE_PROFILE"
  for item in "${OWNED[@]}"; do
    if [ -e "$PROFILE_DIR/$item" ]; then mv "$PROFILE_DIR/$item" "$RESTORE_PROFILE/"; fi
  done
fi
mkdir -p "$PROFILE_DIR"
tar --no-same-owner -xzf "$HERE/profile.tar.gz" -C "$PROFILE_DIR"
clear_qa "$PROFILE_DIR"
for item in "${OWNED[@]}"; do REMOVE+=("$PROFILE_DIR/$item"); done
say "2/6 profile 就位（node_modules 已随包，无需联网安装）"

# ── 3/6 路径占位替换 + file: 校验 + 补丁重放 ────────────────────────────────────
sed -i '' "s|__DSH_HOME__|$DSH_HOME_DIR|g" "$PROFILE_DIR/cordis.patch.yml"
node "$HERE/tools/rewrite-file-deps.mjs" --check "$PROFILE_DIR" || true
( cd "$PROFILE_DIR" && node apply-patches.mjs )
say "3/6 路径替换 + apply-patches.mjs 完成"

# ── 4/6 overrides 恢复（纵深防御：node_modules 已含 override 副本）─────────────
for o in dsh-llm dsh-tool-subagent dsh-file-reference-local; do
  src="$PROFILE_DIR/overrides/$o"
  if [ -d "$src" ]; then
    rm -rf "$PROFILE_DIR/node_modules/@deepseek-ai/$o"
    cp -R "$src" "$PROFILE_DIR/node_modules/@deepseek-ai/$o"
  fi
done
say "4/6 overrides 恢复完成"

# ── 5/6 技能 + 预设（合并，不覆盖已有）────────────────────────────────────────
mkdir -p "$STAGING_DIR"
tar --no-same-owner -xzf "$HERE/skills-presets.tar.gz" -C "$STAGING_DIR"
[ -d "$DSH_HOME_DIR/skills" ] || mkdir -p "$DSH_HOME_DIR/skills"
cp -Rn "$STAGING_DIR/skills/." "$DSH_HOME_DIR/skills/" 2>/dev/null || true
clear_qa "$DSH_HOME_DIR/skills"
[ -d "$DSH_HOME_DIR/.agent-presets" ] || mkdir -p "$DSH_HOME_DIR/.agent-presets"
cp -Rn "$STAGING_DIR/presets/." "$DSH_HOME_DIR/.agent-presets/" 2>/dev/null || true
clear_qa "$DSH_HOME_DIR/.agent-presets"
rm -rf "$STAGING_DIR/skills" "$STAGING_DIR/presets" 2>/dev/null || true
say "5/6 技能+预设合并完成"

# ── 6/6 灵枢 venv（便携版随包）+ 补丁锚点校验 ─────────────────────────────────
if [ -f "$HERE/aeis-portable.tar.gz" ]; then
  if [ -d "$DSH_HOME_DIR/aeis-venv" ]; then
    say "6/6 已有 aeis-venv → 备份为 aeis-venv.pre-lute-$STAMP"
    mv "$DSH_HOME_DIR/aeis-venv" "$DSH_HOME_DIR/aeis-venv.pre-lute-$STAMP"
    RESTORE_AEIS="$DSH_HOME_DIR/aeis-venv.pre-lute-$STAMP"
  fi
  mkdir -p "$DSH_HOME_DIR"
  tar --no-same-owner -xzf "$HERE/aeis-portable.tar.gz" -C "$DSH_HOME_DIR"
  clear_qa "$DSH_HOME_DIR/aeis-venv"
  REMOVE+=("$DSH_HOME_DIR/aeis-venv")
  bash "$HERE/tools/reloc-aeis.sh" --check "$DSH_HOME_DIR/aeis-venv" || say "⚠ 灵枢 venv 自检未通过，见 reloc-aeis.sh"
else
  say "6/6 本包未含灵枢 venv 载荷（跳过）"
fi
if [ -f "$HERE/tools/verify-patches.sh" ]; then
  say "运行补丁锚点校验…"
  DSH_APP="$APP_TARGET" DSH_HOME="$DSH_HOME_DIR" \
    LING_SRC="$PROFILE_DIR/vendor/dsh-memory-local" \
    bash "$HERE/tools/verify-patches.sh" || say "⚠ 补丁校验未全绿——先重启 DSH 再复验"
fi
if [ -f "$HERE/tools/brand-replay.sh" ]; then
  say "运行品牌锚点校验…"
  DSH_APP="$APP_TARGET" bash "$HERE/tools/brand-replay.sh" --check \
    || say "⚠ 品牌锚点漂移——可运行 brand-replay.sh --apply 重放"
fi

cleanup_tmp
say "完成。① 重启 DSH Desktop；② 重新授权 TCC（录屏/辅助功能/自动化）；③ 校验：bash $HERE/tools/verify-patches.sh"
