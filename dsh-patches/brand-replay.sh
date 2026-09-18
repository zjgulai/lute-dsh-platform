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
# 资源根双形态（2026-09-17，2.0.10 基座迁移）：no-ASAR 布局 Resources/app ⇄ 旧 2.0.5
# app.asar.unpacked。判定规则的唯一家是主仓 scripts/lib/app-resources.mjs；本脚本随包
# 分发不能 import 主仓，内联等价判定（app 存在且无 app.asar[.unpacked] → no-asar）。
_RES="$DSH_APP/Contents/Resources"
if [ -d "$_RES/app" ] && [ ! -e "$_RES/app.asar" ] && [ ! -e "$_RES/app.asar.unpacked" ]; then
  CHK="$_RES/app"
else
  CHK="$_RES/app.asar.unpacked"
fi
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
  elif [ "$d" = "0" ] && [ "$l" = "0" ]; then
    # 2026-09-17（2.0.10 重锚）：上游基座个别文件已彻底移除品牌串
    #（如 desktop-terminal.js D0+L0）。旧的判定矩阵没这个分支 → D0+L0 落进
    # DRIFT（假阳性：apply 也无事可做）。D0+L0 = 该文件在本基座上已无判定面，
    # 报 N/A，不算 DRIFT、不置 fail。
    # 注意 `${rel}` 花括号形式：旧 bash（macOS /usr/bin/bash 3.2）会把
    # `$rel（D0` 的多字节 `（` 吞进变量名 → 报 `rel…: unbound variable`。
    say "N/A  ${rel}（D0+L0：本基座该文件无品牌串，无判定面）"
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

# ── 5. 运行时图标（build/app-icon*.png + build/tray-icon*.png）───────────────
# 为什么必须有这一块（2026-09-13 实测）：
#   第 4 块管的是 Contents/Resources/icon.icns——那是 **Finder** 里的图标，它一直是对的。
#   但 **Dock 图标不是**：dsh-plugin-desktop 在启动时显式覆盖它——
#     const iconFilename = runtime.platform === "darwin" ? "app-icon-mac.png" : "app-icon.png"
#     const iconPath = fileURLToPath(new URL(`../build/${iconFilename}`, …))
#     app.dock?.setIcon(icon)          // electron-runtime 的 MacPlatformStrategy.configureApplication
#   而 app.asar.unpacked/build/ 那一套**从未被品牌化**：实测 app-icon-mac.png 是 2.2 MB 的
#   DSH 原生图标，而 ROOT 图标只有 47 KB；tray-icon*.png 同理。
#   症状极具欺骗性：**Finder 里是 ROOT、Dock 里是 DSH 原生**，而本脚本报 ALL VERIFIED
#   —— 因为「品牌检查」只看了一个家，而图标有两个家（P-07）。
# 资产：$(dirname "$0")/brand-icons/（随包分发）。入库副本 packaging/assets/brand-icons/，
#   与第 4 块的 app-icon.icns 同一模式：真相源在 .dsh-root-brand-preview/root-icon/（不进仓库），
#   仓库里放的是它的可分发副本。
# 右侧第三列是**两边必须相同的像素尺寸**：`--apply` 落笔前会真的量一遍并拒绝尺寸不符的资产
#   （尺寸不符意味着基座换了图标规格，静默覆盖会把 Dock 图标换成一张模糊图）。
BUILD_DIR="$CHK/build"
# 资产位置。**只有一个家**（packaging/assets/brand-icons/），三种跑法都不许另存一份：
#   · 随包分发：payload/tools/brand-icons/（与脚本同目录，默认）
#   · 仓库内直接跑（开发/排障）：../packaging/assets/brand-icons/（此处回退）
#   · 调用方显式指定：assemble.sh 与 refresh-app-brand.sh 用 BRAND_ICONS_DIR 传入仓库侧那一份
# 为什么要回退而不是只报 MISSING：只报 MISSING 会**诱导**人去 dsh-patches/ 下复制一份资产
# 来「修好」它——那正好造出同一条事实的第二个家（P-07）。资产真的一个都没有时才报 MISSING。
if [ -z "${BRAND_ICONS_DIR:-}" ]; then
  SIBLING="$(dirname "$0")/brand-icons"
  REPO_SIDE="$(dirname "$0")/../packaging/assets/brand-icons"
  if [ -d "$SIBLING" ]; then BRAND_ICONS_DIR="$SIBLING"
  elif [ -d "$REPO_SIDE" ]; then BRAND_ICONS_DIR="$REPO_SIDE"
  else BRAND_ICONS_DIR="$SIBLING"; fi   # 都不在：照原样报 MISSING，并指出期望路径
fi
# 目标（app 侧 build/）:资产（brand-icons/ 内）:尺寸
ICON_PAIRS=(
  "app-icon-mac.png:icon-1024.png:1024x1024"
  "app-icon.png:icon-1024.png:1024x1024"
  "tray-icon-blue.png:tray-colored-16.png:16x16"
  "tray-icon-blue@1.25x.png:tray-colored-20.png:20x20"
  "tray-icon-blue@1.5x.png:tray-colored-24.png:24x24"
  "tray-icon-blue@2x.png:tray-colored-32.png:32x32"
  "tray-iconTemplate.png:tray-template-16.png:16x16"
  "tray-iconTemplate@2x.png:tray-template-32.png:32x32"
)
if [ -d "$BUILD_DIR" ]; then
  if [ ! -d "$BRAND_ICONS_DIR" ]; then
    # 没有资产就**说不出「图标是品牌态」**——不许静默跳过（P-02：读不到不等于合格）。
    say "MISSING brand-icons/（运行时图标资产）——本脚本无法核对 Dock / 托盘图标"
    fail=1
  else
    for pair in "${ICON_PAIRS[@]}"; do
      tgt="${pair%%:*}"; rest="${pair#*:}"; asset="${rest%%:*}"; dim="${rest#*:}"
      tf="$BUILD_DIR/$tgt"; af="$BRAND_ICONS_DIR/$asset"
      if [ ! -f "$af" ]; then say "MISSING brand-icons/$asset"; fail=1; continue; fi
      if [ ! -f "$tf" ]; then
        say "MISSING build/${tgt}（基座改了图标文件名？核对 ICON_PAIRS）"
        fail=1
        continue
      fi
      cur=$(shasum "$tf" | awk '{print $1}')
      want=$(shasum "$af" | awk '{print $1}')
      if [ "$cur" = "$want" ]; then
        say "OK   build/${tgt} ROOT 品牌图标（${dim}）"
      elif [ "$MODE" = "--apply" ]; then
        tdim="$(sips -g pixelWidth -g pixelHeight "$tf" 2>/dev/null | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w"x"h}')"
        if [ "$tdim" != "$dim" ]; then
          say "APPLY build/${tgt} 拒绝：目标实为 ${tdim}，资产表声明 ${dim}——先核对 ICON_PAIRS"
          fail=1
          continue
        fi
        cp "$af" "$tf"
        say "APPLY build/${tgt} ← ${asset}（${dim}）"
      else
        say "DRIFT build/${tgt}（${cur}）— Dock / 托盘图标仍是官方原样"
        fail=1
      fi
    done
  fi
fi

echo
if [ "$fail" = "0" ]; then echo "BRAND ALL VERIFIED"; else echo "BRAND DRIFT — 升级后跑 --apply"; fi
exit $fail
