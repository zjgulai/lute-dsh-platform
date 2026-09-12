#!/usr/bin/env node
/**
 * worktable 信任栅栏的契约测试。
 *
 * 为什么要有它：C0 的验收标准是「9 条入口全部被栅栏挡住」，而**源侧不校验**这件事
 * 光靠读代码看不出来——必须真的把请求发进去，看它是否被拒。
 * 本文件同时覆盖**正向对照**（合法请求必须放行），否则「全拒」也能骗过负向测试。
 *
 * 分两层：
 *   ① 单元层：直接 import fence.js（它只依赖 node: 内建，是独立 ESM 模块），逐条断言判据。
 *   ② 集成层：import 被补丁过的 vendor bundle，断言补丁落位、模块可加载、导出契约未变。
 *
 * 用法：node dsh-patches/worktable-fence/fence.test.mjs
 * 退出码：0 = 全部通过；1 = 有断言失败；2 = 环境缺失（vendor 未 clone / 未打补丁）。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
const FENCE_PATH = join(HERE, 'fence.js')
const BUNDLE = join(REPO_ROOT, 'vendor', 'dsh-worktable', '01_content', 'lib', 'index.js')

let pass = 0
const failures = []
function check(name, actual, expected) {
  const ok = Object.is(actual, expected)
  if (ok) pass += 1
  else failures.push(`${name}\n      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`)
}
function checkTrue(name, condition) {
  check(name, condition === true, true)
}

// ── 载入 fence.js 为可测模块 ────────────────────────────────────────────────
// fence.js 本身不 export（它是被注入 bundle 的片段），所以复制到临时 .mjs 并补一行 export。
// 用真实文件而非 data: URL——data: 模块对 node: 说明符的解析路径与磁盘模块不同，测出来的
// 行为不能代表运行时的行为。
const sandbox = mkdtempSync(join(tmpdir(), 'lute-fence-test-'))
const shimPath = join(sandbox, 'fence-under-test.mjs')
writeFileSync(
  shimPath,
  readFileSync(FENCE_PATH, 'utf8')
    + '\nexport { __wtFence, __wtFenceRequest, __wtWithinRoots, __wtOriginState, __WT_FENCE_VERSION };\n',
  'utf8',
)
const fence = await import(pathToFileURL(shimPath).href)
rmSync(sandbox, { recursive: true, force: true })

checkTrue('fence 版本号存在', typeof fence.__WT_FENCE_VERSION === 'string')

/**
 * 造一个最小请求对象（只带栅栏会读的字段）。
 * host 传 null = **真的不发送** Host 头（不能传 undefined：解构默认值会在 undefined 时填回默认值，
 * 于是「缺少 Host」这条用例实际上测的是正常请求——本套件第一版就是这么假通过的）。
 */
function req({ remoteAddress = '127.0.0.1', host = '127.0.0.1:4567', origin, secFetchSite, url = '/' } = {}) {
  const headers = {}
  if (host !== null) headers.host = host
  if (origin !== undefined) headers.origin = origin
  if (secFetchSite !== undefined) headers['sec-fetch-site'] = secFetchSite
  return { socket: { remoteAddress }, headers, url }
}

// ── ① 请求级栅栏 ────────────────────────────────────────────────────────────
const F = fence.__wtFenceRequest

check('回环 + 无 Origin（curl 形态）→ 放行', F(req(), false), null)
check('回环 + 同源 Origin → 放行', F(req({ origin: 'http://127.0.0.1:4567' }), false), null)
check('回环 + localhost 同源 → 放行', F(req({ host: 'localhost:4567', origin: 'http://localhost:4567' }), false), null)

