import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("admin UI is zero-build and uses namespaced API", () => {
  const html = fs.readFileSync(path.join(root, "admin-ui", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "admin-ui", "app.js"), "utf8");
  assert.ok(app.includes('/__teamhub/api'));
  assert.ok(!html.includes("cdn."));
});

test("admin UI references assets via absolute /admin/ paths (no relative-path misresolution)", () => {
  const html = fs.readFileSync(path.join(root, "admin-ui", "index.html"), "utf8");
  assert.ok(html.includes('href="/admin/styles.css"'), "stylesheet must use absolute /admin/ path");
  assert.ok(html.includes('src="/admin/app.js"'), "script must use absolute /admin/ path");
  assert.ok(!html.includes("./styles.css") && !html.includes("./app.js"), "no relative asset refs");
});

test("admin UI keeps visual styles out of inline HTML attributes", () => {
  const html = fs.readFileSync(path.join(root, "admin-ui", "index.html"), "utf8");
  assert.doesNotMatch(html, /\sstyle\s*=\s*["'][^"']*["']/i, "visual inline styles are not allowed");
});

test("admin UI keeps the Codex visual contract in its standalone stylesheet", () => {
  const css = fs.readFileSync(path.join(root, "admin-ui", "styles.css"), "utf8");
  assert.match(css, /--dsw-accent/);
  assert.match(css, /data-theme="light"/);
  assert.match(css, /data-theme="dark"/);
  assert.match(css, /:disabled/);
  assert.match(css, /user-invalid/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /180ms/);
  assert.doesNotMatch(css, /linear-gradient/);
});
