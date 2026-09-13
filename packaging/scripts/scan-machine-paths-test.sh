#!/bin/bash
# scan-machine-paths-test.sh —— 「守卫能看见 payload tarball 里面」这条判据的反向自测（ADR-0073）
#
# 为什么存在：payload 里的 tarball 是二进制，`grep` 一律跳过，于是「解到客户机上才算数」的那部分
# 出货面对守卫是**全盲**的。2026-09-13 实测这一盲点：守卫在 app 内嵌 profile 上报
# `✓ 无新增（当前 37 条，基线 39 条）`，而同一版出货的 `skills-presets.tar.gz` 解开再扫是
# **103 个文件**含构建机路径。仪器全绿而面在漏（P-02），所以本测试用合成的坏 tarball 逐条
# 断言守卫确实会说「不」，并用恒真桩突变证明这些断言钉的是解包扫描本身。
#
# 用法: bash packaging/scripts/scan-machine-paths-test.sh
# 退出码: 0 = 全部通过；1 = 有断言失败
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/scan-machine-paths.mjs"
[ -f "$SRC" ] || { echo "找不到待测脚本: $SRC" >&2; exit 1; }

PASS=0
FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/machine-paths-test.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT
export BUILD_HOME="/Users/fixtureuser"
printf '{ "note": "自测夹具", "needle": "%s", "entries": [] }\n' "$BUILD_HOME" > "$SANDBOX/baseline.json"

run(){ # [script] <tarball> → stdout+exit
  node "${1:-$SRC}" --tarball "$2" --baseline "$SANDBOX/baseline.json" 2>&1
}

# ── T1 坏 tarball（文本成员含构建机路径）必须被看见 ──────────────────────────
rm -rf "$SANDBOX/pack"; mkdir -p "$SANDBOX/pack/presets/agt-001"
printf '源文件 /Users/fixtureuser/project/AI组织变革/05-agents/roles/AGT-001.md\n' \
  > "$SANDBOX/pack/presets/agt-001/agent.cordis.yml"
tar -czf "$SANDBOX/dirty.tar.gz" -C "$SANDBOX/pack" presets
out="$(run "" "$SANDBOX/dirty.tar.gz")"; rc=$?
if [ "$rc" = "1" ] && printf '%s' "$out" | grep -q 'dirty.tar.gz!presets/agt-001/agent.cordis.yml'; then
  ok "T1 tarball 内的命中被看见且带 tarball 名前缀"
else
  no "T1 坏 tarball 必须判红并点名（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── T2 干净 tarball → 绿（判据不能只会红） ──────────────────────────────────
rm -rf "$SANDBOX/pack"; mkdir -p "$SANDBOX/pack/presets/agt-001"
printf '源文件 __LUTE_MATERIAL_ROOT__/05-agents/roles/AGT-001.md\n' \
  > "$SANDBOX/pack/presets/agt-001/agent.cordis.yml"
tar -czf "$SANDBOX/clean.tar.gz" -C "$SANDBOX/pack" presets
out="$(run "" "$SANDBOX/clean.tar.gz")"; rc=$?
if [ "$rc" = "0" ]; then
  ok "T2 改写后的 tarball 判绿"
else
  no "T2 干净 tarball 应判绿（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── T3 二进制成员里的同名字节不算命中（与 --root 面同一把尺：grep -I） ──────
rm -rf "$SANDBOX/pack"; mkdir -p "$SANDBOX/pack/presets"
printf 'PK\000/Users/fixtureuser/project/AI组织变革\000\001' > "$SANDBOX/pack/presets/blob.bin"
tar -czf "$SANDBOX/binary.tar.gz" -C "$SANDBOX/pack" presets
out="$(run "" "$SANDBOX/binary.tar.gz")"; rc=$?
if [ "$rc" = "0" ]; then
  ok "T3 二进制成员不误报"
else
  no "T3 二进制成员不该判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── T4 tarball 不存在 → 响亮失败，不许静默当作「没命中」 ────────────────────
out="$(run "" "$SANDBOX/not-here.tar.gz")"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q '不存在'; then
  ok "T4 缺失的 tarball → 判失败且说清原因"
else
  no "T4 缺失的 tarball 必须响亮失败（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── M1 恒真桩突变：让解包扫描恒返回「没命中」，T1 必须失效 ──────────────────
# 证明 T1 钉的是「真的解开看了」，不是「守卫跑完就绿」。
MUT="$SANDBOX/mutant.mjs"
node -e '
const fs=require("fs");const src=process.argv[1],dst=process.argv[2];
let t=fs.readFileSync(src,"utf8");
const before=t;
t=t.replace(/    const label = abs\.split\(.\/.\)\.pop\(\)\n    return scanRoot\(tmp, needle\)\.map\(\(rel\) => `\$\{label\}!\$\{rel\}`\)/,
            "    return []");
if(t===before){console.error("突变未生效：找不到 scanTarball 的返回处");process.exit(3)}
fs.writeFileSync(dst,t);
' "$SRC" "$MUT" || no "M1 突变注入失败（scanTarball 形状变了？）"
if [ -f "$MUT" ]; then
  out="$(run "$MUT" "$SANDBOX/dirty.tar.gz")"; rc=$?
  if [ "$rc" = "0" ]; then
    ok "M1 解包扫描被桩掉后 T1 失效 → T1 确实钉住了解包扫描"
  else
    no "M1 桩掉解包后仍判红（rc=${rc}）——T1 可能被别的检查顺带拦住"
    printf '%s\n' "$out" | sed 's/^/       /'
  fi
fi

echo
echo "[scan-machine-paths-test] 通过 ${PASS}，失败 $FAIL"
[ "$FAIL" = "0" ] || exit 1
