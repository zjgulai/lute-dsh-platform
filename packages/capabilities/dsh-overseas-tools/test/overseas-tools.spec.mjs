import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { apply, inject, name } from '../lib/index.js'

/**
 * 公开 seam：apply(ctx) 注册的 exa_search 工具。
 * 所有网络请求均被本文件打桩，测试不发真实请求。
 */

/**
 * 构造可控 ctx：录制工具，注入凭据解析结果。
 * @param {{ resolve?: unknown | ((ref: string) => unknown) }} [options] 凭据解析结果或实现
 */
/**
 * 取出已注册工具（缺失即失败）。
 * @param {Map<string, any>} tools 工具表
 * @param {string} name 工具名
 * @returns {any} 工具对象
 */
function requireTool(tools, name) {
  const tool = tools.get(name)
  assert.ok(tool, `未注册工具 ${name}`)
  return tool
}

function context(options = {}) {
  const resolve = /** @type {{ resolve?: unknown | ((ref: string) => unknown) }} */ (options).resolve
  /** @type {Map<string, { name: string, execute: (args: Record<string, unknown>, exec: Record<string, unknown>) => Promise<Record<string, any>> }>} */
  const tools = new Map()
  /** @type {string[]} */
  const resolveCalls = []
  /** @type {Record<string, unknown>} */
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
    credentials: {
      resolve: async (ref) => {
        resolveCalls.push(ref)
        return typeof resolve === 'function' ? resolve(ref) : resolve
      },
    },
    tools: {
      register: (/** @type {any} */ tool) => {
        // defineTool 在已装载的宿主里返回工具对象本身
        const entry = tool && typeof tool.execute === 'function' ? tool : tool?.tool ?? tool
        tools.set(entry.name, entry)
        return () => {}
      },
    },
  }
  return { ctx, tools, resolveCalls }
}

/**
 * 取出第 n 次 fetch 调用（越界即失败，替代直接索引）。
 * @param {Array<{ url: string, init: Record<string, any> }>} calls 调用记录
 * @param {number} [index] 序号
 * @returns {{ url: string, init: Record<string, any> }} 该次调用
 */
function callAt(calls, index = 0) {
  const call = calls[index]
  assert.ok(call, `应有第 ${index + 1} 次 fetch 调用`)
  return call
}

const originalFetch = globalThis.fetch

beforeEach(() => { delete /** @type {any} */ (globalThis).fetch })
afterEach(() => { globalThis.fetch = originalFetch })

/**
 * 打桩 fetch 并记录调用。
 * @param {(url: string, init: Record<string, any>) => any} impl 响应实现
 * @returns {Array<{ url: string, init: Record<string, any> }>} 调用记录
 */
function stubFetch(impl) {
  /** @type {Array<{ url: string, init: Record<string, any> }>} */
  const calls = []
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: /** @type {Record<string, any>} */ (init) })
    return impl(String(url), /** @type {Record<string, any>} */ (init))
  })
  return calls
}

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

test('注册 exa_search 工具，且 inject 声明与实现一致', () => {
  const { ctx, tools } = context()
  apply(ctx)

  assert.deepEqual([...tools.keys()], ['exa_search'])
  assert.equal(name, 'dsh-overseas-tools')
  assert.deepEqual(inject, ['credentials', 'tools'])
})

test('未配置 Key：返回配置指引且**绝不发起网络请求**（优雅降级）', async () => {
  const { ctx, tools } = context({ resolve: undefined })
  const calls = stubFetch(() => { throw new Error('不应发起请求') })
  apply(ctx)

  const result = await requireTool(tools, 'exa_search').execute({ query: 'deepseek harness' }, {})

  assert.equal(result.ok, false)
  assert.match(result.error, /未配置 Exa API Key/)
  assert.match(result.error, /设置 → 出海技能/, '指引应指向可操作的页面')
  assert.equal(calls.length, 0, '无凭据时不得发起网络请求')
})

test('凭据解析抛错：返回可读原因而非崩溃', async () => {
  const { ctx, tools } = context({ resolve: () => { throw new Error('凭据库不可读') } })
  stubFetch(() => { throw new Error('不应发起请求') })
  apply(ctx)

  const result = await requireTool(tools, 'exa_search').execute({ query: 'x' }, {})

  assert.equal(result.ok, false)
  assert.match(result.error, /凭据解析失败/)
  assert.match(result.error, /凭据库不可读/)
})

