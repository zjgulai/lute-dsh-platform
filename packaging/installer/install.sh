#!/bin/bash
# LUTE Agentic System 目标机离线安装器（DSH Desktop 2.0.5 + Magpie-Horch 全量定制层）
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
# 2.0.5 新增：Electron userData（wizard 状态落位）。客户机默认 Application Support/LUTE Agentic System；
# 冒烟/隔离环境用 LUTE_USERDATA 指向隔离 userData。
USERDATA_DIR="${LUTE_USERDATA:-$HOME/Library/Application Support/LUTE Agentic System}"
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
# 禁止 sudo/root 运行：root 会让 ~/.dsh 落盘文件全部变成 root 属主，后续用户态
# 重跑无法 mv/覆盖 → 反复回滚（客户机器历史坑）。提权仅发生在「写 /Applications」
# 单步（osascript 弹管理员密码框），全程无需 sudo。
[ "$(id -u)" = "0" ] && { echo "[install] 请勿用 sudo 运行（root 会污染 ~/.dsh 属主导致后续无法覆盖）。请以普通用户执行：bash install.sh"; exit 1; }
# root 属主残留检测（历史 sudo 安装的痕迹）：关键目录属主为 root 即中止并给修复命令
ROOT_JUNK=""
for p in "$DSH_HOME_DIR" "$DSH_HOME_DIR/profiles" "$PROFILE_DIR" "$DSH_HOME_DIR/aeis-venv"; do
  [ -e "$p" ] && [ "$(stat -f %u "$p" 2>/dev/null)" = "0" ] && ROOT_JUNK="$ROOT_JUNK $p"
done
if [ -n "$ROOT_JUNK" ]; then
  echo "[install] 检测到 root 属主残留（历史 sudo 安装所致）：$ROOT_JUNK"
  echo "  修复：sudo chown -R $(id -un) ~/.dsh/profiles ~/.dsh/aeis-venv 2>/dev/null"
  echo "  （data/ 用户数据不受影响；修复后重跑本安装器）"
  exit 1
fi
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
# pkg 模式（LUTE_INSTALL_APP=0）：app 已由 pkg 的 postinstall（root，Installer 已获
# 管理员授权）落位 /Applications，此处只校验存在性，跳过解包与二次提权。
APP_PARENT="$(dirname "$APP_TARGET")"
if [ "${LUTE_INSTALL_APP:-1}" = "0" ]; then
  [ -d "$APP_TARGET" ] || { echo "[install] LUTE_INSTALL_APP=0 但 $APP_TARGET 不存在（pkg app 落位失败）"; exit 1; }
  clear_qa "$APP_TARGET" 2>/dev/null || true
  say "1/6 app 已由 pkg 落位（跳过解包）"
