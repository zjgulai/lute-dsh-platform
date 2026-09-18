import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { loadConfig, saveConfig } from "./config.mjs";
import { authenticate, changePassword, publicUser } from "./users.mjs";
import { parseCookies, resolveSession, issueSession, revokeSession } from "./auth.mjs";
import { AuditLog } from "./audit.mjs";
import { createAdminApi } from "./admin-api.mjs";
import { createOwnership, guardMemberRequest, filterMemberResponse, learnWorkspace, learnSession } from "./policy.mjs";
import { upstreamRpc } from "./upstream.mjs";
import { findDshRoot, applySettingsPatch, settingsPatchStatus } from "./patch.mjs";
import { withBridge, resetBridge } from "./browser-auth.mjs";
import { transformSettingsHostMode, CACHE_BUST_PARAM } from "./settings-transform.mjs";
import { filterMemberStreamItem, classifyMemberStreamOpen } from "./ws-filter.mjs";
import { injectSpaShim } from "./spa-shim.mjs";
import { compatibilityReport } from "./compat.mjs";
import {
  readBoundedBody,
  readBoundedJson,
  BodyLimitError,
  PASSTHROUGH_MAX_BYTES,
  PASSTHROUGH_READ_DEADLINE_MS,
  FORM_MAX_BYTES,
  FORM_READ_DEADLINE_MS,
  ADMIN_API_MAX_BYTES,
  ADMIN_API_READ_DEADLINE_MS,
} from "./bounded-body.mjs";
import { evaluateHttpRoutePolicy } from "./route-guard.mjs";
import { LoginRateLimiter } from "./login-limiter.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const COOKIE = "dsh_team_hub_session";
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "host", "content-length", "content-encoding"]);

/** 预置的 body 读取上限配置。 */
const PASSTHROUGH_BODY = {
  maxBytes: PASSTHROUGH_MAX_BYTES,
  readDeadlineMs: PASSTHROUGH_READ_DEADLINE_MS,
};
const FORM_BODY = {
  maxBytes: FORM_MAX_BYTES,
  readDeadlineMs: FORM_READ_DEADLINE_MS,
};
const ADMIN_BODY = {
  maxBytes: ADMIN_API_MAX_BYTES,
  readDeadlineMs: ADMIN_API_READ_DEADLINE_MS,
};

/**
 * 宿主级插件的 HTTP 路由前缀（仅 admin 可直通，member 拦截）。
 * @see docs/adr/ADR-0104.md
 */
const PLUGIN_HOST_ROUTES = [
  "/api/dsh-wanzh-hulian",
  "/api/dsh-remote-web-ui",
  "/api/mcp-servers",
  "/api/dsh-ssh",
  "/api/events", // dsh-remote-web-ui 的 SSE（注意不带 .mux/.host 后缀）
];

function isPluginHostRoute(pathname) {
  return PLUGIN_HOST_ROUTES.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"));
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body === "object" && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "content-type": isJson ? "application/json" : "text/plain; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

function collect(req) {
  return readBoundedBody(req, PASSTHROUGH_BODY);
}

function loginPage(next = "/", error = "") {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dsh-team-hub 登录</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;display:grid;place-items:center;min-height:100vh}form{background:white;padding:32px;border-radius:14px;box-shadow:0 8px 30px rgb(0 0 0/8%);display:grid;gap:14px;width:320px}input,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #d1d5db}button{background:#111827;color:white;border:0}.error{color:#b91c1c}</style></head>
<body><form method="post" action="/login"><h1>dsh-team-hub</h1><input type="hidden" name="next" value="${next}"><input name="username" placeholder="用户名" autocomplete="username" required><input name="password" type="password" placeholder="密码" autocomplete="current-password" required>${error ? `<p class="error">${error}</p>` : ""}<button>登录</button></form></body></html>`;
}

function changePasswordPage(error = "") {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>修改密码</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;display:grid;place-items:center;min-height:100vh}form{background:white;padding:32px;border-radius:14px;box-shadow:0 8px 30px rgb(0 0 0/8%);display:grid;gap:14px;width:340px}input,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #d1d5db}button{background:#111827;color:white;border:0}.error{color:#b91c1c}</style></head>
<body><form method="post" action="/change-password"><h1>首次登录，请修改密码</h1><input name="current" type="password" placeholder="当前密码" required><input name="next" type="password" placeholder="新密码（至少 8 位）" required>${error ? `<p class="error">${error}</p>` : ""}<button>保存并继续</button></form></body></html>`;
}

