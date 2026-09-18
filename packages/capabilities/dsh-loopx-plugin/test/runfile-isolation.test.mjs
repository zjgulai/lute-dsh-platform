import test from "node:test";
import assert from "node:assert/strict";
import { runFile } from "../lib/index.js";

test("runFile isolates child process environment from sentinel secrets", async () => {
  // 设置父进程敏感标记
  process.env.SENTINEL_SECRET = "leaked-sentinel-key";
  process.env.OPENAI_API_KEY = "sk-leaked-key";

  // 用 node 打印环境变量
  const res = await runFile(process.execPath, [
    "-e",
    'console.log(JSON.stringify({ sentinel: process.env.SENTINEL_SECRET, openai: process.env.OPENAI_API_KEY, path: !!process.env.PATH }))'
  ], {
    timeoutMs: 5000,
  });

  assert.equal(res.exitCode, 0);
  const out = JSON.parse(res.stdout);

  // 必须没有泄露
  assert.equal(out.sentinel, undefined);
  assert.equal(out.openai, undefined);
  // 安全基线 PATH 必须存在
  assert.equal(out.path, true);

  // 清理
  delete process.env.SENTINEL_SECRET;
  delete process.env.OPENAI_API_KEY;
});
