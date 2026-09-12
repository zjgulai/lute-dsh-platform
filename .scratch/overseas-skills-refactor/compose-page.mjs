#!/usr/bin/env node
/**
 * 出海技能页 · 目视验收渲染（真组件 + 真负载 + 官方面板几何 + 真浏览器）。
 *
 * 为什么要有这一层：宿主路由要重启才注册，而「重启前先让用户看一眼新页长什么样」
 * 不该靠嘴描述。本脚本把 **真实 client bundle** 挂在 jsdom 里，走完真实点击路径，
 * 把那一刻的 DOM 与 bundle 自己注入的 CSS 原样搬进一个自包含 HTML——
 * 外层是**按官方样式表读出来的**设置页壳（宽度不硬编码，读不到就报错退出）。
 *
 * 与算法技能那一组验收用同一套纪律：几何只从官方 CSS 取值，一张图只证明一个状态。
 *
 * 只读：不写仓库（只写 .scratch 下的 html）。chrome 截图由 compose 之后的 shell 步骤跑。
 *
 * 用法：node .scratch/overseas-skills-refactor/compose-page.mjs [--out <dir>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = "/Users/lute/project/Magpie-Horch";
const PKG = path.join(ROOT, "packages/capabilities/dsh-overseas-skills");
const HARNESS = path.join(ROOT, "vendor/dsh-desktop/deepseek-harness");
const HERE = path.join(ROOT, ".scratch/overseas-skills-refactor");
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i !== -1 ? path.resolve(process.argv[i + 1]) : path.join(HERE, "acceptance");
})();
mkdirSync(OUT, { recursive: true });

const require_ = createRequire(path.join(ROOT, "packages/surfaces/dsh-algo-skills-local/package.json"));
const { JSDOM } = require_("jsdom");
const React = require_("react");
const { createRoot } = require_("react-dom/client");
const { act } = require_("react");

// ── 官方几何：只从样式表读，读不到就报错，绝不回落默认值 ────────────────────
const SETTINGS_CSS = path.join(HARNESS, "packages/client/ui-settings-general/src/client/SettingsRoot.module.css");
const THEME_DIR = path.join(HARNESS, "packages/client/ui-theme/src/styles");

function decl(css, selector, property) {
  const block = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (block === null) throw new Error(`official CSS: no ${selector} rule`);
  const found = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+);`).exec(block[1]);
  if (found === null) throw new Error(`official CSS: ${selector} has no ${property}`);
  return found[1].trim();
}
function px(value, what) {
  const n = /(\d+(?:\.\d+)?)px/.exec(value);
  if (n === null) throw new Error(`official CSS: cannot read a px length from ${what} = ${value}`);
  return Number(n[1]);
}

const settings = readFileSync(SETTINGS_CSS, "utf8");
const PANEL_W = px(decl(settings, ".panel", "width"), "panel width");
const PANEL_RADIUS = px(decl(settings, ".panel", "border-radius"), "panel radius");
const NAV_W = px(decl(settings, ".nav", "width"), "nav width");
const NAV_PAD = decl(settings, ".nav", "padding").split(/\s+/);
const HEADER_H = px(decl(settings, ".header", "height"), "header height");
const OPTIONS_PAD = decl(settings, ".options", "padding").split(/\s+/);
const OPTIONS_X = px(OPTIONS_PAD.length === 4 ? OPTIONS_PAD[3] : OPTIONS_PAD[1], "options side padding");
const PAGE_W = PANEL_W - NAV_W - OPTIONS_X * 2;

const TOKENS = ["base.css", "corner-shape.css", "design-platform.css", "scrollbar.css", "gradient-shadow-text.css"]
  .map((f) => readFileSync(path.join(THEME_DIR, f), "utf8"))
  .join("\n");

// ── 真负载 ─────────────────────────────────────────────────────────────────
const catalog = await import(pathToFileURL(path.join(PKG, "lib/catalog.js")).href);
const { loadRoleSkeleton } = await import(pathToFileURL(path.join(PKG, "lib/preset-roles.js")).href);
const { buildOrgTree } = await import(pathToFileURL(path.join(PKG, "lib/org-tree.js")).href);
const { ROLE_ASSIGNMENTS, ROLE_ASSIGNMENT_META } = await import(pathToFileURL(path.join(PKG, "lib/role-map.js")).href);
const { LAYER_ICONS, LAYER_ICON_SOURCES } = await import(pathToFileURL(path.join(PKG, "lib/layer-icons.js")).href);

const { roles, problems, dir } = await loadRoleSkeleton();
const tree = buildOrgTree({
  scenarios: catalog.CATEGORIES,
  items: catalog.SKILLS,
  assignments: ROLE_ASSIGNMENTS,
  roles,
  layerIcons: LAYER_ICONS,
});
const roleIcons = {};
for (const r of roles) if (r.icon) roleIcons[r.id] = r.icon;

function listPayload() {
  const groups = [];
  const scenarios = [];
  for (const cat of catalog.CATEGORIES) {
    const subs = [];
    for (const sub of cat.subs ?? []) {
      const items = catalog.SKILLS.filter((s) => s.subcategory === sub.key).map((s) => ({
        name: s.name, title: s.title, icon: "", description: "",
        descriptionZh: s.summaryZh || "", modelEnabled: false, toolGap: s.toolGap || "",
        installed: true, template: "",
      }));
      if (items.length === 0) continue;
      groups.push({ key: sub.key, title: sub.title, scenario: cat.title, icon: "", items });
      subs.push({ key: sub.key, title: sub.title, icon: "", items });
    }
    if (subs.length > 0) scenarios.push({ key: cat.key, title: cat.title, icon: "", subs });
  }
  return { ok: true, scenarios, groups };
}

const orgPayload = {
  ok: true, generatedAt: 0,
  presets: { dir, count: roles.length, problems },
  assignmentMeta: ROLE_ASSIGNMENT_META,
  layerIcons: LAYER_ICONS, layerSources: LAYER_ICON_SOURCES, roleIcons,
  roles: roles.map((r) => ({
    id: r.id, alias: r.alias, title: r.title,
    planeId: r.plane.id, domainId: r.domain.id, planeName: r.plane.name, domainName: r.domain.name,
    order: r.order, artifact: r.artifact, responsibilities: r.responsibilities,
  })),
  tree,
};

const BUNDLE = readFileSync(process.env.OVS_CLIENT_BUNDLE ?? path.join(PKG, "lib/client.js"), "utf8");

// ── 挂载 + 走点击路径，然后把 DOM 与注入的 CSS 取出来 ────────────────────────
async function mountAndDrill({ orgOk, drill }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost/" });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true, writable: true });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  let loaded = null;
  window.__ModuleLoader__ = { load: (m) => { loaded = m; } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith("/org")) return orgOk ? { ok: true, status: 200, json: async () => orgPayload } : { ok: false, status: 401, json: async () => ({ error: "unauthorized" }) };
    if (u.endsWith("/fullstack-list")) return { ok: true, json: async () => ({ ok: true, scenarios: [], groups: [] }) };
    if (u.endsWith("/credential?ref=overseas_exa")) return { ok: true, json: async () => ({ configured: false }) };
    if (u.endsWith("/list")) return { ok: true, json: async () => listPayload() };
    return { ok: false, status: 404, json: async () => ({}) };
  };

  new Function("window", "document", "navigator", BUNDLE)(window, window.document, window.navigator);
  const exports_ = loaded.factory((id) => {
    if (id === "react") return React;
    throw new Error("client bundle 要求了未提供的模块：" + id);
  });

  const captured = {};
  exports_.apply({
    effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
    locale: { register() {}, bind() { return (k) => k; } },
    slots: { inject(_n, fn) { fn(); }, register(spec, comp) { captured[spec.id] = comp; return () => {}; } },
  });

  const container = window.document.getElementById("root");
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(captured["overseas-skills"])); });
  await act(async () => {});

  const click = async (el) => {
    if (!el) return;
    await act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  };
  const byText = (needle, sel = "button") =>
    [...container.querySelectorAll(sel)].filter((b) => (b.textContent || "").includes(needle));

  // 选「最有肉」的那条支路，而不是下标 0——下标 0 的分支只有 5 张卡拉不出形状。
  // 选择规则是数据驱动的：卡数最多的场景 → 卡数最多的面 → 卡数最多的责任域。
  const byCards = (a, b) => (b.total ?? 0) - (a.total ?? 0);
  const sc0 = [...tree.scenarios].sort(byCards)[0];
  const pl0 = [...sc0.planes].sort(byCards)[0];
  const dm0 = [...pl0.domains].sort(byCards)[0];

  if (drill === "planes" || drill === "drilled" || drill === "diagnostics") {
    await click(byText(`${sc0.title}`, "button.ovsScenHead")[0]);
  }
  if (drill === "drilled" || drill === "diagnostics") {
    await click(byText(pl0.name, "button.ovsPlaneHead")[0]);
    await click(byText(dm0.name, "button.ovsDomainHead")[0]);
    for (const rl of dm0.roles) await click(byText(rl.title, "button.ovsRoleHead")[0]);
  }
  if (drill === "diagnostics") {
    await click(byText("一致性诊断", "button.ovsDiagHead")[0]);
  }

  const styles = [...window.document.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  const markup = container.innerHTML;

  // 真实浏览器里才会发生的量：这里只能量 DOM 形状，几何由后面的 chrome 截图步骤量。
  const counts = {
    cards: container.querySelectorAll(".ovsCard").length,
    scenHeads: container.querySelectorAll("button.ovsScenHead").length,
    planeHeads: container.querySelectorAll("button.ovsPlaneHead").length,
    domainHeads: container.querySelectorAll("button.ovsDomainHead").length,
    roleHeads: container.querySelectorAll("button.ovsRoleHead").length,
    switches: container.querySelectorAll(".ovsSwitch").length,
    imgs: container.querySelectorAll("img").length,
    nodes: container.querySelectorAll("*").length,
  };
  const state = window.document.querySelector('[data-plugin="dsh-overseas-skills"]')?.getAttribute("data-ovs-state") ?? "";
  return { markup, styles, counts, state };
}

// ── 设置页壳：几何全部来自上面读到的官方值 ──────────────────────────────────
const NAV_ROWS = ["通用设置", "模型", "插件", "Agent 预设", "出海技能", "万物互联", "算法技能"];
const nav = () => NAV_ROWS.map((label) => `
        <button class="navCell${label === "出海技能" ? " active" : ""}">
          <span class="navGlyph"></span><span class="navLabel">${label}</span>
        </button>`).join("");

const CHROME_CSS = `
html,body{margin:0;padding:0;height:100%;}
body{background:var(--dsw-alias-bg-base);font-family:var(--dsw-font-family);}
.overlay{position:fixed;top:22px;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;}
/* 展开图：面板不限高，若仍居中会在图顶留出上千 px 空白，且面板落点随内容高度漂移。
   顶端对齐让「第 300 行一定在面板里」成立，验收脚本才有一个稳定口径。 */
