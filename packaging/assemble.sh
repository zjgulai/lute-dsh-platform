#!/bin/bash
# LUTE 打包组装器 —— DSH Desktop 2.0.4 + Magpie-Horch 全量定制层 → 可分发 payload
# 产出：staging/<VERSION>/payload/（安装器 + 载荷 tarball + 校验工具），Phase 3 由此制 dmg。
#
# 用法: VERSION=1.0.0 ./assemble.sh
# 环境覆盖：DSH_APP / DSH_HOME / DSH_VENDOR / VERSION / OUT
set -euo pipefail
PKG_ROOT="$(cd "$(dirname "$0")" && pwd)"
DSH_APP="${DSH_APP:-/Applications/DSH Desktop.app}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
DSH_VENDOR="${DSH_VENDOR:-$HOME/project/Magpie-Horch}"
PROFILE="$DSH_HOME_DIR/profiles/desktop"
VERSION="${VERSION:-1.0.0}"
STAGE="$PKG_ROOT/staging/$VERSION"
PAYLOAD="$STAGE/payload"
say(){ echo "[assemble] $*"; }

# ── 前置校验 ────────────────────────────────────────────────────────────────
[ -d "$DSH_APP" ] || { echo "[assemble] 缺少 app: $DSH_APP"; exit 1; }
[ -d "$PROFILE" ] || { echo "[assemble] 缺少 profile: $PROFILE"; exit 1; }
[ -d "$DSH_VENDOR/dsh-patches" ] || { echo "[assemble] 缺少 dsh-patches: $DSH_VENDOR/dsh-patches"; exit 1; }
FREE_KB="$(df -k "$PKG_ROOT" | awk 'NR==2{print $4}')"
[ "${FREE_KB:-0}" -ge 6000000 ] || { echo "[assemble] 磁盘空间不足（需 ≥6G，现有 $((FREE_KB/1024))M）"; exit 1; }
rm -rf "$STAGE"; mkdir -p "$PAYLOAD/tools"

# ── 1. app 本体（拷贝 → 暂存改写；签名与压缩推迟到 §2b 双落位之后）───────────────
say "1/6 暂存 app 本体（约 800M 拷贝中…）"
APP_STAGE="$STAGE/app"
mkdir -p "$APP_STAGE"
# R2b 决策：内嵌 dsh-profile 作为首启兜底（与 profile.tar.gz 同源）。
# 此处先排除 dev 机自带的老 dsh-profile（8-30 半成品），后面由 §2b 同源注入。
rsync -a --exclude '.DS_Store' --exclude 'dsh-profile' --exclude '*.orig*' --exclude '*.bak' "$DSH_APP/" "$APP_STAGE/DSH Desktop.app/" 2>/dev/null \
  || { cp -R "$DSH_APP" "$APP_STAGE/DSH Desktop.app" && rm -rf "$APP_STAGE/DSH Desktop.app/Contents/Resources/dsh-profile"; }

# 暂存改写：禁用官方更新通道（决策 D3；electron-updater 无 provider 即无检查源）
APP_RES="$APP_STAGE/DSH Desktop.app/Contents/Resources"
cat > "$APP_RES/app-update.yml" <<'EOF'
# LUTE 定制版：官方更新通道已禁用（打包决策 D3，2026-09-01）。
# 恢复官方更新会覆盖全部本地补丁，请勿改回。
EOF
say "app-update.yml 已改写（禁用官方更新通道）"

# 暂存改写：CFBundleVersion 加 lute 后缀（系统构建标识，防同版本重装被跳过；
# ShortVersionString 保持 2.0.4 对齐 DSH 基线，避免内部版本判断漂移）
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion 2.0.4-lute.$VERSION" \
  "$APP_STAGE/DSH Desktop.app/Contents/Info.plist"
say "CFBundleVersion → 2.0.4-lute.$VERSION"

# 签名与压缩推迟到 §2b：须先同源注入 dsh-profile 再 codesign --deep，否则首启兜底内容不在签名面内。

