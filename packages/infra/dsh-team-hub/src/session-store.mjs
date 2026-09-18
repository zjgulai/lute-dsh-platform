import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * 默认配置
 */
export const DEFAULT_MAX_SESSIONS = 5000;
export const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 分钟

export function sessionsPath(home) {
  return path.join(home, "sessions.json");
}

/**
 * 校验 session 数据项 schema 是否合法
 * @param {any} val
 * @returns {boolean}
 */
export function isValidSessionEntry(val) {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  if (typeof val.username !== "string" || !val.username.trim()) return false;
  if (typeof val.createdAt !== "string" || isNaN(Date.parse(val.createdAt))) return false;
  if (typeof val.expiresAt !== "string" || isNaN(Date.parse(val.expiresAt))) return false;
  return true;
}

/**
 * 平台原子文件写入（同目录临时文件 + 0600 + fsync + rename + 目录 fsync）
 * @param {string} filePath
 * @param {string} content
 */
export function writeAtomicSync(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const tmpFile = path.join(dir, `.${path.basename(filePath)}.${randomSuffix}.tmp`);

  const fd = fs.openSync(tmpFile, "wx", 0o600);
  try {
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  try {
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    throw err;
  }

  // 尝试同步父目录以保证 rename 元数据落盘（若操作系统支持）
  try {
    const dirFd = fs.openSync(dir, "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {}
}

/**
 * SessionStore 内存映射与原子持久化管理类
 */
export class SessionStore {
  /**
   * @param {string} home Team Hub 数据目录
   * @param {object} [options]
   * @param {number} [options.maxSessions] 最大保留 session 数量（默认 5000）
   * @param {number} [options.maxFileBytes] 允许的最大文件大小（默认 5MB）
   * @param {number} [options.cleanupIntervalMs] 定时清理间隔（默认 60s）
   * @param {boolean} [options.autoStartCleanup] 是否自动启动定时器（默认 true）
   */
  constructor(home, options = {}) {
    this.home = home;
    this.filePath = sessionsPath(home);
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;

    /** @type {Map<string, { username: string, createdAt: string, expiresAt: string }>} */
    this._sessions = new Map();
    this._writeLock = Promise.resolve();
    this._timer = null;

    this.init();

    if (options.autoStartCleanup !== false && this.cleanupIntervalMs > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * 初始化：从磁盘加载并校验 session 数据，损坏时 fail-closed 并备份取证
   */
  init() {
    this._sessions.clear();
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    let raw = "";
    try {
      const stats = fs.statSync(this.filePath);
      if (stats.size > this.maxFileBytes) {
        throw new Error(`文件大小超限 (${stats.size} > ${this.maxFileBytes})`);
      }
      raw = fs.readFileSync(this.filePath, "utf8");
      if (!raw.trim()) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Top-level JSON is not an object");
      }

      const now = Date.now();
      let changed = false;

      for (const [token, entry] of Object.entries(parsed)) {
        if (!isValidSessionEntry(entry)) {
          changed = true;
          continue;
        }
        const expiresAtMs = Date.parse(entry.expiresAt);
        if (expiresAtMs <= now) {
          changed = true;
          continue;
        }
        this._sessions.set(token, {
          username: entry.username,
          createdAt: entry.createdAt,
          expiresAt: entry.expiresAt,
        });
      }

      // 超过容量上限时按过期时间/创建时间裁剪超额项
      if (this._sessions.size > this.maxSessions) {
        this._trimToCapacity();
        changed = true;
      }

      if (changed) {
        this.saveSync();
      }
    } catch (err) {
      // 损坏或无法解析：fail-closed 保留取证副本，旧 token 全部失效
      const corruptTime = new Date().toISOString().replace(/[:.]/g, "-");
      const corruptBackup = path.join(this.home, `sessions.corrupt.${corruptTime}.bak`);
      try {
        fs.mkdirSync(this.home, { recursive: true, mode: 0o700 });
        fs.writeFileSync(corruptBackup, raw || "", "utf8");
      } catch {}

      this._sessions.clear();
      // 写入空状态覆盖损坏文件
      try {
        this.saveSync();
      } catch {}
    }
  }

  /**
   * 启动定期清理过期与超量 session 的定时器
   */
  startCleanupTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupIntervalMs);
    if (typeof this._timer.unref === "function") {
      this._timer.unref();
    }
  }

  /**
   * 停止定期清理定时器
   */
  stopCleanupTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * 裁剪会话直到满足容量限制（优先淘汰最先过期的会话）
   */
  _trimToCapacity() {
    if (this._sessions.size <= this.maxSessions) return;
    const sorted = Array.from(this._sessions.entries()).sort((a, b) => {
      return Date.parse(a[1].expiresAt) - Date.parse(b[1].expiresAt);
    });
    const excess = this._sessions.size - this.maxSessions;
    for (let i = 0; i < excess; i++) {
      this._sessions.delete(sorted[i][0]);
    }
  }

  /**
   * 同步持久化内存数据到磁盘（使用原子写入）
   */
  saveSync() {
    const obj = Object.create(null);
    for (const [token, entry] of this._sessions.entries()) {
      obj[token] = entry;
    }
    const content = JSON.stringify(obj, null, 2);
    writeAtomicSync(this.filePath, content);
  }

  /**
   * 异步串行持久化：确保并发 issue/revoke 串行落盘，持久化成功后才完成
   * @returns {Promise<void>}
   */
  _enqueueSave() {
    this._writeLock = this._writeLock.then(() => {
      this.saveSync();
    });
    return this._writeLock;
  }

  /**
   * 查询 session（纯内存操作，不触发磁盘读取）
   * @param {string} token
   * @returns {{ username: string, createdAt: string, expiresAt: string } | null}
   */
  resolve(token) {
    if (!token || typeof token !== "string") return null;
    const entry = this._sessions.get(token);
    if (!entry) return null;

    if (Date.parse(entry.expiresAt) <= Date.now()) {
      this._sessions.delete(token);
      // 延迟落盘清理，不阻塞当前解析路径
      this._enqueueSave().catch(() => {});
      return null;
    }
    return entry;
  }

  /**
   * 签发新 session
   * @param {string} username
   * @param {number} [ttlMs]
   * @returns {Promise<{ token: string, username: string, createdAt: string, expiresAt: string }>}
   */
  async issue(username, ttlMs = 1000 * 60 * 60 * 24 * 14) {
    if (!username || typeof username !== "string") {
      throw new Error("Invalid username for session");
    }
    const token = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    const entry = {
      username,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString()
    };

    this._sessions.set(token, entry);
    this._trimToCapacity();

    await this._enqueueSave();
    return { token, ...entry };
  }

  /**
   * 撤销特定 session
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async revoke(token) {
    if (!token || typeof token !== "string") return false;
    if (!this._sessions.has(token)) return false;

    this._sessions.delete(token);
    await this._enqueueSave();
    return true;
  }

  /**
   * 撤销指定用户的所有 session
   * @param {string} username
   * @returns {Promise<number>}
   */
  async revokeUser(username) {
    if (!username || typeof username !== "string") return 0;
    let count = 0;
    for (const [token, entry] of this._sessions.entries()) {
      if (entry.username === username) {
        this._sessions.delete(token);
        count++;
      }
    }
    if (count > 0) {
      await this._enqueueSave();
    }
    return count;
  }

  /**
   * 定期清理所有过期 session
   * @returns {Promise<number>}
   */
  async cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, entry] of this._sessions.entries()) {
      if (Date.parse(entry.expiresAt) <= now) {
        this._sessions.delete(token);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      await this._enqueueSave();
    }
    return cleaned;
  }

  /**
   * 获取当前有效 session 总数
   * @returns {number}
   */
  get size() {
    return this._sessions.size;
  }
}
