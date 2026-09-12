#!/bin/bash
# first-launch-test.sh —— 干净环境首启实测（隔离 DSH_HOME + 隔离 userData + 独立端口）
#
# 用法: ./first-launch-test.sh <payload-dir>
# 环境: FL_HOME（默认 /tmp/dsh-firstlaunch）、FL_APPS、FL_PORT（默认 43910）、FL_ALIVE（默认 25）
#
# ## 为什么需要它（冒烟为什么不覆盖这一面）
#
# `smoke-test.sh` 断的是**产物的静态面**：安装退出码、文件落位、清单比对、补丁锚点、签名。
# 它**从不启动 app** —— 而「首启白屏 / 插件树装载失败 / override 层过期」这些事故只在
# **真启动**时才现形。2.0.0 的复盘里「打包产物真实启动 healthy」是一次人工动作，
# 没有脚本、没有判据、下一轮没人能复跑。本脚本把那一步变成可复跑的判据。
#
# ## 为什么必须起真正的 Electron app，而不是 `dsh --profile desktop`
#
# 实测（看板 C4）：CLI 路径在**装载阶段就整体失败**（`dsh: plugin tree failed to load`），
# 因为 desktop profile 的启动合约里有 Electron 壳侧的步骤（package overlay、
# YAML `!!js` tag 解析——CLI 会打印 `Unresolved tag: tag:yaml.org,2002:js`）。
# CLI 不是一次忠实启动，它的结论不能拿来判断客户机能否首启。
#
# ## 判据（四条，缺一不可；每条对应一个独立的失败模式）
#
#   ① 安装 exit 0 且 app 落位              —— 安装器本身没坏
#   ② 进程存活 ≥ FL_ALIVE 秒不退出          —— 不是「起来就崩」
#   ③ 日志出现带 token 的 URL，且 GET 它 200 + HTML —— web 服务与 GUI 真的被服务
#   ④ 日志里没有插件树装载失败              —— 插件树完整（「白屏」的机器可判据）
#
# 附：把所有关键行留档，便于人工复核首启时长与告警（首启要物化 ~1G，客户可感知）。
set -uo pipefail
PAYLOAD="${1:?用法: ./first-launch-test.sh <payload-dir>}"
PAYLOAD="$(cd "$PAYLOAD" && pwd)"
FL_HOME="${FL_HOME:-/tmp/dsh-firstlaunch}"
FL_APPS="${FL_APPS:-/tmp/dsh-firstlaunch-apps}"
FL_PORT="${FL_PORT:-43910}"
FL_ALIVE="${FL_ALIVE:-25}"

# ── 前置条件：本机不得已有正在运行的 DSH 实例 ─────────────────────────────────
# 2026-09-12 实测（三条，全部可复现）：
#   · 本机主实例（旧 app）正常启动：全流程 6.5s，其中 profile-composition 593ms；
#   · 新产物在同一隔离环境（独立 DSH_HOME + --user-data-dir + --port）**卡在
#     profile-composition**：启动事件流停在 `startup.stage.started`，进程 0% CPU、
#     无子进程、无网络连接、无 modal 会话（sample 显示主线程静在 AppKit 默认 runloop）；
#   · 把**已知可用的旧 app**放进同一隔离环境，**同样卡在同一阶段**。
# 结论：卡住的原因是「同一台机器上并存两个实例」，**不是产物的缺陷**。所以这里拒绝运行，
# 而不是打一条会被误读成产品缺陷的红。真验收路径只有一条：
#   装到 /Applications → **退出 DSH** → 重新启动（此时才是单实例）。
# 注：用 ps 而不是 pgrep —— macOS 的 `pgrep -f` 对本机 GUI 实例匹配不到
# （实测：同一条命令行，`ps -ax -o command=` 命中，`pgrep -f` 返回 1，原因不明）。
RUNNING="$(ps -ax -o command= 2>/dev/null | grep -F 'DSH Desktop.app/Contents/MacOS/DSH Desktop' \
  | grep -vE '(^| )grep |ps -ax -o command' | head -1)"
if [ -n "$RUNNING" ]; then
  echo "[firstlaunch] 跳过：本机已有 DSH 实例在运行。"
  echo "              双实例并存时新实例会卡在 profile-composition——新产物与已知可用的旧 app 现象完全相同，"
  echo "              这条红不代表产物有问题。真验收：装到 /Applications → 退出 DSH → 重新启动。"
  exit 2
fi

