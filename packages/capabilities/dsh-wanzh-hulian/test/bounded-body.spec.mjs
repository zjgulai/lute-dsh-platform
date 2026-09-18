import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * dsh-wanzh-hulian — 有界请求体（SEC-RT-005）。
 *
 * 为什么用**真实 socket** 而不是像 oauth-routes.spec.mjs 那样喂假 req 对象：
 * 本卡要覆盖的正是假对象造不出来的形态——chunked（无 content-length）、
 * 伪造的 content-length、slow body（headers 到了 body 没到）、以及「超限后
 * 连接不能永久挂起」。假对象只能证明「代码跑了」，证明不了这些。
 */

const FAKE_HOME = mkdtempSync(join(tmpdir(), 'wanzh-bounded-'))
process.env.HOME = FAKE_HOME
mkdirSync(join(FAKE_HOME, '.dsh', 'integrations', 'getnote'), { recursive: true, mode: 0o700 })
mkdirSync(join(FAKE_HOME, '.dsh', 'integrations', 'wanzh-hulian'), { recursive: true, mode: 0o700 })

const { apply } = await import('../lib/index.js')
const {
  readBoundedJson,
  BodyLimitError,
  SETTINGS_JSON_MAX_BYTES,
  SETTINGS_READ_DEADLINE_MS,
} = await import('../lib/bounded-body.js')

const BASE = '/api/dsh-wanzh-hulian'
const CONNECTIONS = join(FAKE_HOME, '.dsh', 'integrations', 'wanzh-hulian', 'connections.json')

/* ── 夹具 ─────────────────────────────────────────────────────────────── */

/** 录制插件注册的路由表（与 oauth-routes.spec.mjs 同一套最小 ctx）。 */
function bootRoutes() {
  const table = new Map()
  apply({
    credentials: { resolve: async () => ({ value: '' }), set: async () => {}, describe: async () => ({}) },
    get: () => undefined,
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    tools: { register() {} },
    webServer: {
      register(spec) {
        table.set(spec.path, spec.handler)
        return () => {}
      },
    },
  })
  return table
}

/**
 * 起真监听并返回端口。
 *
 * 两处类型收窄都不是为了过 tsc 而写的：`server.address()` 的返回类型是
 * `string | AddressInfo | null`（`string` 出现在 Unix socket 上），
 * 直接 `.port` 在类型层和运行层都可能落空；而 `listen` 的回调签名是 `() => void`，
 * 把 `new Promise` 的 `resolve`（`(value: unknown) => void`）直接当回调传进去
 * 既有类型错误、也把「listen 失败」吞成了成功。
 * @param {import('node:http').Server} server 已创建未监听的 server
 * @returns {Promise<number>} 实际监听到的端口
 */
async function listenOn(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error(`server.address() 没有返回 AddressInfo：${JSON.stringify(address)}`)
  }
  return address.port
}

/** 裸 server：直接跑给定 handler（用于单测 reader 本体）。 */
async function bareServer(handle) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handle(req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end('handler-error')
    })
  })
  return { server, port: await listenOn(server) }
}

/** 把插件路由挂到真 server 上（用于验证端点确实走有界读取）。 */
async function pluginServer(table) {
  const server = http.createServer(async (req, res) => {
    const path = (req.url ?? '').split('?')[0]
    const handler = table.get(path)
    if (!handler) {
      res.writeHead(404)
      return res.end('no-route')
    }
    await handler(req, res)
  })
  return { server, port: await listenOn(server) }
}

/**
 * 解析一条原始 HTTP 响应（含 chunked 解块）。
 *
 * 两件事都不能省：
 *  ① Node 对未知长度的响应默认用 `Transfer-Encoding: chunked`，不解块就对裸字节
 *     `JSON.parse` 会炸在分块长度行上；
 *  ② 解块**必须按字节走**——chunk 长度是十六进制字节数，而 JS 字符串下标是字符。
 *     用 `String.slice` 切含中文的响应会多切（一个汉字 3 字节却只算 1 个字符），
 *     报错是 "Unexpected non-whitespace character after JSON"。
 *     本文件当前用例恰好都是 ASCII 响应，所以踩不到；但那是运气不是设计。
 * @param {Buffer} buffer 原始响应
 */
