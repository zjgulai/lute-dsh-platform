#!/bin/bash
# LUTE 打包组装器 —— DSH Desktop 2.0.5 + Magpie-Horch 全量定制层 → 可分发 payload
# 产出：staging/<VERSION>/payload/（安装器 + 载荷 tarball + 校验工具），Phase 3 由此制 dmg。
#
# 用法: VERSION=1.0.0 ./assemble.sh            # 默认 BASE=source（源码构建，彻底解耦）
#       BASE=dmg VERSION=1.0.0 ./assemble.sh   # 兜底：从已安装官方 app 组装（回滚/对照用）
# 环境覆盖：BASE / DSH_APP / DSH_HOME / DSH_VENDOR / VERSION / OUT
set -euo pipefail
PKG_ROOT="$(cd "$(dirname "$0")" && pwd)"
BASE="${BASE:-source}"
DSH_APP="${DSH_APP:-/Applications/DSH Desktop.app}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
DSH_VENDOR="${DSH_VENDOR:-$HOME/project/Magpie-Horch}"
VENDOR_REPO="${VENDOR_REPO:-$DSH_VENDOR/vendor/dsh-desktop}"
VENDOR_PIN="${VENDOR_PIN:-$DSH_VENDOR/vendor/dsh-desktop.pin}"
PROFILE="${PROFILE:-$DSH_HOME_DIR/profiles/desktop}"
VERSION="${VERSION:-1.0.0}"
STAGE="${OUT:-$PKG_ROOT/staging/$VERSION}"
PAYLOAD="$STAGE/payload"
COREPACK="${COREPACK:-$HOME/.lute-toolchain/node_modules/.bin/corepack}"
say(){ echo "[assemble] $*"; }

# ── 前置校验 ────────────────────────────────────────────────────────────────
[ -d "$PROFILE" ] || { echo "[assemble] 缺少 profile: $PROFILE"; exit 1; }
[ -d "$DSH_VENDOR/dsh-patches" ] || { echo "[assemble] 缺少 dsh-patches: $DSH_VENDOR/dsh-patches"; exit 1; }
if [ "$BASE" = "source" ]; then
  # 源码主路径（2026-09-11 起为唯一默认）：不依赖 /Applications 已安装 app。
  [ -d "$VENDOR_REPO/.git" ] || { echo "[assemble] BASE=source 需要 vendor 仓库: $VENDOR_REPO"; exit 1; }
  [ -f "$VENDOR_PIN" ] || { echo "[assemble] 缺少 pin 文件: $VENDOR_PIN"; exit 1; }
  [ -x "$COREPACK" ] || { echo "[assemble] 缺少 corepack: $COREPACK（node 26 不自带，npm i --prefix ~/.lute-toolchain corepack）"; exit 1; }
  # pin 门禁：vendor 仓库 HEAD 必须等于 pin 记录的 lute-sha（基座可复现性闭环）
  PIN_SHA="$(awk -F': ' '/^lute-sha:/{print $2}' "$VENDOR_PIN" | tr -d ' ')"
  HEAD_SHA="$(git -C "$VENDOR_REPO" rev-parse HEAD)"
  if [ -z "$PIN_SHA" ] || [ "$PIN_SHA" != "$HEAD_SHA" ]; then
    echo "[assemble] pin 门禁失败：pin=$PIN_SHA vendor HEAD=$HEAD_SHA"
    echo "[assemble] 修正：构建完成后更新 $VENDOR_PIN 的 lute-sha，或 checkout 到 pin 的 sha"
    exit 1
  fi
  say "pin 门禁通过（lute-sha=${HEAD_SHA}）"
  # electron 二进制门禁（enableScripts=false 时 postinstall 被跳过，需显式安装）
  if [ ! -d "$VENDOR_REPO/dsh-plugin-desktop/node_modules/electron/dist" ]; then
    say "electron 二进制缺失，经 npmmirror 安装…"
    ( cd "$VENDOR_REPO/dsh-plugin-desktop" && ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}" \
        node node_modules/electron/install.js )
  fi
  # 源码构建 + 打包（electron-builder --dir → 与官方 DMG 解包等价的无签名 app）
  say "源码构建 app（yarn package:dir，数分钟）…"
  ( cd "$VENDOR_REPO" && "$COREPACK" yarn workspace dsh-plugin-desktop package:dir >/tmp/lute-package-dir.log 2>&1 ) \
    || { echo "[assemble] package:dir 失败，日志尾部："; tail -20 /tmp/lute-package-dir.log; exit 1; }
  DSH_APP="$VENDOR_REPO/dsh-plugin-desktop/dist/mac-arm64/DSH Desktop.app"
  [ -d "$DSH_APP" ] || { echo "[assemble] 构建产物缺失: $DSH_APP"; exit 1; }
  say "源码构建完成：$(du -sh "$DSH_APP" | cut -f1)"
