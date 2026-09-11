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

for (const forbidden of ["@deepseek-ai/dsh-client-ui-conversation", "react.development"]) {
  if (client.includes(forbidden) || host.includes(forbidden)) {
    throw new Error(`Build still contains unintended dependency: ${forbidden}`);
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
