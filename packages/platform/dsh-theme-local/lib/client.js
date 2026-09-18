window.__ModuleLoader__.load({
	id: "dsh-theme",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-theme-css:/Users/lute/project/Magpie-Horch/packages/platform/dsh-theme-local/src/client/studio.css.mjs
		const css = "[data-appearance-studio],\n[data-appearance-studio] * {\n  box-sizing: border-box;\n}\n\n[data-appearance-studio] {\n  --appearance-accent: var(--dsw-alias-state-business-primary);\n  --appearance-background: var(--dsw-alias-bg-base);\n  --appearance-surface: var(--dsw-alias-bg-layer-1);\n  --appearance-surface-raised: var(--dsw-alias-bg-layer-2);\n  --appearance-hover: var(--dsw-alias-interactive-bg-hover);\n  --appearance-border: var(--dsw-alias-border-l2);\n  --appearance-border-strong: var(--dsw-alias-border-l3);\n  --appearance-text: var(--dsw-alias-label-primary);\n  --appearance-text-muted: var(--dsw-alias-label-tertiary);\n  display: flex;\n  width: 100%;\n  max-width: 720px;\n  flex-direction: column;\n  gap: 20px;\n  padding-bottom: 24px;\n  color: var(--appearance-text);\n  font-family: var(--dsw-font-family);\n}\n\n[data-appearance-studio] button,\n[data-appearance-studio] input,\n[data-appearance-studio] select,\n[data-appearance-studio] textarea {\n  font: inherit;\n}\n\n[data-appearance-sr] {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  overflow: hidden;\n  border: 0;\n  margin: -1px;\n  clip-path: inset(50%);\n  white-space: nowrap;\n}\n\n[data-appearance-header] {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n  padding-bottom: 16px;\n  border-bottom: 1px solid var(--appearance-border);\n}\n\n[data-appearance-header] > div {\n  min-width: 0;\n}\n\n[data-appearance-header] h2 {\n  margin: 0;\n  color: var(--appearance-text);\n  font-size: 16px;\n  font-weight: 600;\n  line-height: 24px;\n}\n\n[data-appearance-header] p,\n[data-appearance-subheading] p,\n[data-appearance-card-header] p {\n  margin: 3px 0 0;\n  color: var(--appearance-text-muted);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n[data-appearance-header] p {\n  font-size: 14px;\n  line-height: 22px;\n}\n\n[data-appearance-button] {\n  min-height: 34px;\n  padding: 5px 12px;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-md, 8px);\n  color: var(--appearance-text);\n  background: var(--appearance-surface);\n  cursor: pointer;\n}\n\n[data-appearance-button]:hover {\n  background: var(--appearance-hover);\n}\n\n[data-appearance-button][data-variant=\"primary\"] {\n  border-color: transparent;\n  color: var(--dsw-alias-label-inverse, #fff);\n  background: var(--appearance-accent);\n}\n\n[data-appearance-button]:disabled,\n[data-appearance-stepper-button]:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n\n[data-appearance-button]:focus-visible,\n[data-appearance-stepper-button]:focus-visible,\n[data-appearance-stepper-value]:focus-visible,\n[data-appearance-chip-hex]:focus-visible,\n[data-appearance-chip-swatch]:focus-visible,\n[data-appearance-select]:focus-visible,\n[data-appearance-slider]:focus-visible,\n[data-appearance-share-input]:focus-visible,\n[data-appearance-advanced-toggle]:focus-visible,\n[data-appearance-switch]:focus-visible {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 2px;\n}\n\n[data-appearance-content] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 18px;\n}\n\n/* Cards keep the two decisions apart: the theme itself, then reader prefs. */\n[data-appearance-card] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 12px;\n  padding: 14px;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-lg, 12px);\n  background: var(--appearance-surface);\n}\n\n[data-appearance-card-header] h3 {\n  margin: 0;\n  color: var(--appearance-text);\n  font-size: 14px;\n  font-weight: 600;\n  line-height: 22px;\n}\n\n[data-appearance-subheading] h4 {\n  margin: 0;\n  color: var(--appearance-text);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 20px;\n}\n\n[data-appearance-subheading] {\n  display: flex;\n  flex-direction: column;\n  gap: 0;\n}\n\n/* Share --------------------------------------------------------------- */\n\n[data-appearance-share] {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n\n[data-appearance-share-actions] {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 8px;\n}\n\n[data-appearance-share-status] {\n  margin-right: auto;\n  color: var(--appearance-text-muted);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n[data-appearance-share-panel] {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  padding: 10px;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-md, 10px);\n  background: var(--appearance-surface-raised);\n}\n\n[data-appearance-share-input] {\n  width: 100%;\n  padding: 7px 9px;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-sm, 8px);\n  color: var(--appearance-text);\n  background: var(--appearance-background);\n  font-family: var(--ds-font-family-code);\n  font-size: 12px;\n  line-height: 18px;\n  resize: vertical;\n}\n\n[data-appearance-share-error] {\n  margin: 0;\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n[data-appearance-share-submit] {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n}\n\n/* Mode cards ---------------------------------------------------------- */\n\n[data-appearance-mode-grid] {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 10px;\n}\n\n[data-appearance-mode] {\n  display: flex;\n  min-width: 0;\n  height: auto;\n  flex-direction: column;\n  gap: 8px;\n  padding: 7px;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-md, 10px);\n  color: var(--appearance-text-muted);\n  background: var(--appearance-surface);\n  cursor: pointer;\n}\n\n[data-appearance-mode]:hover {\n  border-color: var(--appearance-border-strong);\n  background: var(--appearance-hover);\n}\n\n[data-appearance-mode]:has(input:focus-visible) {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 2px;\n}\n\n[data-appearance-mode][data-selected=\"true\"] {\n  border-color: var(--appearance-accent);\n  color: var(--appearance-text);\n  background: var(--appearance-surface-raised);\n  box-shadow: 0 0 0 2px\n    color-mix(in oklch, var(--appearance-accent) 18%, transparent);\n}\n\n[data-appearance-mode] > span:last-child {\n  color: inherit;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 20px;\n}\n\n[data-appearance-preview] {\n  position: relative;\n  display: flex;\n  width: 100%;\n  aspect-ratio: 1.8;\n  overflow: hidden;\n  border: 1px solid #0000001f;\n  border-radius: var(--dsw-alias-radius-md, 8px);\n  background: #fff;\n}\n\n[data-appearance-preview][data-mode=\"dark\"] {\n  border-color: #ffffff2e;\n  background: #18181b;\n}\n\n[data-appearance-preview][data-mode=\"system\"] {\n  background: linear-gradient(90deg, #fff 0 50%, #18181b 50%);\n}\n\n[data-appearance-preview-sidebar] {\n  width: 28%;\n  background: #f2f2f3;\n}\n\n[data-mode=\"dark\"] [data-appearance-preview-sidebar] {\n  background: #27272a;\n}\n\n[data-mode=\"system\"] [data-appearance-preview-sidebar] {\n  background: linear-gradient(90deg, #f2f2f3 0 50%, #27272a 50%);\n}\n\n[data-appearance-preview-surface] {\n  position: absolute;\n  right: 8%;\n  bottom: 12%;\n  display: grid;\n  width: 56%;\n  gap: 5px;\n  padding: 8px;\n  border-radius: var(--dsw-alias-radius-sm, 6px);\n  background: #f7f7f8;\n  box-shadow: var(--dsw-alias-shadow-md, 0 2px 8px #00000017);\n}\n\n[data-mode=\"dark\"] [data-appearance-preview-surface] {\n  background: #303034;\n}\n\n[data-mode=\"system\"] [data-appearance-preview-surface] {\n  background: linear-gradient(90deg, #f7f7f8 0 50%, #303034 50%);\n}\n\n[data-appearance-preview-surface] i {\n  height: 4px;\n  border-radius: 999px;\n  background: #c7c7cc;\n}\n\n[data-appearance-preview-surface] i:nth-child(2) {\n  width: 78%;\n}\n\n[data-appearance-preview-surface] i:nth-child(3) {\n  width: 48%;\n}\n\n/* Preset grid --------------------------------------------------------- */\n\n[data-appearance-preset-grid] {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 8px;\n}\n\n[data-appearance-preset] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 6px;\n  padding: 6px;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-md, 10px);\n  background: var(--appearance-surface);\n  cursor: pointer;\n}\n\n[data-appearance-preset]:hover {\n  border-color: var(--appearance-border-strong);\n  background: var(--appearance-hover);\n}\n\n[data-appearance-preset]:has(input:focus-visible) {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 2px;\n}\n\n[data-appearance-preset][data-selected=\"true\"] {\n  border-color: var(--appearance-accent);\n  box-shadow: 0 0 0 2px\n    color-mix(in oklch, var(--appearance-accent) 18%, transparent);\n}\n\n[data-appearance-preset] > span:last-child {\n  padding: 0 2px;\n  overflow: hidden;\n  color: var(--appearance-text);\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 18px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n[data-appearance-preset][data-custom=\"true\"] {\n  align-items: center;\n  justify-content: center;\n  border-style: dashed;\n  cursor: default;\n}\n\n[data-appearance-preset-custom] {\n  color: var(--appearance-text-muted);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n[data-appearance-theme-colors] {\n  display: grid;\n  width: 100%;\n  height: 24px;\n  grid-template-columns: repeat(6, 1fr);\n  overflow: hidden;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-sm, 6px);\n  background: var(--appearance-surface);\n}\n\n[data-appearance-theme-colors] i {\n  display: block;\n  min-width: 0;\n}\n\n/* Stacked variants ---------------------------------------------------- */\n\n[data-appearance-variant] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 8px;\n}\n\n[data-appearance-fields],\n[data-appearance-accent-group],\n[data-appearance-setting-list] {\n  display: grid;\n  min-width: 0;\n  overflow: hidden;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-md, 10px);\n  background: var(--appearance-surface);\n}\n\n[data-appearance-fields][hidden],\n[data-appearance-advanced-panel][hidden] {\n  display: none;\n}\n\n[data-appearance-chip],\n[data-appearance-accent],\n[data-appearance-contrast],\n[data-appearance-setting-row] {\n  display: grid;\n  grid-template-columns: minmax(7rem, 1fr) minmax(10rem, 15rem);\n  align-items: center;\n  min-height: 52px;\n  gap: 12px;\n  padding: 8px 12px;\n  border-bottom: 1px solid var(--appearance-border);\n}\n\n[data-appearance-chip]:last-child,\n[data-appearance-accent]:last-child,\n[data-appearance-contrast]:last-child,\n[data-appearance-setting-row]:last-child {\n  border-bottom: 0;\n}\n\n[data-appearance-chip-label],\n[data-appearance-setting-row] > span,\n[data-appearance-setting-copy] > span {\n  font-size: 13px;\n  font-weight: 500;\n}\n\n[data-appearance-chip-control] {\n  display: grid;\n  grid-template-columns: 28px minmax(0, 1fr);\n  align-items: center;\n  gap: 8px;\n}\n\n[data-appearance-chip-swatch] {\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  overflow: hidden;\n  border: 1px solid var(--appearance-border);\n  border-radius: 999px;\n  background: transparent;\n  cursor: pointer;\n}\n\n[data-appearance-chip-swatch]::-webkit-color-swatch-wrapper {\n  padding: 2px;\n}\n\n[data-appearance-chip-swatch]::-webkit-color-swatch {\n  border: 0;\n  border-radius: 999px;\n}\n\n[data-appearance-chip-hex] {\n  width: 100%;\n  min-width: 0;\n  height: 30px;\n  padding: 4px 9px;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-sm, 8px);\n  color: var(--appearance-text);\n  background: var(--appearance-background);\n  font-family: var(--ds-font-family-code);\n  font-size: 12px;\n}\n\n[data-appearance-chip-hex][aria-invalid=\"true\"] {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n\n[data-appearance-chip-error] {\n  grid-column: 2;\n  margin-top: -6px;\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 12px;\n}\n\n/* Accent swatches ----------------------------------------------------- */\n\n[data-appearance-swatches] {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n}\n\n[data-appearance-swatch-chip] {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 30px;\n  padding: 2px;\n  border: 1px solid transparent;\n  border-radius: 999px;\n  cursor: pointer;\n}\n\n[data-appearance-swatch-chip][data-selected=\"true\"] {\n  border-color: var(--appearance-accent);\n}\n\n[data-appearance-swatch-chip]:has(input:focus-visible) {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 2px;\n}\n\n[data-appearance-swatch-chip][data-custom=\"true\"] {\n  padding: 2px 10px;\n  border-color: var(--appearance-border);\n  border-style: dashed;\n  color: var(--appearance-text-muted);\n  font-size: 12px;\n  cursor: default;\n}\n\n[data-appearance-swatch-dot] {\n  display: block;\n  width: 24px;\n  height: 24px;\n  border: 1px solid #0000001f;\n  border-radius: 999px;\n}\n\n/* Contrast slider ----------------------------------------------------- */\n\n[data-appearance-contrast-copy] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 1px;\n}\n\n[data-appearance-contrast-copy] p,\n[data-appearance-setting-copy] p {\n  margin: 0;\n  color: var(--appearance-text-muted);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n[data-appearance-contrast-control] {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) 2.4rem;\n  align-items: center;\n  gap: 10px;\n}\n\n[data-appearance-slider] {\n  width: 100%;\n  height: 6px;\n  margin: 0;\n  border-radius: 999px;\n  background: linear-gradient(\n    90deg,\n    var(--appearance-accent) var(--appearance-contrast-fill, 50%),\n    var(--appearance-border) var(--appearance-contrast-fill, 50%)\n  );\n  cursor: pointer;\n  appearance: none;\n  -webkit-appearance: none;\n}\n\n[data-appearance-slider]::-webkit-slider-thumb {\n  width: 16px;\n  height: 16px;\n  border: 1px solid var(--appearance-border-strong);\n  border-radius: 999px;\n  margin-top: -5px;\n  background: var(--appearance-surface);\n  box-shadow: var(--dsw-shadow-lv1, 0 1px 3px #00000012);\n  appearance: none;\n  -webkit-appearance: none;\n}\n\n[data-appearance-slider]::-webkit-slider-runnable-track {\n  height: 6px;\n  border-radius: 999px;\n  background: transparent;\n}\n\n[data-appearance-slider-value] {\n  color: var(--appearance-text-muted);\n  font-family: var(--ds-font-family-code);\n  font-size: 12px;\n  text-align: right;\n}\n\n/* Advanced disclosure ------------------------------------------------- */\n\n[data-appearance-advanced] {\n  display: block;\n}\n\n[data-appearance-advanced-toggle] {\n  display: flex;\n  width: 100%;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 12px;\n  border: 0;\n  color: var(--appearance-text);\n  background: transparent;\n  cursor: pointer;\n  text-align: left;\n}\n\n[data-appearance-advanced-toggle]:hover {\n  background: var(--appearance-hover);\n}\n\n[data-appearance-chevron] {\n  width: 0;\n  height: 0;\n  margin-top: 6px;\n  border-top: 4px solid transparent;\n  border-bottom: 4px solid transparent;\n  border-left: 5px solid var(--appearance-text-muted);\n}\n\n[data-appearance-chevron][data-open=\"true\"] {\n  transform: rotate(90deg);\n}\n\n[data-appearance-advanced-copy] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n}\n\n[data-appearance-advanced-copy] > span {\n  font-size: 13px;\n  font-weight: 500;\n}\n\n[data-appearance-advanced-copy] p {\n  margin: 0;\n  color: var(--appearance-text-muted);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n[data-appearance-advanced-panel] {\n  display: grid;\n  border-top: 1px solid var(--appearance-border);\n}\n\n[data-appearance-advanced-panel] [data-appearance-chip] {\n  padding-left: 24px;\n}\n\n/* Prefs rows ---------------------------------------------------------- */\n\n[data-appearance-setting-copy] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n}\n\n[data-appearance-select] {\n  width: 100%;\n  min-width: 0;\n  height: 30px;\n  padding: 4px 26px 4px 9px;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-sm, 8px);\n  color: var(--appearance-text);\n  background: var(--appearance-background);\n  cursor: pointer;\n}\n\n[data-appearance-stepper] {\n  display: grid;\n  grid-template-columns: minmax(7rem, 1fr) minmax(10rem, 15rem);\n  align-items: center;\n  min-height: 52px;\n  gap: 12px;\n  padding: 8px 12px;\n  border-bottom: 1px solid var(--appearance-border);\n}\n\n[data-appearance-stepper]:last-child {\n  border-bottom: 0;\n}\n\n[data-appearance-stepper-control] {\n  display: inline-flex;\n  align-items: center;\n  justify-self: start;\n  gap: 2px;\n  padding: 2px;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-sm, 8px);\n  background: var(--appearance-background);\n}\n\n[data-appearance-stepper-button] {\n  width: 26px;\n  height: 26px;\n  border: 0;\n  border-radius: var(--dsw-alias-radius-sm, 6px);\n  color: var(--appearance-text);\n  background: transparent;\n  cursor: pointer;\n}\n\n[data-appearance-stepper-button]:hover:not(:disabled) {\n  background: var(--appearance-hover);\n}\n\n[data-appearance-stepper-value] {\n  width: 2.6rem;\n  height: 26px;\n  border: 0;\n  color: var(--appearance-text);\n  background: transparent;\n  font-family: var(--ds-font-family-code);\n  font-size: 12px;\n  text-align: center;\n}\n\n[data-appearance-segment] {\n  display: inline-flex;\n  padding: 3px;\n  border-radius: var(--dsw-alias-radius-md, 8px);\n  background: var(--appearance-surface-raised);\n}\n\n[data-appearance-segment] label {\n  display: inline-flex;\n  align-items: center;\n  min-height: 26px;\n  padding: 3px 10px;\n  border-radius: var(--dsw-alias-radius-sm, 6px);\n  color: var(--appearance-text-muted);\n  cursor: pointer;\n  font-size: 12px;\n}\n\n[data-appearance-segment] label[data-selected=\"true\"] {\n  color: var(--appearance-text);\n  background: var(--appearance-surface);\n  box-shadow: var(--dsw-shadow-lv1, 0 1px 3px #00000012);\n}\n\n[data-appearance-segment] label:has(input:focus-visible) {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 2px;\n}\n\n[data-appearance-switch] {\n  position: relative;\n  width: 40px;\n  height: 24px;\n  flex: none;\n  justify-self: start;\n  padding: 0;\n  border: 1px solid var(--appearance-border);\n  border-radius: 999px;\n  background: var(--appearance-surface-raised);\n  cursor: pointer;\n}\n\n[data-appearance-switch][aria-checked=\"true\"] {\n  border-color: transparent;\n  background: var(--appearance-accent);\n}\n\n[data-appearance-switch-thumb] {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 18px;\n  height: 18px;\n  border-radius: 999px;\n  background: var(--appearance-surface);\n  box-shadow: var(--dsw-shadow-lv1, 0 1px 3px #00000012);\n}\n\n[data-appearance-switch][aria-checked=\"true\"] [data-appearance-switch-thumb] {\n  left: 19px;\n}\n\n[data-appearance-status] {\n  min-height: 18px;\n  margin: -7px 2px 0;\n  color: var(--appearance-text-muted);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n[data-appearance-status][data-status=\"error\"] {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n@media (prefers-reduced-motion: no-preference) {\n  [data-appearance-button],\n  [data-appearance-mode],\n  [data-appearance-preset],\n  [data-appearance-swatch-chip],\n  [data-appearance-switch-thumb],\n  [data-appearance-segment] label,\n  [data-appearance-chip-swatch],\n  [data-appearance-select] {\n    transition:\n      border-color 180ms ease,\n      background-color 180ms ease,\n      color 180ms ease,\n      box-shadow 180ms ease,\n      left 180ms ease;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [data-appearance-button],\n  [data-appearance-mode],\n  [data-appearance-preset],\n  [data-appearance-swatch-chip],\n  [data-appearance-switch-thumb],\n  [data-appearance-segment] label,\n  [data-appearance-chip-swatch],\n  [data-appearance-select] {\n    transition: none;\n  }\n}\n\n@media (max-width: 620px) {\n  [data-appearance-mode-grid] {\n    grid-template-columns: 1fr;\n  }\n\n  [data-appearance-mode] {\n    display: grid;\n    grid-template-columns: minmax(7rem, 10rem) 1fr;\n    align-items: center;\n  }\n\n  [data-appearance-preset-grid] {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  [data-appearance-chip],\n  [data-appearance-accent],\n  [data-appearance-contrast],\n  [data-appearance-setting-row],\n  [data-appearance-stepper] {\n    grid-template-columns: 1fr;\n  }\n\n  [data-appearance-chip-error] {\n    grid-column: 1;\n  }\n}\n";
		const tagId = "dsh-theme/studio.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-theme";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/theme-settings.ts
		const THEME_COLOR_FIELDS = [
			"lightAccent",
			"lightBackground",
			"lightForeground",
			"lightSurface",
			"lightInlineCode",
			"lightSidebar",
			"darkAccent",
			"darkBackground",
			"darkForeground",
			"darkSurface",
			"darkInlineCode",
			"darkSidebar"
		];
		const LEGACY_THEME_COLOR_FIELDS = [
			"lightAccent",
			"lightBackground",
			"lightForeground",
			"lightSurface",
			"lightSidebar",
			"darkAccent",
			"darkBackground",
			"darkForeground",
			"darkSurface",
			"darkSidebar"
		];
		const THEME_CONTRAST_FIELDS = ["lightContrast", "darkContrast"];
		const UI_FONT_IDS = [
			"system",
			"inter",
			"avenir",
			"rounded",
			"serif"
		];
		const CODE_FONT_IDS = [
			"sf-mono",
			"jetbrains",
			"fira-code",
			"menlo",
			"cascadia"
		];
		const UI_FONT_SIZES = [
			12,
			13,
			14,
			15,
			16
		];
		const CODE_FONT_SIZES = [
			11,
			12,
			13,
			14,
			15
		];
		const THEME_TYPOGRAPHY_FIELDS = [
			"uiFont",
			"codeFont",
			"uiFontSize",
			"codeFontSize"
		];
		const THEME_STUDIO_FIELDS = [
			...THEME_COLOR_FIELDS,
			...THEME_CONTRAST_FIELDS,
			...THEME_TYPOGRAPHY_FIELDS
		];
		const DEFAULT_THEME_STUDIO_SETTINGS = {
			lightAccent: "#347A2F",
			lightBackground: "#F6F7F4",
			lightForeground: "#1E221F",
			lightSurface: "#FFFFFF",
			lightInlineCode: "#EEF1EC",
			lightSidebar: "#F1F4EF",
			darkAccent: "#58B848",
			darkBackground: "#171A17",
			darkForeground: "#F1F4F0",
			darkSurface: "#202420",
			darkInlineCode: "#292D29",
			darkSidebar: "#191C1A",
			lightContrast: 50,
			darkContrast: 50,
			uiFont: "system",
			codeFont: "sf-mono",
			uiFontSize: 14,
			codeFontSize: 12
		};
		const HEX_COLOR = /^#[\dA-F]{6}$/i;
		const LEGACY_EDITORIAL_SIGNATURE = {
			lightAccent: "#065588",
			lightBackground: "#F3F2EE",
			lightForeground: "#1F0909",
			lightSurface: "#E8E7DF"
		};
		function isHexColor(value) {
			return typeof value === "string" && HEX_COLOR.test(value);
		}
		function isContrast(value) {
			return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
		}
		function isOneOf(value, candidates) {
			return candidates.includes(value);
		}
		function mixHex(foreground, foregroundWeight, background) {
			const channels = (value) => [
				1,
				3,
				5
			].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
			const foregroundChannels = channels(foreground);
			const backgroundChannels = channels(background);
			return `#${foregroundChannels.map((channel, index) => Math.round(channel * foregroundWeight + backgroundChannels[index] * (1 - foregroundWeight)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
		}
		function decodeThemeStudioSettings(section) {
			if (section === null || typeof section !== "object") return void 0;
			const sourceRecord = section;
			const record = Object.entries(LEGACY_EDITORIAL_SIGNATURE).every(([field, value]) => typeof sourceRecord[field] === "string" && sourceRecord[field].toUpperCase() === value) ? {
				...sourceRecord,
				lightForeground: "#2F2C29"
			} : sourceRecord;
			for (const field of LEGACY_THEME_COLOR_FIELDS) if (!isHexColor(record[field])) return void 0;
			for (const field of THEME_COLOR_FIELDS) if (record[field] !== void 0 && !isHexColor(record[field])) return;
			const legacyInlineCode = {
				lightInlineCode: mixHex(record.lightForeground, .06, record.lightBackground),
				darkInlineCode: mixHex(record.darkForeground, .1, record.darkBackground)
			};
			return {
				...Object.fromEntries(THEME_COLOR_FIELDS.map((field) => {
					const fallback = field === "lightInlineCode" || field === "darkInlineCode" ? legacyInlineCode[field] : DEFAULT_THEME_STUDIO_SETTINGS[field];
					return [field, isHexColor(record[field]) ? record[field] : fallback];
				})),
				lightContrast: isContrast(record.lightContrast) ? record.lightContrast : 50,
				darkContrast: isContrast(record.darkContrast) ? record.darkContrast : 50,
				uiFont: isOneOf(record.uiFont, UI_FONT_IDS) ? record.uiFont : DEFAULT_THEME_STUDIO_SETTINGS.uiFont,
				codeFont: isOneOf(record.codeFont, CODE_FONT_IDS) ? record.codeFont : DEFAULT_THEME_STUDIO_SETTINGS.codeFont,
				uiFontSize: isOneOf(record.uiFontSize, UI_FONT_SIZES) ? record.uiFontSize : DEFAULT_THEME_STUDIO_SETTINGS.uiFontSize,
				codeFontSize: isOneOf(record.codeFontSize, CODE_FONT_SIZES) ? record.codeFontSize : DEFAULT_THEME_STUDIO_SETTINGS.codeFontSize
			};
		}
		//#endregion
		//#region src/client/locales.ts
		const NS = "dsh.theme";
		const zh = {
			nav: "外观",
			title: "外观",
			description: "实时调整界面配色、字体与字号",
			"mode.title": "外观模式",
			"mode.system": "跟随系统",
			"mode.light": "浅色",
			"mode.dark": "深色",
			"preset.title": "主题",
			"preset.description": "主题会同步应用配色、字体与字号，之后仍可继续微调",
			"preset.custom": "自定义",
			"preset.codex": "清醒",
			"preset.proof": "草稿",
			"preset.everforest": "林地",
			"preset.github": "源码",
			"preset.gruvbox": "炉火",
			"preset.linear": "轨道",
			"preset.notion": "宁静",
			"preset.raycast": "聚焦",
			"preset.rosePine": "绽放",
			"preset.graphite": "现代派",
			"preset.editorial": "印刷",
			"preset.midnight": "午夜",
			"preset.folio": "文集",
			"preset.porcelain": "画布",
			"preset.carbon": "碳夜代码",
			"variant.light": "浅色主题",
			"variant.dark": "深色主题",
			"accent.label": "强调色",
			"accent.custom": "自定义",
			"accent.lute": "青竹",
			"accent.blue": "靛蓝",
			"accent.teal": "松绿",
			"accent.violet": "紫罗兰",
			"accent.amber": "琥珀",
			"accent.rose": "绛红",
			"accent.slate": "石墨",
			"accent.red": "朱砂",
			"contrast.label": "对比度",
			"contrast.description": "调整边框、表面与次级文字的深浅",
			"contrast.low": "较低",
			"contrast.standard": "标准",
			"contrast.high": "较高",
			"advanced.title": "高级",
			"advanced.description": "微调表面、行内代码与侧栏色",
			"share.copy": "复制主题",
			"share.copied": "已复制",
			"share.import": "导入",
			"share.paste": "粘贴主题串",
			"share.submit": "导入主题",
			"share.cancel": "取消",
			"share.invalid": "主题串无法识别",
			"share.copyFallback": "无法访问剪贴板，请手动复制",
			"color.accent": "强调色",
			"color.background": "背景色",
			"color.foreground": "文字色",
			"color.surface": "表面色",
			"color.inlineCode": "行内代码背景",
			"color.sidebar": "侧栏色",
			"prefs.title": "偏好",
			"prefs.render.title": "动效与渲染",
			"prefs.reduceMotion": "减弱动效",
			"prefs.reduceMotion.description": "减少界面过渡与动画",
			"prefs.fontSmoothing": "字体平滑",
			"prefs.fontSmoothing.description": "使用 macOS 原生抗锯齿",
			"segment.system": "跟随系统",
			"segment.on": "开",
			"segment.off": "关",
			"typography.title": "字体与字号",
			"typography.description": "未安装的字体会自动使用后备字体",
			"typography.uiFont": "界面字体",
			"typography.codeFont": "代码字体",
			"typography.uiFontSize": "界面字号",
			"typography.codeFontSize": "代码字号",
			"size.decrease": "减小",
			"size.increase": "增大",
			"font.system": "系统默认",
			"font.inter": "Inter",
			"font.avenir": "Avenir Next",
			"font.rounded": "圆体",
			"font.serif": "衬线体",
			"font.sf-mono": "SF Mono",
			"font.jetbrains": "JetBrains Mono",
			"font.fira-code": "Fira Code",
			"font.menlo": "Menlo",
			"font.cascadia": "Cascadia Code",
			"status.saving": "正在保存…",
			"status.saved": "已实时应用",
			"status.error": "浏览器无法保存，当前预览仍有效",
			"action.reset": "恢复默认",
			"input.invalid": "请输入 6 位十六进制色值"
		};
		const en = {
			nav: "Appearance",
			title: "Appearance",
			description: "Tune interface colors, fonts, and type sizes live",
			"mode.title": "Appearance mode",
			"mode.system": "System",
			"mode.light": "Light",
			"mode.dark": "Dark",
			"preset.title": "Themes",
			"preset.description": "Themes apply colors, fonts, and sizes together; tune anything after",
			"preset.custom": "Custom",
			"preset.codex": "Lucid",
			"preset.proof": "Draft",
			"preset.everforest": "Grove",
			"preset.github": "Source",
			"preset.gruvbox": "Hearth",
			"preset.linear": "Orbit",
			"preset.notion": "Calm",
			"preset.raycast": "Focus",
			"preset.rosePine": "Bloom",
			"preset.graphite": "Modernist",
			"preset.editorial": "Press",
			"preset.midnight": "Midnight",
			"preset.folio": "Folio",
			"preset.porcelain": "Canvas",
			"preset.carbon": "Carbon Code",
			"variant.light": "Light theme",
			"variant.dark": "Dark theme",
			"accent.label": "Accent",
			"accent.custom": "Custom",
			"accent.lute": "Bamboo",
			"accent.blue": "Indigo",
			"accent.teal": "Pine",
			"accent.violet": "Violet",
			"accent.amber": "Amber",
			"accent.rose": "Rosewood",
			"accent.slate": "Slate",
			"accent.red": "Vermilion",
			"contrast.label": "Contrast",
			"contrast.description": "Adjusts borders, surfaces, and secondary text",
			"contrast.low": "Lower",
			"contrast.standard": "Standard",
			"contrast.high": "Higher",
			"advanced.title": "Advanced",
			"advanced.description": "Fine-tune surface, inline code, and sidebar colors",
			"share.copy": "Copy theme",
			"share.copied": "Copied",
			"share.import": "Import",
			"share.paste": "Paste a theme string",
			"share.submit": "Import theme",
			"share.cancel": "Cancel",
			"share.invalid": "That theme string is not readable",
			"share.copyFallback": "Clipboard unavailable — copy the string manually",
			"color.accent": "Accent",
			"color.background": "Background",
			"color.foreground": "Foreground",
			"color.surface": "Surface",
			"color.inlineCode": "Inline code background",
			"color.sidebar": "Sidebar",
			"prefs.title": "Preferences",
			"prefs.render.title": "Motion and rendering",
			"prefs.reduceMotion": "Reduce motion",
			"prefs.reduceMotion.description": "Fewer interface transitions and animations",
			"prefs.fontSmoothing": "Font smoothing",
			"prefs.fontSmoothing.description": "Use native macOS antialiasing",
			"segment.system": "System",
			"segment.on": "On",
			"segment.off": "Off",
			"typography.title": "Fonts and sizes",
			"typography.description": "Unavailable fonts automatically use fallbacks",
			"typography.uiFont": "Interface font",
			"typography.codeFont": "Code font",
			"typography.uiFontSize": "Interface size",
			"typography.codeFontSize": "Code size",
			"size.decrease": "Decrease",
			"size.increase": "Increase",
			"font.system": "System default",
			"font.inter": "Inter",
			"font.avenir": "Avenir Next",
			"font.rounded": "Rounded",
			"font.serif": "Serif",
			"font.sf-mono": "SF Mono",
			"font.jetbrains": "JetBrains Mono",
			"font.fira-code": "Fira Code",
			"font.menlo": "Menlo",
			"font.cascadia": "Cascadia Code",
			"status.saving": "Saving…",
			"status.saved": "Applied live",
			"status.error": "Browser storage is unavailable; preview remains active",
			"action.reset": "Reset",
			"input.invalid": "Enter a six-digit hex color"
		};
		//#endregion
		//#region src/client/persistence.ts
		const THEME_STUDIO_STORAGE_KEY = "dsh-theme/settings/v1";
		const THEME_PREFS_STORAGE_KEY = "dsh-theme/prefs/v1";
		const DEFAULT_THEME_STUDIO_PREFS = {
			reduceMotion: "system",
			fontSmoothing: false
		};
		function browserThemeStudioStorage() {
			try {
				return globalThis.localStorage;
			} catch {
				return;
			}
		}
		function loadThemeStudioSettings(storage) {
			if (storage === void 0) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
			try {
				const raw = storage.getItem(THEME_STUDIO_STORAGE_KEY);
				if (raw === null) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
				const parsed = JSON.parse(raw);
				const decoded = decodeThemeStudioSettings(parsed);
				if (decoded === void 0) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
				if (JSON.stringify(decoded) !== JSON.stringify(parsed)) saveThemeStudioSettings(storage, decoded);
				return decoded;
			} catch {
				return { ...DEFAULT_THEME_STUDIO_SETTINGS };
			}
		}
		function saveThemeStudioSettings(storage, settings) {
			if (storage === void 0) return false;
			try {
				storage.setItem(THEME_STUDIO_STORAGE_KEY, JSON.stringify(settings));
				return true;
			} catch {
				return false;
			}
		}
		function loadThemeStudioPrefs(storage) {
			const fallback = { ...DEFAULT_THEME_STUDIO_PREFS };
			if (storage === void 0) return fallback;
			try {
				const raw = storage.getItem(THEME_PREFS_STORAGE_KEY);
				if (raw === null) return fallback;
				const parsed = JSON.parse(raw);
				if (parsed === null || typeof parsed !== "object") return fallback;
				const record = parsed;
				return {
					reduceMotion: record.reduceMotion === "on" || record.reduceMotion === "off" ? record.reduceMotion : DEFAULT_THEME_STUDIO_PREFS.reduceMotion,
					fontSmoothing: record.fontSmoothing === true ? true : DEFAULT_THEME_STUDIO_PREFS.fontSmoothing
				};
			} catch {
				return fallback;
			}
		}
		function saveThemeStudioPrefs(storage, prefs) {
			if (storage === void 0) return false;
			try {
				storage.setItem(THEME_PREFS_STORAGE_KEY, JSON.stringify(prefs));
				return true;
			} catch {
				return false;
			}
		}
		//#endregion
		//#region src/client/prefs-css.ts
		const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
		/**
		* "system" mirrors the platform; "on"/"off" are explicit overrides that win
		* over the media query in both directions — that is the whole reason the
		* three-way choice exists instead of a single toggle.
		*/
		function shouldReduceMotion(pref, prefersReduce) {
			if (pref === "on") return true;
			if (pref === "off") return false;
			return prefersReduce;
		}
		/**
		* Presentation prefs ride on body attributes so the sheet stays inert until a
		* reader opts in: with no attribute set, not a single rule below matches and
		* the official app renders exactly as shipped. The app's own stylesheet never
		* consults prefers-reduced-motion, so "system" mirrors the media query here
		* instead of pretending the platform already did it.
		*/
		const PREFS_CSS = `
body[data-lute-reduce-motion="reduce"] *,
body[data-lute-reduce-motion="reduce"] *::before,
body[data-lute-reduce-motion="reduce"] *::after {
  animation-delay: 0s !important;
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-delay: 0s !important;
  transition-duration: 0.001ms !important;
  scroll-behavior: auto !important;
}
body[data-lute-font-smoothing="on"] {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`;
		/** The single decision the client uses to set or clear both body attributes. */
		function prefsAttributes(prefs, prefersReduce) {
			return {
				fontSmoothing: prefs.fontSmoothing,
				reduceMotion: shouldReduceMotion(prefs.reduceMotion, prefersReduce)
			};
		}
		//#endregion
		//#region src/client/presets.ts
		const THEME_PRESETS = [
			{
				id: "codex",
				palette: {
					lightAccent: "#347A2F",
					lightBackground: "#F6F7F4",
					lightForeground: "#1E221F",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#EEF1EC",
					lightSidebar: "#F1F4EF",
					darkAccent: "#58B848",
					darkBackground: "#171A17",
					darkForeground: "#F1F4F0",
					darkSurface: "#202420",
					darkInlineCode: "#292D29",
					darkSidebar: "#191C1A"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 14,
					codeFontSize: 12
				}
			},
			{
				id: "proof",
				palette: {
					lightAccent: "#3D755D",
					lightBackground: "#FAF9F6",
					lightForeground: "#292D29",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#EDEDEA",
					lightSidebar: "#FAF9F6",
					darkAccent: "#83B69D",
					darkBackground: "#171A17",
					darkForeground: "#E8EBE6",
					darkSurface: "#222622",
					darkInlineCode: "#2C2F2C",
					darkSidebar: "#171A17"
				},
				typography: {
					uiFont: "serif",
					codeFont: "menlo",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "everforest",
				palette: {
					lightAccent: "#4E713F",
					lightBackground: "#F8FAF6",
					lightForeground: "#303A32",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#ECEEEA",
					lightSidebar: "#F8FAF6",
					darkAccent: "#A7C080",
					darkBackground: "#181C1A",
					darkForeground: "#E1E5DC",
					darkSurface: "#222724",
					darkInlineCode: "#2C302D",
					darkSidebar: "#181C1A"
				},
				typography: {
					uiFont: "rounded",
					codeFont: "jetbrains",
					uiFontSize: 14,
					codeFontSize: 13
				}
			},
			{
				id: "github",
				palette: {
					lightAccent: "#0969DA",
					lightBackground: "#FFFFFF",
					lightForeground: "#1F2328",
					lightSurface: "#F6F8FA",
					lightInlineCode: "#F2F2F2",
					lightSidebar: "#FFFFFF",
					darkAccent: "#58A6FF",
					darkBackground: "#0D1117",
					darkForeground: "#E6EDF3",
					darkSurface: "#161B22",
					darkInlineCode: "#23272D",
					darkSidebar: "#0D1117"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 14,
					codeFontSize: 12
				}
			},
			{
				id: "gruvbox",
				palette: {
					lightAccent: "#8F4F18",
					lightBackground: "#FAF8F1",
					lightForeground: "#352F2B",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#EEECE5",
					lightSidebar: "#FAF8F1",
					darkAccent: "#D7995B",
					darkBackground: "#1F1F1D",
					darkForeground: "#F2E6C9",
					darkSurface: "#2A2926",
					darkInlineCode: "#34332E",
					darkSidebar: "#1F1F1D"
				},
				typography: {
					uiFont: "avenir",
					codeFont: "menlo",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "linear",
				palette: {
					lightAccent: "#5864C7",
					lightBackground: "#FFFFFF",
					lightForeground: "#252A35",
					lightSurface: "#F6F7FA",
					lightInlineCode: "#F2F2F3",
					lightSidebar: "#FFFFFF",
					darkAccent: "#8C97FF",
					darkBackground: "#15161B",
					darkForeground: "#E6E9EF",
					darkSurface: "#202127",
					darkInlineCode: "#2A2B30",
					darkSidebar: "#15161B"
				},
				typography: {
					uiFont: "inter",
					codeFont: "jetbrains",
					uiFontSize: 14,
					codeFontSize: 13
				}
			},
			{
				id: "notion",
				palette: {
					lightAccent: "#1969AA",
					lightBackground: "#FFFFFF",
					lightForeground: "#37352F",
					lightSurface: "#F7F7F5",
					lightInlineCode: "#F3F3F3",
					lightSidebar: "#FFFFFF",
					darkAccent: "#5A9DDE",
					darkBackground: "#191919",
					darkForeground: "#E5E5E4",
					darkSurface: "#242424",
					darkInlineCode: "#2D2D2D",
					darkSidebar: "#191919"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 14,
					codeFontSize: 12
				}
			},
			{
				id: "raycast",
				palette: {
					lightAccent: "#0A6BC0",
					lightBackground: "#FFFFFF",
					lightForeground: "#181818",
					lightSurface: "#F7F7F7",
					lightInlineCode: "#F1F1F1",
					lightSidebar: "#FFFFFF",
					darkAccent: "#4FA3F8",
					darkBackground: "#141414",
					darkForeground: "#F2F2F2",
					darkSurface: "#1F1F1F",
					darkInlineCode: "#2A2A2A",
					darkSidebar: "#141414"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 14,
					codeFontSize: 12
				}
			},
			{
				id: "rosePine",
				palette: {
					lightAccent: "#A14F5D",
					lightBackground: "#FAF8F7",
					lightForeground: "#433E5D",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#EFEDEE",
					lightSidebar: "#FAF8F7",
					darkAccent: "#EA9A97",
					darkBackground: "#201E2C",
					darkForeground: "#E0DEF4",
					darkSurface: "#2A2738",
					darkInlineCode: "#333140",
					darkSidebar: "#201E2C"
				},
				typography: {
					uiFont: "avenir",
					codeFont: "fira-code",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "graphite",
				palette: {
					lightAccent: "#8A1C1C",
					lightBackground: "#FCFCFC",
					lightForeground: "#111111",
					lightSurface: "#F3F3F3",
					lightInlineCode: "#EDEDED",
					lightSidebar: "#F3F3F3",
					darkAccent: "#E08A8A",
					darkBackground: "#171717",
					darkForeground: "#F1F1F1",
					darkSurface: "#222222",
					darkInlineCode: "#2C2C2C",
					darkSidebar: "#222222"
				},
				typography: {
					uiFont: "avenir",
					codeFont: "menlo",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "editorial",
				palette: {
					lightAccent: "#065588",
					lightBackground: "#F3F2EE",
					lightForeground: "#2F2C29",
					lightSurface: "#E8E7DF",
					lightInlineCode: "#DAD8D0",
					lightSidebar: "#E8E7DF",
					darkAccent: "#7CC4E4",
					darkBackground: "#211C1A",
					darkForeground: "#F1E8DF",
					darkSurface: "#2C2522",
					darkInlineCode: "#352D29",
					darkSidebar: "#2C2522"
				},
				typography: {
					uiFont: "serif",
					codeFont: "menlo",
					uiFontSize: 16,
					codeFontSize: 13
				}
			},
			{
				id: "midnight",
				palette: {
					lightAccent: "#216A8A",
					lightBackground: "#F7F9FA",
					lightForeground: "#202B33",
					lightSurface: "#EDF1F3",
					lightInlineCode: "#E3E8EB",
					lightSidebar: "#EDF1F3",
					darkAccent: "#6DC1E7",
					darkBackground: "#363B40",
					darkForeground: "#F2F5F7",
					darkSurface: "#474D54",
					darkInlineCode: "#2E3033",
					darkSidebar: "#2E3033"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "folio",
				palette: {
					lightAccent: "#36598A",
					lightBackground: "#FFFFFF",
					lightForeground: "#2E2E33",
					lightSurface: "#F8F8F8",
					lightInlineCode: "#EDEDED",
					lightSidebar: "#F8F8F8",
					darkAccent: "#8CB4E8",
					darkBackground: "#1E2025",
					darkForeground: "#F1F2F4",
					darkSurface: "#292C32",
					darkInlineCode: "#333740",
					darkSidebar: "#292C32"
				},
				typography: {
					uiFont: "serif",
					codeFont: "menlo",
					uiFontSize: 16,
					codeFontSize: 13
				}
			},
			{
				id: "porcelain",
				palette: {
					lightAccent: "#176895",
					lightBackground: "#FEFEFE",
					lightForeground: "#2F2F2F",
					lightSurface: "#F8F8F8",
					lightInlineCode: "#EEEEEE",
					lightSidebar: "#F8F8F8",
					darkAccent: "#71B7E3",
					darkBackground: "#18191B",
					darkForeground: "#F2F2F2",
					darkSurface: "#242629",
					darkInlineCode: "#2E3033",
					darkSidebar: "#242629"
				},
				typography: {
					uiFont: "serif",
					codeFont: "menlo",
					uiFontSize: 16,
					codeFontSize: 13
				}
			},
			{
				id: "carbon",
				palette: {
					lightAccent: "#2D65A3",
					lightBackground: "#FAFBFC",
					lightForeground: "#252932",
					lightSurface: "#F0F2F5",
					lightInlineCode: "#E7EAF0",
					lightSidebar: "#ECEFF3",
					darkAccent: "#61AFEF",
					darkBackground: "#282C34",
					darkForeground: "#D7DAE0",
					darkSurface: "#2C313C",
					darkInlineCode: "#1D1F23",
					darkSidebar: "#21252B"
				},
				typography: {
					uiFont: "system",
					codeFont: "fira-code",
					uiFontSize: 14,
					codeFontSize: 13
				}
			}
		];
		function getThemePreset(id) {
			const preset = THEME_PRESETS.find((candidate) => candidate.id === id);
			if (preset === void 0) throw new Error(`Unknown theme preset: ${id}`);
			return preset;
		}
		function themePresetSettings(id) {
			const preset = getThemePreset(id);
			return {
				lightContrast: 50,
				darkContrast: 50,
				...preset.palette,
				...preset.typography
			};
		}
		function themePresetIdOf(settings) {
			return THEME_PRESETS.find((preset) => {
				const expected = {
					lightContrast: 50,
					darkContrast: 50,
					...preset.palette,
					...preset.typography
				};
				return Object.entries(expected).every(([field, value]) => {
					const actual = settings[field];
					return typeof value === "string" && value.startsWith("#") ? typeof actual === "string" && actual.toUpperCase() === value : actual === value;
				});
			})?.id;
		}
		//#endregion
		//#region src/client/store.ts
		function createThemeStudioStore(initialSettings = DEFAULT_THEME_STUDIO_SETTINGS, initialPrefs = DEFAULT_THEME_STUDIO_PREFS) {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({
					activeScheme: "light",
					preference: "system",
					prefs: { ...initialPrefs },
					saveStatus: "idle",
					settings: { ...initialSettings }
				}),
				actions: {
					syncSettings: (draft, settings) => {
						draft.settings = { ...settings };
					},
					syncPrefs: (draft, prefs) => {
						draft.prefs = { ...prefs };
					},
					syncTheme: (draft, preference, activeScheme) => {
						draft.preference = preference;
						draft.activeScheme = activeScheme;
					},
					setSaveStatus: (draft, status) => {
						draft.saveStatus = status;
					}
				}
			});
		}
		//#endregion
		//#region src/client/accent-swatches.ts
		/**
		* Curated brand-led accent pairs. Each pair is a two-variant decision:
		* the light value carries the accent on the light canvas, the dark value on
		* the charcoal one. accent-swatches.test.ts verifies every pair against the
		* default LUTE canvas (WCAG 1.4.11 wants 3:1 for non-text UI; the shipped
		* set clears it with room to spare, so the chip also reads at a glance).
		*/
		const ACCENT_SWATCHES = [
			{
				id: "lute",
				light: "#347A2F",
				dark: "#58B848"
			},
			{
				id: "blue",
				light: "#2D65A3",
				dark: "#6FB3E8"
			},
			{
				id: "teal",
				light: "#3D755D",
				dark: "#83B69D"
			},
			{
				id: "violet",
				light: "#6046B0",
				dark: "#A99BF0"
			},
			{
				id: "amber",
				light: "#8A5A00",
				dark: "#D9A441"
			},
			{
				id: "rose",
				light: "#A8415F",
				dark: "#E58FA6"
			},
			{
				id: "slate",
				light: "#4C5A6B",
				dark: "#A9B4C4"
			},
			{
				id: "red",
				light: "#A5342F",
				dark: "#E08A85"
			}
		];
		/**
		* Both variants must match one pair, because the swatch sets them together:
		* a half-applied pair would render the chip as active while the canvas
		* carries a mixed accent.
		*/
		function activeAccentSwatchId(settings) {
			const light = settings.lightAccent.toUpperCase();
			const dark = settings.darkAccent.toUpperCase();
			return ACCENT_SWATCHES.find((swatch) => swatch.light.toUpperCase() === light && swatch.dark.toUpperCase() === dark)?.id;
		}
		//#endregion
		//#region src/client/AccentSwatches.tsx
		/**
		* Picking a swatch is one decision that writes both variants' accents, so the
		* chip shows the pair as a diagonal split: the light value leads on the light
		* canvas, the dark value takes over on charcoal.
		*/
		function AccentSwatches({ activeId, customLabel, label, labelOf, onSelect }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-accent": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"data-appearance-chip-label": true,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"aria-label": label,
					"data-appearance-swatches": true,
					role: "radiogroup",
					children: [ACCENT_SWATCHES.map((swatch) => {
						const name = labelOf(swatch.id);
						const selected = activeId === swatch.id;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							"data-appearance-swatch-chip": true,
							"data-selected": selected ? "true" : "false",
							title: name,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									checked: selected,
									"data-appearance-sr": true,
									name: "appearance-accent",
									type: "radio",
									value: swatch.id,
									onChange: () => onSelect(swatch.id)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									"data-appearance-swatch-dot": true,
									style: { background: `linear-gradient(135deg, ${swatch.light} 0 50%, ${swatch.dark} 50% 100%)` }
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"data-appearance-sr": true,
									children: name
								})
							]
						}, swatch.id);
					}), activeId === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"data-appearance-swatch-chip": true,
						"data-custom": "true",
						"data-selected": "true",
						children: customLabel
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/AdvancedDisclosure.tsx
		/**
		* Secondary colors live behind one disclosure so the default view shows the
		* three decisions most readers make (accent, background, text) without
		* hiding the rest. Collapsed by default keeps the settings section short in
		* the 720px column.
		*/
		function AdvancedDisclosure({ children, description, title }) {
			const [open, setOpen] = react.useState(false);
			const panelId = react.useId();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-advanced": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					"aria-controls": panelId,
					"aria-expanded": open,
					"data-appearance-advanced-toggle": true,
					type: "button",
					onClick: () => setOpen((current) => !current),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						"data-appearance-chevron": true,
						"data-open": open ? "true" : "false"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						"data-appearance-advanced-copy": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: description })]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					"data-appearance-advanced-panel": true,
					hidden: !open,
					id: panelId,
					children
				})]
			});
		}
		//#endregion
		//#region src/client/ColorChip.tsx
		/**
		* Compact color control: a swatch that opens the platform picker plus an
		* inline hex field for keyboard and paste workflows. The picker itself is the
		* native one on purpose — it already owns focus handling, keyboard support and
		* a screen-reader contract, so P1 spends no risk budget on a custom popover.
		*/
		function ColorChip({ field, invalidMessage, label, onChange, value }) {
			const [draft, setDraft] = react.useState(value);
			const valid = isHexColor(draft);
			react.useEffect(() => setDraft(value), [value]);
			const commit = (next) => {
				const normalized = next.toUpperCase();
				setDraft(normalized);
				if (isHexColor(normalized)) onChange(field, normalized);
			};
			const inputId = `appearance-${field}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-chip": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						"data-appearance-chip-label": true,
						htmlFor: inputId,
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"data-appearance-chip-control": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							"aria-label": label,
							"data-appearance-chip-swatch": true,
							type: "color",
							value,
							onChange: (event) => commit(event.currentTarget.value)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: inputId,
							"aria-describedby": valid ? void 0 : `${inputId}-error`,
							"aria-invalid": !valid,
							autoComplete: "off",
							"data-appearance-chip-hex": true,
							inputMode: "text",
							maxLength: 7,
							pattern: "#[0-9A-Fa-f]{6}",
							spellCheck: false,
							value: draft,
							onBlur: () => {
								if (!valid) setDraft(value);
							},
							onChange: (event) => commit(event.currentTarget.value)
						})]
					}),
					!valid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						id: `${inputId}-error`,
						"data-appearance-chip-error": true,
						children: invalidMessage
					})
				]
			});
		}
		//#endregion
		//#region src/client/ContrastSlider.tsx
		/**
		* The slider drives the neutral blend strength behind borders, raised
		* surfaces and secondary labels. The numeric readout is the source of truth;
		* the qualitative aria-valuetext keeps the ramp meaningful without inventing
		* a second scale.
		*/
		function ContrastSlider({ description, highLabel, label, lowLabel, onChange, standardLabel, value }) {
			const valueText = value <= 35 ? lowLabel : value >= 65 ? highLabel : standardLabel;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-contrast": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-appearance-contrast-copy": true,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"data-appearance-chip-label": true,
						children: label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: description })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-appearance-contrast-control": true,
					style: { "--appearance-contrast-fill": `${value}%` },
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						"aria-label": label,
						"aria-valuetext": valueText,
						"data-appearance-slider": true,
						max: 100,
						min: 0,
						step: 1,
						type: "range",
						value,
						onChange: (event) => onChange(Number(event.currentTarget.value))
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", {
						"data-appearance-slider-value": true,
						children: value
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/share-string.ts
		/**
		* The share string is the complete theme — colors, contrast, typography —
		* as compact JSON. The payload is projected through THEME_STUDIO_FIELDS, so
		* presentation preferences (reduce motion, font smoothing) can never leak
		* into it: they describe the reader's machine, not the palette, and
		* importing a shared theme must not flip them.
		*/
		function encodeThemeStudioSettings(settings) {
			const payload = Object.fromEntries(THEME_STUDIO_FIELDS.map((field) => [field, settings[field]]));
			return JSON.stringify(payload);
		}
		/**
		* Accepts any text a reader might paste. Field-level validation and legacy
		* migration are delegated to decodeThemeStudioSettings, which rejects records
		* that do not carry a full color set — so `{}` or a truncated paste reports
		* as unreadable instead of silently resetting the theme to defaults.
		*/
		function decodeShareString(raw) {
			const trimmed = raw.trim();
			if (trimmed === "") return void 0;
			try {
				return decodeThemeStudioSettings(JSON.parse(trimmed));
			} catch {
				return;
			}
		}
		//#endregion
		//#region src/client/ShareString.tsx
		/**
		* Copy and import share one panel: a copy whose clipboard write is refused
		* falls back to the same textarea, so a reader always ends up with the
		* string in hand instead of a silent failure.
		*/
		function ShareString({ onImport, settings, t }) {
			const [open, setOpen] = react.useState(false);
			const [payload, setPayload] = react.useState("");
			const [error, setError] = react.useState(void 0);
			const [copied, setCopied] = react.useState(false);
			const timer = react.useRef(void 0);
			react.useEffect(() => () => {
				if (timer.current !== void 0) window.clearTimeout(timer.current);
			}, []);
			const copy = async () => {
				const text = encodeThemeStudioSettings(settings);
				try {
					if (navigator.clipboard === void 0) throw new Error("no clipboard");
					await navigator.clipboard.writeText(text);
					setCopied(true);
					if (timer.current !== void 0) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 2e3);
				} catch {
					setPayload(text);
					setError(t("share.copyFallback"));
					setOpen(true);
				}
			};
			const submit = () => {
				const decoded = decodeShareString(payload);
				if (decoded === void 0) {
					setError(t("share.invalid"));
					return;
				}
				setError(void 0);
				setPayload("");
				setOpen(false);
				onImport(decoded);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-share": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-appearance-share-actions": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-live": "polite",
							"data-appearance-share-status": true,
							children: copied ? t("share.copied") : ""
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							"data-appearance-button": true,
							"data-variant": "secondary",
							type: "button",
							onClick: () => void copy(),
							children: t("share.copy")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							"aria-expanded": open,
							"data-appearance-button": true,
							"data-variant": "secondary",
							type: "button",
							onClick: () => {
								setError(void 0);
								setOpen((current) => !current);
							},
							children: t("share.import")
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-appearance-share-panel": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							"aria-describedby": error === void 0 ? void 0 : "appearance-share-error",
							"aria-label": t("share.paste"),
							"data-appearance-share-input": true,
							placeholder: t("share.paste"),
							rows: 3,
							spellCheck: false,
							value: payload,
							onChange: (event) => setPayload(event.currentTarget.value)
						}),
						error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							id: "appearance-share-error",
							"data-appearance-share-error": true,
							children: error
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							"data-appearance-share-submit": true,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								"data-appearance-button": true,
								"data-variant": "primary",
								type: "button",
								onClick: submit,
								children: t("share.submit")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								"data-appearance-button": true,
								"data-variant": "secondary",
								type: "button",
								onClick: () => {
									setError(void 0);
									setPayload("");
									setOpen(false);
								},
								children: t("share.cancel")
							})]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/SizeStepper.tsx
		/**
		* Steps only through the curated size list, so the control can never commit a
		* value the token layer does not model. Typed input commits on Enter or blur
		* and snaps to the nearest allowed size.
		*/
		function SizeStepper({ decreaseLabel, increaseLabel, label, onChange, value, values }) {
			const [draft, setDraft] = react.useState(String(value));
			react.useEffect(() => setDraft(String(value)), [value]);
			const index = values.indexOf(value);
			const first = values[0];
			const last = values[values.length - 1];
			const step = (delta) => {
				if (index < 0) return;
				const next = values[index + delta];
				if (next !== void 0) onChange(next);
			};
			const commit = (raw) => {
				const parsed = Number.parseInt(raw, 10);
				if (!Number.isFinite(parsed)) {
					setDraft(String(value));
					return;
				}
				const nearest = values.reduce((best, candidate) => Math.abs(candidate - parsed) < Math.abs(best - parsed) ? candidate : best, value);
				setDraft(String(nearest));
				if (nearest !== value) onChange(nearest);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-stepper": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"data-appearance-chip-label": true,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-appearance-stepper-control": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							"aria-label": `${decreaseLabel} ${label}`,
							"data-appearance-stepper-button": true,
							disabled: first !== void 0 && value <= first,
							type: "button",
							onClick: () => step(-1),
							children: "−"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							"aria-label": label,
							autoComplete: "off",
							"data-appearance-stepper-value": true,
							inputMode: "numeric",
							value: draft,
							onBlur: (event) => commit(event.currentTarget.value),
							onChange: (event) => setDraft(event.currentTarget.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") {
									commit(event.currentTarget.value);
									event.currentTarget.blur();
								}
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							"aria-label": `${increaseLabel} ${label}`,
							"data-appearance-stepper-button": true,
							disabled: last !== void 0 && value >= last,
							type: "button",
							onClick: () => step(1),
							children: "+"
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/theme-tokens.ts
		const UI_FONT_STACKS = {
			system: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", Arial, sans-serif",
			inter: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", Arial, sans-serif",
			avenir: "\"Avenir Next\", Avenir, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
			rounded: "\"SF Pro Rounded\", \"Nunito Sans\", -apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
			serif: "\"Iowan Old Style\", \"Songti SC\", \"Noto Serif CJK SC\", Georgia, serif"
		};
		const CODE_FONT_STACKS = {
			"sf-mono": "\"SF Mono\", \"JetBrains Mono\", \"Fira Code\", Consolas, \"Liberation Mono\", monospace",
			jetbrains: "\"JetBrains Mono\", \"SF Mono\", \"Fira Code\", Consolas, \"Liberation Mono\", monospace",
			"fira-code": "\"Fira Code\", \"SF Mono\", \"JetBrains Mono\", Consolas, \"Liberation Mono\", monospace",
			menlo: "Menlo, Monaco, \"SF Mono\", Consolas, \"Liberation Mono\", monospace",
			cascadia: "\"Cascadia Code\", \"SF Mono\", \"JetBrains Mono\", Consolas, \"Liberation Mono\", monospace"
		};
		function same(value) {
			return {
				light: value,
				dark: value
			};
		}
		function scaled(value, delta) {
			return Math.max(9, value + delta);
		}
		function font(size, lineHeight, delta, family, weight, style) {
			return [
				style,
				weight,
				`${scaled(size, delta)}px/${scaled(lineHeight, delta)}px`,
				family
			].filter((part) => part !== void 0).join(" ");
		}
		function typography(settings) {
			const uiDelta = settings.uiFontSize - 14;
			const codeDelta = settings.codeFontSize - 12;
			const uiFamily = UI_FONT_STACKS[settings.uiFont];
			const codeFamily = CODE_FONT_STACKS[settings.codeFont];
			const ui = (size, lineHeight, weight, style) => same(font(size, lineHeight, uiDelta, "var(--dsw-font-family)", weight, style));
			const code = (size, lineHeight) => same(font(size, lineHeight, codeDelta, "var(--ds-font-family-code)"));
			return {
				"--dsw-font-family": same(uiFamily),
				"--ds-font-family-code": same(codeFamily),
				"--dsw-font-mono": same(codeFamily),
				"--dsw-font-xl-24": ui(24, 32, 600),
				"--dsw-font-l-20": ui(20, 28, 500),
				"--dsw-font-m-18": ui(16, 28, 500),
				"--dsw-font-base-16": ui(16, 24),
				"--dsw-font-base-strong-16": ui(16, 24, 500),
				"--dsw-font-s-14": ui(14, 22),
				"--dsw-font-s-strong-14": ui(14, 22, 500),
				"--dsw-font-xs-13": ui(13, 20),
				"--dsw-font-xs-strong-13": ui(13, 20, 500),
				"--dsw-font-xxs-12": ui(12, 18),
				"--dsw-font-xxs-strong-12": ui(12, 18, 500),
				"--dsw-font-xxxs-11": ui(11, 14),
				"--dsw-font-xxxs-strong-11": ui(11, 14, 500),
				"--dsw-font-markdown-h1": ui(24, 34, 700),
				"--dsw-font-markdown-h2": ui(22, 32, 700),
				"--dsw-font-markdown-h3": ui(20, 30, 700),
				"--dsw-font-markdown-h4": ui(16, 28, 600),
				"--dsw-font-markdown-base": ui(16, 28),
				"--dsw-font-markdown-base-strong": ui(16, 28, 600),
				"--dsw-font-markdown-base-italic": ui(16, 28, void 0, "italic"),
				"--dsw-font-markdown-base-strong-italic": ui(16, 28, 600, "italic"),
				"--dsw-font-markdown-table": ui(15, 25),
				"--dsw-font-markdown-table-head": ui(15, 25, 500),
				"--dsw-font-markdown-small": ui(14, 24),
				"--dsw-font-markdown-small-strong": ui(14, 24, 600),
				"--dsw-font-markdown-small-italic": ui(14, 24, void 0, "italic"),
				"--dsw-font-markdown-small-strong-italic": ui(14, 24, 600, "italic"),
				"--dsw-font-markdown-code": code(14, 22),
				"--dsw-font-markdown-code-block": code(13, 22),
				"--dsw-font-markdown-code-block-small": code(12, 18)
			};
		}
		function palette(settings, mode) {
			const prefix = mode === "light" ? "light" : "dark";
			const factor = .6 + .8 * (settings[`${prefix}Contrast`] / 100);
			return {
				accent: settings[`${prefix}Accent`],
				background: settings[`${prefix}Background`],
				foreground: settings[`${prefix}Foreground`],
				surface: settings[`${prefix}Surface`],
				inlineCode: settings[`${prefix}InlineCode`],
				sidebar: settings[`${prefix}Sidebar`],
				scale: (amount) => Math.round(amount * factor)
			};
		}
		function mix(first, amount, second) {
			return `color-mix(in oklch, ${first} ${amount}%, ${second})`;
		}
		function buildThemeTokenOverrides(settings) {
			const light = palette(settings, "light");
			const dark = palette(settings, "dark");
			const pair = (getValue) => ({
				light: getValue(light),
				dark: getValue(dark)
			});
			return {
				...typography(settings),
				"--dsw-alias-bg-base": pair((colors) => colors.background),
				"--dsw-alias-bg-layer-1": pair((colors) => colors.surface),
				"--dsw-alias-bg-layer-2": {
					light: mix(light.background, light.scale(30), "#FFFFFF"),
					dark: mix("#FFFFFF", dark.scale(6), dark.surface)
				},
				"--dsw-alias-bg-layer-3": {
					light: mix(light.background, light.scale(15), "#FFFFFF"),
					dark: mix("#FFFFFF", dark.scale(10), dark.surface)
				},
				"--dsw-alias-bg-module-platform": {
					light: mix("#000000", light.scale(4), light.surface),
					dark: mix("#FFFFFF", dark.scale(6), dark.surface)
				},
				"--dsw-alias-bg-overlay": {
					light: mix(light.background, light.scale(10), "#FFFFFF"),
					dark: mix("#FFFFFF", dark.scale(12), dark.surface)
				},
				"--dsw-alias-border-l1": {
					light: mix("#000000", light.scale(8), light.background),
					dark: mix("#FFFFFF", dark.scale(10), dark.background)
				},
				"--dsw-alias-border-l2": {
					light: mix("#000000", light.scale(12), light.background),
					dark: mix("#FFFFFF", dark.scale(16), dark.background)
				},
				"--dsw-alias-border-l3": {
					light: mix("#000000", light.scale(18), light.background),
					dark: mix("#FFFFFF", dark.scale(22), dark.background)
				},
				"--dsw-alias-border-l4": {
					light: mix("#000000", light.scale(26), light.background),
					dark: mix("#FFFFFF", dark.scale(30), dark.background)
				},
				"--dsw-alias-brand-primary": pair((colors) => colors.accent),
				"--dsw-alias-button-info-fill": pair((colors) => colors.accent),
				"--dsw-alias-button-info-hover": {
					light: mix(light.accent, 86, light.foreground),
					dark: mix(dark.accent, 82, dark.background)
				},
				"--dsw-alias-label-primary": pair((colors) => colors.foreground),
				"--dsw-alias-label-secondary": pair((colors) => mix(colors.foreground, colors.scale(62), colors.background)),
				"--dsw-alias-label-tertiary": pair((colors) => mix(colors.foreground, colors.scale(50), colors.background)),
				"--dsw-alias-label-caption": pair((colors) => mix(colors.foreground, colors.scale(40), colors.background)),
				"--dsw-alias-label-dimmed": pair((colors) => mix(colors.foreground, colors.scale(28), colors.background)),
				"--dsw-alias-markdown-inline-code": pair((colors) => colors.inlineCode),
				"--dsw-alias-state-business-primary": pair((colors) => colors.accent),
				"--dsw-alias-state-business-tertiary": pair((colors) => mix(colors.accent, 12, colors.background)),
				"--dsw-alias-interactive-bg-hover": {
					light: mix("#000000", light.scale(5), light.background),
					dark: mix("#FFFFFF", dark.scale(7), dark.background)
				},
				"--dsw-alias-interactive-bg-hover-solid": {
					light: mix("#000000", light.scale(5), light.surface),
					dark: mix("#FFFFFF", dark.scale(7), dark.surface)
				},
				"--dsw-alias-interactive-bg-hover-accent": pair((colors) => mix(colors.accent, 10, colors.background)),
				"--dsw-alias-interactive-bg-active": {
					light: mix("#000000", light.scale(9), light.background),
					dark: mix("#FFFFFF", dark.scale(11), dark.background)
				},
				"--dsw-specific-sidebar-fill": pair((colors) => colors.sidebar),
				"--dsw-specific-sidebar-nav-item-active-accent": pair((colors) => mix(colors.accent, 12, colors.sidebar)),
				"--dsw-specific-sidebar-nav-item-active": {
					light: mix("#000000", light.scale(9), light.sidebar),
					dark: mix("#FFFFFF", dark.scale(11), dark.sidebar)
				},
				"--dsw-specific-sidebar-nav-item-hover": {
					light: mix("#000000", light.scale(5), light.sidebar),
					dark: mix("#FFFFFF", dark.scale(7), dark.sidebar)
				},
				"--dsw-specific-bubble": pair((colors) => mix(colors.accent, 10, colors.background)),
				"--dsw-specific-bubble-highlight": pair((colors) => mix(colors.accent, 20, colors.background)),
				"--dsw-static-deepseek-500": pair((colors) => colors.accent),
				"--dsw-static-deepseek-450": pair((colors) => colors.accent),
				"--dsw-static-deepseek-200": pair((colors) => mix(colors.accent, 36, colors.background))
			};
		}
		//#endregion
		//#region src/client/ThemeStudio.tsx
		const MODE_OPTIONS = [
			"system",
			"light",
			"dark"
		];
		const REDUCE_MOTION_OPTIONS = [
			"system",
			"on",
			"off"
		];
		const VARIANTS = ["light", "dark"];
		const ADVANCED_SUFFIXES = [
			"surface",
			"inlineCode",
			"sidebar"
		];
		function colorFieldOf(mode, suffix) {
			return `${mode}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
		}
		function contrastFieldOf(mode) {
			return mode === "light" ? "lightContrast" : "darkContrast";
		}
		function SettingSelect({ label, onChange, options, value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				"data-appearance-setting-row": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					"data-appearance-select": true,
					value,
					onChange: (event) => onChange(event.currentTarget.value),
					children: options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						style: option.fontFamily === void 0 ? void 0 : { fontFamily: option.fontFamily },
						value: option.value,
						children: option.label
					}, option.value))
				})]
			});
		}
		function ModePreview({ mode }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				"aria-hidden": "true",
				"data-appearance-preview": true,
				"data-mode": mode,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "data-appearance-preview-sidebar": true }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					"data-appearance-preview-surface": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})
					]
				})]
			});
		}
		function PalettePreview({ mode, settings }) {
			const prefix = mode === "light" ? "light" : "dark";
			const colors = [
				settings[`${prefix}Accent`],
				settings[`${prefix}Background`],
				settings[`${prefix}Foreground`],
				settings[`${prefix}Surface`],
				settings[`${prefix}InlineCode`],
				settings[`${prefix}Sidebar`]
			];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"aria-hidden": "true",
				"data-appearance-theme-colors": true,
				children: colors.map((color, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { backgroundColor: color } }, `${color}-${index}`))
			});
		}
		function ThemeStudio({ applyPreset, applySettings, resetTheme, setColor, setContrast, setPrefs, setTheme, setTypography, t, useStore }) {
			const activeScheme = useStore((state) => state.activeScheme);
			const preference = useStore((state) => state.preference);
			const prefs = useStore((state) => state.prefs);
			const saveStatus = useStore((state) => state.saveStatus);
			const settings = useStore((state) => state.settings);
			const activePreset = themePresetIdOf(settings);
			const activeAccent = activeAccentSwatchId(settings);
			const uiFontOptions = UI_FONT_IDS.map((value) => ({
				value,
				label: t(`font.${value}`),
				fontFamily: UI_FONT_STACKS[value]
			}));
			const codeFontOptions = CODE_FONT_IDS.map((value) => ({
				value,
				label: t(`font.${value}`),
				fontFamily: CODE_FONT_STACKS[value]
			}));
			const applyAccentSwatch = (id) => {
				const swatch = ACCENT_SWATCHES.find((candidate) => candidate.id === id);
				if (swatch === void 0) return;
				applySettings({
					...settings,
					lightAccent: swatch.light,
					darkAccent: swatch.dark
				});
			};
			const statusText = saveStatus === "saving" ? t("status.saving") : saveStatus === "error" ? t("status.error") : t("status.saved");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-studio": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					"data-appearance-header": true,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("description") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						"data-appearance-button": true,
						"data-variant": "secondary",
						type: "button",
						onClick: resetTheme,
						children: t("action.reset")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-appearance-content": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"data-appearance-card": true,
							"data-card": "theme",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-card-header": true,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("preset.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("preset.description") })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShareString, {
									settings,
									t,
									onImport: applySettings
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									"aria-label": t("mode.title"),
									"data-appearance-mode-grid": true,
									role: "radiogroup",
									children: MODE_OPTIONS.map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										"data-appearance-mode": true,
										"data-selected": preference === mode ? "true" : "false",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												checked: preference === mode,
												"data-appearance-sr": true,
												name: "appearance-mode",
												type: "radio",
												value: mode,
												onChange: () => setTheme(mode)
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModePreview, { mode }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`mode.${mode}`) })
										]
									}, mode))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"aria-label": t("preset.title"),
									"data-appearance-preset-grid": true,
									role: "radiogroup",
									children: [THEME_PRESETS.map((preset) => {
										const selected = activePreset === preset.id;
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											"data-appearance-preset": true,
											"data-selected": selected ? "true" : "false",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													checked: selected,
													"data-appearance-sr": true,
													name: "appearance-preset",
													type: "radio",
													value: preset.id,
													onChange: () => applyPreset(preset.id)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PalettePreview, {
													mode: activeScheme,
													settings: {
														...settings,
														...preset.palette
													}
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`preset.${preset.id}`) })
											]
										}, preset.id);
									}), activePreset === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"data-appearance-preset": true,
										"data-custom": "true",
										"data-selected": "true",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"data-appearance-preset-custom": true,
											children: t("preset.custom")
										})
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									"data-appearance-accent-group": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccentSwatches, {
										activeId: activeAccent,
										customLabel: t("accent.custom"),
										label: t("accent.label"),
										labelOf: (id) => t(`accent.${id}`),
										onSelect: applyAccentSwatch
									})
								}),
								VARIANTS.map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									"aria-labelledby": `appearance-variant-${mode}`,
									"data-appearance-variant": true,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
										id: `appearance-variant-${mode}`,
										children: t(`variant.${mode}`)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-appearance-fields": true,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorChip, {
												field: colorFieldOf(mode, "background"),
												invalidMessage: t("input.invalid"),
												label: t("color.background"),
												value: settings[colorFieldOf(mode, "background")],
												onChange: setColor
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorChip, {
												field: colorFieldOf(mode, "foreground"),
												invalidMessage: t("input.invalid"),
												label: t("color.foreground"),
												value: settings[colorFieldOf(mode, "foreground")],
												onChange: setColor
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContrastSlider, {
												description: t("contrast.description"),
												highLabel: t("contrast.high"),
												label: t("contrast.label"),
												lowLabel: t("contrast.low"),
												standardLabel: t("contrast.standard"),
												value: settings[contrastFieldOf(mode)],
												onChange: (value) => setContrast(contrastFieldOf(mode), value)
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdvancedDisclosure, {
												description: t("advanced.description"),
												title: t("advanced.title"),
												children: ADVANCED_SUFFIXES.map((suffix) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorChip, {
													field: colorFieldOf(mode, suffix),
													invalidMessage: t("input.invalid"),
													label: t(`color.${suffix}`),
													value: settings[colorFieldOf(mode, suffix)],
													onChange: setColor
												}, suffix))
											})
										]
									})]
								}, mode))
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"data-appearance-card": true,
							"data-card": "prefs",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									"data-appearance-card-header": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("prefs.title") })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-subheading": true,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("typography.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("typography.description") })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-setting-list": true,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingSelect, {
											label: t("typography.uiFont"),
											options: uiFontOptions,
											value: settings.uiFont,
											onChange: (value) => setTypography("uiFont", value)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingSelect, {
											label: t("typography.codeFont"),
											options: codeFontOptions,
											value: settings.codeFont,
											onChange: (value) => setTypography("codeFont", value)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SizeStepper, {
											decreaseLabel: t("size.decrease"),
											increaseLabel: t("size.increase"),
											label: t("typography.uiFontSize"),
											value: settings.uiFontSize,
											values: UI_FONT_SIZES,
											onChange: (value) => setTypography("uiFontSize", value)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SizeStepper, {
											decreaseLabel: t("size.decrease"),
											increaseLabel: t("size.increase"),
											label: t("typography.codeFontSize"),
											value: settings.codeFontSize,
											values: CODE_FONT_SIZES,
											onChange: (value) => setTypography("codeFontSize", value)
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									"data-appearance-subheading": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("prefs.render.title") })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-setting-list": true,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-appearance-setting-row": true,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											"data-appearance-setting-copy": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("prefs.reduceMotion") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("prefs.reduceMotion.description") })]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											"aria-label": t("prefs.reduceMotion"),
											"data-appearance-segment": true,
											role: "radiogroup",
											children: REDUCE_MOTION_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												"data-selected": prefs.reduceMotion === option ? "true" : "false",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													checked: prefs.reduceMotion === option,
													"data-appearance-sr": true,
													name: "appearance-reduce-motion",
													type: "radio",
													value: option,
													onChange: () => setPrefs({ reduceMotion: option })
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`segment.${option}`) })]
											}, option))
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-appearance-setting-row": true,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											"data-appearance-setting-copy": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("prefs.fontSmoothing") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("prefs.fontSmoothing.description") })]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											"aria-checked": prefs.fontSmoothing,
											"aria-label": t("prefs.fontSmoothing"),
											"data-appearance-switch": true,
											role: "switch",
											type: "button",
											onClick: () => setPrefs({ fontSmoothing: !prefs.fontSmoothing }),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"aria-hidden": "true",
												"data-appearance-switch-thumb": true
											})
										})]
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							"aria-live": "polite",
							"data-appearance-status": true,
							"data-status": saveStatus,
							children: statusText
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		const THEME_SOURCE = "dsh-theme";
		/**
		* LOCAL ADAPTATION: tokens inside the Desktop's `overrideTokens` contract
		* (verified against the live Theme Inspect token directory) keep using the
		* official stacking API. Every other token the plugin models is applied as
		* a plain CSS custom property through one injected stylesheet, because the
		* 0.1.2-alpha.1 runtime defines the full `--dsw-*` variable surface on
		* `:root` and `body[data-ds-dark-theme]` and the components consume the
		* variables directly.
		*/
		const CONTRACT_TOKEN_NAMES = /* @__PURE__ */ new Set([
			"--dsw-alias-bg-base",
			"--dsw-alias-bg-layer-1",
			"--dsw-alias-bg-layer-2",
			"--dsw-alias-bg-overlay",
			"--dsw-alias-border-l1",
			"--dsw-alias-border-l2",
			"--dsw-alias-brand-primary",
			"--dsw-alias-label-primary",
			"--dsw-alias-label-secondary",
			"--dsw-alias-state-error-primary",
			"--dsw-alias-state-success-primary",
			"--dsw-alias-state-warn-primary",
			"--dsw-specific-sidebar-fill"
		]);
		const inject = [
			"slots",
			"locale",
			"theme"
		];
		function apply(ctx) {
			const storage = browserThemeStudioStorage();
			let currentSettings = loadThemeStudioSettings(storage);
			let currentPrefs = loadThemeStudioPrefs(storage);
			const store = createThemeStudioStore(currentSettings, currentPrefs);
			let actions;
			let releaseOverride = () => {};
			let cssTag;
			let prefsTag;
			let motionQuery;
			const applyCssVars = (tokens) => {
				if (cssTag !== void 0) {
					cssTag.remove();
					cssTag = void 0;
				}
				const names = Object.keys(tokens);
				if (names.length === 0) return;
				const light = [];
				const dark = [];
				for (const name of names) {
					const pair = tokens[name];
					if (pair === void 0) continue;
					light.push(`${name}: ${pair.light};`);
					dark.push(`${name}: ${pair.dark};`);
				}
				const css = `:root { ${light.join(" ")} }body[data-ds-dark-theme] { ${dark.join(" ")} }`;
				cssTag = document.createElement("style");
				cssTag.dataset.plugin = THEME_SOURCE;
				cssTag.dataset.pluginCss = `${THEME_SOURCE}/token-vars`;
				cssTag.textContent = css;
				document.head.appendChild(cssTag);
			};
			const applyPrefs = () => {
				const body = document.body;
				const attributes = prefsAttributes(currentPrefs, motionQuery?.matches ?? false);
				if (attributes.reduceMotion) body.dataset.luteReduceMotion = "reduce";
				else delete body.dataset.luteReduceMotion;
				if (attributes.fontSmoothing) body.dataset.luteFontSmoothing = "on";
				else delete body.dataset.luteFontSmoothing;
			};
			const syncStore = () => {
				actions?.syncSettings(currentSettings);
				actions?.syncPrefs(currentPrefs);
			};
			const applyPreview = () => {
				const overrides = buildThemeTokenOverrides(currentSettings);
				const contract = {};
				const cssVars = {};
				for (const [token, pair] of Object.entries(overrides)) if (CONTRACT_TOKEN_NAMES.has(token)) contract[token] = pair;
				else cssVars[token] = pair;
				const nextRelease = ctx.theme.overrideTokens(THEME_SOURCE, contract);
				releaseOverride();
				releaseOverride = nextRelease;
				applyCssVars(cssVars);
			};
			const persist = () => {
				actions?.setSaveStatus("saving");
				actions?.setSaveStatus(saveThemeStudioSettings(storage, currentSettings) ? "idle" : "error");
			};
			const setSetting = (field, value) => {
				currentSettings = {
					...currentSettings,
					[field]: value
				};
				syncStore();
				applyPreview();
				persist();
			};
			const setColor = (field, value) => {
				setSetting(field, value);
			};
			const setContrast = (field, value) => {
				setSetting(field, value);
			};
			const setTypography = (field, value) => {
				setSetting(field, value);
			};
			const applySettings = (settings) => {
				currentSettings = { ...settings };
				syncStore();
				applyPreview();
				persist();
			};
			const setPrefs = (patch) => {
				currentPrefs = {
					...currentPrefs,
					...patch
				};
				syncStore();
				applyPrefs();
				saveThemeStudioPrefs(storage, currentPrefs);
			};
			const applyPreset = (id) => {
				applySettings(themePresetSettings(id));
			};
			const resetTheme = () => {
				applySettings(DEFAULT_THEME_STUDIO_SETTINGS);
			};
			const syncTheme = (snapshot) => {
				const scheme = snapshot.active?.colorScheme ?? "light";
				actions?.syncTheme(snapshot.preference, scheme);
			};
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-theme: dictionaries");
			ctx.on("theme/change", syncTheme);
			ctx.effect(() => {
				applyPreview();
				return () => {
					releaseOverride();
					if (cssTag !== void 0) cssTag.remove();
					cssTag = void 0;
				};
			}, "dsh-theme: live theme override");
			ctx.effect(() => {
				prefsTag = document.createElement("style");
				prefsTag.dataset.plugin = THEME_SOURCE;
				prefsTag.dataset.pluginCss = `${THEME_SOURCE}/prefs`;
				prefsTag.textContent = PREFS_CSS;
				document.head.appendChild(prefsTag);
				motionQuery = typeof window.matchMedia === "function" ? window.matchMedia(REDUCE_MOTION_QUERY) : void 0;
				const onMotionChange = () => applyPrefs();
				motionQuery?.addEventListener("change", onMotionChange);
				applyPrefs();
				return () => {
					motionQuery?.removeEventListener("change", onMotionChange);
					delete document.body.dataset.luteReduceMotion;
					delete document.body.dataset.luteFontSmoothing;
					if (prefsTag !== void 0) prefsTag.remove();
					prefsTag = void 0;
					motionQuery = void 0;
				};
			}, "dsh-theme: presentation prefs");
			const injectProps = (bound) => {
				actions = bound;
				syncStore();
				const snapshot = ctx.theme.getTheme();
				syncTheme(snapshot);
				return {
					applyPreset,
					applySettings,
					resetTheme,
					setColor,
					setContrast,
					setPrefs,
					setTheme: (preference) => ctx.theme.setTheme(preference),
					setTypography
				};
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-theme",
				order: 5,
				label: () => ctx.locale.bind(NS)("nav"),
				store,
				locale: NS,
				inject: injectProps
			}, ThemeStudio));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map