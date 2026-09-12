#!/usr/bin/env node
/**
 * dsh-worktable 信任栅栏的**实况 curl 负向探针**（融合规格 test_seam ①）。
 *
 * ## 为什么需要它
 *
 * `dsh-patches/worktable-fence/fence.test.mjs` 的 47 项断言全部打在**合成 req 对象**上：
 * 它证明 `__wtFenceRequest` 这个纯函数对给定的头返回给定的判据，**不**证明：
 *
 *   1. 真实产物里**装着**这段栅栏（补丁没打上 / 被带外覆盖 / 上游发版后锚点落空）；
 *   2. 栅栏**包住了**真实注册的那 9 条路由（`register` 走了 Proxy，还是走了原对象）；
 *   3. 判据在**真实 HTTP 事务**里成立（node 的 http 解析会不会先于栅栏把头吃掉；
 *      WS 升级是不是真在握手期被回 403 而不是进到 ws 处理）。
 *
 * 这三条只有「真起一个 HTTP 服务、真跑 curl」才能回答。所以本探针：
 *
 *   - 用**应用自己那份** `@deepseek-ai/dsh-host-webserver`（WebServer 服务，一字不改）起服务；
 *   - 加载 **profile 里那份** `dsh-worktable`（走 `node_modules` 符号链接，与运行时同一条路径）；
 *   - 用**真的 curl 子进程**发请求，按 `HTTP/1.1 <status>` 判分；
 *   - 每条负向探针都配一条**同 URL 的正控**（只差一个头），让「200 → 403」的翻转本身
 *     成为「403 出自栅栏」的证据——不是靠读日志自证。
 *
 * ## 仪器自检（没有它这片绿色不可信）
 *
 * - `srv-alive`：一条**不存在**的路由必须回 404。它证明服务真的在派发，而不是「一切都 403」。
 * - `curl-alive`：连一个**没人监听**的端口必须失败。它证明 curl 的失败能被我看见。
 * - `health`：`/api/worktable/health` 必须回 200 且 body 带 `"plugin":"dsh-worktable"`。
 *   它同时是 N1–N4 的差分成因（同 URL、只换一个头）。
 * 任何一条自检不成立 → **exit 2**，绝不产出一片绿色。
 *
 * ## 边界（诚实写清楚）
 *
 * - 本探针**不**验证「应用启动时把插件装载起来了」。那需要用户重启 DSH Desktop，属于 C4。
 *   本探针验证的是「**将要被装载的那份产物**，其 9 条入口在真实 HTTP 事务下确实被栅栏拦住」。
 * - `socket-not-loopback` 需要服务绑 `0.0.0.0` 才能造出非回环对端。本探针**会**做这一步，
 *   但把窗口压到毫秒级，并在子进程里用**临时 DSH_HOME** 起，使 `ws`/`node-pty` 解析不到、
 *   **终端路由根本不注册**（见 `bootFencedStack` 的 `dshHome` 参数）。最坏情况下暴露的
 *   只是一条只读路由，而不是一个交互式 shell。
 * - `sessions` 服务用**最小替身**提供（`get()` 返回 `undefined`）。插件只用它解析终端 cwd，
 *   与栅栏判据无关；替身事实写进报告的 `substitutions` 字段。
 * - 阶段 C 用平台 `/api` 前缀栅栏的**行为替身**（未认证 → 401 `unauthorized`）。
 *   它回答的是「插件在 `/api` 下注册 exact 路由会不会压过平台栅栏」这个**路由优先级**问题，
 *   不是重测 DSH 自己的栅栏实现——所以替身够用，且写进 `substitutions`。
 *
 * 用法：`node scripts/acceptance/worktable-fence-live.mjs [--out <dir>]`
 * 退出码：0 = 全部探针通过；1 = 有探针未通过；2 = 前置条件或仪器不可用。
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, networkInterfaces, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APP_UNPACKED = '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked'
const APP_MODULES = join(APP_UNPACKED, 'node_modules', '@deepseek-ai')
const PROFILE_DIR = join(homedir(), '.dsh', 'profiles', 'desktop')
/** 走符号链接——运行时装载的那一条路径，不是 vendor 的 realpath。 */
const INSTALLED_ENTRY = join(PROFILE_DIR, 'node_modules', 'dsh-worktable', 'lib', 'index.js')
const FENCE_SRC = join(REPO_ROOT, 'dsh-patches', 'worktable-fence', 'fence.js')

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const OUT_DIR = resolve(argValue('--out', join(REPO_ROOT, '.scratch/dsh-worktable-fusion/acceptance')))

const execFileAsync = promisify(execFile)
let stage = 'init'
const notes = []

/** 前置条件缺失时响亮退出，绝不降级成「跳过 = 通过」。 */
function require_(condition, message) {
  if (!condition) {
    console.error(`[fence-live] ✗ 前置条件不成立（stage=${stage}）：${message}`)
    process.exit(2)
  }
}

/* ── curl ─────────────────────────────────────────────────────────────────── */

const STATUS_RE = /^HTTP\/1\.[01] (\d{3})/m

