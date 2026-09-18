/**
 * 有界请求体读取器（SEC-RT-005）。
 *
 * ## 为什么必须有
 *
 * 旧实现 `collect()` 是 `for await (const chunk of req) chunks.push(chunk)`：
 * 收到多少攒多少，没有任何上限。team-hub 是**面向局域网多用户**的网关，
 * 一条已登录连接就能把网关进程的内存吃满，而网关内存被吃满等于全团队断服。
 *
 * ## 契约
 *
 * | 处境 | code | HTTP |
 * | --- | --- | --- |
 * | `Content-Length` 声明超限 | `BODY_TOO_LARGE` | 413 |
 * | 累计实际字节超限（覆盖 chunked） | `BODY_TOO_LARGE` | 413 |
 * | 超过 deadline 仍未读完 | `BODY_TIMEOUT` | 408 |
 * | 连接中断 | `BODY_ABORTED` | 400 |
 * | body 不是合法 JSON | `BODY_PARSE_ERROR` | 400 |
 *
 * 三条不变量：只信实际字节；错误不回显 body；超限即停止累积且 handler 不执行。
 * 与 `packages/capabilities/dsh-wanzh-hulian/lib/bounded-body.js` 是**同一契约的两份实现**
 * ——两者都无构建步，无法导入仓库的 TypeScript 共享源 `shared/host/http.ts`。
 *
 * ## 上限是测出来的，不是拍的
 *
 * 网关有两大类请求面，上限依据不同：
 *
 * - **透传面**（`proxyRequest` 与 `/api/*` RPC）：网关不解释 body，天花板由上游产品决定。
 *   实测依据：Desktop profile 实际挂载了 `dsh-file-upload`（`~/.dsh/profiles/desktop/package.json`），
 *   其自身上限 `MAX_JSON_BYTES = 18 MiB`（`lib/index.js:8`）。取 32 MiB 留 ~1.8× 余量。
 * - **网关自有面**（登录、改密表单、admin 控制台）：形状完全由网关定义，
 *   两个短字段 → 8 KiB；admin 配置对象 → 64 KiB。
 *
 * @module dsh-team-hub/bounded-body
 */

/** 透传面上限：32 MiB（依据见模块注释，必须 > 上游 18 MiB 天花板）。 */
export const PASSTHROUGH_MAX_BYTES = 32 * 1024 * 1024;

/** 透传面读取 deadline：局域网可能较慢，且上面允许 32 MiB。 */
export const PASSTHROUGH_READ_DEADLINE_MS = 120_000;

/** 登录/改密表单上限：8 KiB（只有 username/password/current/next 几个短字段）。 */
export const FORM_MAX_BYTES = 8 * 1024;

/** 表单读取 deadline。 */
export const FORM_READ_DEADLINE_MS = 15_000;

/** admin 控制台 JSON 上限：64 KiB。 */
export const ADMIN_API_MAX_BYTES = 64 * 1024;

/** admin 控制台读取 deadline。 */
export const ADMIN_API_READ_DEADLINE_MS = 15_000;

/** 请求体读取失败。带 `status`，让调用方不必重新判断字符串。 */
export class BodyLimitError extends Error {
  /**
   * @param {"BODY_TOO_LARGE" | "BODY_TIMEOUT" | "BODY_ABORTED" | "BODY_PARSE_ERROR"} code 错误码
   * @param {number} status 对应的 HTTP 状态码
   * @param {string} message 可对外文本（不得包含请求体内容）
   */
  constructor(code, status, message) {
    super(message);
    this.name = "BodyLimitError";
    this.code = code;
    this.status = status;
  }
}

/**
 * 读取请求体并施加硬上限与读取 deadline。
 *
 * @param {import("node:http").IncomingMessage} req 请求
 * @param {{ maxBytes?: number, deadlineMs?: number }} [options] 上限与 deadline
 * @returns {Promise<Buffer>} 请求体原始字节
 * @throws {BodyLimitError} 超限、超时或中断
 */
export function readBoundedBody(req, options = {}) {
  const maxBytes = options.maxBytes ?? PASSTHROUGH_MAX_BYTES;
  const deadlineMs = options.deadlineMs ?? PASSTHROUGH_READ_DEADLINE_MS;

  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    let chunks = [];
    let size = 0;
    let settled = false;

    /**
     * 唯一收敛口：任何路径都要经过它，否则会漏掉 clearTimeout，
     * 留下一个走完仍挂着的定时器。
     * @param {Error | null} error 失败原因；null 表示成功
     */
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("close", onClose);
      if (error) {
        // 立即释放已读字节，不等 GC。
        chunks = [];
        size = 0;
        // 停止消费；调用方随后回 413/408 并关连接。
        // 不在这里 destroy：那会把响应一起带走，客户端只看到连接被重置。
        req.pause();
        reject(error);
        return;
      }
      resolve(Buffer.concat(chunks));
    };

    const declared = Number(req.headers["content-length"]);
    // 定时器先建：下面的监听器可能在注册时同步触发（测试里的假 req 就是如此）。
    const timer = setTimeout(() => {
      settle(new BodyLimitError("BODY_TIMEOUT", 408, `读取请求体超过 ${deadlineMs} 毫秒仍未结束`));
    }, deadlineMs);
    timer.unref();

    /** @param {Buffer} chunk */
    const onData = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        settle(new BodyLimitError("BODY_TOO_LARGE", 413, `请求体超过上限 ${maxBytes} 字节`));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => settle(null);
    /** @param {Error} error */
    const onError = (error) => settle(new BodyLimitError("BODY_ABORTED", 400, error instanceof Error ? error.message : String(error)));
    const onClose = () => {
      // 'close' 正常读完也会触发，只在「既没 end 也没失败」时才算异常。
      if (!req.readableEnded) settle(new BodyLimitError("BODY_ABORTED", 400, "连接在请求体读完前被关闭"));
    };

    // 头部即超限的快路径：一个字节都不读，也不必等 body 到齐。
    if (Number.isFinite(declared) && declared > maxBytes) {
      settle(new BodyLimitError("BODY_TOO_LARGE", 413, `请求体声明长度超过上限 ${maxBytes} 字节`));
      return;
    }

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("close", onClose);
  });
}

/**
 * 读取并解析 JSON 请求体。
 *
 * 空 body 解析为 `{}`（保持 `handleAdminApi` 既有语义：`|| "{}"`），
 * 空白或非法 JSON 判 400。
 *
 * @param {import("node:http").IncomingMessage} req 请求
 * @param {{ maxBytes?: number, deadlineMs?: number }} [options] 上限与 deadline
 * @returns {Promise<unknown>} 解析结果
 * @throws {BodyLimitError} 超限、超时、中断或解析失败
 */
export async function readBoundedJson(req, options = {}) {
  const raw = await readBoundedBody(req, options);
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new BodyLimitError("BODY_PARSE_ERROR", 400, "请求体不是合法 JSON");
  }
}
