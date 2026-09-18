#!/bin/bash
#
# 以 CDP 调试端口重启 DSH Desktop，等 GUI 就绪后跑 C4 实况探针。
#
# ── 为什么需要它 ──────────────────────────────────────────────────────────────
#
# `open -a "DSH Desktop" --args --remote-debugging-port=9333` 有**时机陷阱**：
# `--args` 只在应用尚未运行时生效。若 DSH 已在运行，参数被静默丢弃——主进程 argv 里
# 根本没有这个开关，端口也不会开。2026-09-18 实测两处硬证据：
#   · 主进程 cmdline 为裸 `/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop`
#   · `curl http://127.0.0.1:9333/json/version` → 连接被拒（curl exit 7）
#
# 本脚本把顺序固定成「先退出 → 确认退干净 → 再启动 → **验证端口真的开了**」，并在
# `open --args` 没把端口带起来时改用直接执行主进程二进制兜底（参数必然进 argv）。
# 两条路都留痕，所以「哪种方式管用」本身也是可查的证据。
#
# ── 判活为什么不用 pgrep（踩过的坑，写下来免得再踩）──────────────────────────
#
# `pgrep -f "<路径>"` 会**匹配到执行本检查的那个 bash 自身**——调用方把整条命令作为
# `bash -c "..."` 执行，命令行里只要出现过那个路径字面量就会命中；而真正的 DSH 主进程
# **反而匹配不到**。实测三种变体全空：
#     pgrep -f "DSH Desktop.app/Contents/MacOS/DSH Desktop"   → 只命中自己的 bash
#     pgrep -f "Contents/MacOS/DSH Desktop"                   → 空
#     pgrep -x "DSH Desktop"                                  → 空（Electron 内核进程名对不上）
# 所以判活走 LaunchServices：
#     osascript -e 'application "DSH Desktop" is running'     →  true
# 它查应用注册表，不依赖命令行字符串，因此没有自匹配风险。该调用**不需要**「自动化」
# 权限（实测直接返回，无弹窗）；真正可能需要授权的是后面的 `quit`。
# 本脚本**不含 pkill**：退出只走 osascript，自动退不掉就停下来让人手动 Cmd+Q，
# 绝不按字符串杀进程——避免误杀调用方自身。
#
# ── 必须双击或在**系统终端**里跑 ─────────────────────────────────────────────
#
# 本脚本会退出 DSH 自身。在 DSH 的 bash 工具里跑，脚本会随 DSH 一起被杀。
# 最省事的方式：双击同目录下的 `Restart-DSH-CDP.command`。
#
# ── 安全 ─────────────────────────────────────────────────────────────────────
#
# CDP 是**无鉴权**的完整控制通道。本脚本只把端口绑在 loopback
# （--remote-debugging-address=127.0.0.1），不对外暴露。验证结束后正常 Cmd+Q 再启动
# 一次 DSH 即可关闭该端口。
#
# ── 副作用（如实声明）────────────────────────────────────────────────────────
#
# 探针在 DSH 渲染进程里遍历样式表并逐条读 token，可能造成**秒级卡顿**。它不写任何
# 变量、不改可见状态：探针元素全程 visibility:hidden，用完即移除。
#
# ── 就绪判据 ─────────────────────────────────────────────────────────────────
#
# 探针自带仪器自检——页面若是空壳，`页面枚举到 token` 会失败并 **exit 2**。所以
# 「反复调探针直到退出码不再是 2」是安全的就绪判据：**页面没就绪时绝不会出假绿**。
#
# 用法：bash scripts/acceptance/relaunch-dsh-cdp.sh [输出目录]
#   默认输出目录 /tmp/theme-audit/c4
# 退出码：透传探针退出码（0=读到且自检通过 / 1=有未解析 token / 2=前置条件或仪器不可用）

set -uo pipefail

PORT=9333
APP_NAME="DSH Desktop"
BIN="/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:-/tmp/theme-audit/c4}"

mkdir -p "$OUT"
exec > >(tee -a "$OUT/relaunch-dsh-cdp.log") 2>&1
trap 'sleep 0.3' EXIT   # 给 tee 时间 flush，否则最后几行可能不进日志

say() { printf '%s\n' "$*"; }
die() { printf '\n[FATAL] %s\n' "$*"; exit 2; }

