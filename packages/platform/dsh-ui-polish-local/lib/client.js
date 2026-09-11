window.__ModuleLoader__.load({
	id: "dsh-ui-polish",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region dsh-ui-polish CSS
		/**
		 * LUTE 本机 UI 微调（DSH Desktop 2.0.5 锚点，升级后按 README 复查）。
		 *
		 * 生效内容（2026-09-11 收敛）：会话正文列 + 输入卡宽度 748px → 960px。
		 * 只覆盖官方主题 token --dsh-chat-content-width；聊天列、输入卡、审批卡、
		 * 表格留白、悬浮按钮定位全部按比例联动；max-width 语义下窄窗口自动收缩。
		 *
		 * 历史：滚动条透明/移除实验（v1–v7）已按用户决定撤销——主题滚动条渲染
		 * 路径无法被外部插件 CSS 稳定覆盖，不再尝试；诊断横幅亦已移除。
		 */
		const POLISH_CSS = `
/* dsh-ui-polish：正文 + 输入卡宽度 748 → 960 */
:root {
  --dsh-chat-content-width: 960px;
}
`;
		const STYLE_ID = "dsh-ui-polish-css";
		/** 安装样式标签；返回移除用的 disposer。 */
		function installPolishCss() {
			if (typeof document === "undefined") return () => {};
			if (document.getElementById(STYLE_ID) !== null) return () => {};
			const tag = document.createElement("style");
			tag.id = STYLE_ID;
			tag.dataset.plugin = "dsh-ui-polish";
			tag.textContent = POLISH_CSS;
			document.head.appendChild(tag);
			console.log("[dsh-ui-polish] style injected:", STYLE_ID);
			return () => {
				document.getElementById(STYLE_ID)?.remove();
			};
		}
		/** 纯 CSS 注入：不依赖任何 Cordis service，无 inject。 */
		function apply(ctx) {
			ctx.effect(installPolishCss, "dsh-ui-polish: ui polish css");
		}
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});