# ── 2. profile（manifest 重写 + vendor + overrides + 离线 node_modules）───────
say "2/6 暂存 profile"
# staging 布局与目标机一致：profile/ 下含 vendor/ 与 overrides/（随包即所检）
STAGEP="$STAGE/.profile-stage"
mkdir -p "$STAGEP/profile/vendor" "$STAGEP/profile/overrides"
for f in package.json pnpm-lock.yaml pnpm-workspace.yaml cordis.patch.yml apply-patches.mjs; do
  [ -f "$PROFILE/$f" ] && cp "$PROFILE/$f" "$STAGEP/profile/"
done

# vendor 列表 = package.json 中指向 Magpie-Horch 的 file: 依赖 + dsh-patches
vendor_dirs="$(node -e "
const p=require(process.argv[1]);
const names=Object.entries(p.dependencies||{})
  .filter(([,v])=>typeof v==='string'&&v.startsWith('file:../../../project/Magpie-Horch/'))
  .map(([,v])=>v.slice('file:../../../project/Magpie-Horch/'.length).replace(/\/+$/,''));
console.log(names.join(' '))" "$PROFILE/package.json")"
say "vendor 列表: $vendor_dirs dsh-patches"
for d in $vendor_dirs dsh-patches; do
  [ -d "$DSH_VENDOR/$d" ] || { echo "[assemble] 缺少 vendor 源: $DSH_VENDOR/$d"; exit 1; }
  # --safe-links：跳过指向源树外的符号链接（如 dsh-theme-local/vendor 下指向
  # 构建机 app checkout 的开发期草稿链接），包内只保留树内相对链接
  # dev 临时文件排除口径（与 .gitignore P3 对齐）：*.bak-*/*.pre-*/*.orig + 元数据
  rsync -a --safe-links --exclude node_modules --exclude .git --exclude '*.map' --exclude dist \
        --exclude 'preview-*.html' --exclude archive \
        --exclude '.DS_Store' --exclude '*.bak-*' --exclude '*.pre-*' --exclude '*.orig*' \
        --exclude '.git.disabled' --exclude coverage \
        "$DSH_VENDOR/$d/" "$STAGEP/profile/vendor/$d/" 2>/dev/null \
    || cp -R "$DSH_VENDOR/$d" "$STAGEP/profile/vendor/$d/"
done
# 兜底清理（rsync fallback 到 cp -R 时无排除能力；终态保证 vendor 无 dev 临时文件）
find "$STAGEP/profile/vendor" \( -name '.DS_Store' -o -name '*.bak-*' -o -name '*.pre-*' -o -name '*.orig*' \) -delete 2>/dev/null || true
find "$STAGEP/profile/vendor" -maxdepth 2 \( -name '.git.disabled' -o -name coverage \) -type d -exec rm -rf {} + 2>/dev/null || true

# overrides（profile node_modules 里的 -override 副本，随包以防目标机版本漂移）
for o in dsh-llm dsh-tool-subagent dsh-file-reference-local; do
  src="$PROFILE/node_modules/@deepseek-ai/$o"
  [ -d "$src" ] && rsync -a --exclude node_modules --exclude '*.orig*' --exclude '*.bak-*' --exclude '*.pre-*' "$src/" "$STAGEP/profile/overrides/$o/" 2>/dev/null
done

# file: 路径重写（包内自洽，决策 D4）→ 在暂存副本上执行，不触碰本机 profile
node "$PKG_ROOT/scripts/rewrite-file-deps.mjs" "$STAGEP/profile"

# cordis.patch.yml 内构建机绝对路径 → __DSH_HOME__ 占位（安装时按目标机 $HOME 替换；
# 内嵌兜底路径由 main.js P0-7 首启 hook 按真实 DSH home 替换）
sed -i '' "s|$DSH_HOME_DIR|__DSH_HOME__|g" "$STAGEP/profile/cordis.patch.yml"

