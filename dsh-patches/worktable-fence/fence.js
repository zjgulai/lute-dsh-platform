/**
 * LUTE worktable 信任栅栏（fence）——由 dsh-patches/worktable-fence/apply.mjs 注入到
 * vendor/dsh-worktable/01_content/lib/index.js 的**最前面**，并把 apply() 里把 ctx.webServer
 * 赋给局部变量 webServer 的那一行，换成经 __wtFence 包装后的版本（见 ANCHOR / ANCHOR_PATCHED）。
 *
 * 为什么需要它（上游 v0.3.3 的行为，逐条读 src/index.ts 取证）：
 *   9 条入口原样不校验来源。回环监听 ≠ 可信——DNS rebinding 绕过 Host 判据、
 *   跨站请求带 Sec-Fetch-Site: cross-site、**浏览器不对 WebSocket 施加同源策略**
 *   （任意网页都能开 ws://127.0.0.1:<port>/api/worktable/term）。且 /write 是任意文件写入
 *   （writeFile 会创建 → 写 ~/.zshrc 即 RCE）、/file 是任意文件读取（按扩展名回 text/html
 *   → 本机 origin 上的存储型 XSS）、/term 直接 spawn 交互式 shell。
 *
 * 两道防线：
 *  ① 请求级栅栏 —— socket 回环 + Host 回环 + sec-fetch-site 非 cross-site + Origin 与 Host 同源。
 *     HTTP 允许 Origin 缺失（curl 等非浏览器客户端）；**WebSocket 要求 Origin 必须存在**，
 *     因为浏览器必然发送它，而对 WS 而言 Origin 是唯一的跨源防线。
 *     显式 `Origin: null`（沙箱 iframe / file:// 页面）一律拒绝——它能被攻击者制造。
 *  ② 允许根约束 —— /file /site /write /mkdir /fs /git 的**客户端可控路径**解析后必须落在
 *     允许根之内（家目录 / 临时目录 / DSH 家目录）。挡的是「栅栏被绕过之后还能碰到什么」。
 *
 * 注入方式使它**不可回避**：包住整个 webServer 对象后，apply() 里所有 register /
 * registerUpgrade 调用自动过栅栏，新增路由也默认被覆盖（fail-closed）。
 *
 * 红线：本文件是**源**。不要改 vendor 里那份被注入的副本——改这里再跑 apply.mjs。
 * 所有标识符带 __wt 前缀，避免与被注入 bundle 的顶层名冲突。
 */
import { homedir as __wtHomedir, tmpdir as __wtTmpdir } from "node:os";
import { realpathSync as __wtRealpathSync } from "node:fs";
import { basename as __wtBasename, dirname as __wtDirname, resolve as __wtPathResolve, sep as __wtSep } from "node:path";

/** 栅栏版本（写进日志与拒绝体，便于确认线上跑的是哪一版）。 */
const __WT_FENCE_VERSION = "1";

/* ── ① 请求级栅栏 ────────────────────────────────────────────────────────── */

/** RFC 5735 的 127/8：四段十进制、首段 127。 */
function __wtIPv4Loopback(value) {
  const parts = String(value).split(".");
  return parts.length === 4
    && parts[0] === "127"
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** socket 远端地址是否属于回环段（127/8、::1、IPv4-mapped ::ffff:127/8）。 */
function __wtLoopbackAddress(address) {
  if (typeof address !== "string" || address === "") return false;
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) return __wtIPv4Loopback(normalized.slice("::ffff:".length));
  return __wtIPv4Loopback(normalized);
}

/** 主机名是否属于回环权威（localhost、[::1]、127/8）。 */
function __wtLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  return __wtIPv4Loopback(hostname);
}

/**
 * Origin 头的三态。**必须区分「缺失」与「显式 null」**：前者是 curl 这类非浏览器客户端，
 * 后者是沙箱 iframe 与 file:// 页面——攻击者能制造后者，所以只有前者可以在 HTTP 上放行。
 */
function __wtOriginState(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return { kind: "absent" };
  if (origin === "null") return { kind: "null" };
  try {
    return { kind: "host", host: new URL(origin).host };
  } catch {
    return { kind: "bad" };
  }
}

/**
 * 请求级判据。返回 null = 放行；返回字符串 = 拒绝原因。
 * @param {boolean} requireOrigin WebSocket 传 true（浏览器必然发 Origin，缺失即非浏览器/伪造）。
 */