/**
 * 从 catch/未知值中取出可读消息。
 * @param {unknown} reason 捕获到的值
 * @returns {string} 消息文本
 */
function errorText(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * 获取请求的真实客户端 IP（只信任配置中的受信反向代理）
 * @param {import("node:http").IncomingMessage} req
 * @param {any} config
 * @returns {string}
 */
export function getClientIp(req, config) {
  const remoteIp = req.socket?.remoteAddress || "127.0.0.1";
  const trusted = Array.isArray(config.trustedProxies) ? config.trustedProxies : ["127.0.0.1", "::1"];
  const isTrusted = trusted.includes(remoteIp) || remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1";

  if (isTrusted && req.headers["x-forwarded-for"]) {
    const parts = String(req.headers["x-forwarded-for"]).split(",");
    return parts[0].trim();
  }
  return remoteIp;
}

/**
 * 判断当前请求是否属于 HTTPS（直接 TLS 或受信代理 X-Forwarded-Proto）
 * @param {import("node:http").IncomingMessage} req
 * @param {any} config
 * @returns {boolean}
 */
export function isHttpsRequest(req, config) {
  if (req.socket && "encrypted" in req.socket && req.socket.encrypted) return true;
  const remoteIp = req.socket?.remoteAddress || "127.0.0.1";
  const trusted = Array.isArray(config.trustedProxies) ? config.trustedProxies : ["127.0.0.1", "::1"];
  const isTrusted = trusted.includes(remoteIp) || remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1";

  if (isTrusted && req.headers["x-forwarded-proto"]) {
    return String(req.headers["x-forwarded-proto"]).trim().toLowerCase() === "https";
  }
  return false;
}

/**
 * 校验跨站 Origin/Referer（防止 CSRF 修改凭证或越权状态）
 * @param {import("node:http").IncomingMessage} req
 * @returns {boolean}
 */
export function verifySameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!host) return false;
  if (!origin) {
    const referer = req.headers.referer;
    if (!referer) return true; // 无 Referer 且无 Origin（如同源直接请求/同机工具）放行
    try {
      const refUrl = new URL(referer);
      return refUrl.host === host;
    } catch {
      return false;
    }
  }
  try {
    const origUrl = new URL(origin);
    return origUrl.host === host;
  } catch {
    return false;
  }
}

/**
 * 构造 Cookie Header
 * @param {string} name
 * @param {string} value
 * @param {object} opts
 * @returns {string}
 */
