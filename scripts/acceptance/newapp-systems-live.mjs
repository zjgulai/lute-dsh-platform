#!/usr/bin/env node
/**
 * 「业务系统目录 + 外链开卡」的**实况 curl 探针**（`dsh-newapp-local` 第二分区的验收）。
 *
 * ## 它回答的问题（单测答不了的那些）
 *
 * `packages/surfaces/dsh-newapp-local/tests/**` 的断言全部打在**纯函数**与**假 ctx** 上。
 * 它们证明 `loadSystems()` 对给定文件返回给定视图、`makeRoutes` 对给定 `req` 返回给定
 * 状态码，**不**证明：
 *
 *   1. 真实产物里**装着** `/api/dsh-newapp/systems` 与 `/api/dsh-newapp/open-system`
 *      ——卡片的整个数据源与唯一动作都在这两条路由上，路由没注册 = 分区是空的；
 *   2. 三份 catalog JSON 真的被**打进** `lib/index.js`（`systems.ts` 的文件头说
 *      "Importing the JSON makes the build inline it"，那是一句关于构建的**主张**，
 *      不是关于构建的**证据**。装到 profile 里的那份产物如果没内联，route 会 500）；
 *   3. 栅栏在**真实 HTTP 事务**里成立，且**包住了动作路由**（`open-system` 会开浏览器，
 *      它比只读路由更需要栅栏，而"看起来写了"与"实际答 403"是两件事）；
 *   4. `open-system` 的输入词汇真的是 **31 个 slug**：任意 URL 送不进去。
 *      这是 P0-6v2（主进程对 http/https 的 `target="_blank"` 一律 deny）的**正面实现**，
 *      也是本路由唯一值得被攻的地方——单测用一个假 `openUrl` 证明了"决策"，但证明不了
 *      "真实 HTTP 事务里那个 URL 字段到不了 opener"。
 *
 * ## 仪器自检（没有它这片绿色不可信）
 *
 * - `srv-alive`：一条**不存在**的路由必须回 404 —— 证明服务真的在派发。
 * - `curl-alive`：连一个**没人监听**的端口必须失败 —— 证明 curl 的失败能被我看见。
 * - `node-interpreter`：冷进程要用真 node —— 见 `scripts/lib/real-node.mjs`。
 * - `health`：必须 200 且 body 带 `"plugin":"newapp-local"`，同时是栅栏负例的**正控**。
 * - `open-route-published`：`systems` 响应体里的 `openRoute` 必须**逐字**等于
 *   `open-system` 的路径。客户端靠它决定"画不画那颗按钮"，写错一个字符的后果是
 *   按钮永远灰着——而灰着的按钮不会报错。
 * 任何一条自检不成立 → **exit 2**，绝不产出一片绿色。
 *
 * ## 边界（诚实写清楚）
 *
 * - **不点开任何系统。** `open-system` 的**成功路径**（`{slug}` → 真去开浏览器）本探针
 *   **故意不打**：打它就会在你机器上弹出 31 次浏览器窗口。所以这里只打它的**边界**
 *   ——未知 slug 必须 404、只送 `url` 不送 `slug` 必须 400、cross-site 必须 403。
 *   成功路径的证据在 `tests/systems-routes.spec.ts`（注入假 `openUrl`，断言解出的 href
 *   且**没有真的开**）。**"探针全绿"不等于"点开能开"**，这句写在这里就是为了不让这片
 *   绿色被读成后者。真实的开浏览器由人点一次来验收。
 * - 阶段 D 打的是**正在运行的那个实例**。撰写本探针时它的宿主半边是 10:38 装载的，
 *   早于 `systems` 路由入库，因此实得 **401**（`/api/*` 落到平台前缀守卫就是这个状态）。
 *   探针把这件事记成 `restartRequired: true`，**退出码记 3 而不是 0**——需要重启才能
 *   改变的事实，不该由一个探针的绿色来假装已经改变，也不该被记成一次「失败」。
 * - 本探针**不**验证浏览器里的抽屉渲染（那需要页面刷新 + DOM 探针，见
 *   `packages/surfaces/dsh-newapp-local/scripts/design-probe.mjs`：真实 Chrome 的双主题
 *   几何与对比度读数）。
 *
 * 用法：`node scripts/acceptance/newapp-systems-live.mjs [--out <dir>]`
 * 退出码：0 = 全部通过；1 = 有探针未通过；2 = 前置条件或仪器不可用；
 *         **3 = 阶段 A–C 全绿，但阶段 D 因宿主未重启而无法判决**（见「边界」）。
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
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
/** 源页面声明的卡片数。**期望值写成一个字面量**，这样 catalog 少抓一张会转红，
 *  而不是"以实测为准"地把 30 张也认成通过。 */
