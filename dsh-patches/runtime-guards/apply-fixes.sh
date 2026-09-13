#!/bin/bash
# =============================================================================
# LUTE runtime guards 补丁（2026-09-13 白屏事故的机制修复 + 可观测性修复）
#
#   G1 · HMR production guard（dsh-client-hmr host 侧）
#        生产模式（非 Electron dev、无 DSH_DEV=1）下 poll 到 bundle 字节变化
#        只推进 watch 基线、不 re-hash、不推 rebuilt 帧。杜绝「运行中替换
#        app bundle → HMR 热更崩渲染器 → 整屏白屏」。
#   G2 · renderer console forwarding（electron-runtime-*.js）
#        主进程订阅 console-message 转发宿主日志（兼容新旧 Electron 事件
#        签名）。没有它，UI 层静默失败在主日志零痕迹。
#
# 用法:
#   ./apply-fixes.sh apply             # 幂等应用（已打补丁则跳过）
#   ./apply-fixes.sh --check           # 只报告状态，不改文件
#   ./apply-fixes.sh --verify-anchors  # 对 .orig 基线验证锚点唯一（升级后体检）
#   ./apply-fixes.sh --rollback        # 从 .orig 备份还原
#
# 环境: DSH_APP（默认 /Applications/DSH Desktop.app）
# 纪律: 锚点唯一（count==1 才落笔）→ node --check → .orig 备份 → 完整重启生效
#       （G1/G2 都是主进程/宿主侧代码，Cmd+R 无效）。
# =============================================================================
set -euo pipefail

DSH_APP="${DSH_APP:-/Applications/DSH Desktop.app}"
UNP="$DSH_APP/Contents/Resources/app.asar.unpacked"
G1_FILE="$UNP/node_modules/@deepseek-ai/dsh-client-hmr/lib/index.js"
G2_FILE="$(ls "$UNP"/lib/electron-runtime-*.js 2>/dev/null | grep -v '\.map$' | grep -v '\.orig' | head -1 || true)"
MODE="${1:-apply}"

if [ ! -d "$UNP" ]; then
  echo "[runtime-guards] ✗ 找不到 app.asar.unpacked: $UNP" >&2
  exit 1
fi

python3 - "$MODE" "$G1_FILE" "$G2_FILE" <<'PY'
import sys, subprocess, pathlib, shutil

mode = sys.argv[1]
g1 = pathlib.Path(sys.argv[2])
g2 = pathlib.Path(sys.argv[3]) if sys.argv[3] else None

# ---------------------------------------------------------------- 锚点补丁
G1_OLD = """\tconst rehash = (id, watch, current) => {
\t\ttry {
\t\t\tctx.clientModules.rebuilt(id);"""
G1_NEW = """\tconst rehash = (id, watch, current) => {
\t\t// Production guard (2026-09-13): the rebuilt frame exists for the dev
\t\t// reload chain. In a packaged app there is no dev:web runtime that can
\t\t// hot-swap a live page, so an external process rewriting bundle bytes
\t\t// (e.g. an installer replacing the .app while it is running) would push
\t\t// rebuilt frames the renderer cannot safely apply, crashing it to a
\t\t// blank window. In production we only advance the watch baseline and
\t\t// stay idle; the next full restart re-composes from the new bytes.
\t\tif (process.defaultApp !== true && process.env.DSH_DEV !== "1") {
\t\t\twatch.mtimeMs = current.mtimeMs;
\t\t\twatch.size = current.size;
\t\t\twatch.dirty = false;
\t\t\treturn;
\t\t}
\t\ttry {
\t\t\tctx.clientModules.rebuilt(id);"""

