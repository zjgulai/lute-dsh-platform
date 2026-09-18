import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * dsh-wanzh-hulian — 持久化 fail-closed 与原子性（SEC-RT-006）的宿主级契约。
 *
 * 为什么要有这一层：`atomic-store.spec.mjs` 证明的是**写入器**的性质，而本卡真正的
 * 缺陷在**接线处**——`readState()` 的 `catch { 回退默认 }` 让损坏配置静默把能力打开；
 * `readConnections()`/`readMcpServers()` 的损坏回退把**默认清单**当成用户配置，
 * 而默认清单里有 `enabled:true` 的条目。写入器修好了、接线没修，缺陷一模一样地活着
 * （本仓 pitfalls P-07：改对了一半也要当成没改）。
 *
 * 所以这里跑一遍真实 `apply()`，把 `webServer.register` 的 handler 截下来真的调用，
 * 且**整个过程跑在临时 HOME 里**：`~/.dsh/integrations/**` 与 `~/.dsh/skills/**` 全部
 * 落在 mkdtemp 出来的目录，真实 `~/.dsh` 一个字节都不碰（QG-006A 的隔离约定）。
 */

const FAKE_HOME = mkdtempSync(join(tmpdir(), 'wanzh-home-'))
process.env.HOME = FAKE_HOME

const GETNOTE_DIR = join(FAKE_HOME, '.dsh', 'integrations', 'getnote')
const WANZH_DIR = join(FAKE_HOME, '.dsh', 'integrations', 'wanzh-hulian')
const STATE_FILE = join(GETNOTE_DIR, 'config.json')
const CONNECTIONS_FILE = join(WANZH_DIR, 'connections.json')
const MCP_FILE = join(WANZH_DIR, 'mcp-servers.json')

const { apply } = await import('../lib/index.js')

const BASE = '/api/dsh-wanzh-hulian'

/** 回环请求基线（Host 头也必须是回环，见 isLoopbackRequest）。 */
const LOOPBACK = {
  method: 'GET',
  url: '/',
  socket: { remoteAddress: '127.0.0.1' },
  headers: { host: '127.0.0.1:43120' },
}

/**
 * 最小请求对象：`readBody` 用的是 `req.on('data'|'end'|'error')`，
 * 所以 POST 用例必须给一个**真的会发事件**的流替身，而不是普通对象。
 * @param {{ method?: string, body?: string }} [init] 方法与该次请求的原始 body。
 */
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

/** 跑一遍 apply，截下路由表与注册的工具。 */
function boot() {
  const table = new Map()
  const disposers = []
  const tools = []
  apply({
    credentials: { resolve: async () => ({ value: '' }), set: async () => {}, describe: async () => ({}) },
    get: () => undefined,
    effect(fn) {
      const dispose = fn()
      disposers.push(typeof dispose === 'function' ? dispose : () => {})
      return () => {}
    },
    tools: { register(def) { tools.push(def) } },
    webServer: {
      register(spec) {
        table.set(spec.path, spec.handler)
        return () => {}
      },
    },
  })
  return { table, disposers, tools }
}

/** 调一次 handler，收集状态码与响应体。 */
function call(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      body: '',
      writeHead(status) {
        this.statusCode = status
      },
      end(chunk) {
        this.body = chunk === undefined ? '' : String(chunk)
        resolve(this)
      },
    }
    handler(req ?? request(), res)
  })
}

async function getJson(path, req) {
  const { table } = boot()
  const res = await call(table.get(path), req)
  return { statusCode: res.statusCode, body: JSON.parse(res.body) }
}

function postJson(path, payload) {
  return getJson(path, request({ method: 'POST', body: JSON.stringify(payload) }))
}

function resetHome() {
  rmSync(join(FAKE_HOME, '.dsh'), { recursive: true, force: true })
  mkdirSync(GETNOTE_DIR, { recursive: true, mode: 0o700 })
  mkdirSync(WANZH_DIR, { recursive: true, mode: 0o700 })
}

test.after(() => rmSync(FAKE_HOME, { recursive: true, force: true }))

test('缺失配置文件：读数为好且来源为 default，不误判成损坏', async () => {
  resetHome()
  const { body } = await getJson(BASE + '/list')
  assert.equal(body.ok, true)
  assert.equal(body.health.ok, true, '「没配过」与「坏了」必须是两个读数')
  assert.deepEqual(body.health.issues, [])
  const getnote = body.connections.find((c) => c.id === 'getnote-brain')
  assert.equal(getnote.enabled, true, '文件不存在时沿用内置默认（enabled:true）')
})

test('损坏 config.json：健康读数结构化，原字节逐字节保留', async () => {
  resetHome()
  const corrupt = '{"enabled": tru'
  writeFileSync(STATE_FILE, corrupt)

  const { statusCode, body } = await getJson(BASE + '/list')
  assert.equal(statusCode, 200)
  assert.equal(body.health.ok, false)
  assert.equal(body.health.issues.length, 1)
  assert.equal(body.health.issues[0].code, 'state_corrupt')
  assert.equal(body.health.issues[0].file, '~/.dsh/integrations/getnote/config.json')
  assert.equal(body.health.issues[0].excerpt, corrupt)
  assert.equal(readFileSync(STATE_FILE, 'utf8'), corrupt, '损坏文件不得被读取路径改写')
})