const EXPECTED_SYSTEMS = 31
/** 主岗位分组的期望组数（= 被用到的主岗位数）。同样是写死的期望值，不是"以实测为准"。 */
const EXPECTED_GROUPS = 14
/** 外链只允许落在这个域下（白名单判据，见 sync-systems.mjs 的解析器断言）。 */
const ALLOWED_DOMAIN = 'lute-tlz-dddd.top'

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const OUT_DIR = resolve(argValue('--out', join(REPO_ROOT, '.scratch/lute-systems-map/acceptance')))

const execFileAsync = promisify(execFile)
let stage = 'init'
const notes = []

/** 前置条件缺失时响亮退出，绝不降级成「跳过 = 通过」。 */
function require_(condition, message) {
  if (!condition) {
    console.error(`[systems-live] ✗ 前置条件不成立（stage=${stage}）：${message}`)
    process.exit(2)
  }
}

/* ── curl ─────────────────────────────────────────────────────────────────── */

const STATUS_RE = /^HTTP\/1\.[01] (\d{3})/m

/**
 * 跑一次**真的** curl。异步 execFile：同步版会阻塞事件循环，而同进程里的 HTTP 服务
 * 正等着这个循环——那是必然死锁。
 * @param {string[]} argv curl 参数。
 * @param {{maxTimeSec?: number}} [options] 超时秒数。
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

/** curl 的响应体（去掉头）。 */
function body(res) {
  const at = res.out.indexOf('\r\n\r\n')
  return at < 0 ? res.out : res.out.slice(at + 4)
}

/* ── 启动真实路由栈 ───────────────────────────────────────────────────────── */

/**
 * 起一个只装了 WebServer + dsh-newapp-local 的 cordis 根。
 *
 * 配置给 `productRoots: []`（本探针打的是 systems 分区，产品扫描与它无关；
 * 给空根同时让 `products` 路由保持"一个目录都不读"的安全默认，探针不因此碰你的磁盘）。
 * @param {{cacheBust?: string}} [options] 装载参数。
 * @returns {Promise<object>} 栈句柄。
 */
async function bootStack({ cacheBust } = {}) {
  const { Context } = await import(`${APP_MODULES}/cordis/lib/index.js`)
  const { default: WebServer } = await import(`${APP_MODULES}/dsh-host-webserver/lib/index.js`)
  const pluginUrl = cacheBust === undefined ? INSTALLED_ENTRY : `${INSTALLED_ENTRY}?${cacheBust}`
  const plugin = await import(pluginUrl)

  const root = new Context()
  const logs = []
  const push = (level) => (...rest) => logs.push(`${level} ${rest.map(String).join(' ')}`)
  root.logger = { warn: push('W'), info: push('I'), error: push('E'), debug: () => {} }
  root.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  const server = await waitFor(() => {
    const s = root.get('webServer')
    return s?.port ? s : null
  }, 'webServer 未在 5s 内监听')

  root.plugin(plugin, { productRoots: [] })
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
  console.log(`  ${entry.pass ? '✓' : '✗'} ${entry.id.padEnd(26)} ${entry.detail}`)
}

/**
 * 判分：期望状态码 + 期望响应体必须包含/不含的片段 + 可选的 JSON 断言回调。
 * @param {object} spec 判分条件。
 * @param {string} [note] 未通过时追加的补充读数。通过时忽略。
 * @returns {object} 记账条目。
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
  if (parsed.systems !== undefined) {
    return `systems=${parsed.systems.length} 分组=${new Set(parsed.systems.map((s) => s.primary)).size} `
      + `已分类=${parsed.systems.filter((s) => s.primary !== '').length} openRoute=${parsed.openRoute ?? '(缺)'}`
  }
  return JSON.stringify(parsed).slice(0, 80)
}

/* ── 主流程 ───────────────────────────────────────────────────────────────── */

stage = 'prerequisites'
require_(existsSync(INSTALLED_ENTRY), `profile 里没有装载点：${INSTALLED_ENTRY}`)
require_(existsSync(APP_MODULES), `应用内 SDK 不存在：${APP_MODULES}`)
const installed = realpathSync(INSTALLED_ENTRY)
notes.push(`装载点 realpath：${installed}`)

/* catalog 是 snapshot，源文件与产物必须同源。读仓库里那份做**交叉核对**：
 * 探针不"相信"路由说什么，而是拿产物答的与源文件比。 */