function parseResponse(buffer) {
  const split = buffer.indexOf('\r\n\r\n')
  if (split < 0) return { status: 0, headers: {}, body: '' }
  const headLines = buffer.subarray(0, split).toString('latin1').split('\r\n')
  const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(headLines[0])?.[1] ?? 0)
  /** @type {Record<string, string>} */
  const headers = {}
  for (const line of headLines.slice(1)) {
    const i = line.indexOf(':')
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  let body = buffer.subarray(split + 4)
  if ((headers['transfer-encoding'] ?? '').includes('chunked')) {
    /** @type {Buffer[]} */
    const parts = []
    let off = 0
    for (;;) {
      const eol = body.indexOf('\r\n', off)
      if (eol < 0) break
      const size = parseInt(body.subarray(off, eol).toString('latin1'), 16)
      if (!Number.isFinite(size) || size === 0) break
      parts.push(body.subarray(eol + 2, eol + 2 + size))
      off = eol + 2 + size + 2
    }
    body = Buffer.concat(parts)
  }
  return { status, headers, body: body.toString('utf8') }
}

/**
 * 发一条原始 HTTP 请求并收集响应。
 * @param {number} port 端口
 * @param {(socket: net.Socket) => void} write 连上后要写什么（可分段/延迟）
 * @param {number} [timeoutMs] 超过则判定为「挂起」并强制断开
 */
function rawExchange(port, write, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    /** @type {Buffer[]} */
    const chunks = []
    let settled = false
    const finish = (hung) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const buf = Buffer.concat(chunks)
      resolve({ ...parseResponse(buf), raw: buf.toString('utf8'), hung, closedByPeer: !hung })
    }
    const timer = setTimeout(() => { socket.destroy(); finish(true) }, timeoutMs)
    socket.on('connect', () => write(socket))
    socket.on('data', (c) => { chunks.push(c) })
    socket.on('close', () => finish(false))
    socket.on('error', () => finish(false))
  })
}

const closeServer = (s) => new Promise((r) => s.close(r))

test.after(() => rmSync(FAKE_HOME, { recursive: true, force: true }))

/* ── 1. reader 本体的边界（真实 socket + 显式 opts）───────────────────── */

/**
 * 只跑「读一个 body」的最小 server：把 reader 的判定直接映射成 HTTP 码，
 * 让每条用例只表达一件事。
 * @param {{ maxBytes: number, deadlineMs: number }} opts 传给 reader 的 opts
 */
async function readerServer(opts) {
  return bareServer(async (req, res) => {
    const err = await readBoundedJson(req, opts).then(() => null, (e) => e)
    res.writeHead(err ? err.status : 200, { connection: 'close' })
    res.end(JSON.stringify(err ? { code: err.code } : { ok: true }))
  })
}

test('边界值：恰好 maxBytes 通过，+1 byte 判 413', async () => {
  const CAP = 64
  const { server, port } = await readerServer({ maxBytes: CAP, deadlineMs: 2000 })
  try {
    // 造一个**有效 JSON** 且字节数恰好等于 CAP 的 body。
    const prefix = '{"a":"'
    const suffix = '"}'
    const exact = prefix + 'x'.repeat(CAP - prefix.length - suffix.length) + suffix
    assert.equal(Buffer.byteLength(exact), CAP, '夹具必须精确落在边界上，否则这条断言没有意义')

    const ok = await rawExchange(port, (s) => {
      s.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${CAP}\r\nConnection: close\r\n\r\n${exact}`)
    })
    assert.equal(ok.status, 200, '恰好等上限必须放行（上限是「不超过」不是「小于」）')

    const over = await rawExchange(port, (s) => {
      const body = `{"a":"${'x'.repeat(CAP)}"}`
      s.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`)
    })
    assert.equal(over.status, 413, '+1 byte 必须 413')
    assert.equal(JSON.parse(over.body).code, 'BODY_TOO_LARGE')
  } finally {
    await closeServer(server)
  }
})