/**
 * 跑一次**真的** curl。刻意用异步 execFile：同步版会阻塞事件循环，
 * 而同进程里的 HTTP 服务正等着这个循环——那是一个必然死锁（本探针第一版就这么挂的）。
 * @returns {{status: number|null, out: string, err: string, exit: number|string|null}}
 */
async function curl(argv, { maxTimeSec = 4 } = {}) {
  const full = ['-sS', '-i', '--http1.1', '--max-time', String(maxTimeSec), ...argv]
  try {
    const { stdout, stderr } = await execFileAsync('curl', full, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    const status = stdout.match(STATUS_RE)
    return { status: status ? Number(status[1]) : null, out: stdout, err: stderr, exit: 0 }
  } catch (error) {
    const out = typeof error.stdout === 'string' ? error.stdout : ''
    const err = typeof error.stderr === 'string' ? error.stderr : String(error.message ?? error)
    const status = out.match(STATUS_RE)
    return {
      status: status ? Number(status[1]) : null,
      out, err,
      exit: typeof error.code === 'number' ? error.code : (error.code ?? null),
    }
  }
}

const WS_HEADERS = [
  '-H', 'Connection: Upgrade',
  '-H', 'Upgrade: websocket',
  '-H', 'Sec-WebSocket-Version: 13',
  '-H', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
]

/* ── 启动被栅栏包住的真实路由栈 ───────────────────────────────────────────── */

/**
 * 起一个只装了 WebServer + dsh-worktable 的 cordis 根。
 * @param {{host: string, cacheBust?: string, dshHome?: string|null}} options
 *   - `cacheBust`：ESM 按 URL 缓存，追加 query 才能拿到一个**新的模块实例**
 *     （`baseDshHome()` 的结果在模块作用域里被缓存，不换实例就换不掉 DSH_HOME）。
 *   - `dshHome`：非 null 时写入 `process.env.DSH_HOME`。插件据此在 `profiles/<name>/node_modules`
 *     里找 `ws` / `node-pty`；指向临时目录即让两者解析失败 → 终端路由不注册。
 */
async function bootFencedStack({ host, cacheBust, dshHome = null, platformApiGate = false }) {
  const savedDshHome = process.env.DSH_HOME
  if (dshHome !== null) process.env.DSH_HOME = dshHome
  try {
    const { Context } = await import(`${APP_MODULES}/cordis/lib/index.js`)
    const { default: WebServer } = await import(`${APP_MODULES}/dsh-host-webserver/lib/index.js`)
    const pluginUrl = cacheBust === undefined ? ENTRY : `${ENTRY}?${cacheBust}`
    const plugin = await import(pluginUrl)

    const root = new Context()
    const logs = []
    const push = (level) => (...rest) => logs.push(`${level} ${rest.map(String).join(' ')}`)
    root.logger = { warn: push('W'), info: push('I'), error: push('E'), debug: () => {} }
    // 最小替身：插件只用 ctx.sessions 解析终端 cwd（serverCwd），与栅栏判据无关。
    root.provide('sessions', { get: () => undefined })

    root.plugin(WebServer, { host, port: 0 })
    const server = await waitFor(() => {
      const s = root.get('webServer')
      return s?.port ? s : null
    }, 'webServer 未在 5s 内监听')

    if (platformApiGate) {
      // DSH 自己那条 `/api` 前缀路由（dsh-client-connection 的 "client-connection: /api route"）
      // 的**行为替身**：未认证即 401 `unauthorized`。真实实现先过 isTrustedApiRequest
      // （Host 回环 + sec-fetch-site + Origin==Host）再查 browserAuth 会话 cookie。
      // 这里只需要它在「未认证」这一态下的可观测行为——探针问的是**路由优先级**，
      // 不是重测 DSH 自己的栅栏。
      root.effect(() => server.register({
        kind: 'prefix',
        path: '/api',
        handler: (_req, res) => { res.writeHead(401); res.end('unauthorized') },
      }), 'probe: platform /api gate stand-in')
    }
    root.plugin(plugin)
    // apply() 是同步的（authPath 里没有 await），但 effect 的注册走 cordis 的微任务队列。
    await new Promise((r) => setTimeout(r, 250))

    return {
      root, server, logs,
      port: server.port,
      routes: {
        exact: [...server.exact.keys()].sort(),
        prefix: [...server.prefixes.keys()].sort(),
        upgrade: [...server.upgrades.keys()].sort(),
      },
      pluginMeta: { name: plugin.name, inject: plugin.inject, loadProbe: plugin.__wtLoadProbeStats?.() },
      async close() {
        try { await server.server?.close?.() } catch {}
        try { server.server?.closeAllConnections?.() } catch {}
        try { await root.stop?.() } catch {}
      },
    }
  } finally {
    if (dshHome !== null) {
      if (savedDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = savedDshHome
    }
  }
}

async function waitFor(probe, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(message)
    await new Promise((r) => setTimeout(r, 20))
  }
}

/* ── 探针 ─────────────────────────────────────────────────────────────────── */

const results = []
function record(entry) {
  results.push(entry)
  const mark = entry.pass ? '✓' : '✗'
  console.log(`  ${mark} ${entry.id.padEnd(22)} ${entry.detail}`)
}

/** 判分：期望状态码 + 期望拒绝原因 + 不许出现的内容 + 不许被创建的文件。 */
function judge({ id, kind, what, expect, res, reason: expectReason, forbid, absent }) {
  const problems = []
  if (res.status !== expect) problems.push(`期望 ${expect}，实得 ${res.status ?? '(无响应)'}`)
  const seen = res.out.match(/"reason":"([a-z-]+)"/)?.[1] ?? null
  if (problems.length === 0 && expectReason !== undefined && seen !== expectReason) {
    problems.push(`拒绝原因 ${seen ?? '(无)'} ≠ 期望 ${expectReason}`)
  }
  if (problems.length === 0 && forbid !== undefined && res.out.includes(forbid)) {
    problems.push(`响应体不应包含 ${JSON.stringify(forbid)}`)
  }
  if (problems.length === 0 && absent !== undefined && existsSync(absent)) {
    problems.push(`文件本不应被创建：${absent}`)
  }
  if (problems.length === 0 && expect === 403 && expectReason !== undefined && seen === null) {
    problems.push('403 响应体里没有栅栏的 reason 字段——无法证明拒绝出自栅栏')
  }
  return {
    id, kind, what,
    pass: problems.length === 0,
    expect,
    actual: res.status,
    reason: seen,
    detail: problems.length === 0
      ? `${res.status}${seen ? ` · ${seen}` : ''}${expect === 200 || expect === 101 ? ' · 放行' : ''}`
      : problems.join('；'),
  }
}

/**
 * WebSocket 升级的判分与 HTTP **不同**：`__wtRejectSocket` 走的是裸 socket，
 * 只写四行握手级响应（`HTTP/1.1 403 Forbidden` / `Connection: close` /
 * `Content-Length: 0`），**没有 JSON body**，所以 body 里读不到 reason。
 *
 * 那怎么证明这个 403 出自栅栏、而不是「路由根本没注册」？两条独立证据：
 *   1. **响应形态**：路由没注册时 `webServer` 只做 `socket.destroy()`，一个字节都不写；
 *      收到完整 403 响应头本身就说明有东西在握手期接管了这条连接。
 *   2. **日志关联**：栅栏每次拒绝都写一条 `[lute-fence v1] denied: <reason> · <path>`；
 *      比对探针前后日志的**增量**，就能把「哪个 reason、哪条 path」钉死。
 * 只靠其中一条都不够——所以两条都要。
 */
async function probeUpgrade({ id, what, headers, expectReason, stack, port }) {
  const before = stack.logs.length
  const res = await curl([...WS_HEADERS, ...headers, `http://127.0.0.1:${port}/api/worktable/term`], { maxTimeSec: 3 })
  const fresh = stack.logs.slice(before)
  const shapeOk = res.status === 403 && /connection: close/i.test(res.out) && /content-length: 0/i.test(res.out)
  const denied = fresh.filter((line) => line.includes(`denied: ${expectReason}`) && line.includes('/api/worktable/term'))
  const problems = []
  if (!shapeOk) problems.push(`响应不是栅栏的裸 403 形态（实得 ${res.status ?? '无响应'}）`)
  if (denied.length !== 1) problems.push(`栅栏日志增量 ${denied.length} 条（期望 1 条 denied: ${expectReason} · /api/worktable/term）`)
  return {
    id, kind: 'negative', what,
    pass: problems.length === 0,
    expect: 403,
    actual: res.status,
    reason: expectReason,
    detail: problems.length === 0
      ? `403 · ${expectReason}（裸 403 形态 + 栅栏日志增量各 1 条）`
      : problems.join('；'),
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

stage = 'preconditions'
console.log('[fence-live] 前置条件')
// `--entry` 让「被测产物」成为显式参数：装之前验候选构建、跑变异测试都要它。
// 默认仍是**安装路径**（走 node_modules 符号链接，与运行时同一条）。
const ENTRY = resolve(argValue('--entry', INSTALLED_ENTRY))
const TESTING_INSTALLED = ENTRY === resolve(INSTALLED_ENTRY)
require_(existsSync(ENTRY), `未找到被测插件入口：${ENTRY}${TESTING_INSTALLED ? '（先跑 profile 的 pnpm install）' : ''}`)
require_(existsSync(FENCE_SRC), `未找到栅栏源：${FENCE_SRC}`)
require_(existsSync(join(APP_MODULES, 'cordis', 'lib', 'index.js')), '未找到应用自带的 cordis')

const artifactBytes = readFileSync(ENTRY)
const artifact = {
  entry: ENTRY,
  isInstalledEntry: TESTING_INSTALLED,
  realpath: realpathSync(ENTRY),
  sha256: createHash('sha256').update(artifactBytes).digest('hex'),
  bytes: artifactBytes.length,
}
const artifactText = artifactBytes.toString('utf8')
const ANCHOR_PATCHED = 'const webServer = __wtFence(ctx.webServer, ctx);'
const FENCE_ANCHOR_HITS = artifactText.split(ANCHOR_PATCHED).length - 1
const ARTIFACT_FENCE_VERSION = artifactText.match(/const __WT_FENCE_VERSION = "([^"]+)"/)?.[1] ?? null
const SOURCE_FENCE_VERSION = readFileSync(FENCE_SRC, 'utf8').match(/const __WT_FENCE_VERSION = "([^"]+)"/)?.[1] ?? null

if (TESTING_INSTALLED) {
  require_(FENCE_ANCHOR_HITS === 1, `产物里 ${ANCHOR_PATCHED} 出现 ${FENCE_ANCHOR_HITS} 次（期望 1）——这份产物没打栅栏或被打过两次，探针测的就不是栅栏`)
  require_(ARTIFACT_FENCE_VERSION !== null, '产物里没有 __WT_FENCE_VERSION——栅栏块缺失')
  require_(ARTIFACT_FENCE_VERSION === SOURCE_FENCE_VERSION,
    `产物栅栏版本 ${ARTIFACT_FENCE_VERSION} ≠ 源 ${SOURCE_FENCE_VERSION}——产物过期，先跑 apply.mjs`)

  const { stdout: checkOut } = await execFileAsync('node', [join(REPO_ROOT, 'dsh-patches', 'worktable-fence', 'apply.mjs'), '--check'], { encoding: 'utf8' })
    .catch((e) => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? '' }))
  console.log(`  ✓ 产物已打栅栏 v${ARTIFACT_FENCE_VERSION} · ${artifact.sha256.slice(0, 12)} · apply.mjs --check（${checkOut.trim().split('\n').pop()}）`)
} else {
  console.log(`  ⚠ --entry 指向**非安装**产物：${ENTRY}`)
  console.log(`    跳过「必须是已打栅栏的安装产物」这三条前置条件——它们的前提正是本次要检验的对象。`)
  console.log(`    产物栅栏锚点数=${FENCE_ANCHOR_HITS}，版本=${ARTIFACT_FENCE_VERSION ?? '(无)'}。由下面的探针判分。`)
}

