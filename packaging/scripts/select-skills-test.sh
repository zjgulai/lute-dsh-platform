#!/bin/bash
# select-skills-test.sh —— 「技能出货面 = 引用集 ∪ 产品级白名单 − 受限许可」这条判据的反向自测（ADR-0074）
#
# 为什么存在：2026-09-13 实测，把本机自有的机器人助理智能体预设 `bobo-cto` 排除出出货面
# （ADR-0073）之后，它引用的 **15 个工程技能一并掉出（349 → 334）**——它们从来没有被产品
# 显式要过，只是被顺带引用；而同族的工程工艺技能（tdd / to-spec / to-tickets / write-spec /
# prototype / research）本来就在出货面里，于是产品拿到的是「一半工艺层」。
# 修法是加一份**产品级白名单**（`packaging/shipped-skills.json`），并让这份名单自己也有牙：
# 名字不存在、与受限许可同名、缺 why、文件缺失——四种腐烂形态都要被判否。
# 一条判据如果没人证明过它**会说「不」**，它就只是纸面上的，所以本测试把「该红」的形态逐条
# 喂给它，并用恒真桩突变证明这些断言钉的是判据本身。
#
# 用法: bash packaging/scripts/select-skills-test.sh
# 退出码: 0 = 全部通过；1 = 有断言失败
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/select-skills.mjs"
[ -f "$SRC" ] || { echo "找不到待测脚本: $SRC" >&2; exit 1; }

PASS=0
FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/select-skills-test.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT

# 夹具技能名一律用 `zzfx-` 前缀：仓库侧映射文件（skill-map.json 等）里不会有它们，
# 于是「被引用集」只由本测试自己造的 preset 决定，判据可复现。
# 唯一例外是 `lieflat-charts`——它在本仓库的受限许可名单里，用它来跑真判据。
make_skills(){ # <技能名>…
  rm -rf "$SANDBOX/skills" "$SANDBOX/into"
  mkdir -p "$SANDBOX/skills" "$SANDBOX/into"
  for n in "$@"; do
    mkdir -p "$SANDBOX/skills/$n"
    printf -- '---\nname: %s\ndescription: 自测夹具\n---\n' "$n" > "$SANDBOX/skills/$n/SKILL.md"
  done
}
make_preset(){ # <预设名> <引用技能>…
  local name="$1"; shift
  rm -rf "$SANDBOX/presets"; mkdir -p "$SANDBOX/presets/$name"
  node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({skills: process.argv.slice(2)}))' \
    "$SANDBOX/presets/$name/manifest.json" "$@"
}
write_allow(){ printf '{ "note": "自测夹具", "allow": %s }\n' "$1" > "$SANDBOX/allow.json"; }
run(){ # [script-path] [参数…]
  local script="${1:-$SRC}"; shift
  PRESET_ROOT="$SANDBOX/presets" SKILLS_ROOT="$SANDBOX/skills" \
  AGENTS_SKILLS="$SANDBOX/no-such-agents-root" DSH_HOME="$SANDBOX/no-such-dsh-home" \
  node "$script" --config "$SANDBOX/allow.json" "$@" 2>&1
}
shipped(){ ls "$SANDBOX/into" 2>/dev/null | sort | tr '\n' ' '; }

# ── S1 正常面：被引用的 + 白名单救回的出货；未引用且未登记的剔除 ──────────────
make_skills zzfx-ref-a zzfx-ref-b zzfx-free zzfx-dead
make_preset agt-001 zzfx-ref-a zzfx-ref-b
write_allow '[{"name":"zzfx-free","why":"产品表态：工程工艺层不拆半"}]'
out="$(run "$SRC" --copy "$SANDBOX/into")"; rc=$?
if [ "$rc" = "0" ] && [ "$(shipped)" = "zzfx-free zzfx-ref-a zzfx-ref-b " ]; then
  ok "S1 被引用 2 个 + 白名单救回 1 个 = 出货 3 个；未引用未登记的 zzfx-dead 被剔除"
else
  no "S1 出货面不对（rc=$rc shipped=$(shipped)）"; printf '%s\n' "$out" | sed 's/^/       /'
fi
out="$(run "$SRC" --report)"; rc=$?
if printf '%s' "$out" | grep -q '救回未被引用 1'; then
  ok "S1 报告写明白名单救回了几条（这个是产品表态的读数）"
