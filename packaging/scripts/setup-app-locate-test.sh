#!/bin/bash
# setup-app-locate-test.sh —— 「LUTE Setup.app 能不能找到安装载荷」这条判据的自测。
#
# 为什么需要它：2026-09-13 线上反馈「点开安装器报：未找到 install.sh（请从完整安装包
# 运行本程序）」。原因不是打包坏了，而是原实现只有**一条**定位路径——bundle 的上级目录，
# 且要求 install.sh 带可执行位。而 macOS 的 App Translocation（Gatekeeper 路径随机化）
# 会在用户从**挂载的 dmg 里**双击时，只把 app 本体复制进随机只读镜像再启动，同级目录
# 于是没有载荷；可执行位在转存途中丢失也会被同一条判据拒掉，尽管脚本是用 /bin/bash
# 执行的、根本不需要 x 位。三种原因共用一句「未找到」，谁也无从下手。
#
# 本自测用 `--print-payload-root`（无界面诊断模式）驱动真实二进制，造出这些布局：
#   T1 同级正常           → 选中同级
#   T2 translocation 布局 → 从搜索根里找到（线上缺陷的回归）
#   T2b 同布局但搜索根为空 → 必须失败（证明 T2 是搜索找到的，不是恒真）
#   T3 载荷在、但 install.sh 没有 x 位 → 仍必须选中（旧实现在这里拒绝）
#   T4 两份载荷（2.3.1 / 2.3.2）→ 按版本匹配选 2.3.2
#   T5 无候选 → 退出码 3 且打印读数
#   T6 残缺载荷（只有 install.sh）→ 不算完整包，退出码 3
#
# 反向对照即 T2b/T5/T6：若把定位器换成「永远返回同一个目录」的桩，这三条会红。
#
# 用法: bash packaging/scripts/setup-app-locate-test.sh [--keep]
set -uo pipefail

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"          # packaging/
SWIFT_SRC="$SRC_DIR/installer/LUTE-Setup.swift"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

FAIL=0
pass(){ printf '  ✓ %s\n' "$1"; }
fail(){ printf '  ✗ %s\n' "$1"; FAIL=$((FAIL+1)); }

[ -f "$SWIFT_SRC" ] || { echo "找不到 $SWIFT_SRC" >&2; exit 2; }
command -v swiftc >/dev/null 2>&1 || {
  echo "✗ 缺少 swiftc——本项无法验证。安装 Xcode 命令行工具：xcode-select --install" >&2
  exit 2
}

# /tmp 在 macOS 上是到 /private/tmp 的符号链接：程序报告的是解析后的真实路径，
# 期望值必须用同一把尺子（pwd -P），否则每条断言都会「因为前缀不同」而假红。
TMP="$(cd "$(mktemp -d /tmp/lute-setup-locate.XXXXXX)" && pwd -P)"
cleanup(){ [ "$KEEP" = "1" ] || rm -rf "$TMP"; }
trap cleanup EXIT

echo "[locate-test] 编译 LUTE-Setup.swift（不签名——本项验的是定位逻辑，不是签名面）"
swiftc -O -o "$TMP/LUTE Setup" "$SWIFT_SRC" || { echo "✗ 编译失败" >&2; exit 2; }

APP_VERSION="2.3.2"

# make_bundle <目录> <bundle 名> —— 造一个最小但结构正确的 app bundle（含 Info.plist，
# Bundle.main 靠 Contents/Info.plist 认定自己是 bundle）。
make_bundle(){
  local dir="$1" name="$2"
  local macos="$dir/$name.app/Contents/MacOS"
  mkdir -p "$macos"
  cp "$TMP/LUTE Setup" "$macos/LUTE Setup"
  cat > "$dir/$name.app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$name</string>
  <key>CFBundleIdentifier</key><string>ai.lute.dsh.setup</string>
  <key>CFBundleExecutable</key><string>LUTE Setup</string>
  <key>CFBundleVersion</key><string>2.0.5-lute.$APP_VERSION</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
EOF
}

# make_payload <目录> <版本> [install.sh 权限] —— 造一份最小完整载荷（指纹 = install.sh + tar.gz）
make_payload(){
  local dir="$1" ver="$2" mode="${3:-755}"
  mkdir -p "$dir"
  printf '#!/bin/bash\necho "[stub] payload %s"\n' "$ver" > "$dir/install.sh"
  chmod "$mode" "$dir/install.sh"
  : > "$dir/DSH Desktop.app.tar.gz"
  printf 'LUTE_VERSION=%s\nBUILD=test\n' "$ver" > "$dir/VERSION"
}

# run_case <bundle 路径> <搜索根> → stdout 写 $OUT，退出码写 $RC
run_case(){
  OUT="$(LUTE_SETUP_SEARCH_ROOTS="$2" "$1/Contents/MacOS/LUTE Setup" --print-payload-root 2>&1)"
  RC=$?
}

chosen_line(){ printf '%s\n' "$OUT" | sed -n 's/^chosen=//p' | head -1; }

echo
echo "T1 同级目录有完整载荷 → 应选中同级"
make_bundle "$TMP/t1" "LUTE Setup"
make_payload "$TMP/t1" "2.3.2"
mkdir -p "$TMP/t1-empty"
run_case "$TMP/t1/LUTE Setup.app" "$TMP/t1-empty"
if [ "$RC" = "0" ] && [ "$(chosen_line)" = "$TMP/t1" ]; then pass "选中 $TMP/t1"
else fail "期望选中 $TMP/t1（rc= ${RC}）；实际：$(chosen_line)"; fi