.overlay.stretch{align-items:flex-start;}
.mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);}
.panel{position:relative;z-index:1;display:flex;width:${PANEL_W}px;
  height:min(${PANEL_W}px,calc(100vh - 48px));max-width:calc(100vw - 48px);
  border-radius:${PANEL_RADIUS}px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);
  box-shadow:var(--dsw-elevation-prominent);}
.nav{flex:none;display:flex;flex-direction:column;gap:18px;width:${NAV_W}px;
  padding:${NAV_PAD.join(" ")};box-sizing:border-box;}
.navTitle{padding:0 12px;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary);}
.navList{display:flex;flex-direction:column;gap:4px;}
.navCell{display:flex;align-items:center;gap:8px;height:40px;padding:9px 16px 9px 12px;
  box-sizing:border-box;border:none;border-radius:12px;background:transparent;
  font-family:inherit;font-size:14px;line-height:22px;font-weight:400;
  color:var(--dsw-alias-label-primary);text-align:left;}
.navCell.active{background:var(--dsw-specific-sidebar-nav-item-active);}
.navGlyph{flex:none;width:16px;height:16px;border-radius:4px;
  background:var(--dsw-alias-label-tertiary);opacity:.55;}
.navLabel{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.content{flex:1;min-width:0;display:flex;flex-direction:column;}
.header{flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;
  height:${HEADER_H}px;padding:20px 14px 8px 10px;box-sizing:border-box;}
.close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
  padding:0;border:none;border-radius:28px;background:transparent;cursor:pointer;
  color:var(--dsw-alias-label-primary);font-size:14px;line-height:1;}
