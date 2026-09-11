import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveUpload, sanitizeFilename } from "../lib/index.js";

let root;
const cases = [];

function check(name, fn) {
  cases.push([name, fn]);
}

// --- sanitizeFilename ---
check("sanitize: plain name", () => {
  if (sanitizeFilename("report.pdf") !== "report.pdf") throw new Error("plain");
});
check("sanitize: strips separators", () => {
  if (sanitizeFilename("a/b\\c.txt") !== "a_b_c.txt") throw new Error("separators");
});
check("sanitize: leading dots", () => {
  if (sanitizeFilename("...secret") !== "secret") throw new Error("dots");
});
check("sanitize: empty → upload.bin", () => {
  if (sanitizeFilename("   ") !== "upload.bin") throw new Error("empty");
});
check("sanitize: path traversal", () => {
  const out = sanitizeFilename("../../etc/passwd");
  const unsafe = out.includes("/") || out.includes("\\") || out.startsWith(".") || out === "." || out === "..";
  if (unsafe) throw new Error("traversal: " + out);
});

// --- saveUpload ---
check("save: writes bytes and returns relative path", async () => {
  const { absolute, relativePath } = await saveUpload(root, "hello.txt", Buffer.from("hi"));
  if (relativePath !== "uploads/hello.txt") throw new Error("relative: " + relativePath);
  const content = await readFile(absolute, "utf8");
  if (content !== "hi") throw new Error("content: " + content);
});

check("save: dedupes collisions with -1 suffix", async () => {
  const base = `dedupe-${Date.now()}.txt`;
  const r1 = await saveUpload(root, base, Buffer.from("a"));
  const r2 = await saveUpload(root, base, Buffer.from("b"));
  const stem = base.slice(0, -4);
  if (r2.relativePath !== `uploads/${stem}-1.txt`) throw new Error("dedupe: " + r2.relativePath);
});

check("save: preserves extension on dedupe", async () => {
  const r = await saveUpload(root, "data.json", Buffer.from("{}"));
  if (r.relativePath !== "uploads/data.json") throw new Error("ext: " + r.relativePath);
});

async function run() {
  root = await mkdtemp(join(tmpdir(), "dsh-fu-"));
  let failed = 0;
  for (const [name, fn] of cases) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL  ${name}: ${err?.message ?? err}`);
    }
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  if (failed > 0) process.exit(1);
}

run();
