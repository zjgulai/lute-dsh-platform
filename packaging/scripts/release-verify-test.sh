#!/bin/bash
# release-verify-test.sh —— 「已发布产物不许被删、也不许只剩半截」这条判据的反向自测
#
# 为什么存在：`release-verify.sh` 是 `pnpm run gate` 的 `release-artifacts-intact` 判据的唯一
# 实现。一条判据如果没人证明过它**会说「不」**，它就只是纸面上的（ADR-0057 的教训：靠人记得不是
# 工程解）。本测试用合成的沙箱产物，逐条把「该红」的形态喂给它，断言它确实红。
#
# 覆盖两个事故形态：
#   ① 「清单在、字节没了」——2.3.1 整体丢失；2.3.2 在丢失演练里被搬走过一次（字节由归档原样
#      救回，哈希逐位相同）；
#   ② 「字节在、清单没了」——2026-09-13 15:19 那次演练里的 `release-restore.sh 2.3.2`：目标目录
#      整目录改名留档成 `*.replaced-*`，却只把 dmg 拷回来，`SHA256SUMS`/`VERSION`/`manifest.json`
#      留在留档目录里，`packaging/release/2.3.2/` 从此「有字节、没清单」而**无人报错**。
#      本测试的 R1 就是钉住修复：清单必须随 dmg 一起回到目标目录。
#
# 全程沙箱：两个待测脚本都由 `dirname "$0"` 推 PKG_ROOT/REPO_ROOT，所以把脚本复制进临时目录后，
# 它们的 release/ 与归档都落在沙箱里——本测试**永不触碰**仓库里 packaging/release/ 下的真实产物
# 与 `~/Library/Application Support/LUTE/releases/`。
#
# 用法: bash packaging/scripts/release-verify-test.sh
# 退出码: 0 = 全部通过；1 = 有断言失败
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PKG_ROOT="$(cd "$HERE/.." && pwd)"
SRC_VERIFY="$PKG_ROOT/scripts/release-verify.sh"
SRC_RESTORE="$PKG_ROOT/scripts/release-restore.sh"

