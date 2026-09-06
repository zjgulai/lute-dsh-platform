#!/bin/bash
# DSH Desktop 2.0.4 品牌重放脚本（升级后恢复 ROOT/路特创新/LUTE Agentic System 品牌）
#
# 背景：官方升级重打包 .app 会还原「DSH Desktop / DeepSeek」品牌字符串。
# 本脚本把品牌注入幂等重放。三块：
#   1) 显示名品牌（DSH Desktop → LUTE Agentic System）——9 个文件；
#   2) 启动词标（wordmark "ROOT" + 内联 SVG）——dsh-web-frontend 哈希资产；
#   3) Info.plist 显示名（CFBundleName/CFBundleDisplayName → LUTE Agentic System）。
#
# 纪律：
#   - 路径 join 字符串【不可替换】：bin.js 的 "DSH Desktop" 全是路径，main.js 5136 行
#     app.setPath("userData", ...) 也是路径——脚本已豁免。
#   - 改主进程/原生页文件需整机重启生效。
#   - 只替换「未加引号（显示文案）」？本版简化：目标文件当前 0 处 "DSH Desktop"
#     （品牌态），升级后出现即全部是显示串，可直接替换；main.js 仅豁免 setPath 行。
#
# 用法:
#   ./brand-replay.sh --check     # 只报告当前品牌状态
#   ./brand-replay.sh --apply     # 幂等重放（每处锚点计数=1 才落笔）
set -u
# 路径参数化（随包分发时由安装器/smoke 显式传入）：DSH_APP（默认 /Applications/DSH Desktop.app）
DSH_APP="${DSH_APP:-/Applications/DSH Desktop.app}"
CHK="$DSH_APP/Contents/Resources/app.asar.unpacked"
ASSETS="$CHK/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets"
PAYLOAD="$(dirname "$0")/brand-payload-wordmark.txt"
MODE="${1:---check}"
fail=0

say() { echo "[$MODE] $*"; }

# ── 1. 显示名品牌 ────────────────────────────────────────────────────────────
FILES=(
  "lib/updates.js"
  "lib/update-checker-Mw2EmLOX.js"
  "lib/desktop-terminal.js"
  "lib/native-ui/recovery.html"
  "lib/native-ui/setup-wizard.html"
  "lib/native-ui/desktop-dialog.html"
  "lib/client.js"
  "lib/electron-runtime-DS52LbUW.js"
  "lib/main.js"
)
for rel in "${FILES[@]}"; do
  f="$CHK/$rel"
  [ -f "$f" ] || { say "MISSING $rel"; fail=1; continue; }
  if [ "$rel" = "lib/main.js" ]; then
    # 豁免 userData 路径行后再计数
    d=$(grep "DSH Desktop" "$f" 2>/dev/null | grep -vc 'app.setPath("userData"' || true)
  else
    d=$(grep -c "DSH Desktop" "$f" 2>/dev/null || true)
  fi
  l=$(grep -c "LUTE Agentic System" "$f" 2>/dev/null || true)
  if [ "$d" = "0" ] && [ "$l" -gt 0 ]; then
    say "OK   $rel (LUTE×$l)"
  elif [ "$MODE" = "--apply" ]; then
    if [ "$rel" = "lib/main.js" ]; then
      # 豁免 userData 路径行，只替换其余显示串
      python3 - "$f" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
protected = 'app.setPath("userData", app.getPath("appData") + "/DSH Desktop")'
marker = "@@KEEP_PATH@@"
s2 = s.replace(protected, marker)
c = s2.count("DSH Desktop")
if c == 0:
    open(p).close()  # 无需改
else:
    s2 = s2.replace("DSH Desktop", "LUTE Agentic System").replace(marker, protected)
    open(p, "w").write(s2)
print(f"replaced {c} display strings (userData path exempt)")
PY
      say "APPLY $rel"
    else
      c=$(grep -c "DSH Desktop" "$f")
      perl -pi -e 's/DSH Desktop/LUTE Agentic System/g' "$f"
      say "APPLY $rel (DSH×$c)"
    fi
  else
    say "DRIFT $rel (DSH×$d LUTE×$l) — 升级已还原品牌，跑 --apply"
    fail=1
  fi
done

# ── 2. 启动词标（ROOT + SVG）─────────────────────────────────────────────────
if [ -f "$PAYLOAD" ]; then
  for asset in "$ASSETS"/*.js; do
    [ -f "$asset" ] || continue
    # 跳过不含词标构造的 vendor/框架 chunk
    grep -q 'Kt.wordmark' "$asset" 2>/dev/null || continue
    if grep -q 'Gt(Kt.wordmark,"ROOT")' "$asset" 2>/dev/null; then
      say "OK   wordmark $(basename "$asset")"
    elif [ "$MODE" = "--apply" ]; then
      python3 - "$asset" "$PAYLOAD" <<'PY'
import sys, re
asset, payload = sys.argv[1], sys.argv[2]
s = open(asset).read()
block = open(payload).read().rstrip()
pat = re.compile(r'this\.wordmark=Gt\(Kt\.wordmark,"[^"]*"\),this\.spinner=')
m = pat.search(s)
if m:
    s = s[:m.start()] + block + ',this.spinner=' + s[m.end():]
    open(asset, "w").write(s)
    print("wordmark patched")
else:
    print("anchor not found (structure drifted — 手工适配)")
PY
      say "APPLY wordmark $(basename "$asset")"
    else
      say "DRIFT wordmark $(basename "$asset") — 跑 --apply"
      fail=1
    fi
  done
else
  say "MISSING $PAYLOAD（词标补丁载荷）"
  fail=1
fi

# ── 3. Info.plist 显示名 ──────────────────────────────────────────────────────
PLIST="$DSH_APP/Contents/Info.plist"
if [ -f "$PLIST" ]; then
  cur=$(/usr/libexec/PlistBuddy -c "Print :CFBundleName" "$PLIST" 2>/dev/null)
  if [ "$cur" = "LUTE Agentic System" ]; then
    say "OK   Info.plist CFBundleName"
  elif [ "$MODE" = "--apply" ]; then
    /usr/libexec/PlistBuddy -c "Set :CFBundleName LUTE Agentic System" "$PLIST"
    /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName LUTE Agentic System" "$PLIST"
    say "APPLY Info.plist"
  else
    say "DRIFT Info.plist (现为 $cur) — 跑 --apply"
    fail=1
  fi
fi

echo
if [ "$fail" = "0" ]; then echo "BRAND ALL VERIFIED"; else echo "BRAND DRIFT — 升级后跑 --apply"; fi
exit $fail
