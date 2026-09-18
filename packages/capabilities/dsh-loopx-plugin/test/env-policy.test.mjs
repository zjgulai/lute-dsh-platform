import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_SYSTEM_ALLOWLIST,
  CRITICAL_DENIED_PREFIXES,
  buildSanitizedChildEnv,
  auditChildEnvViolations,
} from "../lib/env-policy.js";

test("buildSanitizedChildEnv: retains only baseline safe system vars", () => {
  const mockParentEnv = {
    PATH: "/usr/bin:/bin",
    HOME: "/Users/test",
    USER: "testuser",
    OPENAI_API_KEY: "sk-proj-supersecret123",
    AWS_SECRET_ACCESS_KEY: "AKIAIOSFODNN7EXAMPLE",
    GITHUB_TOKEN: "ghp_xxxx",
    NODE_OPTIONS: "--require /malicious/hack.js",
    PYTHONPATH: "/untrusted/site-packages",
    SENTINEL_SECRET: "do-not-leak-this",
    RANDOM_INTERNAL_VAR: "foo",
  };

  const childEnv = buildSanitizedChildEnv({}, mockParentEnv);

  assert.equal(childEnv.PATH, "/usr/bin:/bin");
  assert.equal(childEnv.HOME, "/Users/test");
  assert.equal(childEnv.USER, "testuser");

  // 绝不能泄漏敏感 key
  assert.equal(childEnv.OPENAI_API_KEY, undefined);
  assert.equal(childEnv.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(childEnv.GITHUB_TOKEN, undefined);
  assert.equal(childEnv.NODE_OPTIONS, undefined);
  assert.equal(childEnv.PYTHONPATH, undefined);
  assert.equal(childEnv.SENTINEL_SECRET, undefined);
  assert.equal(childEnv.RANDOM_INTERNAL_VAR, undefined);

  // 审计函数应当给出 0 违规
  const violations = auditChildEnvViolations(childEnv);
  assert.deepEqual(violations, []);
});

test("buildSanitizedChildEnv: allows explicit safe extraEnv, rejects critical prefixes", () => {
  const mockParentEnv = {
    PATH: "/bin",
  };

  const extraEnv = {
    PYTHONUNBUFFERED: "1",
    LOOPX_DEBUG: "0",
    OPENAI_API_KEY: "sk-attack",
    SENTINEL_SECRET: "injected-sentinel",
  };

  const childEnv = buildSanitizedChildEnv(extraEnv, mockParentEnv);

  assert.equal(childEnv.PATH, "/bin");
  assert.equal(childEnv.PYTHONUNBUFFERED, "1");
  assert.equal(childEnv.LOOPX_DEBUG, "0");

  // 即使在 extraEnv 中显式传入高危前缀，也必须被拦截
  assert.equal(childEnv.OPENAI_API_KEY, undefined);
  assert.equal(childEnv.SENTINEL_SECRET, undefined);
});