// 刻意没有「声明 10 字节却发 500 字节」这条用例：HTTP/1.1 下它**不可表达**。
// Node 的解析器把 Content-Length 当作帧边界，多出来的字节会被当成下一个管线请求，
// 于是拿到的是解析层 400 而不是我们的 413（2026-09-16 实测，初版用例正是这么写错的）。
// 「不能只信 Content-Length」这条要求，真实的对抗形态是下面两条：
// 分块传输（没有 Content-Length）与逐个合法但累计超限的小块。
test('分块传输：每个 chunk 都远小于上限，累计超限仍判 413', async () => {
  const CAP = 64
  const { server, port } = await readerServer({ maxBytes: CAP, deadlineMs: 2000 })
  try {
    const res = await rawExchange(port, (s) => {
      s.write('POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n')
      // 每块 8 字节、共 32 块 = 256 字节，单块远小于 64 —— 任何「按块判大小」的实现都会放行。
      for (let i = 0; i < 32; i += 1) {
        const chunk = Buffer.from('z'.repeat(8), 'utf8')
        s.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`)
      }
      s.write('0\r\n\r\n')
    })
    assert.equal(res.status, 413, 'chunked 没有 Content-Length，只能靠累计计数拦住')
    assert.equal(JSON.parse(res.body).code, 'BODY_TOO_LARGE')
  } finally {
    await closeServer(server)
  }
})

test('body 传到一半客户端断开：读取立即收敛为 BODY_ABORTED，不空等满 deadline', async () => {
  // 不能断言 HTTP 状态码：客户端已经把 socket 掐了，没有对象可以收 400。
  // 可证伪的点是**收敛时机**——不处理 'close' 的实现会一直等到 deadline(5s) 才返回。
  const DEADLINE = 5000
  /** @type {(err: unknown) => void} */
  let report = () => {}
  const outcome = new Promise((r) => { report = r })
  const { server, port } = await bareServer(async (req, res) => {
    const err = await readBoundedJson(req, { maxBytes: 1024, deadlineMs: DEADLINE }).then(() => null, (e) => e)
    report(err)
    // 客户端已走，写响应必然失败；这里只求不把进程带崩。
    try { res.writeHead(err?.status ?? 200, { connection: 'close' }); res.end('{}') } catch { /* 连接已断 */ }
  })
  try {
    const started = Date.now()
    await rawExchange(port, (s) => {
      s.write('POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n')
      s.write('{"a":"0123456789012')
      setTimeout(() => s.destroy(), 30)
    }, 3000)

    const err = await Promise.race([
      outcome,
      new Promise((r) => setTimeout(() => r(new Error('reader 没有收敛')), DEADLINE - 500)),
    ])
    const elapsed = Date.now() - started

    assert.ok(err instanceof BodyLimitError, `期望 BodyLimitError，实际 ${String(err)}`)
    assert.equal(err.code, 'BODY_ABORTED')
    assert.equal(err.status, 400)
    assert.ok(elapsed < DEADLINE / 4, `必须远早于 deadline 收敛，实测 ${elapsed}ms（deadline ${DEADLINE}ms）`)
  } finally {
    await closeServer(server)
  }
})

test('slow body：超 deadline 判 408，且不永久挂起', async () => {
  const { server, port } = await bareServer(async (req, res) => {
    const err = await readBoundedJson(req, { maxBytes: 1024, deadlineMs: 80 }).then(
      () => null,
      (e) => e,
    )
    assert.ok(err instanceof BodyLimitError, 'slow body 必须抛 BodyLimitError')
    assert.equal(err.code, 'BODY_TIMEOUT')
    res.writeHead(err.status, { connection: 'close' })
    res.end(JSON.stringify({ ok: false, code: err.code }))
  })
  try {
    const res = await rawExchange(port, (s) => {
      // 只发头，不发 body：Content-Length 声明 100 但一个字节都不来。
      s.write('POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n')
    })
    assert.equal(res.hung, false, '超时必须回包，不能把连接永久挂起')
    assert.equal(res.status, 408)
  } finally {
    await closeServer(server)
  }
})

test('超限时不读满 body 也不回显原文（凭证不进响应）', async () => {
  const { server, port } = await bareServer(async (req, res) => {
    const err = await readBoundedJson(req, { maxBytes: 32, deadlineMs: 2000 }).then(
      () => null,
      (e) => e,
    )
    res.writeHead(err?.status ?? 500, { connection: 'close' })
    res.end(JSON.stringify({ ok: false, code: err?.code ?? 'X', error: err?.message ?? '' }))
  })
  try {
    const secret = 'sk-SUPERSECRET-VALUE-MUST-NOT-ECHO'
    const res = await rawExchange(port, (s) => {
      const body = JSON.stringify({ token: secret, pad: 'p'.repeat(200) })
      s.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`)
    })
    assert.equal(res.status, 413)
    assert.ok(!res.raw.includes(secret), '错误响应绝不能回显原始 body')
  } finally {
    await closeServer(server)
  }
})

