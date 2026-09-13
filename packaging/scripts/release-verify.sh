#!/bin/bash
# release-verify.sh —— 「已发布过的版本，产物必须还在」这条判据的唯一实现。
#
# 谁在用它：`scripts/gate.mjs` 的 `release-artifacts-intact`（每次 pnpm run gate 都跑），
# 以及人工排查（`bash packaging/scripts/release-verify.sh`）。
# 为什么要它：发布过的 dmg 已**两次**从 packaging/release/<版本>/ 消失，只剩
# manifest/SHA256SUMS/VERSION——「清单还在、清单描述的字节没了」。清单进了 git，就代表我们
# 承诺过这串字节；承诺与字节分家而无人说话，是这类事故唯一真正的问题。本脚本负责把它说出来。
#
# 判据（对 release/*.sha256 里每一个已发布的版本）：
#   · 版本目录整体不存在            → SKIP（本机从未发布过该版本：新克隆/新机器，不假红）
#   · 版本目录在、但 dmg 不在        → **FAIL**（2026-09-13 的 2.3.1 曾是这个形态，后由飞书副本找回）
#   · dmg 在、哈希与清单不符         → **FAIL**（被替换或损坏）
#   · dmg 在、清单三件缺任何一件      → **FAIL**（字节与清单分家：2026-09-13 15:19 的 2.3.2
#                                      形态——一次丢失演练里 release-restore.sh 把整目录改名
#                                      留档、却只拷回 dmg，清单滞留在 *.replaced-* 而无人报错）
#   · 归档副本（仓库外，uchg 锁定）   → 存在且一致 = OK；缺失不判红（早于归档机制的版本本就没有）
#   · 锁定状态（uchg）               → 只报告，不判红；补锁用 `--lock`
#
# 用法: bash packaging/scripts/release-verify.sh [--no-hash] [--lock]
#   --no-hash  跳过哈希（只查存在；快速循环用）
#   --lock     给缺锁的产物补上 uchg（把历史版本也纳入「删不掉」）
#   release/<版本>.lost 是「已宣告丢失」的台账：**字节确实缺席**时不判红（但仍每次念出来），
#   其余任何「清单在、字节没了」一律红灯——包括刚刚才丢的那一个。
#   台账不是永久豁免：字节已在位却还留着 `.lost` 判红——宣告过期必须撤下，否则该版本被永久
#   短路于字节核对。2026-09-13 的 2.3.1 就是这个形态（由飞书副本找回后 `.lost` 仍在）。
# 退出码: 0 全部通过；1 有 FAIL
set -uo pipefail

PKG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$PKG_ROOT/.." && pwd)"
ARCHIVE_ROOT="${LUTE_RELEASES_ARCHIVE:-$HOME/Library/Application Support/LUTE/releases}"

DO_HASH=1
DO_LOCK=0
for a in "$@"; do
  case "$a" in
    --no-hash) DO_HASH=0 ;;
    --lock) DO_LOCK=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "未知选项: $a" >&2; exit 2 ;;
  esac
done

FAIL=0
SKIP=0
CHECKED=0
LOST=0
LEGACY=0

report(){ # report <版本> <说明>
  printf '[%s] %s\n' "$1" "$2"
}

locked_flag(){ # <路径> → uchg / -
  local flags
  flags="$(ls -ldO "$1" 2>/dev/null | awk 'NR==1{print $5}')"
  case "$flags" in *uchg*) echo "uchg" ;; *) echo "-" ;; esac
}

