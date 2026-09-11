import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage, resolveShopifyToken, pickBoardConnections, buildBoards, mergeRegisteredTools } from '../lib/host-util.js'

/**
 * dsh-wanzh-hulian — Host 侧契约测试。
 *
 * 公开 seam：本包的可测单元是宿主插件在**外部边界**上的纯函数——
 * 错误归一化、凭证守卫、令牌获取策略、板块负载装配。
 * 这些函数不含 I/O，因此不需要 cordis 运行时即可验证其行为契约。
 *
 * 覆盖动机（每项对应一次真实的类型/契约缺口）：
 *  - errorMessage：`catch (e)` 的 e 在 checkJs 下为未知类型，17 处直接读 `e?.message`
 *  - resolveShopifyToken：令牌获取的两条分支（直填令牌 / 客户端凭据换取）此前不可独立验证
 *  - pickBoardConnections / buildBoards：板块负载此前依赖手工快照里的连接清单
 *  - mergeRegisteredTools：工具清单曾与注册表各存一份，两份副本已实际漂移
 */

test('errorMessage：Error 取 message，字符串取自身，其余走兜底且绝不为 undefined', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom')
  assert.equal(errorMessage('boom'), 'boom')
  assert.equal(errorMessage({ code: 42 }), '[object Object]')
  assert.equal(errorMessage(null), '')
  assert.equal(errorMessage(undefined), '')
})

test('errorMessage：空 message 的 Error 不产生空串误导', () => {
  assert.equal(errorMessage(new Error('')), '')
})

test('resolveShopifyToken：直填 Admin API Token 时不再发起换取', async () => {
  let exchangeCalls = 0
  const result = await resolveShopifyToken({
    token: 'shpat_direct',
    exchange: async () => {
      exchangeCalls += 1
      return { ok: true, token: 'shpat_exchanged' }
    },
  })
  assert.equal(exchangeCalls, 0)
  assert.equal(result.ok, true)
  assert.equal(result.token, 'shpat_direct')
  assert.equal(result.via, 'Admin API Token')
})

test('resolveShopifyToken：无令牌但有客户端凭据时换取，并标注认证方式', async () => {
  const result = await resolveShopifyToken({
    exchange: async () => ({ ok: true, token: 'shpat_exchanged' }),
  })
  assert.equal(result.ok, true)
  assert.equal(result.token, 'shpat_exchanged')
  assert.equal(result.via, '客户端凭据（已自动换取访问令牌）')
})

test('resolveShopifyToken：换取失败时保留原因且不返回令牌', async () => {
  const result = await resolveShopifyToken({
    exchange: async () => ({ ok: false, error: 'Shopify 令牌交换失败 (HTTP 401): invalid_client' }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.token, undefined)
  assert.match(result.error, /HTTP 401/)
})

test('resolveShopifyToken：换取成功但响应缺少 access_token 视为失败', async () => {
  const result = await resolveShopifyToken({ exchange: async () => ({ ok: true }) })
  assert.equal(result.ok, false)
  assert.match(result.error, /access_token/)
})

test('pickBoardConnections：只保留该板块的连接，空板块返回空数组', () => {
  const connections = [
    { id: 'a', board: 'mcp' },
    { id: 'b', board: 'knowledge' },
    { id: 'c', board: 'mcp' },
  ]
  assert.deepEqual(pickBoardConnections(connections, 'mcp'), ['a', 'c'])
  assert.deepEqual(pickBoardConnections(connections, 'enterprise'), [])
})

test('buildBoards：板块连接清单一律来自运行时注册表，不携带任何手工快照', () => {
  const boards = [{ key: 'mcp', title: 'MCP 连接', icon: '🔌', desc: 'x', ready: true }]
  const connections = [{ id: 'apify', board: 'mcp' }]
  const result = buildBoards({ boards, connections })
  assert.equal(result.length, 1)
  assert.equal(result[0].key, 'mcp')
  assert.deepEqual(result[0].connections, ['apify'])
})

test('buildBoards：注册表新增连接后清单自动跟随（无第二份事实源）', () => {
  const boards = [{ key: 'mcp', title: 'MCP', icon: '🔌', desc: '', ready: true }]
  const before = buildBoards({ boards, connections: [{ id: 'apify', board: 'mcp' }] })
  const after = buildBoards({
    boards,
    connections: [{ id: 'apify', board: 'mcp' }, { id: 'pixpix', board: 'mcp' }],
  })
  assert.deepEqual(before[0].connections, ['apify'])
  assert.deepEqual(after[0].connections, ['apify', 'pixpix'])
})

/**
 * 真实缺陷回归：工具清单曾被**手工快照**（lib/catalog.js 的 CONNECTIONS[0].tools）
 * 与运行时注册表各存一份，两份副本已经实际漂移——
 * 仓库版 4133 字节、已部署版 5077 字节，且两者对 board.connections 的取值不同。
 * 工具清单与板块清单都必须只来自注册表：快照里就算残留死引用也不影响播报。
 */
test('工具清单：只来自运行时注册表，快照残留不影响播报（真实缺陷回归）', () => {
  const registered = ['getnote_topics', 'getnote_recall']
  // 模拟「快照里残留了死工具名」（历史 catalog.js 曾持有第二份工具清单）
  const connectionWithStaleSnapshot = {
    id: 'getnote-brain',
    tools: ['getnote_topics', 'getnote_removed_tool'],
  }
  const merged = mergeRegisteredTools(connectionWithStaleSnapshot, registered)
  assert.deepEqual(merged.tools, registered)
  assert.equal(merged.tools.includes('getnote_removed_tool'), false, '快照里的死工具名不得被播报')
})
