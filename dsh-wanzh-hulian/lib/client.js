window.__ModuleLoader__.load({
	id: "dsh-wanzh-hulian",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");
		var useState = React.useState;
		var useEffect = React.useEffect;

		var NS = "dsh-wanzh-hulian";
		var API = "/api/dsh-wanzh-hulian";
		var KB_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iMTAiIGZpbGw9IiNEQ0YxRDYiLz48cGF0aCBkPSJNMTQgMTJjNC0xLjYgOC0xLjYgMTIgMHYyMmMtNC0xLjYtOC0xLjYtMTIgMHoiIGZpbGw9IiM1OEI4NDgiLz48cGF0aCBkPSJNMjIgMTJjNC0xLjYgOC0xLjYgMTIgMHYyMmMtNC0xLjYtOC0xLjYtMTIgMHoiIGZpbGw9IiMyRTdEM0MiLz48L3N2Zz4=";

		var CSS = [
			'[data-plugin="dsh-wanzh-hulian"].whRoot { display:flex; flex-direction:column; gap:14px; padding:2px 0 8px; min-width:0; }',
			".whRoot .whPills { display:flex; gap:6px; overflow-x:auto; padding:1px 1px 2px; scrollbar-width:none; }",
			".whRoot .whPills::-webkit-scrollbar { display:none; }",
			".whRoot .whPill { flex:none; display:inline-flex; align-items:center; gap:6px; border:1px solid var(--dsw-alias-border-l1); cursor:pointer; border-radius:999px; padding:5px 14px; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-1); transition:all .12s ease; }",
			".whRoot .whPillActive { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); font-weight:500; }",
			".whRoot .whPillBadge { font-size:10px; line-height:14px; padding:0 6px; border-radius:999px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }",
			".whRoot .whBoardDesc { margin:0; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); }",
			".whRoot .whGrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:10px; }",
			".whRoot .whCard { display:flex; flex-direction:column; gap:10px; padding:14px; border:1px solid var(--dsw-alias-border-l1); border-radius:14px; background:var(--dsw-alias-bg-layer-1); min-width:0; }",
			".whRoot .whCardHead { display:flex; align-items:center; gap:10px; }",
			".whRoot .whLogo { flex:none; width:44px; height:44px; border-radius:10px; object-fit:contain; border:1px solid var(--dsw-alias-border-l1); background:#fff; }",
			".whRoot .whTitleWrap { display:flex; flex-direction:column; gap:2px; min-width:0; }",
			".whRoot .whTitle { font-size:14px; line-height:20px; font-weight:600; color:var(--dsw-alias-label-primary); }",
			".whRoot .whSubtitle { font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); }",
			".whRoot .whSpacer { flex:1; }",
			".whRoot .whBadge { flex:none; font-size:11px; line-height:16px; padding:1px 8px; border-radius:999px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }",
			".whRoot .whBadgeOn { color:var(--dsw-alias-state-success-primary); background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }",
			".whRoot .whBadgeOff { color:var(--dsw-alias-state-error-primary); background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }",
			".whRoot .whRow { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 10px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-2); }",
			".whRoot .whRowLabel { font-size:12px; line-height:18px; color:var(--dsw-alias-label-primary); }",
			".whRoot .whRowHint { font-size:10px; line-height:14px; color:var(--dsw-alias-label-tertiary); }",
			".whRoot .whSwitch { position:relative; flex:none; width:34px; height:20px; border:none; border-radius:999px; cursor:pointer; padding:0; background:var(--dsw-alias-border-l2); transition:background .15s ease; }",
			".whRoot .whSwitchOn { background:var(--dsw-alias-brand-primary); }",
			".whRoot .whSwitch:disabled { cursor:default; opacity:.6; }",
			".whRoot .whSwitchKnob { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:var(--dsw-alias-bg-overlay); transition:left .15s ease; }",
			".whRoot .whSwitchOn .whSwitchKnob { left:16px; }",
			".whRoot .whChips { display:flex; flex-wrap:wrap; gap:6px; }",
			".whRoot .whChip { font-size:11px; line-height:16px; padding:2px 8px; border-radius:6px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }",
			".whRoot .whField { display:flex; flex-direction:column; gap:4px; }",
			".whRoot .whFieldLabel { font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); }",
			".whRoot .whInput { box-sizing:border-box; width:100%; height:32px; padding:0 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-size:13px; line-height:20px; outline:none; }",
			".whRoot .whInput:focus { border-color:var(--dsw-alias-brand-primary); }",
			".whRoot .whBtns { display:flex; gap:8px; flex-wrap:wrap; }",
			".whRoot .whBtn { border:none; cursor:pointer; border-radius:8px; padding:6px 14px; font-size:13px; line-height:18px; color:#fff; background:var(--dsw-alias-brand-primary); }",
			".whRoot .whBtnGhost { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); }",
			".whRoot .whBtn:disabled { opacity:.55; cursor:default; }",
			".whRoot .whHint { font-size:11px; line-height:16px; color:var(--dsw-alias-label-tertiary); }",
			".whRoot .whErr { font-size:11px; line-height:16px; color:var(--dsw-alias-state-error-primary); }",
			".whRoot .whQuota { font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); white-space:pre-wrap; }",
			"@media (prefers-reduced-motion: reduce) { .whRoot .whSwitch, .whRoot .whSwitchKnob { transition:none; } }",
			".whSbEntry { flex:none; align-items:center; width:100%; height:42px; margin:8px 0 0; display:flex; position:relative; }",
			".whSbBtn { width:calc(100% + 4px); height:42px; color:var(--dsw-alias-label-primary); cursor:pointer; background:0 0; border:none; border-radius:12px; align-items:center; gap:8px; margin:0 -2px; padding:0 10px 0 12px; font-family:inherit; font-size:14px; display:inline-flex; overflow:hidden; }",
			".whSbBtn:hover, .whSbBtn[data-active] { background:var(--dsw-alias-interactive-bg-hover); }",
			".whSbLabel { text-overflow:ellipsis; white-space:nowrap; min-width:0; overflow:hidden; }",
			".whRightPanel { position:fixed; top:0; right:0; bottom:0; width:min(360px, 96vw); z-index:2500; display:flex; flex-direction:column; gap:10px; padding:16px 16px 12px; border-left:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); box-shadow:-12px 0 32px rgba(0,0,0,.18); overflow-y:auto; }",
			".whRightPanelTop { flex:none; margin:-16px -16px 0; height:3px; background:linear-gradient(90deg, #58B848, #8FD48A); border-radius:0 0 4px 4px; }",
			".whRightPanelHead { display:flex; align-items:center; gap:8px; }",
			".whRightPanelTitle { flex:1; margin:0; font-size:14px; font-weight:600; line-height:22px; color:var(--dsw-alias-label-primary); }",
			".whRightPanelSub { margin:0; font-size:11px; line-height:16px; color:var(--dsw-alias-label-tertiary); }",
			".whRightPanelClose { border:none; background:transparent; cursor:pointer; font-size:16px; line-height:20px; color:var(--dsw-alias-label-tertiary); padding:2px 8px; border-radius:6px; }",
			".whRightPanelClose:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }",
			".whSeg { display:flex; gap:4px; padding:3px; border-radius:10px; background:var(--dsw-alias-bg-layer-2); }",
			".whSegBtn { flex:1; border:none; cursor:pointer; border-radius:8px; padding:6px 0; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); background:transparent; }",
			".whSegOn { color:#fff; background:#58B848; font-weight:500; }",
			".whKbGrid { display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; }",
			".whKbCard { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-2); cursor:pointer; min-width:0; }",
			".whKbCard:hover { border-color:#58B848; background:color-mix(in srgb, #58B848 6%, var(--dsw-alias-bg-layer-2)); }",
			".whThumb { flex:none; width:36px; height:36px; border-radius:9px; object-fit:cover; background:var(--dsw-alias-bg-base); }",
			".whKbText { display:flex; flex-direction:column; gap:1px; min-width:0; }",
			".whKbName { font-size:12px; font-weight:500; line-height:17px; color:var(--dsw-alias-label-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
			".whKbMeta { font-size:10px; line-height:14px; color:var(--dsw-alias-label-tertiary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
			".whRightPanelHint { margin:0; font-size:11px; line-height:16px; color:var(--dsw-alias-label-tertiary); }",
			".whSrcGroup { margin:2px 0 0; font-size:11px; font-weight:500; line-height:16px; color:var(--dsw-alias-label-secondary); }"
		];

		exports.inject = ["slots", "locale", "sessions"];
		var pluginCtx = null;

		function GenericConnCard(props) {
			var conn = props.conn;
			var ctl = props.ctl;
			var fields = conn.authFields || [];
			var fieldStates = {};
			fields.forEach(function (f) { fieldStates[f.ref] = useState(""); });
			var extras = conn.extras || [];
			var topicsState = useState(null);
			var topics = topicsState[0];
			var setTopics = topicsState[1];
			useEffect(function () {
				if (extras.indexOf("default-topic") < 0) return;
				var controller = new AbortController();
				fetch(API + "/topics", { signal: controller.signal, headers: { accept: "application/json" } })
					.then(function (r) { return r.json(); })
					.then(function (d) { if (d && d.ok && Array.isArray(d.topics)) setTopics(d.topics); })
					.catch(function () {});
				return function () { controller.abort(); };
			}, []);
			var allConfigured = fields.every(function (f) { return conn.state[f.ref + "Configured"] === true; });
			var anyConfigured = fields.some(function (f) { return conn.state[f.ref + "Configured"] === true; });
			var status = allConfigured ? (conn.state.enabled ? "已连接" : "已断开") : (anyConfigured ? "凭证不完整" : "未配置");
			if (conn.state.credSource === "cli") status = conn.state.enabled ? "已连接（CLI 登录态）" : "已断开";
			else if (conn.state.cliAuthed && !allConfigured) status = "CLI 已登录（将自动回退）";
			var statusCls = (allConfigured || conn.state.credSource === "cli" || conn.state.cliAuthed) && conn.state.enabled !== false ? "whBadgeOn" : "whBadgeOff";
			var save = function () {
				var jobs = [];
				fields.forEach(function (f) {
					var v = fieldStates[f.ref][0];
					if (v && v.trim()) jobs.push({ ref: f.ref, value: v.trim() });
				});
				if (jobs.length === 0) { ctl.setErr("请至少填写一项"); return; }
				ctl.saveCreds(jobs);
			};
			var rows = [];
			if (extras.indexOf("model-invoke") >= 0) rows.push(React.createElement("div", { className: "whRow", key: "mi" },
				React.createElement("div", null,
					React.createElement("div", { className: "whRowLabel" }, "模型自动调用"),
					React.createElement("div", { className: "whRowHint" }, "关闭时模型仅在用户点名时使用该连接")
				),
				React.createElement("button", {
					className: "whSwitch" + (conn.state.modelInvoke ? " whSwitchOn" : ""),
					disabled: ctl.busy,
					onClick: function () { ctl.toggleModelInvoke(conn.id, !conn.state.modelInvoke); },
					"aria-label": "模型自动调用"
				}, React.createElement("span", { className: "whSwitchKnob" }))
			));
			if (extras.indexOf("default-topic") >= 0) rows.push(React.createElement("div", { className: "whField", key: "dt" },
				React.createElement("span", { className: "whFieldLabel" }, "默认知识库（getnote_save 未显式指定库时落入）"),
				React.createElement("select", {
					className: "whInput",
					value: conn.state.defaultTopicId || "",
					disabled: ctl.busy,
					onChange: function (e) { ctl.setDefaultTopic(e.target.value); }
				},
					React.createElement("option", { value: "" }, "不设默认（默认库）"),
					(topics || []).map(function (t) {
						return React.createElement("option", { value: t.id, key: t.id }, t.name + "（" + (t.noteCount ?? 0) + " 笔记）");
					})
				)
			));
			var buttons = [];
			buttons.push(React.createElement("button", { className: "whBtn", key: "save", disabled: ctl.busy, onClick: save }, "保存凭证"));
			buttons.push(React.createElement("button", { className: "whBtn whBtnGhost", key: "probe", disabled: ctl.busy, onClick: function () { ctl.probeConn(conn.id); } }, "测试连接"));
			if (extras.indexOf("oauth-button") >= 0) buttons.push(React.createElement("button", { className: "whBtn whBtnGhost", key: "oauth", disabled: ctl.busy, onClick: ctl.authLogin }, "浏览器授权登录"));
			if (conn.platformUrl) buttons.push(React.createElement("button", { className: "whBtn whBtnGhost", key: "open", disabled: ctl.busy, onClick: function () { ctl.openUrl(conn.platformUrl); } }, "打开管理后台"));
			return React.createElement("div", { className: "whCard", key: conn.id },
				React.createElement("div", { className: "whCardHead" },
					conn.logo ? React.createElement("img", { className: "whLogo", src: conn.logo, alt: "" }) : null,
					React.createElement("div", { className: "whTitleWrap" },
						React.createElement("span", { className: "whTitle" }, conn.title),
						React.createElement("span", { className: "whSubtitle" }, conn.subtitle || "")
					),
					React.createElement("div", { className: "whSpacer" }),
					React.createElement("span", { className: "whBadge " + statusCls }, status)
				),
				React.createElement("div", { className: "whChips" },
					(conn.capabilities || []).map(function (cap) { return React.createElement("span", { className: "whChip", key: cap }, cap); })
				),
				React.createElement("div", { className: "whRow" },
					React.createElement("div", null,
						React.createElement("div", { className: "whRowLabel" }, "连接开关"),
						React.createElement("div", { className: "whRowHint" }, conn.kind === "mcp" ? "联动 MCP 条目，重启后生效" : "关闭后工具立即返回「已断开」")
					),
					React.createElement("button", {
						className: "whSwitch" + (conn.state.enabled ? " whSwitchOn" : ""),
						disabled: ctl.busy,
						onClick: function () { ctl.toggleConn(conn.id, !conn.state.enabled); },
						"aria-label": "连接开关"
					}, React.createElement("span", { className: "whSwitchKnob" }))
				),
				rows,
				fields.map(function (f) {
					var st = fieldStates[f.ref];
					return React.createElement("div", { className: "whField", key: f.ref },
						React.createElement("span", { className: "whFieldLabel" }, f.label),
						React.createElement("input", {
							className: "whInput",
							type: f.secret ? "password" : "text",
							placeholder: conn.state[f.ref + "Configured"] ? "已配置（留空则不变）" : f.placeholder,
							value: st[0],
							onChange: function (e) { st[1](e.target.value); }
						})
					);
				}),
				React.createElement("div", { className: "whBtns" }, buttons),
				ctl.probeText ? React.createElement("pre", { className: "whQuota" }, ctl.probeText) : null,
				conn.note ? React.createElement("div", { className: "whHint" }, conn.note) : null
			);
		}

		function McpBoard(props) {
			var ctl = props.ctl;
			var serversState = useState(null);
			var servers = serversState[0];
			var setServers = serversState[1];
			useEffect(function () {
				var controller = new AbortController();
				fetch(API + "/mcp-servers", { signal: controller.signal, headers: { accept: "application/json" } })
					.then(function (r) { return r.json(); })
					.then(function (d) { if (d && d.ok) setServers(d.servers || []); })
					.catch(function () {});
				return function () { controller.abort(); };
			}, []);
			if (!servers) return React.createElement("span", { className: "whHint" }, "加载中…");
			return React.createElement("div", { className: "whGrid" },
				servers.map(function (s) {
					var st = s.state;
					var statusText = s.enabled ? (st && st.status === "running" ? "运行中" : st && st.status === "error" ? "启动失败" : "待重启生效") : "未启用";
					var statusCls = s.enabled ? (st && st.status === "error" ? "whBadgeOff" : "whBadgeOn") : "whBadgeOff";
					return React.createElement("div", { className: "whCard", key: s.id },
						React.createElement("div", { className: "whCardHead" },
							React.createElement("div", { className: "whTitleWrap" },
								React.createElement("span", { className: "whTitle" }, s.name),
								React.createElement("span", { className: "whSubtitle" }, (s.transport === "streamable-http" ? "HTTP · " + s.url : "stdio · " + s.command + " " + (s.args || []).join(" ")))
							),
							React.createElement("div", { className: "whSpacer" }),
							React.createElement("span", { className: "whBadge " + statusCls }, statusText)
						),
						React.createElement("div", { className: "whRow" },
							React.createElement("div", null,
								React.createElement("div", { className: "whRowLabel" }, "启用"),
								React.createElement("div", { className: "whRowHint" }, "工具以 mcp__" + s.id + "__<tool> 注册；变更需重启 DSH 生效")
							),
							React.createElement("button", {
								className: "whSwitch" + (s.enabled ? " whSwitchOn" : ""),
								disabled: ctl.busy,
								onClick: function () { ctl.toggleMcp(s.id, !s.enabled); },
								"aria-label": "启用"
							}, React.createElement("span", { className: "whSwitchKnob" }))
						),
						st && st.status === "error" ? React.createElement("div", { className: "whErr" }, st.error || "启动失败") : null,
						s.note ? React.createElement("div", { className: "whHint" }, s.note) : null
					);
				})
			);
		}

		function WanzhPage() {
			var loadResult = useState({ boards: [], connections: [] });
			var board = useState("knowledge");
			var busy = useState(false);
			var err = useState("");
			var probeText = useState("");
			var data = loadResult[0];
			var setData = loadResult[1];
			var active = board[0];
			var setActive = board[1];
			var setBusy = busy[1];
			var setErr = err[1];
			var setProbeText = probeText[1];

			useEffect(function () {
				var controller = new AbortController();
				fetch(API + "/list", { signal: controller.signal, headers: { accept: "application/json" } })
					.then(function (r) { return r.json(); })
					.then(function (d) { if (d && d.ok) setData({ boards: d.boards || [], connections: d.connections || [] }); })
					.catch(function (e) { if (e && e.name !== "AbortError") setErr(String(e && e.message ? e.message : e)); });
				return function () { controller.abort(); };
			}, []);

			var ctl = {
				busy: busy[0],
				err: err[0],
				probeText: probeText[0],
				refresh: function () {
					fetch(API + "/list", { headers: { accept: "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (d) { if (d && d.ok) setData({ boards: d.boards || [], connections: d.connections || [] }); });
				},
				toggle: function (field, value) {
					setBusy(true); setErr("");
					fetch(API + "/toggle", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id: "getnote-brain", field: field, value: value })
					})
						.then(function (r) { return r.json(); })
						.then(function (d) {
							if (d && d.ok) ctl.refresh();
							else setErr(d && d.error ? d.error : "切换失败");
						})
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				},

				toggleMcp: function (id, enabled) {
					setBusy(true); setErr("");
					fetch(API + "/mcp-servers", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id: id, enabled: enabled })
					})
						.then(function (r) { return r.json(); })
						.then(function (d) {
							if (d && d.ok) {
								setErr(d.hint || "已保存（重启后生效）");
								fetch(API + "/mcp-servers", { headers: { accept: "application/json" } })
									.then(function (r) { return r.json(); })
									.then(function (dd) { if (dd && dd.ok) setData(function (prev) { return prev; }); });
							} else setErr(d && d.error ? d.error : "保存失败");
						})
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				},
				setErr: function (msg) { setErr(msg); },
				saveCreds: function (jobs) {
					setBusy(true); setErr("");
					Promise.all(jobs.map(function (j) {
						return fetch(API + "/credential", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify(j)
						}).then(function (r) { return r.json(); });
					}))
						.then(function (rs) {
							var bad = rs.filter(function (d) { return !d || !d.ok; });
							if (bad.length > 0) setErr(bad[0] && bad[0].error ? bad[0].error : "保存失败");
							else ctl.refresh();
						})
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				},
				toggleConn: function (id, value) {
					setBusy(true); setErr("");
					fetch(API + "/toggle", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id: id, field: "enabled", value: value })
					})
						.then(function (r) { return r.json(); })
						.then(function (d) {
							if (d && d.ok) { setErr(d.hint || "已保存"); ctl.refresh(); }
							else setErr(d && d.error ? d.error : "切换失败");
						})
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				},
				probeConn: function (id) {
					setBusy(true); setErr(""); setProbeText("");
					fetch(API + "/probe", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id: id })
					})
						.then(function (r) { return r.json(); })
						.then(function (d) {
							if (!d || !d.ok) { setErr(d && d.error ? d.error : "连接测试失败"); return; }
							setProbeText(d.text || "连接测试通过 ✓");
						})
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				},
				toggleModelInvoke: function (id, value) {
					setBusy(true); setErr("");
					fetch(API + "/toggle", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id: id, field: "modelInvoke", value: value })
					})
						.then(function (r) { return r.json(); })
						.then(function (d) {
							if (d && d.ok) ctl.refresh();
							else setErr(d && d.error ? d.error : "切换失败");
						})
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				},
				authLogin: function () {
					setBusy(true); setErr("");
					fetch(API + "/auth-login", { method: "POST", headers: { accept: "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (d) {
							if (d && d.ok) setErr(d.hint || "已触发浏览器授权");
							else setErr(d && d.error ? d.error : "授权触发失败");
							ctl.refresh();
						})
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				},
				openUrl: function (url) {
					setBusy(true); setErr("");
					fetch(API + "/open", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ url: url })
					})
						.then(function (r) { return r.json(); })
						.then(function (d) { if (!d || !d.ok) setErr(d && d.error ? d.error : "打开失败"); })
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				},
				setDefaultTopic: function (topicId) {
					setBusy(true); setErr("");
					fetch(API + "/default-topic", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ topicId: topicId })
					})
						.then(function (r) { return r.json(); })
						.then(function (d) {
							if (d && d.ok) ctl.refresh();
							else setErr(d && d.error ? d.error : "默认库保存失败");
						})
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				},
				probe: function () {
					setBusy(true); setErr(""); setProbeText("");
					fetch(API + "/probe", { method: "POST", headers: { accept: "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (d) {
							if (!d || !d.ok) {
								setErr(d && d.error ? d.error : "连接测试失败");
								return;
							}
							var lines = ["连接测试通过 ✓"];
							if (d.quota) {
								var q = d.quota;
								var f = function (b) { return b ? b.used + " / " + b.limit : "-"; };
								lines.push("配额 read 日/月: " + f(q.read && q.read.daily) + " | " + f(q.read && q.read.monthly));
								lines.push("配额 write 日/月: " + f(q.write && q.write.daily) + " | " + f(q.write && q.write.monthly));
							}
							if (d.topics) lines.push("知识库总数: " + d.topics.total + "（本次返回 " + d.topics.count + " 个）");
							setProbeText(lines.join("\n"));
						})
						.catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
						.finally(function () { setBusy(false); });
				}
			};

			var conns = data.connections.filter(function (c) { return c.board === active; });

			return React.createElement(
				"div",
				{ className: "whRoot", "data-plugin": "dsh-wanzh-hulian" },
				React.createElement("div", { className: "whPills" },
					data.boards.map(function (b) {
						var count = b.connections ? b.connections.length : 0;
						return React.createElement(
							"button",
							{
								className: "whPill" + (b.key === active ? " whPillActive" : ""),
								key: b.key,
								onClick: function () { setActive(b.key); }
							},
							b.icon + " " + b.title,
							count > 0 ? React.createElement("span", { className: "whPillBadge" }, String(count)) : null,
							b.ready ? null : React.createElement("span", { className: "whPillBadge" }, "规划中")
						);
					})
				),
				React.createElement("p", { className: "whBoardDesc" },
					(data.boards.find(function (b) { return b.key === active; }) || {}).desc || ""
				),
				active === "enterprise"
					? React.createElement("div", { className: "whGrid" },
						conns.map(function (c2) {
							if (c2.id === "getnote-brain") return null;
							return React.createElement(GenericConnCard, { conn: c2, ctl: ctl, key: c2.id });
						}))
					: active === "mcp"
					? React.createElement(McpBoard, { ctl: ctl })
					: conns.length > 0
						? React.createElement("div", { className: "whGrid" },
							conns.map(function (c) {
								return React.createElement(GenericConnCard, { conn: c, ctl: ctl, key: c.id });
							}))
						: React.createElement("p", { className: "whBoardDesc" }, "该板块暂无已上线的连接，敬请期待。"),
				ctl.err && !conns.length ? React.createElement("div", { className: "whErr" }, ctl.err) : null
			);
		}

		/* ── 输入区知识库选择器（跨 Slot 共享开关状态） ─────────────────── */
		var kbStore = { open: false, subs: [] };
		function kbSetOpen(next) {
			if (kbStore.open === next) return;
			kbStore.open = next;
			kbStore.subs.forEach(function (fn) { fn(); });
		}
		function useKbOpen() {
			var v = useState(kbStore.open);
			var setV = v[1];
			useEffect(function () {
				var fn = function () { setV(kbStore.open); };
				kbStore.subs.push(fn);
				return function () { kbStore.subs = kbStore.subs.filter(function (x) { return x !== fn; }); };
			}, []);
			return v[0];
		}

		function SidebarKbButton(props) {
			var open = useKbOpen();
			var wide = props && props.wide;
			if (!wide) return null;
			return React.createElement(
				"div",
				{ className: "whSbEntry" },
				React.createElement(
					"button",
					{
						className: "whSbBtn",
						"data-active": open || undefined,
						"aria-pressed": open,
						"aria-label": "知识库",
						onClick: function () { kbSetOpen(!kbStore.open); }
					},
					React.createElement("span", { className: "whSbLabel" }, "知识库")
				)
			);
		}

		function KbRightPanel(props) {
			var open = useKbOpen();
			var topicsState = useState(null);
			var connState = useState(null);
			var errState = useState("");
			var modeState = useState("search");
			var topics = topicsState[0];
			var setTopics = topicsState[1];
			var conn = connState[0];
			var setConn = connState[1];
			var err = errState[0];
			var setErr = errState[1];
			var mode = modeState[0];
			var setMode = modeState[1];
			var loadedRef = useState(false);
			var inputActions = props && props.inputActions;
			var sessionId = props && props.sessionId;
			useEffect(function () {
				if (!open || loadedRef[0]) return;
				loadedRef[1] = true;
				var controller = new AbortController();
				Promise.all([
					fetch(API + "/topics", { signal: controller.signal, headers: { accept: "application/json" } }),
					fetch(API + "/list", { signal: controller.signal, headers: { accept: "application/json" } })
				])
					.then(function (rs) { return Promise.all(rs.map(function (r) { return r.ok ? r.json() : null; })); })
					.then(function (ds) {
						var td = ds[0];
						var conns = (ds[1] && Array.isArray(ds[1].connections) ? ds[1].connections : []).filter(function (c) { return c.board === "knowledge"; });
						if (td && td.ok && Array.isArray(td.topics)) { setTopics(td.topics); setErr(""); }
						else setErr(td && td.error ? td.error : "知识库列表获取失败");
						setConn(conns.length > 0 ? conns[0] : null);
					})
					.catch(function (e) { if (e && e.name !== "AbortError") setErr(String(e && e.message ? e.message : e)); });
				return function () { controller.abort(); };
			}, [open]);
			useEffect(function () {
				if (!open) loadedRef[1] = false;
			}, [open]);
			useEffect(function () {
				var onKey = function (e) { if (e.key === "Escape") kbSetOpen(false); };
				if (open) window.addEventListener("keydown", onKey);
				return function () { window.removeEventListener("keydown", onKey); };
			}, [open]);
			if (!open) return null;
			var pick = function (text) {
				var ok = false;
				if (inputActions && typeof inputActions.setDraft === "function") {
					inputActions.setDraft(text);
					ok = true;
				}
				if (!ok && typeof sessionId === "string") {
					try {
						var sessionsSvc = pluginCtx && pluginCtx.sessions ? pluginCtx.sessions : undefined;
						var actx = sessionsSvc && typeof sessionsSvc.scope === "function" ? sessionsSvc.scope(sessionId) : undefined;
						var conv = actx === undefined ? undefined : actx.get("conversation");
						var face = conv && conv.input && typeof conv.input.for === "function" ? conv.input.for(actx) : undefined;
						if (face && typeof face.setDraft === "function") { face.setDraft(text); ok = true; }
					} catch (e) { ok = false; }
				}
				if (!ok) setErr("无法写入输入框（当前会话不支持自动填入）");
				else { setErr(""); kbSetOpen(false); }
			};
			var cmd = (conn && conn.command) || { slug: "得到大脑", allSearch: "/得到大脑 在全部笔记中搜索：", allSave: "/得到大脑 保存笔记（默认库）：" };
			var cardCommand = function (t) {
				if (t.id === "__all") return mode === "save" ? cmd.allSave : cmd.allSearch;
				if (mode === "save") return "/" + cmd.slug + " 保存到「" + t.name + "」知识库（id: " + t.id + "）：";
				return "/" + cmd.slug + " 在「" + t.name + "」知识库（id: " + t.id + "）搜索：";
			};
			var thumb = function (t) {
				var src = t.id === "__all" ? KB_PLACEHOLDER : (t.cover || KB_PLACEHOLDER);
				return React.createElement("img", { className: "whThumb", src: src, width: 36, height: 36, alt: "", onError: function (e) { if (e.target.src !== KB_PLACEHOLDER) e.target.src = KB_PLACEHOLDER; } });
			};
			var cards = topics
				? [
					React.createElement("div", { className: "whKbCard", key: "__all", onClick: function () { pick(cardCommand({ id: "__all" })); }, title: "全部库 · 全局语义搜索" },
						thumb({ id: "__all" }),
						React.createElement("div", { className: "whKbText" },
							React.createElement("span", { className: "whKbName" }, "全部库"),
							React.createElement("span", { className: "whKbMeta" }, "全局搜索 · " + (conn ? conn.title : ""))
						)
					)
				].concat(topics.map(function (t) {
					return React.createElement("div", {
						className: "whKbCard", key: t.id, onClick: function () { pick(cardCommand(t)); },
						title: t.name + "（id: " + t.id + "）"
					},
						thumb(t),
						React.createElement("div", { className: "whKbText" },
							React.createElement("span", { className: "whKbName" }, t.name),
							React.createElement("span", { className: "whKbMeta" }, (t.noteCount !== null && t.noteCount !== undefined ? t.noteCount + " 篇笔记" : "—") + (conn && conn.title ? " · " + conn.title : ""))
						)
					);
				}))
				: null;
			var subtitle = conn
				? "已连接 1 个来源 · " + (topics ? topics.length : "…") + " 个库"
				: "未连接知识库来源";
			return React.createElement(
				"div",
				{ className: "whRightPanel", "data-plugin": "dsh-wanzh-hulian" },
				React.createElement("div", { className: "whRightPanelTop" }),
				React.createElement("div", { className: "whRightPanelHead" },
					React.createElement("p", { className: "whRightPanelTitle" }, "知识库"),
					React.createElement("button", { className: "whRightPanelClose", onClick: function () { kbSetOpen(false); }, "aria-label": "关闭知识库面板" }, "✕")
				),
				React.createElement("p", { className: "whRightPanelSub" }, subtitle + " · 选择的是知识库名称，不涉及具体笔记"),
				conn
					? React.createElement("div", { className: "whSeg" },
						React.createElement("button", { className: "whSegBtn" + (mode === "search" ? " whSegOn" : ""), onClick: function () { setMode("search"); } }, "搜索"),
						React.createElement("button", { className: "whSegBtn" + (mode === "save" ? " whSegOn" : ""), onClick: function () { setMode("save"); } }, "存库")
					)
					: null,
				err
					? React.createElement("span", { className: "whErr" }, err)
					: cards
						? React.createElement("div", { className: "whKbGrid" }, cards)
						: React.createElement("span", { className: "whHint" }, "加载中…"),
				React.createElement("p", { className: "whRightPanelHint" },
					mode === "save" ? "点卡将插入「保存到「库名」」指令。" : "点卡将插入「在「库名」中搜索：」指令。",
					"ESC 关闭；连接与默认库在 设置 → 万物互联 管理。"
				)
			);
		}

		exports.apply = function apply(ctx) {
			pluginCtx = ctx;
			ctx.effect(function () {
				return ctx.locale.register(NS, {
					zh: { nav: "万物互联" },
					en: { nav: "Connections" }
				});
			}, "dsh-wanzh-hulian: locale");
			ctx.effect(function () {
				var style = document.createElement("style");
				style.setAttribute("data-plugin-css", "dsh-wanzh-hulian");
				style.textContent = CSS.join("\n");
				document.head.appendChild(style);
				return function () { style.remove(); };
			}, "dsh-wanzh-hulian: css");
			ctx.slots.inject("settings.section", function () {
				return ctx.slots.register(
					{
						name: "settings.section",
						id: "wanzh-hulian",
						order: 28,
						label: function () {
							return ctx.locale.bind(NS)("nav");
						},
						locale: NS
					},
					WanzhPage
				);
			});
			ctx.slots.inject("sidebar.footer.action", function () {
				return ctx.slots.register(
					{ name: "sidebar.footer.action", id: "getnote-kb-sidebar", order: 30, label: "知识库" },
					SidebarKbButton
				);
			});
			ctx.slots.inject("conversation.input.dock", function () {
				return ctx.slots.register(
					{ name: "conversation.input.dock", id: "getnote-kb-panel", order: 210, label: "知识库面板" },
					KbRightPanel
				);
			});
		};
		return module.exports;
	}
});
