import { SessionStore, sessionsPath } from "./session-store.mjs";

export { sessionsPath, SessionStore };

/**
 * 单例管理字典（按 home 目录缓存 SessionStore 实例）
 * @type {Map<string, SessionStore>}
 */
const stores = new Map();

/**
 * 获取或创建指定 home 的 SessionStore
 * @param {string} home
 * @param {object} [options]
 * @returns {SessionStore}
 */
export function getSessionStore(home, options = {}) {
  let store = stores.get(home);
  if (!store) {
    store = new SessionStore(home, options);
    stores.set(home, store);
  }
  return store;
}

/**
 * 重置/清理 SessionStore 单例（主要用于测试）
 * @param {string} [home]
 */
export function resetSessionStores(home) {
  if (home) {
    const s = stores.get(home);
    if (s) {
      s.stopCleanupTimer();
      stores.delete(home);
    }
  } else {
    for (const s of stores.values()) {
      s.stopCleanupTimer();
    }
    stores.clear();
  }
}

/**
 * 兼容旧接口：从持久化存储加载 sessions 对象
 * @param {string} home
 * @returns {Record<string, { username: string, createdAt: string, expiresAt: string }>}
 */
export function loadSessions(home) {
  const store = getSessionStore(home);
  const out = {};
  for (const [token, entry] of store._sessions.entries()) {
    out[token] = { ...entry };
  }
  return out;
}

/**
 * 兼容旧接口：保存 sessions 对象到持久化存储
 * @param {string} home
 * @param {Record<string, any>} sessions
 */
export function saveSessions(home, sessions) {
  const store = getSessionStore(home);
  store._sessions.clear();
  for (const [token, entry] of Object.entries(sessions || {})) {
    store._sessions.set(token, entry);
  }
  store.saveSync();
}

/**
 * 签发 session（支持同步或异步消费）
 * @param {string} home
 * @param {string} username
 * @param {number} [ttlMs]
 * @returns {{ token: string, username: string, createdAt: string, expiresAt: string }}
 */
export function issueSession(home, username, ttlMs = 1000 * 60 * 60 * 24 * 14) {
  const store = getSessionStore(home);
  // 为保持向后兼容性（旧代码同步返回），同步写入内存并触发原子写
  const crypto = globalThis.crypto;
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const issuedToken = Buffer.from(rawBytes).toString("base64url");
  const now = Date.now();
  const entry = {
    username,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString()
  };
  store._sessions.set(issuedToken, entry);
  store._trimToCapacity();
  store.saveSync();
  return { token: issuedToken, ...entry };
}

/**
 * 解析并校验 session（纯内存操作，不触发磁盘读取）
 * @param {string} home
 * @param {string} token
 * @returns {{ username: string, createdAt: string, expiresAt: string } | null}
 */
export function resolveSession(home, token) {
  if (!token) return null;
  const store = getSessionStore(home);
  return store.resolve(token);
}

/**
 * 撤销 session
 * @param {string} home
 * @param {string} token
 * @returns {boolean}
 */
export function revokeSession(home, token) {
  if (!token) return false;
  const store = getSessionStore(home);
  if (!store._sessions.has(token)) return false;
  store._sessions.delete(token);
  store.saveSync();
  return true;
}

/**
 * 撤销指定用户的所有 session
 * @param {string} home
 * @param {string} username
 * @returns {number}
 */
export function revokeSessionsForUser(home, username) {
  if (!username) return 0;
  const store = getSessionStore(home);
  let count = 0;
  for (const [token, entry] of store._sessions.entries()) {
    if (entry.username === username) {
      store._sessions.delete(token);
      count++;
    }
  }
  if (count > 0) {
    store.saveSync();
  }
  return count;
}

/**
 * 解析 Cookie 头部
 * @param {import("node:http").IncomingMessage} req
 * @returns {Record<string, string>}
 */
export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
