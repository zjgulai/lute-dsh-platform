import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { defaultConfig, validateConfig, saveConfig, loadConfig } from "../src/config.mjs";
import { createRequestHandler, isHttpsRequest, getClientIp, verifySameOrigin, formatCookie } from "../src/server.mjs";
import { LoginRateLimiter } from "../src/login-limiter.mjs";
import { createUser } from "../src/users.mjs";
import { AuditLog } from "../src/audit.mjs";
import { createOwnership } from "../src/policy.mjs";
import { issueSession } from "../src/auth.mjs";

function tempHome() {
  const dir = path.join(os.tmpdir(), `dsh-thub-sec009-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

test("1. SEC-RT-009 默认仅绑定 127.0.0.1，0.0.0.0 + HTTP 拒绝启动", () => {
  const home = tempHome();
  const cfg = defaultConfig(home);
  assert.equal(cfg.listenHost, "127.0.0.1", "默认 listenHost 必须是 127.0.0.1 (loopback-only)");
  assert.equal(cfg.mode, "single", "默认模式必须是单机 single");

  // 模拟非法配置：lan 模式但配置 0.0.0.0 且无 TLS
  const badCfg = {
    ...cfg,
    mode: "lan",
    listenHost: "0.0.0.0",
    tls: { enabled: false },
    users: [{ name: "admin", role: "admin", status: "active" }]
  };
  assert.throws(() => validateConfig(badCfg), /SEC-RT-009: 局域网\/多用户模式 \(lan\) 监听 0.0.0.0 时禁止使用纯明文 HTTP/);

  // 若开启 TLS 则允许 0.0.0.0
  const goodTlsCfg = {
    ...badCfg,
    tls: { enabled: true, cert: "cert.pem", key: "key.pem" }
  };
  assert.ok(validateConfig(goodTlsCfg));
});

test("2. SEC-RT-009 受信代理与 HTTPS 判定：伪造头被忽略，真实受信代理才识别", () => {
  const config = {
    trustedProxies: ["10.0.0.1"],
    upstream: "http://127.0.0.1:3080"
  };

  // 不受信任的来源 IP 发送伪造 X-Forwarded-Proto / X-Forwarded-For
  const untrustedReq = {
    socket: { remoteAddress: "192.168.1.100" },
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-for": "1.2.3.4"
    }
  };
  assert.equal(isHttpsRequest(untrustedReq, config), false, "不受信任的 IP 伪造 x-forwarded-proto 必须无效");
  assert.equal(getClientIp(untrustedReq, config), "192.168.1.100", "不受信任的 IP 伪造 x-forwarded-for 必须无效");

  // 受信代理来源 IP 发送转发头
  const trustedReq = {
    socket: { remoteAddress: "10.0.0.1" },
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-for": "1.2.3.4, 10.0.0.1"
    }
  };
  assert.equal(isHttpsRequest(trustedReq, config), true, "受信代理转发的 https 必须被识别");
  assert.equal(getClientIp(trustedReq, config), "1.2.3.4", "受信代理转发的原始 IP 必须生效");
});

test("3. SEC-RT-009 Cookie 属性：HTTPS 环境必须包含 Secure; HttpOnly; SameSite=Lax", () => {
  const httpCookie = formatCookie("test_sess", "abc123xyz", { isHttps: false });
  assert.ok(httpCookie.includes("HttpOnly"));
  assert.ok(httpCookie.includes("SameSite=Lax"));
  assert.ok(!httpCookie.includes("Secure"), "HTTP 模式不打 Secure 避免无法在本地非 TLS 环境传输");

  const httpsCookie = formatCookie("test_sess", "abc123xyz", { isHttps: true });
  assert.ok(httpsCookie.includes("HttpOnly"));
  assert.ok(httpsCookie.includes("SameSite=Lax"));
  assert.ok(httpsCookie.includes("Secure"), "HTTPS 模式必须携带 Secure 标志");
});

test("4. SEC-RT-009 CSRF 与跨 Origin 状态修改防御", () => {
  // 同源请求
  const sameReq = {
    headers: {
      host: "teamhub.local:3090",
      origin: "http://teamhub.local:3090"
    }
  };
  assert.equal(verifySameOrigin(sameReq), true);

  // 跨源攻击
  const evilReq = {
    headers: {
      host: "teamhub.local:3090",
      origin: "http://attacker.evil.com"
    }
  };
  assert.equal(verifySameOrigin(evilReq), false);

  // 跨源 Referer 伪造
  const evilRefererReq = {
    headers: {
      host: "teamhub.local:3090",
      referer: "http://attacker.evil.com/phishing"
    }
  };
  assert.equal(verifySameOrigin(evilRefererReq), false);
});

test("5. SEC-RT-009 登录限速与指数退避（暴力破解拦截 429）", async () => {
  const home = tempHome();
  const config = defaultConfig(home);
  createUser(config, { name: "admin", role: "admin", password: "correct-password-123" });
  saveConfig(home, config);

  const context = {
    home,
    config,
    ownership: createOwnership(),
    audit: new AuditLog(home)
  };

  const limiter = new LoginRateLimiter({
    maxAttempts: 3,
    baseBackoffMs: 1000
  });

  const handler = createRequestHandler({
    context,
    reloadConfigIfChanged: () => {},
    limiter
  });

  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  async function postLogin(user, pwd, origin = `http://127.0.0.1:${port}`) {
    const postData = `username=${encodeURIComponent(user)}&password=${encodeURIComponent(pwd)}`;
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/login",
        headers: {
          "host": `127.0.0.1:${port}`,
          "origin": origin,
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on("error", reject);
      req.write(postData);
      req.end();
    });
  }

  try {
    // 跨站伪造登录：应直接 403
    const csrfRes = await postLogin("admin", "correct-password-123", "http://evil.com");
    assert.equal(csrfRes.status, 403);

    // 连续错误密码登录
    const r1 = await postLogin("admin", "wrong-1");
    assert.equal(r1.status, 401);
    const r2 = await postLogin("admin", "wrong-2");
    assert.equal(r2.status, 401);

    // 第 3 次失败：触发限速
    const r3 = await postLogin("admin", "wrong-3");
    assert.equal(r3.status, 429, "达到失败阈值后必须返回 429 Too Many Requests");
    assert.ok(r3.headers["retry-after"], "429 必须带 Retry-After 响应头");

    // 第 4 次即使输入正确密码，仍应被封禁拦截 429
    const r4 = await postLogin("admin", "correct-password-123");
    assert.equal(r4.status, 429, "在封禁退避期内输入正确密码也必须返回 429");
  } finally {
    server.close();
  }
});