/* ── 阶段 A：回环实例，全量探针 ───────────────────────────────────────────── */
stage = 'boot-A'
console.log('\n[fence-live] 阶段 A · 回环实例（真实 WebServer + profile 里的真实插件）')
const A = await bootFencedStack({ host: '127.0.0.1' })
const P = A.port
const base = `http://127.0.0.1:${P}`
console.log(`  已监听 127.0.0.1:${P}`)
console.log(`  exact   ${A.routes.exact.join(' ')}`)
console.log(`  prefix  ${A.routes.prefix.join(' ')}`)
console.log(`  upgrade ${A.routes.upgrade.join(' ')}`)

require_(A.routes.exact.length === 7, `exact 路由数 ${A.routes.exact.length} ≠ 7——插件的 apply() 没跑完`)
require_(A.routes.upgrade.length === 1, `upgrade 路由数 ${A.routes.upgrade.length} ≠ 1（ws/node-pty 是否可用？见日志）`)

/* 仪器自检 */
console.log('\n  仪器自检')
{
  const dead = await waitForFreePort()
  const res = await curl([`http://127.0.0.1:${dead}/anything`], { maxTimeSec: 2 })
  record({
    id: 'ctl-curl-alive', kind: 'control', what: '连一个没人监听的端口必须失败',
    pass: res.status === null && res.exit !== 0,
    expect: null, actual: res.status, reason: null,
    detail: res.status === null && res.exit !== 0 ? `curl exit=${res.exit}，无 HTTP 响应` : `意外拿到 ${res.status}`,
  })
}
{
  const res = await curl([`${base}/api/worktable/definitely-not-a-route`])
  record(judge({ id: 'ctl-404', kind: 'control', what: '不存在的路由回 404（证明服务在真派发）', expect: 404, res }))
}
{
  const res = await curl([`${base}/api/worktable/health`])
  const ok = res.status === 200 && res.out.includes('"dsh-worktable"')
  record({
    id: 'ctl-health', kind: 'control', what: '健康路由回 200 且自报身份',
    pass: ok, expect: 200, actual: res.status, reason: null,
    detail: ok ? '200 · {"plugin":"dsh-worktable"}' : `实得 ${res.status}；body=${res.out.slice(-160)}`,
  })
}

