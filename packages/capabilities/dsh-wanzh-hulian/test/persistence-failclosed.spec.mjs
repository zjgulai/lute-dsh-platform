import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * dsh-wanzh-hulian — fail-closed 的**边界形状**与并发写入（SEC-RT-006 复审修订）。
 *
 * 为什么要有这一层：第一版只把「不可解析的字节」当成损坏。独立审证（2026-09-16）
 * 用可解析但形状不对的文件实测出仍然 fail-open 的读数——
 *
 *   - `config.json` = `null` / `[]` / `123` / `"str"`：`r.value?.enabled !== false` 判成
 *     `enabled:true`，**工具照常发网络请求**，而同一个文件在 `/toggle` 上却返回 409
 *     （写路径用 `isPlainObject` 拒写）——同一个文件「读说健康、写说损坏」；
 *   - `connections.json` = `{}`：不进 schema 分支，直接回退默认清单，
 *     而默认清单里 `getnote-brain` 是 `enabled:true`，等于把功能重新打开。
 *
 * 另一类问题在并发：`readXxx()` → 拼装 → `writeJson()` 中间隔着一个 await，
 * 两个并发 `/toggle` 各读到同一份旧值，后写的吞掉先写的，**两边都返回 200**。
 */

const FAKE_HOME = mkdtempSync(join(tmpdir(), 'wanzh-shape-'))
process.env.HOME = FAKE_HOME

const GETNOTE_DIR = join(FAKE_HOME, '.dsh', 'integrations', 'getnote')
const WANZH_DIR = join(FAKE_HOME, '.dsh', 'integrations', 'wanzh-hulian')
const STATE_FILE = join(GETNOTE_DIR, 'config.json')
const CONNECTIONS_FILE = join(WANZH_DIR, 'connections.json')
const MCP_FILE = join(WANZH_DIR, 'mcp-servers.json')
const OAUTH_FILE = join(WANZH_DIR, 'oauth-pixpix.json')

const { apply } = await import('../lib/index.js')

const BASE = '/api/dsh-wanzh-hulian'
const LOOPBACK = { method: 'GET', url: '/', socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:43120' } }

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

function boot() {
  const table = new Map()
  const tools = []
  apply({
    credentials: { resolve: async () => ({ value: '' }), set: async () => {}, describe: async () => ({}) },
    get: () => undefined,
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    tools: { register(def) { tools.push(def) } },
    webServer: { register(spec) { table.set(spec.path, spec.handler); return () => {} } },
  })
  return { table, tools }
}

function call(handler, req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('请求悬挂：handler 既没有回响应也没有抛错')), 2000)
    const res = {
      statusCode: 0,
      body: '',
      writeHead(status) { this.statusCode = status },
      end(chunk) {
        clearTimeout(timer)
        this.body = chunk === undefined ? '' : String(chunk)
        resolve(this)
      },
    }
    Promise.resolve(handler(req ?? request(), res)).catch((e) => { clearTimeout(timer); reject(e) })
  })
}

const get = (table, path) => call(table.get(path))
const post = (table, path, payload) => call(table.get(path), request({ method: 'POST', body: JSON.stringify(payload) }))

function resetHome() {
  rmSync(join(FAKE_HOME, '.dsh'), { recursive: true, force: true })
  mkdirSync(GETNOTE_DIR, { recursive: true, mode: 0o700 })
  mkdirSync(WANZH_DIR, { recursive: true, mode: 0o700 })
}

test.after(() => rmSync(FAKE_HOME, { recursive: true, force: true }))

/* ── 形状不对 ≠ 健康 ─────────────────────────────────────────────────── */

for (const literal of ['null', '[]', '123', '"str"', '{"enabled": tru']) {
  test(`config.json 内容为 ${literal} 时按损坏处理：能力关闭，且工具入口断开`, async () => {
    resetHome()
    writeFileSync(STATE_FILE, literal)

    const { table, tools } = boot()
    const list = await get(table, BASE + '/list')
    const body = JSON.parse(list.body)
    const issue = body.health.issues.find((i) => i.code.startsWith('state_'))
    assert.ok(issue, `${literal} 必须被报成 state 损坏，而不是健康`)

    const topics = tools.find((t) => t.name === 'getnote_topics')
    const value = await topics.execute({}, { credentials: { resolve: async () => ({ value: '' }) } })
    assert.equal(value.disconnected, true, `${literal} 下工具必须断开（旧读数会照常发请求）`)
  })
}