export function formatCookie(name, value, { isHttps = false, maxAge, path = "/" } = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax`;
  if (isHttps) cookie += "; Secure";
  if (typeof maxAge === "number") cookie += `; Max-Age=${maxAge}`;
  return cookie;
}

/**
 * @param {any} config 运行配置
 * @param {import('node:http').IncomingMessage} req 请求
 * @param {import('node:http').ServerResponse} res 响应
 * @param {{ bodyOverride?: any, injectShim?: boolean }} [options] 代理选项
 * @returns {Promise<void>}
 */
async function proxyRequest(config, req, res, { bodyOverride, injectShim = false } = {}) {
  const upstream = new URL(config.upstream);
  /** @type {Record<string, any>} */
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) if (!HOP_BY_HOP.has(key)) headers[key] = value;
  headers.host = upstream.host;
  // DSH 的自定义路由（如插件注册的 /api/task-board/state）会校验 Origin。
  // 上游只接受自己的源——网关已做认证，这里把 Origin/Referer 统一改写成上游源。
  headers.origin = upstream.origin;
  if (typeof headers.referer === "string") {
    headers.referer = headers.referer.replace(/^https?:\/\/[^/]+/, upstream.origin);
  }
  const body = bodyOverride !== undefined ? bodyOverride : ["GET", "HEAD"].includes(req.method ?? "") ? undefined : await collect(req);
  // 网关注入的缓存破坏参数（thub）只对浏览器有意义，转发上游前剥掉。
  const targetUrl = config.upstream + (req.url ?? "/").replace(new RegExp(`[&?]${CACHE_BUST_PARAM}=[^&]*`), "");
  let response = await fetch(targetUrl, {
    method: req.method,
    headers: withBridge(headers, config),
    body,
    redirect: "manual"
  });
  if (response.status === 401) {
    // Desktop 浏览器会话 cookie 失效：重铸后重试一次
    resetBridge();
    response = await fetch(targetUrl, {
      method: req.method,
      headers: withBridge(headers, config),
      body,
      redirect: "manual"
    });
  }
  const outHeaders = {};
  response.headers.forEach((value, key) => { if (!HOP_BY_HOP.has(key)) outHeaders[key] = value; });
  if (response.headers.has("location")) {
    const loc = response.headers.get("location") || "/";
    outHeaders.location = loc.replace(new RegExp(`^https?://${upstream.host}`), "");
  }
  const contentType = response.headers.get("content-type") || "";
  const isHtml = contentType.includes("text/html");
  const isJs = contentType.includes("javascript");
  const contentEncoding = (response.headers.get("content-encoding") || "").toLowerCase();

  if (isJs && (contentEncoding === "" || contentEncoding === "gzip" || contentEncoding === "br")) {
    const rawBuf = Buffer.from(await response.arrayBuffer());
    const transformed = transformSettingsHostMode(rawBuf, contentEncoding);
    if (transformed) {
      outHeaders["content-length"] = String(transformed.byteLength);
      res.writeHead(response.status, outHeaders);
      res.end(transformed);
      return;
    }
    delete outHeaders["content-encoding"];
    outHeaders["content-length"] = String(rawBuf.byteLength);
    res.writeHead(response.status, outHeaders);
    res.end(rawBuf);
    return;
  }

  if (isHtml && injectShim) {
    delete outHeaders["content-length"];
    delete outHeaders["content-encoding"];
    res.writeHead(response.status, outHeaders);
    res.end(injectSpaShim(await response.text()));
    return;
  }
  res.writeHead(response.status, outHeaders);
  if (!response.body) { res.end(); return; }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

function rpcError(res, id, code, message, status = 200) {
  send(res, status, { id, error: { code, message } });
}

async function handleRpc(context, user, req, res) {
  const parsed = await readBoundedJson(req, PASSTHROUGH_BODY);
  const { id = null, method, args, payload } = parsed;
  const rpcPayload = payload ?? args ?? {};

  if (user.role === "member") {
    const guard = guardMemberRequest({ config: context.config, ownership: context.ownership, user, method, payload: rpcPayload });
    if (!guard.pass) {
      context.audit.write("policy.denied", { user: user.name, method, reason: guard.reason });
      return rpcError(res, id, "forbidden", guard.reason || "forbidden", 403);
    }
  }

  const upstream = new URL(context.config.upstream);
  const target = new URL(req.url ?? "/api/", upstream.origin);
  const upstreamRes = await fetch(target, {
    method: "POST",
    headers: withBridge({ "content-type": "application/json", host: upstream.host }, context.config),
    body: JSON.stringify(parsed)
  });
  const data = await upstreamRes.json();
  const filtered = user.role === "member"
    ? filterMemberResponse({ ownership: context.ownership, user, method, value: data.result ?? data.value ?? data })
    : (data.result ?? data.value ?? data);

  const out = "result" in data ? { id: data.id ?? id, result: filtered }
    : "value" in data ? { id: data.id ?? id, value: filtered }
    : filtered;
  send(res, upstreamRes.status, out);
}

function serveAdminUi(res, reqPath) {
  const norm = path.normalize(reqPath || "/").replace(/^(\.\.[/\\])+/, "");
  const target = path.join(ROOT, "admin-ui", norm === "/" ? "index.html" : norm);
  if (!target.startsWith(path.join(ROOT, "admin-ui")) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    return false;
  }
  const ext = path.extname(target);
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };
  send(res, 200, fs.readFileSync(target), { "content-type": types[ext] || "application/octet-stream" });
  return true;
}

