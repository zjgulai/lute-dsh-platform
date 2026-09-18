import test from "node:test";
import assert from "node:assert/strict";
import { normalizePath, evaluateHttpRoutePolicy, MEMBER_ALLOWED_PLUGIN_ROUTES } from "../src/route-guard.mjs";

test("normalizePath: handles query, double slashes, trailing slashes and encoding", () => {
  assert.equal(normalizePath("/api/task-board/state?foo=bar"), "/api/task-board/state");
  assert.equal(normalizePath("///api///task-board//state/"), "/api/task-board/state");
  assert.equal(normalizePath("/api/%74ask-board"), "/api/task-board");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath(""), "/");
});

test("evaluateHttpRoutePolicy: admin bypasses all restrictions", () => {
  const result = evaluateHttpRoutePolicy({
    method: "GET",
    pathname: "/api/dsh-wanzh-hulian/topics",
    role: "admin",
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "admin-bypass");
});

test("evaluateHttpRoutePolicy: member default-deny on unlisted plugin GET/POST routes", () => {
  // 未登记的第三方插件端点必须被拒
  const unlistedRoutes = [
    { method: "GET", path: "/api/dsh-wanzh-hulian/topics" },
    { method: "GET", path: "/api/mcp-servers" },
    { method: "GET", path: "/api/dsh-ssh/exec" },
    { method: "GET", path: "/api/task-board/state" },
    { method: "POST", path: "/api/task-board/state" },
    { method: "POST", path: "/api/dsh-wanzh-hulian/toggle" },
    { method: "GET", path: "/api/unknown-plugin/anything" },
    { method: "POST", path: "/api/dsh-newapp/open-system" }, // 写操作不在 member 白名单
  ];

  for (const { method, path } of unlistedRoutes) {
    const res = evaluateHttpRoutePolicy({ method, pathname: path, role: "member" });
    assert.equal(res.allowed, false, `Expected ${method} ${path} to be denied for member`);
  }
});

test("evaluateHttpRoutePolicy: member can access explicitly allowed plugin routes", () => {
  for (const entry of MEMBER_ALLOWED_PLUGIN_ROUTES) {
    const res = evaluateHttpRoutePolicy({
      method: entry.method,
      pathname: entry.path,
      role: "member",
    });
    assert.equal(res.allowed, true, `Expected allowed route ${entry.method} ${entry.path} to pass`);
  }
});

test("evaluateHttpRoutePolicy: anti-bypass checks (encoding, trailing slash, double slashes)", () => {
  const bypassAttempts = [
    "//api/dsh-wanzh-hulian/topics",
    "/api//dsh-wanzh-hulian/topics",
    "/api/dsh-wanzh-hulian/topics/",
    "/api/dsh-wanzh-hulian/topics?admin=1",
    "/api/task-board/state/..",
  ];

  for (const p of bypassAttempts) {
    const res = evaluateHttpRoutePolicy({ method: "GET", pathname: p, role: "member" });
    assert.equal(res.allowed, false, `Expected bypass attempt ${p} to be denied`);
  }
});

test("evaluateHttpRoutePolicy: core static and gateway internal routes are allowed", () => {
  const allowedStatic = [
    { method: "GET", path: "/" },
    { method: "GET", path: "/index.html" },
    { method: "GET", path: "/assets/index.js" },
    { method: "GET", path: "/login" },
    { method: "GET", path: "/@vite/client" },
  ];

  for (const { method, path } of allowedStatic) {
    const res = evaluateHttpRoutePolicy({ method, pathname: path, role: "member" });
    assert.equal(res.allowed, true, `Expected core path ${path} to be allowed`);
  }
});