/* 正控：栅栏必须**放行**的路径。没有这一组，「拒绝一切」和「栅栏正确」不可分。 */
console.log('\n  正控（必须放行）')
const tmpProbeDir = mkdtempSync(join(tmpdir(), 'lute-fence-probe-'))
const tmpProbeFile = join(tmpProbeDir, 'readable.txt')
writeFileSync(tmpProbeFile, 'lute-fence-probe-payload\n')
const homeReadable = join(PROFILE_DIR, 'package.json')
{
  const res = await curl([`${base}/api/worktable/health`])
  record(judge({ id: 'allow-health', kind: 'positive', what: '无 Origin 的 curl（非浏览器客户端）', expect: 200, res }))
}
{
  const res = await curl(['-H', `Origin: ${base}`, `${base}/api/worktable/health`])
  record(judge({ id: 'allow-same-origin', kind: 'positive', what: 'Origin 与 Host 同源的浏览器请求', expect: 200, res }))
}
{
  const res = await curl(['--get', '--data-urlencode', `path=${homeReadable}`, `${base}/api/worktable/file`])
  const ok = res.status === 200 && res.out.includes('"name"')
  record({
    id: 'allow-file-in-home', kind: 'positive', what: '读家目录内的文件（允许根之内）',
    pass: ok, expect: 200, actual: res.status, reason: null,
    detail: ok ? '200 · 读到 profile/package.json' : `实得 ${res.status}；body=${res.out.slice(-160)}`,
  })
}
{
  const res = await curl(['--get', '--data-urlencode', `path=${tmpProbeFile}`, `${base}/api/worktable/file`])
  const ok = res.status === 200 && res.out.includes('lute-fence-probe-payload')
  record({
    id: 'allow-file-in-tmp', kind: 'positive', what: '读临时目录内的文件（另一个允许根）',
    pass: ok, expect: 200, actual: res.status, reason: null,
    detail: ok ? '200 · 读到探针写下的内容' : `实得 ${res.status}；body=${res.out.slice(-160)}`,
  })
}
{
  const written = join(tmpProbeDir, 'written-by-probe.txt')
  const res = await curl([
    '-X', 'POST', '-H', 'content-type: application/json',
    '--data', JSON.stringify({ path: written, content: 'written\n' }),
    `${base}/api/worktable/write`,
  ])
  const ok = res.status === 200 && existsSync(written)
  record({
    id: 'allow-write-in-tmp', kind: 'positive', what: '写临时目录内的文件（允许根之内）',
    pass: ok, expect: 200, actual: res.status, reason: null,
    detail: ok ? '200 · 文件已落盘' : `实得 ${res.status}；文件存在=${existsSync(written)}`,
  })
}
{
  const res = await curl([...WS_HEADERS, '-H', `Origin: ${base}`, `${base}/api/worktable/term`], { maxTimeSec: 3 })
  const ok = res.status === 101
  record({
    id: 'allow-ws-same-origin', kind: 'positive', what: '同源 Origin 的 WebSocket 升级（浏览器正常路径）',
    pass: ok, expect: 101, actual: res.status, reason: null,
    detail: ok ? '101 Switching Protocols · 栅栏放行，路由接管' : `实得 ${res.status}；首行=${res.out.split('\n')[0] || res.err.slice(0, 80)}`,
  })
  // 101 之后 node-pty 会真的 spawn 一个 shell；curl 断链后插件自己 kill 它。
  await new Promise((r) => setTimeout(r, 400))
}

