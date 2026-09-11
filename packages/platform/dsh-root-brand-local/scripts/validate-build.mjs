import { readFile, stat } from "node:fs/promises";

const clientPath = new URL("../lib/client.js", import.meta.url);
const hostPath = new URL("../lib/index.js", import.meta.url);
const budget = 120_000;

const [{ size }, client, host] = await Promise.all([
  stat(clientPath),
  readFile(clientPath, "utf8"),
  readFile(hostPath, "utf8"),
]);

if (size > budget) {
  throw new Error(`Client bundle is ${size} bytes, over ${budget} bytes`);
}

// 守卫的是「依赖引用」，不是「字符串值」：live-selectors 会按官方包路径去查
// `style[data-plugin-css="<包路径>/<模块>.module.css"]`，该包名合法地以字符串出现，
// 但绝不能被 bundle 进去（否则双实例）。
for (const forbidden of ["@deepseek-ai/dsh-client-ui-conversation", "react.development"]) {
  const asDependency = new RegExp(`(?:require\\(|from\\s*|import\\()["'\`]${forbidden.replaceAll(".", "\\.")}`);
  if (asDependency.test(client) || asDependency.test(host)) {
    throw new Error(`Build still imports unintended dependency: ${forbidden}`);
  }
}

if (!client.includes('id: "dsh-root-brand"')) {
  throw new Error("Client bundle does not register dsh-root-brand");
}

if (!client.includes("conversation.hero.brand.mark")) {
  throw new Error("Client bundle does not override the hero brand seat");
}

if (!host.includes("function apply")) {
  throw new Error("Host entry does not export the no-op apply");
}

console.log(`Validated dsh-root-brand client bundle: ${size} bytes`);