PASS=0
FAIL=0
ok(){   PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){   FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

[ -f "$SRC_VERIFY" ]  || { echo "找不到待测脚本: $SRC_VERIFY" >&2; exit 1; }
[ -f "$SRC_RESTORE" ] || { echo "找不到待测脚本: $SRC_RESTORE" >&2; exit 1; }

SANDBOX="$(mktemp -d -t lute-release-verify)"
cleanup(){
  # 待测脚本会给产物加 uchg，先解锁再删，否则沙箱删不干净。
  [ -n "$SANDBOX" ] && { chflags -R nouchg "$SANDBOX" 2>/dev/null || true; rm -rf "$SANDBOX"; }
}
trap cleanup EXIT

mkdir -p "$SANDBOX/pkg/scripts" "$SANDBOX/release" "$SANDBOX/archive" "$SANDBOX/src"
cp "$SRC_VERIFY"  "$SANDBOX/pkg/scripts/release-verify.sh"
cp "$SRC_RESTORE" "$SANDBOX/pkg/scripts/release-restore.sh"
echo "沙箱: $SANDBOX"

V="9.9.9"
DMG="DSH-Desktop-LUTE-${V}-mac-arm64.dmg"

dmg_path(){ printf '%s/pkg/release/%s/%s' "$SANDBOX" "$1" "$DMG"; }
src_path(){ printf '%s/src/%s' "$SANDBOX" "$DMG"; }

# 入库清单（git 里那份，ADR-0058 的「承诺过什么」）——从沙箱里的 dmg 现算，保证对得上。
write_manifest(){
  local sha
  sha="$(shasum -a 256 "$(dmg_path "$V")" | awk '{print $1}')"
  { printf '# version=%s\n# build=b1\n' "$V"
    printf '%s  %s\n' "$sha" "$DMG"; } > "$SANDBOX/release/${V}.sha256"
}

fresh(){  # 重置沙箱状态（每例都从干净开始）
  # 待测脚本落位后会加 uchg；上一例留下的锁必须先解，否则 rm 静默失败、状态泄漏到下一例
  # （本测试第一次跑时 R2/R3 就是这样「假通过」的：上一例的产物还锁在原地没删掉）。
  chflags -R nouchg "$SANDBOX" 2>/dev/null || true
  rm -rf "$SANDBOX/pkg/release" "$SANDBOX/archive" "$SANDBOX/src"
  mkdir -p "$SANDBOX/pkg/release" "$SANDBOX/archive" "$SANDBOX/src"
  rm -f "$SANDBOX"/release/*.sha256
  # 宣告台账也要清：V7/V8 会植入 `.lost`，漏清就会泄漏到后续用例（同上一条锁的教训）。
  rm -f "$SANDBOX"/release/*.lost
}

seed(){   # seed —— 造一份「完整且已通过终验」的产物集合 + 入库清单
  mkdir -p "$SANDBOX/pkg/release/$V"
  printf 'payload-%s\n' "$V" > "$(dmg_path "$V")"
  write_manifest
  local sha
  sha="$(shasum -a 256 "$(dmg_path "$V")" | awk '{print $1}')"
  printf '%s  %s\n' "$sha" "$DMG" > "$SANDBOX/pkg/release/$V/SHA256SUMS"
  printf 'LUTE_VERSION=%s\nBUILD=b1\n' "$V" > "$SANDBOX/pkg/release/$V/VERSION"
  printf '{"version":"%s","build":"b1"}\n' "$V" > "$SANDBOX/pkg/release/$V/manifest.json"
}

verify(){ LUTE_RELEASES_ARCHIVE="$SANDBOX/archive" bash "$SANDBOX/pkg/scripts/release-verify.sh" 2>&1; }
restore(){ LUTE_RELEASES_ARCHIVE="$SANDBOX/archive" bash "$SANDBOX/pkg/scripts/release-restore.sh" "$@" 2>&1; }

replaced_count(){ ls -d "$SANDBOX"/pkg/release/*.replaced-* 2>/dev/null | wc -l | tr -d ' '; }

# ── V1 完整集合 → 绿 ─────────────────────────────────────────────────────────
fresh; seed
out="$(verify)"; rc=$?
if [ "$rc" = "0" ] && printf '%s' "$out" | grep -q '清单齐全'; then
  ok "V1 完整产物集合 → rc=0 且报「清单齐全」"
else
  no "V1 完整产物集合应判绿（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── V2 缺 manifest.json → 红（本次新增判据的核心反向测试）─────────────────────
fresh; seed; rm -f "$SANDBOX/pkg/release/$V/manifest.json"
out="$(verify)"; rc=$?
if [ "$rc" = "1" ] && printf '%s' "$out" | grep -q '清单缺: manifest.json'; then
  ok "V2 缺 manifest.json → rc=1 且指名缺件（字节在、清单不全）"
else
  no "V2 缺 manifest.json 必须判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── V3 缺 SHA256SUMS → 红 ───────────────────────────────────────────────────
fresh; seed; rm -f "$SANDBOX/pkg/release/$V/SHA256SUMS"
out="$(verify)"; rc=$?
if [ "$rc" = "1" ] && printf '%s' "$out" | grep -q '清单缺: SHA256SUMS'; then
  ok "V3 缺 SHA256SUMS → rc=1"
else
  no "V3 缺 SHA256SUMS 必须判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── V4 字节没了（2.3.1 的形态）→ 红 ─────────────────────────────────────────
fresh; seed; rm -f "$(dmg_path "$V")"
out="$(verify)"; rc=$?
if [ "$rc" = "1" ] && printf '%s' "$out" | grep -q '字节没了'; then
  ok "V4 清单在、字节没了 → rc=1 且给出找回命令"
else
  no "V4 字节缺失必须判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── V5 哈希不符（被替换/损坏）→ 红 ──────────────────────────────────────────
fresh; seed; printf 'tampered\n' > "$(dmg_path "$V")"
out="$(verify)"; rc=$?
if [ "$rc" = "1" ] && printf '%s' "$out" | grep -q '哈希=不符'; then
  ok "V5 哈希与清单不符 → rc=1"
else
  no "V5 哈希不符必须判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── V6 本机没有该版本 → 绿（新克隆不假红）───────────────────────────────────
fresh; seed; rm -rf "$SANDBOX/pkg/release/$V"
out="$(verify)"; rc=$?
if [ "$rc" = "0" ] && printf '%s' "$out" | grep -q 'SKIP'; then
  ok "V6 版本目录整体不存在 → rc=0 且 SKIP（不假红）"
else
  no "V6 缺席版本应 SKIP 而非判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── V7 已宣告丢失、但字节已在位（豁免过期）→ 红 ─────────────────────────────
# 2026-09-13 的 2.3.1：由飞书副本找回、产物位重新完整并锁定，而 `release/2.3.1.lost` 仍在。
# 当时 verify 对 `.lost` 无条件 `continue`，于是**从不核对该版本的字节**，每次都照旧念
# 「已宣告丢失」——一个可找回的版本被钉成「不可重建」，且今后再丢也不会有人报错。
# 这一例钉住：宣告只在字节确实缺席时才成立，字节回来了就必须撤下宣告。
fresh; seed; : > "$SANDBOX/release/${V}.lost"
out="$(verify)"; rc=$?
if [ "$rc" = "1" ] && printf '%s' "$out" | grep -q '字节已在位'; then
  ok "V7 字节已在位却还留着 .lost → rc=1 且要求撤下宣告"
else
  no "V7 过期豁免必须判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── V8 字节确实缺席 + 已宣告丢失 → 绿 ───────────────────────────────────────
# V7 的反向护栏：真的丢了、也如实宣告了，不该被 V7 误伤成红。两条一起才说明这判据「分得清」。
fresh; seed; rm -f "$(dmg_path "$V")"; : > "$SANDBOX/release/${V}.lost"
out="$(verify)"; rc=$?
if [ "$rc" = "0" ] && printf '%s' "$out" | grep -q '已宣告丢失'; then
  ok "V8 字节确实缺席且已宣告丢失 → rc=0（如实宣告仍被承认）"
else
  no "V8 已宣告的缺席不该判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── R1 找回时清单必须随行（2026-09-13 15:19 的 2.3.2 形态）────────────────────
# 现场：目录里有清单、没有 dmg；正确字节另存一处（模拟归档/外部副本）。
fresh; seed
cp "$(dmg_path "$V")" "$(src_path)"
rm -f "$(dmg_path "$V")"
out="$(restore "$V" --from "$(src_path)")"; rc=$?
miss=""
for f in SHA256SUMS VERSION manifest.json; do
  [ -f "$SANDBOX/pkg/release/$V/$f" ] || miss="$miss $f"
done
if [ "$rc" = "0" ] && [ -f "$(dmg_path "$V")" ] && [ -z "$miss" ] && [ "$(replaced_count)" = "1" ]; then
  ok "R1 找回后就位 dmg 且清单随行（留档目录已生成，清单未滞留）"
else
  no "R1 清单被留档目录带走（rc=$rc 缺失:${miss:-无} 留档数=$(replaced_count)）"
  printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── R2 已就位且哈希一致 → 不重复留档（防「补归档变复制灾难」）────────────────
out="$(restore "$V" --from "$(src_path)")"; rc=$?
if [ "$rc" = "0" ] && [ "$(replaced_count)" = "1" ]; then
  ok "R2 已就位且哈希一致 → 原地保留，不再多留一份 600MB 留档"
else
  no "R2 不该重复留档（rc=$rc 留档数=$(replaced_count)）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── R3 来源哈希不符 → 拒收，且目标目录不被改动 ──────────────────────────────
fresh; seed
cp "$(dmg_path "$V")" "$(src_path)"
rm -f "$(dmg_path "$V")"
before="$(ls "$SANDBOX/pkg/release/$V" | sort | tr '\n' ' ')"
printf 'not-the-published-bytes\n' > "$(src_path)"
out="$(restore "$V" --from "$(src_path)")"; rc=$?
after="$(ls "$SANDBOX/pkg/release/$V" | sort | tr '\n' ' ')"
if [ "$rc" = "4" ] && [ "$before" = "$after" ] && printf '%s' "$out" | grep -q '拒收'; then
  ok "R3 外部副本哈希不符 → rc=4 拒收且不动目标目录"
else
  no "R3 哈希不符必须拒收且不落位（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

echo
echo "[release-verify-test] 通过 ${PASS}，失败 $FAIL"
[ "$FAIL" = "0" ] || exit 1