else
  no "S1 报告未给出「救回未被引用」读数"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S2 白名单登记了但本机没有 → 名单在说谎，中止并点名 ──────────────────────
make_skills zzfx-ref-a zzfx-ref-b
make_preset agt-001 zzfx-ref-a
write_allow '[{"name":"zzfx-gone","why":"产品表态"}]'
out="$(run "$SRC" --copy "$SANDBOX/into")"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q 'zzfx-gone'; then
  ok "S2 白名单名字在本机不存在 → 中止且点名"
else
  no "S2 不存在的登记名必须中止（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi
if [ -e "$SANDBOX/into/zzfx-ref-a" ]; then
  no "S2 判否时不得落盘半个出货面"
else
  ok "S2 判否时不落盘（先判后拷）"
fi

# ── S3 白名单与受限许可同名 → 同一件事两个相反结论，中止 ─────────────────────
make_skills zzfx-ref-a lieflat-charts
make_preset agt-001 zzfx-ref-a
write_allow '[{"name":"lieflat-charts","why":"产品说要发"}]'
out="$(run "$SRC" --copy "$SANDBOX/into")"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q '同名冲突'; then
  ok "S3 与受限许可同名 → 中止（要求发 vs 禁止发 不许并存）"
else
  no "S3 与受限许可同名必须中止（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S4 白名单条目不写理由 → 配置判坏（名单会腐烂成谎话） ────────────────────
make_skills zzfx-ref-a
make_preset agt-001 zzfx-ref-a
write_allow '[{"name":"zzfx-ref-a"}]'
out="$(run "$SRC" --report)"; rc=$?
if [ "$rc" = "2" ] && printf '%s' "$out" | grep -q 'why'; then
  ok "S4 条目缺 why → 配置判坏（rc=2）"
else
  no "S4 缺 why 的条目必须被拒（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S5 白名单文件本身缺失 → 判坏，不许当成「空名单」继续 ────────────────────
# 这是这份名单最容易静默失效的形态：按空名单跑 = 15 个技能无声少发，而装配照报成功。
make_skills zzfx-ref-a
make_preset agt-001 zzfx-ref-a
mv "$SANDBOX/allow.json" "$SANDBOX/allow.json.hidden"
out="$(run "$SRC" --report)"; rc=$?
mv "$SANDBOX/allow.json.hidden" "$SANDBOX/allow.json"
if [ "$rc" = "2" ] && printf '%s' "$out" | grep -q '不存在'; then
  ok "S5 白名单文件缺失 → 判坏（rc=2），不静默按空名单继续"
else
  no "S5 缺文件必须判坏（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S6 落位树比选择结果少一个 → 「静默少发」必须被看见 ──────────────────────
make_skills zzfx-ref-a zzfx-ref-b zzfx-free
make_preset agt-001 zzfx-ref-a zzfx-ref-b
write_allow '[{"name":"zzfx-free","why":"产品表态"}]'
run "$SRC" --copy "$SANDBOX/into" >/dev/null 2>&1
rm -rf "$SANDBOX/into/zzfx-free"
out="$(run "$SRC" --check "$SANDBOX/into")"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q '静默少发'; then
  ok "S6 选择说发 3 个、树里只有 2 个 → 判否并点名「静默少发」"
else
  no "S6 少发必须判否（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S7 落位树多出选择结果以外的东西 → 同样判否 ──────────────────────────────
make_skills zzfx-ref-a zzfx-ref-b zzfx-free
make_preset agt-001 zzfx-ref-a zzfx-ref-b
write_allow '[{"name":"zzfx-free","why":"产品表态"}]'
run "$SRC" --copy "$SANDBOX/into" >/dev/null 2>&1
mkdir -p "$SANDBOX/into/zzfx-stowaway"
printf -- '---\nname: zzfx-stowaway\n---\n' > "$SANDBOX/into/zzfx-stowaway/SKILL.md"
out="$(run "$SRC" --check "$SANDBOX/into")"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q 'zzfx-stowaway'; then
  ok "S7 树里多出选择结果以外的技能 → 判否且点名"
else
  no "S7 多出未登记的技能必须判否（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S8 落位树里混进受限许可技能 → 判否（这条与选择判据互为独立检查） ────────