test('解析失败判 400，且不回显原文', async () => {
  const { server, port } = await bareServer(async (req, res) => {
    const err = await readBoundedJson(req, { maxBytes: 1024, deadlineMs: 2000 }).then(
      () => null,
      (e) => e,
    )
    res.writeHead(err?.status ?? 500, { connection: 'close' })
    res.end(JSON.stringify({ ok: false, code: err?.code ?? 'X' }))
  })
  try {
    const body = '{ this is not json sk-LEAKCANARY }'
    const res = await rawExchange(port, (s) => {
      s.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`)
    })
    assert.equal(res.status, 400)
    assert.ok(!res.raw.includes('LEAKCANARY'), '400 不得回显 body')
  } finally {
    await closeServer(server)
  }
})

test('Content-Length 声明即超限：不必等到 body 到齐就判 413', async () => {
  // 可证伪形式：客户端**只发头、一个 body 字节都不发**。
  // 没有头部快路径的实现只能等满 deadline，于是会返回 408 —— 这条断言正是卡它。
  const DEADLINE = 3000
  const { server, port } = await bareServer(async (req, res) => {
    const err = await readBoundedJson(req, { maxBytes: 64, deadlineMs: DEADLINE }).then(
      () => null,
      (e) => e,
    )
    res.writeHead(err?.status ?? 500, { connection: 'close' })
    res.end(JSON.stringify({ code: err?.code ?? 'X' }))
  })
  try {
    const started = Date.now()
    const res = await rawExchange(port, (s) => {
      s.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100000\r\nConnection: close\r\n\r\n`)
    }, DEADLINE + 2000)
    const elapsed = Date.now() - started

    assert.equal(res.hung, false)
    assert.equal(res.status, 413, `头部已声明超限就该立刻 413；拿到 ${res.status} 说明它去等了 body`)
    assert.equal(JSON.parse(res.body).code, 'BODY_TOO_LARGE')
    assert.ok(elapsed < DEADLINE / 2, `必须远早于 deadline 返回，实测 ${elapsed}ms（deadline ${DEADLINE}ms）`)
  } finally {
    await closeServer(server)
  }
})

/* ── 2. 端点级：插件路由确实用的是有界读取，且超限不触发 handler ─────────── */

test('POST /toggle 超限：413 且连接配置一个字节都没被改写（handler 不执行）', async () => {
  const table = bootRoutes()
  const { server, port } = await pluginServer(table)
  const before = JSON.stringify({ connections: [{ id: 'getnote-brain', enabled: false }] })
  writeFileSync(CONNECTIONS, before, { mode: 0o600 })
  try {
    const body = JSON.stringify({ id: 'getnote-brain', field: 'enabled', value: true, pad: 'p'.repeat(SETTINGS_JSON_MAX_BYTES) })
    const res = await rawExchange(port, (s) => {
      s.write(`POST ${BASE}/toggle HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`)
    })
    assert.equal(res.status, 413)
    assert.equal(readFileSync(CONNECTIONS, 'utf8'), before, '超限请求绝不能进入业务 handler 写配置')
  } finally {
    await closeServer(server)
  }
})

test('POST /toggle 正常体积不回归：200 且配置按预期改写', async () => {
  const table = bootRoutes()
  const { server, port } = await pluginServer(table)
  writeFileSync(CONNECTIONS, JSON.stringify({ connections: [{ id: 'getnote-brain', enabled: false }] }), { mode: 0o600 })
  try {
    const body = JSON.stringify({ id: 'getnote-brain', field: 'enabled', value: true })
    const res = await rawExchange(port, (s) => {
      s.write(`POST ${BASE}/toggle HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`)
    })
    assert.equal(res.status, 200, res.raw)
    assert.equal(JSON.parse(readFileSync(CONNECTIONS, 'utf8')).connections[0].enabled, true)
  } finally {
    await closeServer(server)
  }
})

test('上限常量本身是有意图的：不会退化成「无限」或「小到打断正常交互」', () => {
  assert.ok(SETTINGS_JSON_MAX_BYTES > 0 && Number.isFinite(SETTINGS_JSON_MAX_BYTES))
  // 卡内建议 64 KiB；这里是登记值，改了必须同时改这条断言（防止被静默调大）。
  assert.equal(SETTINGS_JSON_MAX_BYTES, 64 * 1024)
  assert.ok(SETTINGS_READ_DEADLINE_MS > 0 && Number.isFinite(SETTINGS_READ_DEADLINE_MS))
})