elif [ -w "$APP_PARENT" ] && { [ ! -d "$APP_TARGET" ] || [ -w "$APP_TARGET" ]; }; then
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
  # 升级前的「客户自装插件」清点（2026-09-12 补）：node_modules 与 package.json 是整体替换的，
  # 所以不在本包清单里的自装插件升级后不会自动装载。此前这条是**静默的**（旧副本被 mv 进备份
  # 目录后再没人看这份列表）。这里改成装前清点 + 装后落一份清单文件。
  #
  # 判据（**不是**「node_modules 顶层不在清单里」——那会把 271 个传递依赖全算成自装插件，噪声
  # 淹掉信号）：**旧 profile 的 package.json 声明过、而新包的 profile 没声明的条目**。
  # 客户自装插件必经 `dsh plugin add` 写进 profile package.json，所以这个差集恰好就是它。
  if [ -f "$PROFILE_DIR/package.json" ] && [ -f "$HERE/profile.tar.gz" ]; then
    EXTRAS="$STAGING_DIR/upgrade-extras.txt"
    mkdir -p "$STAGING_DIR"
    node -e "
      const fs = require('node:fs'), path = require('node:path')
      const { execFileSync } = require('node:child_process')
      const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
      const names = (pkg) => {
        const out = new Set(Object.keys(pkg.dependencies ?? {}))
        for (const b of pkg.dsh?.profile?.bundles ?? []) out.add(typeof b === 'string' ? b : b.name)
        return out
      }
      const oldPkg = readJson(process.argv[1])
      const newPkg = JSON.parse(execFileSync('tar', ['-xzOf', process.argv[2], './package.json'], { encoding: 'utf8', maxBuffer: 1 << 26 }))
      const oldSet = names(oldPkg), newSet = names(newPkg)
      const extras = [...oldSet].filter((n) => !newSet.has(n)).sort()
      fs.writeFileSync(process.argv[3], extras.join('\n') + (extras.length ? '\n' : ''))
      console.log(extras.length)
    " "$PROFILE_DIR/package.json" "$HERE/profile.tar.gz" "$EXTRAS" > "$STAGING_DIR/extras-count.txt" 2>/dev/null || echo 0 > "$STAGING_DIR/extras-count.txt"
    EXTRAS_N="$(cat "$STAGING_DIR/extras-count.txt" 2>/dev/null || echo 0)"
    if [ "${EXTRAS_N:-0}" != "0" ]; then
      say "⚠ 本次升级不再包含 $EXTRAS_N 个原有条目（升级后不会自动装载）："
      sed 's/^/      /' "$EXTRAS" 2>/dev/null || true
      say "  旧副本（含 node_modules）已备份到 $RESTORE_PROFILE/；清单：$DSH_HOME_DIR/.lute-install/upgrade-extras.txt"
      say "  恢复办法：把该插件目录从备份的 node_modules 拷回，并在 profile/package.json 的"
      say "            dependencies + dsh.profile.bundles 里补回同名条目，然后重启 DSH。"
    fi
  fi
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
# 两个占位都来自构建机路径，必须都替换（只替换第一个会让 productRoots 之类的配置
# 指向打包机的 /Users/<builder>/project）：
#   __DSH_HOME__           → 目标机 DSH 数据根
#   __LUTE_PROJECT_ROOT__  → 目标机项目根默认值（新应用抽屉扫描产品的允许根；
#                            目录不存在不报错，客户可在 cordis.patch.yml 里改成自己的路径）
sed -i '' "s|__DSH_HOME__|$DSH_HOME_DIR|g" "$PROFILE_DIR/cordis.patch.yml"
sed -i '' "s|__LUTE_PROJECT_ROOT__|$HOME/project|g" "$PROFILE_DIR/cordis.patch.yml"
if grep -q '__LUTE_PROJECT_ROOT__\|__DSH_HOME__' "$PROFILE_DIR/cordis.patch.yml" 2>/dev/null; then
  echo "[install] ⚠ cordis.patch.yml 仍有未替换的占位（打包侧与安装侧口径不一致）" >&2
fi
# 路径自检：出货 profile 不应含构建机 home 路径。历史三次同类缺陷都出在这里，
# 所以这里**不再 `|| true`**——发现问题要响，而不是装完才知道。
if node "$HERE/tools/rewrite-file-deps.mjs" --check "$PROFILE_DIR"; then
  say "3/6 file: 路径自检通过"
else
  echo "[install] ✗ file: 依赖自检未通过（见上）——profile 里仍有构建机路径，安装中止" >&2
  exit 1
fi
( cd "$PROFILE_DIR" && node apply-patches.mjs )
say "3/6 路径替换 + apply-patches.mjs 完成"

