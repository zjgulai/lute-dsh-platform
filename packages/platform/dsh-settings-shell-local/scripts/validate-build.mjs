import { readFile, stat } from "node:fs/promises";

const clientPath = new URL("../lib/client.js", import.meta.url);
const hostPath = new URL("../lib/index.js", import.meta.url);
const budget = 120_000;

const [{ size }, client, host, shellCss] = await Promise.all([
  stat(clientPath),
  readFile(clientPath, "utf8"),
  stat(hostPath).then(() => readFile(hostPath, "utf8")),
  readFile(new URL("../src/client/shell.css", import.meta.url), "utf8"),
]);

if (size > budget) {
  throw new Error(`Client bundle is ${size} bytes, over ${budget} bytes`);
}

/**
 * 守卫的是「依赖引用」，不是「字符串值」：本包按官方 ARIA 语义选元素，
 * 官方包名不该以任何 require/import 形式出现（否则双实例）。
 */
for (const forbidden of [
  "@deepseek-ai/dsh-client-ui-settings",
  "@deepseek-ai/dsh-client-ui-settings-general",
  "react.development",
]) {
  const asDependency = new RegExp(
    `(?:require\\(|from\\s*|import\\()["'\`]${forbidden.replaceAll(".", "\\.")}`,
  );
  if (asDependency.test(client) || asDependency.test(host)) {
    throw new Error(`Build still imports unintended dependency: ${forbidden}`);
  }
}

/**
 * 自足性契约：本包是**纯 DOM 注入**（ARIA 锚点 + 分组 + CSS），不 require 任何宿主模块。
 *
 * 这条不变量原先只是「碰巧成立」。清单里曾经声明
 * `dsh.client.inject: ["@deepseek-ai/dsh-client-ui-slots"]` 与同名 `peerDependencies`，
 * 而 bundle 里**一个 require 都没有** —— 那个包在本机任何地方都解析不到（profile
 * node_modules 没有、dsh 安装里也没有），却也没报过错：dsh-client-modules 的客户端
 * 对 `inject` 的解析是「查得到 row 就先装载，查不到就**静默跳过**」
 * （`arriveGraphRow`：`const dependency = this.graphRows.get(packageName); if (dependency !== void 0)`）。
 * 于是它既不会生效、也不会失败，只是躺在出货清单里骗人。
 *
 * 所以这里把产物与清单**绑在一起判**：产物里出现的裸模块必须一条不少地写进
 * `dsh.client.external`（模块图靠它给 row 排定先后），清单里声明的也必须一条不多地
 * 出现。要么零外部依赖，要么如实声明 —— 不允许「写了但从没跑到」的第三种状态。
 */
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const declaredExternal = pkg?.dsh?.client?.external ?? [];
const declaredInject = pkg?.dsh?.client?.inject ?? [];

const required = new Set();
for (const re of [/\brequire\(\s*["']([^"']+)["']\s*\)/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g]) {
  for (const m of client.matchAll(re)) required.add(m[1]);
}
/** 裸模块 = 不以 `./` `/` `../` 开头、也不是 `scheme:` 的 specifier。 */
const bareSpecifiers = [...required].filter(
  (s) => !s.startsWith(".") && !s.startsWith("/") && !/^[a-z][a-z\d+.-]*:/i.test(s),
);

const undeclared = bareSpecifiers.filter((s) => !declaredExternal.includes(s));
if (undeclared.length > 0) {
  throw new Error(
    `Client bundle requires undeclared external module(s): ${undeclared.join(", ")} — ` +
      "把它们写进 package.json 的 dsh.client.external，模块图才会给对应 row 排定先后",
  );
}
const stale = [...declaredExternal, ...declaredInject].filter((s) => !required.has(s));
if (stale.length > 0) {
  throw new Error(
    `package.json declares client module(s) the bundle never requires: ${stale.join(", ")} — ` +
      "inject/external 查不到 row 时是静默跳过的，留下只会成为一句不报错的假话；删掉声明",
  );
}

/**
 * 架构红线第 7 条的反向自测：**产物里不得出现 CSS-module 哈希类名**。
 * 官方设置 shell 的类名前缀是 `MI-_Aa_`（0.1.2-rc.1 实测），
 * 一旦有人把 `.MI-_Aa_panel` 这类选择器写进源码，上游重建即失效 —— 这里判红。
 */
const HASH_LIKE = /\.[A-Za-z0-9_-]{6,}_[A-Za-z][A-Za-z0-9]*/;
if (HASH_LIKE.test(client)) {
  throw new Error(
    "Client bundle contains a CSS-module hash-like selector; use ARIA/structure anchors instead",
  );
}

if (!client.includes('id: "dsh-settings-shell"')) {
  throw new Error("Client bundle does not register dsh-settings-shell");
}

if (!client.includes("aria-modal")) {
  throw new Error("Client bundle lost its ARIA panel anchor");
}

if (!client.includes("data-dsh-ss-group")) {
  throw new Error("Client bundle lost the group marker attribute");
}

if (!client.includes("data-dsh-settings-shell-root")) {
  throw new Error("Client bundle lost the parser-owned settings root marker");
}

/**
 * CSS 不得自己从全局 modal/nav/button 里猜 Settings。每个普通规则的每条选择器
 * 都必须消费 parser 成功后添加的 root marker；这样 JS 身份判定和 CSS
 * 作用域只有一份事实。
 */
const cssWithoutComments = shellCss.replace(/\/\*[\s\S]*?\*\//g, "");
for (const match of cssWithoutComments.matchAll(/([^{}]+)\{/g)) {
  const selectorBlock = match[1]?.trim() ?? "";
  if (selectorBlock === "" || selectorBlock.startsWith("@")) continue;
  for (const selector of selectorBlock.split(",").map((value) => value.trim())) {
    if (!selector.includes("[data-dsh-settings-shell-root]")) {
      throw new Error(`Shell CSS selector is not scoped by the parser-owned root marker: ${selector}`);
    }
  }
}

if (!host.includes("function apply")) {
  throw new Error("Host entry does not export the no-op apply");
}

console.log(`Validated dsh-settings-shell client bundle: ${size} bytes`);