.options{flex:1;min-height:0;padding:${OPTIONS_PAD.join(" ")};overflow-y:auto;}
.options.stretch{overflow:visible;height:auto;}
.panel.stretch{height:auto;}
.note{position:fixed;left:0;right:0;top:0;height:22px;margin:0;z-index:5;padding:3px 10px;
  box-sizing:border-box;font-size:10.5px;line-height:16px;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary);
  background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l1);}
`;

/** 一张自包含验收页。 */
function compose({ note, theme, styles, markup, stretch }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>出海技能 · ${theme} · ${note.slice(0, 40)}</title>
<style>
${TOKENS}
</style>
<style>
${styles}
</style>
<style>
${CHROME_CSS}
</style>
</head>
<body${theme === "dark" ? ' data-ds-dark-theme' : ""}>
<div class="overlay${stretch ? " stretch" : ""}">
  <div class="mask"></div>
  <div class="panel${stretch ? " stretch" : ""}">
    <nav class="nav">
      <div class="navTitle">设置</div>
      <div class="navList">${nav()}
      </div>
    </nav>
    <div class="content">
      <div class="header"><div></div><button class="close">✕</button></div>
      <div class="options${stretch ? " stretch" : ""}">${markup}</div>
    </div>
  </div>
</div>
<p class="note">${note}</p>
</body></html>
`;
}

