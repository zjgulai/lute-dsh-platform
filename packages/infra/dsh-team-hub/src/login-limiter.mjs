/**
 * @module login-rate-limiter
 * SEC-RT-009 登录抗暴力破解与指数退避限速器。
 *
 * 规格要求：
 * - 登录按 IP + username 独立及联合限速
 * - 失败达到阈值后进入指数退避（冷却期）
 * - 内存状态有界清理（防止海量伪造 IP/用户名造成内存泄露）
 */

export const MAX_ATTEMPTS = 5; // 允许连续失败的最大次数
export const BASE_BACKOFF_MS = 2000; // 基础退避时间 2s
export const MAX_BACKOFF_MS = 60 * 1000; // 最大退避时间 60s
export const MAX_TRACKED_ENTRIES = 10_000; // 内存追踪键容量上限
export const ENTRY_TTL_MS = 15 * 60 * 1000; // 15 分钟无活动条目清理

export class LoginRateLimiter {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
    this.baseBackoffMs = options.baseBackoffMs ?? BASE_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? MAX_BACKOFF_MS;
    this.maxEntries = options.maxEntries ?? MAX_TRACKED_ENTRIES;
    this.entryTtlMs = options.entryTtlMs ?? ENTRY_TTL_MS;

    /** @type {Map<string, { attempts: number, lastFailedAt: number, blockedUntil: number }>} */
    this._entries = new Map();
  }

  _key(ip, username) {
    const safeIp = String(ip || "unknown").trim();
    const safeUser = String(username || "unknown").trim().toLowerCase();
    return `${safeIp}:${safeUser}`;
  }

  _gc(now) {
    if (this._entries.size <= this.maxEntries) return;
    for (const [k, v] of this._entries.entries()) {
      if (now - v.lastFailedAt > this.entryTtlMs) {
        this._entries.delete(k);
      }
    }
    // 若仍超过最大上限，按最旧失败时间强制淘汰
    if (this._entries.size > this.maxEntries) {
      const sorted = Array.from(this._entries.entries()).sort((a, b) => a[1].lastFailedAt - b[1].lastFailedAt);
      const excess = this._entries.size - this.maxEntries;
      for (let i = 0; i < excess; i++) {
        this._entries.delete(sorted[i][0]);
      }
    }
  }

  /**
   * 检查是否被限制登录
   * @param {string} ip
   * @param {string} username
   * @param {number} [now]
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  check(ip, username, now = Date.now()) {
    const key = this._key(ip, username);
    const entry = this._entries.get(key);
    if (!entry) return { allowed: true, retryAfterMs: 0 };

    if (entry.blockedUntil > now) {
      return { allowed: false, retryAfterMs: entry.blockedUntil - now };
    }

    // 若已经过了封禁期，且距离上次失败已超过 TTL，自动重置
    if (now - entry.lastFailedAt > this.entryTtlMs) {
      this._entries.delete(key);
      return { allowed: true, retryAfterMs: 0 };
    }

    return { allowed: true, retryAfterMs: 0 };
  }

  /**
   * 记录一次登录失败
   * @param {string} ip
   * @param {string} username
   * @param {number} [now]
   * @returns {{ blocked: boolean, retryAfterMs: number, attempts: number }}
   */
  recordFailure(ip, username, now = Date.now()) {
    this._gc(now);
    const key = this._key(ip, username);
    let entry = this._entries.get(key);
    if (!entry || (now - entry.lastFailedAt > this.entryTtlMs)) {
      entry = { attempts: 0, lastFailedAt: now, blockedUntil: 0 };
      this._entries.set(key, entry);
    }

    entry.attempts += 1;
    entry.lastFailedAt = now;

    if (entry.attempts >= this.maxAttempts) {
      // 指数退避: baseBackoff * 2^(attempts - maxAttempts)
      const exponent = entry.attempts - this.maxAttempts;
      const backoff = Math.min(this.baseBackoffMs * Math.pow(2, exponent), this.maxBackoffMs);
      entry.blockedUntil = now + backoff;
      return { blocked: true, retryAfterMs: backoff, attempts: entry.attempts };
    }

    return { blocked: false, retryAfterMs: 0, attempts: entry.attempts };
  }

  /**
   * 登录成功后重置计数
   * @param {string} ip
   * @param {string} username
   */
  recordSuccess(ip, username) {
    const key = this._key(ip, username);
    this._entries.delete(key);
  }

  clear() {
    this._entries.clear();
  }
}