/* 负向：必须被拒。 */
console.log('\n  负向探针（必须被拒）')
{
  const cases = [
    ['N1', ['-H', 'Sec-Fetch-Site: cross-site'], 'cross-site', '跨站页面发起的 fetch（Sec-Fetch-Site: cross-site）'],
    ['N2', ['-H', 'Origin: http://evil.example'], 'origin-mismatch', '外来 Origin（Origin 与 Host 不同源）'],
    ['N3', ['-H', 'Origin: null'], 'null-origin', '显式 Origin: null（沙箱 iframe / file:// 页面）'],
    ['N4', ['-H', 'Host: evil.example'], 'host-not-loopback', 'Host 非回环（DNS rebinding 后的请求）'],
    ['N5', ['-H', 'Origin: http://127.0.0.1.evil.example'], 'origin-mismatch', '形似同源实则不同源（后缀伪装）'],
  ]
  for (const [id, extra, reason, what] of cases) {
    const res = await curl([...extra, `${base}/api/worktable/health`])
    record(judge({ id, kind: 'negative', what, expect: 403, res, reason }))
  }
}
{
  const res = await curl(['--get', '--data-urlencode', 'path=/etc/passwd', `${base}/api/worktable/file`])
  record(judge({
    id: 'N6', kind: 'negative', what: '读允许根之外（/etc/passwd）',
    expect: 403, res, reason: 'path-outside-allowed-roots', forbid: 'root:',
  }))
}
{
  const escaped = join(homedir(), '..', '..', 'etc', 'passwd')
  const res = await curl(['--get', '--data-urlencode', `path=${escaped}`, `${base}/api/worktable/file`])
  record(judge({
    id: 'N7', kind: 'negative', what: `穿越归一（${escaped.replace(homedir(), '~')}）`,
    expect: 403, res, reason: 'path-outside-allowed-roots', forbid: 'root:',
  }))
}
{
  const target = join('/var/tmp', `lute-fence-probe-must-not-exist-${process.pid}.txt`)
  rmSync(target, { force: true })
  const res = await curl([
    '-X', 'POST', '-H', 'content-type: application/json',
    '--data', JSON.stringify({ path: target, content: 'owned\n' }),
    `${base}/api/worktable/write`,
  ])
  record(judge({
    id: 'N8', kind: 'negative', what: '写允许根之外（RCE 路径：~/.zshrc 那一类）',
    expect: 403, res, reason: 'path-outside-allowed-roots', absent: target,
  }))
  // 变异测试会真的把它写出来——那一份副产物必须清掉，不留痕。
  rmSync(target, { force: true })
}
{
  const res = await curl([
    '-X', 'POST', '-H', 'content-type: application/json',
    '--data', JSON.stringify({ cwd: '/etc' }),
    `${base}/api/worktable/git`,
  ])
  record(judge({
    id: 'N9', kind: 'negative', what: 'body.cwd 指向允许根之外（git 状态读取）',
    expect: 403, res, reason: 'path-outside-allowed-roots',
  }))
}
{
  const res = await curl([
    '-X', 'POST', '-H', 'content-type: application/json',
    '--data', JSON.stringify({ path: '/etc' }),
    `${base}/api/worktable/fs`,
  ])
  record(judge({
    id: 'N10', kind: 'negative', what: 'body.path 指向允许根之外（目录枚举）',
    expect: 403, res, reason: 'path-outside-allowed-roots',
  }))
}
{
  // 根 token 是**客户端给的绝对路径**：`%2Fetc` 经 decodeURIComponent 就是 `/etc`，
  // 之后接 `passwd` 即 `/etc/passwd`。这正是 README 里记的那条「目录级读取」缺口，
  // 所以负向探针必须用编码后的绝对路径——用裸 `site/etc/hosts` 打不到它（那是 cwd 下的相对名）。
  const res = await curl(['--path-as-is', `${base}/api/worktable/site/%2Fetc/passwd`])
  record(judge({
    id: 'N11', kind: 'negative', what: 'prefix 路由的根 token 为 /etc（目录级读取）',
    expect: 403, res, reason: 'path-outside-allowed-roots', forbid: 'root:',
  }))
}
{
  const res = await curl([
    '--path-as-is',
    `${base}/api/worktable/site/${encodeURIComponent(tmpProbeDir)}/readable.txt`,
  ])
  const ok = res.status === 200 && res.out.includes('lute-fence-probe-payload')
  record({
    id: 'allow-site-in-tmp', kind: 'positive', what: 'prefix 路由的根 token 在允许根之内',
    pass: ok, expect: 200, actual: res.status, reason: null,
    detail: ok ? '200 · 栅栏放行，读到探针写下的内容' : `实得 ${res.status}；body=${res.out.slice(-160)}`,
  })
}
{
  // 这一条**不是**负向探针：它证明栅栏不误伤「没带路径」的请求，把判 400 的活留给 handler。
  // 变异测试第一次跑就把这个分类错误抓了出来——去掉栅栏之后它照样 400，
  // 也就是说它对本类失败**结构性免疫**，把它算进负向等于往绿里掺水。
  const res = await curl(['-X', 'POST', '-H', 'content-type: application/json', '--data', '{}', `${base}/api/worktable/mkdir`])
  record({
    id: 'allow-mkdir-nopath', kind: 'positive', what: 'mkdir 缺 path：栅栏放行、由 handler 判 400（不误伤空请求）',
    pass: res.status === 400, expect: 400, actual: res.status, reason: null,
    detail: res.status === 400 ? '400 · 栅栏放行、handler 拒绝（根约束只在有路径时生效）' : `实得 ${res.status}`,
  })
}
{
  const cases = [
    ['N13', ['-H', 'Origin: http://evil.example'], 'origin-mismatch', '跨源 WebSocket 升级（浏览器不做同源检查，这是唯一防线）'],
    ['N14', [], 'missing-origin', 'WebSocket 升级不带 Origin（HTTP 允许缺失，WS 不允许）'],
    ['N15', ['-H', 'Origin: null'], 'null-origin', 'WebSocket 升级带显式 Origin: null'],
  ]
  for (const [id, extra, reason, what] of cases) {
    record(await probeUpgrade({ id, what, headers: extra, expectReason: reason, stack: A, port: P }))
  }
}

