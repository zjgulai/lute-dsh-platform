#!/usr/bin/env node
/**
 * 「新应用读 product.json」的**实况 curl 探针**（原生 Agent 产品规格 §9 · M2 的验收）。
 *
 * ## 它回答的问题（单测答不了的那些）
 *
 * `tests/**` 的断言全部打在**纯函数**与**假 ctx** 上：它们证明解析器对给定输入返回给定
 * 视图，**不**证明：
 *
 *   1. 真实产物里**装着**这两条路由（plugin 没加载 / 路由注册失败 / 只注册了 health）；
 *   2. 栅栏在**真实 HTTP 事务**里成立（node 会不会把头先吃掉、`Host` 判据实际读到什么）；
 *   3. **允许根**真的是边界（没配根 = 不扫；配了不存在的根必须**报**而不是静默空）；
 *   4. 卡片要用的那份 `declaration` 在**真实响应体**里真的带着 `features[].inputs`
 *      ——它是入口面板渲染表单的唯一来源，单测里"应该有"与实际响应里"有没有"是两件事。
 *
 * 所以本探针：用**应用自己那份** `@deepseek-ai/dsh-host-webserver` 起真实服务，加载
 * **profile 里那份** `dsh-newapp-local`（走 node_modules 硬链接副本，与运行时同一条路径），
 * 用**真的 curl 子进程**发请求，按 `HTTP/1.1 <status>` 判分。
 *
 * ## 仪器自检（没有它这片绿色不可信）
 *
 * - `srv-alive`：一条**不存在**的路由必须回 404 —— 证明服务真的在派发，而不是"一切都 403"。
 * - `curl-alive`：连一个**没人监听**的端口必须失败 —— 证明 curl 的失败能被我看见。
 * - `node-interpreter`：冷进程模式要用的解释器必须**说得出话** —— 证明阶段 C 那条
 *   `default-scans-nothing` 的「(无响应)」不会是解释器把脚本当成「再开一个 app 实例」。
 * - `health`：`/api/dsh-newapp/health` 必须 200 且 body 带 `"plugin":"newapp-local"`。
 *   它同时是栅栏负例的**正控**（同 URL、只换一个头）。
 * 任何一条自检不成立 → **exit 2**，绝不产出一片绿色。
 *
 * ## 边界（诚实写清楚）
 *
 * - 阶段 D 打的是**正在运行的那个实例**。撰写本探针时它的宿主半边是 09:41 装载的，
 *   早于 `products` 路由入库，因此实得 **401**（插件未加载时，`/api/*` 落到平台前缀守卫
 *   就是这个状态）。探针把这件事记成 `restartRequired: true`，**退出码记 3 而不是 0**
 *   ——需要重启才能改变的事实，不该由一个探针的绿色来假装已经改变，也不该被记成
 *   一次「失败」（没有任何读数为这个失败负责）。重启后重跑，这一项自动转成 200 并附带
 *   真实产品读数，退出码转 0。同样的三态处理适用于实况栅栏的 400（旧产物 vs 真 bug，
 *   由阶段 B 的同形状请求区分）。
 * - 本探针**不**验证浏览器里的抽屉渲染（那需要页面刷新 + DOM 探针）。
 *
 * 用法：`node scripts/acceptance/newapp-products-live.mjs [--out <dir>]`
 * 退出码：0 = 全部通过；1 = 有探针未通过；2 = 前置条件或仪器不可用；
 *         **3 = 阶段 A–C 全绿，但阶段 D 因宿主未重启而无法判决**（见「边界」）。
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync as mkdir } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { assertNodeUsable, nodeCommand } from '../lib/real-node.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APP_MODULES = '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai'
const PROFILE_DIR = join(homedir(), '.dsh', 'profiles', 'desktop')
/** 走 node_modules 硬链接副本——运行时装载的那一条路径，不是仓库里的源码。 */
const INSTALLED_ENTRY = join(PROFILE_DIR, 'node_modules', 'dsh-newapp-local', 'lib', 'index.js')
/** 正在运行的实例（用户 GUI 的那一个）。 */
const LIVE_BASE = 'http://127.0.0.1:43120'

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const OUT_DIR = resolve(argValue('--out', join(REPO_ROOT, '.scratch/native-agent-product/acceptance')))

