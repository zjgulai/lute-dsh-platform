#!/usr/bin/env bash
# 出海技能页 · 用真浏览器把 compose-page.mjs 产出的 HTML 拍成图。
#
# 三条踩过的坑，都写死在脚本里（每条都有实测依据）：
#   1. --user-data-dir 必须指向临时目录，否则会去接管用户正在用的 Chrome 配置。
#   2. **每张图换一个临时 profile**：复用同一目录时，前一个实例还没退干净，
#      新实例会挂上去永久等待（实测 7 张只出 1 张）。
#   3. **Chrome 写完图不退出**（实测 headless=old 也要挂满 50s 看门狗）。
#      所以不靠退出码判成功：盯文件出现，落定后按临时 profile 精确杀进程。
#      macOS 没有 timeout(1)，超时用轮询实现。
#
# 用法：bash .scratch/overseas-skills-refactor/shoot-pages.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$HERE/acceptance"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "FAIL: 找不到 Chrome：$CHROME"; exit 1; }

FAILED=0
shoot() { # $1=html $2=png $3=WxH $4=最多等几秒
  local html="$1" png="$2" size="$3" secs="${4:-40}"
  local out="$DIR/$png"
  local profile; profile="$(mktemp -d /tmp/dsh-ovs-shot.XXXXXX)"
  rm -f "$out"
  "$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --disable-extensions --disable-component-update --disable-background-networking \
    --user-data-dir="$profile" --force-device-scale-factor=1 --hide-scrollbars \
    --window-size="$size" --screenshot="$out" "file://$DIR/$html" >/dev/null 2>&1 &
  local waiter=$!
  local i
  for ((i = 0; i < secs; i++)); do
    sleep 1
    [ -s "$out" ] && { sleep 1; break; }
  done
  kill -9 "$waiter" 2>/dev/null
  pkill -9 -f "user-data-dir=$profile" 2>/dev/null
  wait "$waiter" 2>/dev/null
  rm -rf "$profile"
  if [ -s "$out" ]; then
    printf 'ok   %-30s %sx%s  %sB\n' "$png" \
      "$(sips -g pixelWidth "$out" 2>/dev/null | awk '/pixelWidth/{print $2}')" \
      "$(sips -g pixelHeight "$out" 2>/dev/null | awk '/pixelHeight/{print $2}')" \
      "$(stat -f %z "$out")"
  else
    printf 'FAIL %-30s 等了 %ss 没出图\n' "$png" "$secs"
    FAILED=$((FAILED + 1))
  fi
}

shoot page-light-firstpaint.html  page-light-firstpaint.png  1280,633  40
shoot page-light-planes.html      page-light-planes.png      1280,633  40
shoot page-light-degraded.html    page-light-degraded.png    1280,633  40
shoot page-dark-firstpaint.html   page-dark-firstpaint.png   1280,633  40
shoot page-light-drilled.html     page-light-drilled.png     1280,6000 60
shoot page-dark-drilled.html      page-dark-drilled.png      1280,6000 60
shoot page-light-diagnostics.html page-light-diagnostics.png 1280,6000 60

if [ "$FAILED" -gt 0 ]; then
  echo "SHOOT DONE（$FAILED 张失败）"
  exit 1
fi

# 顶部裁切图（聊天里发给用户看的就是它们）：产地只有 crop-tops.py 一处，
# 出处由 verify-pages.py 逐像素复核——否则「聊天里的证据」可以来自任何一版页面。
python3 "$HERE/crop-tops.py" || exit 1
echo "SHOOT DONE（7/7 + 裁切）"