/* 栅栏拒绝必须留痕 */
{
  const denied = A.logs.filter((line) => line.includes('[lute-fence v'))
  // kind='evidence' 而非 'control'：这一条**依赖栅栏存在**，在变异体里理应转红，
  // 所以不能混进「正控必须仍绿」那一组（变异测试第一次跑就指出：它被算错了组）。
  record({
    id: 'ev-logged', kind: 'evidence', what: '每次拒绝都写一条 warn 日志（可观测性）',
    pass: denied.length >= 12, expect: '>=12', actual: denied.length, reason: null,
    detail: `${denied.length} 条 [lute-fence] 拒绝日志（证明拒绝路径统一走 __wtReject*）`,
  })
}

await A.close()
rmSync(tmpProbeDir, { recursive: true, force: true })

/* ── 阶段 B：非回环对端 ───────────────────────────────────────────────────── */
stage = 'boot-B'
console.log('\n[fence-live] 阶段 B · 非回环对端（socket-not-loopback）')
const lanIp = Object.values(networkInterfaces()).flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address ?? null
if (lanIp === null) {
  notes.push('阶段 B 跳过：本机没有非回环 IPv4 地址')
  console.log('  – 跳过（本机没有非回环 IPv4 地址）')
} else {
  const sandboxHome = mkdtempSync(join(tmpdir(), 'lute-fence-home-'))
  const B = await bootFencedStack({ host: '0.0.0.0', cacheBust: 'fence-probe=B', dshHome: sandboxHome })
  try {
    const target = `http://${lanIp}:${B.port}`
    console.log(`  已监听 0.0.0.0:${B.port}（terminal 路由注册数=${B.routes.upgrade.length}，期望 0）`)
    require_(B.routes.upgrade.length === 0,
      `阶段 B 的终端路由被注册了（${B.routes.upgrade.length}）——沙箱 DSH_HOME 没生效，立即中止以免把 shell 暴露到局域网`)
    const res = await curl([`${target}/api/worktable/health`], { maxTimeSec: 3 })
    record(judge({
      id: 'N16', kind: 'negative', what: `非回环对端（${lanIp} → 0.0.0.0）`,
      expect: 403, res, reason: 'socket-not-loopback',
    }))
  } finally {
    await B.close()
    rmSync(sandboxHome, { recursive: true, force: true })
  }
}

