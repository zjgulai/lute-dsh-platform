#!/bin/bash
# reloc-aeis.sh —— 灵枢 aeis 运行时便携化（离线决策 D5）
#
# 依据（2026-09-01 实测）：
#   - 原 venv 的 bin/python3.14 是指向 homebrew 的符号链接，stdlib 也不在 venv 内，
#     且二进制以绝对路径链到 Python.framework —— 直接随包无法在无 homebrew 的
#     目标机运行。
#   - python-build-standalone 的 install_only 构建**可重定位**（移动目录后
#     sys.prefix 自动跟随，已实测）；aeis 0.5.0 为纯 Python（site-packages 零 .so）。
#   - 方案：standalone Python 3.14.7（与本机 venv 基底同版本）直接作为 aeis 运行时
#     目录（免 venv 机制），拷入 aeis/harness/seed_knowledge/wisdom 即完成。
#
# 用法：
#   reloc-aeis.sh --build <src-site-packages> <out-dir>   # 组装机：产出 <out>/aeis-venv
#   reloc-aeis.sh --check <aeis-venv>                     # 目标机：运行自检
set -euo pipefail
PKG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PBS_TGZ="$PKG_ROOT/vendor/python-standalone/cpython-3.14.7+20260825-aarch64-apple-darwin-install_only.tar.gz"
PBS_SHA_FILE="$PKG_ROOT/vendor/python-standalone/SHA256"

case "${1:-}" in
  --build)
    SRC_SP="$2"; OUT="$3"
    [ -d "$SRC_SP" ] || { echo "[aeis] 缺少源 site-packages: $SRC_SP"; exit 1; }
    # 1. 校验 vendored standalone tarball 完整性
    ( cd "$(dirname "$PBS_TGZ")" && shasum -a 256 -c "$(basename "$PBS_SHA_FILE")" >/dev/null )
    # 2. 解包并更名
    rm -rf "$OUT"; mkdir -p "$OUT"
    tar -xzf "$PBS_TGZ" -C "$OUT"
    mv "$OUT/python" "$OUT/aeis-venv"
    SP="$OUT/aeis-venv/lib/python3.14/site-packages"
    # 3. 拷入 aeis 相关包（纯 Python；dist-info 用 glob 适配版本变化）
    cp -R "$SRC_SP"/aeis "$SRC_SP"/aeis-*.dist-info "$SRC_SP"/harness \
          "$SRC_SP"/seed_knowledge "$SRC_SP"/wisdom "$SP/"
    # 4. 自检：真实导入 + 模块启动面
    "$OUT/aeis-venv/bin/python3" -c "import aeis; print('[aeis] portable build ok:', aeis.__file__)"
    echo "aeis 0.5.0 / python 3.14.7 (standalone $("$OUT/aeis-venv/bin/python3" -V 2>&1 | cut -d' ' -f2))" \
      > "$OUT/aeis-venv/.aeis-buildinfo"
    ;;
  --check)
    VENV="$2"
    [ -x "$VENV/bin/python3" ] || { echo "[aeis] 缺少 $VENV/bin/python3"; exit 1; }
    "$VENV/bin/python3" -c "import aeis; print('[aeis] check ok:', aeis.__file__)"
    ;;
  *) echo "用法: $0 --build <src-site-packages> <out-dir> | --check <aeis-venv>"; exit 2;;
esac
