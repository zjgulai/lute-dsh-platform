import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { defaultConfig, saveConfig } from "../src/config.mjs";
import { createUser } from "../src/users.mjs";
import { AuditLog } from "../src/audit.mjs";
import { createOwnership } from "../src/policy.mjs";
import { createAdminApi } from "../src/admin-api.mjs";
import { createRequestHandler } from "../src/server.mjs";
import {
  readBoundedBody,
  readBoundedJson,
  BodyLimitError,
  FORM_MAX_BYTES,
  ADMIN_API_MAX_BYTES,
  PASSTHROUGH_MAX_BYTES,
} from "../src/bounded-body.mjs";

/**
 * dsh-team-hub — 有界请求体（SEC-RT-005）。
 *
 * 分两层取证，缺一不可：
 *  ① **reader 本体**：真实 socket 造 chunked、slow body、超限——假 req 对象造不出这些；
 *  ② **真代码路径**：`createRequestHandler` 是这次为此提取的工厂，测试直接把它挂到
 *     真 http server 上跑。静态扫源码只能证明「写了」，证明不了「跑到了」。
 *
 * 刻意**没有**「声明 10 字节却发 500 字节」这条用例：HTTP/1.1 下它不可表达——
 * Node 的解析器把 Content-Length 当帧边界，多出的字节会被当成下一个管线请求，
 * 拿到的是解析层 400 而不是我们的 413（2026-09-16 实测）。真实的对抗形态是
 * 「无 Content-Length 的分块传输」与「每个 chunk 都合法但累计超限」。
 */

/* ── 夹具 ─────────────────────────────────────────────────────────────── */

const ADMIN_PASSWORD = "admin-pass-1";

/** 起一个挂了真请求处理器的 server。 */
async function bootServer(overrides = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "thub-bounded-"));
  const config = { ...defaultConfig(home), ...overrides };
  createUser(config, { name: "admin", role: "admin", password: ADMIN_PASSWORD });
  // 夹具直接清掉首登强制改密：否则每个受保护路径都会被 302 到 /change-password，
  // 代理面与 admin 面就测不到了（这是夹具设定，不是绕过产品逻辑）。
  config.users[0].mustChangePassword = false;
  saveConfig(home, config);

  const audit = new AuditLog(home);
  const ownership = createOwnership();
  /** @type {any} */
  const context = { home, config, ownership, audit };
  context.adminApi = createAdminApi({
    home,
    getConfig: () => context.config,
    save: next => { context.config = next; saveConfig(home, next); },
    ownership,
    audit,
  });

  const handler = createRequestHandler({ context, reloadConfigIfChanged: () => {} });
  const server = http.createServer((req, res) => { handler(req, res).catch(() => {}); });
  await new Promise(resolve => { server.listen(0, "127.0.0.1", () => resolve(undefined)); });
  return {
    home, context, server, port: /** @type {any} */ (server.address()).port,
    close: () => { server.closeAllConnections?.(); return new Promise(r => server.close(r)); },
  };
}

/** 裸 server：只跑一个 handler，用来单测 reader 本体。 */
async function bareServer(handle) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handle(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end("handler-error"); });
  });
  await new Promise(resolve => { server.listen(0, "127.0.0.1", () => resolve(undefined)); });
  return { server, port: /** @type {any} */ (server.address()).port, close: () => { server.closeAllConnections?.(); return new Promise(r => server.close(r)); } };
}

/**
 * 解析原始 HTTP 响应（含 chunked 解块）。
 *
 * **必须按字节走**：chunk 长度行是十六进制**字节数**，而 JS 字符串下标是字符。
 * 用 `String.slice` 切含中文的响应会多切（一个汉字 3 字节但只算 1 个字符），
 * 症状是 `JSON.parse` 报 "Unexpected non-whitespace character after JSON"。
 * @param {Buffer} buffer 原始响应
 */
function parseResponse(buffer) {
  const split = buffer.indexOf("\r\n\r\n");
  if (split < 0) return { status: 0, headers: {}, body: "" };
  const headLines = buffer.subarray(0, split).toString("latin1").split("\r\n");
  const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(headLines[0])?.[1] ?? 0);
  /** @type {Record<string, string>} */
  const headers = {};
  for (const line of headLines.slice(1)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  let body = buffer.subarray(split + 4);
  if ((headers["transfer-encoding"] ?? "").includes("chunked")) {
    /** @type {Buffer[]} */
    const parts = [];
    let off = 0;
    for (;;) {
      const eol = body.indexOf("\r\n", off);
      if (eol < 0) break;
      const size = parseInt(body.subarray(off, eol).toString("latin1"), 16);
      if (!Number.isFinite(size) || size === 0) break;
      parts.push(body.subarray(eol + 2, eol + 2 + size));
      off = eol + 2 + size + 2;
    }
    body = Buffer.concat(parts);
  }
  return { status, headers, body: body.toString("utf8") };
}