/* ── 阶段 C：平台自己的 `/api` 栅栏在场时，本栅栏还是必需的吗？ ─────────────
 *
 * 这是**「这条栅栏是不是摆设」**的判据。取证（逐字读应用内代码，非推测）：
 *
 *   - `dsh-client-connection/lib/index.js:707` 以 `{kind:"prefix", path:"/api"}` 注册平台栅栏，
 *     未认证回 401 `unauthorized`——**这正是本轮一开始 curl `/api/zzz` 拿到 401 的来源**。
 *   - `dsh-host-webserver/lib/index.js:322` 的 `match()` 是**先查 exact 表，再走最长前缀**。
 *
 * 两条合起来：**插件注册的 exact `/api/worktable/*` 路由，压过平台自己那条 `/api` 前缀**。
 * 也就是说——插件一旦挂载，它那 8 条 HTTP 路由会**绕开 DSH 自己的来源栅栏与浏览器认证**；
 * 而升级表（`upgrades`）是独立 Map、按精确路径匹配、**平台侧一条鉴权都没有**。
 * 所以本栅栏是**唯一**防线，不是纵深里的第二层。
 *
 * 判据（三条，缺一不可）：
 *   C1 `/api/worktable/health` → **200**：exact 压过前缀（插件确实绕开了平台栅栏）
 *   C2 `/api/worktable/file?path=/etc/passwd` → 403 且 body 带**本栅栏的 reason**：
 *      拒绝来自本栅栏，不是来自平台那条 401
 *   C3 插件没注册的 `/api/other` → **401**：平台前缀仍在生效（证明 C1 的成因是优先级，
 *      不是「平台栅栏没装上」）
 */
stage = 'boot-C'
console.log('\n[fence-live] 阶段 C · 平台 `/api` 栅栏在场时的路由优先级（本栅栏是否必需）')
const C = await bootFencedStack({ host: '127.0.0.1', cacheBust: 'fence-probe=C', platformApiGate: true })
try {
  const cBase = `http://127.0.0.1:${C.port}`
  console.log(`  已监听 127.0.0.1:${C.port}（平台 /api 前缀替身已注册：未认证 → 401）`)
  {
    const res = await curl([`${cBase}/api/worktable/health`])
    const ok = res.status === 200 && res.out.includes('"dsh-worktable"')
    record({
      id: 'C1', kind: 'control', what: 'exact 路由压过平台 `/api` 前缀：插件绕开了 DSH 自己的来源栅栏与浏览器认证',
      pass: ok, expect: 200, actual: res.status, reason: null,
      detail: ok
        ? '200 · 平台前缀在场，插件的 exact 路由照样直达——本栅栏因此不是纵深里的第二层，是唯一防线'
        : `实得 ${res.status}；若为 401，则平台的 /api 前缀压过了 exact 路由，本段结论需重审`,
    })
  }
  {
    const res = await curl(['--get', '--data-urlencode', 'path=/etc/passwd', `${cBase}/api/worktable/file`])
    record(judge({
      id: 'C2', kind: 'negative', what: '平台栅栏在场时越根读取仍被本栅栏拒绝（且 reason 是本栅栏的）',
      expect: 403, res, reason: 'path-outside-allowed-roots', forbid: 'root:',
    }))
  }
  {
    const res = await curl([`${cBase}/api/worktable-not-ours`])
    record({
      id: 'C3', kind: 'control', what: '插件没注册的 /api 路径仍回平台那条 401（证明 C1 的成因是优先级）',
      pass: res.status === 401 && res.out.includes('unauthorized'),
      expect: 401, actual: res.status, reason: null,
      detail: res.status === 401 ? '401 unauthorized · 平台前缀仍在生效' : `实得 ${res.status}`,
    })
  }
} finally {
  await C.close()
}

