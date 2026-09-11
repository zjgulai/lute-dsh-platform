// 浏览器会话桥（Desktop 专用，零写入 DSH 安装目录）：
// 读 $DSH_HOME/.credentials.yaml 里 client-connection/browser-session 的签名密钥，
// 按 Desktop BrowserAuth 完全一致的算法铸造 upstream authority 的签名 cookie，
// 附加到所有上游请求（/api RPC、index、WebSocket 握手）。
// 永不修改 DSH 安装目录中的任何文件（settings 补丁路线已废弃，白屏教训）。
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";

const COOKIE_PREFIX = "dsh-auth-";
const PAYLOAD_VERSION = 1;
const DAY_MS = 86400000;
const WINDOW_DAYS = 29;         // Desktop 上限 cookieMaxAgeDays=30，留 1 天余量
const REFRESH_MARGIN_DAYS = 3;  // 距过期不足 3 天时自动重铸

export function b64url(buf) {
  return Buffer.from(buf).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function defaultCredentialsPath() {
  const home = process.env.DSH_HOME?.trim();
  if (home) return path.join(home, ".credentials.yaml");
  return path.join(homedir(), ".dsh", ".credentials.yaml");
}

/** 从凭据文件提取 browser-session 签名密钥（32 字节 base64url）。 */
export function loadBrowserSessionSecret(config = {}) {
  if (typeof config.browserSessionSecret === "string" && config.browserSessionSecret.length > 0) {
    const secret = Buffer.from(config.browserSessionSecret, "base64url");
    if (secret.byteLength === 32) return secret;
    throw new Error("browser-auth: config.browserSessionSecret must be a 32-byte base64url string");
  }
  const file = config.credentialsPath || defaultCredentialsPath();
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, "utf8");
  const match = text.match(/client-connection\/browser-session:[\s\S]*?secret:\s*["']?([A-Za-z0-9_-]+)["']?/);
  if (!match) return undefined;
  const secret = Buffer.from(match[1], "base64url");
  return secret.byteLength === 32 ? secret : undefined;
}

/** 铸造 authority 的签名会话 cookie（与 Desktop BrowserAuth.encodeCookie 一致）。 */
export function mintBrowserSessionCookie(secret, authority, now = Date.now()) {
  const issuedAt = now;
  const expiresAt = issuedAt + WINDOW_DAYS * DAY_MS;
  const payload = { version: PAYLOAD_VERSION, authority, issuedAt, expiresAt };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = b64url(createHmac("sha256", secret).update(body).digest());
  const name = COOKIE_PREFIX + b64url(createHash("sha256").update(authority).digest());
  return { name, value: `v1.${body}.${signature}`, expiresAt };
}

let cached = undefined;

/** 返回 upstream authority 的 cookie 头值；非 Desktop 上游（无凭据）返回 undefined。 */
export function bridgeCookieFor(config) {
  const authority = new URL(config.upstream).host;
  const secret = loadBrowserSessionSecret(config);
  if (secret === undefined) return undefined;
  if (
    cached !== undefined
    && cached.authority === authority
    && cached.expiresAt - Date.now() > REFRESH_MARGIN_DAYS * DAY_MS
  ) {
    return cached.header;
  }
  const minted = mintBrowserSessionCookie(secret, authority);
  cached = { authority, expiresAt: minted.expiresAt, header: `${minted.name}=${minted.value}` };
  return cached.header;
}

/** 上游 401（密钥轮换等）时强制下一请求重铸。 */
export function resetBridge() {
  cached = undefined;
}

/** 把桥 cookie 附加到已有 headers（保留调用方已设置的 cookie）。 */
export function withBridge(headers, config) {
  const bridge = bridgeCookieFor(config);
  if (bridge === undefined) return headers;
  return { ...headers, cookie: headers.cookie ? `${headers.cookie}; ${bridge}` : bridge };
}
