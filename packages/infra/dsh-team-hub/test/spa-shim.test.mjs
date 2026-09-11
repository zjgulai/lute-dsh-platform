import test from "node:test";
import assert from "node:assert/strict";
import { injectSpaShim } from "../src/spa-shim.mjs";

test("injects the randomUUID shim immediately after head", () => {
  const html = injectSpaShim("<!doctype html><html><head><title>x</title></head><body></body></html>");
  assert.ok(html.indexOf("crypto.randomUUID") > html.indexOf("<head>"));
  assert.ok(html.indexOf("crypto.randomUUID") < html.indexOf("<title>"));
});

test("does not inject twice", () => {
  const once = injectSpaShim("<head><title>x</title>");
  const twice = injectSpaShim(once);
  assert.equal(twice, once);
});

test("成员 shim 隐藏「添加工作区」路径（按钮 aria + 菜单文本含省略号）", () => {
  const html = injectSpaShim("<!doctype html><html><head><title>x</title></head><body></body></html>");
  assert.ok(html.includes("HIDDEN_ADD_ARIA"));
  assert.ok(html.includes('"添加工作区"'));
  assert.ok(html.includes('"Add workspace"'));
  assert.ok(html.includes("CHIP_PLACEHOLDER_TEXT"));
});

test("AUTO_SELECT_SHIM 停止条件兼容 Desktop（data-composer-input + data-placeholder）且点击幂等", () => {
  const html = injectSpaShim("<!doctype html><html><head><title>x</title></head><body></body></html>");
  assert.ok(html.includes("data-composer-input"));
  assert.ok(html.includes("data-placeholder"));
  assert.ok(html.includes("WORKSPACE_PLACEHOLDER"));
  assert.ok(html.includes("clicked")); // 点击幂等：每个目标只点一次
});

test("combo URL 注入缓存破坏参数 thub（幂等）", () => {
  const html = injectSpaShim('<!doctype html><html><head><link rel="modulepreload" href="/plugins/??@deepseek-ai/x/client.js&rev=abcd12345678"></head><body></body></html>');
  assert.ok(html.includes("&rev=abcd12345678&thub=1"));
  const twice = injectSpaShim(html);
  assert.equal(twice, html); // 幂等：不重复追加
});