# ── 3b/6 预写 setup-wizard skip 状态（2.0.5 首启免向导；目录权限必须 700）─────────
# 状态路径：<userData>/profile-setup/<sha256(profileDir)>/state.json；
# 只写「不存在时」，不覆盖用户已完成的向导决定（升级路径同理）。
if [ -f "$HERE/tools/rewrite-file-deps.mjs" ]; then :; fi
WIZARD_HASH="$(node -e "const{createHash}=require('crypto');console.log(createHash('sha256').update(process.argv[1]).digest('hex'))" "$PROFILE_DIR" 2>/dev/null || true)"
if [ -n "$WIZARD_HASH" ]; then
  WIZARD_ROOT="$USERDATA_DIR/profile-setup"
  WIZARD_DIR="$WIZARD_ROOT/$WIZARD_HASH"
  WIZARD_STATE="$WIZARD_DIR/state.json"
  if [ ! -f "$WIZARD_STATE" ]; then
    mkdir -p "$WIZARD_DIR"
    chmod 700 "$WIZARD_ROOT" "$WIZARD_DIR" 2>/dev/null || true
    cat > "$WIZARD_STATE" <<EOF
{
  "version": 2,
  "profileHash": "$WIZARD_HASH",
  "outcome": "skipped",
  "desktopVersion": "2.0.5",
  "dshVersion": "0.1.2-rc.1",
  "setupRevision": 1,
  "recordedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}
EOF
    chmod 600 "$WIZARD_STATE"
    say "3b/6 setup-wizard skip 状态已预写（700 权限）"
  else
    say "3b/6 setup-wizard 状态已存在，保留不覆盖"
  fi
else
  say "3b/6 跳过（node shim 不可用）"
fi

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
  bash "$HERE/tools/reloc-aeis.sh" --check "$DSH_HOME_DIR/aeis-venv" \
    || { echo "[install] ✗ 灵枢 venv 自检未通过（见上）" >&2; VERIFY_FAILED=1; }
else
  say "6/6 本包未含灵枢 venv 载荷（跳过）"
fi

# 校验汇总语义（2026-09-12 改）：三处校验从「只 say 一条 ⚠」改成「收集全部失败 + 末尾非零退出」。
# 动机：此前 verify-patches / brand 失败只打印警告、退出码仍是 0 —— 客户拿到一个「装完了」
# 但补丁/品牌缺件的环境，而唯一信号是一行可能被忽略的警告（诊断报告 D3）。
# 选择「响亮但**不回滚**」：装完的文件留在原地供排查，回滚留给用户决定（cordon 见下）。
VERIFY_FAILED="${VERIFY_FAILED:-0}"
if [ -f "$HERE/tools/verify-patches-v2.sh" ]; then
  say "运行补丁锚点校验（v2 · 2.0.5）…"
  DSH_APP="$APP_TARGET" bash "$HERE/tools/verify-patches-v2.sh" \
    || { echo "[install] ✗ 补丁锚点未全绿（见上）——上面的 MISSING/FAIL 就是缺件清单" >&2; VERIFY_FAILED=1; }
else
  echo "[install] ✗ 载荷缺少 tools/verify-patches-v2.sh（2.0.5 的唯一权威校验器；v1 已于 2026-09-11 退役）" >&2
  VERIFY_FAILED=1
fi
if [ -f "$HERE/tools/brand-replay.sh" ]; then
  say "运行品牌锚点校验…"
  DSH_APP="$APP_TARGET" bash "$HERE/tools/brand-replay.sh" --check \
    || { echo "[install] ✗ 品牌锚点漂移（见上）；可运行 tools/brand-replay.sh --apply 重放" >&2; VERIFY_FAILED=1; }
fi

cleanup_tmp
if [ "$VERIFY_FAILED" != "0" ]; then
  echo "" >&2
  echo "[install] ✗ 安装已落位，但校验未全部通过（退出码 1）。文件保留在原处以便排查；" >&2
  echo "          确认要退回上一版：用 *.pre-lute-$STAMP 备份手工恢复（app / profiles/desktop / aeis-venv）。" >&2
  exit 1
fi
say "完成。① 重启 DSH Desktop；② 重新授权 TCC（辅助功能 / 屏幕录制 / 输入监控——第三项在「输入监控」下，不在「自动化」下）；③ 复验：bash $HERE/tools/verify-patches-v2.sh"