else
  say "BASE=dmg（兜底路径）：从已安装 app 组装"
  [ -d "$DSH_APP" ] || { echo "[assemble] 缺少 app: $DSH_APP"; exit 1; }
fi
FREE_KB="$(df -k "$PKG_ROOT" | awk 'NR==2{print $4}')"
[ "${FREE_KB:-0}" -ge 6000000 ] || { echo "[assemble] 磁盘空间不足（需 ≥6G，现有 $((FREE_KB/1024))M）"; exit 1; }
rm -rf "$STAGE"; mkdir -p "$PAYLOAD/tools"

# ── 1. app 本体（增量缓存 → 暂存改写；签名与压缩推迟到 §2b 双落位之后）──────────
say "1/6 暂存 app 本体（缓存命中则 APFS clone，秒级）"
APP_STAGE="$STAGE/app"
mkdir -p "$APP_STAGE"
# 增量优化（2026-09-11）：app 源未变时复用 .app-cache 纯净副本，APFS clone 秒级复制。
# 指纹 = 关键哨兵文件 mtime（asar/图标/Info.plist/update.yml，覆盖实际改动面）+ 全树文件数；
# 全树 stat 太慢（70s+），文件数 + 哨兵 mtime 兼顾速度与敏感度。
APP_CACHE="$PKG_ROOT/.app-cache"
# 源码主路径：指纹追加 vendor HEAD sha（源码一变，缓存必须失效）
VENDOR_STAMP=""
[ "$BASE" = "source" ] && VENDOR_STAMP="-$(git -C "$VENDOR_REPO" rev-parse HEAD | cut -c1-12)"
APP_SRC_STAMP="$(stat -f '%m' "$DSH_APP/Contents/Resources/app.asar" "$DSH_APP/Contents/Resources/icon.icns" "$DSH_APP/Contents/Resources/app-update.yml" "$DSH_APP/Contents/Info.plist" 2>/dev/null | sort -rn | head -1)-$(find "$DSH_APP" -type f -not -path '*/dsh-profile/*' 2>/dev/null | wc -l | tr -d ' ')$VENDOR_STAMP"
APP_SRC_STAMP="${APP_SRC_STAMP:--0}"
if [ -f "$APP_CACHE/.src-stamp" ] && [ "$(cat "$APP_CACHE/.src-stamp")" = "$APP_SRC_STAMP" ] \
   && [ -d "$APP_CACHE/DSH Desktop.app/Contents/MacOS" ]; then
  say "app 缓存命中（src-stamp=${APP_SRC_STAMP}），clone 复制"
else
  say "app 缓存未命中，全量同步（约 800M）"
  rm -rf "$APP_CACHE"; mkdir -p "$APP_CACHE"
  # R2b 决策：内嵌 dsh-profile 作为首启兜底（与 profile.tar.gz 同源）。
  # 此处先排除 dev 机自带的老 dsh-profile（8-30 半成品），后面由 §2b 同源注入。
  rsync -a --exclude '.DS_Store' --exclude 'dsh-profile' --exclude '*.orig*' --exclude '*.bak' "$DSH_APP/" "$APP_CACHE/DSH Desktop.app/" 2>/dev/null \
    || { cp -R "$DSH_APP" "$APP_CACHE/DSH Desktop.app" && rm -rf "$APP_CACHE/DSH Desktop.app/Contents/Resources/dsh-profile"; }
  echo "$APP_SRC_STAMP" > "$APP_CACHE/.src-stamp"
fi
cp -cR "$APP_CACHE/DSH Desktop.app" "$APP_STAGE/" 2>/dev/null \
  || cp -R "$APP_CACHE/DSH Desktop.app" "$APP_STAGE/"

