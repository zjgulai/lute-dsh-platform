import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, createHandler, inject, name } from '../lib/index.js'

/** 可控替身 service：覆盖 createHandler 用到的全部读取面。 */
function fakeService(overrides = {}) {
  const records = overrides.records ?? [
    { fp: 'a', catId: 'idea', project: 'p1', text: '这是第一条足够长的用户消息内容', title: '甲' },
    { fp: 'b', catId: 'todo', project: 'p2', text: '第二条同样足够长的用户消息内容', title: '乙' },
    { fp: 'c', catId: 'idea', project: 'p1', text: '第三条消息用于分页与筛选验证', title: '丙' },
  ]
  return {
    records,
    ensureLoaded: async () => undefined,
    counts: () => ({ total: records.length, byCat: { idea: 2, todo: 1 } }),
    rescan: async (full) => ({ scanned: full === true ? 'full' : 'incremental' }),
    reclassify: async (fp, catId) => (fp === 'missing' ? { ok: false, error: '未知条目' } : { ok: true, catId }),
    refine: async (fp) => ({ fp, refined: true }),
    refineBatch: async (fps) => ({ count: fps.length }),
    ...overrides,
  }
}

/** 构造可控 ctx；inject 立即回调，便于断言接线。 */
function context() {
  const handled = []
  const effects = []
  const disposers = []
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
    get: () => undefined,
    inject: (deps, fn) => { handled.push(deps); fn({ connection: { rpc: { handle: (channel, handler) => { handled.push({ channel, handler }) } } } }) },
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d); effects.push('effect'); return () => {} },
  }
  return { ctx, handled, effects, disposers }
}

const call = (handler, endpoint, payload) => handler(endpoint, payload, new AbortController().signal)

test('status 返回计数', async () => {
  const handler = createHandler({}, fakeService())
  const result = await call(handler, 'status')
  assert.deepEqual(result, { ok: true, value: { total: 3, byCat: { idea: 2, todo: 1 } } })
})

test('list：按分类与项目筛选，并返回过滤后的总数', async () => {
  const handler = createHandler({}, fakeService())

  const byCat = await call(handler, 'list', { catId: 'idea' })
  assert.equal(byCat.value.total, 2)
  assert.deepEqual(byCat.value.items.map((r) => r.fp), ['a', 'c'])

  const byProject = await call(handler, 'list', { project: 'p2' })
  assert.deepEqual(byProject.value.items.map((r) => r.fp), ['b'])
})

test('list：query 同时匹配正文与标题，且大小写不敏感', async () => {
  const handler = createHandler({}, fakeService({ records: [
    { fp: 'x', catId: 'idea', project: 'p', text: 'Hello World 这是一条足够长的消息', title: '标题' },
    { fp: 'y', catId: 'idea', project: 'p', text: '无关内容但也要足够长才行', title: 'Another Title' },
  ] }))

  const lower = await call(handler, 'list', { query: 'hello' })
  assert.deepEqual(lower.value.items.map((r) => r.fp), ['x'])

  const byTitle = await call(handler, 'list', { query: 'another' })
  assert.deepEqual(byTitle.value.items.map((r) => r.fp), ['y'])
})

test('list：limit 上限 100、下限 1，offset 分页', async () => {
  const records = Array.from({ length: 150 }, (_, i) => ({ fp: `f${i}`, catId: 'idea', project: 'p', text: `消息 ${i} 足够长以满足聚合条件`, title: `t${i}` }))
  const handler = createHandler({}, fakeService({ records }))

  const capped = await call(handler, 'list', { limit: 9999 })
  assert.equal(capped.value.items.length, 100)

  // 契约：falsy 的 limit 回退到默认 50（Number(0) || 50），负值才被夹到 1
  const fallback = await call(handler, 'list', { limit: 0 })
  assert.equal(fallback.value.items.length, 50)

  const negative = await call(handler, 'list', { limit: -5 })
  assert.equal(negative.value.items.length, 1)

  const page = await call(handler, 'list', { limit: 2, offset: 1 })
  assert.deepEqual(page.value.items.map((r) => r.fp), ['f1', 'f2'])
})

test('reclassify：成功与失败分别映射为 ok:true 与 bad-request', async () => {
  const handler = createHandler({}, fakeService())

  const ok = await call(handler, 'reclassify', { fp: 'a', catId: 'todo' })
  assert.equal(ok.ok, true)

  const bad = await call(handler, 'reclassify', { fp: 'missing', catId: 'todo' })
  assert.equal(bad.ok, false)
  assert.equal(bad.error.code, 'bad-request')
})

test('rescan：full 透传为全量', async () => {
  const handler = createHandler({}, fakeService())
  assert.equal((await call(handler, 'rescan', { full: true })).value.scanned, 'full')
  assert.equal((await call(handler, 'rescan', {})).value.scanned, 'incremental')
})

test('未知端点返回 bad-request（不抛给调用方）', async () => {
  const handler = createHandler({}, fakeService())
  const result = await call(handler, 'nope')
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'bad-request')
})

test('service 抛错时收敛为 internal，不泄漏堆栈', async () => {
  const handler = createHandler({}, fakeService({ counts: () => { throw new Error('磁盘不可读') } }))
  const result = await call(handler, 'status')
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'internal')
  assert.match(result.error.message, /磁盘不可读/)
})

test('apply：注册 RPC 处理器到本包 channel，并声明 inject', () => {
  const { ctx, handled } = context()
  apply(ctx)

  assert.deepEqual(inject, ['connection', 'llm'])
  assert.deepEqual(handled[0], ['connection'])
  const registration = handled.find((h) => h && h.channel !== undefined)
  assert.equal(registration.channel, '/my-quotes')
  assert.equal(typeof registration.handler, 'function')
})

test('apply：注册周期性重扫并可通过 disposer 停止（不泄漏定时器）', () => {
  const { ctx, effects, disposers } = context()
  apply(ctx)

  assert.equal(name, 'dsh-my-quotes')
  assert.deepEqual(effects, ['effect'])
  assert.equal(disposers.length, 1)
  assert.doesNotThrow(() => { disposers[0]() })
})
