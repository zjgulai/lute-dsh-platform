#!/usr/bin/env node
/**
 * 浏览器验收：ROOT 品牌插件的官方 UI 改写锚（ADR-0019）。
 *
 * 验收对象是**产品实际装载的那份产物**：`~/.dsh/profiles/desktop/node_modules/dsh-root-brand/lib/client.js`
 * （或 `--bundle` 指定）。在真实 Chromium 里：
 *   1) 从本机官方 app 包取出真实的官方模块 CSS 与类名（真值，不写死哈希）；
 *   2) 按官方 DOM 结构复刻空会话 hero 与统计条；
 *   3) 装载并执行插件产物；
 *   4) 断言用户可观察结果：官方标题不再显示、品牌句只出现一次、ROOT 字标存在、
 *      角标显示 Preview（且抗 React 回写、可还原）、统计条折叠、锚点状态 resolved。
 * 再注入一份**随机新前缀**的假官方 CSS，断言同一份实现自动命中（升级免疫）。
 *
 * 用法：node scripts/acceptance/root-brand-live-anchors.mjs [--bundle <path>] [--out <dir>]
 * 退出码：0 = 全部断言通过。
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_BUNDLE = join(
  homedir(),
  ".dsh/profiles/desktop/node_modules/dsh-root-brand/lib/client.js",
);
const CONVERSATION_BUNDLE =
  "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js";
const CHAT_BUNDLE =
  "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js";
const HERO_MODULE_ID = "@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css";
const STATS_MODULE_ID = "@deepseek-ai/dsh-client-ui-chat/StatsLine.module.css";

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const BUNDLE = resolve(argValue("--bundle", DEFAULT_BUNDLE));
const OUT_DIR = resolve(argValue("--out", join(REPO_ROOT, ".scratch/dsh-root-brand-drift/acceptance")));

/** 与测试同源的提取逻辑（此处独立实现，避免「用被测代码验被测代码」）。 */
function extractModuleCss(bundlePath, moduleId) {
  const source = readFileSync(bundlePath, "utf8");
  const anchor = source.indexOf(`"${moduleId}"`);
  if (anchor < 0) throw new Error(`产物里找不到模块 id ${moduleId}：${bundlePath}`);
  const matches = [...source.slice(0, anchor).matchAll(/const css\$[0-9]+ = ("(?:[^"\\]|\\.)*");/g)];
  const last = matches.at(-1);
  if (last === undefined) throw new Error(`模块 ${moduleId} 前找不到 css 声明`);
  return JSON.parse(last[1]);
}

function resolveClassName(css, localName) {
  const pattern = new RegExp(`\\.([A-Za-z0-9_]+)_${localName}(?![A-Za-z0-9_-])`, "g");
  const prefixes = new Set([...css.matchAll(pattern)].map((m) => m[1]));
  if (prefixes.size !== 1) throw new Error(`局部名 ${localName} 的前缀候选 ${prefixes.size} 个（应为 1）`);
  return `${[...prefixes][0]}_${localName}`;
}

/** 插件产物的外部依赖：由宿主提供。验收页用本机 React 18 的真实生产构建顶替。 */
const REACT_DIR = join(REPO_ROOT, "packages/platform/dsh-root-brand-local/node_modules/react");

const HARNESS_HTML = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>ROOT brand acceptance</title></head>
<body><div id="stage"></div></body></html>`;

/**
 * 宿主提供的 CommonJS 基元。验收页在经典脚本里顶替宿主的模块环境，
 * 让 React 的生产 CJS 文件（真实产物）可以直接作为经典脚本执行。
 */
const RUNTIME_GLOBALS_JS = `window.process = { env: { NODE_ENV: "production" } };
window.exports = {};
window.module = { exports: window.exports };
window.require = function (name) {
  if (name === "react") return window.React;
  throw new Error("harness require: 未声明依赖 " + name);
};`;


async function main() {
  for (const path of [BUNDLE, CONVERSATION_BUNDLE, CHAT_BUNDLE]) {
    if (!existsSync(path)) {
      console.error(`[acceptance] 缺少必需产物：${path}`);
      process.exit(2);
    }
  }
  const heroCss = extractModuleCss(CONVERSATION_BUNDLE, HERO_MODULE_ID);
  const statsCss = extractModuleCss(CHAT_BUNDLE, STATS_MODULE_ID);
  const heroClasses = {
    headline: resolveClassName(heroCss, "headline"),
    headlineText: resolveClassName(heroCss, "headlineText"),
    previewBadge: resolveClassName(heroCss, "previewBadge"),
  };
  const statsRootClass = resolveClassName(statsCss, "root");
  const bundleText = readFileSync(BUNDLE, "utf8");
  const bundleDeclaresEntry = bundleText.includes('id: "dsh-root-brand"');

  mkdirSync(OUT_DIR, { recursive: true });
  const { createRequire } = await import("node:module");
  const requireFromBrowserPkg = createRequire(
    join(REPO_ROOT, "packages/capabilities/dsh-browser-local/package.json"),
  );
  const { chromium } = requireFromBrowserPkg("playwright-core");

  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/bundle.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(bundleText);
      return;
    }
    if (url === "/runtime-globals.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(RUNTIME_GLOBALS_JS);
      return;
    }
    if (url === "/react.js" || url === "/jsx-runtime.js") {
      // 真实 React 生产构建（与插件宿主的 React 18 同大版本）。
      const file =
        url === "/react.js"
          ? join(REACT_DIR, "cjs/react.production.min.js")
          : join(REACT_DIR, "cjs/react-jsx-runtime.production.min.js");
      if (!existsSync(file)) {
        res.writeHead(500).end(`missing ${file}`);
        return;
      }
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(readFileSync(file, "utf8"));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS_HTML);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 420 } });
  const consoleLines = [];
  page.on("console", (message) => consoleLines.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => consoleLines.push(`pageerror: ${error.message}`));

  await page.goto(origin, { waitUntil: "load" });

  const result = await page.evaluate(
    async ({ heroCss, statsCss, heroClasses, statsRootClass, moduleIds, brandPhrase }) => {
      const notes = [];
      const scriptErrors = [];
      window.addEventListener("error", (event) => {
        scriptErrors.push(
          `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`,
        );
      });
      const anchorState = () => document.documentElement.dataset.dshRootBrandAnchors ?? "";
      const loadScript = (src) =>
        new Promise((done, fail) => {
          const script = document.createElement("script");
          script.src = src;
          script.onload = done;
          script.onerror = () => fail(new Error(`加载失败：${src}`));
          document.head.appendChild(script);
        });
      const installOfficialStyle = (moduleId, css) => {
        const tag = document.createElement("style");
        tag.dataset.pluginCss = moduleId;
        tag.textContent = css;
        document.head.appendChild(tag);
      };
      const visibleCount = (root, needle) => {
        let n = 0;
        const walk = (node) => {
          for (const child of node.children) {
            if (getComputedStyle(child).display === "none") continue;
            if (child.textContent.includes(needle)) {
              n += 1;
              continue;
            }
            walk(child);
          }
        };
        walk(root);
        return n;
      };
      const build = (classes, statsClass) => {
        const stage = document.getElementById("stage");
        stage.innerHTML =
          `<div class="${classes.headline}">` +
          `<span class="fishHitbox"><div data-plugin="dsh-root-brand" class="dsh-rb-hero">` +
          `<svg viewBox="0 0 61 32" width="46" height="24" aria-hidden="true"><rect x="6.5" y="26" width="16.5" height="5" rx="2.5" fill="#58B848"/></svg>` +
          `<span class="dsh-rb-hero-name">${brandPhrase}</span></div></span>` +
          `<span class="${classes.headlineText}">探索未至之境</span>` +
          `<span class="${classes.previewBadge}">预览版</span>` +
          `</div>` +
          (statsClass === null ? "" : `<div class="${statsClass}">12 项 · 1.2k tokens</div>`);
        return {
          hero: stage.firstElementChild,
          stats: statsClass === null ? null : stage.children[1],
        };
      };

      // —— 第一幕：本机真实官方 CSS（2.0.5 现场）——
      delete document.documentElement.dataset.dshRootBrandAnchors;
      installOfficialStyle(moduleIds.hero, heroCss);
      installOfficialStyle(moduleIds.stats, statsCss);
      const first = build(heroClasses, statsRootClass);
      const hero = first.hero;
      const firstStats = first.stats;
      const badge = hero.querySelector(`.${heroClasses.previewBadge}`);
      const officialHeadline = hero.querySelector(`.${heroClasses.headlineText}`);

      window.__ModuleLoader__ = { load: (entry) => { window.__entry = entry; } };
      // 宿主提供的 CommonJS 基元 + React 运行时（真实生产构建）。
      await loadScript("/runtime-globals.js");
      await loadScript("/react.js");
      window.React = window.exports;
      window.module.exports = window.exports = {};
      await loadScript("/jsx-runtime.js");
      window.ReactJsxRuntime = window.exports;
      await loadScript("/bundle.js");
      const hostRequire = (name) => {
        if (name === "react/jsx-runtime") return window.ReactJsxRuntime;
        if (name === "react") return window.React;
        throw new Error(`未预期的外部依赖：${name}`);
      };
      const pluginFactory = () => window.__entry.factory(hostRequire);
      const disposers = [];
      /** 复刻宿主装载：注册 effect 并收集 disposer。 */
      const applyPlugin = () => {
        pluginFactory().apply({
          effect: (fn) => {
            const d = fn();
            if (typeof d === "function") disposers.push(d);
          },
          slots: { inject: (_slot, register) => register(), register: () => () => {} },
        });
      };
      applyPlugin();

      const state = anchorState();
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
      };
      const markRect = rect(hero.querySelector("svg"));
      const nameRect = rect(hero.querySelector(".dsh-rb-hero-name"));
      const badgeRect = rect(badge);
      const afterApply = {
        anchorState: state,
        markLeftOfName: markRect.right <= nameRect.left + 1,
        badgeRightmost: badgeRect.left >= nameRect.right - 1,
        badgeVisible: getComputedStyle(badge).display !== "none",
        markWidth: markRect.width,
        officialHeadlineHidden: getComputedStyle(officialHeadline).display === "none",
        brandPhraseVisibleCount: visibleCount(hero, brandPhrase),
        rootMarkPresent: hero.querySelector("svg") !== null,
        badgeText: badge.textContent,
        statsMaxHeight: getComputedStyle(firstStats).maxHeight,
      };
      notes.push(`第一幕锚点状态：${state}`);

      // React 回写角标文案 → 插件必须重新改写
      badge.textContent = "预览版";
      await new Promise((r) => setTimeout(r, 30));
      afterApply.badgeTextAfterReactWrite = badge.textContent;

      // —— 第二幕：卸载还原（官方样式标签保留，只撤销插件）——
      for (const d of disposers) d();
      const afterDispose = { badgeText: badge.textContent };
      notes.push(`卸载后角标文案：${afterDispose.badgeText}`);

      // —— 第三幕：升级免疫（随机新前缀）——
      // 先清掉旧场（含官方样式标签与插件样式块），再注入新前缀的官方样式并**重新装载**插件
      // —— 插件卸载会断开观察者，重装是新会话/新页面的等价形态。
      const randomPrefix = `q${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      document.getElementById("stage").innerHTML = "";
      document.head
        .querySelectorAll("style[data-plugin-css], style[data-plugin=\"dsh-root-brand\"]")
        .forEach((el) => el.remove());
      const futureClasses = {
        headline: `${randomPrefix}_headline`,
        headlineText: `${randomPrefix}_headlineText`,
        previewBadge: `${randomPrefix}_previewBadge`,
      };
      installOfficialStyle(
        moduleIds.hero,
        `.${futureClasses.headline}{display:grid}` +
          `.${futureClasses.headlineText}{grid-area:1/2}` +
          `.${futureClasses.previewBadge}{font-size:12px}`,
      );
      installOfficialStyle(moduleIds.stats, `.${randomPrefix}_root{text-align:center}.${randomPrefix}_sep{margin:0 10px}`);
      applyPlugin();

      const future = build(futureClasses, `${randomPrefix}_root`);
      const futureHero = future.hero;
      const futureBadge = futureHero.querySelector(`.${futureClasses.previewBadge}`);
      const futureHeadline = futureHero.querySelector(`.${futureClasses.headlineText}`);
      await new Promise((r) => setTimeout(r, 30));

      const futureApplied = {
        prefix: randomPrefix,
        anchorState: anchorState(),
        officialHeadlineHidden: getComputedStyle(futureHeadline).display === "none",
        brandPhraseVisibleCount: visibleCount(futureHero, brandPhrase),
        badgeText: futureBadge.textContent,
        statsMaxHeight: getComputedStyle(future.stats).maxHeight,
      };

      // 把舞台留在第一幕的可视结果上，供截图
      document.getElementById("stage").innerHTML = "";
      document.head.querySelectorAll("style[data-plugin-css]").forEach((el) => el.remove());
      document.getElementById("dsh-root-brand-anchors")?.remove();
      installOfficialStyle(moduleIds.hero, heroCss);
      installOfficialStyle(moduleIds.stats, statsCss);
      build(heroClasses, statsRootClass);
      applyPlugin();
      await new Promise((r) => setTimeout(r, 30));

      return { afterApply, afterDispose, futureApplied, notes, scriptErrors };
    },
    {
      heroCss,
      statsCss,
      heroClasses,
      statsRootClass,
      moduleIds: { hero: HERO_MODULE_ID, stats: STATS_MODULE_ID },
      brandPhrase: "Artificial Business Intelligence Agentic",
    },
  );

  const shot = join(OUT_DIR, "live-anchors.png");
  await page.screenshot({ path: shot });
  await browser.close();
  server.close();

  const checks = [
    ["产物声明了插件入口", bundleDeclaresEntry === true, String(bundleDeclaresEntry)],
    ["本机官方锚点状态 = resolved", result.afterApply.anchorState === "resolved", result.afterApply.anchorState],
    ["官方标题不再显示", result.afterApply.officialHeadlineHidden === true, String(result.afterApply.officialHeadlineHidden)],
    ["品牌句只出现一次", result.afterApply.brandPhraseVisibleCount === 1, String(result.afterApply.brandPhraseVisibleCount)],
    ["ROOT 字标存在", result.afterApply.rootMarkPresent === true, String(result.afterApply.rootMarkPresent)],
    ["角标显示 Preview", result.afterApply.badgeText === "Preview", result.afterApply.badgeText],
    ["React 回写后仍为 Preview", result.afterApply.badgeTextAfterReactWrite === "Preview", result.afterApply.badgeTextAfterReactWrite],
    ["卸载后还原官方文案", result.afterDispose.badgeText === "预览版", result.afterDispose.badgeText],
    ["统计条折叠生效", result.afterApply.statsMaxHeight === "6px", result.afterApply.statsMaxHeight],
    ["排版：ROOT 字标在品牌句左侧", result.afterApply.markLeftOfName === true, String(result.afterApply.markLeftOfName)],
    ["排版：Preview 角标位于标题右侧（右上角）", result.afterApply.badgeRightmost === true, String(result.afterApply.badgeRightmost)],
    ["排版：角标可见且字标已渲染", result.afterApply.badgeVisible === true && result.afterApply.markWidth > 0, `badgeVisible=${result.afterApply.badgeVisible} markWidth=${result.afterApply.markWidth}`],
    ["换随机新前缀仍命中（锚点 resolved）", result.futureApplied.anchorState === "resolved", result.futureApplied.anchorState],
    ["换随机新前缀后标题唯一", result.futureApplied.brandPhraseVisibleCount === 1 && result.futureApplied.officialHeadlineHidden === true, `hidden=${result.futureApplied.officialHeadlineHidden} count=${result.futureApplied.brandPhraseVisibleCount}`],
    ["换随机新前缀后角标仍为 Preview", result.futureApplied.badgeText === "Preview", result.futureApplied.badgeText],
    ["换随机新前缀后统计条仍折叠", result.futureApplied.statsMaxHeight === "6px", result.futureApplied.statsMaxHeight],
  ];

  console.log(`[acceptance] bundle = ${BUNDLE}`);
  console.log(`[acceptance] 官方容器类名 = ${JSON.stringify(heroClasses)} / ${statsRootClass}`);
  console.log(`[acceptance] 随机新前缀 = ${result.futureApplied.prefix}`);
  console.log(`[acceptance] 脚本错误明细：${JSON.stringify(result.scriptErrors)}`);
  console.log("[acceptance] 页面控制台：");
  for (const line of consoleLines) console.log(`  ${line}`);
  console.log(`[acceptance] 截图 = ${shot}`);
  let failed = 0;
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}  （实测：${detail}）`);
    if (!ok) failed += 1;
  }
  const pageErrors = consoleLines.filter((l) => l.startsWith("pageerror:"));
  if (pageErrors.length > 0) {
    console.log(`FAIL  页面无未捕获异常（实测：${pageErrors.length} 条）`);
    failed += pageErrors.length;
  } else {
    console.log("PASS  页面无未捕获异常");
  }
  console.log(failed === 0 ? "[acceptance] ALL CHECKS PASSED" : `[acceptance] ${failed} 项未通过`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[acceptance] 运行失败：${error.stack ?? error}`);
  process.exit(3);
});