# ── 2b. R2b 双落位：同源 profile 注入 app 内嵌 dsh-profile（首启兜底）──────────
say "2b/6 同源注入内嵌 dsh-profile（首启兜底）"
BUNDLED="$APP_STAGE/DSH Desktop.app/Contents/Resources/dsh-profile"
mkdir -p "$BUNDLED"
# 与 profile.tar.gz 完全同源：同一份 staging 内容 + 同一份离线 node_modules
# 注：内嵌副本排除 node_modules/.bin（CLI shim，DSH 运行时不用）——其中含断链，
# 断链会导致 codesign --deep --strict 拒绝整个 bundle。
rsync -a "$STAGEP/profile/" "$BUNDLED/"
rsync -a --exclude '.bin' --exclude '*.orig*' --exclude '*.bak-*' --exclude '*.pre-*' "$PROFILE/node_modules/" "$BUNDLED/node_modules/" 2>/dev/null \
  || { cp -R "$PROFILE/node_modules" "$BUNDLED/node_modules" && rm -rf "$BUNDLED/node_modules/.bin"; }
# 断言无指向包外的绝对符号链接（codesign --deep --strict 会拒绝）
ABS_LINKS="$(find "$BUNDLED" -type l -exec sh -c 'case "$(readlink "$1")" in /*) echo "$1 -> $(readlink "$1")";; esac' _ {} \;)"
if [ -n "$ABS_LINKS" ]; then
  echo "[assemble] 内嵌 dsh-profile 含绝对符号链接，中止："; echo "$ABS_LINKS"; exit 1
fi
# 断言无断链（目标不存在），否则 codesign 拒绝
BROKEN_LINKS="$(find "$BUNDLED" -type l -exec test ! -e {} \; -print)"
if [ -n "$BROKEN_LINKS" ]; then
  echo "[assemble] 内嵌 dsh-profile 含断链，中止："; echo "$BROKEN_LINKS"; exit 1
fi
say "内嵌 dsh-profile 就绪 ($(du -sh "$BUNDLED" | cut -f1))"

# adhoc 深签名（决策 D2；内容已改写 + 注入 dsh-profile，原签名失效，打包前重签）
say "adhoc 深签名（含内嵌 dsh-profile）…"
codesign --force --deep --sign - "$APP_STAGE/DSH Desktop.app"
codesign --verify --deep --strict "$APP_STAGE/DSH Desktop.app"
say "app adhoc 深签名完成"

say "压缩 app（gzip -1）…"
( cd "$APP_STAGE" && tar --exclude '.DS_Store' -cf - "DSH Desktop.app" | gzip -1 > "$PAYLOAD/DSH Desktop.app.tar.gz" )
say "app 完成 ($(du -sh "$PAYLOAD/DSH Desktop.app.tar.gz" | cut -f1))"

say "压缩 profile（含离线 node_modules 475M + vendor，数分钟）…"
# 归档根 = profile 目录内容（package.json/vendor/overrides 在根，与目标机布局一致）+ node_modules
# --exclude '.DS_Store'：与 app 归档（line 119）对称，否则 .DS_Store 混入 profile.tar.gz
# 而 app.tar.gz 已排除 → 内嵌/安装后双落位不一致（smoke 5c 断言失败）
# --exclude '*.orig*' 等：dev 临时文件（node_modules 里也有 index.js.orig）不进包
tar -czf "$PAYLOAD/profile.tar.gz" --exclude '.DS_Store' --exclude '*.orig*' --exclude '*.bak-*' \
    --exclude '*.pre-*' --exclude '.git.disabled' --exclude coverage \
    -C "$STAGEP/profile" . -C "$PROFILE" node_modules
say "profile 完成 ($(du -sh "$PAYLOAD/profile.tar.gz" | cut -f1))"
rm -rf "$STAGEP"

