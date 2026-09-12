#!/bin/bash
# smoke-test.sh —— LUTE 集成包隔离安装冒烟（不触碰本机 /Applications 与 ~/.dsh）
# 用法: ./smoke-test.sh <payload-dir>
# 环境: SMOKE_HOME（默认 /tmp/dsh-smoke，安装的 DSH_HOME 为其下的 .dsh）
#       SMOKE_APPS（默认 /tmp/dsh-smoke-apps，APP_TARGET 父目录）
# 断言：安装 exit 0、app/profile/aeis/skills 落位、cordis 占位已替换、
#       verify-patches 31 锚点全绿、aeis --check 通过、SHA256SUMS 一致、
#       R2b 双落位一致性、bundle/vendor/skills 逐一存在。
set -uo pipefail
PAYLOAD="${1:?用法: ./smoke-test.sh <payload-dir>}"
PAYLOAD="$(cd "$PAYLOAD" && pwd)"
SMOKE_HOME="${SMOKE_HOME:-/tmp/dsh-smoke}"
SMOKE_APPS="${SMOKE_APPS:-/tmp/dsh-smoke-apps}"
DSH_HOME_SMOKE="$SMOKE_HOME/.dsh"
APP_TARGET="$SMOKE_APPS/DSH Desktop.app"
fail=0
pass(){ echo "[smoke:ok] $*"; }
bad(){ echo "[smoke:FAIL] $*"; fail=1; }
assert(){ # name expected actual
  if [ "$2" = "$3" ]; then pass "$1"; else bad "$1: expected=$2 actual=$3"; fi
}

rm -rf "$SMOKE_HOME" "$SMOKE_APPS"
mkdir -p "$SMOKE_HOME" "$SMOKE_APPS"

# 0. 载荷完整性
( cd "$PAYLOAD" && shasum -a 256 -c SHA256SUMS ) || bad "SHA256SUMS 校验"
CJ="$PAYLOAD/completeness.json"

# 0b. Gatekeeper 模拟：给 payload 加 quarantine（模拟浏览器下载的 dmg 挂载卷场景）
#     bsdtar 解包会传播 quarantine → install.sh 必须解包后清除，否则
#     Electron/python/noema exec 被 Gatekeeper 拦（Operation not permitted）
QUARANTINE="0081;1788863500;Safari;00000000-0000-0000-0000-000000000000"
for f in "DSH Desktop.app.tar.gz" profile.tar.gz skills-presets.tar.gz aeis-portable.tar.gz; do
  xattr -w com.apple.quarantine "$QUARANTINE" "$PAYLOAD/$f" 2>/dev/null || true
done
cleanup_qa(){ for f in "DSH Desktop.app.tar.gz" profile.tar.gz skills-presets.tar.gz aeis-portable.tar.gz; do
  xattr -d com.apple.quarantine "$PAYLOAD/$f" 2>/dev/null || true; done; }
trap cleanup_qa EXIT
pass "payload 已模拟 quarantine（下载 dmg 场景）"

# 1. 安装（APP_TARGET 在 /tmp → 走免提权直写路径）
DSH_HOME="$DSH_HOME_SMOKE" APP_TARGET="$APP_TARGET" bash "$PAYLOAD/install.sh" > "$SMOKE_HOME/install.log" 2>&1
assert "install.sh exit 0" 0 "$?"
tail -5 "$SMOKE_HOME/install.log"

# 2. app
assert "app 存在" yes "$([ -d "$APP_TARGET" ] && echo yes)"
assert "app-update.yml 已禁用" yes "$([ -s "$APP_TARGET/Contents/Resources/app-update.yml" ] && grep -q '禁用' "$APP_TARGET/Contents/Resources/app-update.yml" && echo yes)"
assert "Electron 二进制存在" yes "$([ -x "$APP_TARGET/Contents/MacOS/DSH Desktop" ] && echo yes)"
codesign --verify --deep --strict "$APP_TARGET" >/dev/null 2>&1
assert "app adhoc 签名有效（解包后）" 0 "$?"
assert "CFBundleVersion 带 lute 后缀" 1 "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_TARGET/Contents/Info.plist" | grep -c 'lute\.' || true)"

# 2b. quarantine 清除断言（Gatekeeper 防拦：install.sh 解包后必须清除隔离属性）
QA_APP="$(xattr -p com.apple.quarantine "$APP_TARGET/Contents/MacOS/DSH Desktop" 2>/dev/null || true)"
assert "app Electron 无 quarantine 残留" "" "$QA_APP"
QA_PY="$(xattr -p com.apple.quarantine "$DSH_HOME_SMOKE/aeis-venv/bin/python3" 2>/dev/null || true)"
assert "aeis python 无 quarantine 残留" "" "$QA_PY"

# 3. profile
P="$DSH_HOME_SMOKE/profiles/desktop"
# 内嵌副本路径（5c 与这里的占位判据都要用，故在此先定义一次；
# set -u 下「用了才定义」会直接 unbound variable 把冒烟打断，而不是报一条红）
BUNDLED="$APP_TARGET/Contents/Resources/dsh-profile/profiles/desktop"
for f in package.json cordis.patch.yml apply-patches.mjs; do
  assert "profile/$f 存在" yes "$([ -f "$P/$f" ] && echo yes)"
