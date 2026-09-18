import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { createOauthFlowRegistry, FLOW_TTL_MS } from '../lib/oauth-flow.js'

/**
 * dsh-wanzh-hulian — OAuth flow 生命周期契约（SEC-RT-007）。
 *
 * 公开 seam：`createOauthFlowRegistry()`。它拥有**唯一一个**进行中的 flow，
 * 并把 `state` / `verifier` / `redirectUri` / `server` / `timer` / `expiresAt`
 * 收进同一个对象——旧实现把这些散在一个模块级 `pendingOauth` 变量里，
 * 于是出现两个真实后果：
 *
 *  1. `expiresAt` 只是被**记下来**，没有任何定时器读它：用户开了授权页又不完成，
 *     那个 loopback 端口会一直听着，直到进程退出；
 *  2. 连续点两次「授权」时，第二次直接覆盖 `pendingOauth`，第一次的 server
 *     既没关、也不可能再校验成功（它的 state 已被覆盖）——每次点击泄漏一个 listener。
 *
 * 计时器与 server 都由调用方注入，所以「时间推进到过期」是确定性重放而不是等
 * 十分钟；同时另有一组**真实 loopback** 用例证明端口真的关掉了（注入替身只能
 * 证明我们调用了 close，证明不了端口不再接受连接）。
 */

/** 计时器替身：可手动推进，且记录 unref（不 unref 的定时器会吊住进程退出）。 */
function fakeTimers() {
  const timers = new Map()
  let seq = 0
  return {
    setTimer(fn, ms) {
      const id = ++seq
      timers.set(id, { fn, ms, unrefed: false, cleared: false })
      return { id, unref() { timers.get(id).unrefed = true } }
    },
    clearTimer(handle) {
      const t = handle && timers.get(handle.id)
      if (t) t.cleared = true
    },
    /** 推进到「所有 ms <= elapsed 的定时器」触发。 */
    advance(elapsed) {
      for (const t of timers.values()) {
        if (!t.cleared && t.ms <= elapsed) {
          t.cleared = true
          t.fn()
        }
      }
    },
    entries: () => [...timers.values()],
  }
}

/** server 替身：记录 close / closeAllConnections 调用。 */
function fakeServer() {
  return {
    closed: 0,
    connectionsClosed: 0,
    close() { this.closed += 1 },
    closeAllConnections() { this.connectionsClosed += 1 },
  }
}

function flowFixture(overrides = {}) {
  const timers = fakeTimers()
  const registry = createOauthFlowRegistry({ setTimer: timers.setTimer, clearTimer: timers.clearTimer, ...overrides })
  return { registry, timers }
}

function adopt(registry, server, state = 'state-1') {
  return registry.adopt({ server, port: 12345, state, verifier: `verifier-${state}`, redirectUri: `http://127.0.0.1:12345/callback` })
}

test('adopt：把 state/verifier/redirectUri/expiresAt/server 收进单一 flow 对象', () => {
  const { registry, timers } = flowFixture({ now: () => 1_000_000 })
  const server = fakeServer()
  const flow = adopt(registry, server)

  assert.equal(flow.state, 'state-1')
  assert.equal(flow.verifier, 'verifier-state-1')
  assert.equal(flow.redirectUri, 'http://127.0.0.1:12345/callback')
  assert.equal(flow.expiresAt, 1_000_000 + FLOW_TTL_MS)
  assert.equal(flow.server, server)
  assert.equal(flow.closed, false)
  assert.equal(registry.active(), flow)
  assert.equal(timers.entries().length, 1, '必须真的挂上一个到期定时器')
  assert.equal(timers.entries()[0].ms, FLOW_TTL_MS)
  assert.equal(timers.entries()[0].unrefed, true, '到期定时器不得吊住进程退出')
})

test('到期：定时器触发即关闭 server、清空 state/verifier，且端口句柄被回收', () => {
  const { registry, timers } = flowFixture({ now: () => 0 })
  const server = fakeServer()
  const flow = adopt(registry, server)

  timers.advance(FLOW_TTL_MS)

  assert.equal(server.closed, 1, '到期必须关闭 listener（旧实现永不关闭）')
  assert.equal(server.connectionsClosed, 1)
  assert.equal(flow.closed, true)
  assert.equal(flow.closeReason, 'expired')
  assert.equal(flow.state, null, '到期后 state 不得继续留在内存里')
  assert.equal(flow.verifier, null)
  assert.equal(flow.redirectUri, null)
  assert.equal(registry.active(), null)
})

test('连续 adopt 两次：关闭旧 flow 后新建，同一时刻最多一个 listener', () => {
  const { registry } = flowFixture()
  const first = fakeServer()
  const second = fakeServer()
  const f1 = adopt(registry, first, 'state-1')
  const f2 = adopt(registry, second, 'state-2')

  assert.equal(first.closed, 1, '被取代的 flow 必须关端口')
  assert.equal(f1.closeReason, 'superseded')
  assert.equal(f1.state, null)
  assert.equal(second.closed, 0)
  assert.equal(registry.active(), f2)
  assert.equal(registry.activeCount(), 1, '旧实现每次点击泄漏一个 listener')
})

test('close 幂等：成功、拒绝、异常、dispose 走同一个 cleanup，重复调用只关一次', () => {
  const { registry } = flowFixture()
  const server = fakeServer()
  const flow = adopt(registry, server)

  flow.close('success')
  flow.close('success')
  flow.close('dispose')
  registry.closeActive('dispose')

  assert.equal(server.closed, 1)
  assert.equal(server.connectionsClosed, 1)
  assert.equal(flow.closeReason, 'success', '第一次的原因保留，后续调用不覆盖')
})

