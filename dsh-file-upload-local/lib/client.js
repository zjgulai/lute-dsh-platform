window.__ModuleLoader__.load({
	id: "dsh-file-upload",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const { jsx, jsxs, Fragment } = require("react/jsx-runtime");
		const { IconPaperclipOutline16, writeClipboard } = require("@deepseek-ai/dsh-client-ui-primitives");
		const { useState, useRef, useEffect, useCallback } = React;

		const inject = ["slots"];
		const UPLOAD_URL   = "/__dsh-file-upload";
		const LIST_URL     = "/__dsh-attach-list";
		const SKILLS_URL   = "/__dsh-skills-list";
		const LOOPX_URL    = "/__dsh-loopx-start";
		const MAX_FILE_BYTES = 12 * 1024 * 1024;

		// ─── helpers ───────────────────────────────────────────────────────────────

		function toBase64(buf) {
			const bytes = new Uint8Array(buf);
			let binary = "";
			const CHUNK = 0x8000;
			for (let i = 0; i < bytes.length; i += CHUNK)
				binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
			return btoa(binary);
		}

		/** Insert text at the Lexical composer caret; returns true on success. */
		function insertAtCaret(text) {
			try {
				let el = document.activeElement;
				if (el && typeof el.closest === "function") {
					const ce = el.closest("[contenteditable='true']");
					if (ce) el = ce;
				}
				if (!el || !el.isContentEditable)
					el = document.querySelector("[data-composer-card] [contenteditable='true']");
				if (el && el.isContentEditable) {
					el.focus();
					if (document.execCommand("insertText", false, text)) return true;
				}
			} catch { /* fall through */ }
			return false;
		}

		// ─── styles (inline, no external CSS) ────────────────────────────────────

		const BTN_STYLE = {
			display: "inline-flex", alignItems: "center", justifyContent: "center",
			width: "28px", height: "28px", borderRadius: "8px",
			background: "transparent", border: "none",
			color: "var(--dsw-alias-label-secondary, #9a9aa0)", cursor: "pointer",
			flexShrink: 0,
		};
		const BTN_ACTIVE_STYLE = {
			...BTN_STYLE,
			background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.07))",
			color: "var(--dsw-alias-label-primary, #1a1a1a)",
		};
		const PANEL_STYLE = {
			position: "absolute", bottom: "calc(100% + 8px)", left: "0",
			width: "320px", maxHeight: "440px",
			background: "var(--dsw-specific-menu, #fff)",
			border: "1px solid var(--dsw-alias-border-inverted, #e5e5e5)",
			borderRadius: "12px", boxShadow: "var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.12))",
			display: "flex", flexDirection: "column", overflow: "hidden",
			zIndex: 200,
		};
		const TABS_STYLE = {
			display: "flex", borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)",
			flexShrink: 0,
		};
		const TAB_STYLE = (active) => ({
			flex: 1, padding: "8px 0", fontSize: "12px", fontWeight: active ? 600 : 400,
			color: active ? "var(--dsw-alias-state-business-primary, #1677ff)" : "var(--dsw-alias-label-tertiary, #9a9aa0)",
			background: "transparent", border: "none", cursor: "pointer", borderBottom: active ? "2px solid var(--dsw-alias-state-business-primary, #1677ff)" : "2px solid transparent",
			marginBottom: "-1px",
		});
		const SCROLL_STYLE = { flex: 1, overflowY: "auto", overflowX: "hidden" };
		const ROW_STYLE = {
			display: "flex", alignItems: "center", gap: "8px",
			padding: "7px 12px", fontSize: "13px",
			color: "var(--dsw-alias-label-primary, #1a1a1a)",
			cursor: "pointer", border: "none", background: "transparent",
			width: "100%", textAlign: "left",
			borderBottom: "1px solid var(--dsw-alias-border-l1, #f5f5f5)",
		};
		const SEARCH_STYLE = {
			width: "100%", boxSizing: "border-box", padding: "7px 12px",
			fontSize: "13px", border: "none", borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)",
			background: "transparent", color: "var(--dsw-alias-label-primary, #1a1a1a)",
			outline: "none", flexShrink: 0,
		};
		const BREADCRUMB_STYLE = {
			padding: "6px 12px", fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #9a9aa0)",
			borderBottom: "1px solid var(--dsw-alias-border-l1, #f5f5f5)", flexShrink: 0,
			display: "flex", alignItems: "center", gap: "4px",
		};
		const EMPTY_STYLE = { padding: "24px 12px", textAlign: "center", fontSize: "13px", color: "var(--dsw-alias-label-tertiary, #9a9aa0)" };

		// ─── icon glyphs (inline SVG strings) ─────────────────────────────────────

		const IcoDir  = () => jsx("span", { style: { fontSize: "14px" }, children: "📁" });
		const IcoFile = () => jsx("span", { style: { fontSize: "14px" }, children: "📄" });
		const IcoSkill= () => jsx("span", { style: { fontSize: "14px" }, children: "🔧" });
		const IcoApp  = () => jsx("span", { style: { fontSize: "14px" }, children: "⚡" });
		const IcoGoal = () => jsx("span", { style: { fontSize: "14px" }, children: "🎯" });
		const IcoUp   = () => jsx("span", { style: { fontSize: "14px" }, children: "⬆️" });

		// ─── Tab 1: Files ──────────────────────────────────────────────────────────

		function FilesTab({ onInsert, sessionId }) {
			const [path, setPath] = useState("");
			const [entries, setEntries] = useState(null);
			const [loading, setLoading] = useState(false);
			const [error, setError] = useState(null);
			const [query, setQuery] = useState("");
			const fileInputRef = useRef(null);
			const [uploading, setUploading] = useState(false);

			const load = useCallback(async (p) => {
				setLoading(true); setError(null);
				try {
					const res = await fetch(`${LIST_URL}?path=${encodeURIComponent(p)}`);
					const data = await res.json();
					if (data.ok) { setEntries(data.entries); setPath(p); }
					else setError(data.error ?? "load failed");
				} catch (e) { setError(e.message); }
				finally { setLoading(false); }
			}, []);

			useEffect(() => { load(""); }, [load]);

			const filtered = (entries ?? []).filter(e =>
				!query || e.name.toLowerCase().includes(query.toLowerCase())
			);

			const onUploadFile = async (e) => {
				const files = Array.from(e.target.files ?? []);
				e.target.value = "";
				if (!files.length) return;
				setUploading(true);
				for (const file of files) {
					if (file.size > MAX_FILE_BYTES) continue;
					const buf = await file.arrayBuffer();
					const res = await fetch(UPLOAD_URL, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ name: file.name, bytes: toBase64(buf) }),
					});
					const data = await res.json().catch(() => ({}));
					if (data.ok) { onInsert(`@${data.relativePath}`); await load(path); }
				}
				setUploading(false);
			};

			const breadcrumb = path ? path.split("/").filter(Boolean) : [];

			return jsxs(Fragment, { children: [
				// breadcrumb + back
				path ? jsx("div", {
					style: BREADCRUMB_STYLE,
					children: jsxs(Fragment, { children: [
						jsx("button", {
							style: { ...BTN_STYLE, width: "auto", padding: "0 4px", height: "20px", fontSize: "11px", color: "var(--dsw-alias-state-business-primary, #1677ff)" },
							onClick: () => load(breadcrumb.slice(0, -1).join("/")),
							children: "← 返回",
						}),
						jsx("span", { children: " / " + breadcrumb.join(" / ") }),
					]})
				}) : null,
				// search
				jsx("input", {
					style: SEARCH_STYLE, placeholder: "搜索文件…", value: query,
					onChange: e => setQuery(e.target.value),
				}),
				// list
				jsx("div", { style: SCROLL_STYLE, children:
					loading ? jsx("div", { style: EMPTY_STYLE, children: "加载中…" }) :
					error   ? jsx("div", { style: { ...EMPTY_STYLE, color: "var(--dsw-alias-state-error-primary,#f00)" }, children: error }) :
					!filtered.length ? jsx("div", { style: EMPTY_STYLE, children: query ? "无匹配结果" : "目录为空" }) :
					filtered.map(e => jsx("button", {
						style: ROW_STYLE, key: e.relativePath,
						onClick: () => e.type === "dir" ? load(e.relativePath) : onInsert(`@${e.relativePath}`),
						onMouseOver: ev => { ev.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))"; },
						onMouseOut:  ev => { ev.currentTarget.style.background = "transparent"; },
						children: jsxs(Fragment, { children: [
							e.type === "dir" ? jsx(IcoDir, {}) : jsx(IcoFile, {}),
							jsx("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.name }),
							e.type === "dir" ? jsx("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-caption,#bbb)" }, children: "›" }) : null,
						]}),
					}))
				}),
				// upload button
				jsxs("div", {
					style: { padding: "8px 12px", borderTop: "1px solid var(--dsw-alias-border-l2,#eee)", display: "flex", gap: "8px", flexShrink: 0 },
					children: [
						jsx("button", {
							style: {
								flex: 1, padding: "6px 12px", fontSize: "12px", borderRadius: "8px",
								background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))",
								border: "none", cursor: "pointer", color: "var(--dsw-alias-label-primary,#1a1a1a)",
								display: "flex", alignItems: "center", gap: "6px", justifyContent: "center",
							},
							disabled: uploading,
							onClick: () => fileInputRef.current?.click(),
							children: jsxs(Fragment, { children: [jsx(IcoUp, {}), uploading ? "上传中…" : "上传新文件"] }),
						}),
						jsx("input", { type: "file", multiple: true, ref: fileInputRef, style: { display: "none" }, onChange: onUploadFile }),
					],
				}),
			]});
		}

		// ─── Tab 2: Skills ─────────────────────────────────────────────────────────

		function SkillsTab({ onInsert }) {
			const [skills, setSkills] = useState(null);
			const [query, setQuery]   = useState("");

			useEffect(() => {
				fetch(SKILLS_URL).then(r => r.json()).then(d => { if (d.ok) setSkills(d.skills); }).catch(() => setSkills([]));
			}, []);

			const filtered = (skills ?? []).filter(s => !query || s.toLowerCase().includes(query.toLowerCase()));

			return jsxs(Fragment, { children: [
				jsx("input", { style: SEARCH_STYLE, placeholder: "搜索技能…", value: query, onChange: e => setQuery(e.target.value) }),
				jsx("div", { style: SCROLL_STYLE, children:
					skills === null ? jsx("div", { style: EMPTY_STYLE, children: "加载中…" }) :
					!filtered.length ? jsx("div", { style: EMPTY_STYLE, children: query ? "无匹配技能" : "无已安装技能" }) :
					filtered.map(s => jsx("button", {
						key: s, style: ROW_STYLE,
						onClick: () => onInsert(`/${s}`),
						onMouseOver: ev => { ev.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))"; },
						onMouseOut:  ev => { ev.currentTarget.style.background = "transparent"; },
						children: jsxs(Fragment, { children: [jsx(IcoSkill, {}), jsx("span", { style: { flex: 1 }, children: s })] }),
					}))
				}),
			]});
		}

		// ─── Tab 3: Apps ───────────────────────────────────────────────────────────

		function AppsTab({ onInsert, onClose }) {
			const [goalMode, setGoalMode] = useState(false);
			const [goalText, setGoalText] = useState("");
			const [launching, setLaunching] = useState(false);
			const [launchResult, setLaunchResult] = useState(null);

			const APPS = [
				{ id: "loopx-goal", label: "LoopX 长周期目标", desc: "输入目标，自动启动 Loop + Goal Loop 持续执行", icon: jsx(IcoGoal, {}) },
				{ id: "web-search", label: "Web 搜索", desc: "在草稿中插入 web_search 任务模板", icon: jsx("span", { style: { fontSize: "14px" }, children: "🔍" }) },
				{ id: "code-review", label: "代码审查", desc: "在草稿中插入代码审查任务模板", icon: jsx("span", { style: { fontSize: "14px" }, children: "🔎" }) },
			];

			const handleApp = (id) => {
				if (id === "loopx-goal") { setGoalMode(true); return; }
				if (id === "web-search")  { onInsert("请使用 web_search 工具搜索："); return; }
				if (id === "code-review") { onInsert("请对当前工作区的代码进行审查，重点关注："); return; }
			};

			const launchGoal = async () => {
				if (!goalText.trim()) return;
				setLaunching(true); setLaunchResult(null);
				try {
					const res = await fetch(LOOPX_URL, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ goalText: goalText.trim() }),
					});
					const data = await res.json().catch(() => ({}));
					setLaunchResult(data);
					// Insert a guiding prompt into the composer draft
					const prompt = `/loopx\n\n目标：${goalText.trim()}` +
						(data.activation?.goal_id ? `\n\n（LoopX goalId: ${data.activation.goal_id}）` : "");
					onInsert(prompt);
					setTimeout(onClose, 1200);
				} catch (e) {
					setLaunchResult({ ok: false, error: e.message });
				} finally {
					setLaunching(false);
				}
			};

			if (goalMode) return jsxs("div", { style: { display: "flex", flexDirection: "column", flex: 1 }, children: [
				jsx("button", {
					style: { ...ROW_STYLE, borderBottom: "1px solid var(--dsw-alias-border-l2,#eee)", color: "var(--dsw-alias-state-business-primary,#1677ff)", fontWeight: 500 },
					onClick: () => { setGoalMode(false); setLaunchResult(null); },
					children: "← 返回",
				}),
				jsxs("div", { style: { padding: "12px", display: "flex", flexDirection: "column", gap: "10px", flex: 1 }, children: [
					jsx("div", { style: { fontSize: "13px", fontWeight: 600, color: "var(--dsw-alias-label-primary,#1a1a1a)" }, children: "🎯 LoopX 长周期目标" }),
					jsx("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary,#9a9aa0)", lineHeight: 1.5 }, children: "输入目标后，LoopX 将自动分解任务、持续执行并保持状态跨会话可恢复。" }),
					jsx("textarea", {
						style: {
							width: "100%", boxSizing: "border-box", padding: "8px",
							fontSize: "13px", borderRadius: "8px", minHeight: "80px",
							border: "1px solid var(--dsw-alias-border-l2,#eee)",
							background: "var(--dsw-alias-bg-base,#fff)",
							color: "var(--dsw-alias-label-primary,#1a1a1a)",
							outline: "none", resize: "vertical", lineHeight: 1.5,
						},
						placeholder: "例：重构支付模块并保持每个 PR 可独立审查",
						value: goalText,
						onChange: e => setGoalText(e.target.value),
					}),
					launchResult && jsx("div", {
						style: { fontSize: "12px", color: launchResult.ok ? "var(--dsw-alias-state-success-primary,green)" : "var(--dsw-alias-state-error-primary,red)", lineHeight: 1.4 },
						children: launchResult.ok ? `✅ Goal 已启动，引导 prompt 已插入草稿` : `⚠️ ${launchResult.error ?? "启动失败，将直接插入 /loopx 草稿"}`,
					}),
					jsx("button", {
						style: {
							padding: "8px 0", borderRadius: "8px", border: "none", cursor: launching ? "default" : "pointer",
							background: "var(--dsw-alias-state-business-primary,#1677ff)", color: "#fff",
							fontSize: "13px", fontWeight: 500, opacity: launching ? 0.6 : 1,
						},
						disabled: launching || !goalText.trim(),
						onClick: launchGoal,
						children: launching ? "启动中…" : "启动 LoopX Goal Loop",
					}),
				]}),
			]});

			return jsx("div", { style: SCROLL_STYLE, children:
				APPS.map(app => jsx("button", {
					key: app.id, style: ROW_STYLE,
					onClick: () => handleApp(app.id),
					onMouseOver: ev => { ev.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))"; },
					onMouseOut:  ev => { ev.currentTarget.style.background = "transparent"; },
					children: jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px" }, children: [
						jsxs("div", { style: { display: "flex", alignItems: "center", gap: "6px" }, children: [app.icon, jsx("span", { style: { fontWeight: 500 }, children: app.label })] }),
						jsx("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary,#9a9aa0)", paddingLeft: "22px" }, children: app.desc }),
					]}),
				}))
			});
		}

		// ─── AttachPanel (overlay) ─────────────────────────────────────────────────

		const TABS = ["文件", "技能", "应用"];

		function AttachPanel({ onClose, inputActions, useInput, sessionId }) {
			const [tab, setTab] = useState(0);
			const panelRef = useRef(null);
			const currentDraft = useInput ? useInput(s => s.draft ?? "") : "";

			// Close on outside click
			useEffect(() => {
				const handler = (e) => {
					if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
				};
				document.addEventListener("pointerdown", handler, true);
				return () => document.removeEventListener("pointerdown", handler, true);
			}, [onClose]);

			// Close on Escape
			useEffect(() => {
				const handler = (e) => { if (e.key === "Escape") onClose(); };
				document.addEventListener("keydown", handler);
				return () => document.removeEventListener("keydown", handler);
			}, [onClose]);

			const onInsert = useCallback((text) => {
				const separator = currentDraft && !currentDraft.endsWith(" ") && !currentDraft.endsWith("\n") ? " " : "";
				const next = currentDraft + separator + text;
				if (inputActions?.setDraft) {
					inputActions.setDraft(next);
				} else {
					insertAtCaret(text);
				}
				onClose();
			}, [currentDraft, inputActions, onClose]);

			return jsx("div", {
				ref: panelRef,
				style: PANEL_STYLE,
				children: jsxs(Fragment, { children: [
					// tab bar
					jsx("div", {
						style: TABS_STYLE,
						children: TABS.map((t, i) => jsx("button", {
							key: t, style: TAB_STYLE(tab === i), onClick: () => setTab(i),
							children: t,
						})),
					}),
					// content
					jsx("div", {
						style: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 },
						children:
							tab === 0 ? jsx(FilesTab,  { onInsert, sessionId }) :
							tab === 1 ? jsx(SkillsTab, { onInsert }) :
							            jsx(AppsTab,   { onInsert, onClose }),
					}),
				]})
			});
		}

		// ─── Wrapper: positioned container ────────────────────────────────────────

		function AttachButton(props) {
			const [open, setOpen] = useState(false);
			const wrapRef = useRef(null);
			const toggle = () => setOpen(v => !v);
			const close  = useCallback(() => setOpen(false), []);

			// inputActions + useInput are injected via standardProps from conversation.input.left
			const { inputActions, useInput, sessionId } = props;

			return jsx("div", {
				ref: wrapRef,
				style: { position: "relative", display: "inline-flex", alignItems: "center" },
				children: jsxs(Fragment, { children: [
					jsx("button", {
						type: "button",
						style: open ? BTN_ACTIVE_STYLE : BTN_STYLE,
						title: "附件（文件 / 技能 / 应用）",
						"aria-label": "添加附件",
						"aria-expanded": open,
						onClick: toggle,
						children: jsx(IconPaperclipOutline16, { size: 14 }),
					}),
					open && jsx(AttachPanel, { onClose: close, inputActions, useInput, sessionId }),
				]}),
			});
		}

		// ─── Plugin registration ───────────────────────────────────────────────────

		function apply(ctx) {
			ctx.slots.inject("conversation.input.left", () =>
				ctx.slots.register(
					{ name: "conversation.input.left", id: "dsh-file-upload", order: 0, label: "附件" },
					AttachButton,
				),
			);
		}

		exports.inject = inject;
		exports.apply  = apply;
		return module.exports;
	}
});