const PROVENANCE = `真实 client bundle + 真机负载（8 场景 / ${tree.stats.rows} 行 / ${tree.stats.cards} 卡 / ${tree.stats.roles} 岗）· 官方 SettingsRoot 几何（${PANEL_W}px 面板 − ${NAV_W}px 导航 − ${OPTIONS_X * 2}px 内边距 = 页面 ${PAGE_W}px）· 官方主题 token`;

const SHOTS = [
  { id: "firstpaint", theme: "light", drill: "none", what: "默认状态：8 个折叠场景 + 一致性诊断条" },
  { id: "planes", theme: "light", drill: "planes", what: "展开场景 → 4 个面" },
  { id: "drilled", theme: "light", drill: "drilled", stretch: true, what: "面 → 责任域 → 岗位 → 技能卡（带接线/归位徽标）· 展开图，面板不限高" },
  { id: "diagnostics", theme: "light", drill: "diagnostics", stretch: true, what: "一致性诊断条展开：零卡岗位与未归岗逐个点名 · 展开图，面板不限高" },
  { id: "degraded", theme: "light", drill: "none", orgOk: false, what: "宿主未重启（/org 401）：退化为原场景分组并说明原因" },
  { id: "firstpaint", theme: "dark", drill: "none", what: "深色主题 · 默认状态" },
  { id: "drilled", theme: "dark", drill: "drilled", stretch: true, what: "深色主题 · 下钻到技能卡 · 展开图" },
];

const written = [];
const measurements = [];
for (const shot of SHOTS) {
  const orgOk = shot.orgOk !== false;
  const { markup, styles, counts } = await mountAndDrill({ orgOk, drill: shot.drill });
  const file = `page-${shot.theme}-${shot.id}.html`;
  writeFileSync(path.join(OUT, file), compose({
    note: `${PROVENANCE} · ${shot.what}${orgOk ? "" : " · /org=401"}`,
    theme: shot.theme, styles, markup, stretch: shot.stretch === true,
  }));
  written.push(file);
  measurements.push({ shot: `${shot.theme}/${shot.id}`, ...counts });
}

console.log(JSON.stringify({
  officialGeometry: { PANEL_W, NAV_W, OPTIONS_X, HEADER_H, PAGE_W },
  tree: tree.stats,
  written,
  measurements,
}, null, 2));

// token 覆盖：页面 + 复刻壳引用的 token 必须在官方样式表里有定义。
// 先把 CSS 注释剥掉——官方样式表的注释里就写着 var(--dsw-elevation-*) 这种示意用法，
// 直接正则会把注释当成真声明，报出不存在的 token（本脚本第一版正是这么误报的）。
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const defined = new Set([...stripComments(TOKENS).matchAll(/--(dsw|ds)-[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]));
// 扫全部产物，不是只扫第一张——退化视图与下钻视图各有自己的 CSS 路径
const allStyles = written.map((f) => readFileSync(path.join(OUT, f), "utf8")).join("\n");
const used = new Set([...stripComments(`${allStyles}${TOKENS}`).matchAll(/var\((--(?:dsw|ds)-[a-z0-9-]+)/g)].map((m) => m[1]));
const undefinedTokens = [...used].filter((t) => !defined.has(t)).sort();
if (undefinedTokens.length > 0) {
  console.error(`\nFAIL: 页面或复刻壳引用了 ${undefinedTokens.length} 个官方样式表未定义的 token：${undefinedTokens.join(", ")}`);
  process.exit(1);
}
console.error(`token 覆盖：引用 ${used.size} 个 / 官方定义 ${defined.size} 个 / 未定义 0 个`);