test('config.json 形状不对时，写路径与读路径给出同一结论（都是拒绝）', async () => {
  resetHome()
  writeFileSync(STATE_FILE, 'null')

  const { table } = boot()
  const res = await post(table, BASE + '/toggle', { id: 'getnote-brain', field: 'modelInvoke', value: true })
  assert.equal(res.statusCode, 409, '读说损坏、写也必须拒绝；两把尺子会让用户看到自相矛盾的读数')
  assert.equal(readFileSync(STATE_FILE, 'utf8'), 'null', '原字节保留')
})

test('connections.json 为 {} 时不得回退启用中的默认清单', async () => {
  resetHome()
  writeFileSync(CONNECTIONS_FILE, '{}')

  const { table } = boot()
  const body = JSON.parse((await get(table, BASE + '/list')).body)
  assert.equal(body.health.ok, false)
  assert.equal(body.health.issues[0].code, 'connections_schema')
  for (const c of body.connections) assert.equal(c.enabled, false, `${c.id} 不得被默认清单重新打开`)
})

test('connections.json 显式声明空数组：不算损坏，逐条关闭但保留恢复入口', async () => {
  resetHome()
  writeFileSync(CONNECTIONS_FILE, JSON.stringify({ schemaVersion: 1, connections: [] }))

  const { table } = boot()
  const body = JSON.parse((await get(table, BASE + '/list')).body)
  assert.equal(body.health.ok, true, '形状正确就是没坏——判成损坏会让写入口一起拒绝，用户再无恢复路径')
  for (const c of body.connections) assert.equal(c.enabled, false)

  const res = await post(table, BASE + '/toggle', { id: 'getnote-brain', field: 'enabled', value: true })
  assert.equal(res.statusCode, 200, '必须能从界面把连接重新打开（恢复路径存在）')
})

test('mcp-servers.json 为 {} 或形状不对时不得放行任何条目', async () => {
  for (const literal of ['{}', '{"servers": {}}', 'null']) {
    resetHome()
    writeFileSync(MCP_FILE, literal)
    const { table } = boot()
    const body = JSON.parse((await get(table, BASE + '/mcp-servers')).body)
    assert.equal(body.health.ok, false, `${literal} 必须报损坏`)
    for (const s of body.servers) assert.equal(s.enabled, false)
  }
})

/* ── 读不出来也不能炸掉路由 ───────────────────────────────────────────── */

test('store 文件读不出来（EISDIR）时四条路由都给出干净响应，不会悬挂', async () => {
  resetHome()
  rmSync(OAUTH_FILE, { force: true })
  mkdirSync(OAUTH_FILE, { recursive: true })

  const { table } = boot()
  const status = await get(table, BASE + '/oauth/status')
  assert.equal(status.statusCode, 200)
  const statusBody = JSON.parse(status.body)
  assert.equal(statusBody.authed, false)
  assert.equal(statusBody.health.code, 'oauth_token_unreadable')

  for (const path of [BASE + '/list', BASE + '/mcp-servers']) {
    const res = await get(table, path)
    assert.equal(res.statusCode, 200, `${path} 不得因读失败而悬挂或 5xx`)
  }
  const mcpBody = JSON.parse((await get(table, BASE + '/mcp-servers')).body)
  assert.equal(mcpBody.oauthState.authed, false, 'token 读不出来 = 未授权（fail-closed）')
  assert.equal(mcpBody.oauthState.health.code, 'oauth_token_unreadable')

  // 相邻文件读不出来**不得**连累别的路由：状态开关照常可写。
  const toggle = await post(table, BASE + '/toggle', { id: 'getnote-brain', field: 'modelInvoke', value: true })
  assert.equal(toggle.statusCode, 200, 'token 文件的问题不该让状态开关也失效')
})

/* ── 凭证文件不得回显 ─────────────────────────────────────────────────── */

