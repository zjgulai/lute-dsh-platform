#!/bin/bash
# select-presets-test.sh —— 「出货预设白名单」这条判据的反向自测（ADR-0073）
#
# 为什么存在：2026-09-13 实测，装配脚本的整目录 `cp -R ~/.dsh/.agent-presets/. → $SP/presets/`
# 把本机自有的机器人助理智能体预设 `bobo-cto` 静默发进了 2.3.0~2.3.3 的 payload
# （出货 completeness.json 的 presets = 52 条含它）。修法是把「谁有资格出货」写进白名单并让
# 未登记目录**响亮失败**。一条判据如果没人证明过它**会说「不」**，它就只是纸面上的，
# 所以本测试把「该红」的形态逐条喂给它，并用恒真桩突变证明这些断言钉的是判据本身。
#
# 用法: bash packaging/scripts/select-presets-test.sh
# 退出码: 0 = 全部通过；1 = 有断言失败
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/select-presets.mjs"
[ -f "$SRC" ] || { echo "找不到待测脚本: $SRC" >&2; exit 1; }

PASS=0
FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/select-presets-test.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT

# 造一个假的本机预设根：每个预设目录都要有 agent.cordis.yml（脚本据此判定「这是个预设」）
make_fixture(){
  rm -rf "$SANDBOX/from" "$SANDBOX/into"
  mkdir -p "$SANDBOX/from" "$SANDBOX/into"
  for n in "$@"; do
    mkdir -p "$SANDBOX/from/$n"
    printf 'plugins: []\n' > "$SANDBOX/from/$n/agent.cordis.yml"
  done
}
write_config(){ # <pattern> <expect> <allow-json> [exclude-json]
  cat > "$SANDBOX/config.json" <<JSON
{ "note": "自测夹具", "pattern": "$1", "expectPatternCount": $2, "allow": $3, "exclude": ${4:-[]} }
JSON
}
run(){ # [script-path] → stdout+exit
  node "${1:-$SRC}" --from "$SANDBOX/from" --into "$SANDBOX/into" --config "$SANDBOX/config.json" 2>&1
}

# ── S1 正常面：岗位预设 + 登记项都出货 ──────────────────────────────────────
make_fixture agt-001 agt-002 agt-003 lute-cordis
write_config '^agt-\\d{3}$' 3 '[{"name":"lute-cordis","why":"ADR-0024：产品默认预设"}]'
out="$(run)"; rc=$?
shipped="$(ls "$SANDBOX/into" 2>/dev/null | sort | tr '\n' ' ')"
if [ "$rc" = "0" ] && [ "$shipped" = "agt-001 agt-002 agt-003 lute-cordis " ]; then
  ok "S1 3 个岗位 + 1 个登记预设全部出货"
else
  no "S1 应出货 4 个目录（rc=$rc shipped=${shipped:-无}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S2 回归钉：本机多出的、未登记的预设目录必须中止（这就是 bobo-cto 那一次的形态）──
make_fixture agt-001 agt-002 agt-003 lute-cordis bobo-cto
out="$(run)"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q 'bobo-cto'; then
  ok "S2 未登记目录 bobo-cto → 中止且点名"
else
  no "S2 未登记的 bobo-cto 必须让装配中止并点名（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi
if [ -e "$SANDBOX/into/bobo-cto" ]; then
  no "S2 判红时不得把未登记目录落进出货面"
else
  ok "S2 判红时不落盘任何未登记目录"
fi

# ── S3 登记了但本机没有 → 登记与实际不符，同样是谎话 ────────────────────────
make_fixture agt-001 agt-002 agt-003
out="$(run)"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q 'lute-cordis'; then
  ok "S3 登记项在本机不存在 → 中止且点名"
else
  no "S3 登记的 lute-cordis 不存在必须中止（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S4 岗位数量不符 → 少发一个岗位同样是静默事故 ────────────────────────────
make_fixture agt-001 agt-002 agt-003 lute-cordis
write_config '^agt-\\d{3}$' 4 '[{"name":"lute-cordis","why":"ADR-0024：产品默认预设"}]'
out="$(run)"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q '数量不符'; then
  ok "S4 岗位数量不符 → 中止"
else
  no "S4 岗位数量不符必须中止（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S5 登记项不写理由 → 拒绝（名单会腐烂成谎话） ────────────────────────────
make_fixture agt-001 agt-002 agt-003 lute-cordis
write_config '^agt-\\d{3}$' 3 '[{"name":"lute-cordis"}]'
out="$(run)"; rc=$?
if [ "$rc" = "2" ] && printf '%s' "$out" | grep -q 'why'; then
  ok "S5 登记项缺 why → 配置判坏（rc=2）"
else
  no "S5 缺 why 的登记项必须被拒（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S6 第三态：本机确有、已评审「不发」→ 出货面不含它，且装配照常跑得起来 ──────
# 这是第一次真跑暴露出来的缺口：只有「准入 / 未登记即中止」两态时，判据在**正确配置**下
# 把重切 2.3.3 整个拦住（本机就该留着 bobo-cto）。让流水线可跑的唯一正当办法不是
# 「把本机资产搬走」，而是把「已决定不发」也写成一次可评审的表态。
make_fixture agt-001 agt-002 agt-003 lute-cordis bobo-cto
write_config '^agt-\\d{3}$' 3 '[{"name":"lute-cordis","why":"ADR-0024：产品默认预设"}]' \
  '[{"name":"bobo-cto","why":"本机自有，用户明确不参与打包"}]'
