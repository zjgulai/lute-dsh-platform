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

		/**
		 * 本 bundle 与宿主 /api/dsh-overseas-skills 之间的负载形状。
		 * bundle 不使用 ES import，故在此集中声明边界类型——
		 * 否则 useState(null) 会把状态类型锁成 null，整条渲染链退化为 never。
		 */

		/** @typedef {{name: string, title: string, icon?: string, description?: string, descriptionZh?: string, modelEnabled?: boolean, toolGap?: string, installed?: boolean, template?: string}} OverseasSkillItem */
		/** @typedef {{key: string, title: string, icon?: string, items: OverseasSkillItem[]}} OverseasSkillSub */
		/** @typedef {{key: string, title: string, scenario?: string, icon?: string, items: OverseasSkillItem[]}} OverseasSkillGroup */
		/** @typedef {{id: string, alias: string, title: string, artifact?: string, plane?: {id:string,name:string}, domain?: {id:string,name:string}, order?: number, cards: string[], newCards: string[], wired: string[]}} OverseasOrgRoleNode */
		/** @typedef {{id: string, name: string, icon?: string, total: number, roles: OverseasOrgRoleNode[]}} OverseasOrgDomainNode */
		/** @typedef {{id: string, name: string, icon?: string, total: number, roleCount?: number, domains: OverseasOrgDomainNode[]}} OverseasOrgPlaneNode */
		/** @typedef {{key: string, title: string, icon?: string, total: number, planes: OverseasOrgPlaneNode[], unassigned: {cards: string[], kinds: Record<string, number>}}} OverseasOrgScenarioNode */
		/** @typedef {{scenarios: OverseasOrgScenarioNode[], wiredIndex: Record<string, string[]>, wiredOnlyByRole: Record<string, string[]>, stats: {cards:number, cardsAssigned:number, cardsUnassigned:number, roles:number, rolesWithCards:number, rows:number}, zeroCardRoles: Array<{id:string,alias:string,title:string,plane:string,domain:string}>}} OverseasOrgTree */
		/** @typedef {{ok: boolean, presets: {dir: string, count: number, problems: string[]}, assignmentMeta: Record<string, number|null>, layerIcons: Record<string,string>, roleIcons: Record<string,string>, roles: Array<Record<string, unknown>>, tree: OverseasOrgTree}} OverseasOrgPayload */
		/** @typedef {{key: string, title: string, icon?: string, subs: OverseasSkillGroup[]}} OverseasSkillScenario */
		/** @typedef {{exa: null|{configured?: boolean}, saving: boolean, msg: null|string}} ExaCredState */
		/**
		 * 把任意抛出值归一化为可读文本（与 host-util.errorMessage 同语义）。
		 * bundle 不使用 ES import，故本地声明一份；命名与语义保持一致。
		 * @param {unknown} reason 抛出值
		 * @returns {string} 错误文本
		 */
		function errMessage(reason) {
			if (reason instanceof Error) return reason.message;
			if (typeof reason === "string") return reason;
			if (reason === null || reason === undefined) return "";
			return String(reason);
		}
		var NS = "dsh-overseas-skills";
		var API = "/api/dsh-overseas-skills";

		var CSS = [
			'[data-plugin="dsh-overseas-skills"].ovsRoot { display:flex; flex-direction:column; gap:14px; padding:2px 0 8px; min-width:0; }',
			'[data-plugin="dsh-overseas-skills"] .ovsSearch { box-sizing:border-box; width:100%; height:32px; padding:0 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font-size:13px; line-height:20px; outline:none; }',
			'[data-plugin="dsh-overseas-skills"] .ovsSearch:focus { border-color: var(--dsw-alias-brand-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsSearch::placeholder { color: var(--dsw-alias-label-secondary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsGroup { display:flex; flex-direction:column; gap:8px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsGroupTitle { margin:0; display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:500; line-height:20px; color:var(--dsw-alias-label-secondary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsGroupTitleIcon { width:18px; height:18px; border-radius:5px; object-fit:contain; }',
			'[data-plugin="dsh-overseas-skills"] .ovsScenHead { display:flex; align-items:center; gap:8px; width:100%; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); padding:10px 12px; cursor:pointer; color:var(--dsw-alias-label-primary); font:inherit; text-align:left; }',
			'[data-plugin="dsh-overseas-skills"] .ovsScenHead:hover { border-color:var(--dsw-alias-label-dimmed); }',
			'[data-plugin="dsh-overseas-skills"] .ovsScenIcon { flex:none; width:22px; height:22px; border-radius:6px; object-fit:contain; }',
			'[data-plugin="dsh-overseas-skills"] .ovsScenTitle { flex:1; min-width:0; font-size:13px; font-weight:600; line-height:20px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsScenCount { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsScenCaret { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary); transition:transform .15s; }',
			'[data-plugin="dsh-overseas-skills"] .ovsScenBody { display:flex; flex-direction:column; gap:6px; padding:8px 0 8px 6px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsSubHead { display:flex; align-items:center; gap:6px; width:100%; border:none; background:transparent; padding:4px 8px; cursor:pointer; color:var(--dsw-alias-label-secondary); font:inherit; text-align:left; }',
			'[data-plugin="dsh-overseas-skills"] .ovsSubHead:hover { color:var(--dsw-alias-label-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsSubTitle { flex:1; min-width:0; font-size:12px; font-weight:500; line-height:18px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsSubCount { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsSubCaret { flex:none; font-size:10px; color:var(--dsw-alias-label-tertiary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsSubBody { padding:2px 0 8px 12px; }',
			// ── 四层下钻（场景 → 面 → 责任域 → 岗位）与徽标 ──────────────────────────
			'[data-plugin="dsh-overseas-skills"] .ovsToolbar { display:flex; align-items:center; gap:8px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsToolBtn { border:1px solid var(--dsw-alias-border-l1); background:transparent; border-radius:6px; padding:2px 8px; cursor:pointer; font:inherit; font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsToolBtn:hover { color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-label-dimmed); }',
			'[data-plugin="dsh-overseas-skills"] .ovsDiag { display:flex; flex-direction:column; gap:6px; padding:10px 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-2); }',
			'[data-plugin="dsh-overseas-skills"] .ovsDiagHead { display:flex; align-items:center; gap:8px; cursor:pointer; border:none; background:transparent; padding:0; font:inherit; text-align:left; color:var(--dsw-alias-label-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsDiagTitle { font-size:12px; font-weight:600; line-height:18px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsDiagBody { display:flex; flex-direction:column; gap:4px; padding-top:2px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsDiagLine { font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsDiagLine b { color:var(--dsw-alias-label-primary); font-weight:600; }',
			'[data-plugin="dsh-overseas-skills"] .ovsPlane { display:flex; flex-direction:column; gap:4px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsPlaneHead { display:flex; align-items:center; gap:8px; width:100%; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, var(--dsw-alias-bg-layer-1)); padding:7px 10px; cursor:pointer; color:var(--dsw-alias-label-primary); font:inherit; text-align:left; }',
			'[data-plugin="dsh-overseas-skills"] .ovsPlaneHead:hover { border-color:var(--dsw-alias-label-dimmed); }',
			'[data-plugin="dsh-overseas-skills"] .ovsPlaneIcon { flex:none; width:20px; height:20px; border-radius:5px; object-fit:contain; }',
			'[data-plugin="dsh-overseas-skills"] .ovsPlaneTitle { flex:1; min-width:0; font-size:12px; font-weight:600; line-height:18px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsPlaneCount { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsPlaneBody { display:flex; flex-direction:column; gap:4px; padding:2px 0 4px 10px; border-left:1px dashed var(--dsw-alias-border-l1); margin-left:9px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsDomainHead { display:flex; align-items:center; gap:7px; width:100%; border:none; background:transparent; padding:4px 6px; cursor:pointer; color:var(--dsw-alias-label-secondary); font:inherit; text-align:left; }',
			'[data-plugin="dsh-overseas-skills"] .ovsDomainHead:hover { color:var(--dsw-alias-label-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsDomainIcon { flex:none; width:18px; height:18px; border-radius:5px; object-fit:contain; }',
			'[data-plugin="dsh-overseas-skills"] .ovsDomainTitle { flex:1; min-width:0; font-size:12px; font-weight:500; line-height:18px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsDomainCount { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsDomainBody { display:flex; flex-direction:column; gap:4px; padding:2px 0 6px 12px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsRoleHead { display:flex; align-items:center; gap:8px; width:100%; border:1px solid transparent; border-radius:10px; background:transparent; padding:6px 8px; cursor:pointer; color:var(--dsw-alias-label-primary); font:inherit; text-align:left; }',
			'[data-plugin="dsh-overseas-skills"] .ovsRoleHead:hover { background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-border-l1); }',
			'[data-plugin="dsh-overseas-skills"] .ovsRoleIcon { flex:none; width:24px; height:24px; border-radius:7px; object-fit:contain; }',
			'[data-plugin="dsh-overseas-skills"] .ovsRoleName { flex:1; min-width:0; display:flex; flex-direction:column; gap:0; }',
			'[data-plugin="dsh-overseas-skills"] .ovsRoleAlias { font-size:12px; font-weight:600; line-height:17px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsRoleTitle { font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsRoleCount { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsRoleBody { padding:2px 0 8px 14px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsBadge { flex:none; font-size:10px; line-height:15px; padding:0 5px; border-radius:4px; white-space:nowrap; }',
			'[data-plugin="dsh-overseas-skills"] .ovsBadgeSelf { color:var(--dsw-alias-state-success-primary); border:1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent); }',
			'[data-plugin="dsh-overseas-skills"] .ovsBadgeOther { color:var(--dsw-alias-label-secondary); border:1px solid var(--dsw-alias-border-l1); }',
			'[data-plugin="dsh-overseas-skills"] .ovsBadgeNone { color:var(--dsw-alias-label-tertiary); border:1px dashed var(--dsw-alias-border-l1); }',
			'[data-plugin="dsh-overseas-skills"] .ovsBadgeNew { color:var(--dsw-alias-brand-primary); border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); }',
			'[data-plugin="dsh-overseas-skills"] .ovsBadgeMulti { color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }',
			'[data-plugin="dsh-overseas-skills"] .ovsLoose { display:flex; flex-direction:column; gap:6px; padding:8px 10px; border:1px dashed var(--dsw-alias-border-l1); border-radius:10px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsLooseTitle { font-size:12px; font-weight:500; line-height:18px; color:var(--dsw-alias-label-secondary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsDiagList { margin:0; padding-left:16px; font-size:11px; line-height:17px; color:var(--dsw-alias-label-secondary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsCardIcon { flex:none; width:22px; height:22px; border-radius:6px; object-fit:contain; }',
			'[data-plugin="dsh-overseas-skills"] .ovsGrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:8px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsCard { display:flex; flex-direction:column; gap:4px; padding:10px 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); min-width:0; }',
			'[data-plugin="dsh-overseas-skills"] .ovsCardHead { display:flex; align-items:center; justify-content:space-between; gap:8px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsCardTitleWrap { display:flex; align-items:center; gap:6px; min-width:0; }','[data-plugin="dsh-overseas-skills"] .ovsCardTitle { font-size:12px; line-height:18px; color:var(--dsw-alias-label-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; font-weight:500;}','[data-plugin="dsh-overseas-skills"] .ovsToolGap { flex:none; font-size:10px; line-height:14px; padding:0 5px; border-radius:4px; color:var(--dsw-alias-state-warn-primary); border:1px solid var(--dsw-alias-state-warn-primary); opacity:.9; }',
			'[data-plugin="dsh-overseas-skills"] .ovsCardDesc { margin:0; font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }',
			'[data-plugin="dsh-overseas-skills"] .ovsSwitch { position:relative; flex:none; width:34px; height:20px; border:none; border-radius:999px; cursor:pointer; padding:0; background:var(--dsw-alias-border-l2); transition:background .15s ease; }',
			'[data-plugin="dsh-overseas-skills"] .ovsSwitchOn { background:var(--dsw-alias-brand-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsSwitch:disabled { cursor:default; opacity:.6; }',
			'[data-plugin="dsh-overseas-skills"] .ovsSwitchKnob { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:var(--dsw-alias-bg-overlay); transition:left .15s ease; }',
			'[data-plugin="dsh-overseas-skills"] .ovsSwitchOn .ovsSwitchKnob { left:16px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsError { font-size:11px; line-height:16px; color:var(--dsw-alias-state-error-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsCred { display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); }',
			'[data-plugin="dsh-overseas-skills"] .ovsCredHead { display:flex; align-items:center; justify-content:space-between; gap:8px; }',
			'[data-plugin="dsh-overseas-skills"] .ovsCredTitle { font-size:13px; font-weight:500; line-height:20px; color:var(--dsw-alias-label-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsCredState { flex:none; font-size:11px; line-height:16px; padding:0 8px; border-radius:999px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }',
			'[data-plugin="dsh-overseas-skills"] .ovsCredStateOn { color:var(--dsw-alias-state-success-primary); background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }',
			'[data-plugin="dsh-overseas-skills"] .ovsCredInput { box-sizing:border-box; width:100%; height:32px; padding:0 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-size:13px; line-height:20px; outline:none; }',
			'[data-plugin="dsh-overseas-skills"] .ovsCredInput:focus { border-color:var(--dsw-alias-brand-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsCredBtn { align-self:flex-start; border:none; cursor:pointer; border-radius:8px; padding:6px 14px; font-size:13px; line-height:18px; color:#fff; background:var(--dsw-alias-brand-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovsCredBtn:hover:not(:disabled) { filter:brightness(1.08); }',
			'[data-plugin="dsh-overseas-skills"] .ovsCredBtn:disabled { opacity:.55; cursor:default; }',
			'[data-plugin="dsh-overseas-skills"] .ovsHint { font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); }',
			'@media (prefers-reduced-motion: reduce) { [data-plugin="dsh-overseas-skills"] .ovsSwitch, [data-plugin="dsh-overseas-skills"] .ovsSwitchKnob { transition:none; } }',
			// 滚动条不自己声明：官方 scrollbar.css 已对 body * / ::-webkit-scrollbar* 两条路径
			// 上了 --dsh-scrollbar-thumb（绑定到 --dsw-alias-scrollbar-bg-l1）。自行声明
			// scrollbar-width 会在 Chromium 里静音全部 ::-webkit-scrollbar 规则，而这里原先引用的
			// --dsw-alias-scrollbar-thumb 在官方样式表里并不存在（验收脚本的 token 覆盖检查抓到）。
			'[data-plugin="dsh-overseas-skills"] .ovpGrid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:6px; max-height:150px; overflow-y:auto; contain:content; padding:2px 2px 4px; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCard { position:relative; display:flex; flex-direction:column; gap:2px; padding:8px 10px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-2); cursor:pointer; min-width:0; text-align:left; transition:border-color .12s ease, background .12s ease; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCard:before { content:""; position:absolute; left:0; top:8px; bottom:8px; width:3px; border-radius:0 3px 3px 0; background:var(--dsw-alias-brand-primary); opacity:0; transform:scaleY(.4); transform-origin:center; transition:opacity .12s ease, transform .12s ease; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCard:hover { border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 65%, var(--dsw-alias-border-l1)); background:color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, var(--dsw-alias-bg-layer-2)); }',
			'[data-plugin="dsh-overseas-skills"] .ovpCard:hover:before { opacity:1; transform:scaleY(1); }',
			'[data-plugin="dsh-overseas-skills"] .ovpCard:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCardTop { display:flex; align-items:center; justify-content:space-between; gap:6px; min-width:0; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCardTitleWrap { min-width:0; flex:1; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCardTitle { max-width:100%; }',
			'[data-plugin="dsh-overseas-skills"] .ovpRight { flex-wrap:nowrap; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCardTitleWrap { display:inline-flex; align-items:center; gap:5px; min-width:0; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCardIcon { flex:none; width:18px; height:18px; border-radius:5px; object-fit:contain; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCardTitle { font-size:12px; font-weight:500; line-height:18px; color:var(--dsw-alias-label-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; transition:color .12s ease; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCard:hover .ovpCardTitle { color:var(--dsw-alias-brand-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovpCardDesc { margin:0; font-size:11px; line-height:16px; color:var(--dsw-alias-label-secondary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }',
			'[data-plugin="dsh-overseas-skills"] .ovpTag { flex:none; font-size:10px; line-height:14px; padding:0 5px; border-radius:999px; color:var(--dsw-alias-state-warn-primary); background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 30%, transparent); }',
			'[data-plugin="dsh-overseas-skills"] .ovpRight { flex:none; display:inline-flex; align-items:center; gap:4px; margin-left:auto; }',
			'[data-plugin="dsh-overseas-skills"] .ovpShort { border:none; background:transparent; cursor:pointer; font-size:10px; line-height:14px; padding:1px 6px; border-radius:6px; color:var(--dsw-alias-label-tertiary); opacity:0; transition:opacity .12s ease; }',
			'[data-plugin="dsh-overseas-skills"] .ovpCard:hover .ovpShort { opacity:1; }',
			'[data-plugin="dsh-overseas-skills"] .ovpShort:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }',
			'[data-plugin="dsh-overseas-skills"] .ovpLoading { font-size:11px; line-height:16px; color:var(--dsw-alias-label-tertiary); padding:2px 2px 6px; }',
			"@keyframes ovpIn { from { opacity:0; transform:translateY(-3px); } to { opacity:1; transform:none; } }",
			'@media (prefers-reduced-motion: reduce) { [data-plugin="dsh-overseas-skills"] .ovpBody { animation:none; } [data-plugin="dsh-overseas-skills"] .ovpCard, [data-plugin="dsh-overseas-skills"] .ovpCard:before, [data-plugin="dsh-overseas-skills"] .ovpPill, [data-plugin="dsh-overseas-skills"] .ovpCardTitle { transition:none; } }'
		].join("\n");



