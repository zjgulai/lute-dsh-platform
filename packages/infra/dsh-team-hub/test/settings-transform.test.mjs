import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync, brotliCompressSync, gunzipSync, brotliDecompressSync } from "node:zlib";
import {
  SETTINGS_MODE_TARGET,
  SETTINGS_MODE_REPLACEMENT,
  transformSettingsHostMode,
} from "../src/settings-transform.mjs";

const SAMPLE = `x = connection.isLoopback ? "host" : "memory";\ny = foo;\nz = connection.isLoopback ? "host" : "memory";`;

test("明文转换：两处三元全替换为 host", () => {
  const result = transformSettingsHostMode(Buffer.from(SAMPLE, "utf8"), undefined);
  assert.ok(result);
  assert.equal(result.keepEncoding, false);
  const text = result.body.toString("utf8");
  assert.equal(text.includes(SETTINGS_MODE_TARGET), false);
  assert.equal((text.match(/"host"/g) || []).length, 2); // 两处三元均替换为 "host"
});

test("无目标串 → null（原样转发）", () => {
  assert.equal(transformSettingsHostMode(Buffer.from("var a = 1;", "utf8"), undefined), null);
});

test("gzip：解压→转换→压回，字节流可还原为转换后内容", () => {
  const gz = gzipSync(Buffer.from(SAMPLE, "utf8"));
  const result = transformSettingsHostMode(gz, "gzip");
  assert.ok(result);
  assert.equal(result.keepEncoding, true);
  const plain = gunzipSync(result.body).toString("utf8");
  assert.equal(plain.includes(SETTINGS_MODE_TARGET), false);
  assert.equal((plain.match(/"host"/g) || []).length, 2);
});

test("brotli：解压→转换→压回", () => {
  const br = brotliCompressSync(Buffer.from(SAMPLE, "utf8"));
  const result = transformSettingsHostMode(br, "br");
  assert.ok(result);
  assert.equal(result.keepEncoding, true);
  const plain = brotliDecompressSync(result.body).toString("utf8");
  assert.equal(plain.includes(SETTINGS_MODE_TARGET), false);
});

test("未知编码/损坏压缩流 → null（不转换，原样转发）", () => {
  assert.equal(transformSettingsHostMode(Buffer.from("???", "utf8"), "zstd"), null);
  assert.equal(transformSettingsHostMode(Buffer.from("not-gzip-data", "utf8"), "gzip"), null);
});
