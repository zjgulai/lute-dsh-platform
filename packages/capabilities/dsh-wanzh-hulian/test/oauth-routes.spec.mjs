import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { mutationRoot } from '../../../../scripts/lib/mutation-fixture.mjs'

/**
 * dsh-wanzh-hulian — 路由生命周期与 OAuth 入口（SEC-RT-007）。
 *
 * 独立文件、独立进程：`apply()` 会在模块里持有一个授权流程所有者，跨用例共享
 * 同一个 registry 会让「卸载后拒绝新建」这类用例污染其它用例（node 的 test
 * runner 每个文件一个进程，正好把这条边界免费提供出来）。
 *
 * 覆盖动机：`apply()` 里注册了 12 条路由，而路由的 discharger 只 dispose 了 9 条
 * （`/oauth/start`、`/oauth/status`、`/mcp-servers` 从未被调用）——插件卸载后
 * 这三条仍然挂在宿主路由表上，其中一条会**新建 loopback listener**。
 * 这类缺陷在正常运行里完全看不见：它只在卸载/重挂载时发生。
 */

/**
 * 假 HOME 用 `mutationRoot()` 建：同一个前缀仍然随机，但根登记在进程回收表里。
 * 原先的 `mkdtempSync(...)` + `test.after(() => rmSync(...))` 实测会漏——
 * 2026-09-17 在真实 TMPDIR 上数出 82 个 `wanzh-routes-*` 残留根：`test.after`
 * 只在正常跑完时执行，被信号或超时打断就一个都不回收（QG-006B 实测）。
 */
const FAKE_HOME = mutationRoot('wanzh-routes-')
process.env.HOME = FAKE_HOME
mkdirSync(join(FAKE_HOME, '.dsh', 'integrations', 'getnote'), { recursive: true, mode: 0o700 })
mkdirSync(join(FAKE_HOME, '.dsh', 'integrations', 'wanzh-hulian'), { recursive: true, mode: 0o700 })

const { apply } = await import('../lib/index.js')

const BASE = '/api/dsh-wanzh-hulian'

const LOOPBACK = {
  method: 'GET',
  url: '/',
  socket: { remoteAddress: '127.0.0.1' },
  headers: { host: '127.0.0.1:43120' },
}

/** @param {{ method?: string, body?: string }} [init] 方法与该次请求的原始 body。 */
function request({ method = 'GET', body } = {}) {
  return {
    ...LOOPBACK,
    method,
    on(event, cb) {
      if (body === undefined) return this
      if (event === 'data') cb(Buffer.from(body, 'utf8'))
      if (event === 'end') cb()
      return this
    },
  }
}

/** 跑一遍 apply，记录路由表与每条路由的 dispose 情况。 */
function boot() {
  const table = new Map()
  const disposed = []
  const effects = []
  apply({
    credentials: { resolve: async () => ({ value: '' }), set: async () => {}, describe: async () => ({}) },
    get: () => undefined,
    effect(fn) {
      effects.push(fn)
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    tools: { register() {} },
    webServer: {
      register(spec) {
        table.set(spec.path, spec.handler)
        return () => { disposed.push(spec.path) }
      },
    },
  })
  return { table, disposed, effects }
}

function call(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      body: '',
      writeHead(status) { this.statusCode = status },
      end(chunk) { this.body = chunk === undefined ? '' : String(chunk); resolve(this) },
    }
    handler(req ?? request(), res)
  })
}

// 不在这里手工 rmSync：回收交给 mutationRoot 的进程级 reaper（正常退出、断言抛错、
// SIGTERM/SIGINT 四条路径都覆盖）。手工删除只会覆盖其中一条，而它已经漏了 82 次。

test('路由注册与 dispose 全等：12 条注册 / 12 条回收', () => {
  const { table, disposed, effects } = boot()
  assert.equal(table.size, 12, '注册数变了就说明这条断言的分母需要重采')

  // 调用所有 effect 的清理函数（只有 routes 那条会返回真 disposer）。
  for (const fn of effects) {
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  }

  assert.deepEqual([...disposed].sort(), [...table.keys()].sort(), '每一条注册的路由都必须被回收')
  for (const path of [BASE + '/oauth/start', BASE + '/oauth/status', BASE + '/mcp-servers']) {
    assert.ok(disposed.includes(path), `${path} 曾被注册却从未 dispose（旧实现的缺陷）`)
  }
})

test('卸载后 /oauth/status 报告没有进行中的流程', async () => {
  const { table, effects } = boot()
  const status = await call(table.get(BASE + '/oauth/status'))
  const body = JSON.parse(status.body)
  assert.equal(body.flow.active, false)
  assert.equal(body.flow.port, null)
  for (const fn of effects) {
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  }
})

test('卸载后 /oauth/start 拒绝新建流程（不留一个永不完成的授权入口）', async () => {
  const { table, effects } = boot()
  const start = table.get(BASE + '/oauth/start')

  // 卸载前可用：只校验参数路径（不真的发起授权，避免打开系统浏览器）。
  const badEntry = await call(start, request({ method: 'POST', body: JSON.stringify({ id: 'nope' }) }))
  assert.equal(badEntry.statusCode, 400)

  for (const fn of effects) {
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  }

  const afterDispose = await call(start, request({ method: 'POST', body: JSON.stringify({ id: 'pixpix' }) }))
  assert.equal(afterDispose.statusCode, 500, '卸载后必须拒绝，而不是新建一个 listener')
  assert.match(JSON.parse(afterDispose.body).error, /已卸载|disposed/)
})

test('卸载后再次 apply：新的一次仍是可用的（registry 不跨 apply 复用已卸载状态）', async () => {
  const first = boot()
  for (const fn of first.effects) {
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  }

  const second = boot()
  const res = await call(second.table.get(BASE + '/oauth/status'))
  const body = JSON.parse(res.body)
  assert.equal(res.statusCode, 200)
  assert.equal(body.flow.active, false)
})
