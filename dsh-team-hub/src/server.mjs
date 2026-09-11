import http from "node:http";
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

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ADMIN_UI = path.join(ROOT, "admin-ui");
const COOKIE = "dsh_team_hub_session";
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "host", "content-length", "content-encoding"]);

// 插件注册的宿主级 HTTP 路由：只对 admin 开放（GET/POST/WS 全拦）。
// 精确匹配或路径边界匹配，避免误伤 /api/events.mux 等核心路由。
const ADMIN_ONLY_ROUTE_PREFIXES = [
  "/api/task-board",
  "/api/dsh-ssh",
  "/api/dsh-skill-explorer",
  "/api/pair",
  "/api/approvals",
  "/api/events", // dsh-remote-web-ui 的 SSE（注意不带 .mux/.host 后缀）
];

function isAdminOnlyRoute(pathname) {
  return ADMIN_ONLY_ROUTE_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"));
}

function send(res, status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json", ...headers });
  res.end(text);
}

async function collect(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
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

async function proxyRequest(config, req, res, { bodyOverride, injectShim = false } = {}) {
  const upstream = new URL(config.upstream);
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) if (!HOP_BY_HOP.has(key)) headers[key] = value;
  headers.host = upstream.host;
  // DSH 的自定义路由（如插件注册的 /api/task-board/state）会校验 Origin。
  // 上游只接受自己的源——网关已做认证，这里把 Origin/Referer 统一改写成上游源。
  headers.origin = upstream.origin;
  if (typeof headers.referer === "string") {
    const reqOrigin = new URL(req.url, "http://local").origin;
    headers.referer = headers.referer.replace(/^https?:\/\/[^/]+/, upstream.origin);
  }
  const body = bodyOverride !== undefined ? bodyOverride : ["GET", "HEAD"].includes(req.method) ? undefined : await collect(req);
  // 网关注入的缓存破坏参数（thub）只对浏览器有意义，转发上游前剥掉。
  // 注意：不能用 URL/URLSearchParams——combo 路径里的 `??` 会被重编码为 %3F，
  // 上游路由不认（实测 404）。纯字符串剥离。
  const targetUrl = config.upstream + req.url.replace(new RegExp(`[&?]${CACHE_BUST_PARAM}=[^&]*`), "");
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
  for (const [key, value] of response.headers.entries()) if (!HOP_BY_HOP.has(key)) outHeaders[key] = value;
  let out = Buffer.from(await response.arrayBuffer());
  if (injectShim && (outHeaders["content-type"] || "").includes("text/html")) {
    out = Buffer.from(injectSpaShim(out.toString("utf8")));
    delete outHeaders["content-length"];
    // SPA 页不缓存：保证成员总能拿到最新的（带缓存破坏参数的）combo URL
    outHeaders["cache-control"] = "no-store";
  }
  // 设置页修复：对 JS 响应做 in-flight 转换（settings 强制 host 模式）。
  // 只改发往浏览器的字节；Desktop 磁盘与 rev 哈希管线零接触（白屏教训）。
  if ((outHeaders["content-type"] || "").includes("javascript")) {
    const transformed = transformSettingsHostMode(out, outHeaders["content-encoding"]);
    if (transformed !== null) {
      out = transformed.body;
      if (!transformed.keepEncoding) delete outHeaders["content-encoding"];
      delete outHeaders["content-length"];
    }
  }
  res.writeHead(response.status, outHeaders);
  res.end(out);
}

function rpcError(res, rpcId, code, message, status = 200) {
  // DSH 客户端只认识固定的错误码集合；自定义码（如 forbidden）会让客户端
  // 连错误信封都解析不了，直接弹 zod 原始错误。统一映射为 internal，消息保留。
  // Desktop 客户端严格校验失败信封：code/message 字符串 + details 必须是对象
  // （缺 details 会抛 "connection: invalid server-response failure"）。
  const CLIENT_CODES = new Set(["bad-request", "cancelled", "session-not-found", "model-unavailable", "session-conflict", "workspace-not-found", "workspace-invalid-path", "internal"]);
  const safeCode = CLIENT_CODES.has(code) ? code : "internal";
  send(res, status, { type: "server-response", rpcId, result: { ok: false, error: { code: safeCode, message, details: {} } } });
}

