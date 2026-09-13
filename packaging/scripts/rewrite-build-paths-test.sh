#!/bin/bash
# rewrite-build-paths-test.sh —— 「出货副本里的构建机路径必须换成占位符」这条判据的反向自测（ADR-0073）
#
# 为什么存在：实测出货的 `skills-presets.tar.gz` 里有 103 个文件写着构建机的绝对路径
# （100 个 `agt-*` 的材料出处 `/Users/lute/project/AI组织变革`、`bobo-cto` 的私有项目根、
# `lute-cordis` 的 profile 路径），另有 13 个随包技能文档引用构建机目录。
# 改写器是修法；本测试证明它**改得动**、**改不完会喊**、**重复跑不会改坏**。
#
# 全程沙箱 + 可控 BUILD_HOME：不依赖也不触碰本机真实 home 下的任何文件。
#
# 用法: bash packaging/scripts/rewrite-build-paths-test.sh
# 退出码: 0 = 全部通过；1 = 有断言失败
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/rewrite-build-paths.mjs"
[ -f "$SRC" ] || { echo "找不到待测脚本: $SRC" >&2; exit 1; }

PASS=0
FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/rewrite-paths-test.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT
export BUILD_HOME="/Users/fixtureuser"   # 判据的 needle 由此变量决定，测试用它把家目录换成假的

run(){ # [script] → stdout+exit
  node "${1:-$SRC}" --root "$SANDBOX/tree" 2>&1
}

# ── R1 已知形态全部改写掉 ───────────────────────────────────────────────────
rm -rf "$SANDBOX/tree"; mkdir -p "$SANDBOX/tree/presets/agt-001" "$SANDBOX/tree/skills/x"
cat > "$SANDBOX/tree/presets/agt-001/agent.cordis.yml" <<'EOF'
以下是你作为该岗位分身的完整定义，**逐字保留**自材料（源文件 /Users/fixtureuser/project/AI组织变革/05-agents/roles/AGT-001.md；sha256 abc）。
根目录 /Users/fixtureuser/project/AI组织变革。
EOF
cat > "$SANDBOX/tree/skills/x/SKILL.md" <<'EOF'
| 安装位置 | `/Users/fixtureuser/.dsh/skills/x/` |
- 本机 pnpm：`/Users/fixtureuser/Library/Application Support/DSH Desktop/runtime-commands/bin/pnpm`
- 样例：/Users/fixtureuser/Desktop/skill-翻译/a.json
- 交付：/Users/fixtureuser/project/Magpie-Horch/dsh-chatui-fix/
EOF
out="$(run)"; rc=$?
if [ "$rc" = "0" ] \
  && grep -q '__LUTE_MATERIAL_ROOT__/05-agents/roles/AGT-001.md' "$SANDBOX/tree/presets/agt-001/agent.cordis.yml" \
  && grep -q '__DSH_HOME__/skills/x/' "$SANDBOX/tree/skills/x/SKILL.md" \
  && grep -q '__DSH_APP_SUPPORT__/runtime-commands/bin/pnpm' "$SANDBOX/tree/skills/x/SKILL.md" \
  && grep -q '__BUILD_DESKTOP__/skill-翻译/a.json' "$SANDBOX/tree/skills/x/SKILL.md" \
  && grep -q '__LUTE_REPO__/dsh-chatui-fix/' "$SANDBOX/tree/skills/x/SKILL.md" \
  && ! grep -rq "$BUILD_HOME" "$SANDBOX/tree"; then
  ok "R1 五类已知前缀全部换成占位符（含带空格的 Application Support 路径）"
else
  no "R1 改写不完整（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── R2 未登记的形态 → 响亮失败并点名（新形态该由人决定，不由脚本猜） ────────
printf '见 /Users/fixtureuser/其它目录/未登记.md\n' > "$SANDBOX/tree/skills/x/unknown.md"
out="$(run)"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$out" | grep -q 'unknown.md'; then
  ok "R2 未登记形态 → 判红且点名文件"