port_open() { curl -sf --max-time 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; }
dsh_alive() { [ "$(osascript -e "application \"$APP_NAME\" is running" 2>/dev/null)" = "true" ]; }

wait_gone() {
  local i
  for i in $(seq 1 40); do dsh_alive || return 0; sleep 0.5; done
  return 1
}

quit_dsh() {
  dsh_alive || return 0
  osascript -e "quit application \"$APP_NAME\"" >/dev/null 2>&1 || true
  wait_gone
}

[ -x "$BIN" ] || die "找不到可执行文件：$BIN"
[ -f "$REPO/scripts/acceptance/theme-live-gui.mjs" ] || die "找不到探针脚本：$REPO/scripts/acceptance/theme-live-gui.mjs"

say "=== relaunch-dsh-cdp · $(date '+%Y-%m-%d %H:%M:%S') ==="

# ── 1) 端口已开就跳过重启 ────────────────────────────────────────────────────
if port_open; then
  say "[=] 端口 $PORT 已开，跳过重启。"
else
  say "[!] 端口 $PORT 未开 —— 需要带调试端口重启 DSH。"
  say "    这会退出你当前的 DSH（含正在跑的会话）。3 秒后开始，Ctrl+C 可取消。"
  sleep 3

  say "[*] 请求 DSH 退出（若弹出权限对话框，请点「允许」）…"
  quit_dsh || die "DSH 没能自动退出。请手动 Cmd+Q 退出 DSH，然后重新运行本脚本。"
  say "[+] DSH 已完全退出。"

  say "[*] 启动方式 A：open --args（走 LaunchServices，Dock/注册行为正常）"
  open -a "$APP_NAME" --args --remote-debugging-port="$PORT" --remote-debugging-address=127.0.0.1

  launched=0
  for i in $(seq 1 12); do port_open && { launched=1; break; }; sleep 1; done

  if [ "$launched" = 1 ]; then
    say "[+] 方式 A 生效：端口已开。"
  else
    say "[!] 方式 A 没把端口带起来（open --args 的时机问题复现）。改用方式 B。"
    quit_dsh || die "退不掉方式 A 拉起的实例，无法干净重试。请手动 Cmd+Q 后重跑。"
    say "[*] 启动方式 B：直接执行二进制（参数必然进 argv）"
    nohup "$BIN" --remote-debugging-port="$PORT" --remote-debugging-address=127.0.0.1 \
      >"$OUT/dsh-launch.log" 2>&1 &
    disown 2>/dev/null || true
  fi
fi

# ── 2) 等端口 ───────────────────────────────────────────────────────────────
say "[*] 等待 CDP 端口…"
ok=0
for i in $(seq 1 60); do port_open && { ok=1; break; }; sleep 1; done
[ "$ok" = 1 ] || die "等了 60 秒端口 $PORT 仍未开。看 $OUT/dsh-launch.log 与 $OUT/relaunch-dsh-cdp.log。"
say "[+] 端口已开：$(curl -s --max-time 3 "http://127.0.0.1:$PORT/json/version" | head -c 200)"

# ── 3) 等 GUI 就绪并跑探针 ───────────────────────────────────────────────────
cd "$REPO" || die "进不了仓库目录：$REPO"
say ""
say "[*] 跑探针（页面未就绪时探针自检会 exit 2，以此作就绪判据）…"

code=2
attempt=0
while [ "$attempt" -lt 15 ]; do
  attempt=$((attempt + 1))
  say ""
  say "---------- 探针第 $attempt 次 ----------"
  node scripts/acceptance/theme-live-gui.mjs --port "$PORT" --out "$OUT"
  code=$?
  if [ "$code" != 2 ]; then break; fi
  say "[·] 还没就绪（exit 2），5 秒后重试…"
  sleep 5
done

say ""
say "==================================================="
if [ "$code" = 2 ]; then
  say "探针 15 次全部 exit 2：始终没读到就绪的页面。"
  say "把 $OUT/relaunch-dsh-cdp.log 贴回会话，我来定位。"
else
  say "探针退出码：$code   （0=读完且自检通过 / 1=有未解析 token）"
  say "报告目录：$OUT"
fi
say "==================================================="
say ""
say "下一步：回到 DSH 里打开本会话，让我读 $OUT 下的报告。"
say "想测另一态（浅↔深）：在界面里切一次主题再重跑本脚本——端口已开，会跳过重启直接跑探针。"
exit "$code"