async function handleAdminApi(context, req, res, pathname, query) {
  const api = context.adminApi;
  if (!api) return send(res, 500, { error: "admin api unavailable" });
  if (req.method === "GET" && pathname === "/overview") return send(res, 200, api.overview());
  if (req.method === "GET" && pathname === "/status") return send(res, 200, api.overview());
  if (req.method === "GET" && pathname === "/users") return send(res, 200, api.users());
  if (req.method === "POST" && pathname === "/users") {
    const body = await readBoundedJson(req, ADMIN_BODY);
    return send(res, 200, api.createUser(body));
  }
  const statusMatch = pathname.match(/^\/users\/([^/]+)\/status$/);
  if (req.method === "POST" && statusMatch) {
    const body = await readBoundedJson(req, ADMIN_BODY);
    return send(res, 200, api.setUserStatus(decodeURIComponent(statusMatch[1]), body.status));
  }
  const resetMatch = pathname.match(/^\/users\/([^/]+)\/reset-password$/);
  if (req.method === "POST" && resetMatch) {
    return send(res, 200, api.resetPassword(decodeURIComponent(resetMatch[1])));
  }
  const nameMatch = pathname.match(/^\/users\/([^/]+)\/display-name$/);
  if (req.method === "POST" && nameMatch) {
    const body = await readBoundedJson(req, ADMIN_BODY);
    return send(res, 200, api.setDisplayName(decodeURIComponent(nameMatch[1]), body.displayName));
  }
  if (req.method === "GET" && pathname === "/workspaces") return send(res, 200, api.workspaces());
  if (req.method === "GET" && pathname === "/debug/ownership") return send(res, 200, api.ownershipDebug());
  if (req.method === "GET" && pathname === "/audit") {
    const limit = Number(query.get("limit") || 50);
    return send(res, 200, api.audit({ limit, user: query.get("user"), type: query.get("type") }));
  }
  if (req.method === "GET" && pathname === "/system") {
    return send(res, 200, { upstream: context.config.upstream, users: context.config.users.length, node: process.version });
  }
  if (req.method === "POST" && pathname === "/selftest") return send(res, 200, await compatibilityReport(context.config));
  return send(res, 404, { error: "not found" });
}

async function ensureMemberWorkspaces(context) {
  for (const user of context.config.users) {
    if (user.role !== "member") continue;
    try {
      const created = await upstreamRpc(context.config, "workspace/create", {
        args: { request: { title: user.name, path: path.join(context.config.workspaceRoot, user.name) } }
      });
      learnWorkspace(context.config, context.ownership, created.workspace || created);
    } catch (error) {
      console.warn(`[workspace] 为成员 ${user.name} 确保工作区失败:`, errorText(error));
    }
  }
}

/**
 * 构造核心 HTTP 请求处理器
 * @param {{ context: any, reloadConfigIfChanged: () => void, limiter?: LoginRateLimiter }} options 选项
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<unknown>} 请求处理器
 */