H="$FL_HOME"
DSH_HOME_FL="$H/.dsh"
APP_TARGET="$FL_APPS/DSH Desktop.app"
LOG="$H/app.log"
fail=0
pass(){ echo "[firstlaunch:ok] $*"; }
bad(){ echo "[firstlaunch:FAIL] $*"; fail=1; }

rm -rf "$H" "$FL_APPS"
mkdir -p "$H" "$FL_APPS"

# 0. 装到隔离位置（APP_TARGET 在 /tmp → 走免提权直写路径；不碰 /Applications 与 ~/.dsh）
DSH_HOME="$DSH_HOME_FL" APP_TARGET="$APP_TARGET" bash "$PAYLOAD/install.sh" > "$H/install.log" 2>&1
rc=$?
[ "$rc" = 0 ] && pass "install.sh exit 0" || bad "install.sh exit ${rc}（见 $H/install.log）"
if [ ! -d "$APP_TARGET" ]; then
  bad "app 未落位：$APP_TARGET"; echo; echo "FIRSTLAUNCH FAILED"; exit 1
fi
pass "app 落位 $APP_TARGET"

# 1. 启动（隔离 userData 使单实例锁、日志、缓存都不与用户正在运行的实例冲突）
BIN="$APP_TARGET/Contents/MacOS/DSH Desktop"
[ -x "$BIN" ] || { bad "Electron 二进制缺失: $BIN"; echo; echo "FIRSTLAUNCH FAILED"; exit 1; }
echo "[firstlaunch] 启动: DSH_HOME=$DSH_HOME_FL --user-data-dir=$H/userdata --port $FL_PORT"
DSH_HOME="$DSH_HOME_FL" "$BIN" --user-data-dir="$H/userdata" --port "$FL_PORT" > "$LOG" 2>&1 &
APP_PID=$!
cleanup(){
  kill "$APP_PID" 2>/dev/null
  sleep 2
  pkill -P "$APP_PID" 2>/dev/null
  kill -9 "$APP_PID" 2>/dev/null
}
trap cleanup EXIT

# 2. 存活判据
sleep "$FL_ALIVE"
if kill -0 "$APP_PID" 2>/dev/null; then
  pass "启动 ${FL_ALIVE}s 后进程仍存活（pid=${APP_PID}）"
else
  bad "进程在 ${FL_ALIVE}s 内退出"
  echo "--- 日志尾部 ---"; tail -30 "$LOG"
fi

# 3. 插件树装载失败（判据 ④）
if grep -qiE 'plugin tree failed to load|plugin tree failed' "$LOG"; then
  bad "插件树装载失败（白屏根因）"
  grep -inE 'plugin tree failed to load|plugin tree failed' "$LOG" | head -5
  echo "--- 装载错误上下文 ---"
  grep -nE 'Cannot find package|does not provide an export|Error:' "$LOG" | head -10
else
  pass "日志无插件树装载失败"
fi

# 4. 带 token 的 URL → GET → 200 + HTML（判据 ②③）
#    首页要 token（无 token 时回 401「dsh web authentication required」），所以判据不是
#    「端口能连上」，而是「日志给出的那条带 token 的 URL 能拿到 GUI」。
URL="$(grep -oE 'http://127\.0\.0\.1:[0-9]+[^[:space:]]*' "$LOG" | tail -1)"
if [ -n "$URL" ]; then
  pass "日志给出访问 URL: $URL"
  CODE="$(curl -sS -o "$H/index.html" -w '%{http_code}' --max-time 15 "$URL" 2>/dev/null)"
  [ "$CODE" = 200 ] && pass "GET URL → 200" || bad "GET URL → $CODE"
  if grep -qiE '<div id="root"|<!doctype html|<title>' "$H/index.html" 2>/dev/null; then
    pass "返回 HTML（GUI 被真实服务，$(wc -c < "$H/index.html" | tr -d ' ') 字节）"
  else
    bad "返回内容不像 GUI HTML"; head -c 300 "$H/index.html" 2>/dev/null; echo
  fi
else
  bad "日志里没有出现访问 URL（web 服务可能未起来）"
  echo "--- 日志尾部 ---"; tail -30 "$LOG"
fi

echo
echo "=== 首启日志关键行 ==="
grep -inE 'ready|listen|http://127|profile|materialize|embedded|error|failed' "$LOG" 2>/dev/null | head -20
echo
[ "$fail" = 0 ] && echo "FIRSTLAUNCH PASSED" || echo "FIRSTLAUNCH FAILED"
exit $fail