# 暂存改写：禁用官方更新通道（决策 D3；electron-updater 无 provider 即无检查源）
APP_RES="$APP_STAGE/DSH Desktop.app/Contents/Resources"
cat > "$APP_RES/app-update.yml" <<'EOF'
# LUTE 定制版：官方更新通道已禁用（打包决策 D3，2026-09-01）。
# 恢复官方更新会覆盖全部本地补丁，请勿改回。
EOF
say "app-update.yml 已改写（禁用官方更新通道）"

# 暂存改写：CFBundleVersion 加 lute 后缀（系统构建标识，防同版本重装被跳过；
# ShortVersionString 保持 2.0.5 对齐 DSH 基线，避免内部版本判断漂移）
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion 2.0.5-lute.$VERSION" \
  "$APP_STAGE/DSH Desktop.app/Contents/Info.plist"
say "CFBundleVersion → 2.0.5-lute.${VERSION}"

# 暂存改写：运行时层补丁重放（NM 层，25 个确定性补丁，2026-09-11 起入仓 packaging/patches/nm/；
#            2026-09-12 增 P0-9 RootOutlet 白屏兜底）
# 覆盖：P0-3/P0-4/P0-8（pi-ai 磁盘化）、P0-9（RootOutlet 白屏兜底）、cordis-clamp、loader-B4、
#       skill-title×9、chatui×3、clipboard、PR-1/PR-2-5、LB-1~3。
# 补丁 = pristine(源码构建) → patched(出厂) 的统一 diff。
# BASE=source 时由 pristine 构建产物重放；BASE=dmg 时 app 源自带补丁，--forward 幂等跳过。
NM_DIR="$APP_STAGE/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules"
if [ -d "$NM_DIR" ]; then
  python3 "$PKG_ROOT/scripts/apply-nm-patches.py" "$NM_DIR"
else
  echo "[assemble] 警告：未找到 app.asar.unpacked/node_modules（NM 补丁跳过）"
fi

# 暂存改写：品牌 app 图标（lute-brand-icons 生成引擎产出，替换官方 icon.icns）
if [ -f "$PKG_ROOT/assets/app-icon.icns" ]; then
  cp "$PKG_ROOT/assets/app-icon.icns" "$APP_STAGE/DSH Desktop.app/Contents/Resources/icon.icns"
  say "app 图标已替换为 LUTE 品牌徽章（icon.icns）"
else
  echo "[assemble] 警告：缺少 assets/app-icon.icns（图标保持官方原样）"
fi

# 暂存改写：品牌重放（Info.plist CFBundleName/DisplayName + Helper 重命名 + web index.html 标题）
# 说明：壳层 lib/*.js 的显示串已由源码层 port 覆盖（vendor fork），此处负责壳外部分：
#   ① node_modules/@deepseek-ai/dsh-web-frontend 的 index.html 标题（运行时包，非壳层源码）
#   ② Info.plist 显示名与 Electron Helper 应用重命名（打包面）
# 幂等：已是 LUTE 品牌时报告 OK，不重复替换。
if [ -f "$DSH_VENDOR/dsh-patches/brand-replay.sh" ]; then
  DSH_APP="$APP_STAGE/DSH Desktop.app" bash "$DSH_VENDOR/dsh-patches/brand-replay.sh" --apply 2>&1 | tail -6
else
  echo "[assemble] 警告：缺少 brand-replay.sh（Info.plist/web 标题品牌跳过）"
fi

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
  .filter(([,v])=>typeof v==='string'&&(v.startsWith('file:../../../project/Magpie-Horch/')||v.startsWith('file:/Users/lute/project/Magpie-Horch/')))
  .map(([,v])=>v.startsWith('file:../../../project/Magpie-Horch/')?v.slice('file:../../../project/Magpie-Horch/'.length).replace(/\/+$/,''):v.slice('file:/Users/lute/project/Magpie-Horch/'.length).replace(/\/+$/,''));