check('Sec-Fetch-Site: cross-site → 拒绝', F(req({ secFetchSite: 'cross-site' }), false), 'cross-site')
check('Sec-Fetch-Site: same-origin → 放行', F(req({ secFetchSite: 'same-origin' }), false), null)
check('跨源 Origin → 拒绝', F(req({ origin: 'https://evil.example' }), false), 'origin-mismatch')
check('Origin: null（沙箱 iframe / file://）→ 拒绝', F(req({ origin: 'null' }), false), 'null-origin')
check('Origin 不合法 → 拒绝', F(req({ origin: 'not a url' }), false), 'bad-origin')
check('非回环 socket → 拒绝', F(req({ remoteAddress: '10.0.0.7' }), false), 'socket-not-loopback')
check('IPv6 回环 ::1 → 放行', F(req({ remoteAddress: '::1' }), false), null)
check('IPv4-mapped ::ffff:127.0.0.1 → 放行', F(req({ remoteAddress: '::ffff:127.0.0.1' }), false), null)
// DNS rebinding 的核心用例：socket 来自回环，但 Host 被换成了攻击者域名。
check('Host 非回环（DNS rebinding）→ 拒绝', F(req({ host: 'evil.example' }), false), 'host-not-loopback')
check('缺少 Host → 拒绝', F(req({ host: null }), false), 'missing-host')

// WebSocket 比 HTTP 严一档：Origin 必须存在（浏览器对 WS 必然发送，且它是唯一的跨源防线）。
check('WS：Origin 缺失 → 拒绝', F(req(), true), 'missing-origin')
check('WS：Origin 同源 → 放行', F(req({ origin: 'http://127.0.0.1:4567' }), true), null)
check('WS：Origin 跨源 → 拒绝', F(req({ origin: 'https://evil.example' }), true), 'origin-mismatch')
check('WS：Origin: null → 拒绝', F(req({ origin: 'null' }), true), 'null-origin')

// ── ② 允许根约束 ────────────────────────────────────────────────────────────
const R = fence.__wtWithinRoots
const roots = [homedir(), tmpdir()].map((p) => p)

checkTrue('家目录内路径 → 允许', R(join(homedir(), 'project', 'x.txt'), roots))
checkTrue('临时目录内路径 → 允许', R(join(tmpdir(), 'lute-probe.txt'), roots))
check('系统路径 /etc/hosts → 拒绝', R('/etc/hosts', roots), false)
check('系统路径 /System → 拒绝', R('/System/Library/x', roots), false)
// 回归：根未做 realpath 时也必须正确。macOS 的 tmpdir() 是 /var/folders/…（软链到
// /private/var/folders/…），只归一目标不归一根会假拒掉所有临时目录内的路径。
checkTrue('未解析的软链根（tmpdir）仍需放行', R(join(tmpdir(), 'lute-probe.txt'), [tmpdir()]))
check('未解析的软链根仍需拒绝越界', R('/etc/hosts', [tmpdir()]), false)
check('家目录前缀伪装（/Users/lute-evil）→ 拒绝', R(homedir() + '-evil/x', roots), false)
// 关键：路径穿越必须在校验前被归一，否则 ~/../../etc/passwd 会以「家目录前缀」蒙混过关。
check('家目录内穿越出去 → 拒绝', R(join(homedir(), '..', '..', 'etc', 'passwd'), roots), false)
check('临时目录内穿越出去 → 拒绝', R(join(tmpdir(), '..', '..', '..', 'etc', 'hosts'), roots), false)

// ── ③ 对象级包装（register / registerUpgrade 都被罩住）───────────────────────
const registered = []
const upgraded = []
const fakeServer = {
  register(route) { registered.push(route) },
  registerUpgrade(route) { upgraded.push(route) },
  someOtherMember: 42,
}
const ctx = { logger: { warn() {} } }
const fenced = fence.__wtFence(fakeServer, ctx)

checkTrue('__wtFence 返回新对象（非原对象）', fenced !== fakeServer)
check('非包装成员原样透传', fenced.someOtherMember, 42)
checkTrue('幂等：二次包装返回同一对象', fence.__wtFence(fenced, ctx) === fenced)