for manifest in "$REPO_ROOT"/release/*.sha256; do
  [ -f "$manifest" ] || continue
  version="$(basename "$manifest" .sha256)"
  line="$(grep -m1 -E '^[0-9a-f]{64}  ' "$manifest" || true)"
  if [ -z "$line" ]; then
    report "$version" "清单里读不出哈希/文件名——清单坏了"
    FAIL=$((FAIL+1)); continue
  fi
  expect="$(printf '%s' "$line" | awk '{print $1}')"
  dmg_name="$(printf '%s' "$line" | awk '{print $2}')"
  rel="$PKG_ROOT/release/$version"
  repo_dmg="$rel/$dmg_name"
  arch_dmg="$ARCHIVE_ROOT/$version/$dmg_name"

  if [ -f "$REPO_ROOT/release/${version}.lost" ]; then
    # 豁免会过期（2026-09-13 补）：字节回来了、`.lost` 还留着，是这类事故里最坏的一种静默——
    # `continue` 会把本版本**永久**短路于字节核对，今后再丢也没人报错，而每次门禁还在念
    # 「已宣告丢失」，看起来像"已知且已处理"。2.3.1 由飞书副本找回后就正是这个形态：
    # 产物位已完整且锁定，门禁照旧说它不在本机。宣告只在字节确实缺席时才成立。
    if [ -f "$repo_dmg" ]; then
      stale_hash="未核"
      if [ "$DO_HASH" = "1" ]; then
        if [ "$(shasum -a 256 "$repo_dmg" | awk '{print $1}')" = "$expect" ]; then
          stale_hash="一致"
        else
          stale_hash="不符"
        fi
      fi
      report "$version" "✗ 已宣告丢失、但字节已在位（哈希${stale_hash}）——撤下 release/${version}.lost（改名为 ${version}.recovered 并补记找回读数）；留着它，本版本被永久豁免于字节核对"
      FAIL=$((FAIL+1))
    else
      report "$version" "已宣告丢失（release/${version}.lost）——清单承诺的字节不在本机；有外部副本即可核验收回"
      LOST=$((LOST+1))
    fi
    continue
  fi

  # 版本目录整体不存在 → 本机没有发布过它，跳过（不假红）
  if [ ! -d "$rel" ]; then
    extra=""
    [ -f "$arch_dmg" ] && extra="；归档里有一份（可用 release-restore.sh ${version} 找回）"
    report "$version" "本机无该版本产物（SKIP）${extra}"
    SKIP=$((SKIP+1)); continue
  fi

  if [ ! -f "$repo_dmg" ]; then
    report "$version" "✗ 清单在、字节没了 → 找回：bash packaging/scripts/release-restore.sh ${version}"
    FAIL=$((FAIL+1)); continue
  fi

  # 「完整」不只是 dmg 在（ADR-0057：要么缺席要么完整）。SHA256SUMS / VERSION / manifest.json
  # 是那次终验的产物集合；它们与 dmg 分家过一次，而且**分家时无人报错**：2026-09-13 15:19 的
  # 一次 `release-restore.sh 2.3.2` 把整个目录改名留档成 `*.replaced-*`，却只把 dmg 拷回来，
  # `release/2.3.2/` 于是变成「有字节、没清单」，直到人工翻目录才发现。本行就是当时缺的那一处；
  # 留档目录里那份清单可直接取回（同时核对 VERSION 的 BUILD 与入库清单的 build 一致）。
  meta_missing=""
  for f in SHA256SUMS VERSION manifest.json; do
    [ -f "$rel/$f" ] || meta_missing="$meta_missing $f"
  done
  if [ -n "$meta_missing" ]; then
    meta_state="✗ 清单缺:${meta_missing}"
    FAIL=$((FAIL+1))
  else
    meta_state="清单齐全"
  fi

  hash_state="跳过"
  if [ "$DO_HASH" = "1" ]; then
    got="$(shasum -a 256 "$repo_dmg" | awk '{print $1}')"
    if [ "$got" = "$expect" ]; then hash_state="ok"; else hash_state="不符"; FAIL=$((FAIL+1)); fi
  fi

  arch_state="无归档副本"
  if [ -f "$arch_dmg" ]; then
    if [ "$DO_HASH" = "1" ]; then
      a_got="$(shasum -a 256 "$arch_dmg" | awk '{print $1}')"
      if [ "$a_got" = "$expect" ]; then arch_state="归档一致"; else arch_state="归档不符"; FAIL=$((FAIL+1)); fi
    else
      arch_state="归档在"
    fi
  fi

  if [ "$(locked_flag "$repo_dmg")" = "uchg" ]; then
    lock_state="已锁定"
  else
    lock_state="未锁定"
    if [ "$DO_LOCK" = "1" ]; then
      if chflags -R uchg "$rel" 2>/dev/null; then lock_state="已锁定(本次补)"; else lock_state="补锁失败"; fi
    fi
  fi

  report "$version" "产物在；哈希=${hash_state}；${meta_state}；${arch_state}；${lock_state}"
  CHECKED=$((CHECKED+1))
done

# 未登记的产物目录（dmg 在、但没有 release/<版本>.sha256 清单——早于 ADR-0058 的版本）。
# 它们同样属于「不允许删除的历史发布版本」，所以这里也报出来、也补锁，只是无从核对哈希。
for dir in "$PKG_ROOT"/release/*/; do
  [ -d "$dir" ] || continue
  legacy_version="$(basename "$dir")"
  # 只认「裸版本号」目录名。`<版本>.replaced-<时间戳>` / `.superseded-<时间戳>` 是找回与重制时的
  # 改名留档（永不复用、永不删除），它们没有 dmg 是**正常的**——把它当缺产物是假红。
  # 判据：3 段纯数字。加这一条之前，一次 release-restore 就会让门禁变红。
  [[ "$legacy_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
  [ -f "$REPO_ROOT/release/${legacy_version}.sha256" ] && continue
  legacy_dmg="$(ls "$dir"*.dmg 2>/dev/null | head -1)"
  if [ -z "$legacy_dmg" ]; then
    report "$legacy_version" "✗ 未登记且目录里没有 dmg"
    FAIL=$((FAIL+1)); continue
  fi
  legacy_lock="$(locked_flag "$legacy_dmg")"
  if [ "$legacy_lock" = "uchg" ]; then legacy_lock="已锁定"; else
    legacy_lock="未锁定"
    if [ "$DO_LOCK" = "1" ]; then
      if chflags -R uchg "$dir" 2>/dev/null; then legacy_lock="已锁定(本次补)"; else legacy_lock="补锁失败"; fi
    fi
  fi
  report "$legacy_version" "未登记（早于清单机制）；产物在；${legacy_lock}"
  LEGACY=$((LEGACY+1))
done

echo
echo "[release-verify] 已核对 ${CHECKED} 个版本，跳过 ${SKIP} 个（本机无产物），已宣告丢失 ${LOST} 个，未登记 ${LEGACY} 个，失败 ${FAIL} 个"
if [ "$FAIL" != "0" ]; then
  echo "[release-verify] ✗ 已发布版本的产物不完整——清单承诺过的字节必须能找回来（见上表找回命令）" >&2
  exit 1
fi
echo "[release-verify] ✓ 已发布版本的产物齐备"
