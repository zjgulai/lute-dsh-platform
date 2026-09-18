import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { defineConfig } from "tsdown";

const PLUGIN_ID = "dsh-settings-shell";
const CSS_PREFIX = "\0dsh-settings-shell-css:";
const CSS_SUFFIX = ".mjs";
const CLIENT_EXTERNALS = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-store",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-web-react",
] as const;

// 稳定虚拟 id → 磁盘绝对路径。id 必须用 basename：rolldown 把模块 id 原样写进
// 产物的 //#region 注释，绝对路径形式的 id 会把构建机 home 带进出货面
//（packaging/machine-path-baseline.json 只减不增，ADR-0073）。
const cssSources = new Map<string, string>();

function inlineCssPlugin() {
  return {
    name: "dsh-settings-shell-inline-css",
    resolveId(source: string, importer?: string) {
      if (!source.endsWith(".css")) return null;
      const file =
        importer === undefined ? source : resolve(dirname(importer), source);
      const id = `${CSS_PREFIX}${basename(file)}${CSS_SUFFIX}`;
      cssSources.set(id, file);
      return id;
    },
    async load(id: string) {
      if (!id.startsWith(CSS_PREFIX)) return null;
      const file = cssSources.get(id);
      if (file === undefined) throw new Error(`unknown css module id: ${id}`);
      const css = await readFile(file, "utf8");
      const tagId = `${PLUGIN_ID}/${basename(file)}`;

      return [
        `const css = ${JSON.stringify(css)};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
        "  const tag = document.createElement('style');",
        `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
        "  tag.dataset.pluginCss = tagId;",
        "  tag.textContent = css;",
        "  document.head.appendChild(tag);",
        "}",
        "export default {};",
      ].join("\n");
    },
  };
}

export default defineConfig([
  {
    name: `${PLUGIN_ID}/host`,
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: "esm",
    platform: "node",
    target: "es2024",
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: "src/client/index.tsx" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    target: "es2022",
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) =>
        CLIENT_EXTERNALS.includes(id as (typeof CLIENT_EXTERNALS)[number])
          ? undefined
          : true,
      onlyBundle: false,
    },
    plugins: [inlineCssPlugin()],
    outputOptions: {
      entryFileNames: "client.js",
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      intro: "var module = { exports: {} }; var exports = module.exports;",
      footer: "return module.exports; } });",
    },
  },
]);
