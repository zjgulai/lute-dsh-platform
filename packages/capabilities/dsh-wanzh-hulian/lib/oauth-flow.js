/**
 * dsh-wanzh-hulian — OAuth flow 生命周期（SEC-RT-007）。
 *
 * ## 为什么需要这一层
 *
 * 旧的 PixPix 授权把流程状态放在一个模块级变量 `pendingOauth` 里，且只是
 * **记下** `expiresAt`：没有任何定时器读它。两个真实后果：
 *
 *  1. **端口泄漏**：用户打开授权页却不完成（关掉浏览器、走开了），那个
 *     loopback listener 会一直听着，直到 DSH 进程退出——没有上限，也没有读数；
 *  2. **覆盖式泄漏**：连点两次「授权」时第二次直接覆盖 `pendingOauth`，
 *     第一次的 server 既没关，也不可能再校验成功（它的 state 已被覆盖），
 *     于是每次点击都永久泄漏一个 listener。
 *
 * ## 这一层负责什么
 *
 * 把 `state` / `verifier` / `redirectUri` / `server` / `timer` / `expiresAt` 收进
 * **同一个 flow 对象**，并让 registry 成为它的唯一所有者：
 *
 *  - 同时最多一个进行中的 flow（`adopt` 会先关闭上一个，原因记为 `superseded`）；
 *  - 到期由定时器关闭并清空敏感状态（定时器 `unref()`，不吊住进程退出）；
 *  - 成功 / 拒绝 / 异常 / state 不匹配 / 客户端断开 / 插件卸载**共用一个幂等
 *    `close(reason)`**，第一次的原因被保留；
 *  - `dispose()` 之后拒绝新建 flow，避免留下一个「永远完不成」的授权入口。
 *
 * 计时器与 server 都可注入，因此「时间推进到过期」是确定性重放；真实端口是否
 * 真的不再可连接，由测试里的真实 loopback 用例证明（注入替身只能证明我们调用了
 * `close`，证明不了端口不再接受连接）。
 *
 * @module oauth-flow
 */

/** 授权流程的默认有效期：用户从点击到在浏览器里完成授权的合理上限。 */
export const FLOW_TTL_MS = 10 * 60_000

/**
 * 进行中的一个授权流程：`state`/`verifier`/`redirectUri`/`server`/`timer`/`expiresAt`
 * 同住一个对象，由 registry 独占持有（这就是本卡要收拢的那件东西）。
 * @typedef {{
 *   server: any, port: number, state: string | null, verifier: string | null,
 *   redirectUri: string | null, expiresAt: number, closeReason: string | null,
 *   closed: boolean, timer: any, close: (reason: string) => boolean
 * }} OauthFlow
 */

/**
 * 建立一个 OAuth flow registry。
 * @param {{
 *   ttlMs?: number,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => any,
 *   clearTimer?: (handle: any) => void,
 *   onClose?: (flow: any, reason: string) => void
 * }} [options] 注入项（缺省为真实时钟与真实 server 关闭语义）。
 * @returns {{
 *   adopt: (input: { server: any, port: number, state: string, verifier: string, redirectUri: string }) => any,
 *   active: () => any,
 *   activeCount: () => number,
 *   describe: () => { active: boolean, port: number | null, expiresAt: number, expiresInMs: number },
 *   closeActive: (reason: string) => boolean,
 *   dispose: () => void,
 *   disposed: boolean
 * }} registry 实例。
 */
export function createOauthFlowRegistry({
  ttlMs = FLOW_TTL_MS,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
  onClose,
} = {}) {
  /** @type {any} 同时最多一个进行中的 flow。 */
  let current = null
  let disposed = false

  /** 幂等清理：第一次调用生效，原因被保留；后续调用不再触碰 server。 */
  function closeFlow(flow, reason) {
    if (!flow || flow.closed) return false
    flow.closed = true
    flow.closeReason = reason

    if (flow.timer) {
      clearTimer(flow.timer)
      flow.timer = null
    }
    // 先断开既存连接再关：只调 close() 时，keep-alive 的连接会让端口继续活着
    // （server.close() 只是「不再接受新连接」），这正好是「端口泄漏」的隐蔽形态。
    try {
      flow.server.closeAllConnections?.()
    } catch { /* 老版本/替身没有该方法 */ }
    try {
      flow.server.close()
    } catch { /* 已经关了 */ }

    // 敏感状态最后清空：标记 closed 之后回调不再被接受，此时才丢弃 verifier。
    flow.state = null
    flow.verifier = null
    flow.redirectUri = null
    flow.server = null
    if (current === flow) current = null
    if (typeof onClose === 'function') onClose(flow, reason)
    return true
  }

  function adopt({ server, port, state, verifier, redirectUri }) {
    if (disposed) throw new Error('oauth flow registry 已卸载（disposed）：拒绝新建授权流程')
    if (current) closeFlow(current, 'superseded')

    /** @type {OauthFlow} */
    const flow = {
      server,
      port,
      state,
      verifier,
      redirectUri,
      expiresAt: now() + ttlMs,
      closeReason: null,
      closed: false,
      timer: null,
      /** 关闭该 flow（幂等）。成功/拒绝/异常/超时/卸载都走这里。 */
      close(reason) {
        return closeFlow(flow, reason)
      },
    }
    /** @type {any} 计时器句柄：替身只要求「可能有 unref」，真实 setTimeout 返回 Timeout。 */
    flow.timer = setTimer(() => closeFlow(flow, 'expired'), ttlMs)
    // 不 unref 的定时器会吊住进程退出：授权流程不该让宿主多活十分钟。
    flow.timer?.unref?.()
    current = flow
    return flow
  }

  return {
    adopt,
    active: () => current,
    activeCount: () => (current ? 1 : 0),
    /** 只暴露读数：verifier 是 PKCE 秘密，不得出现在任何响应里。 */
    describe() {
      if (!current) return { active: false, port: null, expiresAt: 0, expiresInMs: 0 }
      return {
        active: true,
        port: current.port,
        expiresAt: current.expiresAt,
        expiresInMs: Math.max(0, current.expiresAt - now()),
      }
    },
    closeActive: (reason) => closeFlow(current, reason),
    dispose() {
      disposed = true
      closeFlow(current, 'dispose')
    },
    get disposed() {
      return disposed
    },
  }
}