/* ── 阶段 M：变异测试——证明这套探针**能红** ─────────────────────────────── */
//
// 上一轮的教训：只在「栅栏在位」的世界上跑探针，得到的绿色**无法区分**
// 「栅栏拦住了」与「我的探针根本测不到这件事」。所以这里主动制造一个坏世界：
// 从 vendor 的 git HEAD 取出**未打栅栏的原版 bundle**，喂给同一套探针（子进程），
// 要求它「正控仍全绿 + 全部负向转红」。任何一条负向在那个世界里仍然绿，
// 就说明那条探针对这一类失败免疫——它是一条假栅栏。
stage = 'mutation'
console.log('\n[fence-live] 阶段 M · 变异测试（同一套探针喂未打栅栏的原版 bundle）')
const mutations = []
if (args.includes('--no-mutation')) {
  notes.push('阶段 M 跳过：--no-mutation')
  console.log('  – 跳过（--no-mutation）')
} else {
  const sandbox = mkdtempSync(join(tmpdir(), 'lute-fence-mutation-'))
  try {
    const { stdout: pristine } = await execFileAsync(
      'git', ['-C', join(REPO_ROOT, 'vendor', 'dsh-worktable'), 'show', 'HEAD:01_content/lib/index.js'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    )
    const mutant = join(sandbox, 'index.js')
    writeFileSync(mutant, pristine)
    const child = await execFileAsync('node', [
      fileURLToPath(import.meta.url),
      '--entry', mutant, '--no-mutation', '--out', sandbox,
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, cwd: REPO_ROOT })
      .then((r) => ({ ...r, code: 0 }))
      .catch((e) => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 }))
    const childReport = JSON.parse(readFileSync(join(sandbox, 'worktable-fence-live.json'), 'utf8'))
    const neg = childReport.negatives
    const pos = childReport.positives
    const stuckGreen = neg.filter((r) => r.pass)
    const wronglyRed = pos.filter((r) => !r.pass)
    console.log(`  变异体：${mutant}`)
    console.log(`  子进程退出码 ${child.code}（期望 1）；负向 ${neg.length - stuckGreen.length}/${neg.length} 转红，正控 ${pos.length - wronglyRed.length}/${pos.length} 仍绿`)
    const ok = child.code === 1 && stuckGreen.length === 0 && wronglyRed.length === 0
    record({
      id: 'M1', kind: 'control', what: '未打栅栏的原版 bundle 必须让全部负向探针转红、且正控不受影响',
      pass: ok,
      expect: 'negatives all red / positives all green / exit 1',
      actual: `exit ${child.code} · 负向红 ${neg.length - stuckGreen.length}/${neg.length} · 正控绿 ${pos.length - wronglyRed.length}/${pos.length}`,
      reason: null,
      detail: ok
        ? `探针能红：去掉栅栏后 ${neg.length} 条负向全部转红，${pos.length} 条正控/自检全部仍绿`
        : [
          child.code !== 1 ? `子进程退出码 ${child.code} ≠ 1` : null,
          stuckGreen.length > 0 ? `去掉栅栏后仍绿的负向（假栅栏）：${stuckGreen.map((r) => r.id).join(', ')}` : null,
          wronglyRed.length > 0 ? `变异体里意外转红的正控：${wronglyRed.map((r) => r.id).join(', ')}` : null,
        ].filter(Boolean).join('；'),
    })
    // 逐条留证：去掉栅栏之后每条负向实际拿到了什么状态码。
    mutations.push({
      mutantSha256: createHash('sha256').update(pristine).digest('hex'),
      childExit: child.code,
      failedProbeIds: childReport.negatives.filter((r) => !r.pass).map((r) => r.id),
      observed: Object.fromEntries(childReport.negatives.map((r) => [r.id, r.actual])),
    })
    if (!ok) console.log(`  子进程 stderr：${child.stderr.split('\n').slice(-12).join('\n')}`)
  } catch (error) {
    record({
      id: 'M1', kind: 'control', what: '未打栅栏的原版 bundle 必须让全部负向探针转红',
      pass: false, expect: 'exit 1', actual: '变异测试自身失败', reason: null,
      detail: `变异测试跑不起来：${String(error).slice(0, 300)}`,
    })
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
}

/* ── 汇总 ─────────────────────────────────────────────────────────────────── */
const failed = results.filter((r) => !r.pass)
const report = {
  generatedAt: new Date().toISOString(),
  artifact,
  fence: { anchorHits: FENCE_ANCHOR_HITS, version: ARTIFACT_FENCE_VERSION, sourceVersion: SOURCE_FENCE_VERSION },
  routes: A.routes,
  substitutions: {
    sessions: '最小替身 { get: () => undefined }——插件只用它解析终端 cwd（serverCwd），与栅栏判据无关',
    webServer: '应用自带 @deepseek-ai/dsh-host-webserver（未改动）',
    transport: '真实 curl 子进程 + 真实 TCP；未经过 Electron 壳',
    platformApiGate: '阶段 C 用行为替身（未认证 → 401 `unauthorized`）复现 dsh-client-connection 的 /api 前缀栅栏；'
      + '真实实现先过 isTrustedApiRequest 再查 browserAuth 会话 cookie。探针问的是**路由优先级**，不是重测 DSH 自己的栅栏。',
  },
  mutations,
  positives: results.filter((r) => r.kind === 'positive' || r.kind === 'control'),
  negatives: results.filter((r) => r.kind === 'negative'),
  evidence: results.filter((r) => r.kind === 'evidence'),
  notes,
  totals: { probes: results.length, passed: results.length - failed.length, failed: failed.length },
}

stage = 'report'
try {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'worktable-fence-live.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`\n[fence-live] 报告：${join(OUT_DIR, 'worktable-fence-live.json')}`)
} catch (error) {
  console.error(`[fence-live] ✗ 报告写入失败：${String(error)}`)
}

console.log(`\n[fence-live] ${results.length - failed.length}/${results.length} 探针通过` +
  (failed.length === 0 ? '' : `；未通过：${failed.map((f) => f.id).join(', ')}`))
process.exit(failed.length === 0 ? 0 : 1)

/** 找一个当前没人监听的端口，用于 curl 自检。 */
async function waitForFreePort() {
  const net = await import('node:net')
  return await new Promise((resolvePort) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolvePort(port))
    })
  })
}