test('损坏的 token 文件不回显任何原文（excerpt 必须是空的）', async () => {
  resetHome()
  const secret = '{"access_token": "gk_live_SUPERSECRET1234567890", "refresh_token": "rt_SECRET'
  writeFileSync(OAUTH_FILE, secret)

  const { table } = boot()
  const res = await get(table, BASE + '/oauth/status')
  const body = JSON.parse(res.body)
  assert.equal(body.health.code, 'oauth_token_corrupt')
  assert.equal(body.health.excerpt, '', 'token 正文就是密钥，不得进响应体')
  assert.equal(res.body.includes('SUPERSECRET'), false)
  assert.equal(readFileSync(OAUTH_FILE, 'utf8'), secret, '原字节仍留在盘上供取证')
})

/* ── 并发与全或无 ─────────────────────────────────────────────────────── */

test('并发 toggle 不丢更新（旧实现两边都返回 200，磁盘只落一条）', async () => {
  resetHome()
  writeFileSync(CONNECTIONS_FILE, JSON.stringify({ schemaVersion: 1, connections: [
    { id: 'getnote-brain', enabled: true },
    { id: 'pixpix', enabled: false },
  ] }))

  const { table } = boot()
  const [a, b] = await Promise.all([
    post(table, BASE + '/toggle', { id: 'getnote-brain', field: 'enabled', value: false }),
    post(table, BASE + '/toggle', { id: 'pixpix', field: 'enabled', value: true }),
  ])
  assert.equal(a.statusCode, 200)
  assert.equal(b.statusCode, 200)

  const onDisk = JSON.parse(readFileSync(CONNECTIONS_FILE, 'utf8')).connections
  const byId = new Map(onDisk.map((c) => [c.id, c.enabled]))
  assert.equal(byId.get('getnote-brain'), false, '第一个已确认的更新必须留下')
  assert.equal(byId.get('pixpix'), true, '第二个已确认的更新必须留下')
})

test('联动写入是全或无：mcp 侧损坏时 connections 一个字节都不动', async () => {
  resetHome()
  writeFileSync(CONNECTIONS_FILE, JSON.stringify({ schemaVersion: 1, connections: [
    { id: 'shopify', enabled: false, mcpServerId: 'shopify' },
  ] }))
  writeFileSync(MCP_FILE, '{"servers": [')

  const { table } = boot()
  const before = readFileSync(CONNECTIONS_FILE, 'utf8')
  const res = await post(table, BASE + '/toggle', { id: 'shopify', field: 'enabled', value: true })

  assert.equal(res.statusCode, 409)
  assert.equal(readFileSync(CONNECTIONS_FILE, 'utf8'), before, '报了错就不许改一半（错误读数必须与磁盘一致）')
})

test('token 落盘走「归档后重写」：损坏文件被改名保留，新 token 写得进去', async () => {
  resetHome()
  const corrupt = '{"access_token": "truncated'
  writeFileSync(OAUTH_FILE, corrupt)

  // 直接经 store 的例外通道验证（真实 token 交换需要网络，见 ADR-0099 的未验证项）。
  const { atomicStore } = await import('../lib/atomic-store.js')
  const r = await atomicStore.replaceAfterArchive(OAUTH_FILE, { access_token: 'new-token' })
  assert.ok(r.archived, '损坏原字节必须被归档而不是抹掉')
  assert.equal(readFileSync(r.archived, 'utf8'), corrupt)
  assert.equal(JSON.parse(readFileSync(OAUTH_FILE, 'utf8')).access_token, 'new-token')
  const archives = readdirSync(WANZH_DIR).filter((n) => n.includes('.corrupt-'))
  assert.equal(archives.length, 1)
})

test('归档通道只对不可解析文件生效：正常文件写后不留归档', async () => {
  resetHome()
  const { atomicStore } = await import('../lib/atomic-store.js')
  await atomicStore.writeJson(OAUTH_FILE, { access_token: 'a' })
  const r = await atomicStore.replaceAfterArchive(OAUTH_FILE, { access_token: 'b' })
  assert.equal(r.archived, null)
  assert.equal(existsSync(OAUTH_FILE), true)
  assert.equal(readdirSync(WANZH_DIR).filter((n) => n.includes('.corrupt-')).length, 0)
})

test('队列重入当场报错（挂死没有读数，报错才有）', async () => {
  const { createSerialQueue } = await import('../lib/atomic-store.js')
  const queue = createSerialQueue()
  await assert.rejects(
    () => queue.run(() => queue.run(() => 1)),
    /重入/,
  )
})