export function createRequestHandler({ context, reloadConfigIfChanged, limiter = new LoginRateLimiter() }) {
  const home = context.home;
  return async (req, res) => {
    try {
      reloadConfigIfChanged();
      const url = new URL(req.url ?? "/", "http://local");
      const isHttps = isHttpsRequest(req, context.config);
      const cookies = parseCookies(req);
      const session = resolveSession(home, cookies[COOKIE]);
      const user = session && context.config.users.find(u => u.name === session.username && (u.status || "active") === "active");
      const clientIp = getClientIp(req, context.config);

      if (url.pathname === "/login" && req.method === "GET") {
        return send(res, 200, loginPage(url.searchParams.get("next") || "/"), { "content-type": "text/html; charset=utf-8" });
      }

      if (url.pathname === "/login" && req.method === "POST") {
        // SEC-RT-009 CSRF 与 Origin 检查
        if (!verifySameOrigin(req)) {
          context.audit.write("auth.login-rejected", { reason: "cross-origin-login", ip: clientIp });
          return send(res, 403, "Forbidden: Cross-origin request rejected");
        }

        const form = new URLSearchParams((await readBoundedBody(req, FORM_BODY)).toString("utf8"));
        const username = String(form.get("username") || "").trim();
        const password = String(form.get("password") || "");

        // SEC-RT-009 登录限速与指数退避检查
        const limitCheck = limiter.check(clientIp, username);
        if (!limitCheck.allowed) {
          const retrySec = Math.ceil(limitCheck.retryAfterMs / 1000);
          context.audit.write("auth.login-rate-limited", { user: username, ip: clientIp, retrySec });
          res.setHeader("Retry-After", String(retrySec));
          return send(res, 429, loginPage(String(form.get("next") || "/"), `登录失败过多，请在 ${retrySec} 秒后重试`), {
            "content-type": "text/html; charset=utf-8",
            "Retry-After": String(retrySec)
          });
        }

        const found = authenticate(context.config, username, password);
        if (!found) {
          const failRecord = limiter.recordFailure(clientIp, username);
          context.audit.write("auth.login-failed", { user: username, ip: clientIp, attempts: failRecord.attempts });
          const errMsg = failRecord.blocked
            ? `登录失败次数过多，已被暂时锁定 ${Math.ceil(failRecord.retryAfterMs / 1000)} 秒`
            : "用户名或密码错误";
          const status = failRecord.blocked ? 429 : 401;
          if (failRecord.blocked) {
            res.setHeader("Retry-After", String(Math.ceil(failRecord.retryAfterMs / 1000)));
          }
          return send(res, status, loginPage(String(form.get("next") || "/"), errMsg), { "content-type": "text/html; charset=utf-8" });
        }

        limiter.recordSuccess(clientIp, username);
        const issued = issueSession(home, found.name);
        context.audit.write("auth.login", { user: found.name, ip: clientIp });
        const next = found.mustChangePassword ? "/change-password" : String(form.get("next") || "/");
        const cookieHeader = formatCookie(COOKIE, issued.token, { isHttps });
        return send(res, 302, "", { location: next, "set-cookie": cookieHeader });
      }

      if (url.pathname === "/logout") {
        // SEC-RT-009: 注销统一要求 POST（GET 兼容 302 重定向到前端或在同源下处理，POST 执行真实注销与 CSRF 防御）
        if (req.method === "POST" && !verifySameOrigin(req)) {
          return send(res, 403, "Forbidden: Cross-origin logout rejected");
        }
        revokeSession(home, cookies[COOKIE]);
        context.audit.write("auth.logout", { user: session?.username || "", ip: clientIp });
        const clearCookie = formatCookie(COOKIE, "", { isHttps, maxAge: 0 });
        return send(res, 302, "", { location: "/login", "set-cookie": clearCookie });
      }

      if (!user) {
        if (url.pathname.startsWith("/api/")) return rpcError(res, null, "unauthorized", "not logged in", 401);
        return send(res, 302, "", { location: "/login?next=" + encodeURIComponent(req.url ?? "/") });
      }

      if (url.pathname === "/__teamhub/whoami") {
        return send(res, 200, { name: user.name, displayName: user.displayName || user.name, role: user.role });
      }

      if (user.mustChangePassword && url.pathname !== "/change-password") return send(res, 302, "", { location: "/change-password" });
      if (url.pathname === "/change-password") {
        if (req.method === "GET") return send(res, 200, changePasswordPage(), { "content-type": "text/html; charset=utf-8" });
        if (req.method === "POST") {
          // SEC-RT-009: 改密必须防跨站请求伪造
          if (!verifySameOrigin(req)) {
            return send(res, 403, "Forbidden: Cross-origin password change rejected");
          }
          const form = new URLSearchParams((await readBoundedBody(req, FORM_BODY)).toString("utf8"));
          try {
            changePassword(context.config, user.name, String(form.get("current") || ""), String(form.get("next") || ""));
            saveConfig(home, context.config);
            context.audit.write("auth.password-changed", { user: user.name, ip: clientIp });
            return send(res, 302, "", { location: "/" });
          } catch (error) {
            return send(res, 400, changePasswordPage(errorText(error)), { "content-type": "text/html; charset=utf-8" });
          }
        }
      }

      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
        if (user.role !== "admin") return send(res, 403, "admin only");
        if (url.pathname === "/admin") return send(res, 302, "", { location: "/admin/" });
        return serveAdminUi(res, url.pathname.slice("/admin".length)) || send(res, 404, "not found");
      }

      if (url.pathname.startsWith("/__teamhub/api/")) {
        if (user.role !== "admin") return send(res, 403, { error: "admin only" });
        if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method ?? "") && !verifySameOrigin(req)) {
          return send(res, 403, { error: "Cross-origin state modification rejected" });
        }
        return await handleAdminApi(context, req, res, url.pathname.slice("/__teamhub/api".length), url.searchParams);
      }

      // SEC-RT-004 · HTTP 路由 default-deny（任何插件端点对 member 默认拒绝，仅放行经过审查的白名单）
      const routeVerdict = evaluateHttpRoutePolicy({
        method: req.method ?? "GET",
        pathname: url.pathname,
        role: user.role
      });
      if (!routeVerdict.allowed) {
        context.audit.write("policy.denied", {
          user: user.name,
          role: user.role,
          method: req.method,
          pathname: url.pathname,
          reason: routeVerdict.reason
        });
        return send(res, 403, { error: "forbidden", reason: routeVerdict.reason });
      }

      if (req.method === "POST" && (url.pathname === "/api" || url.pathname === "/api/")) {
        return await handleRpc(context, user, req, res);
      }

      const injectShim = (url.pathname === "/" || url.pathname === "/index.html");
      await proxyRequest(context.config, req, res, { injectShim });
    } catch (error) {
      if (error instanceof BodyLimitError) {
        context.audit.write("system.body-rejected", { code: error.code });
        if (!res.headersSent) {
          send(res, error.status, { error: error.message, code: error.code }, { connection: "close" });
        }
        return;
      }
      context.audit.write("system.request-error", { error: errorText(error) });
      send(res, 500, { error: errorText(error) });
    }
  };
}