console.log(names.join(' '))" "$PROFILE/package.json")"
say "vendor 列表: $vendor_dirs"
# 注意：**不**把 dsh-patches 拷进出货 profile 的 vendor。理由两条：
#   ① 它不是装载点（ADR-0054：DSH 的包解析锚点是 profile 根 package.json → node_modules，
#      vendor/ 只作「内嵌 profile 拷贝物化」的判别标记），运行时不读它；
#   ② 里面有内部取证材料（锚点漂移取证、P0 修复清单、上游议题、UI-UX 审计包）——
#      客户需要的是 payload/tools/ 下的校验与品牌工具，不是我们的工程留痕（决策 K10）。
for d in $vendor_dirs; do
  [ -d "$DSH_VENDOR/$d" ] || { echo "[assemble] 缺少 vendor 源: $DSH_VENDOR/$d"; exit 1; }
  # --safe-links：跳过指向源树外的符号链接（如 dsh-theme-local/vendor 下指向
  # 构建机 app checkout 的开发期草稿链接），包内只保留树内相对链接
  # dev 临时文件排除口径（与 .gitignore P3 对齐）：*.bak-*/*.pre-*/*.orig + 元数据
  rsync -a --safe-links --exclude node_modules --exclude .git --exclude '*.map' --exclude dist \
        --exclude 'preview-*.html' --exclude archive \
        --exclude staging --exclude backup \
        --exclude '.DS_Store' --exclude '*.bak-*' --exclude '*.pre-*' --exclude '*.orig*' \
        --exclude '.git.disabled' --exclude coverage --exclude output \
        "$DSH_VENDOR/$d/" "$STAGEP/profile/vendor/$d/" 2>/dev/null \
    || cp -R "$DSH_VENDOR/$d" "$STAGEP/profile/vendor/$d/"
done
# 兜底清理（rsync fallback 到 cp -R 时无排除能力；终态保证 vendor 无 dev 临时文件/中间产物）
find "$STAGEP/profile/vendor" \( -name '.DS_Store' -o -name '*.bak-*' -o -name '*.pre-*' -o -name '*.orig*' \) -delete 2>/dev/null || true
find "$STAGEP/profile/vendor" -maxdepth 2 \( -name '.git.disabled' -o -name coverage -o -name staging -o -name backup \) -type d -exec rm -rf {} + 2>/dev/null || true

# profile 自身 vendor（2026-09-11：vendor 本地化后 package.json 直接以 file:./vendor/<name> 引用，
# 不在上面的 Magpie-Horch 根路径提取范围内，必须从 profile 自带 vendor/ 同步进暂存区）
profile_vendor_dirs="$(node -e "
const p=require(process.argv[1]);
console.log(Object.entries(p.dependencies||{})
  .filter(([,v])=>typeof v==='string'&&v.startsWith('file:./vendor/'))
  .map(([,v])=>v.slice('file:./vendor/'.length).replace(/\/+$/,'')).join(' '))" "$PROFILE/package.json")"
for d in $profile_vendor_dirs; do
  [ -d "$PROFILE/vendor/$d" ] || { echo "[assemble] 缺少 profile vendor 源: $PROFILE/vendor/$d"; exit 1; }
  rsync -a --safe-links --exclude node_modules --exclude .git --exclude '*.map' --exclude dist \
        --exclude 'preview-*.html' --exclude archive \
        --exclude staging --exclude backup \
        --exclude '.DS_Store' --exclude '*.bak-*' --exclude '*.pre-*' --exclude '*.orig*' --exclude '*.lute-bak' \
        --exclude coverage --exclude output \
        "$PROFILE/vendor/$d/" "$STAGEP/profile/vendor/$d/" 2>/dev/null \
    || cp -R "$PROFILE/vendor/$d" "$STAGEP/profile/vendor/$d/"
done

# overrides（profile node_modules 里的 -override 副本，随包以防目标机版本漂移）
for o in dsh-llm dsh-tool-subagent dsh-file-reference-local; do
  src="$PROFILE/node_modules/@deepseek-ai/$o"
  [ -d "$src" ] && rsync -a --exclude node_modules --exclude '*.orig*' --exclude '*.bak-*' --exclude '*.pre-*' "$src/" "$STAGEP/profile/overrides/$o/" 2>/dev/null
done

# file: 路径重写（包内自洽，决策 D4）→ 在暂存副本上执行，不触碰本机 profile
node "$PKG_ROOT/scripts/rewrite-file-deps.mjs" "$STAGEP/profile"