out="$(run)"; rc=$?
shipped="$(ls "$SANDBOX/into" 2>/dev/null | sort | tr '\n' ' ')"
if [ "$rc" = "0" ] && [ "$shipped" = "agt-001 agt-002 agt-003 lute-cordis " ] \
  && printf '%s' "$out" | grep -q '明确不发.*bobo-cto'; then
  ok "S6 已登记的 exclude 不发、装配照常（且逐个点名「本机保留、明确不发」）"
else
  no "S6 exclude 语义不对（rc=${rc} shipped=${shipped:-无}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S7 exclude 登记在本机已不存在 → 只告警，不拦发布 ────────────────────────
# 这一档的失效方向是安全的（少一条「不发」的声明不会让任何东西被发出去），
# 为一次本机清理弄红整条流水线不值得；但它必须**说出来**，否则名单会烂在原地。
make_fixture agt-001 agt-002 agt-003 lute-cordis
write_config '^agt-\\d{3}$' 3 '[{"name":"lute-cordis","why":"ADR-0024：产品默认预设"}]' \
  '[{"name":"bobo-cto","why":"本机自有，用户明确不参与打包"}]'
out="$(run)"; rc=$?
if [ "$rc" = "0" ] && printf '%s' "$out" | grep -q '名单过期'; then
  ok "S7 过期的 exclude 登记 → 告警但不判红"
else
  no "S7 过期的 exclude 应告警且不判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S8 同一个名字同时进 allow 与 exclude → 配置判坏 ─────────────────────────
make_fixture agt-001 agt-002 agt-003 lute-cordis bobo-cto
write_config '^agt-\\d{3}$' 3 \
  '[{"name":"bobo-cto","why":"发"},{"name":"lute-cordis","why":"ADR-0024"}]' \
  '[{"name":"bobo-cto","why":"不发"}]'
out="$(run)"; rc=$?
if [ "$rc" = "2" ] && printf '%s' "$out" | grep -q '相反结论'; then
  ok "S8 allow/exclude 同名冲突 → 配置判坏（rc=2）"
else
  no "S8 同名冲突必须被拒（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── P1 入口判定：脚本从沙箱副本里跑也必须真的干活 ────────────────────────────
# 回归钉：`import.meta.url` 是 realpath、`process.argv[1]` 保留传入形式，macOS 的
# `$TMPDIR` 走 /var → /private/var，字符串比较会判成「被 import」→ main 不执行、
# **静默退出 0**——一个预设都不挑，装配却报成功。本用例把脚本复制到沙箱再跑。
cp "$SRC" "$SANDBOX/copy.mjs"
make_fixture agt-001 agt-002 agt-003 lute-cordis
write_config '^agt-\\d{3}$' 3 '[{"name":"lute-cordis","why":"ADR-0024：产品默认预设"}]'
out="$(run "$SANDBOX/copy.mjs")"; rc=$?
shipped="$(ls "$SANDBOX/into" 2>/dev/null | sort | tr '\n' ' ')"
if [ "$rc" = "0" ] && [ "$shipped" = "agt-001 agt-002 agt-003 lute-cordis " ]; then
  ok "P1 沙箱副本（符号链接路径）里仍真的落盘出货面"
else
  no "P1 沙箱副本静默不干活（rc=${rc} shipped=${shipped:-无}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── M1 恒真桩突变：把「未登记」判据改成恒空，S2 必须失效 ────────────────────
# 这一条是自测自己的判据：如果 S2 在突变下照样绿，说明 S2 钉的不是那个判据（比如被别的
# 检查顺带拦住了），那它就不是一条有效的回归钉。
MUT="$SANDBOX/mutant.mjs"
node -e '
const fs=require("fs");const src=process.argv[1],dst=process.argv[2];
let t=fs.readFileSync(src,"utf8");
const before=t;
// 把「有未登记目录就报错」这条判据本身桩掉（恒假），看 S2 是否随之失效。
t=t.replace(/if \(verdict\.unregistered\.length > 0\) \{/, "if (false) {");
if(t===before){console.error("突变未生效：找不到 unregistered 判据的使用处");process.exit(3)}
fs.writeFileSync(dst,t);
' "$SRC" "$MUT" || no "M1 突变注入失败（判据形状变了？）"
if [ -f "$MUT" ]; then
  make_fixture agt-001 agt-002 agt-003 lute-cordis bobo-cto
  out="$(run "$MUT")"; rc=$?
  if [ "$rc" = "0" ]; then
    ok "M1 恒真桩突变下 S2 失效 → S2 确实钉住了「未登记即中止」这条判据"
  else
    no "M1 突变后仍判红（rc=${rc}）——S2 可能被别的检查顺带拦住，钉的判据不明"
    printf '%s\n' "$out" | sed 's/^/       /'
  fi
fi

echo
echo "[select-presets-test] 通过 ${PASS}，失败 $FAIL"
[ "$FAIL" = "0" ] || exit 1