fenced.register({ kind: 'exact', path: '/api/worktable/health', handler: () => 'inner-http' })
fenced.registerUpgrade({ path: '/api/worktable/term', handler: () => 'inner-ws' })
check('register 已转发到 target', registered.length, 1)
check('registerUpgrade 已转发到 target', upgraded.length, 1)

/** 跑一次被包装的 HTTP handler，返回其返回值或 'DENIED:<reason>'。 */
async function callHttp(route, request) {
  let captured = null
  const res = { writeHead: (code) => { captured = { code } }, end: (body) => { captured = { ...captured, body: String(body) } } }
  const result = await route.handler(request, res)
  return captured === null ? result : 'DENIED:' + JSON.parse(captured.body).reason
}

const httpRoute = registered[0]
check('包装后 HTTP：合法请求到达原 handler', await callHttp(httpRoute, req()), 'inner-http')
check('包装后 HTTP：cross-site 被拒', await callHttp(httpRoute, req({ secFetchSite: 'cross-site' })), 'DENIED:cross-site')
check('包装后 HTTP：跨源 Origin 被拒', await callHttp(httpRoute, req({ origin: 'https://evil.example' })), 'DENIED:origin-mismatch')

const upgradeRoute = upgraded[0]
let socketPayload = null
const fakeSocket = { write: (chunk) => { socketPayload = String(chunk) }, destroy: () => { socketPayload = (socketPayload ?? '') + '[destroyed]' } }
const wsResult = upgradeRoute.handler(req({ origin: 'https://evil.example', url: '/api/worktable/term' }), fakeSocket, Buffer.alloc(0))
check('包装后 WS：跨源升级被拒', wsResult, undefined)
checkTrue('包装后 WS：跨源升级写入 403 并断链', (socketPayload ?? '').includes('403 Forbidden') && (socketPayload ?? '').includes('[destroyed]'))

socketPayload = null
const wsOk = upgradeRoute.handler(req({ origin: 'http://127.0.0.1:4567', url: '/api/worktable/term' }), fakeSocket, Buffer.alloc(0))
check('正向对照：同源 WS 升级到达原 handler', wsOk, 'inner-ws')
check('正向对照：同源 WS 未被断链', socketPayload, null)

// ── ④ 集成层：补丁真的落在 vendor bundle 上 ─────────────────────────────────
let bundleSource
try {
  bundleSource = readFileSync(BUNDLE, 'utf8')
} catch {
  console.error(`[fence.test] 环境缺失：读不到 ${BUNDLE}（vendor/dsh-worktable 未 clone？）`)
  process.exit(2)
}
checkTrue('bundle 含注入块起始标记', bundleSource.includes('LUTE worktable fence BEGIN'))
checkTrue('bundle 含注入块结束标记', bundleSource.includes('LUTE worktable fence END'))
checkTrue('bundle 的 apply() 已改为经栅栏包住 webServer', bundleSource.includes('const webServer = __wtFence(ctx.webServer, ctx);'))
check('bundle 中不再残留未包装的锚点', bundleSource.includes('const webServer = ctx.webServer;'), false)

const mod = await import(pathToFileURL(BUNDLE).href)
check('bundle 可加载：name', mod.name, 'dsh-worktable')
checkTrue('bundle 可加载：apply 是函数', typeof mod.apply === 'function')
check('bundle 可加载：HEALTH_PATH 未变', mod.HEALTH_PATH, '/api/worktable/health')
checkTrue('bundle 可加载：inject 仍声明 webServer', Array.isArray(mod.inject) && mod.inject.includes('webServer'))

// ── 汇总 ────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`\n[fence.test] 失败 ${failures.length} 项 / 通过 ${pass} 项\n`)
  for (const failure of failures) console.error('  ✗ ' + failure + '\n')
  process.exit(1)
}
console.log(`[fence.test] 全部通过：${pass} 项断言`)