# cordis.patch.yml 内构建机绝对路径 → 占位（安装时按目标机 $HOME 替换；
# 内嵌兜底路径由 main.js P0-7 首启 hook 按真实 DSH home 替换）。
#
# 两个前缀都要替换，因为它们是**两个不同的**机器路径，只补第一个会漏：
#   · $DSH_HOME_DIR  = <home>/.dsh          → __DSH_HOME__（profile 数据根）
#   · $LUTE_PROJECT_ROOT = <home>/project   → __LUTE_PROJECT_ROOT__（项目根；
#     实测 `ui-newapp-local.productRoots` 写着 `/Users/lute/project`，
#     assemble 原先只替换第一个 → 该路径原样随包发出，客户机上指不到东西）
sed -i '' "s|$DSH_HOME_DIR|__DSH_HOME__|g" "$STAGEP/profile/cordis.patch.yml"
LUTE_PROJECT_ROOT="${LUTE_PROJECT_ROOT:-$HOME/project}"
if [ "$LUTE_PROJECT_ROOT" != "$DSH_HOME_DIR" ]; then
  sed -i '' "s|$LUTE_PROJECT_ROOT|__LUTE_PROJECT_ROOT__|g" "$STAGEP/profile/cordis.patch.yml"
fi
say "路径占位替换完成（__DSH_HOME__ / __LUTE_PROJECT_ROOT__）"

# ── 2b. R2b 双落位：同源 profile 注入 app 内嵌 dsh-profile（首启兜底）──────────
say "2b/6 同源注入内嵌 dsh-profile（首启兜底）"
BUNDLED="$APP_STAGE/DSH Desktop.app/Contents/Resources/dsh-profile/profiles/desktop"
mkdir -p "$BUNDLED"
# 与 profile.tar.gz 完全同源：同一份 staging 内容 + 同一份离线 node_modules
# 2.0.5 布局：内嵌副本按目标机 profile 布局嵌套（profiles/desktop/），
# 与 main.js P0-7v2 首启兜底拷贝路径（dsh-profile/profiles/<name>）对齐。
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

# 出货面「构建机绝对路径」守卫（只减不增，基线 packaging/machine-path-baseline.json）。
# 为什么放在这里：$BUNDLED ≡ profile.tar.gz 的内容（同一份暂存 + 同一份离线 node_modules），
# 且此刻尚未签名——机器路径漏出去的代价是客户机上静默指不到东西，历史上已发生三次
# （KOL-Hunter 依赖、productRoots、插件脚本写死 /Users/lute）。基线缺失即失败，不静默通过。
say "机器路径守卫（构建机 home 不得新增命中）…"
node "$PKG_ROOT/scripts/scan-machine-paths.mjs" \
  --root "$BUNDLED" --baseline "$PKG_ROOT/machine-path-baseline.json" \
  || { echo "[assemble] 出货面出现新的构建机绝对路径，中止（见上）；修法见脚本头部。"; exit 1; }

# adhoc 深签名（决策 D2；内容已改写 + 注入 dsh-profile，原签名失效，打包前重签）
say "adhoc 深签名（含内嵌 dsh-profile）…"
codesign --force --deep --sign - "$APP_STAGE/DSH Desktop.app"
bash "$PKG_ROOT/scripts/verify-app-signature.sh" "$APP_STAGE/DSH Desktop.app" "签名后立即自验" || exit 1
say "app adhoc 深签名完成"