done
assert "node_modules 落位" yes "$([ -d "$P/node_modules/@deepseek-ai" ] && echo yes)"
# vendor 路径不写死包名：归组（ADR-0011）后是 vendor/packages/<group>/<pkg>，扁平时代写死的
# "vendor/dsh-theme-local" 在新布局下必然假红（正确产物被判失败）。这里只断言"落位且非空"，
# 逐条比对交给下面的 completeness.vendor 循环（它读清单、与布局无关）。
assert "vendor 落位（非空）" yes "$([ -n "$(find "$P/vendor" -maxdepth 4 -name package.json -print -quit 2>/dev/null)" ] && echo yes)"
assert "overrides 落位" yes "$([ -d "$P/overrides/dsh-file-reference-local" ] && echo yes)"
NOEMA_BIN="$P/node_modules/@zseven-w/dsh-noema-darwin-arm64/bin/noema-mcp"
assert "noema darwin-arm64 二进制落位" yes "$([ -x "$NOEMA_BIN" ] && echo yes)"
assert "noema 二进制架构 arm64" yes "$(file "$NOEMA_BIN" | grep -q 'arm64' && echo yes)"
QA_NOEMA="$(xattr -p com.apple.quarantine "$NOEMA_BIN" 2>/dev/null || true)"
assert "noema 无 quarantine 残留" "" "$QA_NOEMA"
assert "vendor 无树外符号链接" 0 "$(find "$P/vendor" -type l -exec sh -c 'case "$(readlink "$1")" in /*) echo 1;; esac' _ {} \; 2>/dev/null | grep -c 1 || true)"
assert "cordis.patch.yml 无未替换占位符" 0 "$(grep -cE '__[A-Z_]+__' "$P/cordis.patch.yml" || true)"
# 占位替换的**活契约**：装完之后，出货时留的占位必须已经变成目标机的值。
# 这条替换了原先的「python 指向冒烟 aeis」——那条断言的是 dsh-memory 记忆行里的
# `python: __DSH_HOME__/aeis-venv/bin/python`，而 dsh-memory 自 2026-09-07 起就不在
# profile 依赖与 bundles 里（2.0.1 载荷里那行是**陈旧配置**），断言它等于守一个不存在的形态。
# 现在的契约按「出货副本里有没有这个占位」条件化：有就必须替换到位，没有就不许凭空出现。
if grep -q '__LUTE_PROJECT_ROOT__' "$BUNDLED/cordis.patch.yml" 2>/dev/null; then
  assert "安装后 productRoots 已替换为目标机项目根" 1 "$(grep -c "$HOME/project" "$P/cordis.patch.yml" || true)"
fi
# 出货投影的后置校验（ADR-0056）：profile 的 file: 依赖必须**全部**指向 ./vendor/。
# 任何别的 file: 目标都是「本机装配」漏进了包——客户机上那种路径不存在。
assert "profile 无外部 file: 依赖（本机装配未漏进包）" 0 \
  "$(node -e 'const p=require(process.argv[1]);const bad=Object.entries(p.dependencies||{}).filter(([,v])=>typeof v==="string"&&v.startsWith("file:")&&!v.startsWith("file:./vendor/"));console.log(bad.length)' "$P/package.json" || echo ERR)"
FILE_COUNT="$(grep -c 'file:./vendor/' "$P/package.json" || true)"
FILE_EXPECT="$(node -e "const c=JSON.parse(require('fs').readFileSync(process.argv[1]));console.log(c.vendor.length-1)" "$CJ" 2>/dev/null)"
assert "file: 依赖指向 ./vendor/（=vendor 数-1）" "$FILE_EXPECT" "$FILE_COUNT"

# 4. 灵枢
assert "aeis-venv 落位" yes "$([ -x "$DSH_HOME_SMOKE/aeis-venv/bin/python3" ] && echo yes)"
bash "$PAYLOAD/tools/reloc-aeis.sh" --check "$DSH_HOME_SMOKE/aeis-venv" >/dev/null 2>&1
assert "aeis --check 通过" 0 "$?"

# 5. 技能/预设
assert "skills 落位" yes "$([ -d "$DSH_HOME_SMOKE/skills" ] && echo yes)"
assert "presets 落位" yes "$([ -d "$DSH_HOME_SMOKE/.agent-presets" ] && echo yes)"

# 5b. 完整性清单比对（每个插件/组件/skill 逐一存在）
assert "completeness.json 存在" yes "$([ -f "$CJ" ] && echo yes)"
node -e "
const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1]));
const prof=process.argv[2]+'/node_modules';
const app=process.argv[3]+'/Contents/Resources/app.asar.unpacked/node_modules';
let miss=[];
for(const b of c.bundles){
  if(!fs.existsSync(prof+'/'+b)&&!fs.existsSync(app+'/'+b))miss.push(b);}