echo
echo "T2 App Translocation 布局（app 被单独放进随机目录）→ 应从挂载卷搜索到载荷"
mkdir -p "$TMP/t2/AppTranslocation/SIM/d"
make_bundle "$TMP/t2/AppTranslocation/SIM/d" "LUTE Setup"
make_payload "$TMP/t2/vol/DSH Desktop LUTE 2.3.2" "2.3.2"
run_case "$TMP/t2/AppTranslocation/SIM/d/LUTE Setup.app" "$TMP/t2/vol"
if [ "$RC" = "0" ] && [ "$(chosen_line)" = "$TMP/t2/vol/DSH Desktop LUTE 2.3.2" ]; then
  pass "从 /Volumes 形态的搜索根找到载荷"
else fail "期望选中搜索根里的载荷（rc= ${RC}）；实际：$(chosen_line)"; fi
printf '%s\n' "$OUT" | grep -q "AppTranslocation）：是" \
  && pass "诊断行如实报告「被随机重定位」" || fail "诊断行没有报告 AppTranslocation"

echo
echo "T2b 同一布局但搜索根为空 → 必须失败（否则 T2 就是恒真）"
mkdir -p "$TMP/t2-empty"
run_case "$TMP/t2/AppTranslocation/SIM/d/LUTE Setup.app" "$TMP/t2-empty"
if [ "$RC" = "3" ] && [ -z "$(chosen_line)" ]; then pass "如预期失败（rc=3）"
else fail "期望失败 rc=3；实际 rc=$RC chosen=$(chosen_line)"; fi

echo
echo "T3 install.sh 存在但没有 x 位 → 仍应选中（脚本是用 /bin/bash 跑的）"
mkdir -p "$TMP/t3"
make_bundle "$TMP/t3" "LUTE Setup"
make_payload "$TMP/t3/载荷 2.3.2" "2.3.2" 644
[ -x "$TMP/t3/载荷 2.3.2/install.sh" ] && fail "构造有误：install.sh 竟然有 x 位"
run_case "$TMP/t3/LUTE Setup.app" "$TMP/t3"
if [ "$RC" = "0" ] && [ "$(chosen_line)" = "$TMP/t3/载荷 2.3.2" ]; then pass "无 x 位也被采用"
else fail "期望采用无 x 位的载荷（rc= ${RC}）；实际：$(chosen_line)"; fi

echo
echo "T4 两份载荷（2.3.1 / 2.3.2）→ 应选与本程序版本一致的 2.3.2"
mkdir -p "$TMP/t4"
make_bundle "$TMP/t4" "LUTE Setup"
make_payload "$TMP/t4/旧 2.3.1" "2.3.1"
make_payload "$TMP/t4/新 2.3.2" "2.3.2"
run_case "$TMP/t4/LUTE Setup.app" "$TMP/t4"
if [ "$RC" = "0" ] && [ "$(chosen_line)" = "$TMP/t4/新 2.3.2" ]; then pass "按版本匹配选中 2.3.2"
else fail "期望选中新 2.3.2（rc= ${RC}）；实际：$(chosen_line)"; fi

echo
echo "T5 一个候选都没有 → 退出码 3，并打印读数"
mkdir -p "$TMP/t5"
make_bundle "$TMP/t5" "LUTE Setup"
run_case "$TMP/t5/LUTE Setup.app" "$TMP/t5-empty"
if [ "$RC" = "3" ]; then pass "退出码 3"; else fail "期望 rc=3；实际 rc=$RC"; fi
printf '%s\n' "$OUT" | grep -q "可用安装包：无" && pass "打印了「可用安装包：无」" || fail "没有打印失败读数"
printf '%s\n' "$OUT" | grep -q "搜索过的目录" && pass "打印了搜索过的目录" || fail "没有打印搜索面"
printf '%s\n' "$OUT" | grep -q "$TMP/t5/LUTE Setup.app" && pass "打印了自身 bundle 路径" || fail "没有打印自身路径"

echo
echo "T6 残缺载荷（只有 install.sh，没有 app.tar.gz）→ 不算完整包"
mkdir -p "$TMP/t6/半份载荷" "$TMP/t6"
make_bundle "$TMP/t6" "LUTE Setup"
printf '#!/bin/bash\n' > "$TMP/t6/半份载荷/install.sh"
chmod 755 "$TMP/t6/半份载荷/install.sh"
run_case "$TMP/t6/LUTE Setup.app" "$TMP/t6"
if [ "$RC" = "3" ] && [ -z "$(chosen_line)" ]; then pass "残缺载荷被拒"
else fail "期望拒绝残缺载荷（rc= ${RC}）；实际：$(chosen_line)"; fi

echo
if [ "$FAIL" = "0" ]; then
  echo "SETUP LOCATE TEST PASSED"
  [ "$KEEP" = "1" ] && echo "（临时目录保留：${TMP}）"
  exit 0
fi
echo "SETUP LOCATE TEST FAILED（$FAIL 项）" >&2
[ "$KEEP" = "1" ] && echo "（临时目录保留：${TMP}）" >&2
exit 1