# 归档前的第二次断言：签名与 tar 之间若有任何写入，seal 会失效且无声。
# 实测（2026-09-11）：签名后追加一个字节 → codesign 退出码 1；此前该位置无断言，
# 被改坏的 app 会被静默打进 payload。守卫详情见 scripts/verify-app-signature.sh 头部。
say "压缩 app（gzip -1）…"
bash "$PKG_ROOT/scripts/verify-app-signature.sh" "$APP_STAGE/DSH Desktop.app" "归档前" || exit 1
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
say "3/6 暂存技能 + 预设（技能面按「被引用 + 无受限许可」现算收敛）"
SP="$STAGE/.sp"; mkdir -p "$SP/skills" "$SP/presets"
# 决策 K5/K6：不再整份拷贝 ~/.dsh/skills（实测 1611 个目录 / 66M，其中 989 个 p2s 语料无人引用，
# 并含 PolyForm 非商用的 lieflat-charts）。选择在打包时现算（preset 组合 + 仓库映射 → 被引用集，
# 再减受限许可名单），不存第二份清单（ADR-0009）。明细与理由见 scripts/select-skills.mjs。
DSH_HOME="$DSH_HOME_DIR" node "$PKG_ROOT/scripts/select-skills.mjs" --copy "$SP/skills"
[ -d "$DSH_HOME_DIR/.agent-presets" ] && cp -R "$DSH_HOME_DIR/.agent-presets/." "$SP/presets/"
# 打包后自检：落位的技能树里不得出现受限许可技能（与上面的选择互为独立判据）
node "$PKG_ROOT/scripts/select-skills.mjs" --check "$SP/skills" \
  || { echo "[assemble] ✗ 出货技能面含受限许可技能，中止（见上）"; exit 1; }
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
# v1（verify-patches.sh）2026-09-11 已退役（exit 2），不再随包——随包只会让客户跑到
# 「本脚本已退役」这句话，看起来像失败。唯一权威是 verify-patches-v2.sh（下一行）。
cp "$PKG_ROOT/verify-patches-v2.sh" "$PAYLOAD/tools/" 2>/dev/null || true
cp "$DSH_VENDOR/dsh-patches/brand-replay.sh" "$PAYLOAD/tools/" 2>/dev/null || true
cp "$DSH_VENDOR/dsh-patches/brand-payload-wordmark.txt" "$PAYLOAD/tools/" 2>/dev/null || true
# patches-manifest*.md 不随包（内部登记簿；决策 K10 = 剔除内部取证文档）
# ROOT 品牌图标随包分发（brand-replay --apply 自愈用；真相源 packaging/assets/app-icon.icns）
cp "$PKG_ROOT/assets/app-icon.icns" "$PAYLOAD/tools/app-icon.icns" 2>/dev/null || true
chmod 755 "$PAYLOAD/tools/"*.sh "$PAYLOAD/tools/"*.mjs 2>/dev/null || true

# LUTE Setup.app（GUI 安装器，swiftc 编译；随 payload 根分发）
bash "$PKG_ROOT/scripts/build-setup-app.sh" "$PAYLOAD"

