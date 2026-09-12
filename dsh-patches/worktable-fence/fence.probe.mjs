#!/usr/bin/env node
/**
 * worktable 信任栅栏的**真实 socket 级负向探针**。
 *
 * 与 fence.test.mjs 的分工：
 *   fence.test.mjs  在进程内直接调判据函数（快、覆盖全，但请求对象是造的）。
 *   本文件          起一个真 http 服务器，**用真 curl 发真请求**打真实的 socket
 *                   （字节级的 Host / Origin / Sec-Fetch-Site 头、真实的 WS 升级握手）。
 *
 * 为什么两层都要：进程内测试证明「判据写对了」，socket 级探针证明「判据真的挂在线上」——
 * 后者才是用户能观测到的行为。两者都保留。
 *
 * 用法：node dsh-patches/worktable-fence/fence.probe.mjs
 * 退出码：0 = 全部符合预期；1 = 有不符合项；2 = 环境缺失。
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
const BUNDLE = join(REPO_ROOT, 'vendor', 'dsh-worktable', '01_content', 'lib', 'index.js')
const OUTSIDE_TMP = '/tmp/lute-fence-probe.txt' // /private/tmp 世界可写、且在允许根之外——真实可写的越界目标
const INSIDE_TMP = join(tmpdir(), `lute-fence-probe-${process.pid}.txt`)

if (!existsSync(BUNDLE)) {
  console.error(`[fence.probe] 环境缺失：读不到 ${BUNDLE}（vendor/dsh-worktable 未 clone？）`)
  process.exit(2)
}

// ── 假 webServer → 真 http 服务器 ───────────────────────────────────────────
// 只实现 DSH webserver 契约里 worktable 实际用到的那部分：register + registerUpgrade。
const exact = []
const prefix = []
const upgrades = []
const webServer = {
  register(route) {
    ;(route.kind === 'prefix' ? prefix : exact).push(route)
  },
  registerUpgrade(route) {
    upgrades.push(route)
  },
}

const ctx = {
  webServer,
  logger: { warn() {}, info() {} },
  sessions: { get: () => undefined },
  effect: (fn) => { fn(); return () => {} },
  get: () => undefined,
}

const mod = await import(pathToFileURL(BUNDLE).href)
mod.apply(ctx)

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
  for (const route of exact) if (route.path === pathname) return route.handler(req, res)
  for (const route of prefix) if (pathname.startsWith(route.path)) return route.handler(req, res)
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('no route')
})

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
  const route = upgrades.find((candidate) => pathname.startsWith(candidate.path))
  if (route === undefined) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  route.handler(req, socket, head)
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const PORT = server.address().port
const BASE = `http://127.0.0.1:${PORT}`
console.log(`[fence.probe] 真实服务器已起：${BASE}`)
console.log(`[fence.probe] 路由：exact=${exact.length} prefix=${prefix.length} upgrade=${upgrades.length}`)
if (upgrades.length === 0) {
  console.log('[fence.probe] 注意：终端升级路由未注册（ws/node-pty 不可达），WS 相关用例会落到 404。')
}

// ── 探针 ────────────────────────────────────────────────────────────────────
let pass = 0
const failures = []

/**
 * curl 必须是**异步**的。第一版用了 execFileSync，而 execFileSync 会阻塞本进程的事件循环——
 * 服务器就跑在同一个事件循环上，于是「curl 等服务器 accept、服务器等 curl 让出事件循环」死锁，
 * 每个请求都以 %{http_code}=000（连不上）收场，23 条探针全红。
 * 这类错误最容易被误读成「栅栏坏了」，实际是探针自己把自己堵住了。
 */
async function curl(args) {
  try {
    const { stdout } = await execFileAsync('curl', ['--max-time', '8', ...args], { encoding: 'utf8', timeout: 15000 })
    return stdout
  } catch (error) {
    // curl 对 101 之后的连接会一直等 WebSocket 帧（直到 --max-time），非零退出但 stdout 有状态行
    return String(error.stdout ?? '')
  }
}

/** 只取 HTTP 状态码。 */
async function status(args) {
  return (await curl(['-sS', '-o', '/dev/null', '-w', '%{http_code}', ...args])).trim()
}

/** 取响应体里的 reason 字段（非 JSON 时返回原文）。 */
async function reason(args) {
  const body = await curl(['-sS', ...args])
  try {
    return JSON.parse(body).reason ?? body
  } catch {
    return body.split('\n')[0]
  }
}

/**
 * WS 升级用：`-w %{http_code}` 在连接被升级后拿不到值（传输没有「结束」），
 * 所以改读响应头首行的状态码——升级响应头是立刻发出来的。
 */
async function upgradeStatus(args) {
  const head = (await curl(['-sS', '-i', ...args])).split('\n')[0] ?? ''
  return (head.match(/^HTTP\/[\d.]+\s+(\d{3})/) ?? [])[1] ?? `(无状态行: ${head.trim()})`
}

/**
 * actual 允许是 Promise——由本函数 await，调用点就不必写 `await expect(…, await status(…), …)`。
 * （第一版没这么做，于是 24 条断言全部拿到 `[object Promise]`。）
 */
async function expect(label, actual, wanted) {
  const value = await actual
  if (String(value) === String(wanted)) pass += 1
  else failures.push(`${label}\n      期望 ${wanted}，实际 ${value}`)
}

// ① 正向对照：正常回环请求必须放行。
await expect('正向 · 回环 GET /health → 200', status([`${BASE}/api/worktable/health`]), '200')

// ② 来源判据三态。
await expect('负向 · Sec-Fetch-Site: cross-site → 403',
  status(['-H', 'Sec-Fetch-Site: cross-site', `${BASE}/api/worktable/health`]), '403')
