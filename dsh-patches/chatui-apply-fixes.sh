#!/bin/bash
# =============================================================================
# DSH Desktop 2.0.4 对话页修复补丁（加载更早 + ⬆️ 回填上一条消息）
#
# 用法:
#   ./apply-fixes.sh            # 校验 + 幂等应用（已打补丁则跳过）
#   ./apply-fixes.sh --check    # 只校验，不改文件
#   ./apply-fixes.sh --rollback # 从 .orig 备份还原三个文件
#
# 安全设计（对齐"备份+语法门+启动门+回退"约定）:
#   1. 首次运行时把三个原始文件备份为 <file>.orig（幂等，不覆盖已有备份）
#   2. 每个替换都按"唯一锚点字符串"匹配，替换次数 != 1 立即中止
#   3. 全部替换后 node --check 语法门
#   4. 应用后提示 Cmd+R 刷新渲染器即可生效（无需重启应用）
#   5. --rollback 用 .orig 还原并再次过语法门
#   注意: 只改 renderer 端 client bundle，绝不触碰 main.js / 主进程文件。
# =============================================================================
set -euo pipefail

APP_NM="/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai"
FILES=(
  "dsh-api-session-controller/lib/client.js"
  "dsh-client-ui-chat/lib/client.js"
  "dsh-client-ui-conversation/lib/client.js"
)
MODE="${1:-apply}"

python3 - "$MODE" "$APP_NM" "${FILES[@]}" <<'PY'
import sys, io, subprocess, pathlib, shutil

mode = sys.argv[1]
app_nm = pathlib.Path(sys.argv[2])
files = [app_nm / f for f in sys.argv[3:]]

# ---------------------------------------------------------------- 锚点补丁
# 每个条目: (文件下标, 旧串, 新串, 说明)。旧串必须唯一匹配。
PATCHES = [
    # --- Phase 1a: loadOlder 自愈 + 错误显性化 + 超时（controller）---
    (0,
"""			/** Page up: pull one earlier page with the window's first seq as beforeSeq and prepend. */
			async loadOlder() {
				if (this.openState !== "open" || !this.hasMore || this.loadingOlder) return;
				const events = this.events;
				if (events === void 0) return;
				this.loadingOlder = true;
				this.notifier.markDirty();
				try {
					await events.prepend({
						beforeSeq: this.baseSeq,
						maxMessages: 50
					});
				} catch (error) {
					if (sessionStreamFailure(error) === void 0) console.error("[session-controller] loadOlder failed:", error);
				} finally {
					this.loadingOlder = false;
					this.notifier.markDirty();
				}
			}""",
"""			/** Page up: pull one earlier page with the window's first seq as beforeSeq and prepend. */
			async loadOlder() {
				if (!this.hasMore || this.loadingOlder) return;
				this.loadingOlder = true;
				this.notifier.markDirty();
				try {
					if (this.openState !== "open" || this.events === void 0) {
						if (this.openState === "error" || this.openState === "cold") await this.resync();
						if (this.openState !== "open" || this.events === void 0) {
							if (this.openError === null) this.openError = {
								code: "history-unavailable",
								message: "history stream is not open",
								details: {}
							};
							console.error("[session-controller] loadOlder blocked:", this.openState, this.openError);
							return;
						}
					}
					const events = this.events;
					let timer;
					try {
						await Promise.race([
							events.prepend({
								beforeSeq: this.baseSeq,
								maxMessages: 50
							}),
							new Promise((_, reject) => {
								timer = setTimeout(() => reject(new Error("loadOlder: history page request timed out")), 15e3);
							})
						]);
						this.openError = null;
					} catch (error) {
						this.openError = openFailure(error);
						console.error("[session-controller] loadOlder failed:", error);
					} finally {
						if (timer !== void 0) clearTimeout(timer);
					}
				} finally {
					this.loadingOlder = false;
					this.notifier.markDirty();
				}
			}""",
     "loadOlder self-heal + error surface + timeout"),
    # --- Phase 2a: snapshot 暴露 lastOwnMessage（controller）---
    (0,
"""			buildSnapshot() {
				return {
					sessionId: this.sessionId,""",
"""			buildSnapshot() {
				const lastOwnMessage = (() => {
					const entries = this.eventSource.snapshot.entries;
					for (let index = entries.length - 1; index >= 0; index--) {
						const event = entries[index].event;
						if (event.type !== "user/message" || event.data?.source?.kind !== "user") continue;
						const text = event.data?.content?.filter((part) => part.type === "text").map((part) => part.text).join("");
						return text === void 0 || text === "" ? void 0 : text;
					}
					return void 0;
				})();
				return {
					sessionId: this.sessionId,""",
     "buildSnapshot exposes lastOwnMessage"),
    (0,
"""					promptAttempted: this.promptAttempted,
					awaitingFirstTurn: this.firstPromptPendingTurn
				};
			}""",
"""					promptAttempted: this.promptAttempted,
					awaitingFirstTurn: this.firstPromptPendingTurn,
					lastOwnMessage
				};
			}""",
     "buildSnapshot lastOwnMessage field"),
    # --- Phase 1b: 按钮门 + 错误横幅（chat）---
    (1,
"""								openState === "error" && openError !== null && (0, react_jsx_runtime.jsx)("div", {
									className: ChatView_module_css_default.openError,
									children: t("chat.loadError", {
										message: openError.message,
										code: openError.code
									})
								}),
								hasMore && (0, react_jsx_runtime.jsx)("div", {""",
"""								openError !== null && (0, react_jsx_runtime.jsx)("div", {
									className: ChatView_module_css_default.openError,
									children: t("chat.loadError", {
										message: openError.message,
										code: openError.code
									})
								}),
								hasMore && openState === "open" && (0, react_jsx_runtime.jsx)("div", {""",
     "load-older button gated on openState"),
    # --- Phase 2b: 上箭头 recall 链路（conversation）---
    (2,
"""				if (handlers.arbitrate(key, inComposition) === "consumed") {
					event?.preventDefault();
					return true;
				}
				return false;
			};""",
"""				if (handlers.arbitrate(key, inComposition) === "consumed") {
					event?.preventDefault();
					return true;
				}
				if (key === "up" && !inComposition && handlers.recallPrevious !== void 0 && handlers.recallPrevious() === true) {
					event?.preventDefault();
					return true;
				}
				return false;
			};""",
     "arrow-up recall hook in composer keymap"),
    (2,
"""			const removed = useSession((s) => s.removed) ?? false;
			const planActive = useProjection("plan", (plan) => plan !== void 0 && (plan.pending ? !plan.active : plan.active));""",
"""			const removed = useSession((s) => s.removed) ?? false;
			const lastOwnMessage = useSession((s) => s.lastOwnMessage) ?? null;
			const planActive = useProjection("plan", (plan) => plan !== void 0 && (plan.pending ? !plan.active : plan.active));""",
     "InputBar lastOwnMessage selector"),
    (2,
"""				resolveSubmitMode,
				intakeImages
			});
			gate.current = {
				locked,
				machineBusy,
				canSteerQueue,
				running,
				subagent,
				resolveSubmitMode,
				intakeImages
			};""",
"""				resolveSubmitMode,
				intakeImages,
				empty,
				editable,
				lastOwnMessage
			});
			gate.current = {
				locked,
				machineBusy,
				canSteerQueue,
				running,
				subagent,
				resolveSubmitMode,
				intakeImages,
				empty,
				editable,
				lastOwnMessage
			};""",
     "InputBar gate carries recall state"),
    (2,
"""					pasteText: (text) => {
						if (gate.current.machineBusy || gate.current.locked) return;
						keyboard.paste(text);
					}
				});""",
"""					pasteText: (text) => {
						if (gate.current.machineBusy || gate.current.locked) return;
						keyboard.paste(text);
					},
					recallPrevious: () => {
						const g = gate.current;
						if (!g.editable || !g.empty || g.lastOwnMessage === void 0 || g.lastOwnMessage === null) return false;
						keyboard.paste(g.lastOwnMessage);
						return true;
					}
				});""",
     "InputBar recallPrevious handler"),
]

