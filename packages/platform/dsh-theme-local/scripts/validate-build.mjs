import { readFile, stat } from "node:fs/promises";

const clientPath = new URL("../lib/client.js", import.meta.url);
const hostPath = new URL("../lib/index.js", import.meta.url);
const budget = 240_000;

const [{ size }, client, host] = await Promise.all([
  stat(clientPath),
  readFile(clientPath, "utf8"),
  readFile(hostPath, "utf8"),
]);

if (size > budget) {
  throw new Error(`Client bundle is ${size} bytes, over ${budget} bytes`);
}

for (const forbidden of ["@workspace/ui", "pail-host", "data-pail-ui"]) {
  if (client.includes(forbidden) || host.includes(forbidden)) {
    throw new Error(`Build still contains unrelated dependency: ${forbidden}`);
  }
}

if (!client.includes('id: "dsh-theme"')) {
  throw new Error("Client bundle does not register dsh-theme");
}

console.log(`Validated dsh-theme client bundle: ${size} bytes`);
