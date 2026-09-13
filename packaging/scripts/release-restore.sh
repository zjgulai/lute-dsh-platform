#!/bin/bash
# release-restore.sh —— 把一份**已发布的**产物重新就位（从归档，或从外部拿到的副本）。
#
# 为什么需要它：发布过的 dmg 已两次从 `packaging/release/<版本>/` 里消失（清单还在、字节没了）。
# 机制侧已由 `sign-and-dmg.sh` §8 改成「仓库外归档 + uchg 锁定」，本脚本负责**找回**：
#   ① 常规：从归档 `$HOME/Library/Application Support/LUTE/releases/<版本>/` 复制回仓库产物位；
#   ② 特例：从**任何外部副本**恢复（例如客户手上那份、聊天软件里那份），用 `--from <dmg 路径>`。
#      这一条同时是「客户手上那串字节是不是我们发的」的判定器：哈希对不上即拒收。
#
# 判据一律取仓库里的 git 入库清单 `release/<版本>.sha256`（ADR-0058）——它是「我们承诺过什么」
# 的唯一 home；本脚本不自己算一份期望值，也不接受「差不多像」。
#
# 用法:
#   bash packaging/scripts/release-restore.sh <版本>                    # 从归档恢复
#   bash packaging/scripts/release-restore.sh <版本> --from <dmg 路径>  # 从外部副本恢复
# 退出码: 0 成功；2 用法/前置错误；3 来源不存在；4 哈希与清单不符（拒收）
set -euo pipefail

PKG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$PKG_ROOT/.." && pwd)"
ARCHIVE_ROOT="${LUTE_RELEASES_ARCHIVE:-$HOME/Library/Application Support/LUTE/releases}"

VERSION=""; FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    -*) echo "未知选项: $1" >&2; exit 2 ;;
    *) if [ -z "$VERSION" ]; then VERSION="$1"; else echo "多余参数: $1" >&2; exit 2; fi; shift ;;
  esac
done
[ -n "$VERSION" ] || { echo "用法: release-restore.sh <版本> [--from <dmg 路径>]" >&2; exit 2; }

MANIFEST="$REPO_ROOT/release/$VERSION.sha256"
[ -f "$MANIFEST" ] || { echo "找不到入库清单: ${MANIFEST}（该版本从未发布或清单未提交）" >&2; exit 2; }

EXPECT_SHA="$(grep -m1 -E '^[0-9a-f]{64}  ' "$MANIFEST" | awk '{print $1}')"
DMG_NAME="$(grep -m1 -E '^[0-9a-f]{64}  ' "$MANIFEST" | awk '{print $2}')"
[ -n "$EXPECT_SHA" ] && [ -n "$DMG_NAME" ] \
  || { echo "清单里读不出哈希/文件名: $MANIFEST" >&2; exit 2; }

REL="$PKG_ROOT/release/$VERSION"
ARCHIVE_VER="$ARCHIVE_ROOT/$VERSION"

# 来源：显式给的路径优先；否则用归档
if [ -n "$FROM" ]; then
  SRC="$FROM"
  SRC_DESC="外部副本"
else
  SRC="$ARCHIVE_VER/$DMG_NAME"
  SRC_DESC="本机归档 $ARCHIVE_VER"
fi
[ -f "$SRC" ] || {
  echo "来源不存在：${SRC}（${SRC_DESC}）" >&2
  echo "  若你有客户/聊天软件里那份副本：release-restore.sh $VERSION --from <路径>" >&2
  exit 3
}

echo "[restore] 版本 $VERSION"
echo "[restore] 期望 sha256 : $EXPECT_SHA   （来自 git 清单 release/$VERSION.sha256）"
echo "[restore] 来源        : ${SRC}（${SRC_DESC}）"
ACTUAL_SHA="$(shasum -a 256 "$SRC" | awk '{print $1}')"
echo "[restore] 实际 sha256 : $ACTUAL_SHA"
if [ "$ACTUAL_SHA" != "$EXPECT_SHA" ]; then
  echo "[restore] ✗ 哈希与清单不符——**拒收**。这份字节不是该版本发布出去的那一份。" >&2
  exit 4