# ── 3. 技能 + 预设 ───────────────────────────────────────────────────────────
say "3/6 暂存技能 + 预设"
SP="$STAGE/.sp"; mkdir -p "$SP/skills" "$SP/presets"
[ -d "$DSH_HOME_DIR/skills" ] && cp -R "$DSH_HOME_DIR/skills/." "$SP/skills/"
[ -d "$HOME/.agents/skills" ] && cp -R "$HOME/.agents/skills/." "$SP/skills/" 2>/dev/null || true
[ -d "$DSH_HOME_DIR/.agent-presets" ] && cp -R "$DSH_HOME_DIR/.agent-presets/." "$SP/presets/"
# 清理元数据/临时文件（口径与 vendor/node_modules 一致）
find "$SP" \( -name '.DS_Store' -o -name '*.bak-*' -o -name '*.pre-*' -o -name '*.orig*' \) -delete 2>/dev/null || true
tar -czf "$PAYLOAD/skills-presets.tar.gz" --exclude '.DS_Store' -C "$SP" skills presets
rm -rf "$SP"
say "技能+预设完成 ($(du -sh "$PAYLOAD/skills-presets.tar.gz" | cut -f1))"

# ── 4. 灵枢 venv 便携化（python-build-standalone 基底，免 venv 机制）──────────────
say "4/6 灵枢 aeis 运行时便携化"
if [ -d "$DSH_HOME_DIR/aeis-venv/lib/python3.14/site-packages" ]; then
  bash "$PKG_ROOT/scripts/reloc-aeis.sh" --build \
    "$DSH_HOME_DIR/aeis-venv/lib/python3.14/site-packages" "$STAGE/.aeis"
  tar -czf "$PAYLOAD/aeis-portable.tar.gz" -C "$STAGE/.aeis" aeis-venv
  rm -rf "$STAGE/.aeis"
  say "aeis-portable 完成 ($(du -sh "$PAYLOAD/aeis-portable.tar.gz" | cut -f1))"
else
  say "⚠ 未找到 $DSH_HOME_DIR/aeis-venv —— 跳过 aeis 载荷（灵枢将在目标机不可用）"
fi

# ── 5. 安装器与工具 ──────────────────────────────────────────────────────────
say "5/6 装配安装器与工具"
cp "$PKG_ROOT/installer/install.sh" "$PAYLOAD/install.sh"
chmod 755 "$PAYLOAD/install.sh"
cp "$PKG_ROOT/scripts/rewrite-file-deps.mjs" "$PAYLOAD/tools/"
cp "$PKG_ROOT/scripts/reloc-aeis.sh" "$PAYLOAD/tools/"
cp "$DSH_VENDOR/dsh-patches/verify-patches.sh" "$PAYLOAD/tools/"
cp "$DSH_VENDOR/dsh-patches/brand-replay.sh" "$PAYLOAD/tools/" 2>/dev/null || true
cp "$DSH_VENDOR/dsh-patches/brand-payload-wordmark.txt" "$PAYLOAD/tools/" 2>/dev/null || true
cp "$DSH_VENDOR/dsh-patches/patches-manifest.md" "$PAYLOAD/tools/" 2>/dev/null || true
chmod 755 "$PAYLOAD/tools/"*.sh "$PAYLOAD/tools/"*.mjs 2>/dev/null || true

# LUTE Setup.app（GUI 安装器，swiftc 编译；随 payload 根分发）
bash "$PKG_ROOT/scripts/build-setup-app.sh" "$PAYLOAD"

# ── 6. 元数据（README / VERSION / SHA256SUMS / manifest.json）───────────────────
say "6/6 元数据"
cat > "$PAYLOAD/VERSION" <<EOF
LUTE_VERSION=$VERSION
DSH_BASELINE=2.0.4
ARCH=arm64
EOF
if [ -f "$PAYLOAD/aeis-portable.tar.gz" ]; then
  ( cd "$PAYLOAD" && shasum -a 256 "DSH Desktop.app.tar.gz" profile.tar.gz skills-presets.tar.gz aeis-portable.tar.gz > SHA256SUMS )
else
  ( cd "$PAYLOAD" && shasum -a 256 "DSH Desktop.app.tar.gz" profile.tar.gz skills-presets.tar.gz > SHA256SUMS )
fi
cat > "$PAYLOAD/README.md" <<EOF
# DSH Desktop LUTE $VERSION 离线完整包

