window.__ModuleLoader__.load({
	id: "dsh-overseas-skills",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");
		var useState = React.useState;
		var useEffect = React.useEffect;
		var useMemo = React.useMemo;
		var useCallback = React.useCallback;

		var NS = "dsh-overseas-skills";
		var API = "/api/dsh-overseas-skills";

		var CSS = [
			'[data-plugin="dsh-overseas-skills"].ovsRoot { display:flex; flex-direction:column; gap:14px; padding:2px 0 8px; min-width:0; }',
			".ovsRoot .ovsSearch { box-sizing:border-box; width:100%; height:32px; padding:0 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font-size:13px; line-height:20px; outline:none; }",
			".ovsRoot .ovsSearch:focus { border-color: var(--dsw-alias-brand-primary); }",
			".ovsRoot .ovsSearch::placeholder { color: var(--dsw-alias-label-secondary); }",
			".ovsRoot .ovsGroup { display:flex; flex-direction:column; gap:8px; }",
			".ovsRoot .ovsGroupTitle { margin:0; display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:500; line-height:20px; color:var(--dsw-alias-label-secondary); }",
			".ovsRoot .ovsGroupTitleIcon { width:18px; height:18px; border-radius:5px; object-fit:contain; }",
			".ovsRoot .ovsCardIcon { flex:none; width:22px; height:22px; border-radius:6px; object-fit:contain; }",
			".ovsRoot .ovsGrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:8px; }",
			".ovsRoot .ovsCard { display:flex; flex-direction:column; gap:4px; padding:10px 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); min-width:0; }",
			".ovsRoot .ovsCardHead { display:flex; align-items:center; justify-content:space-between; gap:8px; }",
			".ovsRoot .ovsCardTitleWrap { display:flex; align-items:center; gap:6px; min-width:0; }",".ovsRoot .ovsCardTitle { font-size:12px; line-height:18px; color:var(--dsw-alias-label-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; font-weight:500;}",".ovsRoot .ovsToolGap { flex:none; font-size:10px; line-height:14px; padding:0 5px; border-radius:4px; color:var(--dsw-alias-state-warn-primary); border:1px solid var(--dsw-alias-state-warn-primary); opacity:.9; }",
			".ovsRoot .ovsCardDesc { margin:0; font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }",
			".ovsRoot .ovsSwitch { position:relative; flex:none; width:34px; height:20px; border:none; border-radius:999px; cursor:pointer; padding:0; background:var(--dsw-alias-border-l2); transition:background .15s ease; }",
			".ovsRoot .ovsSwitchOn { background:var(--dsw-alias-brand-primary); }",
			".ovsRoot .ovsSwitch:disabled { cursor:default; opacity:.6; }",
			".ovsRoot .ovsSwitchKnob { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:var(--dsw-alias-bg-overlay); transition:left .15s ease; }",
			".ovsRoot .ovsSwitchOn .ovsSwitchKnob { left:16px; }",
			".ovsRoot .ovsError { font-size:11px; line-height:16px; color:var(--dsw-alias-state-error-primary); }",
			".ovsRoot .ovsCred { display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); }",
			".ovsRoot .ovsCredHead { display:flex; align-items:center; justify-content:space-between; gap:8px; }",
			".ovsRoot .ovsCredTitle { font-size:13px; font-weight:500; line-height:20px; color:var(--dsw-alias-label-primary); }",
			".ovsRoot .ovsCredState { flex:none; font-size:11px; line-height:16px; padding:0 8px; border-radius:999px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }",
			".ovsRoot .ovsCredStateOn { color:var(--dsw-alias-state-success-primary); background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }",
			".ovsRoot .ovsCredInput { box-sizing:border-box; width:100%; height:32px; padding:0 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-size:13px; line-height:20px; outline:none; }",
			".ovsRoot .ovsCredInput:focus { border-color:var(--dsw-alias-brand-primary); }",
			".ovsRoot .ovsCredBtn { align-self:flex-start; border:none; cursor:pointer; border-radius:8px; padding:6px 14px; font-size:13px; line-height:18px; color:#fff; background:var(--dsw-alias-brand-primary); }",
			".ovsRoot .ovsCredBtn:hover:not(:disabled) { filter:brightness(1.08); }",
			".ovsRoot .ovsCredBtn:disabled { opacity:.55; cursor:default; }",
			".ovsRoot .ovsHint { font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); }",
			"@media (prefers-reduced-motion: reduce) { .ovsRoot .ovsSwitch, .ovsRoot .ovsSwitchKnob { transition:none; } }",
			"[data-plugin=\"dsh-overseas-skills\"].ovpStack { display:flex; flex-direction:column; gap:8px; }",
			'[data-plugin="dsh-overseas-skills"].ovpRoot { box-sizing:border-box; width:100%; max-width:calc(var(--dsh-composer-card-max-width, 952px) + 48px); margin:0 auto; display:flex; flex-direction:column; gap:8px; padding:8px 10px 10px; min-width:0; border:1px solid var(--dsw-alias-border-l1); border-radius:14px; background:linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent) 0%, transparent 64px), var(--dsw-alias-bg-layer-1); }',
			".ovpRoot .ovpHead { display:flex; align-items:center; gap:8px; }",
			".ovpRoot .ovpDot { flex:none; width:8px; height:8px; border-radius:50%; background:linear-gradient(135deg, var(--dsw-alias-brand-primary), color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, #7c9cff)); box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }",
			".ovpRoot .ovpLabel { font-size:13px; font-weight:500; line-height:20px; color:var(--dsw-alias-label-primary); letter-spacing:.2px; }",
			".ovpRoot .ovpCount { flex:none; font-size:10px; line-height:14px; font-weight:500; padding:0 7px; border-radius:999px; color:var(--dsw-alias-brand-primary); background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }",
			".ovpRoot .ovpSpacer { flex:1; }",
			".ovpRoot .ovpToggle { flex:none; display:inline-flex; align-items:center; gap:2px; border:none; background:transparent; padding:2px 6px; border-radius:6px; cursor:pointer; color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:14px; }",
			".ovpRoot .ovpToggle:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }",
			".ovpRoot .ovpBody { display:flex; flex-direction:column; gap:8px; animation:ovpIn .16s ease; }",
			".ovpRoot .ovpPills { display:flex; gap:6px; overflow-x:auto; padding:1px 1px 2px; scrollbar-width:none; }",
			".ovpRoot .ovpPills::-webkit-scrollbar { display:none; }",
			".ovpRoot .ovpPill { flex:none; display:inline-flex; align-items:center; gap:4px; border:1px solid transparent; cursor:pointer; border-radius:999px; padding:4px 12px; font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); background:transparent; transition:background .12s ease, color .12s ease, border-color .12s ease; }",
			".ovpRoot .ovpPillIcon { width:16px; height:16px; border-radius:5px; object-fit:contain; }",
			".ovpRoot .ovpPill:hover { background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); color:var(--dsw-alias-label-primary); }",
			".ovpRoot .ovpPill:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }",
			".ovpRoot .ovpPillActive {font-size:12px;  background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; font-weight:500; }",
			".ovpRoot .ovpPillActive:hover { background:var(--dsw-alias-brand-primary); color:#fff; }",
			".ovpRoot .ovpGrid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:6px; max-height:150px; overflow-y:auto; contain:content; padding:2px 2px 4px; scrollbar-width:thin; scrollbar-color:var(--dsw-alias-scrollbar-thumb) transparent; }",
			".ovpRoot .ovpGrid::-webkit-scrollbar { width:6px; }",
			".ovpRoot .ovpGrid::-webkit-scrollbar-thumb { background:var(--dsw-alias-scrollbar-thumb); border-radius:3px; }",
			".ovpRoot .ovpCard { position:relative; display:flex; flex-direction:column; gap:2px; padding:8px 10px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-2); cursor:pointer; min-width:0; text-align:left; transition:border-color .12s ease, background .12s ease; }",
			".ovpRoot .ovpCard:before { content:\"\"; position:absolute; left:0; top:8px; bottom:8px; width:3px; border-radius:0 3px 3px 0; background:var(--dsw-alias-brand-primary); opacity:0; transform:scaleY(.4); transform-origin:center; transition:opacity .12s ease, transform .12s ease; }",
			".ovpRoot .ovpCard:hover { border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 65%, var(--dsw-alias-border-l1)); background:color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, var(--dsw-alias-bg-layer-2)); }",
			".ovpRoot .ovpCard:hover:before { opacity:1; transform:scaleY(1); }",
			".ovpRoot .ovpCard:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }",
			".ovpRoot .ovpCardTop { display:flex; align-items:center; justify-content:space-between; gap:6px; min-width:0; }",
			".ovpRoot .ovpCardTitleWrap { min-width:0; flex:1; }",
			".ovpRoot .ovpCardTitle { max-width:100%; }",
			".ovpRoot .ovpRight { flex-wrap:nowrap; }",
			".ovpRoot .ovpCardTitleWrap { display:inline-flex; align-items:center; gap:5px; min-width:0; }",
			".ovpRoot .ovpCardIcon { flex:none; width:18px; height:18px; border-radius:5px; object-fit:contain; }",
			".ovpRoot .ovpCardTitle { font-size:12px; font-weight:500; line-height:18px; color:var(--dsw-alias-label-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; transition:color .12s ease; }",
			".ovpRoot .ovpCard:hover .ovpCardTitle { color:var(--dsw-alias-brand-primary); }",
			".ovpRoot .ovpCardDesc { margin:0; font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }",
			".ovpRoot .ovpTag { flex:none; font-size:10px; line-height:14px; padding:0 5px; border-radius:999px; color:var(--dsw-alias-state-warn-primary); background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 30%, transparent); }",
			".ovpRoot .ovpRight { flex:none; display:inline-flex; align-items:center; gap:4px; margin-left:auto; }",
			".ovpRoot .ovpShort { border:none; background:transparent; cursor:pointer; font-size:10px; line-height:14px; padding:1px 6px; border-radius:6px; color:var(--dsw-alias-label-tertiary); opacity:0; transition:opacity .12s ease; }",
			".ovpRoot .ovpCard:hover .ovpShort { opacity:1; }",
			".ovpRoot .ovpShort:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }",
			".ovpRoot .ovpLoading { font-size:11px; line-height:16px; color:var(--dsw-alias-label-tertiary); padding:2px 2px 6px; }",
			"@keyframes ovpIn { from { opacity:0; transform:translateY(-3px); } to { opacity:1; transform:none; } }",
			"@media (prefers-reduced-motion: reduce) { .ovpRoot .ovpBody { animation:none; } .ovpRoot .ovpCard, .ovpRoot .ovpCard:before, .ovpRoot .ovpPill, .ovpRoot .ovpCardTitle { transition:none; } }"
		].join("\n");

				function OverseasPalette(props) {
				var endpoint = props && props.endpoint ? props.endpoint : "/list";
				var label = props && props.label ? props.label : "出海技能";
			var sessionId = props && props.sessionId;
			var inputActions = props && props.inputActions;
			var groupsState = useState(null);
			var groups = groupsState[0];
			var setGroups = groupsState[1];
			var catState = useState("");
			var cat = catState[0];
			var setCat = catState[1];
			var openState = useState(false);
			var open = openState[0];
			var setOpen = openState[1];
			var hintState = useState(null);
			var hint = hintState[0];
			var setHint = hintState[1];
			var errState = useState(null);
			var err = errState[0];
			var setErr = errState[1];

			useEffect(function () {
				var stopped = false;
				var controller;
				try {
					controller = new AbortController();
				} catch (e) {
					setErr(String(e && e.message ? e.message : e));
					return;
				}
				var fullCache = null;
				var loadAll = function () {
					if (fullCache) return Promise.resolve(fullCache);
					return fetch(API + endpoint, { signal: controller.signal, headers: { accept: "application/json" } })
						.then(function (r) { return r.ok ? r.json() : null; })
						.then(function (d) { if (d && Array.isArray(d.groups)) fullCache = d; return d; })
						.catch(function () { return null; });
				};
				var applyGroups = function (list) {
					if (stopped) return;
					var changed = false;
					setGroups(function (prev) {
						var a = prev ? prev.map(function (g) { return g.key + ":" + g.items.length; }).join("|") : "";
						var b = list ? list.map(function (g) { return g.key + ":" + g.items.length; }).join("|") : "";
						if (a === b) return prev;
						changed = true;
						return list;
					});
					if (changed) {
						setCat(function (c) {
							if (c === "" && list.length > 0) return list[0].key;
							return list.some(function (g) { return g.key === c; }) ? c : (list.length > 0 ? list[0].key : "");
						});
					}
				};
				var applyVisible = function (visible) {
					return loadAll().then(function (full) {
						if (!full || !Array.isArray(full.groups)) return null;
						if (visible === null) return full.groups;
						return full.groups
							.map(function (g) {
								return { key: g.key, title: g.title, icon: g.icon, items: (g.items || []).filter(function (it) { return visible.has(it.name); }) };
							})
							.filter(function (g) { return g.items.length > 0; });
					}).then(function (list) {
						if (list) applyGroups(list);
					});
				};
				var lastSig = null;
				var remote;
				try {
					remote =
						pluginCtx && pluginCtx.remote && pluginCtx.remote.skills
							? pluginCtx.remote
							: pluginCtx && typeof pluginCtx.get === "function"
								? pluginCtx.get("remote")
								: undefined;
				} catch (e) { remote = undefined; }
				var load = function () {
					if (!(remote && typeof sessionId === "string")) {
						applyVisible(null).catch(function (e) {
							if (!stopped) setErr(String(e && e.message ? e.message : e));
						});
						return;
					}
					remote.skills
						.list({ sessionId: sessionId }, controller.signal)
						.then(function (r) {
							if (!r || !r.ok || !Array.isArray(r.value && r.value.skills)) return null;
							var names = r.value.skills.map(function (s) { return s.name; }).sort();
							return new Set(names);
						})
						.then(function (visible) {
							var sig = visible === null ? "" : Array.from(visible).sort().join("|");
							if (sig === lastSig) return;
							lastSig = sig;
							return applyVisible(visible);
						})
						.catch(function (e) {
							if (!stopped) setErr(String(e && e.message ? e.message : e));
						});
				};
				load();
				var timer = setInterval(function () { load(); }, 2000);
				var onFocus = function () { load(); };
				window.addEventListener("focus", onFocus);
				var onVis = function () { if (!document.hidden) load(); };
				document.addEventListener("visibilitychange", onVis);
				return function () {
					stopped = true;
					clearInterval(timer);
					window.removeEventListener("focus", onFocus);
					document.removeEventListener("visibilitychange", onVis);
					try { controller.abort(); } catch (e) {}
				};
			}, [sessionId]);

			var activeGroup = useMemo(function () {
				if (!groups) return null;
				return groups.find(function (g) { return g.key === cat; }) || groups[0] || null;
			}, [groups, cat]);

			var clickShort = function (it) {
				var text = "/" + (it.title || it.name) + " 请使用「" + it.title + "」帮我：";
				if (inputActions && typeof inputActions.setDraft === "function") {
					inputActions.setDraft(text);
					setHint(null);
					return;
				}
				setHint("当前会话不支持自动填入");
			};
			var click = function (it) {
				var text = (typeof it.template === "string" && it.template.length > 0)
					? it.template
					: "/" + (it.title || it.name) + " 请使用「" + it.title + "」帮我：";
				if (inputActions && typeof inputActions.setDraft === "function") {
					inputActions.setDraft(text);
					setHint(null);
					return;
				}
				var ok = false;
				try {
					var sessionsSvc =
						pluginCtx && pluginCtx.sessions
							? pluginCtx.sessions
							: pluginCtx && typeof pluginCtx.get === "function"
								? pluginCtx.get("sessions")
								: undefined;
					var actx = sessionsSvc && typeof sessionsSvc.scope === "function" ? sessionsSvc.scope(sessionId) : undefined;
					var conv = actx === undefined ? undefined : actx.get("conversation");
					var face = conv && conv.input && typeof conv.input.for === "function" ? conv.input.for(actx) : undefined;
					if (face && typeof face.setDraft === "function") {
						face.setDraft(text);
						ok = true;
					}
				} catch (e) { ok = false; }
				if (ok) setHint(null);
				else setHint("当前会话不支持自动填入");
			};

			try {
				return React.createElement(
					"div",
					{ className: "ovpRoot", "data-plugin": "dsh-overseas-skills" },
					React.createElement(
						"div",
						{ className: "ovpHead" },
						React.createElement("span", { className: "ovpDot" }),
						React.createElement("span", { className: "ovpLabel" }, label),
						groups && groups.length > 0
							? React.createElement(
									"span",
									{ className: "ovpCount" },
									groups.reduce(function (n, g) { return n + g.items.length; }, 0)
								)
							: null,
						React.createElement("span", { className: "ovpSpacer" }),
						React.createElement(
							"button",
							{ className: "ovpToggle", type: "button", onClick: function () { setOpen(!open); } },
							open ? "收起 \u25B4" : "展开 \u25BE"
						)
					),
					err ? React.createElement("div", { className: "ovsError" }, "面板加载失败：" + err) : null,
					!open
						? null
						: React.createElement(
								"div",
								{ className: "ovpBody" },
								!groups && !err ? React.createElement("div", { className: "ovpLoading" }, "加载中…") : null,
								groups && groups.length > 0
									? React.createElement(
											"div",
											{ className: "ovpPills", role: "tablist" },
											groups.map(function (g) {
												var active = g.key === (activeGroup && activeGroup.key);
												return React.createElement(
													"button",
													{
														key: g.key,
														className: "ovpPill" + (active ? " ovpPillActive" : ""),
														type: "button",
														role: "tab",
														"aria-selected": active ? "true" : "false",
														onClick: function () { setCat(g.key); }
													},
													g.icon ? React.createElement("img", { className: "ovpPillIcon", src: g.icon, alt: "" }) : null,
													g.title
												);
											})
										)
									: null,
								activeGroup
									? React.createElement(
											"div",
											{ className: "ovpGrid" },
											(activeGroup.items || []).map(function (it) {
												return React.createElement(
													"button",
													{
														key: it.name,
														className: "ovpCard",
														type: "button",
														title: "点击填入输入框：" + it.title,
														onClick: function () { click(it); }
													},
													React.createElement(
														"div",
														{ className: "ovpCardTop" },
														React.createElement(
												"span",
												{ className: "ovpCardTitleWrap" },
												it.icon ? React.createElement("img", { className: "ovpCardIcon", src: it.icon, alt: "" }) : null,
												React.createElement("span", { className: "ovpCardTitle" }, it.title)
											),
														React.createElement("div", { className: "ovpRight" },
														it.toolGap ? React.createElement("span", { className: "ovpTag" }, "需外部工具") : null,
														React.createElement("span", {
															className: "ovpShort",
															role: "button",
															title: "填入简短引导（不带结构化模板）",
															onClick: function (e) { e.stopPropagation(); clickShort(it); }
														}, "简")
													)
													),
													it.descriptionZh
														? React.createElement("p", { className: "ovpCardDesc" }, it.descriptionZh)
														: null
												);
											})
										)
									: null,
								hint ? React.createElement("div", { className: "ovsHint" }, hint) : null
							)
				);
			} catch (e) {
				return React.createElement(
					"div",
					{ className: "ovpRoot", "data-plugin": "dsh-overseas-skills" },
					React.createElement("div", { className: "ovsError" }, label + "面板渲染失败：" + (e && e.message ? e.message : String(e)))
				);
			}
		}

		function OverseasPaletteStack(props) {
			return React.createElement(
				"div",
				{ className: "ovpStack", "data-plugin": "dsh-overseas-skills" },
				React.createElement(OverseasPalette, props),
				React.createElement(OverseasPalette, Object.assign({}, props, { endpoint: "/fullstack-list", label: "AI全栈技能" }))
			);
		}

function OverseasSkillsPage(props) {
			props = props || {};
			var endpoint = props.endpoint || "/list";
			var showCred = props.showCred !== false;
			var groupsState = useState(null);
			var groups = groupsState[0];
			var setGroups = groupsState[1];
			var errState = useState(null);
			var err = errState[0];
			var setErr = errState[1];
			var queryState = useState("");
			var query = queryState[0];
			var setQuery = queryState[1];
			var busyState = useState({});
			var busy = busyState[0];
			var setBusy = busyState[1];
			var credState = useState({ exa: null, saving: false, msg: null });
			var cred = credState[0];
			var setCred = credState[1];
			var exaInputState = useState("");
			var exaInput = exaInputState[0];
			var setExaInput = exaInputState[1];

			var loadCred = useCallback(function () {
				fetch(API + "/credential?ref=overseas_exa", { headers: { accept: "application/json" } })
					.then(function (r) { return r.json(); })
					.then(function (d) {
						setCred(function (c) { return { exa: d && d.configured === true, saving: c.saving, msg: null }; });
					})
					.catch(function () {});
			}, []);

			var saveExa = function () {
				var value = exaInput.trim();
				if (value === "") {
					setCred(function (c) { return { exa: c.exa, saving: false, msg: "请输入 Exa API Key" }; });
					return;
				}
				setCred(function (c) { return { exa: c.exa, saving: true, msg: null }; });
				fetch(API + "/credential", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ ref: "overseas_exa", value: value })
				})
					.then(function (r) { return r.json(); })
					.then(function (d) {
						setExaInput("");
						setCred({ exa: d && d.ok === true && d.configured === true, saving: false, msg: d && d.ok === true ? "Exa API Key 已保存" : (d && d.error ? d.error : "保存失败") });
					})
					.catch(function (e) {
						setCred(function (c) { return { exa: c.exa, saving: false, msg: String(e && e.message ? e.message : e) }; });
					});
			};

			useEffect(function () {
				if (showCred) loadCred();
			}, [loadCred]);

			useEffect(function () {
				var controller = new AbortController();
				fetch(API + endpoint, { signal: controller.signal, headers: { accept: "application/json" } })
					.then(function (r) {
						if (!r.ok) throw new Error("HTTP " + r.status);
						return r.json();
					})
					.then(function (data) {
						setGroups(Array.isArray(data.groups) ? data.groups : []);
						setErr(null);
					})
					.catch(function (e) {
						if (e && e.name === "AbortError") return;
						setErr(String(e && e.message ? e.message : e));
					});
				return function () {
					controller.abort();
				};
			}, []);

			var toggle = useCallback(function (name, enabled) {
				setBusy(function (b) {
					var next = Object.assign({}, b);
					next[name] = true;
					return next;
				});
				fetch(API + "/toggle", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: name, enabled: enabled })
				})
					.then(function (r) {
						if (!r.ok) {
							if (r.status === 404) throw new Error("技能未安装，无法切换");
							throw new Error("HTTP " + r.status);
						}
						return r.json();
					})
					.then(function () {
						setGroups(function (gs) {
							return gs.map(function (g) {
								return {
									key: g.key,
									title: g.title,
									icon: g.icon,
									items: g.items.map(function (it) {
										return it.name === name ? Object.assign({}, it, { modelEnabled: enabled }) : it;
									})
								};
							});
						});
					})
					.catch(function (e) {
						setErr(String(e && e.message ? e.message : e));
					})
					.finally(function () {
						setBusy(function (b) {
							var next = Object.assign({}, b);
							delete next[name];
							return next;
						});
					});
			}, []);

			var q = query.trim().toLowerCase();
			var visible = useMemo(function () {
				if (!groups) return null;
				// 只显示已安装（已导入）的技能：工具型 20 项按决策整体跳过，不出现开关
				var installed = groups
					.map(function (g) {
						return {
							key: g.key,
							title: g.title,
							icon: g.icon,
							items: g.items.filter(function (it) {
								return it.installed === true;
							})
						};
					})
					.filter(function (g) {
						return g.items.length > 0;
					});
				if (q === "") return installed;
				return installed
					.map(function (g) {
						return {
							key: g.key,
							title: g.title,
							icon: g.icon,
							items: g.items.filter(function (it) {
								return (
									String(it.title || "").toLowerCase().indexOf(q) !== -1 ||
									it.name.toLowerCase().indexOf(q) !== -1 ||
									String(it.description || "").toLowerCase().indexOf(q) !== -1
								);
							})
						};
					})
					.filter(function (g) {
						return g.items.length > 0;
					});
			}, [groups, q]);

			return React.createElement(
				"div",
				{ className: "ovsRoot", "data-plugin": "dsh-overseas-skills" },
				showCred ? React.createElement(
					"div",
					{ className: "ovsCred" },
					React.createElement(
						"div",
						{ className: "ovsCredHead" },
						React.createElement("span", { className: "ovsCredTitle" }, "外部工具凭据"),
						React.createElement(
							"span",
							{ className: "ovsCredState" + (cred.exa ? " ovsCredStateOn" : "") },
							cred.exa === null ? "…" : cred.exa ? "Exa 已配置" : "Exa 未配置"
						)
					),
					React.createElement("input", {
						className: "ovsCredInput",
						type: "password",
						placeholder: "Exa API Key（用于公司/人物/组织调研）",
						value: exaInput,
						onChange: function (e) { setExaInput(e.target.value); }
					}),
					React.createElement(
						"button",
						{
							className: "ovsCredBtn",
							type: "button",
							disabled: cred.saving,
							onClick: saveExa
						},
						cred.saving ? "保存中…" : "保存 Exa Key"
					),
					cred.msg ? React.createElement("div", { className: "ovsHint" }, cred.msg) : null
				) : null,
				React.createElement("input", {
					className: "ovsSearch",
					type: "search",
					placeholder: "搜索技能",
					value: query,
					onChange: function (e) {
						setQuery(e.target.value);
					}
				}),
				err ? React.createElement("div", { className: "ovsError" }, err) : null,
				!groups && !err ? React.createElement("div", { className: "ovsHint" }, "加载中…") : null,
				visible
					? visible.map(function (g) {
							return React.createElement(
								"section",
								{ key: g.key, className: "ovsGroup" },
								React.createElement("h3", { className: "ovsGroupTitle" },
								g.icon ? React.createElement("img", { className: "ovsGroupTitleIcon", src: g.icon, alt: "" }) : null,
								g.title + " · " + g.items.length
							),
								React.createElement(
									"div",
									{ className: "ovsGrid" },
									g.items.map(function (it) {
										return React.createElement(
											"div",
											{ key: it.name, className: "ovsCard" },
											React.createElement(
												"div",
												{ className: "ovsCardHead" },
												React.createElement(
													"span",
													{ className: "ovsCardTitleWrap" },
																		it.icon ? React.createElement("img", { className: "ovsCardIcon", src: it.icon, alt: "" }) : null,
													React.createElement(
														"span",
														{ className: "ovsCardTitle", title: it.name },
														it.title
													),
													it.toolGap
														? React.createElement(
																"span",
																{ className: "ovsToolGap", title: "本机未接入对应外部工具，详见技能说明" },
																"需外部工具"
															)
														: null
												),
												React.createElement(
													"button",
													{
														className: "ovsSwitch" + (it.modelEnabled ? " ovsSwitchOn" : ""),
														type: "button",
														role: "switch",
														"aria-checked": it.modelEnabled ? "true" : "false",
														"aria-label": it.title,
														disabled: busy[it.name] === true,
														onClick: function () {
															toggle(it.name, !it.modelEnabled);
														}
													},
													React.createElement("span", { className: "ovsSwitchKnob" })
												)
											),
											it.descriptionZh || it.description
												? React.createElement("p", { className: "ovsCardDesc" }, it.descriptionZh || it.description)
												: null
										);
									})
								)
							);
						})
					: null
			);
		}

		exports.inject = ["slots", "locale", "remote", "remote.skills", "sessions"];
		var pluginCtx = null;
		exports.apply = function apply(ctx) {
			pluginCtx = ctx;
			ctx.effect(function () {
				var style = document.createElement("style");
				style.setAttribute("data-plugin-css", "dsh-overseas-skills");
				style.textContent = CSS;
				document.head.appendChild(style);
				return function () {
					style.remove();
				};
			}, "dsh-overseas-skills: css");
			ctx.effect(function () {
				return ctx.locale.register(NS, {
					zh: { nav: "出海技能", fsnav: "AI全栈技能" },
					en: { nav: "Overseas Skills", fsnav: "AI Full-Stack Skills" }
				});
			}, "dsh-overseas-skills: locale");
						ctx.slots.inject("conversation.input.dock", function () {
				return ctx.slots.register(
					{
						name: "conversation.input.dock",
						id: "overseas-skills-palette",
						order: 200,
						locale: NS
					},
					OverseasPaletteStack
				);
			});
ctx.slots.inject("settings.section", function () {
				return ctx.slots.register(
					{
						name: "settings.section",
						id: "overseas-skills",
						order: 26,
						label: function () {
							return ctx.locale.bind(NS)("nav");
						},
						locale: NS
					},
					OverseasSkillsPage
				);
			});
		ctx.slots.inject("settings.section", function () {
			return ctx.slots.register(
				{
					name: "settings.section",
					id: "fullstack-skills",
					order: 27,
					label: function () {
						return ctx.locale.bind(NS)("fsnav");
					},
					locale: NS
				},
				function FullstackSkillsPage() {
					return React.createElement(OverseasSkillsPage, { endpoint: "/fullstack-list", showCred: false });
				}
			);
		});
	};
		return module.exports;
	}
});