function __wtFenceRequest(req, requireOrigin) {
  const socket = req && req.socket;
  if (!__wtLoopbackAddress(socket && socket.remoteAddress)) return "socket-not-loopback";

  const host = req.headers.host;
  if (typeof host !== "string" || host === "") return "missing-host";
  let hostUrl;
  try {
    hostUrl = new URL("http://" + host);
  } catch {
    return "bad-host";
  }
  if (!__wtLoopbackHostname(hostUrl.hostname)) return "host-not-loopback";

  // 浏览器同源标记：cross-site 直接拒（挡网页 CSRF，DNS rebinding 也过不了这一段）。
  if (req.headers["sec-fetch-site"] === "cross-site") return "cross-site";

  const origin = __wtOriginState(req);
  if (origin.kind === "host") return origin.host === hostUrl.host ? null : "origin-mismatch";
  if (origin.kind === "absent") return requireOrigin ? "missing-origin" : null;
  return origin.kind === "null" ? "null-origin" : "bad-origin";
}

/* ── ② 允许根约束 ────────────────────────────────────────────────────────── */

/**
 * 解析出「最深的已存在祖先的真实路径 + 剩余尾巴」。
 * 必须是真实路径：macOS 上 /tmp → /private/tmp、/var → /private/var，不做 realpath 会误判。
 * 目标文件可能还不存在（/write 创建新文件），所以不能直接 realpath 目标本身。
 */
function __wtResolveForCheck(target) {
  const absolute = __wtPathResolve(target);
  let probe = absolute;
  const tail = [];
  for (;;) {
    try {
      const real = __wtRealpathSync(probe);
      return tail.length === 0 ? real : __wtPathResolve(real, ...tail);
    } catch {}
    const parent = __wtDirname(probe);
    if (parent === probe) return null; // 走到文件系统根仍无法解析
    tail.unshift(__wtBasename(probe));
    probe = parent;
  }
}

/** 允许根集合：家目录 / 临时目录 / DSH 家目录（后者用守卫引用，改名也不会抛）。 */
function __wtAllowedRoots() {
  const roots = [];
  const push = (candidate) => {
    if (typeof candidate !== "string" || candidate === "") return;
    const real = __wtResolveForCheck(candidate);
    if (real !== null && !roots.includes(real)) roots.push(real);
  };
  try { push(__wtHomedir()); } catch {}
  try { push(__wtTmpdir()); } catch {}
  try {
    // baseDshHome 是 bundle 顶层的函数声明；用 typeof 守卫，改名后安全退化为「不加入该根」。
    if (typeof baseDshHome === "function") push(baseDshHome());
  } catch {}
  return roots;
}

/** 目标路径是否落在任一允许根之内（含相等）。 */
function __wtWithinRoots(target, roots) {
  const real = __wtResolveForCheck(target);
  if (real === null) return false;
  for (const raw of roots) {
    // 根自己也要归一：调用方可能传未解析的路径（macOS 上 /tmp 与 /private/tmp 是两个串，
    // 只归一目标不归一根本来就会假拒）。之前这条契约靠调用方自觉，收进函数内更稳。
    const root = __wtResolveForCheck(raw);
    if (root === null) continue;
    if (real === root) return true;
    const prefix = root.endsWith(__wtSep) ? root : root + __wtSep;
    if (real.startsWith(prefix)) return true;
  }
  return false;
}

/* ── 拒绝 ────────────────────────────────────────────────────────────────── */

function __wtLog(ctx, reason, detail) {
  try {
    ctx?.logger?.warn?.(`[dsh-worktable][lute-fence v${__WT_FENCE_VERSION}] denied: ${reason}${detail ? " · " + detail : ""}`);
  } catch {}
}

function __wtRejectResponse(res, reason, ctx, detail) {
  __wtLog(ctx, reason, detail);
  try {
    res.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "worktable fence: denied", reason }));
  } catch {}
}

/** WebSocket 升级在握手期拒绝：回 403 后立刻断链，不进 ws 处理。 */
function __wtRejectSocket(socket, reason, ctx, detail) {
  __wtLog(ctx, reason, detail);
  try {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  } catch {}
  try {
    socket.destroy();
  } catch {}
}

/* ── 路由包装 ────────────────────────────────────────────────────────────── */