/** 发一条原始请求（可分段/延迟写），收集响应。 */
function rawExchange(port, write, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    /** @type {Buffer[]} */
    const chunks = [];
    let settled = false;
    const finish = (hung) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      resolve({ ...parseResponse(buf), raw: buf.toString("utf8"), hung });
    };
    const timer = setTimeout(() => { socket.destroy(); finish(true); }, timeoutMs);
    socket.on("connect", () => write(socket));
    socket.on("data", c => { chunks.push(c); });
    socket.on("close", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

/**
 * 常规 HTTP 请求。
 * @param {number} port 端口
 * @param {{ method?: string, path?: string, headers?: Record<string, string>, body?: string }} [init] 请求参数
 */
function request(port, init = {}) {
  const { method = "GET", path: p = "/", headers = {}, body } = init;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", c => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    // 必须自带超时：服务端把错误吞掉时（缺 await 的那类缺陷）它会永远等下去，
    // 症状是整个测试文件挂住而不是判红（2026-09-16 实测）。
    req.setTimeout(5000, () => req.destroy(new Error("请求超时：服务端没有回包")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** 只跑「读一个 body」的最小 server，把 reader 判定映射成 HTTP 码。 */
async function readerServer(opts) {
  return bareServer(async (req, res) => {
    const err = await readBoundedJson(req, opts).then(() => null, e => e);
    res.writeHead(err ? err.status : 200, { connection: "close" });
    res.end(JSON.stringify(err ? { code: err.code } : { ok: true }));
  });
}

/* ── 1. reader 本体 ───────────────────────────────────────────────────── */

test("边界值：恰好 maxBytes 通过，+1 byte 判 413", async () => {
  const CAP = 64;
  const { port, close } = await readerServer({ maxBytes: CAP, deadlineMs: 2000 });
  try {
    const prefix = '{"a":"';
    const suffix = '"}';
    const exact = prefix + "x".repeat(CAP - prefix.length - suffix.length) + suffix;
    assert.equal(Buffer.byteLength(exact), CAP, "夹具必须精确落在边界上");

    const ok = await rawExchange(port, s => {
      s.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${CAP}\r\nConnection: close\r\n\r\n${exact}`);
    });
    assert.equal(ok.status, 200, "恰好等上限必须放行");

    const over = await rawExchange(port, s => {
      const body = `{"a":"${"x".repeat(CAP)}"}`;
      s.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
    });
    assert.equal(over.status, 413);
    assert.equal(JSON.parse(over.body).code, "BODY_TOO_LARGE");
  } finally {
    await close();
  }
});

test("分块传输：每个 chunk 都远小于上限，累计超限仍判 413", async () => {
  const CAP = 64;
  const { port, close } = await readerServer({ maxBytes: CAP, deadlineMs: 2000 });
  try {
    const res = await rawExchange(port, s => {
      s.write("POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n");
      // 32 块 × 8 字节 = 256 字节；任何「按块判大小」的实现都会放行。
      for (let i = 0; i < 32; i += 1) s.write("8\r\nzzzzzzzz\r\n");
      s.write("0\r\n\r\n");
    });
    assert.equal(res.status, 413, "chunked 没有 Content-Length，只能靠累计计数拦住");
    assert.equal(JSON.parse(res.body).code, "BODY_TOO_LARGE");
  } finally {
    await close();
  }
});

test("Content-Length 声明即超限：不必等到 body 到齐就判 413", async () => {
  // 客户端只发头、一个 body 字节都不发。没有头部快路径的实现只能等满 deadline → 408。
  const DEADLINE = 3000;
  const { port, close } = await readerServer({ maxBytes: 64, deadlineMs: DEADLINE });
  try {
    const started = Date.now();
    const res = await rawExchange(port, s => {
      s.write("POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100000\r\nConnection: close\r\n\r\n");
    }, DEADLINE + 2000);
    const elapsed = Date.now() - started;
    assert.equal(res.hung, false);
    assert.equal(res.status, 413, `头部已声明超限就该立刻 413；拿到 ${res.status} 说明它去等了 body`);
    assert.ok(elapsed < DEADLINE / 2, `必须远早于 deadline 返回，实测 ${elapsed}ms`);
  } finally {
    await close();
  }
});

test("slow body：超 deadline 判 408，且不永久挂起", async () => {
  const { port, close } = await readerServer({ maxBytes: 1024, deadlineMs: 80 });
  try {
    const res = await rawExchange(port, s => {
      s.write("POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n");
    });
    assert.equal(res.hung, false, "超时必须回包，不能把连接永久挂起");
    assert.equal(res.status, 408);
  } finally {
    await close();
  }
});

test("body 传到一半客户端断开：立即收敛为 BODY_ABORTED，不空等满 deadline", async () => {
  // 不能断言 HTTP 码：客户端已掐掉 socket，没有对象能收到 400。
  // 可证伪的点是**收敛时机**——不处理 'close' 的实现会一直等到 deadline。
  const DEADLINE = 5000;
  /** @type {(v: unknown) => void} */
  let report = () => {};
  const outcome = new Promise(r => { report = r; });
  const { port, close } = await bareServer(async (req, res) => {
    const err = await readBoundedJson(req, { maxBytes: 1024, deadlineMs: DEADLINE }).then(() => null, e => e);
    report(err);
    try { res.writeHead(400, { connection: "close" }); res.end("{}"); } catch { /* 连接已断 */ }
  });
  try {
    const started = Date.now();
    await rawExchange(port, s => {
      s.write("POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n");
      s.write('{"a":"0123456789012');
      setTimeout(() => s.destroy(), 30);
    }, 3000);
    const err = await Promise.race([
      outcome,
      new Promise(r => setTimeout(() => r(new Error("reader 没有收敛")), DEADLINE - 500)),
    ]);
    const elapsed = Date.now() - started;
    assert.ok(err instanceof BodyLimitError, `期望 BodyLimitError，实际 ${String(err)}`);
    assert.equal(/** @type {any} */ (err).code, "BODY_ABORTED");
    assert.ok(elapsed < DEADLINE / 4, `必须远早于 deadline 收敛，实测 ${elapsed}ms`);
  } finally {
    await close();
  }
});

test("超限与解析失败都不回显原文（凭证不出现在响应里）", async () => {
  const secret = "sk-SUPERSECRET-MUST-NOT-ECHO";
  const { port, close } = await readerServer({ maxBytes: 32, deadlineMs: 2000 });
  try {
    const body = JSON.stringify({ token: secret, pad: "p".repeat(200) });
    const res = await rawExchange(port, s => {
      s.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
    });
    assert.equal(res.status, 413);
    assert.ok(!res.raw.includes(secret), "错误响应绝不能回显原始 body");
  } finally {
    await close();
  }

  const bad = await readerServer({ maxBytes: 1024, deadlineMs: 2000 });
  try {
    const raw = "{ not json sk-LEAKCANARY }";
    const res = await rawExchange(bad.port, s => {
      s.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(raw)}\r\nConnection: close\r\n\r\n${raw}`);
    });
    assert.equal(res.status, 400);
    assert.ok(!res.raw.includes("LEAKCANARY"), "400 不得回显 body");
  } finally {
    await bad.close();
  }
});

/* ── 2. 真代码路径（createRequestHandler 挂真 server）──────────────────── */

test("登录表单超限：413，且业务 handler 没被执行（审计里没有 auth.*）", async () => {
  const { port, context, close } = await bootServer();
  try {
    const body = `username=admin&password=${"p".repeat(FORM_MAX_BYTES)}`;
    const res = await request(port, {
      method: "POST", path: "/login",
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": String(Buffer.byteLength(body)) },
      body,
    });
    assert.equal(res.status, 413, JSON.stringify(res.body));
    assert.equal(JSON.parse(res.body).code, "BODY_TOO_LARGE");

    const types = context.audit.query({ limit: 200 }).map(e => e.type);
    assert.ok(types.includes("system.body-rejected"), "被拒必须留审计");
    assert.ok(!types.includes("auth.login"), "超限请求绝不能走到认证成功分支");
    assert.ok(!types.includes("auth.login-failed"), "超限请求根本不该进入认证逻辑");
  } finally {
    await close();
  }
});

test("登录正常体积不回归：302 + 会话 cookie，审计留下 auth.login", async () => {
  const { port, context, close } = await bootServer();
  try {
    const res = await request(port, {
      method: "POST", path: "/login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `username=admin&password=${ADMIN_PASSWORD}`,
    });
    assert.equal(res.status, 302, JSON.stringify(res.body));
    assert.match(String(res.headers["set-cookie"]), /dsh_team_hub_session=/);
    assert.ok(context.audit.query({ limit: 200 }).some(e => e.type === "auth.login"), "正常登录必须照常记录");
  } finally {
    await close();
  }
});

test("代理面超限：413（网关不透传无限大的 body）", async () => {
  const { port, close } = await bootServer();
  try {
    const cookie = await login(port);
    // 必须用裸 socket：`http.request` 若声明 32 MiB 的 Content-Length 却只写一小段，
    // 客户端自己会一直等剩余字节（2026-09-16 实测导致整个测试文件挂住）。
    // 裸 socket 也正是真实攻击形态——只发头、不发 body。
    const res = await rawExchange(port, s => {
      s.write(`POST /api/session.list HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nCookie: ${cookie}\r\nContent-Length: ${PASSTHROUGH_MAX_BYTES + 1}\r\nConnection: close\r\n\r\n`);
    });
    assert.equal(res.status, 413, res.raw.slice(0, 200));
    assert.equal(JSON.parse(res.body).code, "BODY_TOO_LARGE");
  } finally {
    await close();
  }
});

test("admin 面超限：413，且不落到 admin API", async () => {
  const { port, close } = await bootServer();
  try {
    const cookie = await login(port);
    const body = JSON.stringify({ name: "u1", pad: "p".repeat(ADMIN_API_MAX_BYTES) });
    const res = await request(port, {
      method: "POST", path: "/__teamhub/api/users",
      headers: { "content-type": "application/json", cookie },
      body,
    });
    assert.equal(res.status, 413, JSON.stringify(res.body));
  } finally {
    await close();
  }
});

test("admin 面正常体积不回归：建用户成功", async () => {
  const { port, context, close } = await bootServer();
  try {
    const cookie = await login(port);
    const body = JSON.stringify({ name: "member1", password: "member-pass-1" });
    const res = await request(port, {
      method: "POST", path: "/__teamhub/api/users",
      headers: { "content-type": "application/json", cookie, "content-length": String(Buffer.byteLength(body)) },
      body,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(context.config.users.some(u => u.name === "member1"));
  } finally {
    await close();
  }
});

test("未登录访问受保护路径仍照常 302 到 /login（未引入新分支）", async () => {
  const { port, close } = await bootServer();
  try {
    const res = await request(port, { method: "GET", path: "/" });
    assert.equal(res.status, 302);
    assert.match(String(res.headers.location), /^\/login\?next=/);
  } finally {
    await close();
  }
});

test("上限常量有明确意图：透传面必须高于上游 18 MiB 天花板，自有面必须收紧", () => {
  // 上游 dsh-file-upload 的 MAX_JSON_BYTES = 18 MiB。低于它就会打断真实业务。
  assert.ok(PASSTHROUGH_MAX_BYTES > 18 * 1024 * 1024, "透传上限必须留出余量，否则会打断文件上传");
  assert.ok(Number.isFinite(PASSTHROUGH_MAX_BYTES));
  assert.equal(FORM_MAX_BYTES, 8 * 1024);
  assert.equal(ADMIN_API_MAX_BYTES, 64 * 1024);
});

test("代理面异常必须回 500，而不是让请求永远挂着", async () => {
  // 上游指向必然连不上的地址，让 proxyRequest 里的 fetch 抛错。
  // 这条守的是 `return await proxyRequest(...)`：写成 `return proxyRequest(...)` 时
  // 拒绝不会被本函数的 catch 接住，症状是「请求进了处理器、却永远没有响应」。
  const { port, close } = await bootServer({ upstream: "http://127.0.0.1:1" });
  try {
    const cookie = await login(port);
    const res = await rawExchange(port, s => {
      s.write(`GET /some-page HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nCookie: ${cookie}\r\nConnection: close\r\n\r\n`);
    });
    assert.equal(res.hung, false, "没有收到响应：错误被 try 吞掉了（缺 await）");
    assert.equal(res.status, 500);
  } finally {
    await close();
  }
});

test("admin 面异常必须回 500，而不是让请求永远挂着", async () => {
  // 建一个已存在的用户 → createUser 抛错 → 必须经 catch 变成 500。
  // 这条守的是 `return await handleAdminApi(...)`。
  const { port, close } = await bootServer();
  try {
    const cookie = await login(port);
    const body = JSON.stringify({ name: "admin", password: "whatever-1" });
    const res = await rawExchange(port, s => {
      s.write(`POST /__teamhub/api/users HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nCookie: ${cookie}\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
    });
    assert.equal(res.hung, false, "没有收到响应：错误被 try 吞掉了（缺 await）");
    assert.equal(res.status, 500);
  } finally {
    await close();
  }
});

/** 走一次真实登录，返回可直接用于受保护路径的 cookie 头。 */
async function login(port) {
  const res = await request(port, {
    method: "POST", path: "/login",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `username=admin&password=${ADMIN_PASSWORD}`,
  });
  assert.equal(res.status, 302, `登录夹具失败：${JSON.stringify(res.body)}`);
  const raw = String(res.headers["set-cookie"] ?? "");
  assert.match(raw, /dsh_team_hub_session=/);
  return raw.split(";")[0];
}
