window.__ModuleLoader__.load({
	id: "dsh-loopx-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region \0loopx-css:src/client/goalbar.module.css.mjs
		const css = "._xPytW_dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance,0px) * 2 - var(--dsh-composer-dock-inset,0px) * 2);max-width:calc(var(--dsh-composer-card-max-width,760px) - var(--dsh-composer-dock-inset,0px) * 2);margin:0 auto calc(0px - var(--dsh-composer-stack-gap,0px) - 3px);padding:0 var(--dsh-composer-dock-inset,0px);font-family:var(--font-sans,var(--dsw-font-family,\"Geist\", \"Inter\", \"Helvetica Neue\", Arial, sans-serif));flex:none}._xPytW_panel{box-sizing:border-box;width:100%;color:var(--color-ink,var(--dsw-alias-label-primary,#171717));background:var(--color-surface,var(--dsw-alias-bg-base,#fff));border:1px solid var(--color-border,var(--dsw-alias-border-l1,#ebebeb));border-bottom:0;border-radius:12px 12px 0 0;overflow:hidden}._xPytW_stale{background:var(--color-surface-soft,var(--dsw-specific-tip,#f2f2f2))}._xPytW_row{box-sizing:border-box;align-items:center;gap:10px;min-height:40px;padding:4px 8px 4px 12px;display:flex}._xPytW_brand{font-family:var(--font-mono,var(--ds-font-family-code,\"Geist Mono\", \"SFMono-Regular\", monospace));letter-spacing:.06em;text-transform:uppercase;flex:none;font-size:12px;font-weight:600;line-height:16px}._xPytW_goalId{min-width:48px;max-width:min(30%,240px);font-family:var(--font-mono,var(--ds-font-family-code,\"Geist Mono\", \"SFMono-Regular\", monospace));color:var(--color-body,var(--dsw-alias-label-secondary,#4d4d4d));text-overflow:ellipsis;white-space:nowrap;flex:0 auto;font-size:12px;line-height:16px;overflow:hidden}._xPytW_progress{appearance:none;width:clamp(48px,14vw,120px);height:4px;color:var(--color-ink,var(--dsw-alias-label-primary,#171717));background:var(--color-border,var(--dsw-alias-border-l1,#ebebeb));border:0;border-radius:9999px;flex:80px;overflow:hidden}._xPytW_progress::-webkit-progress-bar{background:var(--color-border,var(--dsw-alias-border-l1,#ebebeb));border-radius:9999px}._xPytW_progress::-webkit-progress-value{background:currentColor;border-radius:9999px;transition:width .16s}._xPytW_progress::-moz-progress-bar{background:currentColor;border-radius:9999px;transition:width .16s}._xPytW_progressText,._xPytW_status{white-space:nowrap;flex:none;font-size:12px;line-height:16px}._xPytW_progressText{min-width:42px;font-family:var(--font-mono,var(--ds-font-family-code,\"Geist Mono\", \"SFMono-Regular\", monospace));color:var(--color-body,var(--dsw-alias-label-secondary,#4d4d4d));font-variant-numeric:tabular-nums}._xPytW_status{align-items:center;gap:6px;min-width:68px;font-weight:500;display:inline-flex}._xPytW_statusMark{background:currentColor;border:1px solid;border-radius:9999px;flex:none;width:6px;height:6px}._xPytW_status[data-status=paused] ._xPytW_statusMark{background:0 0;border-radius:1px}._xPytW_status[data-status=running] ._xPytW_statusMark{box-shadow:0 0 0 2px var(--color-surface,var(--dsw-alias-bg-base,#fff));outline:1px solid}._xPytW_action,._xPytW_refresh{min-width:58px;min-height:32px;color:var(--color-ink,var(--dsw-alias-label-primary,#171717));background:var(--color-surface,var(--dsw-alias-bg-base,#fff));border:1px solid var(--color-border,var(--dsw-alias-border-l2,#ebebeb));font:inherit;cursor:pointer;border-radius:6px;flex:none;padding:5px 10px;font-size:12px;font-weight:500;line-height:16px;transition:background-color .16s,border-color .16s}._xPytW_action:hover:not(:disabled),._xPytW_refresh:hover:not(:disabled){background:var(--color-surface-soft,var(--dsw-alias-interactive-bg-hover,#f2f2f2))}._xPytW_action:focus-visible,._xPytW_refresh:focus-visible{outline:2px solid var(--color-link,var(--dsw-alias-state-business-primary,#0070f3));outline-offset:2px}._xPytW_action:disabled,._xPytW_refresh:disabled{color:var(--color-faint,var(--dsw-alias-label-dimmed,#a1a1a1));cursor:not-allowed}._xPytW_error{color:var(--color-body,var(--dsw-alias-label-secondary,#4d4d4d));align-items:flex-start;gap:6px;margin:0;padding:0 12px 8px;font-size:12px;line-height:16px;display:flex}._xPytW_error>:first-child{font-family:var(--font-mono,var(--ds-font-family-code,\"Geist Mono\", \"SFMono-Regular\", monospace));flex:none;font-weight:600}@media (width<=640px){._xPytW_row{flex-wrap:wrap;gap:8px}._xPytW_goalId{flex:auto;max-width:calc(100% - 78px)}._xPytW_progress{flex-basis:72px;order:3}._xPytW_progressText,._xPytW_status,._xPytW_action,._xPytW_refresh{order:3}}@media (prefers-reduced-motion:reduce){._xPytW_progress::-webkit-progress-value,._xPytW_progress::-moz-progress-bar,._xPytW_action,._xPytW_refresh{transition:none}}";
		const tagId = "dsh-loopx-plugin/goalbar.module.css";
		function ensurePluginStyle() {
			if (typeof document === "undefined" || document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-loopx-plugin";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		ensurePluginStyle();
		var goalbar_module_css_default = {
			"action": "_xPytW_action",
			"brand": "_xPytW_brand",
			"dock": "_xPytW_dock",
			"error": "_xPytW_error",
			"goalId": "_xPytW_goalId",
			"panel": "_xPytW_panel",
			"progress": "_xPytW_progress",
			"progressText": "_xPytW_progressText",
			"refresh": "_xPytW_refresh",
			"row": "_xPytW_row",
			"stale": "_xPytW_stale",
			"status": "_xPytW_status",
			"statusMark": "_xPytW_statusMark"
		};
		//#endregion
		//#region build-temp/client/client/locale.js
		const GOALBAR_LOCALE_NAMESPACE = "loopx.goalbar";
		const GOALBAR_LOCALES = Object.freeze({
			en: {
				"region.label": "LoopX Goal status",
				"goal.label": "Goal {goalId}",
				"status.active": "Active",
				"status.running": "Running",
				"status.paused": "Paused",
				"action.start": "Start",
				"action.pause": "Pause",
				"action.refresh": "Refresh",
				"action.refreshing": "Refreshing",
				"progress.label": "Agent-lane todos: {processed} of {total} processed",
				"progress.empty": "No agent-lane todos",
				"error.session_unavailable": "The session is unavailable. Refresh to retry.",
				"error.cli_unavailable": "LoopX is unavailable. Refresh to retry.",
				"error.binding_read_failed": "The LoopX binding could not be read. Refresh to retry.",
				"error.activation_read_failed": "Goal status could not be read. Refresh to retry.",
				"error.todo_read_failed": "Todo progress could not be read. Refresh to retry.",
				"error.protocol_mismatch": "LoopX returned an unsupported status. Refresh to retry.",
				"error.transport_error": "LoopX is temporarily unreachable. Refresh to retry.",
				"error.protocol_error": "LoopX returned an unsupported response. Refresh to retry.",
				"error.binding_mismatch": "The LoopX binding changed. Refresh before trying again.",
				"error.binding_validation_failed": "The LoopX binding could not be verified. Refresh before trying again.",
				"error.not_actionable": "That action is no longer available. Refresh to continue.",
				"error.action_in_flight": "Another LoopX action is in progress. Refresh to check its result.",
				"error.operation_result_unknown": "The action result is uncertain. Refresh before trying again.",
				"error.driver_sync_failed": "LoopX changed, but the session did not sync. Refresh to check.",
				"error.post_read_failed": "LoopX changed, but the latest status is unavailable. Refresh to check."
			},
			zh: {
				"region.label": "LoopX 目标状态",
				"goal.label": "目标 {goalId}",
				"status.active": "已激活",
				"status.running": "运行中",
				"status.paused": "已暂停",
				"action.start": "启动",
				"action.pause": "暂停",
				"action.refresh": "刷新",
				"action.refreshing": "刷新中",
				"progress.label": "Agent 通道待办：已处理 {processed} / {total}",
				"progress.empty": "没有 Agent 通道待办",
				"error.session_unavailable": "会话不可用。请刷新后重试。",
				"error.cli_unavailable": "LoopX 当前不可用。请刷新后重试。",
				"error.binding_read_failed": "无法读取 LoopX 绑定。请刷新后重试。",
				"error.activation_read_failed": "无法读取目标状态。请刷新后重试。",
				"error.todo_read_failed": "无法读取待办进度。请刷新后重试。",
				"error.protocol_mismatch": "LoopX 返回了不支持的状态。请刷新后重试。",
				"error.transport_error": "暂时无法连接 LoopX。请刷新后重试。",
				"error.protocol_error": "LoopX 返回了不支持的响应。请刷新后重试。",
				"error.binding_mismatch": "LoopX 绑定已变化。请刷新后再试。",
				"error.binding_validation_failed": "无法验证 LoopX 绑定。请刷新后再试。",
				"error.not_actionable": "此操作已不可用。请刷新后继续。",
				"error.action_in_flight": "另一个 LoopX 操作正在进行。请刷新查看结果。",
				"error.operation_result_unknown": "操作结果不确定。请刷新后再试。",
				"error.driver_sync_failed": "LoopX 已更新，但会话同步失败。请刷新检查。",
				"error.post_read_failed": "LoopX 已更新，但最新状态不可用。请刷新检查。"
			}
		});
		const ERROR_KEYS = {
			session_unavailable: "error.session_unavailable",
			cli_unavailable: "error.cli_unavailable",
			binding_read_failed: "error.binding_read_failed",
			activation_read_failed: "error.activation_read_failed",
			todo_read_failed: "error.todo_read_failed",
			protocol_mismatch: "error.protocol_mismatch",
			transport_error: "error.transport_error",
			protocol_error: "error.protocol_error",
			binding_mismatch: "error.binding_mismatch",
			binding_validation_failed: "error.binding_validation_failed",
			not_actionable: "error.not_actionable",
			action_in_flight: "error.action_in_flight",
			operation_result_unknown: "error.operation_result_unknown",
			driver_sync_failed: "error.driver_sync_failed",
			post_read_failed: "error.post_read_failed"
		};
		function goalBarErrorKey(code) {
			return ERROR_KEYS[code];
		}
		//#endregion
		//#region build-temp/client/client/useGoalBar.js
		const INITIAL_STATE = {
			snapshot: null,
			errorCode: null,
			syncing: true,
			pendingAction: false
		};
		/**
		* Own the read/watch/action lifecycle for exactly one mounted component.
		* There is intentionally no shared client cache: every instance has its own
		* generation, cursor, AbortController, and same-frame action fence.
		*/
		function useGoalBar({ rpcSessionId, rpc, subscribeConnectionReset }) {
			const [state, setReactState] = (0, react.useState)(INITIAL_STATE);
			const stateRef = (0, react.useRef)(INITIAL_STATE);
			const activeSessionRef = (0, react.useRef)(rpcSessionId);
			const generationRef = (0, react.useRef)(0);
			const controllerRef = (0, react.useRef)(null);
			const anchorRef = (0, react.useRef)(null);
			const actionGuardRef = (0, react.useRef)(false);
			const commit = (0, react.useCallback)((update) => {
				const next = typeof update === "function" ? update(stateRef.current) : update;
				stateRef.current = next;
				setReactState(next);
			}, []);
			const replaceGeneration = (0, react.useCallback)(() => {
				controllerRef.current?.abort();
				const controller = new AbortController();
				const value = generationRef.current + 1;
				generationRef.current = value;
				controllerRef.current = controller;
				return {
					value,
					controller
				};
			}, []);
			const isCurrent = (0, react.useCallback)((generation) => !generation.controller.signal.aborted && generationRef.current === generation.value && controllerRef.current === generation.controller && activeSessionRef.current === rpcSessionId, [rpcSessionId]);
			const applySyncFault = (0, react.useCallback)((code) => {
				commit((current) => ({
					snapshot: current.snapshot?.sessionId === rpcSessionId ? current.snapshot : null,
					errorCode: code,
					syncing: false,
					pendingAction: false
				}));
			}, [commit, rpcSessionId]);
			const runReadWatchCycle = (0, react.useCallback)(async (generation, initialAnchor, readFirst) => {
				let anchor = initialAnchor;
				let shouldRead = readFirst;
				while (isCurrent(generation)) {
					if (shouldRead) {
						const read = await rpc.read(rpcSessionId, generation.controller.signal);
						if (!isCurrent(generation)) return;
						if (!read.ok) {
							applySyncFault(read.code);
							return;
						}
						const result = read.response.result;
						const snapshot = result.kind === "present" ? result.snapshot : null;
						anchor = {
							afterSessionEventSeq: result.baseSessionEventSeq,
							sourceRevision: result.sourceRevision,
							expected: snapshot === null ? null : {
								goalId: snapshot.goalId,
								loopxAgentId: snapshot.loopxAgentId
							},
							agentStatus: snapshot?.agentStatus ?? null
						};
						anchorRef.current = anchor;
						if (result.kind === "present") {
							actionGuardRef.current = false;
							commit({
								snapshot: result.snapshot,
								errorCode: null,
								syncing: false,
								pendingAction: false
							});
						} else if (result.kind === "hidden") {
							actionGuardRef.current = false;
							commit({
								snapshot: null,
								errorCode: null,
								syncing: false,
								pendingAction: false
							});
						} else {
							applySyncFault(result.code);
							return;
						}
						shouldRead = false;
						if (!isCurrent(generation)) return;
					}
					if (anchor === null) return;
					const watch = await rpc.watch(rpcSessionId, anchor, generation.controller.signal);
					if (!isCurrent(generation)) return;
					if (!watch.ok) {
						applySyncFault(watch.code);
						return;
					}
					const result = watch.response.result;
					if (result.kind === "fault") {
						applySyncFault(result.code);
						return;
					}
					if (result.kind === "timeout") {
						anchor = {
							...anchor,
							afterSessionEventSeq: result.sessionEventSeq
						};
						anchorRef.current = anchor;
						continue;
					}
					if (result.kind === "runtime_changed") {
						anchor = {
							...anchor,
							afterSessionEventSeq: result.sessionEventSeq,
							agentStatus: result.agentStatus
						};
						anchorRef.current = anchor;
						commit((current) => {
							const snapshot = current.snapshot;
							return snapshot?.sessionId === rpcSessionId ? {
								...current,
								snapshot: {
									...snapshot,
									agentStatus: result.agentStatus
								}
							} : current;
						});
						continue;
					}
					anchor = {
						...anchor,
						afterSessionEventSeq: result.sessionEventSeq
					};
					anchorRef.current = anchor;
					shouldRead = true;
					commit((current) => ({
						...current,
						syncing: true
					}));
				}
			}, [
				applySyncFault,
				commit,
				isCurrent,
				rpc,
				rpcSessionId
			]);
			const refresh = (0, react.useCallback)(() => {
				if (activeSessionRef.current !== rpcSessionId) return;
				actionGuardRef.current = false;
				const generation = replaceGeneration();
				commit((current) => ({
					snapshot: current.snapshot?.sessionId === rpcSessionId ? current.snapshot : null,
					errorCode: current.errorCode,
					syncing: true,
					pendingAction: false
				}));
				runReadWatchCycle(generation, anchorRef.current, true);
			}, [
				commit,
				replaceGeneration,
				rpcSessionId,
				runReadWatchCycle
			]);
			const requestAction = (0, react.useCallback)((requestedAction) => {
				const current = stateRef.current;
				const snapshot = current.snapshot;
				if (activeSessionRef.current !== rpcSessionId || snapshot === null || snapshot.sessionId !== rpcSessionId || current.errorCode !== null || current.syncing || current.pendingAction || actionGuardRef.current) return;
				if (requestedAction !== (snapshot.goalActivation === "active" ? "pause" : "start") || requestedAction === "start" && snapshot.agentStatus === "running") return;
				actionGuardRef.current = true;
				const generation = replaceGeneration();
				commit({
					snapshot,
					errorCode: null,
					syncing: false,
					pendingAction: true
				});
				(async () => {
					const expected = {
						goalId: snapshot.goalId,
						loopxAgentId: snapshot.loopxAgentId
					};
					const action = await rpc[requestedAction](rpcSessionId, expected, generation.controller.signal);
					if (!isCurrent(generation)) return;
					if (!action.ok) {
						applySyncFault(action.code);
						return;
					}
					const result = action.response.result;
					if (result.kind === "succeeded") {
						const anchor = {
							afterSessionEventSeq: result.baseSessionEventSeq,
							sourceRevision: result.sourceRevision,
							expected: {
								goalId: result.snapshot.goalId,
								loopxAgentId: result.snapshot.loopxAgentId
							},
							agentStatus: result.snapshot.agentStatus
						};
						anchorRef.current = anchor;
						commit({
							snapshot: result.snapshot,
							errorCode: null,
							syncing: false,
							pendingAction: false
						});
						actionGuardRef.current = false;
						runReadWatchCycle(generation, anchor, false);
						return;
					}
					if (result.kind === "applied_with_warning" && result.code === "driver_sync_failed") {
						anchorRef.current = {
							afterSessionEventSeq: result.baseSessionEventSeq,
							sourceRevision: result.sourceRevision,
							expected: {
								goalId: result.snapshot.goalId,
								loopxAgentId: result.snapshot.loopxAgentId
							},
							agentStatus: result.snapshot.agentStatus
						};
						commit({
							snapshot: result.snapshot,
							errorCode: result.code,
							syncing: false,
							pendingAction: false
						});
						return;
					}
					commit({
						snapshot,
						errorCode: result.code,
						syncing: false,
						pendingAction: false
					});
				})();
			}, [
				applySyncFault,
				commit,
				isCurrent,
				replaceGeneration,
				rpc,
				rpcSessionId,
				runReadWatchCycle
			]);
			(0, react.useEffect)(() => {
				activeSessionRef.current = rpcSessionId;
				anchorRef.current = null;
				actionGuardRef.current = false;
				commit(INITIAL_STATE);
				const generation = replaceGeneration();
				runReadWatchCycle(generation, null, true);
				return () => {
					generationRef.current += 1;
					controllerRef.current?.abort();
					controllerRef.current = null;
				};
			}, [
				commit,
				replaceGeneration,
				rpcSessionId,
				rpc,
				runReadWatchCycle
			]);
			(0, react.useEffect)(() => subscribeConnectionReset?.(refresh), [refresh, subscribeConnectionReset]);
			const snapshot = state.snapshot?.sessionId === rpcSessionId ? state.snapshot : null;
			const action = snapshot === null ? null : snapshot.goalActivation === "active" ? "pause" : "start";
			const actionDisabled = action === null || state.errorCode !== null || state.syncing || state.pendingAction || action === "start" && snapshot?.agentStatus === "running";
			return {
				snapshot,
				errorCode: snapshot === null ? null : state.errorCode,
				syncing: state.syncing,
				pendingAction: state.pendingAction,
				action,
				actionDisabled,
				refresh,
				requestAction
			};
		}
		//#endregion
		//#region build-temp/client/client/LoopXGoalBar.js
		function visibleStatus(snapshot) {
			if (snapshot.goalActivation === "stopped") return "paused";
			return snapshot.agentStatus === "running" ? "running" : "active";
		}
		function classes(...values) {
			return values.filter((value) => Boolean(value)).join(" ");
		}
		/** Compact, accessible presentation for one exact LoopX Goal binding. */
		function LoopXGoalBar({ rpcSessionId, rpc, t, subscribeConnectionReset }) {
			const goalBar = useGoalBar({
				rpcSessionId,
				rpc,
				subscribeConnectionReset
			});
			const snapshot = goalBar.snapshot;
			if (snapshot === null) return null;
			const status = visibleStatus(snapshot);
			const empty = snapshot.progress.total === 0;
			const progressLabel = empty ? t("progress.empty") : t("progress.label", {
				processed: snapshot.progress.processed,
				total: snapshot.progress.total
			});
			const actionLabel = goalBar.action === "start" ? t("action.start") : t("action.pause");
			return (0, react_jsx_runtime.jsx)("div", {
				className: goalbar_module_css_default.dock,
				children: (0, react_jsx_runtime.jsxs)("section", {
					className: classes(goalbar_module_css_default.panel, goalBar.errorCode !== null && goalbar_module_css_default.stale),
					"aria-label": t("region.label"),
					"aria-busy": goalBar.syncing || goalBar.pendingAction,
					children: [(0, react_jsx_runtime.jsxs)("div", {
						className: goalbar_module_css_default.row,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: goalbar_module_css_default.brand,
								children: "LoopX"
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: goalbar_module_css_default.goalId,
								"aria-label": t("goal.label", { goalId: snapshot.goalId }),
								title: snapshot.goalId,
								children: snapshot.goalId
							}),
							(0, react_jsx_runtime.jsx)("progress", {
								className: goalbar_module_css_default.progress,
								max: empty ? 1 : snapshot.progress.total,
								value: snapshot.progress.processed,
								"aria-label": progressLabel
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								className: goalbar_module_css_default.progressText,
								"aria-hidden": "true",
								children: [
									snapshot.progress.processed,
									" / ",
									snapshot.progress.total
								]
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								className: goalbar_module_css_default.status,
								"data-status": status,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: goalbar_module_css_default.statusMark,
									"aria-hidden": "true"
								}), t(`status.${status}`)]
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: goalbar_module_css_default.action,
								disabled: goalBar.actionDisabled,
								onClick: () => {
									if (goalBar.action !== null) goalBar.requestAction(goalBar.action);
								},
								children: actionLabel
							}),
							goalBar.errorCode !== null && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: goalbar_module_css_default.refresh,
								disabled: goalBar.syncing || goalBar.pendingAction,
								onClick: goalBar.refresh,
								children: goalBar.syncing ? t("action.refreshing") : t("action.refresh")
							})
						]
					}), goalBar.errorCode !== null && (0, react_jsx_runtime.jsxs)("p", {
						className: goalbar_module_css_default.error,
						role: "status",
						children: [(0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: "!"
						}), (0, react_jsx_runtime.jsx)("span", { children: t(goalBarErrorKey(goalBar.errorCode)) })]
					})]
				})
			});
		}
		//#endregion
		//#region build-temp/client/goalbar/protocol.js
		const GOALBAR_REQUEST_VERSION = "loopx_goalbar_request_v2";
		const GOALBAR_RESPONSE_VERSION = "loopx_goalbar_response_v2";
		const GOALBAR_ENDPOINTS = Object.freeze({
			read: "goalbar/read",
			watch: "goalbar/watch",
			start: "goalbar/start",
			pause: "goalbar/pause"
		});
		const GOALBAR_READ_FAULT_CODES = Object.freeze([
			"session_unavailable",
			"cli_unavailable",
			"binding_read_failed",
			"activation_read_failed",
			"todo_read_failed",
			"protocol_mismatch"
		]);
		const GOALBAR_ACTION_REJECTION_CODES = Object.freeze([
			"binding_mismatch",
			"binding_validation_failed",
			"not_actionable",
			"action_in_flight"
		]);
		Object.freeze(["transport_error", "protocol_error"]);
		const LOOPX_AGENT_ID_PATTERN = /^[a-z][a-z0-9_.:@-]{0,79}$/u;
		const GOAL_ID_MAX_LENGTH = 512;
		function record(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
		}
		function exactRecord(value, expectedKeys) {
			const candidate = record(value);
			if (candidate === void 0) return void 0;
			const keys = Reflect.ownKeys(candidate);
			if (keys.some((key) => typeof key !== "string") || keys.length !== expectedKeys.length) return;
			const allowed = new Set(expectedKeys);
			return keys.every((key) => typeof key === "string" && allowed.has(key)) ? candidate : void 0;
		}
		function isOneOf(value, choices) {
			return typeof value === "string" && choices.includes(value);
		}
		function isSequence(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
		}
		function isCursor(value) {
			return value === null || isSequence(value);
		}
		const SOURCE_REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/u;
		function isGoalBarSourceRevision(value) {
			return typeof value === "string" && SOURCE_REVISION_PATTERN.test(value);
		}
		function isGoalBarSessionId(value) {
			return typeof value === "string" && value.length > 0 && [...value].length <= 128 && value.trim() === value && !/[\s\u0000-\u001f/\\'"]/u.test(value);
		}
		function isGoalBarGoalId(value) {
			return typeof value === "string" && value.length > 0 && [...value].length <= GOAL_ID_MAX_LENGTH && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
		}
		function isGoalBarAgentId(value) {
			return typeof value === "string" && LOOPX_AGENT_ID_PATTERN.test(value);
		}
		function endpointForGoalBarOp(op) {
			return GOALBAR_ENDPOINTS[op];
		}
		function decodeGoalBarSnapshotV1(value, expected = {}) {
			const input = exactRecord(value, [
				"sessionId",
				"goalId",
				"loopxAgentId",
				"goalActivation",
				"agentStatus",
				"progress"
			]);
			const progress = exactRecord(input?.progress, [
				"processed",
				"remaining",
				"total"
			]);
			if (!isGoalBarSessionId(input?.sessionId) || !isGoalBarGoalId(input.goalId) || !isGoalBarAgentId(input.loopxAgentId) || !isOneOf(input.goalActivation, ["active", "stopped"]) || !isOneOf(input.agentStatus, ["idle", "running"]) || !isSequence(progress?.processed) || !isSequence(progress.remaining) || !isSequence(progress.total) || !Number.isSafeInteger(progress.processed + progress.remaining) || progress.processed + progress.remaining !== progress.total || expected.sessionId !== void 0 && input.sessionId !== expected.sessionId || expected.binding !== void 0 && (input.goalId !== expected.binding.goalId || input.loopxAgentId !== expected.binding.loopxAgentId)) return;
			return {
				sessionId: input.sessionId,
				goalId: input.goalId,
				loopxAgentId: input.loopxAgentId,
				goalActivation: input.goalActivation,
				agentStatus: input.agentStatus,
				progress: {
					processed: progress.processed,
					remaining: progress.remaining,
					total: progress.total
				}
			};
		}
		function decodeReadResult(value, sessionId) {
			const candidate = record(value);
			if (candidate?.kind === "hidden") {
				const input = exactRecord(value, [
					"kind",
					"reason",
					"baseSessionEventSeq",
					"sourceRevision"
				]);
				return input !== void 0 && isOneOf(input.reason, ["binding_missing", "binding_ambiguous"]) && isCursor(input.baseSessionEventSeq) && isGoalBarSourceRevision(input.sourceRevision) ? {
					kind: "hidden",
					reason: input.reason,
					baseSessionEventSeq: input.baseSessionEventSeq,
					sourceRevision: input.sourceRevision
				} : void 0;
			}
			if (candidate?.kind === "present") {
				const input = exactRecord(value, [
					"kind",
					"snapshot",
					"baseSessionEventSeq",
					"sourceRevision"
				]);
				const snapshot = decodeGoalBarSnapshotV1(input?.snapshot, { sessionId });
				return input !== void 0 && snapshot !== void 0 && isCursor(input.baseSessionEventSeq) && isGoalBarSourceRevision(input.sourceRevision) ? {
					kind: "present",
					snapshot,
					baseSessionEventSeq: input.baseSessionEventSeq,
					sourceRevision: input.sourceRevision
				} : void 0;
			}
			if (candidate?.kind === "fault") {
				const input = exactRecord(value, [
					"kind",
					"code",
					"baseSessionEventSeq",
					"sourceRevision"
				]);
				return input !== void 0 && isOneOf(input.code, GOALBAR_READ_FAULT_CODES) && isCursor(input.baseSessionEventSeq) && isGoalBarSourceRevision(input.sourceRevision) ? {
					kind: "fault",
					code: input.code,
					baseSessionEventSeq: input.baseSessionEventSeq,
					sourceRevision: input.sourceRevision
				} : void 0;
			}
		}
		function decodeWatchResult(value, afterSessionEventSeq) {
			const candidate = record(value);
			if (candidate?.kind === "source_changed") {
				const input = exactRecord(value, ["kind", "sessionEventSeq"]);
				return input !== void 0 && isCursor(input.sessionEventSeq) && (afterSessionEventSeq === null || input.sessionEventSeq !== null && input.sessionEventSeq >= afterSessionEventSeq) ? {
					kind: "source_changed",
					sessionEventSeq: input.sessionEventSeq
				} : void 0;
			}
			if (candidate?.kind === "runtime_changed") {
				const input = exactRecord(value, [
					"kind",
					"sessionEventSeq",
					"agentStatus"
				]);
				return input !== void 0 && isCursor(input.sessionEventSeq) && (afterSessionEventSeq === null || input.sessionEventSeq !== null && input.sessionEventSeq >= afterSessionEventSeq) && isOneOf(input.agentStatus, ["idle", "running"]) ? {
					kind: "runtime_changed",
					sessionEventSeq: input.sessionEventSeq,
					agentStatus: input.agentStatus
				} : void 0;
			}
			if (candidate?.kind === "timeout") {
				const input = exactRecord(value, ["kind", "sessionEventSeq"]);
				return input !== void 0 && isCursor(input.sessionEventSeq) && (afterSessionEventSeq === null || input.sessionEventSeq !== null && input.sessionEventSeq >= afterSessionEventSeq) ? {
					kind: "timeout",
					sessionEventSeq: input.sessionEventSeq
				} : void 0;
			}
			if (candidate?.kind === "fault") return exactRecord(value, ["kind", "code"])?.code === "session_unavailable" ? {
				kind: "fault",
				code: "session_unavailable"
			} : void 0;
		}
		function decodeActionResult(value, sessionId, binding) {
			const candidate = record(value);
			if (candidate?.kind === "succeeded") {
				const input = exactRecord(value, [
					"kind",
					"snapshot",
					"baseSessionEventSeq",
					"sourceRevision"
				]);
				const snapshot = decodeGoalBarSnapshotV1(input?.snapshot, {
					sessionId,
					binding
				});
				return input !== void 0 && snapshot !== void 0 && isCursor(input.baseSessionEventSeq) && isGoalBarSourceRevision(input.sourceRevision) ? {
					kind: "succeeded",
					snapshot,
					baseSessionEventSeq: input.baseSessionEventSeq,
					sourceRevision: input.sourceRevision
				} : void 0;
			}
			if (candidate?.kind === "rejected") {
				const input = exactRecord(value, ["kind", "code"]);
				return input !== void 0 && isOneOf(input.code, GOALBAR_ACTION_REJECTION_CODES) ? {
					kind: "rejected",
					code: input.code
				} : void 0;
			}
			if (candidate?.kind === "unknown") return exactRecord(value, ["kind", "code"])?.code === "operation_result_unknown" ? {
				kind: "unknown",
				code: "operation_result_unknown"
			} : void 0;
			if (candidate?.kind === "applied_with_warning") {
				if (candidate.code === "post_read_failed") return exactRecord(value, ["kind", "code"])?.code === "post_read_failed" ? {
					kind: "applied_with_warning",
					code: "post_read_failed"
				} : void 0;
				const input = exactRecord(value, [
					"kind",
					"code",
					"snapshot",
					"baseSessionEventSeq",
					"sourceRevision"
				]);
				const snapshot = decodeGoalBarSnapshotV1(input?.snapshot, {
					sessionId,
					binding
				});
				return input?.code === "driver_sync_failed" && snapshot !== void 0 && isCursor(input.baseSessionEventSeq) && isGoalBarSourceRevision(input.sourceRevision) ? {
					kind: "applied_with_warning",
					code: "driver_sync_failed",
					snapshot,
					baseSessionEventSeq: input.baseSessionEventSeq,
					sourceRevision: input.sourceRevision
				} : void 0;
			}
		}
		function decodeGoalBarResponseV1(request, value) {
			const input = exactRecord(value, [
				"v",
				"op",
				"sessionId",
				"result"
			]);
			if (input?.v !== "loopx_goalbar_response_v2" || input.op !== request.op || input.sessionId !== request.sessionId) return void 0;
			let result;
			if (request.op === "read") result = decodeReadResult(input.result, request.sessionId);
			else if (request.op === "watch") result = decodeWatchResult(input.result, request.afterSessionEventSeq);
			else result = decodeActionResult(input.result, request.sessionId, request.expected);
			return result === void 0 ? void 0 : {
				v: GOALBAR_RESPONSE_VERSION,
				op: request.op,
				sessionId: request.sessionId,
				result
			};
		}
		//#endregion
		//#region build-temp/client/client/rpc.js
		const GOALBAR_CHANNEL = "/loopx";
		async function callGoalBar(caller, request, signal) {
			try {
				const carrier = await caller.call(GOALBAR_CHANNEL, endpointForGoalBarOp(request.op), request, signal);
				if (!carrier.ok) return {
					ok: false,
					code: "transport_error"
				};
				const response = decodeGoalBarResponseV1(request, carrier.value);
				return response === void 0 ? {
					ok: false,
					code: "protocol_error"
				} : {
					ok: true,
					response
				};
			} catch {
				return {
					ok: false,
					code: "transport_error"
				};
			}
		}
		/**
		* Wrap DSH's generic Connection caller with the closed GoalBar V2 wire.
		* Carrier errors and thrown values are deliberately discarded at this boundary.
		*/
		function createGoalBarRpc(caller) {
			return {
				read(sessionId, signal) {
					return callGoalBar(caller, {
						v: GOALBAR_REQUEST_VERSION,
						op: "read",
						sessionId
					}, signal);
				},
				watch(sessionId, anchor, signal) {
					return callGoalBar(caller, {
						v: GOALBAR_REQUEST_VERSION,
						op: "watch",
						sessionId,
						...anchor
					}, signal);
				},
				start(sessionId, expected, signal) {
					return callGoalBar(caller, {
						v: GOALBAR_REQUEST_VERSION,
						op: "start",
						sessionId,
						expected
					}, signal);
				},
				pause(sessionId, expected, signal) {
					return callGoalBar(caller, {
						v: GOALBAR_REQUEST_VERSION,
						op: "pause",
						sessionId,
						expected
					}, signal);
				}
			};
		}
		//#endregion
		//#region build-temp/client/client/index.js
		const PACKAGE_ID = "dsh-loopx-plugin";
		/** Cordis service names required before the materialized Client plugin applies. */
		const inject = [
			"connection",
			"locale",
			"slots"
		];
		/** Register the exact-Session LoopX GoalBar contribution and its owned copy. */
		function apply(ctx) {
			ensurePluginStyle();
			ctx.effect(() => () => {
				if (typeof document === "undefined") return;
				for (const style of document.querySelectorAll("style[data-plugin]")) if (style.getAttribute("data-plugin") === PACKAGE_ID) style.remove();
			}, "dsh-loopx-plugin CSS ownership");
			ctx.effect(() => ctx.locale.register(GOALBAR_LOCALE_NAMESPACE, GOALBAR_LOCALES), "dsh-loopx-plugin GoalBar locale");
			const rpc = createGoalBarRpc(ctx.connection.rpc);
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "loopx-goal",
				order: 15,
				locale: GOALBAR_LOCALE_NAMESPACE,
				inject: (sessionId) => ({
					rpcSessionId: String(sessionId),
					rpc,
					subscribeConnectionReset: (listener) => ctx.on("connection/reset", listener)
				})
			}, LoopXGoalBar));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