async function refreshOwnership(context) {
  try {
    // Desktop 无 workspace.list：从 session/list 的 cwd 学习会话归属。
    const sessions = await upstreamRpc(context.config, "session/list", { args: { _request: {} } });
    for (const row of sessions.items || []) {
      learnSession(context.config, context.ownership, row.sessionId, row.cwd, row.parentSessionId);
    }
    return true;
  } catch (error) {
    context.audit.write("system.ownership-refresh-failed", { error: error.message });
    return false;
  }
}

async function ensureMemberWorkspaces(context) {
  for (const user of context.config.users) {
    if (user.role !== "member" || (user.status || "active") !== "active") continue;
    const root = path.join(context.config.workspaceRoot, user.name);
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const existing = [...context.ownership.workspaceOwner.entries()].find(([, owner]) => owner === user.name);
    if (existing) continue;
    try {
      const created = await upstreamRpc(context.config, "workspace/create", { args: { request: { path: root } } });
      const view = created?.workspace;
      learnWorkspace(context.config, context.ownership, view);
      if (view && view.title !== user.name) {
        await upstreamRpc(context.config, "workspace/rename", { args: { request: { workspaceId: view.workspaceId, title: user.name } } });
      }
      context.audit.write("workspace.created", { user: user.name });
    } catch (error) {
      context.audit.write("workspace.create-failed", { user: user.name, error: error.message });
    }
  }
}

async function handleApiPost(context, user, req, res, method) {
  const raw = await collect(req);
  let message;
  try { message = JSON.parse(raw.toString("utf8")); } catch { return rpcError(res, null, "bad-request", "invalid JSON", 400); }
  const { rpcId, payload } = message;
  if (user.role === "admin") return proxyRequest(context.config, req, res, { bodyOverride: raw });
  const guard = guardMemberRequest({ config: context.config, ownership: context.ownership, user, method, payload });
  if (!guard.ok) {
    context.audit.write("policy.denied", { user: user.name, method, reason: guard.message });
    return rpcError(res, rpcId, "forbidden", guard.message);
  }
  const upstream = new URL(context.config.upstream);
  const response = await fetch(`${context.config.upstream}/api/${method}`, {
    method: "POST",
    headers: withBridge({ "content-type": "application/json", host: upstream.host }, context.config),
    body: JSON.stringify({ ...message, payload: { args: guard.args } })
  });
  const body = await response.json();
  if (body.result?.ok) body.result.value = filterMemberResponse({ ownership: context.ownership, user, method, value: body.result.value });
  context.audit.write("policy.allowed", { user: user.name, method });
  send(res, response.status, body, { "content-type": "application/json" });
}

async function handleAdminApi(context, req, res, pathname, query) {
  const api = context.adminApi;
  if (req.method === "GET" && pathname === "/overview") return send(res, 200, api.overview());
  if (req.method === "GET" && pathname === "/users") return send(res, 200, api.users());
  if (req.method === "POST" && pathname === "/users") {
    const body = JSON.parse((await collect(req)).toString("utf8") || "{}");
    return send(res, 200, api.createUser(body));
  }
  const statusMatch = pathname.match(/^\/users\/([^/]+)\/status$/);
  if (req.method === "POST" && statusMatch) {
    const body = JSON.parse((await collect(req)).toString("utf8") || "{}");
    return send(res, 200, api.setUserStatus(decodeURIComponent(statusMatch[1]), body.status));
  }
  const resetMatch = pathname.match(/^\/users\/([^/]+)\/reset-password$/);
  if (req.method === "POST" && resetMatch) return send(res, 200, api.resetPassword(decodeURIComponent(resetMatch[1])));
  const nameMatch = pathname.match(/^\/users\/([^/]+)\/display-name$/);
  if (req.method === "POST" && nameMatch) {
    const body = JSON.parse((await collect(req)).toString("utf8") || "{}");
    return send(res, 200, api.setDisplayName(decodeURIComponent(nameMatch[1]), body.displayName));
  }
  if (req.method === "GET" && pathname === "/workspaces") return send(res, 200, api.workspaces());
  if (req.method === "GET" && pathname === "/debug/ownership") return send(res, 200, api.ownershipDebug());
  if (req.method === "GET" && pathname === "/audit") return send(res, 200, api.audit({ limit: Number(query.get("limit") || 200), user: query.get("user"), type: query.get("type") }));
  if (req.method === "GET" && pathname === "/system") return send(res, 200, { upstream: context.config.upstream, users: context.config.users.length, node: process.version });
  if (req.method === "POST" && pathname === "/selftest") return send(res, 200, await compatibilityReport(context.config));
  send(res, 404, { error: "not found" });
}