fi

# 就位（两处都写：仓库产物位 + 归档）。已存在的先改名留档，永不删除。
mkdir -p "$ARCHIVE_ROOT"
for dest in "$REL" "$ARCHIVE_VER"; do
  KEEP=""
  # 已经就位且哈希正确的那一份不动它——否则每次「补归档」都要白白多留一份 600MB 的
  # `*.replaced-*`（把补归档做成了复制灾难）。
  if [ -f "$dest/$DMG_NAME" ]; then
    HAVE="$(shasum -a 256 "$dest/$DMG_NAME" | awk '{print $1}')"
    if [ "$HAVE" = "$EXPECT_SHA" ]; then
      echo "[restore] 已就位且哈希一致，原地保留: $dest"
      continue
    fi
  fi
  if [ -e "$dest" ]; then
    chflags -R nouchg "$dest" 2>/dev/null || true
    KEEP="$dest.replaced-$(date +%Y%m%d-%H%M%S)"
    mv "$dest" "$KEEP"
    echo "[restore] 已有副本改名保留（未删除）: $KEEP"
  fi
  mkdir -p "$dest"
  # 来源就是目标本身（例如从归档恢复归档那一份）时不要自拷贝。
  [ "$SRC" = "$dest/$DMG_NAME" ] || cp "$SRC" "$dest/$DMG_NAME"
  # 被改名留档的那一份里的清单必须**跟过来**。上一行 mv 是整目录搬走，而这里只拷回 dmg：
  # `SHA256SUMS` / `VERSION` / `manifest.json` 会留在 `*.replaced-*` 里，`release/<版本>/`
  # 从此处于「有字节、没清单」的半截状态——ADR-0057 只允许「要么缺席要么完整」，而当时
  # **没有任何一处会因此报错**。2026-09-13 15:19 的 2.3.2 就是这个形态，诱因是那次「把 dmg
  # 搬走来证明机制」的丢失演练（不是新的丢失事件：字节由归档原样救回，哈希逐位相同），
  # 但留下的半截目录直到人工翻目录才被发现，清单靠手工归位。下面这个循环就是那次教训的固化。
  if [ -n "$KEEP" ]; then
    for f in SHA256SUMS VERSION manifest.json; do
      if [ -f "$KEEP/$f" ] && [ ! -f "$dest/$f" ]; then
        cp -p "$KEEP/$f" "$dest/$f"
        echo "[restore] 清单随行: ${f}（取自 $(basename "$KEEP")）"
      fi
    done
  fi
done

# 同一目录下若有同版本的 SHA256SUMS/VERSION/manifest.json（归档或旧产物里带），一并带回仓库产物位，
# 让 release/<版本>/ 重新成为「完整且已通过终验的产物集合」（ADR-0057 的两种状态之一）。
for f in SHA256SUMS VERSION manifest.json; do
  if [ -f "$ARCHIVE_VER/$f" ] && [ ! -f "$REL/$f" ]; then cp "$ARCHIVE_VER/$f" "$REL/$f"; fi
done

# 回读校验 + 锁定
for dest in "$REL" "$ARCHIVE_VER"; do
  GOT="$(shasum -a 256 "$dest/$DMG_NAME" | awk '{print $1}')"
  [ "$GOT" = "$EXPECT_SHA" ] || { echo "[restore] ✗ 落位后校验失败: ${dest}（${GOT}）" >&2; exit 4; }
  chflags -R uchg "$dest" || { echo "[restore] ✗ 无法锁定 ${dest}" >&2; exit 2; }
done

echo "[restore] ✓ 已就位并锁定："
echo "            $REL/$DMG_NAME"
echo "            $ARCHIVE_VER/$DMG_NAME"
echo "[restore] 复核命令：bash packaging/scripts/release-verify.sh"