else
  no "R2 未登记形态必须判红并点名（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi
rm -f "$SANDBOX/tree/skills/x/unknown.md"

# ── R3 幂等：第二次跑不该再改（占位符里不含构建机 home） ───────────────────
out="$(run)"; rc=$?
if [ "$rc" = "0" ] && printf '%s' "$out" | grep -q '改写 0 个文件 / 0 处'; then
  ok "R3 幂等：重复运行 0 改写"
else
  no "R3 重复运行应为 0 改写（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── R4 二进制不误伤、也不误报（与守卫同一把尺：grep -I 跳过二进制） ─────────
printf 'PK\000/Users/fixtureuser/project/AI组织变革\000\001' > "$SANDBOX/tree/skills/x/blob.bin"
out="$(run)"; rc=$?
if [ "$rc" = "0" ] && [ -f "$SANDBOX/tree/skills/x/blob.bin" ] && printf '%s' "$out" | grep -q '改写 0 个文件'; then
  ok "R4 二进制文件既不改写也不判红"
else
  no "R4 二进制处理不对（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi
rm -f "$SANDBOX/tree/skills/x/blob.bin"

# ── P1 入口判定：脚本从沙箱副本里跑也必须真的改写 ────────────────────────────
# 回归钉：`import.meta.url` 是 realpath、`process.argv[1]` 保留传入形式，macOS 的
# `$TMPDIR` 走 /var → /private/var，字符串比较会判成「被 import」→ main 不执行、
# **静默退出 0**——一处都不改，装配却报成功。
cp "$SRC" "$SANDBOX/copy.mjs"
rm -rf "$SANDBOX/tree"; mkdir -p "$SANDBOX/tree/presets"
printf '源文件 /Users/fixtureuser/project/AI组织变革/05-agents/roles/AGT-001.md\n' > "$SANDBOX/tree/presets/a.yml"
out="$(run "$SANDBOX/copy.mjs")"; rc=$?
if [ "$rc" = "0" ] && grep -q '__LUTE_MATERIAL_ROOT__' "$SANDBOX/tree/presets/a.yml"; then
  ok "P1 沙箱副本（符号链接路径）里仍真的改写"
else
  no "P1 沙箱副本静默不改写（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── M1 恒真桩突变：抹掉一条映射，R1 必须失效 ─────────────────────────────────
# 证明 R1 钉的是「映射表真的生效」，不是「脚本跑完就绿」。
MUT="$SANDBOX/mutant.mjs"
node -e '
const fs=require("fs");const src=process.argv[1],dst=process.argv[2];
let t=fs.readFileSync(src,"utf8");
const before=t;
t=t.replace(/^\s*\[\x27\/project\/AI组织变革\x27, \x27__LUTE_MATERIAL_ROOT__\x27\],\s*$/m, "");
if(t===before){console.error("突变未生效：找不到 AI组织变革 那条映射");process.exit(3)}
fs.writeFileSync(dst,t);
' "$SRC" "$MUT" || no "M1 突变注入失败（映射表形状变了？）"
if [ -f "$MUT" ]; then
  rm -rf "$SANDBOX/tree"; mkdir -p "$SANDBOX/tree/presets"
  printf '源文件 /Users/fixtureuser/project/AI组织变革/05-agents/roles/AGT-001.md\n' > "$SANDBOX/tree/presets/a.yml"
  out="$(run "$MUT")"; rc=$?
  if [ "$rc" != "0" ]; then
    ok "M1 抹掉一条映射后 R1 形态判红 → R1 确实钉住映射表生效"
  else
    no "M1 抹掉映射后仍判绿（rc=${rc}）——R1 没钉住映射表"
    printf '%s\n' "$out" | sed 's/^/       /'
  fi
fi

echo
echo "[rewrite-build-paths-test] 通过 ${PASS}，失败 $FAIL"
[ "$FAIL" = "0" ] || exit 1