/**
 * 子进程模式：起一个**冷进程**里的栈，把它的 products 响应打到 stdout。
 *
 * 为什么必须换进程：`mountOnce` 的「一个包一个进程只挂一次」标记骑在
 * `globalThis[Symbol.for('dsh-web.mounted-plugins')]` 上。同一个进程里第二次装载
 * 同一个包**按设计**是 no-op（那正是它存在的理由），于是「空配置 = 不扫」这条探针
 * 在同进程里只会拿到 404 —— 那会把「探针写法不对」误报成「安全默认失效」。
 * 换进程既是唯一干净的解法，也更接近真实（一次真正的冷启动）。
 *
 * 这个分支必须留在所有 `const` 定义**之后**：模块是线性执行的，放前面会撞进
 * `curl` / `body` 的暂时性死区。
 */
async function runChildScan(configJson) {
  const config = JSON.parse(configJson)
  const child = await bootStack({ config, cacheBust: `child-${process.pid}` })
  const res = await curl([`http://127.0.0.1:${child.port}/api/dsh-newapp/products`])
  await child.close()
  // 写**并等它落地**再返回。重定向到管道的 stdout 是异步写，调用方随后 `process.exit(0)`
  // 会把没落地的那次写截断——父进程看到「退出码 0 + stdout 空」，记成「(无响应)」，
  // 与「子进程崩溃」长得一模一样。实测：直接跑（TTY，同步写）永远打得出来，被父进程
  // 调起（管道）时**偶发**打不出来。等回调就等于把这次写变成同步语义。
  await new Promise((resolve, reject) => {
    process.stdout.write(`RESULT ${JSON.stringify({ status: res.status, body: body(res) })}\n`, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

const execFileAsync = promisify(execFile)
let stage = 'init'
const notes = []

/** 前置条件缺失时响亮退出，绝不降级成「跳过 = 通过」。 */
function require_(condition, message) {
  if (!condition) {
    console.error(`[newapp-live] ✗ 前置条件不成立（stage=${stage}）：${message}`)
    process.exit(2)
  }
}

/* ── curl ─────────────────────────────────────────────────────────────────── */

const STATUS_RE = /^HTTP\/1\.[01] (\d{3})/m

/**
 * 跑一次**真的** curl。异步 execFile：同步版会阻塞事件循环，而同进程里的 HTTP 服务
 * 正等着这个循环——那是必然死锁。
 * @returns {{status: number|null, out: string, err: string, exit: number|string|null}}
 */
async function curl(argv, { maxTimeSec = 5 } = {}) {
  const full = ['-sS', '-i', '--http1.1', '--max-time', String(maxTimeSec), ...argv]
  try {
    const { stdout, stderr } = await execFileAsync('curl', full, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    const status = stdout.match(STATUS_RE)
    return { status: status ? Number(status[1]) : null, out: stdout, err: stderr, exit: 0 }
  } catch (error) {
    const out = typeof error.stdout === 'string' ? error.stdout : ''
    const err = typeof error.stderr === 'string' ? error.stderr : String(error.message ?? error)
    const status = out.match(STATUS_RE)
    return { status: status ? Number(status[1]) : null, out, err, exit: typeof error.code === 'number' ? error.code : (error.code ?? null) }
  }
}

/**
 * 跑一个**冷进程**子探针（`--child-scan`），并把它的遗言整理成一行。
 *
 * 为什么要 trace：子进程不交 `RESULT` 有四种原因——崩溃、非零退出、stdout 被别的东西
 * 占用、或者打印之前就退出了——它们在父进程看来都是「stdout 里没有那一行」。探针要是
 * 只报「(无响应)」，读报告的人就得自己去复现一遍才知道是哪种。退出码 + stdout/stderr
 * 尾巴把这件事一次说清。
 * @param {string[]} argv 子进程参数。
 * @returns {Promise<{stdout: string, trace: string}>} 子进程 stdout 与一行遗言。
 */
async function runChild(argv) {
  // **不是 `process.execPath`。** 在 pnpm 生命周期脚本下它是宿主 Electron 可执行文件，
  // 拿它跑子脚本会「退出码 0 + 没有任何输出」（详见 scripts/lib/real-node.mjs）。
  // 本探针 2026-09-12 的失败正是这个：`default-scans-nothing` 偶发「(无响应)」，
  // 直接 `node` 跑永远复现不了——因为只有 `pnpm run` 才把 execPath 换成 Electron。
  const { command, env } = nodeCommand()
  try {
    const { stdout, stderr } = await execFileAsync(command, [fileURLToPath(import.meta.url), ...argv], {
      encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 60_000, env,
    })
    const tail = (text) => (text.trim() === '' ? '(空)' : JSON.stringify(text.trim().split('\n').slice(-3).join(' / ')))
    return { stdout, trace: `exit 0，stdout ${tail(stdout)}，stderr ${tail(stderr)}` }
  } catch (error) {
    const tail = (text) => (typeof text !== 'string' || text.trim() === '' ? '(空)' : JSON.stringify(text.trim().split('\n').slice(-3).join(' / ')))
    const why = error.killed === true ? `被超时杀掉（${error.signal ?? ''}）` : `exit ${String(error.code)}`
    return { stdout: typeof error.stdout === 'string' ? error.stdout : '', trace: `${why}，stdout ${tail(error.stdout)}，stderr ${tail(error.stderr)}` }
  }
}

/** curl 的响应体（去掉头）。 */
function body(res) {
  const at = res.out.indexOf('\r\n\r\n')
  return at < 0 ? res.out : res.out.slice(at + 4)
}

/* ── 夹具：一棵有真有假的目录树 ───────────────────────────────────────────── */

const VALID_DECLARATION = {
  schemaVersion: 1,
  products: [{
    id: 'probe-product',
    name: '探针产品',
    summary: '本探针自造的产品声明',
    version: '0.1.0',
    status: 'draft',
    statusReason: '探针夹具',
    preset: 'agt-033',
    entry: { kind: 'panel', service: 'probe-workbench', action: 'open' },
    features: [{
      id: 'probe-feature',
      label: '探针功能',
      kind: 'model',
      // ★ 入口面板渲染表单的唯一来源。它在响应体里缺席 = 卡片能列、点开没有字段。
      inputs: [{ key: 'a', label: 'A', type: 'text', required: true }, { key: 'b', label: 'B', type: 'number', min: 1 }],
      steps: [{ id: 's1', kind: 'deterministic' }, { id: 's2', kind: 'model' }],
      skills: [{ id: 'probe-skill', layer: 'L2' }],
    }],
  }],
}

function makeFixtureTree() {
  const root = mkdtempSync(join(tmpdir(), 'newapp-live-'))
  mkdir(join(root, 'declared-project'), { recursive: true })
  writeFileSync(join(root, 'declared-project', 'product.json'), JSON.stringify(VALID_DECLARATION, null, 2), 'utf8')
  mkdir(join(root, 'bare-project'), { recursive: true })
  mkdir(join(root, 'broken-project'), { recursive: true })
  writeFileSync(join(root, 'broken-project', 'product.json'), '{not json at all', 'utf8')
  mkdir(join(root, '.hidden-project'), { recursive: true })
  writeFileSync(join(root, '.hidden-project', 'product.json'), JSON.stringify(VALID_DECLARATION), 'utf8')
  return root
}

/* ── 启动真实路由栈 ───────────────────────────────────────────────────────── */

/**
 * 起一个只装了 WebServer + dsh-newapp-local 的 cordis 根。
 * @param {{config?: object, cacheBust?: string}} options
 * @returns 栈句柄。
 */
async function bootStack({ config = {}, cacheBust } = {}) {
  const { Context } = await import(`${APP_MODULES}/cordis/lib/index.js`)
  const { default: WebServer } = await import(`${APP_MODULES}/dsh-host-webserver/lib/index.js`)
  const pluginUrl = cacheBust === undefined ? INSTALLED_ENTRY : `${INSTALLED_ENTRY}?${cacheBust}`
  const plugin = await import(pluginUrl)

  const root = new Context()
  const logs = []
  const push = (level) => (...rest) => logs.push(`${level} ${rest.map(String).join(' ')}`)
  root.logger = { warn: push('W'), info: push('I'), error: push('E'), debug: () => {} }
  // 最小替身：本包只把 sessions 当"另一个服务"看待（栅栏不看它），
  // mountOnce 的全局标记需要一个 effect 主机——cordis Context 自带。
  root.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  const server = await waitFor(() => {
    const s = root.get('webServer')
    return s?.port ? s : null
  }, 'webServer 未在 5s 内监听')

  root.plugin(plugin, config)
  await new Promise((r) => setTimeout(r, 250))

  return {
    root,
    server,
    logs,
    port: server.port,
    pluginMeta: { name: plugin.name, inject: plugin.inject },
    routes: {
      exact: [...(server.exact?.keys?.() ?? [])].sort(),
      prefix: [...(server.prefixes?.keys?.() ?? [])].sort(),
    },
    async close() {
      try { await server.server?.close?.() } catch {}
      try { server.server?.closeAllConnections?.() } catch {}
      try { await root.stop?.() } catch {}
    },
  }
}

async function waitFor(probe, message, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(message)
    await new Promise((r) => setTimeout(r, 20))
  }
}

/* ── 探针记账 ─────────────────────────────────────────────────────────────── */

const results = []
function record(entry) {
  results.push(entry)
  console.log(`  ${entry.pass ? '✓' : '✗'} ${entry.id.padEnd(24)} ${entry.detail}`)
}

/**
 * 判分：期望状态码 + 期望响应体必须包含/不含的片段 + 可选的 JSON 断言回调。
 * @param {object} spec 判分条件。
 * @param {string} [note] 未通过时追加的补充读数（例如被调起进程的遗言）。通过时忽略。
 * @returns 记账条目。
 */
function judge({ id, kind, what, expect, res, contains, absent, json }, note) {
  const problems = []
  if (res.status !== expect) problems.push(`期望 ${expect}，实得 ${res.status ?? '(无响应)'}${note === undefined ? '' : ` ${note}`}`)
  const text = body(res)
  if (problems.length === 0 && contains !== undefined) {
    for (const needle of [].concat(contains)) {
      if (!text.includes(needle)) problems.push(`响应体缺少 ${JSON.stringify(needle)}`)
    }
  }
  if (problems.length === 0 && absent !== undefined) {
    for (const needle of [].concat(absent)) {
      if (text.includes(needle)) problems.push(`响应体不应包含 ${JSON.stringify(needle)}`)
    }
  }
  let parsed
  if (problems.length === 0 && json !== undefined) {
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      problems.push(`响应体不是 JSON：${error.message}`)
    }
    if (parsed !== undefined) {
      const complaint = json(parsed)
      if (complaint !== undefined && complaint !== null) problems.push(complaint)
    }
  }
  return {
    id,
    kind,
    what,
    pass: problems.length === 0,
    expect,
    actual: res.status,
    detail: problems.length === 0 ? `→ ${expect} ${describe(parsed, text)}` : problems.join('；'),
  }
}

/** 一行摘要，报告里能一眼看出这一条到底读到了什么。 */
function describe(parsed, text) {
  if (parsed === undefined) return `${text.split('\n')[0]?.slice(0, 60) ?? ''}`
  if (parsed.cards !== undefined) {
    return `cards=${parsed.cards.length} declared=${parsed.declaredCount} roots=${parsed.scannedRoots?.length ?? 0}`
  }
  return JSON.stringify(parsed).slice(0, 80)
}

/* ── 主流程 ───────────────────────────────────────────────────────────────── */

// 子进程模式（定义见上）在这里分流：所有原语都已就位。
const childConfigArg = args.indexOf('--child-scan')
if (childConfigArg >= 0) {
  // 子进程模式跑完就结束，**绝不落到下面的父进程路径**（否则它会再起一套夹具、
  // 再判一次分，还把两边的输出混在一条 stdout 上）。`runChildScan` 已经等到
  // RESULT 那行落地，这里的 exit 不会截断它。
  await runChildScan(args[childConfigArg + 1] ?? '{}')
  process.exit(0)
}

stage = 'prerequisites'
require_(existsSync(INSTALLED_ENTRY), `profile 里没有装载点：${INSTALLED_ENTRY}`)
require_(existsSync(APP_MODULES), `应用内 SDK 不存在：${APP_MODULES}`)
const installed = realpathSync(INSTALLED_ENTRY)
notes.push(`装载点 realpath：${installed}`)

const fixtureRoot = makeFixtureTree()
// 清理挂在 `process.on('exit')` 上，**不用 `finally`**：本探针有若干条
// `process.exit()` 路径（前置条件、仪器自检、末尾判分），而 `process.exit()` 是
// 立即终止，**不会**执行 `finally`。实测（2026-09-12）：`/var/folders/**/T/newapp-live-*`
// 累计泄漏 **23 个**夹具树——每跑一次留一个，而报告里一个字都没提。
// `exit` 处理函数是被同步执行的，`rmSync` 足够；一条注册覆盖全部退出路径。
process.on('exit', () => {
  try { rmSync(fixtureRoot, { recursive: true, force: true }) } catch { /* 尽力而为，不掩盖真因 */ }
})
const missingRoot = join(tmpdir(), 'newapp-live-does-not-exist-xyz')
const fileAsRoot = join(fixtureRoot, 'declared-project', 'product.json')

console.log(`[newapp-live] 夹具根 ${fixtureRoot}`)
console.log(`[newapp-live] 装载点 ${installed}`)

const report = {
  startedAt: new Date().toISOString(),
  installedEntry: installed,
  fixtureRoot,
  stages: {},
  results: [],
  notes: [],
}

try {
  /* ── 阶段 A：仪器自检 ─────────────────────────────────────────────────── */
  stage = 'A-instruments'
  console.log('\n阶段 A · 仪器自检')
  const stack = await bootStack({ config: { productRoots: [fixtureRoot, missingRoot, fileAsRoot] }, cacheBust: String(Date.now()) })
  report.stages.A = { port: stack.port, routes: stack.routes, plugin: stack.pluginMeta }
  notes.push(`精确路由表：[${stack.routes.exact.join(', ')}]`)

  const base = `http://127.0.0.1:${stack.port}`
  record(judge({
    id: 'srv-alive', kind: 'instrument', what: '一条不存在的路由必须 404（证明服务真在派发）',
    expect: 404, res: await curl([`${base}/api/dsh-newapp/definitely-not-here`]),
  }))
  record(judge({
    id: 'health', kind: 'instrument', what: 'health 必须 200 且自称 newapp-local（栅栏负例的正控）',
    expect: 200, res: await curl([`${base}/api/dsh-newapp/health`]),
    contains: ['"plugin":"newapp-local"', '"detector"'],
  }))
  const dead = await curl(['http://127.0.0.1:1/api/dsh-newapp/health'], { maxTimeSec: 3 })
  record({
    id: 'curl-alive', kind: 'instrument', what: '连没人监听的端口必须失败（证明 curl 的失败看得见）',
    pass: dead.exit !== 0, expect: 'curl 非零退出', actual: dead.exit,
    detail: dead.exit !== 0 ? `→ curl exit ${dead.exit}` : '连 127.0.0.1:1 竟然成功了——仪器不可信',
  })
  // 冷进程探针的解释器自证。**判据是「子进程有没有输出」，不是「退出码是不是 0」**：
  // 这个 bug 的形状恰恰是「退出码 0 却没有输出」，只看退出码的自证会被它骗过去。
  const nodeCheck = assertNodeUsable()
  record({
    id: 'node-interpreter', kind: 'instrument',
    what: '冷进程模式要用的解释器必须真的把脚本当 node 跑（阶段 C 的 default-scans-nothing 靠它）',
    pass: nodeCheck.ok, expect: '子进程回话', actual: nodeCheck.ok ? '回话' : '沉默',
    detail: `→ ${nodeCheck.detail}`,
  })

  if (!results.every((r) => r.pass)) {
    console.error('\n[newapp-live] ✗ 仪器自检未通过：不产出任何绿色结论。')
    report.results = results
    writeReport(report)
    process.exit(2)
  }

  /* ── 阶段 B：栅栏（真实 HTTP 事务） ───────────────────────────────────── */
  stage = 'B-fence'
  console.log('\n阶段 B · 信任栅栏（每条负例只换一个头，与 A3 的 200 构成差分）')
  const productsUrl = `${base}/api/dsh-newapp/products`
  const positive = await curl([productsUrl])
  record(judge({
    id: 'products-ok', kind: 'control', what: '默认请求（回环 + 同源）必须 200 —— 负例的差分基准',
    expect: 200, res: positive,
    json: (doc) => (doc.ok === true ? null : `ok 不是 true：${JSON.stringify(doc).slice(0, 120)}`),
  }))
  record(judge({
    id: 'products-cross-site', kind: 'negative', what: '只加 Sec-Fetch-Site: cross-site',
    expect: 403, res: await curl(['-H', 'Sec-Fetch-Site: cross-site', productsUrl]),
    contains: ['forbidden: loopback-only'],
  }))
  record(judge({
    id: 'products-foreign-origin', kind: 'negative', what: '只加 Origin: http://evil.example',
    expect: 403, res: await curl(['-H', 'Origin: http://evil.example', productsUrl]),
    contains: ['forbidden: loopback-only'],
  }))
  record(judge({
    id: 'products-foreign-host', kind: 'negative', what: '只把 Host 换成非回环权威',
    expect: 403, res: await curl(['-H', 'Host: evil.example', productsUrl]),
    contains: ['forbidden: loopback-only'],
  }))
  record(judge({
    id: 'products-method', kind: 'negative', what: 'POST 必须 405（发现是读，不是写）',
    expect: 405, res: await curl(['-X', 'POST', '--data', '{}', productsUrl]),
    contains: ['method not allowed'],
  }))
  record(judge({
    id: 'health-cross-site', kind: 'negative', what: 'health 也必须过栅栏（不是只有 products 被包住）',
    expect: 403, res: await curl(['-H', 'Sec-Fetch-Site: cross-site', `${base}/api/dsh-newapp/health`]),
    contains: ['forbidden: loopback-only'],
  }))

  /* ── 阶段 C：允许根与扫描语义 ─────────────────────────────────────────── */
  stage = 'C-scan'
  console.log('\n阶段 C · 允许根与扫描语义')
  const scan = JSON.parse(body(positive))

  record({
    id: 'roots-echoed', kind: 'contract', what: '扫描根必须原样回显（读者要能看见读了哪）',
    pass: Array.isArray(scan.scannedRoots)
      && scan.scannedRoots.includes(resolve(fixtureRoot))
      && scan.scannedRoots.includes(resolve(fileAsRoot)),
    expect: '三个根都在 scannedRoots 里', actual: `${scan.scannedRoots?.length ?? 0} 个`,
    detail: `→ scannedRoots=${JSON.stringify(scan.scannedRoots ?? [])}`,
  })

  const declared = scan.cards?.find((c) => c.args === undefined && c.label === 'declared-project')
  record({
    id: 'declared-card', kind: 'contract', what: '有 product.json 的目录必须出一张卡，带 id / preset / 入口服务',
    pass: declared?.declared === true
      && declared.products?.[0]?.id === 'probe-product'
      && declared.products?.[0]?.preset === 'agt-033'
      && declared.products?.[0]?.entryService === 'probe-workbench',
    expect: 'declared=true 且三字段齐全', actual: declared === undefined ? '(没有这张卡)' : JSON.stringify(declared.products?.[0] ?? null).slice(0, 120),
    detail: declared === undefined ? '没有 declared-project 卡' : `→ ${declared.products?.[0]?.id} preset=${declared.products?.[0]?.preset} svc=${declared.products?.[0]?.entryService}`,
  })

  // ★ 这条是整个 M2 的关键回归：入口面板的表单字段来自 declaration.features[].inputs。
  const declInputs = declared?.products?.[0]?.declaration?.features?.[0]?.inputs
  record({
    id: 'declaration-verbatim', kind: 'contract',
    what: '响应体里的 declaration 必须带着 features[].inputs（入口面板靠它渲染表单）',
    pass: Array.isArray(declInputs) && declInputs.length === 2
      && declInputs[0]?.key === 'a' && declInputs[1]?.key === 'b'
      && declared.products[0].declaration.features[0].skills?.[0]?.id === 'probe-skill',
    expect: 'inputs 两条 + skills 一条', actual: `inputs=${Array.isArray(declInputs) ? declInputs.length : '(缺)'}`,
    detail: Array.isArray(declInputs)
      ? `→ inputs=${JSON.stringify(declInputs.map((i) => i.key))} skills=${declared.products[0].declaration.features[0].skills?.length ?? 0}`
      : '响应体里没有 inputs —— 卡片能列、点开没有字段',
  })

  const bare = scan.cards?.find((c) => c.label === 'bare-project')
  record({
    id: 'undeclared-listed', kind: 'contract', what: '没有 product.json 的目录必须**列出**并标明未产品化（不是消失）',
    pass: bare !== undefined && bare.declared === false && /尚未产品化/.test(bare.note ?? ''),
    expect: '列出且 note 含「尚未产品化」', actual: bare === undefined ? '(被丢弃了)' : bare.note,
    detail: bare === undefined ? '目录消失了' : `→ declared=${bare.declared} note=${bare.note}`,
  })

  record({
    id: 'hidden-skipped', kind: 'contract', what: '点开头的目录不当作工作目录（不读 .git 之类）',
    pass: scan.cards?.some((c) => c.label === '.hidden-project') !== true,
    expect: '卡片列表里没有 .hidden-project', actual: `${scan.cards?.length ?? 0} 张卡`,
    detail: `→ cards=${JSON.stringify((scan.cards ?? []).map((c) => c.label))}`,
  })

  const broken = scan.unreadable?.find((u) => u.dir?.endsWith('broken-project'))
  record({
    id: 'malformed-reported', kind: 'contract', what: '坏声明必须进 unreadable 并说明原因（不是静默少一张卡）',
    pass: broken !== undefined && /不是合法 JSON/.test(broken.reason ?? ''),
    expect: 'unreadable 指名 broken-project', actual: broken === undefined ? '(没有记录)' : broken.reason,
    detail: broken === undefined ? '坏声明被静默吞掉' : `→ ${broken.reason}`,
  })

  const missing = scan.skipped?.find((s) => s.root === resolve(missingRoot))
  record({
    id: 'missing-root-skipped', kind: 'contract', what: '配了但不存在的根必须进 skipped（读不到的扫描不能长得像空扫描）',
    pass: missing !== undefined && typeof missing.reason === 'string' && missing.reason !== '',
    expect: 'skipped 指名该根且带原因', actual: missing === undefined ? '(没有记录)' : missing.reason,
    detail: missing === undefined ? '不存在的根被静默忽略' : `→ ${missing.reason}`,
  })

  const asFile = scan.skipped?.find((s) => s.root === resolve(fileAsRoot))
  record({
    id: 'file-as-root-skipped', kind: 'contract', what: '把文件当根配必须被指出来',
    pass: asFile !== undefined && /不是一个目录/.test(asFile.reason ?? ''),
    expect: 'skipped 说「不是一个目录」', actual: asFile === undefined ? '(没有记录)' : asFile.reason,
    detail: asFile === undefined ? '文件根被当成目录处理' : `→ ${asFile.reason}`,
  })

  await stack.close()

  /* 空配置 = 不扫（安全默认）。换一个**冷进程**——见 --child-scan 的说明。 */
  //
  // 子进程失败时必须**把它的遗言带上来**。第一版只写「(无响应)」：子进程崩了、
  // 超时了、还是根本没跑到打印那一步，三种原因在报告里长得一模一样——而探针的
  // 职责恰恰是「把不可见的原因变成可见的读数」。所以这里同时带回退出码、stdout
  // 尾巴与 stderr 尾巴（子进程的 `--child-scan` 会在 stdout 上打一行 `RESULT`）。
  const childRun = await runChild(['--child-scan', '{}'])
  const childLine = childRun.stdout.split('\n').find((l) => l.startsWith('RESULT '))
  const childDoc = childLine === undefined ? { status: null, body: '' } : JSON.parse(childLine.slice('RESULT '.length))
  record(judge({
    id: 'default-scans-nothing', kind: 'contract',
    what: '没有配 productRoots 时，一个目录都不许读（安全默认；冷进程里跑）',
    expect: 200, res: { status: childDoc.status, out: childDoc.body },
    json: (doc) => {
      if (doc.scannedRoots?.length !== 0) return `scannedRoots 应为空，实得 ${JSON.stringify(doc.scannedRoots)}`
      if (doc.cards?.length !== 0) return `cards 应为空，实得 ${doc.cards.length}`
      return null
    },
  }, childLine === undefined ? `（冷进程没有交出 RESULT：${childRun.trace}）` : undefined))

  /* ── 阶段 D：正在运行的实例（不做假绿） ───────────────────────────────── */
  stage = 'D-live'
  console.log('\n阶段 D · 正在运行的实例')
  const liveHealth = await curl([`${LIVE_BASE}/api/dsh-newapp/health`])
  record({
    id: 'live-health', kind: 'live', what: '运行中的实例装载了本插件（exact 路由无需 cookie 即应答）',
    pass: liveHealth.status === 200 && body(liveHealth).includes('newapp-local'),
    expect: 200, actual: liveHealth.status,
    detail: liveHealth.status === 200 ? '→ 200 newapp-local' : `→ ${liveHealth.status} ${body(liveHealth).slice(0, 60)}`,
  })

  // 同一实例里的**正控**：worktable 那套栅栏（独立实现）对同一个头答 403。
  // 它把「本机栅栏机制整体不工作」这种解释排除掉——差异只能出在被测的两条路由上。
  const control = await curl(['-H', 'Sec-Fetch-Site: cross-site', `${LIVE_BASE}/api/worktable/health`])
  report.stages.D = { ...(report.stages.D ?? {}), fenceControl: control.status }
  console.log(`  ${control.status === 403 ? '✓' : '✗'} ${'live-fence-control'.padEnd(24)} worktable 对 cross-site 答 ${control.status}（同实例正控，期望 403）`)

  const liveProducts = await curl([`${LIVE_BASE}/api/dsh-newapp/products`])
  const restartRequired = liveProducts.status === 401
  report.restartRequired = restartRequired
  report.liveProductsStatus = liveProducts.status
  console.log(`  ${restartRequired ? '⏳' : '✓'} ${'live-products'.padEnd(24)} ${liveProducts.status} ${restartRequired
    ? '——宿主半边早于本路由加载：重启后重跑本探针即转绿'
    : '——运行中的实例已在服务 products'}`)

  // 实况栅栏：本插件的两条路由对 cross-site 必须答 403。400 是「栅栏抛异常被上层兜住」
  // 的形状（2026-09-12 实测），它同样拒绝，但拒绝不是栅栏给出的判决——所以这里按 403 判分。
  //
  // 但 400 有**两种**成因，而它们需要的动作完全不同：
  //   ① 当前产物真的会抛（bug）—— 要改代码；
  //   ② 运行中的那个进程跑的是**旧产物**（宿主半边早于 ADR-0038 的 deny-not-throw）—— 要重启。
  // 二者只靠实况读数分不开。分得开的是**同一次运行里的另一个证据**：阶段 B 拿同样的请求
  // 形状打**本进程现装的产物**，它答 403。产物答 403、实况答 400 ⇒ 实况跑的不是这份产物。
  // 所以这里不再把 ② 判成红（那是「只有重启才能改变的事实」，按本探针自己的原则不该由它
  // 来假装改变），改判成**第三种状态**：记录、显示、并让退出码区别于「通过」。
  const liveCross = await curl(['-H', 'Sec-Fetch-Site: cross-site', `${LIVE_BASE}/api/dsh-newapp/health`])
  const fenceFixed = liveCross.status === 403
  const buildProvesFence = results.some((r) => r.id === 'health-cross-site' && r.pass)
  const staleHostFence = !fenceFixed && buildProvesFence
  report.liveFenceStatus = liveCross.status
  report.staleHostFence = staleHostFence
  if (staleHostFence) {
    console.log(`  ⏳ ${'live-fence'.padEnd(24)} ${liveCross.status} ——产物答 403（阶段 B health-cross-site）、实况答 `
      + `${liveCross.status}：实况跑的是旧产物，重启后复核`)
  } else {
    record({
      id: 'live-fence', kind: 'live', what: '运行中的实例对本插件路由的 cross-site 请求答 403（栅栏的判决，不是被兜住的异常）',
      pass: fenceFixed,
      expect: 403, actual: liveCross.status,
      detail: fenceFixed
        ? '→ 403 forbidden: loopback-only'
        : `→ ${liveCross.status}，且阶段 B 里本产物也没有答出 403——这是真 bug，不是旧产物`,
    })
  }

  if (!restartRequired && liveProducts.status === 200) {
    try {
      const doc = JSON.parse(body(liveProducts))
      notes.push(`实况扫描：roots=${JSON.stringify(doc.scannedRoots)} cards=${doc.cards?.length ?? 0} declared=${doc.declaredCount ?? 0}`)
    } catch {
      notes.push('实况 products 响应不是 JSON')
    }
  }

  const staleHost = restartRequired || staleHostFence
  report.stages.D = { health: liveHealth.status, products: liveProducts.status, crossSite: liveCross.status, fenceControl: control.status, restartRequired, staleHost }
  report.results = results
  const failed = results.filter((r) => !r.pass)
  report.passed = results.length - failed.length
  report.total = results.length
  writeReport(report)

  // 摘要必须让**真失败**与**待重启**分开说。变异测试实测：把「本产物答 403」这条证据
  // 拿掉后，400 正确地记成失败、退出码 1——但摘要当时仍写着「阶段 D 有项待重启复核」，
  // 读起来像「没有失败，只是没重启」。两种状态混在一行里就等于没有仪器。
  const summary = failed.length > 0
    ? `（${failed.length} 项真失败${staleHost ? `；另有阶段 D 的 ${restartRequired ? 'products ' : ''}${staleHostFence ? 'fence ' : ''}待重启复核` : ''}）`
    : (staleHost ? '（阶段 D 有项待重启复核）' : '')
  console.log(`\n[newapp-live] ${report.passed}/${report.total} 通过${summary}`)
  // 退出码三态：0 全绿 / 1 有真失败 / **3 阶段 A–C 全绿但阶段 D 因宿主未重启无法判决**。
  // 3 不是绿：它明确说「这件事没被验证过」。它也不是红：没有任何读数为这个失败负责。
  // 把 3 压成 0 是假绿，压成 1 是假红——两种都是让仪器替事实说话。
  process.exitCode = failed.length > 0 ? 1 : (staleHost ? 3 : 0)
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true })
}

/* ── 报告 ─────────────────────────────────────────────────────────────────── */

function writeReport(doc) {
  doc.notes = notes
  mkdirSync(OUT_DIR, { recursive: true })
  const file = join(OUT_DIR, 'newapp-products-live.json')
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  console.log(`[newapp-live] 报告：${file}`)
}