make_skills zzfx-ref-a
make_preset agt-001 zzfx-ref-a
write_allow '[]'
run "$SRC" --copy "$SANDBOX/into" >/dev/null 2>&1
mkdir -p "$SANDBOX/into/lieflat-charts"
printf -- '---\nname: lieflat-charts\n---\n' > "$SANDBOX/into/lieflat-charts/SKILL.md"
out="$(run "$SRC" --check "$SANDBOX/into")"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q '受限许可'; then
  ok "S8 落位树含受限许可技能 → 判否"
else
  no "S8 受限许可必须判否（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S9 白名单与引用图重叠 → 冗余但合法，照常出货且提示可复核 ────────────────
make_skills zzfx-ref-a zzfx-ref-b
make_preset agt-001 zzfx-ref-a
write_allow '[{"name":"zzfx-ref-a","why":"产品表态"}]'
out="$(run "$SRC" --copy "$SANDBOX/into")"; rc=$?
if [ "$rc" = "0" ] && [ "$(shipped)" = "zzfx-ref-a " ] && printf '%s' "$out" | grep -q '冗余'; then
  ok "S9 冗余条目照常出货，但要打印出来（否则名单会烂在原地）"
else
  no "S9 冗余条目处理不对（rc=$rc shipped=$(shipped)）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── P1 入口判定：脚本从沙箱副本里跑也必须真的干活 ────────────────────────────
# 回归钉：`import.meta.url` 是 realpath、`process.argv[1]` 保留传入形式，macOS 的
# `$TMPDIR` 走 /var → /private/var，字符串比较会判成「被 import」→ main 不执行、
# **静默退出 0**——一个技能都不挑，装配却报成功。
cp "$SRC" "$SANDBOX/copy.mjs"
make_skills zzfx-ref-a zzfx-ref-b zzfx-free
make_preset agt-001 zzfx-ref-a zzfx-ref-b
write_allow '[{"name":"zzfx-free","why":"产品表态"}]'
out="$(run "$SANDBOX/copy.mjs" --copy "$SANDBOX/into")"; rc=$?
if [ "$rc" = "0" ] && [ "$(shipped)" = "zzfx-free zzfx-ref-a zzfx-ref-b " ]; then
  ok "P1 沙箱副本（符号链接路径）里仍真的落盘出货面"
else
  no "P1 沙箱副本静默不干活（rc=$rc shipped=$(shipped)）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── M1 恒真桩突变：把「白名单参与选择」抹掉，S1 必须失效 ────────────────────
# 这一条是自测自己的判据：如果 S1 在突变下照样绿，说明 S1 钉的不是这条判据
# （比如被「被引用集」顺带满足了），那它就不是一条有效的回归钉。
MUT="$SANDBOX/mutant.mjs"
node -e '
const fs=require("fs");const src=process.argv[1],dst=process.argv[2];
let t=fs.readFileSync(src,"utf8");
const before=t;
// 把「白名单能救回未被引用的技能」这条判据本身桩掉（恒假），看 S1 是否随之失效。
t=t.replace("(refs.has(s) || allowNames.includes(s))", "(refs.has(s))");
if(t===before){console.error("突变未生效：找不到白名单参与选择的表达式");process.exit(3)}
fs.writeFileSync(dst,t);
' "$SRC" "$MUT" || no "M1 突变注入失败（判据形状变了？）"
if [ -f "$MUT" ]; then
  make_skills zzfx-ref-a zzfx-ref-b zzfx-free zzfx-dead
  make_preset agt-001 zzfx-ref-a zzfx-ref-b
  write_allow '[{"name":"zzfx-free","why":"产品表态"}]'
  out="$(run "$MUT" --copy "$SANDBOX/into")"; rc=$?
  if [ "$rc" = "0" ] && [ "$(shipped)" = "zzfx-ref-a zzfx-ref-b " ]; then
    ok "M1 恒真桩突变下 S1 失效（只剩 2 个）→ S1 确实钉住了「白名单参与选择」这条判据"
  else
    no "M1 突变后出货面仍含 zzfx-free（rc=$rc shipped=$(shipped)）——S1 钉的判据不明"
    printf '%s\n' "$out" | sed 's/^/       /'
  fi
fi

echo
echo "[select-skills-test] 通过 ${PASS}，失败 $FAIL"
[ "$FAIL" = "0" ] || exit 1
