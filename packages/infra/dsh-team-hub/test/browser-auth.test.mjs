import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  b64url,
  mintBrowserSessionCookie,
  loadBrowserSessionSecret,
} from "../src/browser-auth.mjs";

function b64urlLocal(buf) {
  return Buffer.from(buf).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

test("mint: cookie name = dsh-auth- + b64url(sha256(authority))", () => {
  const secret = Buffer.alloc(32, 7);
  const now = 1_700_000_000_000;
  const { name, value } = mintBrowserSessionCookie(secret, "127.0.0.1:43120", now);
  const expectedName = "dsh-auth-" + b64urlLocal(createHash("sha256").update("127.0.0.1:43120").digest());
  assert.equal(name, expectedName);
  assert.ok(value.startsWith("v1."));
});

test("mint: signature verifies against the Desktop algorithm (HMAC-SHA256 over body)", () => {
  const secret = Buffer.alloc(32, 0x5a);
  const now = Date.now();
  const { value, expiresAt } = mintBrowserSessionCookie(secret, "127.0.0.1:43120", now);
  const [version, body, sig] = value.split(".");
  assert.equal(version, "v1");
  const expectedSig = b64urlLocal(createHmac("sha256", secret).update(body).digest());
  assert.equal(sig, expectedSig);
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  assert.equal(payload.version, 1);
  assert.equal(payload.authority, "127.0.0.1:43120");
  assert.equal(payload.issuedAt, now);
  assert.equal(payload.expiresAt, expiresAt);
  // 有效期窗口 ≤ 30 天（Desktop cookieMaxAgeDays 默认 30）
  assert.ok(payload.expiresAt - payload.issuedAt <= 30 * 24 * 3600 * 1000);
  assert.ok(payload.expiresAt > payload.issuedAt);
});

test("mint: different authority → different cookie name (authority-bound)", () => {
  const secret = Buffer.alloc(32, 1);
  const a = mintBrowserSessionCookie(secret, "127.0.0.1:43120");
  const b = mintBrowserSessionCookie(secret, "127.0.0.1:3080");
  assert.notEqual(a.name, b.name);
  assert.notEqual(a.value, b.value);
});

test("secret loader: rejects invalid explicit secret, returns undefined for missing file", () => {
  assert.throws(() => loadBrowserSessionSecret({ browserSessionSecret: "c2hvcnQ" }), /32-byte/);
  const missing = loadBrowserSessionSecret({ credentialsPath: "/nonexistent/nope.yaml" });
  assert.equal(missing, undefined);
});
