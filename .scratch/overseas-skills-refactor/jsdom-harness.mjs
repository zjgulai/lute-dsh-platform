/**
 * 出海技能页 · jsdom 挂载脚手架（两个探针共用）。
 *
 * 为什么抽出来：`probe-client-render.mjs`（喂手工负载）与 `probe-endtoend.mjs`
 * （喂真宿主 handler 经真 HTTP 回来的负载）必须挂的是**同一份 bundle、同一套
 * 插槽契约**，否则两个探针会因为脚手架各自漂移而给出不能互相印证的结论。
 * 脚手架只做挂载，不做任何断言——喂什么、断言什么由调用方决定。
 *
 * 只读：不写仓库、不碰 ~/.dsh。react / react-dom / jsdom 从隔壁算法技能包借用
 * （那一包是 vitest+jsdom 技术栈；本包是 node --test，不重复安装一套）。
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const ROOT = "/Users/lute/project/Magpie-Horch";
export const PKG = path.join(ROOT, "packages/capabilities/dsh-overseas-skills");
const VENDOR = path.join(ROOT, "packages/surfaces/dsh-algo-skills-local");

const require_ = createRequire(path.join(VENDOR, "package.json"));
const { JSDOM } = require_("jsdom");
export const React = require_("react");
const { createRoot } = require_("react-dom/client");
const { act } = require_("react");
export { act };

/** 当前磁盘上的 client bundle（可用 OVS_CLIENT_BUNDLE 指向别处做红测）。 */
export const BUNDLE = readFileSync(process.env.OVS_CLIENT_BUNDLE ?? path.join(PKG, "lib/client.js"), "utf8");

/**
 * 在一个全新的 jsdom 里加载真实 bundle，挂载设置页的「出海技能」一节。
 *
 * @param {{fetchImpl: (url: string, init?: object) => Promise<unknown>}} opts
 *        fetchImpl —— 组件发出的每条请求都经过它；探针据此决定喂手工负载还是走真 HTTP。
 * @returns {Promise<{window: object, document: object, container: object, text: () => string,
 *   buttonsByText: (n: string) => object[], click: (el: object) => Promise<void>}>}
 */
export async function mountClient({ fetchImpl }) {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { url: "http://localhost/" });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  // Node 26 的 globalThis.navigator 是只读 getter：用 defineProperty 覆盖而不是赋值
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true, writable: true });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  let loaded = null;
  window.__ModuleLoader__ = { load: (m) => { loaded = m; } };
  globalThis.fetch = fetchImpl;

  // bundle 在模块顶层读过一次；在 clean global 里用 new Function 重新执行，
  // 这样第二个场景拿到的是全新注册，而不是第一次的 memoized factory。
  new Function("window", "document", "navigator", BUNDLE)(window, window.document, window.navigator);
  if (loaded === null) throw new Error("client bundle 没有调用 window.__ModuleLoader__.load");
  const exports_ = loaded.factory((id) => {
    if (id === "react") return React;
    throw new Error("client bundle 要求了未提供的模块：" + id);
  });

  const captured = {};
  const ctx = {
    effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
    locale: { register() {}, bind() { return (k) => k; } },
    slots: {
      inject(_name, fn) { fn(); },
      register(spec, comp) { captured[spec.id] = comp; return () => {}; },
    },
  };
  exports_.apply(ctx);
  if (!captured["overseas-skills"]) throw new Error("设置页没有注册 overseas-skills 这一节");

  const container = window.document.getElementById("root");
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(captured["overseas-skills"])); });
  await act(async () => {});

  return {
    window,
    document: window.document,
    container,
    root,
    text: () => container.textContent || "",
    buttonsByText: (needle) =>
      [...container.querySelectorAll("button")].filter((b) => (b.textContent || "").includes(needle)),
    click: async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }); },
  };
}
