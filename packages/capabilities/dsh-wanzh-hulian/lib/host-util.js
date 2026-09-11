/**
 * dsh-wanzh-hulian — Host 侧纯函数边界。
 *
 * 这些函数承载宿主插件与外部世界交界处的判断，**不含 I/O**：
 * 网络与凭证服务由调用方注入，因此行为可在无 cordis 运行时的情况下验证。
 *
 * @typedef {Object} ShopifyTokenInput
 * @property {string} [token] 直填的 Admin API Token（存在即不再换取）
 * @property {() => Promise<{ok: boolean, token?: string, error?: string}>} exchange 客户端凭据换取访问令牌
 */

/**
 * 把任意抛出值归一化为可读的错误文本。
 *
 * 动机：`catch (e)` 的 e 在 checkJs 下是未知类型，直接读 `e?.message` 会得到
 * undefined 并把「undefined」写进面向用户的提示（本包有 17 处此类读取）。
 * @param {unknown} value 抛出值
 * @returns {string} 错误文本；无法归一化时返回空串而非 "undefined"
 */
export function errorMessage(value) {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * 决定用哪个令牌访问 Shopify Admin API。
 *
 * 两条分支：直填令牌优先（不再发起换取）；否则用客户端凭据换取。
 * 换取响应缺少 access_token 时视为失败，避免把 undefined 当作令牌发出去。
 * @typedef {{ok: true, token: string, via: string} | {ok: false, token?: undefined, via?: undefined, error: string}} ShopifyTokenResult
 * @param {ShopifyTokenInput} input 令牌来源
 * @returns {Promise<ShopifyTokenResult>} 令牌或失败原因
 */
export async function resolveShopifyToken(input) {
  if (typeof input?.token === 'string' && input.token) {
    return { ok: true, token: input.token, via: 'Admin API Token' }
  }
  const exchanged = await input.exchange()
  if (exchanged?.ok !== true) {
    return { ok: false, error: exchanged?.error ?? 'Shopify 令牌交换失败：请求失败' }
  }
  if (typeof exchanged.token !== 'string' || !exchanged.token) {
    return { ok: false, error: 'Shopify 令牌交换失败：响应缺少 access_token' }
  }
  return { ok: true, token: exchanged.token, via: '客户端凭据（已自动换取访问令牌）' }
}

/**
 * 取某板块下的连接 id 清单。
 * @param {Array<{id?: unknown, board?: unknown}>} connections 运行时注册表
 * @param {string} boardKey 板块 key
 * @returns {string[]} 该板块的连接 id（保持注册表顺序）
 */
export function pickBoardConnections(connections, boardKey) {
  return connections
    .filter((connection) => connection?.board === boardKey)
    .map((connection) => String(connection?.id ?? ''))
    .filter((id) => id !== '')
}

/**
 * 把「工具清单」并入连接注册表项。
 *
 * 动机（真实缺陷）：工具清单曾与运行时注册表各存一份（手工快照
 * lib/catalog.js 的 CONNECTIONS[0].tools），两份副本已经实际漂移——
 * 仓库版与已部署版长度不同。该清单既下发给设置页，又被 apply() 用来触发注册。
 * 唯一来源只能是注册表本身：注册表没有的工具不得被播报。
 * @template T
 * @param {T} connection 连接注册表项（其自带的 tools 快照会被注册表结果覆盖）
 * @param {string[]} registeredTools 真实的工具名清单
 * @returns {T & {tools: string[]}} 并入工具清单后的连接项
 */
export function mergeRegisteredTools(connection, registeredTools) {
  return { ...connection, tools: [...registeredTools] }
}

/**
 * 装配设置页板块负载。
 *
 * 连接的 id 清单一律**从运行时注册表派生**，不来自任何手工快照——
 * 同一事实只有一个家（ADR-0009），避免注册表增删后板块清单静默过时。
 * @param {{boards: Array<Record<string, any>>, connections: Array<{id?: unknown, board?: unknown}>}} input 板块定义与运行时注册表
 * @returns {Array<Record<string, unknown>>} 可直接下发给客户端的板块负载
 */
export function buildBoards(input) {
  return input.boards.map((board) => ({
    ...board,
    connections: pickBoardConnections(input.connections, board.key),
  }))
}