function serveAdminUi(res, pathname) {
  const file = pathname === "/" || pathname === "/index.html" ? "index.html" : pathname.slice(1);
  const target = path.resolve(ADMIN_UI, file);
  if (!target.startsWith(ADMIN_UI) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return false;
  const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
  // readFileSync 返回 Buffer，send() 会对非 string body 走 JSON.stringify，
  // 导致 admin 页面返回 {"type":"Buffer","data":[...]} 而不是 HTML（Issue #1）。
  // 显式读成 utf8 字符串，让 send 按文本发送。
  send(res, 200, fs.readFileSync(target, "utf8"), { "content-type": type + "; charset=utf-8" });
  return true;
}

export async function startServer() {
  const { home, file: configFile, config } = loadConfig();
  // 进程级崩溃防护：未捕获异常记录日志而不退出进程。
  // node 默认 uncaughtException 会直接终止——一次上游响应体超时（undici
  // UND_ERR_BODY_TIMEOUT）就会断开所有成员的连接（实测崩溃过一次）。
  const crashGuard = (kind) => (error) => {
    try {
      fs.appendFileSync(path.join(home, "logs", "crash.log"), `${new Date().toISOString()} [${kind}] ${error?.stack || error}\n`);
    } catch { /* 日志写不进去也不能再抛 */ }
  };
  process.on("uncaughtException", crashGuard("uncaughtException"));
  process.on("unhandledRejection", crashGuard("unhandledRejection"));
  let configMtime = fs.statSync(configFile).mtimeMs;
  const context = {
    home,
    config,
    ownership: createOwnership(),
    audit: new AuditLog(home),
    adminApi: null
  };
  // CLI（user add/disable 等）直接改 config.json；运行中的网关需要在下次请求时感知。
  let ensuring = false;
  function reloadConfigIfChanged() {
    try {
      const mtime = fs.statSync(configFile).mtimeMs;
      if (mtime === configMtime) return;
      configMtime = mtime;
      context.config = loadConfig(home).config;
      context.audit.write("system.config-reloaded", {});
      // 新增的成员需要就地建工作区，否则要等下次重启
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
  // 远程设置补丁：对 DSH Desktop 会破坏 UI（白屏实测），已默认禁用。
  // 仅当 config.enableSettingsPatch === true 且上游是 standalone dsh web 时才执行。
  // Desktop 场景绝不写 DSH 安装目录。
  try {
    const dshRoot = context.config.enableSettingsPatch === true ? findDshRoot(context.config.dshRoot) : null;
    if (dshRoot) {
      const result = applySettingsPatch(dshRoot);
      if (result === "applied") context.audit.write("system.settings-patch-applied", { dshRoot });
      else if (result === "missing") context.audit.write("system.settings-patch-missing", { dshRoot });
    } else {
      context.audit.write("system.settings-patch-skipped", { reason: context.config.enableSettingsPatch === true ? "dsh root not found" : "disabled (Desktop safe mode)" });
    }
  } catch (error) {
    context.audit.write("system.settings-patch-error", { error: error.message });
  }

  // 启动时上游可能还没就绪（比如同时重启）：后台重试直到同步成功；
  // 之后每 5 分钟兜底重同步一次，防止事件丢失导致归属表漂移。
  const syncOwnership = async () => {
    if (await refreshOwnership(context)) await ensureMemberWorkspaces(context);
  };
  await syncOwnership();
  if (context.ownership.workspaceOwner.size === 0) {
    const retry = setInterval(async () => {
      if (await refreshOwnership(context)) {
        clearInterval(retry);
        await ensureMemberWorkspaces(context);
        context.audit.write("system.ownership-refresh-recovered", {});
      }
    }, 3000);
    retry.unref?.();
  }
  const periodic = setInterval(() => { syncOwnership(); }, 5 * 60 * 1000);
  periodic.unref?.();

  const server = http.createServer(async (req, res) => {
    try {
      reloadConfigIfChanged();
      const url = new URL(req.url, "http://local");
      const cookies = parseCookies(req);
      const session = resolveSession(home, cookies[COOKIE]);
      const user = session && context.config.users.find(u => u.name === session.username && (u.status || "active") === "active");

      if (url.pathname === "/login" && req.method === "GET") return send(res, 200, loginPage(url.searchParams.get("next") || "/"), { "content-type": "text/html; charset=utf-8" });
      if (url.pathname === "/login" && req.method === "POST") {
        const form = new URLSearchParams((await collect(req)).toString("utf8"));
        const found = authenticate(context.config, String(form.get("username") || ""), String(form.get("password") || ""));
        if (!found) {
          context.audit.write("auth.login-failed", { user: String(form.get("username") || "") });
          return send(res, 401, loginPage(String(form.get("next") || "/"), "用户名或密码错误"), { "content-type": "text/html; charset=utf-8" });
        }
        const issued = issueSession(home, found.name);
        context.audit.write("auth.login", { user: found.name });
        const next = found.mustChangePassword ? "/change-password" : String(form.get("next") || "/");
        return send(res, 302, "", { location: next, "set-cookie": `${COOKIE}=${encodeURIComponent(issued.token)}; Path=/; HttpOnly; SameSite=Lax` });
      }
      if (url.pathname === "/logout") {
        revokeSession(home, cookies[COOKIE]);
        context.audit.write("auth.logout", { user: session?.username || "" });
        return send(res, 302, "", { location: "/login", "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
      }
      if (!user) {
        if (url.pathname.startsWith("/api/")) return rpcError(res, null, "unauthorized", "not logged in", 401);
        return send(res, 302, "", { location: "/login?next=" + encodeURIComponent(req.url) });
      }
      if (url.pathname === "/__teamhub/whoami") {
        return send(res, 200, { name: user.name, displayName: user.displayName || user.name, role: user.role });
      }
      if (user.mustChangePassword && url.pathname !== "/change-password") return send(res, 302, "", { location: "/change-password" });
      if (url.pathname === "/change-password") {
        if (req.method === "GET") return send(res, 200, changePasswordPage(), { "content-type": "text/html; charset=utf-8" });
        const form = new URLSearchParams((await collect(req)).toString("utf8"));
        try {
          changePassword(context.config, user.name, String(form.get("current") || ""), String(form.get("next") || ""));
          saveConfig(home, context.config);
          context.audit.write("auth.password-changed", { user: user.name });
          return send(res, 302, "", { location: "/" });
        } catch (error) { return send(res, 400, changePasswordPage(error.message), { "content-type": "text/html; charset=utf-8" }); }
      }
      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
        if (user.role !== "admin") return send(res, 403, "admin only");
        // 无尾斜杠的 /admin 统一 302 到 /admin/：index.html 里的资源用绝对路径
        // /admin/... 引用，若直接服务 /admin 会导致相对解析错位（Issue #1 二次修复）。
        if (url.pathname === "/admin") return send(res, 302, "", { location: "/admin/" });
        return serveAdminUi(res, url.pathname.slice("/admin".length)) || send(res, 404, "not found");
      }
      if (url.pathname.startsWith("/__teamhub/api/")) {
        if (user.role !== "admin") return send(res, 403, { error: "admin only" });
        return handleAdminApi(context, req, res, url.pathname.slice("/__teamhub/api".length), url.searchParams);
      }
      if (user.role !== "admin" && isAdminOnlyRoute(url.pathname)) {
        context.audit.write("policy.denied", { user: user.name, method: "route:" + url.pathname, reason: "插件宿主路由仅 admin 可用" });
        return send(res, 403, { error: "admin only" });
      }
      if (url.pathname.startsWith("/api/") && req.method === "POST") return handleApiPost(context, user, req, res, url.pathname.slice("/api/".length));
      return proxyRequest(context.config, req, res, { injectShim: url.pathname === "/" || url.pathname === "/index.html" });
    } catch (error) {
      context.audit.write("system.request-error", { error: error.message });
      send(res, 500, { error: error.message });
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", async (req, socket, head) => {
    reloadConfigIfChanged();
    const cookies = parseCookies(req);
    const session = resolveSession(home, cookies[COOKIE]);
    const user = session && context.config.users.find(u => u.name === session.username && (u.status || "active") === "active");
    if (!user) { socket.destroy(); return; }
    const url = new URL(req.url, "http://local");
    // Desktop 的事件流端点是 /api/remote.mux（Typert Remote 流复用），
    // 与 standalone dsh web 的 /api/events.mux|host 不同。admin 直通转发原始帧；
    // member 需按流过滤（阶段 2），当前拒绝。
    const stream = url.pathname === "/api/events.mux" ? "mux"
      : url.pathname === "/api/events.host" ? "host"
      : url.pathname === "/api/remote.mux" ? "remote"
      : null;
    if (!stream) { socket.destroy(); return; }
    if (user.mustChangePassword) { socket.destroy(); return; }
    // Desktop 部署只有 /api/remote.mux 存在；legacy mux/host 仅 admin 直通（上游不存在自然失败）。
    if (stream !== "remote" && user.role !== "admin") {
      context.audit.write("ws.legacy-stream-member-denied", { user: user.name, stream });
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, downstream => {
      const upstreamUrl = new URL(context.config.upstream);
      upstreamUrl.protocol = upstreamUrl.protocol === "https:" ? "wss:" : "ws:";
      upstreamUrl.pathname = url.pathname;
      // Desktop 的 WS 升级同样过 browser-auth cookie 墙：握手头带 host + 签名 cookie
      const wsHeaders = { host: upstreamUrl.host };
      const bridge = withBridge({}, context.config);
      if (bridge.cookie) wsHeaders.cookie = bridge.cookie;
      const upstream = new WebSocket(upstreamUrl, { headers: wsHeaders });
      const pending = [];
      // member 的流授权表：streamId -> {kind, sessionId?}（remote.mux 专用）
      const memberStreams = new Map();
      upstream.on("error", () => { context.audit.write("ws.upstream-error", { stream }); downstream.close(); });
      upstream.on("unexpected-response", () => {
        context.audit.write("ws.upstream-rejected", { stream });
        resetBridge();
        downstream.close();
      });
      upstream.on("open", () => {
        context.audit.write("ws.upstream-open", { stream });
        pending.splice(0).forEach(data => upstream.send(data));
      });
      // 注意：DSH 协议全部使用文本帧。ws 库 send(Buffer) 会发二进制帧，
      // DSH 客户端会把二进制帧当作畸形帧丢弃——必须按原始帧类型转发。
      downstream.on("message", (data, isBinary) => {
        if (isBinary) return;
        let msg;
        try { msg = JSON.parse(data.toString("utf8")); } catch { return; }
        if (user.role === "member" && stream === "remote") {
          // 开流守卫：$events / session/control 全局流放行（帧级再过滤），
          // session/follow 按 address 归属授权，其余一律拒绝。
          if (msg.type === "open" && typeof msg.streamId === "string" && typeof msg.endpoint === "string") {
            const meta = classifyMemberStreamOpen({ ownership: context.ownership, user, endpoint: msg.endpoint, payload: msg.payload });
            if (!meta) {
              context.audit.write("ws.stream-open-denied", { user: user.name, endpoint: msg.endpoint });
              if (downstream.readyState === downstream.OPEN) {
                downstream.send(JSON.stringify({ type: "error", streamId: msg.streamId, error: { name: "Error", message: "forbidden" } }));
              }
              return;
            }
            memberStreams.set(msg.streamId, meta);
          } else if (msg.type === "cancel" && typeof msg.streamId === "string" && !memberStreams.has(msg.streamId)) {
            return; // 未授权流：静默丢弃
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
            if (meta === undefined) return; // 未授权流：丢弃
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
          return; // 其余帧类型对成员默认丢弃
        }
        downstream.send(data.toString("utf8"));
      });
      downstream.on("close", () => upstream.close());
      upstream.on("close", () => downstream.close());
    });
  });

  await new Promise(resolve => server.listen(config.listenPort, config.listenHost, resolve));
  console.log(`dsh-team-hub listening on http://${config.listenHost}:${config.listenPort}`);
  console.log(`Admin console: http://${config.listenHost}:${config.listenPort}/admin`);
}