await expect('负向 · Origin 跨源 → 403',
  status(['-H', 'Origin: https://evil.example', `${BASE}/api/worktable/health`]), '403')
await expect('负向 · Origin: null → 403',
  status(['-H', 'Origin: null', `${BASE}/api/worktable/health`]), '403')
await expect('负向 · Host 非回环（DNS rebinding）→ 403',
  status(['-H', 'Host: evil.example', `${BASE}/api/worktable/health`]), '403')
await expect('正向 · Origin 同源 → 200',
  status(['-H', `Origin: http://127.0.0.1:${PORT}`, `${BASE}/api/worktable/health`]), '200')
await expect('原因码 · cross-site', reason(['-H', 'Sec-Fetch-Site: cross-site', `${BASE}/api/worktable/health`]), 'cross-site')
await expect('原因码 · host-not-loopback', reason(['-H', 'Host: evil.example', `${BASE}/api/worktable/health`]), 'host-not-loopback')

// ③ 允许根：读。
await expect('负向 · GET /file 读 /etc/hosts → 403',
  status([`${BASE}/api/worktable/file?path=/etc/hosts`]), '403')
await expect('原因码 · path-outside-allowed-roots',
  reason([`${BASE}/api/worktable/file?path=/etc/hosts`]), 'path-outside-allowed-roots')
await expect('负向 · GET /site 托管 /etc → 403',
  status([`${BASE}/api/worktable/site/%2Fetc/hosts`]), '403')

// ④ 允许根：写。/tmp 在允许根之外且真实可写——所以「403 且文件不存在」是真证据。
rmSync(OUTSIDE_TMP, { force: true })
await expect('负向 · POST /write 越根写 /tmp → 403',
  status(['-X', 'POST', '-H', 'content-type: application/json',
    '-d', JSON.stringify({ path: OUTSIDE_TMP, content: 'pwned' }), `${BASE}/api/worktable/write`]), '403')
await expect('负向 · 越根写之后文件确实不存在（未落地）', existsSync(OUTSIDE_TMP), false)

await expect('负向 · POST /mkdir 越根建目录 → 403',
  status(['-X', 'POST', '-H', 'content-type: application/json',
    '-d', JSON.stringify({ path: '/tmp/lute-fence-probe-dir' }), `${BASE}/api/worktable/mkdir`]), '403')
await expect('负向 · POST /fs 列举 /etc → 403',
  status(['-X', 'POST', '-H', 'content-type: application/json',
    '-d', JSON.stringify({ path: '/etc' }), `${BASE}/api/worktable/fs`]), '403')
await expect('负向 · POST /git 越根 cwd → 403',
  status(['-X', 'POST', '-H', 'content-type: application/json',
    '-d', JSON.stringify({ cwd: '/etc' }), `${BASE}/api/worktable/git`]), '403')

// ⑤ 路径穿越：以允许根前缀开头、归一后越界。这条专门验证「先归一后比对」。
const traversal = join(process.env.HOME ?? '', '..', '..', 'tmp', 'lute-fence-probe2.txt')
await expect('负向 · 家目录前缀 + 穿越 → 403',
  status(['-X', 'POST', '-H', 'content-type: application/json',
    '-d', JSON.stringify({ path: traversal, content: 'pwned' }), `${BASE}/api/worktable/write`]), '403')

// ⑥ 正向对照：根内写必须真的落盘。
rmSync(INSIDE_TMP, { force: true })
await expect('正向 · POST /write 根内写 → 200',
  status(['-X', 'POST', '-H', 'content-type: application/json',
    '-d', JSON.stringify({ path: INSIDE_TMP, content: 'lute-ok' }), `${BASE}/api/worktable/write`]), '200')
await expect('正向 · 根内写之后文件确实存在', existsSync(INSIDE_TMP), true)
await expect('正向 · 文件内容正确', existsSync(INSIDE_TMP) ? readFileSync(INSIDE_TMP, 'utf8') : '(缺失)', 'lute-ok')

// ⑦ WebSocket 升级：浏览器必然带 Origin，因此缺失即拒（这是唯一的跨源防线）。
const wsHeaders = [
  '-H', 'Connection: Upgrade',
  '-H', 'Upgrade: websocket',
  '-H', 'Sec-WebSocket-Version: 13',
  '-H', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
]
const wsUrl = `${BASE}/api/worktable/term`
await expect('负向 · WS 升级 跨源 Origin → 403',
  upgradeStatus([...wsHeaders, '-H', 'Origin: https://evil.example', wsUrl]), '403')
await expect('负向 · WS 升级 无 Origin → 403',
  upgradeStatus([...wsHeaders, wsUrl]), '403')
await expect('负向 · WS 升级 Origin: null → 403',
  upgradeStatus([...wsHeaders, '-H', 'Origin: null', wsUrl]), '403')
// 正向对照：同源升级必须穿过栅栏到达原 handler（101 = 握手成功）。
// 若此处得到 404，说明 ws/node-pty 不可达、终端路由根本没注册——那是环境问题，不是栅栏问题。
await expect('正向 · WS 升级 同源 Origin → 101（到达原 handler）',
  upgradeStatus([...wsHeaders, '-H', `Origin: http://127.0.0.1:${PORT}`, wsUrl]), '101')

rmSync(INSIDE_TMP, { force: true })
server.close()

// ── 汇总 ────────────────────────────────────────────────────────────────────
console.log('')
if (failures.length > 0) {
  console.error(`[fence.probe] 失败 ${failures.length} 项 / 通过 ${pass} 项\n`)
  for (const failure of failures) console.error('  ✗ ' + failure + '\n')
  process.exit(1)
}
console.log(`[fence.probe] 全部符合预期：${pass} 项（含 5 项正向对照）`)
process.exit(0)