test('close 之后 closeTimer 被调用：不留悬空定时器', () => {
  const { registry, timers } = flowFixture()
  const flow = adopt(registry, fakeServer())
  assert.equal(timers.entries()[0].cleared, false)
  flow.close('success')
  assert.equal(timers.entries()[0].cleared, true)
})

test('任一路径关闭后 registry 都是空的（成功/拒绝/异常/state mismatch 共用一个出口）', () => {
  for (const reason of ['success', 'provider-error', 'state-mismatch', 'client-abort', 'dispose']) {
    const { registry } = flowFixture()
    const server = fakeServer()
    const flow = adopt(registry, server)
    flow.close(reason)
    assert.equal(server.closed, 1, `${reason} 必须关端口`)
    assert.equal(registry.active(), null, `${reason} 后不得留下 active handle`)
  }
})

test('dispose：关闭进行中的 flow，之后拒绝新建（能力入口先关，而不是留个死 flow）', () => {
  const { registry } = flowFixture()
  const server = fakeServer()
  const flow = adopt(registry, server)

  registry.dispose()

  assert.equal(server.closed, 1)
  assert.equal(flow.closed, true)
  assert.equal(flow.closeReason, 'dispose')
  assert.equal(registry.disposed, true)
  assert.throws(() => adopt(registry, fakeServer()), /disposed|已卸载/)
})

test('describe：只暴露读数，不泄漏 verifier', () => {
  const { registry } = flowFixture({ now: () => 5_000 })
  adopt(registry, fakeServer())
  const d = registry.describe()
  assert.equal(d.active, true)
  assert.equal(d.port, 12345)
  assert.equal(d.expiresAt, 5_000 + FLOW_TTL_MS)
  assert.equal(d.expiresInMs, FLOW_TTL_MS)
  assert.equal(JSON.stringify(d).includes('verifier'), false, 'verifier 是 PKCE 秘密，不得出现在读数里')

  registry.closeActive('dispose')
  const after = registry.describe()
  assert.equal(after.active, false)
  assert.equal(after.expiresAt, 0)
})

/** 真实 loopback：注入替身证明不了「端口不再接受连接」。 */
function connectProbe(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    const done = (result) => { socket.destroy(); resolve(result) }
    socket.on('connect', () => done('open'))
    socket.on('error', (/** @type {any} */ e) => done(e.code === 'ECONNREFUSED' ? 'refused' : `error:${e.code}`))
  })
}

/** 有界等待：失败必须是一条干净的断言，不能变成一个挂住的测试进程。 */
function waitFor(predicate, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      if (predicate()) return resolve(true)
      if (Date.now() - started > timeoutMs) return resolve(false)
      setTimeout(tick, 5)
    }
    tick()
  })
}

/** 建一个真实 loopback server，返回端口与关闭句柄。 */
async function listenReal() {
  const server = createServer((_req, res) => res.end('ok'))
  const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    resolve(typeof address === 'object' && address !== null ? address.port : 0)
  }))
  return { server, port, destroy: () => { try { server.closeAllConnections?.(); server.close() } catch { /* 已关 */ } } }
}

test('真实 listener：close 之后端口立刻拒绝连接，且挂着的连接被断开', async () => {
  const registry = createOauthFlowRegistry()
  const target = await listenReal()
  const extra = []
  try {
    const held = connect({ port: target.port, host: '127.0.0.1' })
    extra.push(held)
    await new Promise((resolve, reject) => {
      held.on('connect', resolve)
      held.on('error', reject)
    })
    let heldClosed = false
    held.on('close', () => { heldClosed = true })
    assert.equal(await connectProbe(target.port), 'open', '前置条件：端口此刻是可连接的')

    const flow = registry.adopt({ server: target.server, port: target.port, state: 's', verifier: 'v', redirectUri: 'r' })
    assert.equal(target.server.listening, true)
    flow.close('success')

    assert.equal(target.server.listening, false, 'close 之后 server 不得仍在 listening')
    assert.equal(await connectProbe(target.port), 'refused', '端口必须真的不可连接')
    // 行为断言（不是调用计数）：只调 server.close() 时既存连接会继续挂着，
    // 端口虽然在拒绝新连接，但那个 fd 与它的状态会一直留到连接自己结束。
    assert.equal(await waitFor(() => heldClosed), true, 'close 必须断开既存连接，而不是等它自己结束')
  } finally {
    for (const s of extra) s.destroy()
    target.destroy()
  }
})

test('真实 listener：连续两次 start 只留一个 listening server', async () => {
  const registry = createOauthFlowRegistry()
  const first = await listenReal()
  const second = await listenReal()
  try {
    const f1 = registry.adopt({ server: first.server, port: first.port, state: 's1', verifier: 'v1', redirectUri: 'r1' })
    const f2 = registry.adopt({ server: second.server, port: second.port, state: 's2', verifier: 'v2', redirectUri: 'r2' })

    assert.equal(f1.closed, true, '被取代的 flow 必须关闭（旧实现只是覆盖变量）')
    assert.equal(first.server.listening, false)
    assert.equal(second.server.listening, true)
    assert.equal(registry.activeCount(), 1)
    assert.equal(await connectProbe(first.port), 'refused')
    assert.equal(await connectProbe(second.port), 'open')

    f2.close('dispose')
    assert.equal(await connectProbe(second.port), 'refused')
  } finally {
    first.destroy()
    second.destroy()
  }
})