# ── 6. 元数据（README / VERSION / SHA256SUMS / manifest.json）───────────────────
say "6/6 元数据"
BUILD="${BUILD:-$(date +%Y%m%d-%H%M%S)}"
cat > "$PAYLOAD/VERSION" <<EOF
LUTE_VERSION=$VERSION
BUILD=$BUILD
DSH_BASELINE=2.0.5
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
- \`tools/\`：补丁锚点校验（**verify-patches-v2.sh**，36 锚点）、品牌漂移检查（brand-replay.sh）、file: 重写工具、灵枢便携化工具。
- \`SHA256SUMS\`：完整性校验。

## 安装（macOS，完全离线）
**推荐：终端一条命令**（自动处理 Gatekeeper 隔离属性，最可靠）：

\`\`\`bash
cd "/Volumes/DSH Desktop LUTE $VERSION" && bash install.sh
\`\`\`

- 写 /Applications 一步会弹管理员密码框，**其余全程用户态**。
- **切勿用 sudo 运行**：sudo 会污染 ~/.dsh 文件属主，导致后续无法覆盖。
- GUI 方式（备选）：双击 \`LUTE Setup.app\`。若被 Gatekeeper 拦，右键 → 打开 → 弹框点「打开」。
- 启动后：**重新授权 TCC**（系统设置 → 隐私与安全 → 屏幕录制/辅助功能/自动化，授权 LUTE Agentic System）。

## Gatekeeper 说明（未公证包）
本包为 adhoc 签名、未公证，下载分发的 dmg 会带隔离属性。本版安装器
**解包后自动清除**，终端安装不受影响；仅 GUI 双击需要右键打开一次。

## 版本核对
\`\`\`bash
cat VERSION            # LUTE_VERSION + BUILD（构建号，唯一标识本次打包）
shasum -a 256 ../$(basename "$PWD").dmg  # 与发布方给的 SHA256 对照
\`\`\`

## 校验
\`\`\`bash
bash tools/verify-patches-v2.sh    # 2.0.5 锚点（本版 36 锚点，应 ALL VERIFIED）
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
const m={name:'dsh-desktop-lute',version:process.argv[2],build:process.argv[3],dsd_baseline:'2.0.5',arch:'arm64',
  created_at:new Date().toISOString(),
  files:Object.fromEntries(files.map(f=>[f,size(payload+'/'+f)]))};
fs.writeFileSync(payload+'/manifest.json',JSON.stringify(m,null,2)+'\n');" "$PAYLOAD" "$VERSION" "$BUILD"

# 完整性清单：所有 bundle/vendor/skills/presets 的权威列表（供 smoke 逐一比对）
node -e "
const fs=require('fs'),path=require('path');
const p=require(process.argv[1]);
const bundles=(p.dsh?.profile?.bundles||[]).map(b=>typeof b==='string'?b:b.name);
const deps=Object.keys(p.dependencies||{});
const vendorDirs=Object.entries(p.dependencies||{})
  .filter(([,v])=>typeof v==='string'&&(v.startsWith('file:../../../project/Magpie-Horch/')||v.startsWith('file:/Users/lute/project/Magpie-Horch/')||v.startsWith('file:./vendor/')))
  .map(([,v])=>v.startsWith('file:../../../project/Magpie-Horch/')?v.slice('file:../../../project/Magpie-Horch/'.length).replace(/\/+\$/,''):(v.startsWith('file:./vendor/')?v.slice('file:./vendor/'.length).replace(/\/+\$/,''):v.slice('file:/Users/lute/project/Magpie-Horch/'.length).replace(/\/+\$/,'')));
// dsh-patches 不进出货 profile 的 vendor（见上方注释），故 completeness.vendor 也不含它
const allBundles=[...new Set([...bundles,...deps.filter(d=>typeof p.dependencies[d]==='string'&&!p.dependencies[d].startsWith('file:'))])];
const listDir=(d)=>fs.existsSync(d)?fs.readdirSync(d).filter(x=>fs.statSync(path.join(d,x)).isDirectory()).sort():[];
// skills 必须读**出货的那一份**（skills-presets.tar.gz 里的清单），不能读源目录 ~/.dsh/skills：
// 技能面已按 K5/K6 收敛（1611 → 约 539），读源目录会让 smoke 断言一个客户机上根本不存在的清单。
const { execFileSync } = require('node:child_process');
const tarSkills = () => {
  const out = execFileSync('tar', ['-tzf', process.argv[2] + '/skills-presets.tar.gz'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const names = new Set();
  for (const line of out.split('\n')) {
    const m = /^skills\/([^/]+)\/$/.exec(line);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
};
const c={bundles:allBundles.sort(),vendor:[...new Set(vendorDirs)].sort(),
  skills:tarSkills(),presets:listDir(process.argv[3]+'/.agent-presets')};
fs.writeFileSync(process.argv[3]+'/completeness.json',JSON.stringify(c,null,2)+'\n');
console.log('bundles='+c.bundles.length+' vendor='+c.vendor.length+' skills='+c.skills.length+' presets='+c.presets.length);
" "$PROFILE/package.json" "$PAYLOAD" "$DSH_HOME_DIR" "$PAYLOAD"

say "汇编完成：$PAYLOAD"

# ── 7. 出厂冒烟（隔离安装 + 完整性 + 补丁/品牌锚点）─────────────────────────────
# 为什么放在汇编里而不是留给人工：冒烟此前只写在 README 与 SOLUTION 里当"推荐步骤"，
# 而 assemble.sh 与 sign-and-dmg.sh 都不调用它——一个不跑就绿的产物会被直接打成 dmg。
# 隔离式（SMOKE_HOME 默认 /tmp/dsh-smoke，不碰本机 /Applications 与 ~/.dsh），约 5 分钟。
# 跳过只能显式声明：SKIP_SMOKE=1（会大声打印，便于在日志里追责）。
if [ "${SKIP_SMOKE:-0}" = "1" ]; then
  say "⚠ SKIP_SMOKE=1：跳过出厂冒烟（本轮产物未被验证，禁止据此发布）"
else
  say "7/7 出厂冒烟（隔离安装，约 5 分钟）…"
  bash "$PKG_ROOT/scripts/smoke-test.sh" "$PAYLOAD" \
    || { echo "[assemble] ✗ 冒烟未通过——产物不可发布（payload 保留在 $PAYLOAD 供排查）" >&2; exit 1; }
  say "冒烟通过"
fi

( cd "$PAYLOAD" && ls -la )
du -sh "$STAGE"