function OverseasSkillsPage(props) {
			props = props || {};
			var endpoint = props.endpoint || "/list";
			var showCred = props.showCred !== false;
			var groupsState = useState(/** @type {OverseasSkillGroup[]} */ ([]));
			var groups = groupsState[0];
			var setGroups = groupsState[1];
			var errState = useState(/** @type {string|null} */ (null));
			var err = errState[0];
			var setErr = errState[1];
			var queryState = useState("");
			var query = queryState[0];
			var setQuery = queryState[1];
			var scenState = useState(/** @type {OverseasSkillScenario[]|null} */ (null));
			var scen = scenState[0];
			var setScen = scenState[1];
			var expState = useState(/** @type {Record<string, boolean>} */ ({}));
			var exp = expState[0];
			var setExp = expState[1];
			var busyState = useState(/** @type {Record<string, boolean>} */ ({}));
			var busy = busyState[0];
			var setBusy = busyState[1];
			var credState = useState(/** @type {ExaCredState} */ ({ exa: null, saving: false, msg: null }));
			var cred = credState[0];
			var setCred = credState[1];
			var exaInputState = useState("");
			var exaInput = exaInputState[0];
			var setExaInput = exaInputState[1];
			/** 四层下钻模式（出海技能页）。AI全栈页不带此属性，保持原分组视图。 */
			var orgMode = props.org === true;
			var orgState = useState(/** @type {OverseasOrgPayload|null} */ (null));
			var org = orgState[0];
			var setOrg = orgState[1];
			/** 四层骨架取不到（路由未注册 / 宿主未重启）：退化到原场景分组，绝不留下空白页。 */
			var orgFailState = useState(false);
			var orgFailed = orgFailState[0];
			var setOrgFailed = orgFailState[1];
			var diagState = useState(false);
			var diagOpen = diagState[0];
			var setDiagOpen = diagState[1];

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
						setCred(function (c) { return { exa: c.exa, saving: false, msg: errMessage(e) }; });
					});
			};

			useEffect(function () {
				if (showCred) loadCred();
			}, [loadCred]);

			// 四层骨架（场景 → 面 → 责任域 → 岗位）：只在「出海技能」页取，AI全栈页保持原分组视图。
			// 单独一条路由，因为岗位头像约 190KB，而 /list 会被胶囊组件每 2 秒轮询。
			useEffect(function () {
				if (orgMode !== true) return undefined;
				var controller = new AbortController();
				fetch(API + "/org", { signal: controller.signal, headers: { accept: "application/json" } })
					.then(function (r) {
						if (!r.ok) throw new Error("HTTP " + r.status);
						return r.json();
					})
					.then(function (data) {
						var good = data && data.ok === true;
						setOrg(good ? data : null);
						setOrgFailed(!good);
					})
					.catch(function (e) {
						if (e && e.name === "AbortError") return;
						setOrg(null);
						setOrgFailed(true);
					});
				return function () {
					controller.abort();
				};
			}, [orgMode]);

			useEffect(function () {
				var controller = new AbortController();
				fetch(API + endpoint, { signal: controller.signal, headers: { accept: "application/json" } })
					.then(function (r) {
						if (!r.ok) throw new Error("HTTP " + r.status);
						return r.json();
					})
					.then(function (data) {
						setGroups(Array.isArray(data.groups) ? data.groups : []);
						setScen(Array.isArray(data.scenarios) ? data.scenarios : null);
						setErr(null);
					})
					.catch(function (e) {
						if (e && e.name === "AbortError") return;
						setErr(errMessage(e));
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
						var patch = function (it) { return it.name === name ? Object.assign({}, it, { modelEnabled: enabled }) : it; };
						setGroups(function (gs) {
							return gs.map(function (g) {
								return { key: g.key, title: g.title, icon: g.icon, scenario: g.scenario, items: g.items.map(patch) };
							});
						});
						setScen(function (scs) {
							if (!scs) return scs;
							return scs.map(function (sc) {
								return {
									key: sc.key, title: sc.title, icon: sc.icon,
									subs: sc.subs.map(function (sub) {
										return { key: sub.key, title: sub.title, items: sub.items.map(patch) };
									})
								};
							});
						});
					})
					.catch(function (e) {
						setErr(errMessage(e));
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
							scenario: g.scenario,
							items: g.items.filter(function (it) {
								return it.installed === true;
							})
						};
					})
					.filter(function (g) {
						return g.items.length > 0;
					});
				if (q === "") return installed;
				// 搜索分支重建分组时漏了 scenario：一旦输入关键词，分组标题会**静默丢掉
				// 场景前缀**，而无查询时又带着它（标题无谓地跳变）。这是 typecheck 接入时
				// 抓到的真实缺陷——两个分支必须产出同一形状。
				return installed
					.map(function (g) {
						return {
							key: g.key,
							title: g.title,
							icon: g.icon,
							scenario: g.scenario,
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

			var visibleScen = useMemo(function () {
				if (!scen) return null;
				return scen
					.map(function (sc) {
						return {
							key: sc.key, title: sc.title, icon: sc.icon,
							subs: (sc.subs || [])
								.map(function (sub) {
									return {
										key: sub.key, title: sub.title,
										items: (sub.items || []).filter(function (it) { return it.installed === true; })
									};
								})
								.filter(function (sub) { return sub.items.length > 0; })
						};
					})
					.filter(function (sc) { return sc.subs.length > 0; });
			}, [scen]);

			var toggleKey = function (k) {
				setExp(function (prev) {
					var next = Object.assign({}, prev);
					if (next[k] === true) delete next[k];
					else next[k] = true;
					return next;
				});
			};

			// ── 四层下钻所需的索引：卡片目录 + 一张卡挂在哪些岗位下 ────────────────
			var itemByName = useMemo(function () {
				var map = {};
				(groups || []).forEach(function (g) {
					(g.items || []).forEach(function (it) { map[it.name] = it; });
				});
				return map;
			}, [groups]);

			/** 技能名 → 归位到的岗位 id 列表（同一张卡在多岗出现是正常的，页脚要给出「行数 ≠ 卡片数」）。 */
			var orgIndex = useMemo(function () {
				var map = {};
				if (!org) return map;
				((org.tree || {}).scenarios || []).forEach(function (sc) {
					(sc.planes || []).forEach(function (pl) {
						(pl.domains || []).forEach(function (dm) {
							(dm.roles || []).forEach(function (rl) {
								(rl.cards || []).forEach(function (n) {
									if (!map[n]) map[n] = [];
									map[n].push(rl.id);
								});
							});
						});
					});
				});
				return map;
			}, [org]);

			var expKey = function () {
				return Array.prototype.slice.call(arguments).join("/");
			};

			/** 展开/收起全部：把所有场景、面、责任域一次打开（岗位留到最后一级，由人自己点）。 */
			var expandAll = function () {
				if (!org) return;
				/** @type {Record<string, boolean>} */
				var next = {};
				((org.tree || {}).scenarios || []).forEach(function (sc) {
					next[expKey("scn", sc.key)] = true;
					(sc.planes || []).forEach(function (pl) {
						next[expKey("pln", sc.key, pl.id)] = true;
						(pl.domains || []).forEach(function (dm) {
							next[expKey("dom", sc.key, pl.id, dm.id)] = true;
						});
					});
				});
				setExp(next);
			};

			/** 四层里的技能卡：与扁平视图同一张卡，另加两枚徽标（归位来源 / 接线状态）。 */
			var renderOrgCard = function (it, roleId, node) {
				/** @type {OverseasOrgTree|null} */
				var tree = org ? org.tree : null;
				if (!it) {
					// 归位表里有、目录里没有：不静默丢弃，用一张占位卡说明（数据不同步的可见信号）
					return React.createElement(
						"div",
						{ key: roleId + ":missing", className: "ovsCard" },
						React.createElement("span", { className: "ovsCardTitle" }, "目录中缺少这张卡"),
						React.createElement("p", { className: "ovsCardDesc" }, "归位表里有它，但技能目录（catalog）里没有，请重跑目录生成脚本。")
					);
				}
				var roles = orgIndex[it.name] || [];
				// 接线三态：判据来自宿主（node.wired 与 tree.wiredIndex），这里只做查表。
				// 规范定义在 lib/org-tree.js 的 wiringStatus 里，宿主侧有单测锁定；client bundle
				// 是独立工厂，require 不到那个模块，因此这里只重复 4 行查表、不重复判据。
				var wiredIndex = (tree && tree.wiredIndex) || {};
				var wiredElsewhere = wiredIndex[it.name] || [];
				var wire = (node.wired || []).indexOf(it.name) !== -1
					? { kind: "self", roleIds: [] }
					: wiredElsewhere.length > 0
						? { kind: "other", roleIds: wiredElsewhere }
						: { kind: "none", roleIds: [] };
				var badges = [];
				if (wire.kind === "self") badges.push(React.createElement("span", { key: "w", className: "ovsBadge ovsBadgeSelf" }, "本岗已接线"));
				else if (wire.kind === "other") badges.push(React.createElement("span", { key: "w", className: "ovsBadge ovsBadgeOther", title: "本岗 preset 没有挂载它，挂载它的是别的岗位" }, "接线到 " + wire.roleIds.join("/")));
				else badges.push(React.createElement("span", { key: "w", className: "ovsBadge ovsBadgeNone", title: "没有任何岗位的 preset 挂载它" }, "未接线"));
				if ((node.newCards || []).indexOf(it.name) !== -1) badges.push(React.createElement("span", { key: "n", className: "ovsBadge ovsBadgeNew", title: "这条归位是本轮语义判定新增的（既有映射里没有）" }, "归位·本轮判定"));
				if (roles.length > 1) badges.push(React.createElement("span", { key: "m", className: "ovsBadge ovsBadgeMulti", title: "同一张卡同时归这几个岗位" }, "跨 " + roles.length + " 岗"));

				return renderSkillCardWith(it, badges);
			};
			// ── 四层下钻的渲染：场景 → 面 → 责任域 → 岗位 → 卡 ────────────────────
			var img_ = function (cls, src) {
				return src ? React.createElement("img", { className: cls, src: src, alt: "" }) : null;
			};
			var caret_ = function (open) {
				return React.createElement("span", { className: "ovsScenCaret" }, open ? "\u25BE" : "\u25B8");
			};
			var head_ = function (cls, key, open, onClick, children) {
				return React.createElement(
					"button",
					{ key: key, className: cls, type: "button", "aria-expanded": open ? "true" : "false", onClick: onClick },
					// 各层的子元素以数组传入（头像在无图时是 null），在这里统一补 key ——
					// 否则 React 对每一层都报「list 缺 key」。
					React.Children.map(children, function (child, index) {
						if (child === null || child === undefined || child === false) return child;
						return child.key == null ? React.cloneElement(child, { key: "c" + index }) : child;
					})
				);
			};

			var renderOrgBlock = function () {
				if (!org) return null;
				var tree = org.tree || {};
				var stats = tree.stats || {};
				var layerIcons = org.layerIcons || {};
				var roleIcons = org.roleIcons || {};
				var zeroRoles = tree.zeroCardRoles || [];
				var wiredOnly = tree.wiredOnlyByRole || {};
				var wiredOnlyRoles = Object.keys(wiredOnly);
				var wiredOnlyCount = wiredOnlyRoles.reduce(function (n, id) { return n + wiredOnly[id].length; }, 0);

				var out = [];

				// 一致性诊断：把「没有位置可站」的东西摆出来——不摆就等于不存在
				var diagLines = [
					React.createElement("div", { key: "d1", className: "ovsDiagLine" },
						"技能卡 ", React.createElement("b", null, String(stats.cards ?? 0)),
						"　归位 ", React.createElement("b", null, String(stats.cardsAssigned ?? 0)),
						"　未归岗 ", React.createElement("b", null, String(stats.cardsUnassigned ?? 0)),
						"　岗位 ", React.createElement("b", null, String(stats.roles ?? 0)),
						"（有卡 ", React.createElement("b", null, String(stats.rolesWithCards ?? 0)), "）"
					),
					React.createElement("div", { key: "d2", className: "ovsDiagLine" },
						"行数 ", React.createElement("b", null, String(stats.rows ?? 0)),
						"　—— 一张卡归多个岗位就会在多处出现，所以行数大于卡片数；开关是按卡走的，任何一处拨动都作用于同一张卡。"
					)
				];
				if (diagOpen) {
					if (zeroRoles.length > 0) {
						diagLines.push(React.createElement("div", { key: "d3", className: "ovsDiagLine" },
							"本岗 0 张卡的岗位：",
							React.createElement("ul", { className: "ovsDiagList" },
								zeroRoles.map(function (r) {
									return React.createElement("li", { key: r.id }, r.id + " " + (r.alias ? r.alias + " · " : "") + r.title + "（" + r.plane + " / " + r.domain + "）");
								})
							)
						));
					}
					if (wiredOnlyCount > 0) {
						diagLines.push(React.createElement("div", { key: "d4", className: "ovsDiagLine" },
							"preset 挂了但未归本岗的卡 " + wiredOnlyCount + " 张（归位与接线不一致，是事实不是错误）：",
							React.createElement("ul", { className: "ovsDiagList" },
								wiredOnlyRoles.slice(0, 12).map(function (id) {
									return React.createElement("li", { key: id }, id + "：" + wiredOnly[id].length + " 张");
								})
							)
						));
					}
					diagLines.push(React.createElement("div", { key: "d5", className: "ovsDiagLine" },
						"岗位骨架来自 " + (org.presets && org.presets.dir ? org.presets.dir : "已安装 preset") + "（" + ((org.presets && org.presets.count) || 0) + " 个）；归位判定来自 manifest/role-assignments.json。"
						+ ((org.presets && org.presets.problems && org.presets.problems.length > 0) ? " 读取告警 " + org.presets.problems.length + " 条。" : "")
					));
				}
				out.push(React.createElement(
					"div",
					{ key: "diag", className: "ovsDiag" },
					head_("ovsDiagHead", "diagh", diagOpen, function () { setDiagOpen(!diagOpen); },
						[
							React.createElement("span", { key: "t", className: "ovsDiagTitle" }, "一致性诊断 · " + (zeroRoles.length + (stats.cardsUnassigned ? 1 : 0) + (wiredOnlyCount ? 1 : 0)) + " 条"),
							caret_(diagOpen)
						]
					),
					React.createElement("div", { className: "ovsDiagBody" }, diagLines)
				));

				out.push(React.createElement("div", { key: "bar", className: "ovsToolbar" },
					React.createElement("button", { className: "ovsToolBtn", type: "button", onClick: expandAll }, "展开全部"),
					React.createElement("button", { className: "ovsToolBtn", type: "button", onClick: function () { setExp(/** @type {Record<string, boolean>} */ ({})); } }, "全部收起")
				));

				(tree.scenarios || []).forEach(function (sc) {
					var scKey = expKey("scn", sc.key);
					var scOpen = exp[scKey] === true;
					var body = [];
					(sc.planes || []).forEach(function (pl) {
						var plKey = expKey("pln", sc.key, pl.id);
						var plOpen = exp[plKey] === true;
						var domNodes = [];
						(pl.domains || []).forEach(function (dm) {
							var dmKey = expKey("dom", sc.key, pl.id, dm.id);
							var dmOpen = exp[dmKey] === true;
							var roleNodes = [];
							(dm.roles || []).forEach(function (rl) {
								var rlKey = expKey("rol", sc.key, pl.id, dm.id, rl.id);
								var rlOpen = exp[rlKey] === true;
								roleNodes.push(React.createElement("div", { key: rl.id },
									head_("ovsRoleHead", "h", rlOpen, function () { toggleKey(rlKey); }, [
										img_("ovsRoleIcon", roleIcons[rl.id]),
										React.createElement("span", { key: "n", className: "ovsRoleName" },
											React.createElement("span", { className: "ovsRoleAlias" }, (rl.alias ? rl.alias + " · " : "") + rl.title),
											React.createElement("span", { className: "ovsRoleTitle" }, rl.id + (rl.artifact ? "　标准产物：" + rl.artifact : ""))
										),
										React.createElement("span", { key: "c", className: "ovsRoleCount" }, rl.cards.length + " 张"),
										caret_(rlOpen)
									]),
									rlOpen
										? React.createElement("div", { className: "ovsRoleBody" },
												React.createElement("div", { className: "ovsGrid" },
													rl.cards.map(function (n) { return renderOrgCard(itemByName[n], rl.id, rl); })
												)
											)
										: null
								));
							});
							domNodes.push(React.createElement("div", { key: dm.id },
								head_("ovsDomainHead", "h", dmOpen, function () { toggleKey(dmKey); }, [
									img_("ovsDomainIcon", dm.icon || layerIcons[dm.id]),
									React.createElement("span", { key: "t", className: "ovsDomainTitle" }, dm.name),
									React.createElement("span", { key: "c", className: "ovsDomainCount" }, dm.total + " 张 · " + dm.roles.length + " 岗"),
									caret_(dmOpen)
								]),
								dmOpen ? React.createElement("div", { className: "ovsDomainBody" }, roleNodes) : null
							));
						});
						body.push(React.createElement("div", { key: pl.id, className: "ovsPlane" },
							head_("ovsPlaneHead", "h", plOpen, function () { toggleKey(plKey); }, [
								img_("ovsPlaneIcon", pl.icon || layerIcons[pl.id]),
								React.createElement("span", { key: "t", className: "ovsPlaneTitle" }, pl.name),
								React.createElement("span", { key: "c", className: "ovsPlaneCount" }, pl.total + " 张 · " + (pl.roleCount || 0) + " 岗"),
								caret_(plOpen)
							]),
							plOpen ? React.createElement("div", { className: "ovsPlaneBody" }, domNodes) : null
						));
					});

					var looseCards = ((sc.unassigned || {}).cards || []);
					if (looseCards.length > 0) {
						var looseKey = expKey("loose", sc.key);
						var looseOpen = exp[looseKey] === true;
						var kinds = (sc.unassigned || {}).kinds || {};
						var kindText = Object.keys(kinds).map(function (k) { return k + " " + kinds[k]; }).join("　");
						body.push(React.createElement("div", { key: "loose", className: "ovsLoose" },
							head_("ovsDomainHead", "h", looseOpen, function () { toggleKey(looseKey); }, [
								React.createElement("span", { key: "t", className: "ovsLooseTitle" }, "未归岗 " + looseCards.length + " 张"),
								React.createElement("span", { key: "k", className: "ovsRoleCount" }, kindText),
								caret_(looseOpen)
							]),
							looseOpen
								? React.createElement("div", { className: "ovsGrid" },
										looseCards.map(function (n) { return React.createElement("div", { key: n }, renderSkillCard(itemByName[n])); })
									)
								: null
						));
					}

					out.push(React.createElement("section", { key: sc.key, className: "ovsGroup" },
						head_("ovsScenHead", "h", scOpen, function () { toggleKey(scKey); }, [
							img_("ovsScenIcon", sc.icon),
							React.createElement("span", { key: "t", className: "ovsScenTitle" }, sc.title),
							React.createElement("span", { key: "c", className: "ovsScenCount" }, sc.total + " 项"),
							caret_(scOpen)
						]),
						scOpen ? React.createElement("div", { className: "ovsScenBody" }, body) : null
					));
				});

				return out;
			};

			/**
			 * 一张技能卡。`badges` 只在四层视图里传（归位来源 / 接线状态 / 跨岗），
			 * 扁平视图与搜索路径调用时省略——注意调用处用 `.map(renderSkillCard)`
			 * 时第二个实参是数组下标，所以对外只暴露单参版本 renderSkillCard。
			 */
			var renderSkillCardWith = function (it, badges) {
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
							React.createElement("span", { className: "ovsCardTitle", title: it.name }, it.title),
							it.toolGap
								? React.createElement("span", { className: "ovsToolGap", title: "本机未接入对应外部工具，详见技能说明" }, "需外部工具")
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
								onClick: function () { toggle(it.name, !it.modelEnabled); }
							},
							React.createElement("span", { className: "ovsSwitchKnob" })
						)
					),
					it.descriptionZh || it.description
						? React.createElement("p", { className: "ovsCardDesc" }, it.descriptionZh || it.description)
						: null,
					badges && badges.length > 0
						? React.createElement("div", { className: "ovsCardTitleWrap", style: { flexWrap: "wrap" } }, badges)
						: null
				);
			};

			/** 单参版本：`.map(renderSkillCard)` 的第二个实参是下标，不能落到 badges 上。 */
			var renderSkillCard = function (it) {
				return renderSkillCardWith(it, null);
			};

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
				// 有搜索词时一律走扁平结果（横切入口），否则出海技能页走四层下钻。
				// 四层骨架取不到时退化为原场景分组（下面那条分支渲染），并在顶部说明原因——
				// 「增强项拿不到」不该让整页只剩一句加载中。
				q === "" && orgMode
					? (org
						? renderOrgBlock()
						: React.createElement("div", { className: "ovsHint" },
								orgFailed
									? "四层视图暂不可用：宿主没有应答 /org（通常是插件已更新但应用还没重启）。下面先按原场景分组显示；重启 DSH 后本页自动切换为「场景 → 面 → 责任域 → 岗位」。"
									: "四层骨架加载中…（/org：场景 → 面 → 责任域 → 岗位）"))
					: null,
				q !== ""
					? (visible
						? visible.map(function (g) {
								return React.createElement(
									"section",
									{ key: g.key, className: "ovsGroup" },
									React.createElement("h3", { className: "ovsGroupTitle" },
										g.icon ? React.createElement("img", { className: "ovsGroupTitleIcon", src: g.icon, alt: "" }) : null,
										(g.scenario ? g.scenario + " · " : "") + g.title + " · " + g.items.length
									),
									React.createElement("div", { className: "ovsGrid" }, g.items.map(renderSkillCard))
								);
							})
						: null)
					: (orgMode && !orgFailed
						? null
						: visibleScen && visibleScen.length > 0
						? visibleScen.map(function (sc) {
								var scOpen = exp[sc.key] === true;
								var total = sc.subs.reduce(function (n, sub) { return n + sub.items.length; }, 0);
								return React.createElement(
									"section",
									{ key: sc.key, className: "ovsGroup" },
									React.createElement(
										"button",
										{
											className: "ovsScenHead",
											type: "button",
											"aria-expanded": scOpen ? "true" : "false",
											onClick: function () { toggleKey(sc.key); }
										},
										sc.icon ? React.createElement("img", { className: "ovsScenIcon", src: sc.icon, alt: "" }) : null,
										React.createElement("span", { className: "ovsScenTitle" }, sc.title),
										React.createElement("span", { className: "ovsScenCount" }, total + " 项"),
										React.createElement("span", { className: "ovsScenCaret" }, scOpen ? "\u25BE" : "\u25B8")
									),
									scOpen
										? React.createElement(
												"div",
												{ className: "ovsScenBody" },
												sc.subs.map(function (sub) {
													var subKey = sc.key + "/" + sub.key;
													var subOpen = exp[subKey] === true;
													return React.createElement(
														"div",
														{ key: sub.key },
														React.createElement(
															"button",
															{
																className: "ovsSubHead",
																type: "button",
																"aria-expanded": subOpen ? "true" : "false",
																onClick: function () { toggleKey(subKey); }
															},
															React.createElement("span", { className: "ovsSubTitle" }, sub.title),
															React.createElement("span", { className: "ovsSubCount" }, sub.items.length),
															React.createElement("span", { className: "ovsSubCaret" }, subOpen ? "\u25BE" : "\u25B8")
														),
														subOpen
															? React.createElement(
																	"div",
																	{ className: "ovsSubBody" },
																	React.createElement("div", { className: "ovsGrid" }, sub.items.map(renderSkillCard))
																)
															: null
													);
												})
											)
										: null
								);
							})
						: visible
							? visible.map(function (g) {
									return React.createElement(
										"section",
										{ key: g.key, className: "ovsGroup" },
										React.createElement("h3", { className: "ovsGroupTitle" },
											g.icon ? React.createElement("img", { className: "ovsGroupTitleIcon", src: g.icon, alt: "" }) : null,
											(g.scenario ? g.scenario + " · " : "") + g.title + " · " + g.items.length
										),
										React.createElement("div", { className: "ovsGrid" }, g.items.map(renderSkillCard))
									);
								})
							: null)
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
					// 出海技能页走四层下钻（场景 → 面 → 责任域 → 岗位）；AI全栈页保持原分组视图。
					function OverseasSkillsOrgPage() {
						return React.createElement(OverseasSkillsPage, { endpoint: "/list", org: true });
					}
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
