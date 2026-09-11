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
# 动态文件名：hash 文件名随基座版本变化（2.0.4: Mw2EmLOX/DS52LbUW；2.0.5: DaaZGYGQ/DLNj0vyk）
UPDATE_CHECKER="$(basename "$(ls "$CHK"/lib/update-checker-*.js 2>/dev/null | head -1)" 2>/dev/null)"
ELECTRON_RUNTIME="$(basename "$(ls "$CHK"/lib/electron-runtime-*.js 2>/dev/null | head -1)" 2>/dev/null)"
FILES=(
  "lib/updates.js"
  "lib/${UPDATE_CHECKER:-update-checker-Mw2EmLOX.js}"
  "lib/desktop-terminal.js"
  "lib/native-ui/recovery.html"
  "lib/native-ui/setup-wizard.html"
  "lib/native-ui/desktop-dialog.html"
  "lib/client.js"
  "lib/${ELECTRON_RUNTIME:-electron-runtime-DS52LbUW.js}"
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
# 版本无关语义锚点（2026-09-11 加固）：
#   文本：this.wordmark=<fn>(<ref>.wordmark,"X") → "ROOT"（2.0.4 Gt(Kt.wordmark,…) / 2.0.5 Yt(Gt.wordmark,…) 通吃）
#   SVG：2.0.4 系 this.brandMark=…innerHTML='<svg…' → ROOT SVG；2.0.5 无 brandMark，仅文本
if [ -f "$PAYLOAD" ]; then
  for asset in "$ASSETS"/*.js; do
    [ -f "$asset" ] || continue
    # 跳过不含词标构造的 vendor/框架 chunk
    grep -qE 'this\.wordmark=[A-Za-z_$]+\([A-Za-z_$.]+wordmark,"[^"]*"' "$asset" 2>/dev/null || continue
    if grep -qE 'this\.wordmark=[A-Za-z_$]+\([A-Za-z_$.]+wordmark,"ROOT"' "$asset" 2>/dev/null; then
      say "OK   wordmark $(basename "$asset")"
    elif [ "$MODE" = "--apply" ]; then
      python3 - "$asset" "$PAYLOAD" <<'PY'
import sys, re
asset, payload = sys.argv[1], sys.argv[2]
s = open(asset, encoding="utf-8").read()
# 1) 词标文本 → "ROOT"（语义锚点，不依赖压缩器 Kt/Gt 命名）
pat_text = re.compile(r'(this\.wordmark=\w+\(\w+\.wordmark,")[^"]*("\))')
s, n = pat_text.subn(r'\g<1>ROOT\g<2>', s)
if n: print(f"wordmark text -> ROOT x{n}")
# 2) 启动标 SVG（仅 2.0.4 系有 brandMark；payload 里取 ROOT SVG）
m = re.search(r"this\.brandMark=([^;]*?)\.innerHTML='<svg[^']*'", s)
if m:
    block = open(payload, encoding="utf-8").read().rstrip()
    inner = block.split("innerHTML='", 1)[1].rsplit("'", 1)[0]
    s = s[:m.start()] + "this.brandMark=" + m.group(1) + ".innerHTML='" + inner + "'" + s[m.end():]
    print("brandMark svg -> ROOT")
open(asset, "w", encoding="utf-8").write(s)
PY
      say "APPLY wordmark $(basename "$asset")"
    else
      say "DRIFT wordmark $(basename "$asset") — 跑 --apply"
      fail=1
    fi
  done
else
  say "MISSING ${PAYLOAD}（词标补丁载荷）"
  fail=1
fi

# ── 2b. 网页标题（hero 空态标题的补丁已于 2026-09-11 退役）───────────────
# 退役说明：原先此处把官方 locale 的 "hero.headline" 改写成品牌句做兜底，与
# dsh-root-brand 插件的「隐藏官方标题 + 渲染品牌句」构成第二条真相源 —— 一旦插件
# 的隐藏规则 miss（CSS-module 哈希漂移），官方标题就会以同文案第二次出现。
# 现在品牌句的唯一真相源是插件，官方标题由插件在运行时解析类名后隐藏。
# 规格：.scratch/dsh-root-brand-drift/spec.md ｜ 决定：ADR-0019
IDX_HTML="$CHK/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html"
if [ -f "$IDX_HTML" ]; then
  if grep -q '<title>LUTE Agentic System</title>' "$IDX_HTML" 2>/dev/null; then
    say "OK   index.html 标题"
  elif [ "$MODE" = "--apply" ]; then
    python3 - "$IDX_HTML" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
s = s.replace("<title>DeepSeek Harness</title>", "<title>LUTE Agentic System</title>")
open(p, "w", encoding="utf-8").write(s)
print("index.html title patched")
PY
    say "APPLY index.html 标题"
  else
    say "DRIFT index.html 标题 — 跑 --apply"
    fail=1
  fi
fi

# ── 3b. Electron Helper 重命名（Electron 按外层 CFBundleName 查找 helper，缺省会 "Unable to find helper app"）──
HELPERS_DIR="$DSH_APP/Contents/Frameworks"
for helper_suffix in "" " (GPU)" " (Plugin)" " (Renderer)"; do
  OLD_H="$HELPERS_DIR/DSH Desktop Helper${helper_suffix}.app"
  NEW_H="$HELPERS_DIR/LUTE Agentic System Helper${helper_suffix}.app"
  if [ -d "$OLD_H" ]; then
    if [ "$MODE" = "--apply" ]; then
      mv "$OLD_H" "$NEW_H"
      /usr/libexec/PlistBuddy -c "Set :CFBundleName LUTE Agentic System Helper${helper_suffix}" "$NEW_H/Contents/Info.plist" 2>/dev/null
      /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable LUTE Agentic System Helper${helper_suffix}" "$NEW_H/Contents/Info.plist" 2>/dev/null
      mv "$NEW_H/Contents/MacOS/DSH Desktop Helper${helper_suffix}" "$NEW_H/Contents/MacOS/LUTE Agentic System Helper${helper_suffix}" 2>/dev/null || true
      say "APPLY Helper${helper_suffix} 重命名"
    else
      say "DRIFT Helper${helper_suffix} 未重命名 — 跑 --apply"
      fail=1
    fi
  elif [ -d "$NEW_H" ]; then
    [ "$MODE" = "--check" ] && say "OK   Helper${helper_suffix} 已重命名"
  fi
done

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

# ── 4. app 图标（icon.icns；ROOT 品牌资产为唯一真相源）───────────
# 真相源：.dsh-root-brand-preview/root-icon/icon.icns（与 packaging/assets/app-icon.icns 同源，2026-09-11 统一）。
# 优先取脚本同目录随包分发的 app-icon.icns（payload/tools/），动态计算期望 hash；
# 无随包资产时回退常量（仅 check 用途）。--apply 需随包资产，本脚本不带 icns。
ICON_ASSET="$(dirname "$0")/app-icon.icns"
BRAND_ICON_SHA="${BRAND_ICON_SHA:-}"
if [ -f "$ICON_ASSET" ]; then
  BRAND_ICON_SHA="$(shasum "$ICON_ASSET" | awk '{print $1}')"
elif [ -z "$BRAND_ICON_SHA" ]; then
  BRAND_ICON_SHA="290286804849af5386b751c9d28b7bd24972f0f8"  # root-icon/icon.icns sha1（真相源）
fi
ICON="$DSH_APP/Contents/Resources/icon.icns"
if [ -f "$ICON" ]; then
  cur=$(shasum "$ICON" | awk '{print $1}')
  if [ "$cur" = "$BRAND_ICON_SHA" ]; then
    say "OK   icon.icns ROOT 品牌图标"
  elif [ "$MODE" = "--apply" ] && [ -f "$ICON_ASSET" ]; then
    cp "$ICON_ASSET" "$ICON"
    say "APPLY icon.icns ← $(basename "$ICON_ASSET")"
  elif [ "$MODE" = "--apply" ]; then
    say "APPLY icon.icns 失败：随包缺少 app-icon.icns（本脚本不带 icns 资产）"
    fail=1
  else
    say "DRIFT icon.icns（hash ${cur}）— 与 ROOT 品牌资产不符"
    fail=1
  fi
fi

echo
if [ "$fail" = "0" ]; then echo "BRAND ALL VERIFIED"; else echo "BRAND DRIFT — 升级后跑 --apply"; fi
exit $fail
