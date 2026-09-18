/**
 * 有界请求体读取器（SEC-RT-005）。
 *
 * ## 为什么必须有
 *
 * 旧实现是无上限累积：`req.on("data", (c) => chunks.push(c))` 收到多少就攒多少。
 * 宿主侧也**不会**替插件兜底——`DesktopWebServer.register`（app.asar.unpacked/lib/webserver.js）
 * 只做浏览器访问许可判定，对请求体零限制（2026-09-16 读实现确认）。所以
 * 「不要把内存交给请求体决定」这件事只能由插件自己做：一条 loopback 连接即可
 * 把宿主进程的 RSS 推高，且事件循环会被持续占用。
 *
 * ## 契约
 *
 * | 处境 | code | HTTP |
 * | --- | --- | --- |
 * | `Content-Length` 声明超限 | `BODY_TOO_LARGE` | 413 |
 * | 累计实际字节超限（覆盖 chunked／伪造长度） | `BODY_TOO_LARGE` | 413 |
 * | 超过 deadline 仍未读完 | `BODY_TIMEOUT` | 408 |
 * | 连接中断 | `BODY_ABORTED` | 400 |
 * | body 不是合法 JSON | `BODY_PARSE_ERROR` | 400 |
 *
 * 三条不变量：
 * 1. **只信实际字节**：`Content-Length` 只用作「提前拒绝」的加速，绝不作为放行依据；
 * 2. **错误不回显 body**：`message` 里只有上限数值，避免把凭证写进响应体或日志；
 * 3. **超限即停止累积**：已读 chunk 立刻释放，handler 不会被执行。
 *
 * ## 与 team-hub 的关系（有意的两份实现）
 *
 * `packages/infra/dsh-team-hub/src/bounded-body.mjs` 遵守同一份契约。没有合并成
 * 一份是**结构约束**不是偏好：仓库的 `shared/host/http.ts` 是 TypeScript 源码，
 * 只对「有 src/ 且有构建步」的包生效；wanzh 是无构建步的纯 JS 包（`main` 直接指
 * `lib/index.js`），team-hub 同样直接跑 `src/*.mjs`。两者都无法导入 `.ts`。
 * 因此这里的重复由两边的同一组测试用例守着，而不是靠注释提醒。
 *
 * @module dsh-wanzh-hulian/bounded-body
 */

/** 设置类端点的 JSON body 上限：64 KiB。 */
export const SETTINGS_JSON_MAX_BYTES = 64 * 1024;

/** 设置类端点的读取 deadline（毫秒）：loopback 交互，15 秒已是极宽松值。 */
export const SETTINGS_READ_DEADLINE_MS = 15_000;

/**
 * 请求体读取失败。带 `status` 以便路由层直接映射成 HTTP 码，
 * 不必在 catch 里重新判断字符串。
 */
export class BodyLimitError extends Error {
  /**
   * @param {"BODY_TOO_LARGE" | "BODY_TIMEOUT" | "BODY_ABORTED" | "BODY_PARSE_ERROR"} code
   * @param {number} status HTTP 状态码
   * @param {string} message 可对外文本（**不得**包含请求体内容）
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
 * @throws {BodyLimitError} 超限、超时、中断
 */
export function readBoundedBody(req, options = {}) {
  const maxBytes = options.maxBytes ?? SETTINGS_JSON_MAX_BYTES;
  const deadlineMs = options.deadlineMs ?? SETTINGS_READ_DEADLINE_MS;

  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    let chunks = [];
    let size = 0;
    let settled = false;

    /**
     * 统一的收敛口。任何路径都必须经过它，否则会漏掉 clearTimeout，
     * 让一个 15 秒的定时器在请求结束后继续挂着。
     * @param {Error | null} error 失败原因；null 表示成功
     */
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.removeListener?.("data", onData);
      req.removeListener?.("end", onEnd);
      req.removeListener?.("error", onError);
      req.removeListener?.("close", onClose);
      if (error) {
        // 立刻释放已读字节，不让它们活到 GC（超限场景下这里可能是几十 MB）。
        chunks = [];
        size = 0;
        // 停止消费：调用方随后会回 413/408 并关闭连接。
        // 不在这里 destroy：那会把响应一起带走，客户端只会看到连接被重置。
        req.pause?.();
        reject(error);
        return;
      }
      resolve(Buffer.concat(chunks));
    };

    /**
     * 头部即超限的快路径：一个字节都不读。
     * 这条不是为了省内存，而是为了**可预期**——客户端声明 10 GB 时不该先传完再被拒。
     */
    const declared = Number(req.headers?.["content-length"]);
    const timer = setTimeout(() => {
      settle(new BodyLimitError("BODY_TIMEOUT", 408, `读取请求体超过 ${deadlineMs} 毫秒仍未结束`));
    }, deadlineMs);
    // 不因一个未完成的请求把宿主进程留在事件循环里。
    timer.unref?.();

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
    const onError = (error) => settle(new BodyLimitError("BODY_ABORTED", 400, errorMessageOf(error)));
    const onClose = () => {
      // 'close' 在正常读完时也会触发，所以只在「既没 end 也没失败」时才当异常。
      if (!req.readableEnded) settle(new BodyLimitError("BODY_ABORTED", 400, "连接在请求体读完前被关闭"));
    };

    if (Number.isFinite(declared) && declared > maxBytes) {
      // 注意顺序：timer 已建好，settle 会清掉它；监听器一个都不挂。
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
 * 空 body 解析为 `{}`（保持本插件既有语义：POST 不带 body 视作空对象），
 * 空白或非法 JSON 判 400。刻意**不回显**原文。
 *
 * 返回类型写成 `Record<string, unknown>` 而不是 `unknown`：本插件读 body 的 7 条路由
 * 全都是「设置」形态，调用方一律按对象取字段（`typeof body?.ref === "string" ? … : …`）。
 * 写 `unknown` 会让这 10 处字段读取在 `tsc`（`checkJs`）下全部报 TS2339，而那不是
 * 运行时的真实约束——非对象 body（数组、字符串、`null`）取字段本来就得到 `undefined`，
 * 已有的 `typeof` 守卫照样兜住。字段值仍是 `unknown`，所以**没有**放松任何检查：
 * 想用某个字段还是得先窄化。
 *
 * @param {import("node:http").IncomingMessage} req 请求
 * @param {{ maxBytes?: number, deadlineMs?: number }} [options] 上限与 deadline
 * @returns {Promise<Record<string, unknown>>} 解析结果（空 body 为 `{}`）
 * @throws {BodyLimitError} 超限、超时、中断、解析失败
 */
export async function readBoundedJson(req, options = {}) {
  const raw = await readBoundedBody(req, options);
  if (raw.length === 0) return {};
  const text = raw.toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyLimitError("BODY_PARSE_ERROR", 400, "请求体不是合法 JSON");
  }
}

/** @param {unknown} error 捕获到的值 */
function errorMessageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
