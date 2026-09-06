#!/bin/bash
# 先检查是否已安装，已安装则跳过，不用重复安装。
# 从 npm 安装 dsh-chinese-skill-patch（不要用本地 vendor/link）。
# 装完后必须完全退出并重新打开 DSH Desktop，再新开会话输入 /JTBD分析器
set -euo pipefail

PKG="dsh-chinese-skill-patch"

export PATH="$HOME/Library/pnpm/bin:$HOME/Library/Application Support/DSH Desktop/runtime-commands/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

if ! command -v dsh >/dev/null 2>&1; then
  echo "未找到 dsh 命令。"
  echo "请先安装并打开一次 DSH Desktop，或执行：npm install -g @deepseek-ai/dsh"
  read -r -p "按回车关闭…" _
  exit 1
fi

echo "使用 CLI：$(command -v dsh)"
echo "安装来源：npm $PKG"
echo

is_npm_install() {
  python3 -c "
import json, sys
p = json.load(open(sys.argv[1]))
d = p.get('dependencies') or {}
spec = str(d.get('dsh-chinese-skill-patch') or '')
npm = bool(spec) and not spec.startswith(('link:', 'file:', '/'))
sys.exit(0 if npm else 1)
" "$1"
}

installed=0
skipped=0
failed=0
for profile in desktop web; do
  if [ ! -f "$HOME/.dsh/profiles/$profile/package.json" ]; then
    echo "跳过 $profile（本机没有这个 profile）"
    continue
  fi
  if is_npm_install "$HOME/.dsh/profiles/$profile/package.json"; then
    echo "跳过 $profile（npm 已安装 $PKG，已安装则跳过）"
    skipped=$((skipped + 1))
    echo
    continue
  fi
  echo "正在从 npm 安装到 profile：$profile"
  if dsh plugin --profile "$profile" add "$PKG"; then
    echo "✓ $profile 已从 npm 安装 ${PKG}"
    installed=$((installed + 1))
  else
    echo "✗ $profile 安装失败"
    failed=$((failed + 1))
  fi
  echo
done

if [ "$installed" -eq 0 ] && [ "$skipped" -eq 0 ]; then
  echo "没有成功写入任何 profile。请确认已至少打开过一次 DSH Desktop。"
  read -r -p "按回车关闭…" _
  exit 1
fi

echo "----------------------------------------"
if [ "$skipped" -gt 0 ]; then
  echo "有 $skipped 个 profile 已安装，已跳过（不重复安装）。"
fi
echo "补丁新写入 $installed 个 profile。"
if [ "$failed" -gt 0 ]; then
  echo "有 $failed 个 profile 失败，可把上面的报错发给管理员。"
fi
echo
echo "接下来请务必："
echo "  1. 完全退出 DSH Desktop（不是只关窗口）"
echo "  2. 重新打开 DSH Desktop"
echo "  3. 新开一个会话，输入：/JTBD分析器"
echo "----------------------------------------"
read -r -p "按回车关闭…" _