export async function startServer() {
  const { home, file: configFile, config } = loadConfig();
  const crashGuard = (kind) => (error) => {
    try {
      fs.appendFileSync(path.join(home, "logs", "crash.log"), `${new Date().toISOString()} [${kind}] ${error?.stack || error}\n`);
    } catch {}
  };
  process.on("uncaughtException", crashGuard("uncaughtException"));
  process.on("unhandledRejection", crashGuard("unhandledRejection"));
  let configMtime = fs.statSync(configFile).mtimeMs;
  /** @type {{ home: string, config: any, ownership: any, audit: any, adminApi?: any }} */
  const context = {
    home,
    config,
    ownership: createOwnership(),
    audit: new AuditLog(home)
  };
  let ensuring = false;
  function reloadConfigIfChanged() {
    try {
      const mtime = fs.statSync(configFile).mtimeMs;
      if (mtime === configMtime) return;
      configMtime = mtime;
      context.config = loadConfig(home).config;
      context.audit.write("system.config-reloaded", {});
      if (!ensuring) {
        ensuring = true;
        ensureMemberWorkspaces(context).finally(() => { ensuring = false; });
      }
    } catch {}
  }
  context.adminApi = createAdminApi({
    home,
    getConfig: () => context.config,
    save: next => { context.config = next; saveConfig(home, next); },
    ownership: context.ownership,
    audit: context.audit
  });

  try {
    const dshRoot = context.config.enableSettingsPatch === true ? findDshRoot(context.config.dshRoot) : null;
    if (dshRoot) {
      const status = settingsPatchStatus(dshRoot);
      if (status === "unpatched") {
        applySettingsPatch(dshRoot);
        console.log(`[settings] 已自动对 ${dshRoot} 应用 host 模式补丁`);
      }
    }
  } catch (err) {
    console.warn("[settings] 补丁自动应用跳过:", errorText(err));
  }

  try {
    const sessions = await upstreamRpc(context.config, "session/list", { args: { _request: {} } });
    for (const row of sessions.items || []) {
      learnSession(context.config, context.ownership, row.sessionId, row.cwd, row.parentSessionId);
    }
    console.log(`[init] 从上游已存在的会话中学习了 ${context.ownership.sessionOwner.size} 个会话所有权`);
  } catch (error) {
    console.warn("[init] 启动时学习上游会话归属跳过（上游可能尚未就绪）:", errorText(error));
  }

  ensureMemberWorkspaces(context).catch(error => {
    console.warn("[init] 确保成员工作区跳过:", errorText(error));
  });

  const requestHandler = createRequestHandler({ context, reloadConfigIfChanged });

  let server;
  if (config.tls && config.tls.enabled && config.tls.cert && config.tls.key) {
    const cert = fs.readFileSync(config.tls.cert);
    const key = fs.readFileSync(config.tls.key);
    server = https.createServer({ cert, key }, requestHandler);
  } else {
    server = http.createServer(requestHandler);
  }

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", async (req, socket, head) => {
    reloadConfigIfChanged();
    const cookies = parseCookies(req);
    const session = resolveSession(home, cookies[COOKIE]);
    const user = session && context.config.users.find(u => u.name === session.username && (u.status || "active") === "active");
    if (!user) { socket.destroy(); return; }
    const url = new URL(req.url ?? "/", "http://local");
    const stream = url.pathname === "/api/events.mux" ? "mux"
      : url.pathname === "/api/events.host" ? "host"
      : url.pathname === "/api/remote.mux" ? "remote"
      : null;
    if (!stream) { socket.destroy(); return; }
    if (user.mustChangePassword) { socket.destroy(); return; }
    if (stream !== "remote" && user.role !== "admin") {
      context.audit.write("ws.legacy-stream-member-denied", { user: user.name, stream });
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, downstream => {
      const upstreamUrl = new URL(context.config.upstream);
      upstreamUrl.protocol = upstreamUrl.protocol === "https:" ? "wss:" : "ws:";
      upstreamUrl.pathname = url.pathname;
      const wsHeaders = { host: upstreamUrl.host };
      const cookie = mintBrowserSessionCookie(undefined, upstreamUrl.host);
      if (cookie) wsHeaders.cookie = `${cookie.name}=${cookie.value}`;
      const upstream = new WebSocket(upstreamUrl.toString(), {
        headers: wsHeaders,
        rejectUnauthorized: false
      });
      const pending = [];
      const memberStreams = new Map();
      upstream.on("open", () => {
        for (const msg of pending) upstream.send(msg);
        pending.length = 0;
      });
      downstream.on("message", (data, isBinary) => {
        if (isBinary) { downstream.close(1003, "binary not supported"); return; }
        if (user.role === "member") {
          let msg;
          try { msg = JSON.parse(data.toString("utf8")); } catch { return; }
          if (msg.type === "open") {
            const meta = classifyMemberStreamOpen({
              ownership: context.ownership,
              user,
              endpoint: msg.endpoint,
              payload: msg.payload
            });
            if (!meta) {
              context.audit.write("ws.member-stream-denied", { user: user.name, endpoint: msg.endpoint });
              if (downstream.readyState === downstream.OPEN) {
                downstream.send(JSON.stringify({ type: "error", streamId: msg.streamId, error: { name: "Error", message: "forbidden" } }));
              }
              return;
            }
            memberStreams.set(msg.streamId, meta);
          } else if (msg.type === "cancel" && typeof msg.streamId === "string" && !memberStreams.has(msg.streamId)) {
            return;
          }
        }
        const out = data.toString("utf8");
        if (upstream.readyState === WebSocket.OPEN) upstream.send(out); else pending.push(out);
      });
      upstream.on("message", (data, isBinary) => {
        if (isBinary) return;
        let frame;
        try { frame = JSON.parse(data.toString("utf8")); } catch { return; }
        if (user.role === "member" && stream === "remote") {
          if (frame.type === "item" && typeof frame.streamId === "string") {
            const meta = memberStreams.get(frame.streamId);
            if (meta === undefined) return;
            const verdict = filterMemberStreamItem({
              config: context.config,
              ownership: context.ownership,
              user,
              stream: meta,
              frame,
              onUnknown: type => context.audit.write("ws.frame-dropped", { user: user.name, stream, frameType: type })
            });
            if (!verdict.pass) {
              context.audit.write("ws.frame-dropped", { user: user.name, stream, frameType: frame?.value?.type || "unknown" });
              return;
            }
            downstream.send(JSON.stringify(verdict.frame));
            return;
          }
          if ((frame.type === "end" || frame.type === "error") && typeof frame.streamId === "string") {
            if (memberStreams.has(frame.streamId)) downstream.send(JSON.stringify(frame));
            return;
          }
          return;
        }
        downstream.send(data.toString("utf8"));
      });
      downstream.on("close", () => upstream.close());
      upstream.on("close", () => downstream.close());
    });
  });

  await new Promise((resolve) => { server.listen(config.listenPort, config.listenHost, () => { resolve(undefined) }) });
  const proto = config.tls && config.tls.enabled ? "https" : "http";
  console.log(`dsh-team-hub listening on ${proto}://${config.listenHost}:${config.listenPort}`);
  console.log(`Admin console: ${proto}://${config.listenHost}:${config.listenPort}/admin`);
}