G2_OLD = """\t\twindow.webContents.session?.setPermissionRequestHandler?.((_wc, permission, callback) => callback(permission === "clipboard-sanitized-write" || permission === "clipboard-write"));
\t\twindow.once("ready-to-show", revealStartupSurface);"""
G2_NEW = """\t\twindow.webContents.session?.setPermissionRequestHandler?.((_wc, permission, callback) => callback(permission === "clipboard-sanitized-write" || permission === "clipboard-write"));
\t\twindow.webContents.on("console-message", (_event, ...args) => {
\t\t\tlet level, message, line, sourceId;
\t\t\tif (args.length >= 1 && typeof args[0] === "object" && args[0] !== null && "message" in args[0]) {
\t\t\t\tconst d = args[0];
\t\t\t\tlevel = d.level; message = d.message; line = d.lineNumber; sourceId = d.sourceId;
\t\t\t} else {
\t\t\t\t[level, message, line, sourceId] = args;
\t\t\t}
\t\t\tconst severity = typeof level === "number" ? level : ({ verbose: 0, info: 1, warning: 2, error: 3 }[level] ?? 1);
\t\t\tconst text = `[Renderer] ${message} (${sourceId}:${line})`;
\t\t\tif (severity >= 3) this.options.logError(text);
\t\t\telse if (typeof this.options.logInfo === "function") this.options.logInfo(text);
\t\t});
\t\twindow.once("ready-to-show", revealStartupSurface);"""

G1_SIG = "Production guard (2026-09-13)"
G2_SIG = "console-message"

def syntax_ok_text(text):
    tmp = pathlib.Path("/tmp/runtime-guards-syntax-check.js")
    tmp.write_text(text, encoding="utf-8")
    try:
        r = subprocess.run(["node", "--check", str(tmp)], capture_output=True, text=True)
        return r.returncode == 0
    finally:
        tmp.unlink(missing_ok=True)

def apply_one(f, old, new, sig, desc):
    if f is None or not f.exists():
        print(f"!! {desc}: missing target {f}")
        return False
    text = f.read_text(encoding="utf-8")
    if sig in text:
        print(f"== {desc}: already patched, skip")
        return True
    n = text.count(old)
    if n != 1:
        print(f"!! {desc}: anchor mismatch (count={n}); abort")
        return False
    out = text.replace(old, new)
    if not syntax_ok_text(out):
        print(f"!! {desc}: patched content failed node --check; abort")
        return False
    orig = pathlib.Path(str(f) + ".orig")
    if not orig.exists():
        shutil.copyfile(f, orig)
        print(f"== {desc}: backup -> {orig.name}")
    f.write_text(out, encoding="utf-8")
    print(f"== {desc}: patched OK")
    return True

def check_one(f, sig, desc):
    if f is None or not f.exists():
        print(f"~~ {desc}: missing")
        return False
    state = "patched" if sig in f.read_text(encoding="utf-8") else "original"
    print(f"~~ {desc}: present ({state})")
    return True

def verify_anchors_one(f, old, desc):
    if f is None:
        print(f"~~ {desc}: no file to verify")
        return False
    orig = pathlib.Path(str(f) + ".orig")
    base = orig if orig.exists() else f
    if not base.exists():
        print(f"~~ {desc}: no baseline to verify")
        return False
    n = base.read_text(encoding="utf-8").count(old)
    ok = n == 1
    print(f"~~ {desc}: anchor {'OK' if ok else f'FAIL(count={n})'}")
    return ok

def rollback_one(f, sig, desc):
    if f is None:
        return True
    orig = pathlib.Path(str(f) + ".orig")
    if not orig.exists():
        print(f"== {desc}: no .orig backup, skip")
        return True
    r = subprocess.run(["node", "--check", str(orig)], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"!! {desc}: .orig fails node --check; abort rollback for safety")
        return False
    shutil.copyfile(orig, f)
    print(f"== {desc}: rolled back from {orig.name}")
    return True

ok = True
if mode == "--rollback":
    ok = rollback_one(g1, G1_SIG, "G1 hmr-guard") and ok
    ok = rollback_one(g2, G2_SIG, "G2 console-forward") and ok
elif mode == "--verify-anchors":
    ok = verify_anchors_one(g1, G1_OLD, "G1 hmr-guard") and ok
    ok = verify_anchors_one(g2, G2_OLD, "G2 console-forward") and ok
elif mode == "apply":
    ok = apply_one(g1, G1_OLD, G1_NEW, G1_SIG, "G1 hmr-guard") and ok
    ok = apply_one(g2, G2_OLD, G2_NEW, G2_SIG, "G2 console-forward") and ok
else:  # --check
    ok = check_one(g1, G1_SIG, "G1 hmr-guard") and ok
    ok = check_one(g2, G2_SIG, "G2 console-forward") and ok

print("ALL OK" if ok else "ABORTED")
sys.exit(0 if ok else 1)
PY