test('损坏 config.json：工具入口按「断开 + 带原因」处理（旧实现会当作已连接继续往下走）', async () => {
  resetHome()
  writeFileSync(STATE_FILE, '{')

  const { tools } = boot()
  const topics = tools.find((t) => t.name === 'getnote_topics')
  assert.ok(topics, '前置条件：工具必须真的注册进来了（否则这条用例什么也没量到）')

  const value = await topics.execute({}, { credentials: { resolve: async () => ({ value: '' }) } })
  assert.equal(value.disconnected, true, '损坏配置下工具入口必须断开（旧实现读成 enabled:true 会继续执行）')
  assert.match(String(value.error), /损坏/, '必须说明原因：让用户去点一个写不进去的开关是误导')
})

test('损坏 config.json：写开关返回 409 结构化错误，原文件仍逐字节不变', async () => {
  resetHome()
  const corrupt = 'not json'
  writeFileSync(STATE_FILE, corrupt)

  const { statusCode, body } = await postJson(BASE + '/toggle', {
    id: 'getnote-brain',
    field: 'modelInvoke',
    value: true,
  })
  assert.equal(statusCode, 409)
  assert.equal(body.code, 'CORRUPT_STATE')
  assert.equal(body.file, '~/.dsh/integrations/getnote/config.json')
  assert.equal(readFileSync(STATE_FILE, 'utf8'), corrupt, '拒绝写入 = 不覆盖取证字节')
})

test('损坏 connections.json：逐条强制关闭（不回退启用中的默认清单）', async () => {
  resetHome()
  writeFileSync(CONNECTIONS_FILE, '{"connections": [{"id": "getnote-brain"')

  const { body } = await getJson(BASE + '/list')
  assert.equal(body.health.ok, false)
  assert.equal(body.health.issues[0].code, 'connections_corrupt')
  for (const c of body.connections) {
    assert.equal(c.enabled, false, `${c.id} 在损坏配置下必须关闭`)
  }
  assert.ok(
    body.connections.some((c) => c.id === 'getnote-brain'),
    '卡片元数据要保留，否则设置页连修复指引都画不出来',
  )
})

test('损坏 mcp-servers.json：没有任何 MCP 条目被放行（不因默认清单拉起外部进程）', async () => {
  resetHome()
  writeFileSync(MCP_FILE, '{"servers": [')

  const { body } = await getJson(BASE + '/mcp-servers')
  assert.equal(body.ok, true)
  assert.equal(body.health.ok, false)
  assert.equal(body.health.code, 'mcp_corrupt')
  for (const s of body.servers) {
    assert.equal(s.enabled, false, `${s.id} 在损坏清单下必须关闭`)
  }
})

test('schema 不对（servers 不是数组）同样按损坏处理，不静默当默认', async () => {
  resetHome()
  writeFileSync(MCP_FILE, JSON.stringify({ servers: 'oops' }))

  const { body } = await getJson(BASE + '/mcp-servers')
  assert.equal(body.health.ok, false)
  assert.equal(body.health.code, 'mcp_schema')
  for (const s of body.servers) assert.equal(s.enabled, false)
})

test('原子写生效：预建 0644 的 config.json 在成功写入后收紧到 0600', async () => {
  resetHome()
  writeFileSync(STATE_FILE, JSON.stringify({ enabled: true, modelInvoke: false }))
  chmodSync(STATE_FILE, 0o644)
  assert.equal(statSync(STATE_FILE).mode & 0o777, 0o644)

  const { statusCode, body } = await postJson(BASE + '/toggle', {
    id: 'getnote-brain',
    field: 'modelInvoke',
    value: true,
  })
  assert.equal(statusCode, 200)
  assert.equal(body.modelInvoke, true)
  assert.equal(statSync(STATE_FILE).mode & 0o777, 0o600, '既有 0644 必须在写后被收紧')
  assert.equal(JSON.parse(readFileSync(STATE_FILE, 'utf8')).modelInvoke, true)
})

test('写入保留未知字段：read-modify-write 不吞掉别人写下的键', async () => {
  resetHome()
  writeFileSync(STATE_FILE, JSON.stringify({ enabled: true, modelInvoke: false, defaultTopicId: 'topic-1', _probe: 42 }))

  const { statusCode } = await postJson(BASE + '/toggle', {
    id: 'getnote-brain',
    field: 'modelInvoke',
    value: true,
  })
  assert.equal(statusCode, 200)
  const onDisk = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  assert.equal(onDisk.defaultTopicId, 'topic-1', '别的入口写下的字段不得被这次写入吞掉')
  assert.equal(onDisk._probe, 42)
  assert.equal(onDisk.modelInvoke, true)
})