## 组成
- \`DSH Desktop.app.tar.gz\`：已补丁 app（P0 六项 + UI + 品牌 + 官方更新通道禁用）。
- \`profile.tar.gz\`：profile manifest + 离线 node_modules（免 pnpm）+ vendor + overrides。
- \`skills-presets.tar.gz\`：用户技能 + 预设。
- \`aeis-portable.tar.gz\`：灵枢 Python 运行时（可重定位 standalone 基底 + aeis 纯 Python 包，目标机免 Python）。
- \`LUTE Setup.app\`：GUI 安装器（双击安装，进度可见）。
- \`install.sh\`：命令行安装（等价于 Setup.app，幂等 + 回滚 + 升级保留数据）。
- \`tools/\`：补丁锚点校验（verify-patches.sh）、品牌漂移检查（brand-replay.sh）、file: 重写工具。
- \`SHA256SUMS\`：完整性校验。

## 安装（macOS，完全离线）
双击 \`LUTE Setup.app\` → 开始安装（写 /Applications 一步会弹管理员密码框）；
或终端 \`bash install.sh\`。
启动后：**重新授权 TCC**（系统设置 → 隐私与安全 → 屏幕录制/辅助功能/自动化，授权 LUTE Agentic System）。

## 校验
\`\`\`bash
bash tools/verify-patches.sh        # 应 ALL PATCHES VERIFIED
bash tools/brand-replay.sh --check  # 品牌锚点无漂移
\`\`\`

## 未随包（用户决策）
sessions/storages/记忆库/凭据（.credentials.yaml、.modlens/config.json）——需迁移时单独导出。
安装器升级只替换包拥有的 manifest/代码面，profile data/ 与你自装的技能/预设不受影响。
EOF

node -e "
const fs=require('fs');
const size=p=>fs.existsSync(p)?fs.statSync(p).size:0;
const payload=process.argv[1];
const files=['DSH Desktop.app.tar.gz','profile.tar.gz','skills-presets.tar.gz','aeis-portable.tar.gz','install.sh','LUTE Setup.app'];
const m={name:'dsh-desktop-lute',version:process.argv[2],dsd_baseline:'2.0.4',arch:'arm64',
  created_at:new Date().toISOString(),
  files:Object.fromEntries(files.map(f=>[f,size(payload+'/'+f)]))};
fs.writeFileSync(payload+'/manifest.json',JSON.stringify(m,null,2)+'\n');" "$PAYLOAD" "$VERSION"

# 完整性清单：所有 bundle/vendor/skills/presets 的权威列表（供 smoke 逐一比对）
node -e "
const fs=require('fs'),path=require('path');
const p=require(process.argv[1]);
const bundles=(p.dsh?.profile?.bundles||[]).map(b=>typeof b==='string'?b:b.name);
const deps=Object.keys(p.dependencies||{});
const vendorDirs=Object.entries(p.dependencies||{})
  .filter(([,v])=>typeof v==='string'&&v.startsWith('file:../../../project/Magpie-Horch/'))
  .map(([,v])=>v.slice('file:../../../project/Magpie-Horch/'.length).replace(/\/+\$/,''));
vendorDirs.push('dsh-patches');
const allBundles=[...new Set([...bundles,...deps.filter(d=>typeof p.dependencies[d]==='string'&&!p.dependencies[d].startsWith('file:'))])];
const listDir=(d)=>fs.existsSync(d)?fs.readdirSync(d).filter(x=>fs.statSync(path.join(d,x)).isDirectory()).sort():[];
const c={bundles:allBundles.sort(),vendor:[...new Set(vendorDirs)].sort(),
  skills:listDir(process.argv[2]+'/skills'),presets:listDir(process.argv[2]+'/.agent-presets')};
fs.writeFileSync(process.argv[3]+'/completeness.json',JSON.stringify(c,null,2)+'\n');
console.log('bundles='+c.bundles.length+' vendor='+c.vendor.length+' skills='+c.skills.length+' presets='+c.presets.length);
" "$PROFILE/package.json" "$DSH_HOME_DIR" "$PAYLOAD"

say "汇编完成：$PAYLOAD"
( cd "$PAYLOAD" && ls -la )
du -sh "$STAGE"