if(miss.length){console.error('MISSING BUNDLES:',miss.join(', '));process.exit(1);}
console.log('bundles all present: '+c.bundles.length);" "$CJ" "$P" "$APP_TARGET" > "$SMOKE_HOME/bundles.log" 2>&1
assert "全部 bundle 逐一存在" 0 "$?"
cat "$SMOKE_HOME/bundles.log"
node -e "
const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1]));
const vd=process.argv[2]+'/vendor';let miss=[];
for(const v of c.vendor){if(!fs.statSync(vd+'/'+v).isDirectory())miss.push(v);}
if(miss.length){console.error('MISSING VENDOR:',miss.join(', '));process.exit(1);}
console.log('vendor all present: '+c.vendor.length);" "$CJ" "$P" > "$SMOKE_HOME/vendor.log" 2>&1
assert "全部 vendor 逐一存在" 0 "$?"
cat "$SMOKE_HOME/vendor.log"
node -e "
const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1]));
const sd=process.argv[2]+'/skills',pd=process.argv[2]+'/.agent-presets';
const list=d=>fs.existsSync(d)?fs.readdirSync(d).filter(x=>fs.statSync(d+'/'+x).isDirectory()).sort():[];
const missS=c.skills.filter(s=>!list(sd).includes(s));
const missP=c.presets.filter(p=>!list(pd).includes(p));
if(missS.length||missP.length){console.error('MISSING skills:',missS.join(', '),'presets:',missP.join(', '));process.exit(1);}
console.log('skills all present: '+c.skills.length+', presets all present: '+c.presets.length);" "$CJ" "$DSH_HOME_SMOKE" > "$SMOKE_HOME/sp.log" 2>&1
assert "skills/presets 清单比对" 0 "$?"
cat "$SMOKE_HOME/sp.log"

# 5c. R2b 双落位一致性：内嵌 dsh-profile ≡ 安装后 profile
# 2.0.5 布局：内嵌副本按 profiles/desktop 嵌套（与 P0-7v2 首启拷贝路径对齐）
# （BUNDLED 见 §3 顶部定义）
assert "内嵌 dsh-profile 存在" yes "$([ -d "$BUNDLED" ] && echo yes)"
assert "内嵌 node_modules 落位" yes "$([ -d "$BUNDLED/node_modules/@deepseek-ai" ] && echo yes)"
assert "内嵌 vendor 落位（非空）" yes "$([ -n "$(find "$BUNDLED/vendor" -maxdepth 4 -name package.json -print -quit 2>/dev/null)" ] && echo yes)"
# 除 cordis.patch.yml（内嵌保留占位、安装后已替换）与 node_modules（单独断言存在性）外应完全一致
diff -rq --exclude node_modules --exclude cordis.patch.yml "$BUNDLED" "$P" > "$SMOKE_HOME/diff.log" 2>&1
assert "内嵌 ≡ 安装后 profile" 0 "$?"
# 内嵌副本的两条判据（替换原先的「保留 __DSH_HOME__ 占位」）：
#   ① 不许含构建机绝对路径——内嵌副本会在**客户机首启**时被物化成 profile，
#      里面任何 /Users/lute/... 都会在客户机上静默指不到东西（本判据与 assemble 的
#      machine-path 守卫是两道独立的网：那道按基线只减不增，这道对 cordis 配置零容忍）；
#   ② 待替换占位必须在——那是首启替换机制的前提（没有占位就没有东西可替换，
#      而「没有占位」与「占位被提前替换掉了」在只看结果时不可区分，所以要正面断言）。
assert "内嵌 cordis 无构建机绝对路径" 0 "$(grep -c '/Users/' "$BUNDLED/cordis.patch.yml" || true)"
assert "内嵌 cordis 保留待替换占位" 1 "$(grep -cE '__[A-Z_]+__' "$BUNDLED/cordis.patch.yml" || true)"

# 6. 补丁锚点（env 指向冒烟路径）
if [ -f "$PAYLOAD/tools/verify-patches-v2.sh" ]; then
  DSH_APP="$APP_TARGET" bash "$PAYLOAD/tools/verify-patches-v2.sh" > "$SMOKE_HOME/verify.log" 2>&1
  assert "verify-patches-v2 ALL VERIFIED" 0 "$?"
else
  DSH_APP="$APP_TARGET" DSH_HOME="$DSH_HOME_SMOKE" bash "$PAYLOAD/tools/verify-patches.sh" > "$SMOKE_HOME/verify.log" 2>&1
  assert "verify-patches ALL PATCHES VERIFIED" 0 "$?"
fi
grep -c '^\[ok\]' "$SMOKE_HOME/verify.log" | xargs -I{} echo "  锚点通过数: {}"

# 7. 品牌锚点
DSH_APP="$APP_TARGET" bash "$PAYLOAD/tools/brand-replay.sh" --check > "$SMOKE_HOME/brand.log" 2>&1
assert "brand-replay BRAND ALL VERIFIED" 0 "$?"

echo
[ "$fail" = 0 ] && echo "SMOKE PASSED" || echo "SMOKE FAILED"
exit $fail