const CATALOG_DIR = join(REPO_ROOT, 'packages/surfaces/dsh-newapp-local/src/catalog')
const catalogFile = join(CATALOG_DIR, 'systems.json')
const roleMapFile = join(CATALOG_DIR, 'role-map.json')
require_(existsSync(catalogFile), `仓库里没有 catalog：${catalogFile}`)
const catalogOnDisk = JSON.parse(readFileSync(catalogFile, 'utf8'))
const roleMapOnDisk = JSON.parse(readFileSync(roleMapFile, 'utf8'))
notes.push(`仓库 catalog：${catalogOnDisk.systems.length} 条；装载点 mtime 未知（见 ADR-0054：判据是字节，由 profile-files-sync 门禁守）`)

console.log(`[systems-live] 装载点 ${installed}`)
console.log(`[systems-live] 仓库 catalog ${catalogOnDisk.systems.length} 条`)

const report = {
  startedAt: new Date().toISOString(),
  installedEntry: installed,
  liveBase: LIVE_BASE,
  expectedSystems: EXPECTED_SYSTEMS,
  stages: {},
  results: [],
  notes: [],
}

try {
  /* ── 阶段 A：仪器自检 ─────────────────────────────────────────────────── */
  stage = 'A-instruments'
  console.log('\n阶段 A · 仪器自检')
  const stack = await bootStack({ cacheBust: String(Date.now()) })
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
  const nodeCheck = assertNodeUsable()
  record({
    id: 'node-interpreter', kind: 'instrument',
    what: '冷进程模式要用的解释器必须真的把脚本当 node 跑',
    pass: nodeCheck.ok, expect: '子进程回话', actual: nodeCheck.ok ? '回话' : '沉默',
    detail: `→ ${nodeCheck.detail}`,
  })

  if (!results.every((r) => r.pass)) {
    console.error('\n[systems-live] ✗ 仪器自检未通过：不产出任何绿色结论。')
    report.results = results
    writeReport(report)
    process.exit(2)
  }

  /* ── 阶段 B：栅栏（真实 HTTP 事务） ───────────────────────────────────── */
  stage = 'B-fence'
  console.log('\n阶段 B · 信任栅栏（每条负例只换一个头，与正控的 200 构成差分）')
  const systemsUrl = `${base}/api/dsh-newapp/systems`
  const openUrl = `${base}/api/dsh-newapp/open-system`
  const positive = await curl([systemsUrl])
  record(judge({
    id: 'systems-ok', kind: 'control', what: '默认请求（回环 + 同源）必须 200 —— 负例的差分基准',
    expect: 200, res: positive,
    json: (doc) => (doc.ok === true ? null : `ok 不是 true：${JSON.stringify(doc).slice(0, 120)}`),
  }))
  record(judge({
    id: 'systems-cross-site', kind: 'negative', what: '只加 Sec-Fetch-Site: cross-site',
    expect: 403, res: await curl(['-H', 'Sec-Fetch-Site: cross-site', systemsUrl]),
    contains: ['forbidden: loopback-only'],
  }))
  record(judge({
    id: 'systems-foreign-origin', kind: 'negative', what: '只加 Origin: http://evil.example',
    expect: 403, res: await curl(['-H', 'Origin: http://evil.example', systemsUrl]),
    contains: ['forbidden: loopback-only'],
  }))
  record(judge({
    id: 'systems-foreign-host', kind: 'negative', what: '只把 Host 换成非回环权威',
    expect: 403, res: await curl(['-H', 'Host: evil.example', systemsUrl]),
    contains: ['forbidden: loopback-only'],
  }))
  record(judge({
    id: 'systems-method', kind: 'negative', what: 'POST 必须 405（目录是读，不是写）',
    expect: 405, res: await curl(['-X', 'POST', '--data', '{}', systemsUrl]),
    contains: ['method not allowed'],
  }))

  // ★ 动作路由的栅栏。`open-system` 会开浏览器，所以它比只读路由更需要被包住；
  // 而"代码里看起来写了"与"真实事务里答 403"是两件事。
  record(judge({
    id: 'open-cross-site', kind: 'negative', what: '跨站请求不许开浏览器（动作路由也必须过栅栏）',
    expect: 403, res: await curl(['-H', 'Sec-Fetch-Site: cross-site', '-X', 'POST', '--data', '{"slug":"x"}', openUrl]),
    contains: ['forbidden: loopback-only'],
  }))
  record(judge({
    id: 'open-method', kind: 'negative', what: 'GET open-system 必须 405（开浏览器不是一次读取）',
    expect: 405, res: await curl([openUrl]),
    contains: ['method not allowed'],
  }))
  // 判据用未转义的 `slug`：响应体是 JSON，里面的引号在**线格式**上是 `\"slug\"`。
  // 第一版这里写 `"slug"`，被判成失败——那是探针对自己协议的误判，不是代码的问题。
  record(judge({
    id: 'open-empty-body', kind: 'negative', what: '空 body 必须 400 并说明形状（不是 500，也不是静默成功）',
    expect: 400, res: await curl(['-X', 'POST', '--data', '{}', openUrl]),
    contains: ['slug'],
  }))
  record(judge({
    id: 'open-cross-site-on-health', kind: 'negative', what: 'health 也必须过栅栏（不是只有业务路由被包住）',
    expect: 403, res: await curl(['-H', 'Sec-Fetch-Site: cross-site', `${base}/api/dsh-newapp/health`]),
    contains: ['forbidden: loopback-only'],
  }))

  /* ── 阶段 C：目录契约与输入词汇 ───────────────────────────────────────── */
  stage = 'C-catalog'
  console.log('\n阶段 C · 目录契约与 open-system 的输入词汇')
  let served
  try {
    served = JSON.parse(body(positive))
  } catch (error) {
    // 500 的形状是 `{error}`（catalog 没被内联进产物时就是这样）。把它说清楚，
    // 不要让后面 12 条探针统统报"字段是 undefined"——那会把一个根因讲成十二个症状。
    record({
      id: 'catalog-embedded', kind: 'contract',
      what: '三份 catalog JSON 必须内联进产物，systems 路由才能答出目录',
      pass: false, expect: 'JSON 目录', actual: `${positive.status}`,
      detail: `响应体不是 JSON（${error.message}）：${body(positive).slice(0, 160)}`,
    })
    throw new Error('catalog 未能从产物答出，后续契约断言无意义')
  }
  record({
    id: 'catalog-embedded', kind: 'contract',
    what: '三份 catalog JSON 必须内联进产物（文件头那句"import 让它内联"是关于构建的主张，这是证据）',
    pass: Array.isArray(served.systems) && served.systems.length > 0,
    expect: `systems 数组非空`, actual: `systems=${served.systems?.length ?? '(缺)'}`,
    detail: Array.isArray(served.systems) ? `→ systems=${served.systems.length}` : '响应体里没有 systems 数组',
  })

  const systems = served.systems ?? []
  record({
    id: 'catalog-size', kind: 'contract',
    what: `源页面 ${EXPECTED_SYSTEMS} 张卡必须一张不少地进目录（期望值写死，不用实测兜底）`,
    pass: systems.length === EXPECTED_SYSTEMS,
    expect: `${EXPECTED_SYSTEMS}`, actual: systems.length,
    detail: systems.length === EXPECTED_SYSTEMS ? `→ ${systems.length} 条` : `→ ${systems.length} 条（少 ${EXPECTED_SYSTEMS - systems.length}）`,
  })

  const slugs = systems.map((s) => s.slug)
  record({
    id: 'slug-unique', kind: 'contract', what: 'slug 必须唯一（它是 open-system 的唯一键，重复 = 有一张卡永远打不开）',
    pass: new Set(slugs).size === slugs.length,
    expect: `${slugs.length} 个唯一 slug`, actual: `${new Set(slugs).size} 个`,
    detail: new Set(slugs).size === slugs.length ? `→ ${slugs.length} 个唯一` : `→ 重复：${slugs.filter((s, i) => slugs.indexOf(s) !== i).join(', ')}`,
  })

  const hosts = systems.map((s) => s.host)
  record({
    id: 'host-unique', kind: 'contract', what: '31 个唯一域名（源页面无重复 href）',
    pass: new Set(hosts).size === hosts.length,
    expect: `${hosts.length} 个唯一域名`, actual: `${new Set(hosts).size} 个`,
    detail: new Set(hosts).size === hosts.length ? `→ ${hosts.length} 个唯一` : `→ 重复：${hosts.filter((h, i) => hosts.indexOf(h) !== i).join(', ')}`,
  })

  // ★ 白名单：catalog 只许指向源站域。这是"抓取解析器没抓进脏链接"的守门，
  // 也是 open-system 能安全存在的**前提**——它开的地址全部来自这里。
  const badHref = systems.filter((s) => {
    try {
      const u = new URL(s.href)
      return u.protocol !== 'https:' || !(u.hostname === ALLOWED_DOMAIN || u.hostname.endsWith(`.${ALLOWED_DOMAIN}`))
    } catch {
      return true
    }
  })
  record({
    id: 'href-allowlist', kind: 'contract',
    what: `每个 href 必须落在 *.${ALLOWED_DOMAIN} 且为 https（open-system 打开的地址全部来自这里）`,
    pass: badHref.length === 0,
    expect: '0 条越界', actual: `${badHref.length} 条`,
    detail: badHref.length === 0
      ? `→ ${systems.length}/${systems.length} 在白名单内`
      : `→ 越界：${badHref.slice(0, 3).map((s) => `${s.slug}=${s.href}`).join(' ')}`,
  })

  // ★ 每个系统都必须有唯一的主岗位。UNCLASSIFIED 在这里不是"降级显示"而是"漏映射"：
  // 面板会把没有主岗位的系统放进「未分类」组，那等于把一件本该被裁决的事藏进 UI。
  const unclassified = systems.filter((s) => s.primary === '')
  record({
    id: 'all-classified', kind: 'contract',
    what: '每个系统都必须有主岗位（没有 = role-map 漏了一条，不该由 UI 的「未分类」组兜住）',
    pass: unclassified.length === 0,
    expect: '0 条未分类', actual: `${unclassified.length} 条`,
    detail: unclassified.length === 0 ? `→ 31/31 已分类` : `→ 未分类：${unclassified.map((s) => s.slug).join(', ')}`,
  })

  // 岗位 id 的形状来自**材料自己的编号**：`AGT-001` … `AGT-050`。
  //
  // 这里曾被写成 `/^agt-\d{3}$/`（小写），实测直接转红——因为 `agt-NNN` 是**preset 目录
  // 名**，`AGT-NNN` 才是**岗位 id**。两者是同一套编号的两种写法，混用会得到"看着像对
  // 的"断言。那条红是探针写错了，不是目录写错了；记在这里是因为下一个读的人会先怀疑目录。
  const ROLE_MIN = 1
  const ROLE_MAX = 50
  const roleOk = (id) => {
    if (!/^AGT-\d{3}$/.test(id)) return false
    const n = Number(id.slice(4))
    return n >= ROLE_MIN && n <= ROLE_MAX
  }
  const badRole = systems.filter((s) => !roleOk(s.primary))
  const badAlso = systems.flatMap((s) => s.also.filter((id) => !roleOk(id)).map((id) => `${s.slug}=${id}`))
  record({
    id: 'role-vocabulary', kind: 'contract',
    what: `主岗位与兼属岗位都必须是 AGT-001…AGT-050 内的 id（材料的那套编号，不是 preset 目录名）`,
    pass: badRole.length === 0 && badAlso.length === 0,
    expect: '0 条越界', actual: `主岗 ${badRole.length} 条 / 兼属 ${badAlso.length} 条`,
    detail: badRole.length === 0 && badAlso.length === 0
      ? `→ 主岗 ${systems.length}/${systems.length}、兼属全部在 AGT-${String(ROLE_MIN).padStart(3, '0')}…AGT-${String(ROLE_MAX).padStart(3, '0')}`
      : `→ 主岗越界 ${badRole.slice(0, 3).map((s) => `${s.slug}=${s.primary}`).join(' ')}；兼属越界 ${badAlso.slice(0, 3).join(' ')}`,
  })

  // ★★ 分组不重不漏 —— 本分区的主分类轴。
  //
  // **第一版这条是空转的，记在这里当反面教材。** 它断言「Σ组内条数 = 系统数」：
  // 而这份分组是 `for (s of systems) grouped[primary].push(slug)` 建出来的，
  // 每个系统**按构造**只会落进一个桶，所以那个等式**恒成立**——无论 role-map 写成
  // 什么样。一个恒真的断言给出的绿不是证据，是装饰。
  //
  // 现在判据换成两条**能被证伪**的：
  //   ① 分组后的 slug **集合**必须与仓库 catalog 源文件的 slug 集合相等
  //      （集合比，不是比条数——比条数会被"少一个 A、多一个 B"骗过去）；
  //   ② 组数必须等于**写死的期望值**：catalog 是冻结快照，一次静默的重新归类
  //      不该悄悄改变抽屉里分了几组。
  const grouped = new Map()
  for (const s of systems) {
    const key = s.primary === '' ? '(未分类)' : s.primary
    grouped.set(key, [...(grouped.get(key) ?? []), s.slug])
  }
  const groupedSlugs = [...grouped.values()].flat().sort().join(',')
  const sourceSet = new Set(catalogOnDisk.systems.map((s) => s.slug))
  const servedSet = new Set(systems.map((s) => s.slug))
  const setEqual = sourceSet.size === servedSet.size && [...sourceSet].every((slug) => servedSet.has(slug))
  record({
    id: 'grouping-exact', kind: 'contract',
    what: `分组后不重不漏且组数 = ${EXPECTED_GROUPS}（集合与仓库源文件相等；组数是写死的期望值，一次静默重新归类不该悄悄改掉它）`,
    pass: setEqual && grouped.size === EXPECTED_GROUPS && groupedSlugs === [...sourceSet].sort().join(','),
    expect: `集合相等且 ${EXPECTED_GROUPS} 组`,
    actual: `组数 ${grouped.size}，集合${setEqual ? '相等' : '不等'}`,
    detail: setEqual && grouped.size === EXPECTED_GROUPS
      ? `→ ${grouped.size} 个主岗位分组，覆盖 ${servedSet.size}/${sourceSet.size} 个 slug`
      : `→ 组数 ${grouped.size}（期望 ${EXPECTED_GROUPS}）；集合${setEqual ? '相等' : '不等'}；`
        + `分组后缺：${[...sourceSet].filter((s) => !servedSet.has(s)).join(',') || '无'}`,
  })

  record({
    id: 'coverage-honest', kind: 'contract',
    what: 'coverage 必须是自洽的读数（systems 与 byKind 都要对得上，页脚拿它如实报数）',
    pass: served.coverage?.systems === systems.length
      && Object.values(served.coverage?.byKind ?? {}).reduce((a, b) => a + b, 0) === systems.length,
    expect: `coverage.systems = ${systems.length} 且 byKind 求和相等`,
    actual: `systems=${served.coverage?.systems ?? '(缺)'} byKindΣ=${Object.values(served.coverage?.byKind ?? {}).reduce((a, b) => a + b, 0)}`,
    detail: `→ byKind=${JSON.stringify(served.coverage?.byKind ?? {})}`,
  })

  // 图标走的是**封闭词汇表**（catalog 自己声明），客户端只按 tag 派发。
  // 一个不在表里的 tag = 一张没有图标的卡，而 React 不会为此报错。
  //
  // 词汇表是**两个轴**，不是一张平表：`{elements: [...], attributes: [...]}`。
  // 第一版这里对整份对象求 `new Set(...)`，直接抛「object is not iterable」——
  // 探针崩在断言自己身上。两轴要分别查：标签名查 elements，属性**名**查 attributes。
  const vocabulary = catalogOnDisk.iconVocabulary ?? {}
  const elements = new Set(vocabulary.elements ?? [])
  const attributes = new Set(vocabulary.attributes ?? [])
  const badIcon = []
  for (const s of systems) {
    if (!Array.isArray(s.icon) || s.icon.length === 0) {
      badIcon.push(`${s.slug}=无图标`)
      continue
    }
    for (const shape of s.icon) {
      if (!elements.has(shape.tag)) badIcon.push(`${s.slug}=<${shape.tag}> 不在 elements`)
      for (const key of Object.keys(shape.attrs ?? {})) {
        if (!attributes.has(key)) badIcon.push(`${s.slug}=@${key} 不在 attributes`)
      }
    }
  }
  record({
    id: 'icon-vocabulary', kind: 'contract',
    what: '每张卡的图标标签与属性名都必须落在 catalog 声明的封闭词汇表里（不在 = 一张画不出来的卡，且不报错）',
    pass: badIcon.length === 0,
    expect: '0 条越界', actual: `${badIcon.length} 条`,
    detail: badIcon.length === 0
      ? `→ elements [${[...elements].join(', ')}] / attributes ${attributes.size} 个，31/31 合规`
      : `→ 越界：${badIcon.slice(0, 4).join(' ')}`,
  })

  // `undefined` 值的属性会在 React 里渲染成"未设置"，但它是那种"活过一跳、在下一跳炸掉"
  // 的值（见 systems.ts 的注释）。序列化后 JSON 里本不该出现 undefined 键。
  const undefinedAttr = systems.filter((s) => s.icon.some((shape) => Object.values(shape.attrs).some((v) => v === undefined)))
  record({
    id: 'icon-attrs-defined', kind: 'contract',
    what: '图标属性不得带 undefined 值（能活过一跳、在下一跳炸掉的值）',
    pass: undefinedAttr.length === 0,
    expect: '0 条', actual: `${undefinedAttr.length} 条`,
    detail: undefinedAttr.length === 0 ? '→ 31/31 属性全部有值' : `→ ${undefinedAttr.slice(0, 3).map((s) => s.slug).join(', ')}`,
  })

  // ★ 客户端靠这个字面量决定"画不画那颗按钮"。写错一个字符 → 按钮永远灰着，且不报错。
  record({
    id: 'open-route-published', kind: 'contract',
    what: 'systems 响应体里的 openRoute 必须逐字等于 open-system 的路径（客户端靠它决定画不画按钮）',
    pass: served.openRoute === '/api/dsh-newapp/open-system',
    expect: '/api/dsh-newapp/open-system', actual: served.openRoute ?? '(缺)',
    detail: served.openRoute === '/api/dsh-newapp/open-system'
      ? '→ 逐字相符'
      : `→ 实得 ${JSON.stringify(served.openRoute)}——客户端会画一颗永远灰着的按钮`,
  })

  // 与仓库源文件交叉核对：产物答的必须就是源文件里那份，不许"路由自己编一份"。
  const servedSlugs = [...slugs].sort().join(',')
  const diskSlugs = catalogOnDisk.systems.map((s) => s.slug).sort().join(',')
  record({
    id: 'catalog-matches-source', kind: 'contract',
    what: '产物答出的 slug 集合必须与仓库 catalog 源文件逐字一致（路由不许自己编一份）',
    pass: servedSlugs === diskSlugs,
    expect: `${EXPECTED_SYSTEMS} 个 slug 集合相等`, actual: servedSlugs === diskSlugs ? '相等' : '不同',
    detail: servedSlugs === diskSlugs
      ? `→ ${EXPECTED_SYSTEMS}/${EXPECTED_SYSTEMS} 逐字一致`
      : `→ 仅产物有：${slugs.filter((s) => !catalogOnDisk.systems.some((d) => d.slug === s)).join(',') || '无'}；仅源文件有：${catalogOnDisk.systems.filter((d) => !slugs.includes(d.slug)).map((d) => d.slug).join(',') || '无'}`,
  })

  /* ── 阶段 C2：open-system 的输入词汇（本路由唯一值得被攻的地方） ────────── */
  //
  // **这里故意不打成功路径。** 打它就会在你机器上弹出浏览器窗口。所以三条断言
  // 全部打在"拒绝"上：未知 slug、只送 URL、超长 body。它们合起来证明的是同一件事
  // ——**客户端的输入到不了 opener**：唯一能通车的是目录里那 31 个键。
  stage = 'C2-vocabulary'
  console.log('\n阶段 C2 · open-system 的输入词汇（只打拒绝，不打成功路径——成功路径会弹浏览器）')
  record(judge({
    id: 'open-unknown-slug', kind: 'negative', what: '目录里没有的 slug 必须 404 —— 这是"不是 URL opener"的边界本身',
    expect: 404, res: await curl(['-X', 'POST', '--data', '{"slug":"definitely-not-a-system"}', openUrl]),
    contains: ['unknown system'],
  }))
  // ★ 核心断言：送一个陌生 URL 进去。它**不是** slug，所以必须 400；如果实现里
  // 有一句 `body.url ?? body.slug`，这条会变成 200 并且真的把 evil.example 打开。
  record(judge({
    id: 'open-url-not-honoured', kind: 'negative',
    what: '只送 url（不送 slug）必须 400 —— 客户端送不进任意地址（P0-6v2 的正面实现）',
    expect: 400, res: await curl(['-X', 'POST', '--data', '{"url":"https://evil.example/","href":"https://evil.example/"}', openUrl]),
    contains: ['slug'],
    absent: ['evil.example'],
  }))
  record(judge({
    id: 'open-slug-not-string', kind: 'negative', what: 'slug 不是字符串必须 400（不是 500，也不是被 String() 化）',
    expect: 400, res: await curl(['-X', 'POST', '--data', '{"slug":123}', openUrl]),
  }))
  record(judge({
    id: 'open-non-object-body', kind: 'negative', what: 'body 不是 JSON 对象必须 400（不是 500）',
    expect: 400, res: await curl(['-X', 'POST', '--data', 'not json at all', openUrl]),
  }))

  await stack.close()

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

  const liveSystems = await curl([`${LIVE_BASE}/api/dsh-newapp/systems`])
  // 产物在本进程答 200（阶段 B 的正控），实况却答非 200 ⇒ 实况跑的不是这份产物。
  // 这与"路由写错了"是两个不同的诊断，而它们只差这一个证据：上一行。
  const buildProvesRoute = results.some((r) => r.id === 'systems-ok' && r.pass)
  const restartRequired = liveSystems.status !== 200 && buildProvesRoute
  report.restartRequired = restartRequired
  report.liveSystemsStatus = liveSystems.status
  if (restartRequired) {
    console.log(`  ⏳ ${'live-systems'.padEnd(26)} ${liveSystems.status} ——本产物答 200（阶段 B systems-ok），实况答 `
      + `${liveSystems.status}：宿主半边早于本路由装载，重启后重跑本探针即转绿`)
  } else {
    record({
      id: 'live-systems', kind: 'live', what: '运行中的实例已在服务 systems 目录',
      pass: liveSystems.status === 200,
      expect: 200, actual: liveSystems.status,
      detail: liveSystems.status === 200
        ? `→ 200 ${body(liveSystems).slice(0, 60)}`
        : `→ ${liveSystems.status}，且阶段 B 里本产物答 200——这是真 bug，不是旧产物`,
    })
  }

  // 实况如果是 200，还要核对它服的**是不是这一份**目录：一个能答 200 但答的是旧 catalog
  // 的宿主，比一个答 401 的宿主更危险（它看起来是好的）。
  if (liveSystems.status === 200) {
    try {
      const doc = JSON.parse(body(liveSystems))
      const liveCount = doc.systems?.length ?? 0
      record({
        id: 'live-catalog-matches-build', kind: 'live',
        what: '实况服的目录条数必须与产物一致（能答 200 但答旧 catalog 的宿主比 401 更危险）',
        pass: liveCount === systems.length,
        expect: `${systems.length}`, actual: liveCount,
        detail: liveCount === systems.length ? `→ ${liveCount} 条，与产物一致` : `→ 实况 ${liveCount} 条 vs 产物 ${systems.length} 条`,
      })
      notes.push(`实况目录：systems=${liveCount} 分组=${new Set((doc.systems ?? []).map((s) => s.primary)).size}`)
    } catch {
      notes.push('实况 systems 响应不是 JSON')
    }
  }

  const liveCross = await curl(['-H', 'Sec-Fetch-Site: cross-site', `${LIVE_BASE}/api/dsh-newapp/health`])
  const fenceFixed = liveCross.status === 403
  const buildProvesFence = results.some((r) => r.id === 'open-cross-site-on-health' && r.pass)
  // `staleHostFence` 只在**实况没答出 403**时才成立。第一版这里写的是
  // `restartRequired || staleHostFence`，于是实况明明答了 403（一条真实的绿）也被并进
  // 「待重启复核」——那是拿系统的缺席去覆盖一条已经拿到的读数。栅栏与 systems 路由是
  // **两件事**：宿主半边旧到没有 systems 路由，并不妨碍它的栅栏正常工作。
  const staleHostFence = !fenceFixed && buildProvesFence
  report.liveFenceStatus = liveCross.status
  report.staleHostFence = staleHostFence
  if (staleHostFence) {
    console.log(`  ⏳ ${'live-fence'.padEnd(26)} ${liveCross.status} ——产物答 403（阶段 B open-cross-site-on-health）、实况答 `
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

  const staleHost = restartRequired || staleHostFence
  report.stages.D = { health: liveHealth.status, systems: liveSystems.status, crossSite: liveCross.status, restartRequired, staleHost }
  report.results = results
  const failed = results.filter((r) => !r.pass)
  report.passed = results.length - failed.length
  report.total = results.length
  writeReport(report)

  const summary = failed.length > 0
    ? `（${failed.length} 项真失败${staleHost ? '；另有阶段 D 待重启复核' : ''}）`
    : (staleHost ? '（阶段 D 有项待重启复核）' : '')
  console.log(`\n[systems-live] ${report.passed}/${report.total} 通过${summary}`)
  // 退出码三态：0 全绿 / 1 有真失败 / 3 阶段 A–C 全绿但阶段 D 因宿主未重启无法判决。
  // 3 不是绿：它明确说「这件事没被验证过」。它也不是红：没有任何读数为这个失败负责。
  process.exitCode = failed.length > 0 ? 1 : (staleHost ? 3 : 0)
} catch (error) {
  console.error(`\n[systems-live] ✗ 探针异常中断（stage=${stage}）：${error.message}`)
  report.results = results
  report.aborted = { stage, message: error.message }
  writeReport(report)
  process.exitCode = 1
}

/* ── 报告 ─────────────────────────────────────────────────────────────────── */

function writeReport(doc) {
  doc.notes = notes
  mkdirSync(OUT_DIR, { recursive: true })
  const file = join(OUT_DIR, 'newapp-systems-live.json')
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  console.log(`[systems-live] 报告：${file}`)
}