test('成功：以凭据为 x-api-key 发请求，并映射结果字段', async () => {
  const { ctx, tools } = context({ resolve: () => ({ value: 'sk-test-key' }) })
  const calls = stubFetch(() => jsonResponse({
    results: [
      { title: '标题一', url: 'https://a.example', publishedDate: '2026-01-01', author: '作者', text: 'x'.repeat(2000) },
      { title: '标题二', url: 'https://b.example' },
    ],
  }))
  apply(ctx)

  const result = await requireTool(tools, 'exa_search').execute({ query: 'harness', numResults: 2, type: 'neural' }, {})

  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(callAt(calls).url, 'https://api.exa.ai/search')
  assert.equal(callAt(calls).init.headers['x-api-key'], 'sk-test-key')
  const sent = JSON.parse(callAt(calls).init.body)
  assert.equal(sent.query, 'harness')
  assert.equal(sent.numResults, 2)
  assert.equal(sent.type, 'neural')

  assert.equal(result.results.length, 2)
  assert.deepEqual(result.results[0], {
    title: '标题一', url: 'https://a.example', publishedDate: '2026-01-01', author: '作者', text: 'x'.repeat(1500),
  })
  assert.equal(result.results[1].author, '', '缺失字段回退为空串而非 undefined')
})

test('HTTP 非 2xx：返回带状态码的错误，不抛出', async () => {
  const { ctx, tools } = context({ resolve: () => ({ value: 'k' }) })
  stubFetch(() => ({ ok: false, status: 401, text: async () => 'unauthorized', json: async () => ({}) }))
  apply(ctx)

  const result = await requireTool(tools, 'exa_search').execute({ query: 'x' }, {})

  assert.equal(result.ok, false)
  assert.match(result.error, /Exa API HTTP 401/)
  assert.match(result.error, /unauthorized/)
})

test('网络异常：返回 Exa 请求失败与原因', async () => {
  const { ctx, tools } = context({ resolve: () => ({ value: 'k' }) })
  stubFetch(() => { throw new Error('socket hang up') })
  apply(ctx)

  const result = await requireTool(tools, 'exa_search').execute({ query: 'x' }, {})

  assert.equal(result.ok, false)
  assert.match(result.error, /Exa 请求失败: socket hang up/)
})

test('参数归一：空 query 直接拒绝；numResults 夹在 1..10', async () => {
  const { ctx, tools } = context({ resolve: () => ({ value: 'k' }) })
  const calls = stubFetch(() => jsonResponse({ results: [] }))
  apply(ctx)
  const tool = requireTool(tools, 'exa_search')

  const empty = await tool.execute({ query: '   ' }, {})
  assert.equal(empty.ok, false)
  assert.match(empty.error, /query 不能为空/)
  assert.equal(calls.length, 0, '空 query 不应发起请求')

  await tool.execute({ query: 'x', numResults: 999 }, {})
  assert.equal(JSON.parse(callAt(calls).init.body).numResults, 10)

  await tool.execute({ query: 'x', numResults: 0 }, {})
  assert.equal(JSON.parse(callAt(calls, 1).init.body).numResults, 5, 'falsy 回退默认 5')

  // 契约：type 的非法值由 defineTool 的 schema 在 execute **之前**拦下
  // （实测抛 ToolArgsError），因此不存在「非法 type 回退 auto」的运行路径。
  await assert.rejects(
    () => tool.execute({ query: 'x', type: 'bogus' }, {}),
    (/** @type {any} */ error) => error.code === 'INVALID_ARGS' && /must be one of/.test(String(error.message)),
    '非法 type 必须被 schema 拒绝',
  )
  assert.equal(calls.length, 2, '被 schema 拒绝的调用不得发起网络请求')
})

test('results 非数组时返回空结果（不崩溃）', async () => {
  const { ctx, tools } = context({ resolve: () => ({ value: 'k' }) })
  stubFetch(() => jsonResponse({ results: null }))
  apply(ctx)

  const result = await requireTool(tools, 'exa_search').execute({ query: 'x' }, {})

  assert.equal(result.ok, true)
  assert.deepEqual(result.results, [])
})