/** 需要读请求体做根约束的路由（客户端路径来自 body.path / body.cwd）。 */
const __WT_BODY_ROUTES = new Set([
  "/api/worktable/fs",
  "/api/worktable/git",
  "/api/worktable/write",
  "/api/worktable/mkdir",
]);

/**
 * 先缓冲请求体再交还：handler 内部的 readJsonBody 会 `for await (const c of req)`，
 * 我们用自有 Symbol.asyncIterator 把缓冲重放出去，语义等价且不改上游 handler。
 */
async function __wtReadBody(req) {
  const chunks = [];
  try {
    for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  } catch {}
  const buffer = Buffer.concat(chunks);
  try {
    req[Symbol.asyncIterator] = async function* replay() {
      if (buffer.length > 0) yield buffer;
    };
  } catch {}
  try {
    return JSON.parse(buffer.toString("utf8") || "{}");
  } catch {
    return {};
  }
}

/** 客户端可控路径：write/mkdir 用 path，fs/git 用 path 或 cwd。 */
function __wtClientPaths(body) {
  const out = [];
  if (body && typeof body.path === "string" && body.path) out.push(body.path);
  if (body && typeof body.cwd === "string" && body.cwd) out.push(body.cwd);
  return out;
}

/** GET /file 的 ?path= 与 prefix /site 的根 token。 */
function __wtRequestPaths(path, req) {
  let url;
  try {
    url = new URL(req.url ?? "/", "http://dsh.internal");
  } catch {
    return [];
  }
  if (path === "/api/worktable/file") {
    const p = url.searchParams.get("path");
    return p ? [p] : [];
  }
  if (path === "/api/worktable/site") {
    const seg = url.pathname.slice("/api/worktable/site".length).split("/").filter(Boolean)[0];
    if (!seg) return [];
    try {
      return [decodeURIComponent(seg)];
    } catch {
      return [seg];
    }
  }
  return [];
}

/** 包装一条 HTTP 路由：请求级栅栏 → 客户端路径根约束 → 原 handler。 */
function __wtFenceRoute(route, ctx) {
  const inner = route && typeof route.handler === "function" ? route.handler : null;
  if (inner === null) return route;
  const path = typeof route.path === "string" ? route.path : "";
  const roots = __wtAllowedRoots();

  return {
    ...route,
    handler: async (req, res) => {
      const denied = __wtFenceRequest(req, false);
      if (denied !== null) {
        __wtRejectResponse(res, denied, ctx, path);
        return;
      }
      const candidates = __WT_BODY_ROUTES.has(path)
        ? __wtClientPaths(await __wtReadBody(req))
        : __wtRequestPaths(path, req);
      for (const candidate of candidates) {
        if (!__wtWithinRoots(candidate, roots)) {
          __wtRejectResponse(res, "path-outside-allowed-roots", ctx, `${path} · ${candidate}`);
          return;
        }
      }
      return inner(req, res);
    },
  };
}

/** 包装一条 WebSocket 升级路由：Origin 必须存在且与 Host 同源。 */
function __wtFenceUpgrade(route, ctx) {
  const inner = route && typeof route.handler === "function" ? route.handler : null;
  if (inner === null) return route;
  const path = typeof route.path === "string" ? route.path : "";

  return {
    ...route,
    handler: (req, socket, head) => {
      const denied = __wtFenceRequest(req, true);
      if (denied !== null) {
        __wtRejectSocket(socket, denied, ctx, path);
        return;
      }
      return inner(req, socket, head);
    },
  };
}

/**
 * 包住整个 webServer。register / registerUpgrade 一律经过栅栏，其余成员原样透传
 * （函数绑定到 target，避免 `this` 落到 Proxy 上）。
 * 幂等：已包过的对象带 __wtFenced 标记，重复调用返回原对象。
 */
function __wtFence(webServer, ctx) {
  if (!webServer || typeof webServer !== "object") return webServer;
  if (webServer.__wtFenced === true) return webServer;
  return new Proxy(webServer, {
    get(target, prop) {
      if (prop === "__wtFenced") return true;
      if (prop === "register") {
        return (route) => target.register(__wtFenceRoute(route, ctx));
      }
      if (prop === "registerUpgrade") {
        return (route) => target.registerUpgrade(__wtFenceUpgrade(route, ctx));
      }
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