# 幂等签名：每个文件打上补丁后包含的独有字符串（二次运行直接跳过）
SIGNATURES = [
    "loadOlder: history page request timed out",   # controller: loadOlder 重写
    "hasMore && openState === \"open\"",           # chat: 按钮门
    "recallPrevious",                              # conversation: recall 链路
]

def syntax_ok(path):
    r = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    return r.returncode == 0

def apply_file(f):
    if not f.exists():
        print(f"!! missing: {f}")
        return False
    text = f.read_text(encoding="utf-8")
    idx = files.index(f)
    if SIGNATURES[idx] in text:
        print(f"== {f.name}: already patched, skip")
        return True
    orig = pathlib.Path(str(f) + ".orig")
    if not orig.exists():
        shutil.copyfile(f, orig)
        print(f"== {f.name}: backup -> {orig.name}")
    out = text
    for pidx, old, new, desc in PATCHES:
        if pidx != idx:
            continue
        n = out.count(old)
        if n != 1:
            print(f"!! {f.name}: anchor mismatch for [{desc}] (count={n}); abort")
            return False
        out = out.replace(old, new)
    if not syntax_ok_after(out):
        print(f"!! {f.name}: patched content failed node --check; abort")
        return False
    f.write_text(out, encoding="utf-8")
    print(f"== {f.name}: patched OK")
    return True

def syntax_ok_after(text):
    tmp = f.with_suffix(".js.check.tmp")
    tmp.write_text(text, encoding="utf-8")
    try:
        return syntax_ok(tmp)
    finally:
        tmp.unlink(missing_ok=True)

def rollback(f):
    orig = pathlib.Path(str(f) + ".orig")
    if not orig.exists():
        print(f"== {f.name}: no .orig backup, skip")
        return True
    if not syntax_ok(orig):
        print(f"!! {orig.name} fails node --check; abort rollback for safety")
        return False
    shutil.copyfile(orig, f)
    print(f"== {f.name}: rolled back from {orig.name}")
    return True

def verify_anchors():
    ok = True
    for f in files:
        orig = pathlib.Path(str(f) + ".orig")
        base = orig if orig.exists() else f
        if not base.exists():
            print(f"!! {f.name}: no file to verify")
            ok = False
            continue
        text = base.read_text(encoding="utf-8")
        for pidx, old, new, desc in PATCHES:
            if files[pidx] != f:
                continue
            n = text.count(old)
            status = "OK" if n == 1 else f"FAIL(count={n})"
            if n != 1:
                ok = False
            print(f"~~ {f.name}: [{desc}] anchor {status}")
    return ok

ok = True
if mode == "--rollback":
    for f in files:
        ok = rollback(f) and ok
elif mode == "--verify-anchors":
    ok = verify_anchors()
elif mode in ("apply", "--check"):
    for f in files:
        if mode == "--check":
            sig = "patched" if SIGNATURES[files.index(f)] in (f.read_text(encoding="utf-8") if f.exists() else "") else "original"
            print(f"~~ {f.name}: {f.exists() and ('present (' + sig + ')') or 'missing'}")
        else:
            ok = apply_file(f) and ok
else:
    print(f"usage: {sys.argv[0]} [apply|--check|--verify-anchors|--rollback]")
    ok = False

print("ALL OK" if ok else "ABORTED")
PY
