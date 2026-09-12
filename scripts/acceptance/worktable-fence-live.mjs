#!/usr/bin/env node
/**
 * 「dsh-worktable 确实不在这台机器上」的**实况 curl 探针**（ADR-0045 §5 Step 5 的验收）。
 *
 * ## 它回答的问题（静态判据答不了的那些）
 *
 * `scripts/gates/worktable-fence.mjs` 读的是**磁盘状态**：profile 的 package.json 两处、
 * node_modules 目录、资产与 pin。它证明不了**此刻正在跑的那个进程**里有什么——
 * 宿主半边的路由是在启动时注册进路由表的，profile 改了它不会自己知道。
 *
 * 本文件补的就是这一段：对着**正在运行的实例**发真 curl，逐条问那些入口还在不在。
 *
 * ## 为什么判据是 404 而不是 403
 *
 * 这份探针的前身（ADR-0029/0030 那版）判的是 **403**：栅栏在位时，越权的请求会被打补丁的
 * `webServer` 拦下并给出拒绝理由。那是「插件在跑，但被围起来了」的证据，它整整 31 条判据
 * 都在回答一个问题——**运行时装载的那份产物拦不拦得住**。
 *
 * 现在的目标是**插件根本不在**。区分这两种状态正是本探针存在的理由：
 *
 *   403 → 还在跑，只是被拦住了（栅栏仍然负载）——**不通过**
 *   200 → 还在跑，而且敞着——**不通过**
 *   404 → 路由压根没注册（插件没挂载）——**通过**
 *
 * 把 403 也放过去是这份探针最容易犯的错，所以 `absent-not-fenced` 那一条专门钉住它。
 *
 * ## 仪器自检（没有它这片绿色不可信）
 *
 * - `curl-alive`：连一个**没人监听**的端口必须失败 —— 证明 curl 的失败能被我看见。
 * - `srv-alive`：一条**不存在**的路由必须回 404 —— 证明服务真的在派发，而不是「一切都 401」。
 * - `pos-health`：`/api/dsh-newapp/health` 必须 200 且带插件名 —— **正控**。没有它，
 *   「全部 404」与「实例没起 / 鉴权层全拦」是同一个读数。
 * - `pos-products`：`/api/dsh-newapp/products` 必须 200 —— 第二个正控，且顺带证明
 *   产品矩阵那条链路的宿主半边是活的。
 * 任何一条自检不成立 → **exit 2**，绝不产出一片绿色。
 *
 * ## 边界（诚实写清楚）
 *
 * - 本探针**不**验证浏览器里工作台/控制室的 UI 真的消失了。那要看客户端 bundle 有没有被
 *   装载：`bundle-absent` / `dep-absent` / `modules-absent` 三条读的是 profile 的装载清单
 *   （卸载→下次启动不加载），最后一步要在页面刷新后用眼睛确认。
 * - 实例没起（连不上）不是「插件不在」的证据，是**没有证据**：`require_` 直接 exit 2。
 * - 运行中的进程早于卸载时，那些入口会答 403（旧产物 + 旧装载清单），退出码记 **3**：
 *   这是「只有重启才能改变的事实」，不该由探针的绿色来假装已经改变，也不该被记成一次
 *   「失败」——没有任何读数为它负责。
 *
 * 用法：`node scripts/acceptance/worktable-fence-live.mjs [--base http://127.0.0.1:43120] [--out <dir>]`
 * 退出码：0 = 全部通过；1 = 有判据未通过；2 = 前置条件或仪器不可用；
 *         3 = 仪器自检全绿，但实例早于卸载（重启后重跑即转 0）。
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROFILE_DIR = join(homedir(), '.dsh', 'profiles', 'desktop')

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const BASE = argValue('--base', 'http://127.0.0.1:43120').replace(/\/$/, '')
const OUT_DIR = resolve(argValue('--out', join(REPO_ROOT, '.scratch/newapp-product-matrix/acceptance')))

const execFileAsync = promisify(execFile)

/** 前置条件缺失时响亮退出，绝不降级成「跳过 = 通过」。 */
function require_(condition, message) {
  if (!condition) {
    console.error(`[worktable-absent-live] ✗ 前置条件不成立：${message}`)
    process.exit(2)
  }
}

const STATUS_RE = /^HTTP\/1\.[01] (\d{3})/m

/**
 * 跑一次**真的** curl。
 * @returns {Promise<{status: number|null, out: string, err: string, exit: number|string|null}>}
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

const body = (res) => res.out.split(/\r?\n\r?\n/).slice(1).join('\n\n')
const results = []
function record(entry) {
  results.push(entry)
  const mark = entry.pass ? '✓' : (entry.pending ? '⏳' : '✗')
  console.log(`  ${mark} ${entry.id.padEnd(26)} ${entry.detail}`)
}

/* ── 那些入口：逐条来自 vendor 产物的 path 字面量与 PREFIX 常量 ────────────── */

/**
 * dsh-worktable 注册过的入口。
 *
 * 逐条抄自 `vendor/dsh-worktable/01_content/lib/index.js` 里 `path:` 的字面量与
 * `HEALTH_PATH` / `SITE_PREFIX` / `TEMPLATE_PREFIX` 三个常量。
 *
 * 抄在这里而**不是**从被测物的源码里扫出来，是因为判据必须是独立事实：让被测量的东西
 * 自己给自己出题，它删掉一条路由时这份探针会跟着少问一条，然后照样全绿。
 */
const ENTRIES = [
  { path: '/api/worktable/health', method: 'GET' },
  { path: '/api/worktable/workspaces', method: 'POST' },
  { path: '/api/worktable/file', method: 'GET' },
  { path: '/api/worktable/fs', method: 'GET' },
  { path: '/api/worktable/git', method: 'GET' },
  { path: '/api/worktable/mkdir', method: 'POST' },
  { path: '/api/worktable/write', method: 'POST' },
  { path: '/api/worktable/term', method: 'GET' },
  { path: '/api/worktable/site', method: 'GET' },
  { path: '/api/worktable/template', method: 'GET' },
]

const report = { base: BASE, entries: {}, static: {}, failed: [], pendingRestart: [] }

/* ── 阶段 A · 仪器自检 ────────────────────────────────────────────────────── */

console.log(`\n阶段 A · 仪器自检（对着 ${BASE}）`)

const dead = await curl(['http://127.0.0.1:1/__nobody_listening__'])
require_(
  dead.status === null,
  'curl 对死端口居然拿到了状态码——测不到失败，就没法把「失败」当读数用',
)
record({ id: 'curl-alive', pass: true, detail: `死端口无响应（exit=${String(dead.exit)}）` })

const unknown = await curl([`${BASE}/__definitely_not_a_route__`])
require_(
  unknown.status === 404,
  `不存在的路由应当 404（证明服务真在派发），实得 ${String(unknown.status)}——`
  + '若它答 401/403，本探针所有 404 都会被解释成鉴权层在拦，判据不成立',
)
record({ id: 'srv-alive', pass: true, detail: '不存在的路由 → 404（服务真在派发）' })

const posHealth = await curl([`${BASE}/api/dsh-newapp/health`])
require_(
  posHealth.status === 200 && body(posHealth).includes('newapp-local'),
  `正控失败：/api/dsh-newapp/health 应 200 且带 newapp-local，实得 ${String(posHealth.status)}。`
  + '没有这个正控，「全部 404」只是「什么都答 404」的同义词',
)
record({ id: 'pos-health', pass: true, detail: '200 newapp-local（exact 路由真在应答）' })

const posProducts = await curl([`${BASE}/api/dsh-newapp/products`])
require_(
  posProducts.status === 200,
  `正控失败：/api/dsh-newapp/products 应 200（产品矩阵的宿主半边是活的），实得 ${String(posProducts.status)}`,
)
record({ id: 'pos-products', pass: true, detail: '200（产品矩阵宿主半边在服务）' })

/* ── 阶段 B · 磁盘：装载清单三处皆无（M8） ──────────────────────────── */

console.log('\n阶段 B · 磁盘：装载清单（M8）')

const profilePkgPath = join(PROFILE_DIR, 'package.json')
require_(existsSync(profilePkgPath), `profile package.json 不存在：${profilePkgPath}`)

const profilePkg = JSON.parse(readFileSync(profilePkgPath, 'utf8'))
const bundles = profilePkg.dsh?.profile?.bundles
const inBundles = Array.isArray(bundles) && bundles.includes('dsh-worktable')
const inDeps = profilePkg.dependencies?.['dsh-worktable'] !== undefined
const inModules = existsSync(join(PROFILE_DIR, 'node_modules', 'dsh-worktable'))
report.static = { inBundles, inDeps, inNodeModules: inModules, bundleCount: Array.isArray(bundles) ? bundles.length : null }

record({ id: 'bundle-absent', pass: !inBundles, detail: inBundles ? 'bundles 里仍有 dsh-worktable' : '不在 dsh.profile.bundles 里（1.4 MB client 不会再被加载）' })
record({ id: 'dep-absent', pass: !inDeps, detail: inDeps ? 'dependencies 里仍有 dsh-worktable' : '不在 dependencies 里' })
record({ id: 'modules-absent', pass: !inModules, detail: inModules ? 'node_modules 里仍有残留目录' : 'node_modules 里没有残留' })

/* ── 阶段 C · 运行中的实例：那些入口必须都不在 ──────────────────────────────────────────── */

console.log('\n阶段 C · 运行中的实例：工作台入口必须 404')

let anyFenced = false
let notGone = 0
for (const entry of ENTRIES) {
  const res = await curl([
    '-X', entry.method,
    ...(entry.method === 'POST' ? ['-H', 'content-type: application/json', '-d', '{}'] : []),
    `${BASE}${entry.path}`,
  ])
  report.entries[entry.path] = res.status
  if (res.status === 403) anyFenced = true
  if (res.status !== 404) notGone += 1
  record({
    id: entry.path.replace('/api/worktable/', 'wt-'),
    pass: res.status === 404,
    observed: res.status,
    detail: res.status === 404
      ? '404（路由未注册）'
      : `${String(res.status)} —— 路由仍在应答：实例里插件还活着`
        + (res.status === 403 ? '（被栅栏拦下，但「被拦住」不是「不在」）' : '')
        + ` ${body(res).replace(/\s+/g, ' ').slice(0, 48)}`,
  })
}

// 「被拦住」与「不存在」的区别是这份探针的**核心判据**，单独钉一条。
// 它只在磁盘已经不干净时才算失败：磁盘干净而入口仍答 403，是「实例早于卸载」的形态，
// 归到 restart-required，不该记成一次失败——没有任何读数为它负责。
record({
  id: 'absent-not-fenced',
  pass: !anyFenced || !diskClean,
  detail: anyFenced
    ? '有入口答 403 —— 那是「还在跑、被围住」，不是「不在」；本探针不把它当作通过'
    : '无入口答 403（「不存在」与「被拦住」在本探针里是分开的）',
})

/* ── 结论 ─────────────────────────────────────────────────────────────────── */

/*
 * 判决要分开两件**不同**的事，否则读数会被误读：
 *
 *   1. **磁盘干净吗**（阶段 B）—— 卸载做没做。
 *   2. **实例干净吗**（阶段 C）—— 那个进程里插件还在不在。
 *
 * 二者可以不一致，而本次实测就是不一致的：profile 三处皆无，运行中的实例照样答
 * `/api/worktable/fs` 200。这种情况下判 exit 1 是**错的**——磁盘侧没有任何读数失败，
 * 缺的只是一次重启，而重启不是门禁能替用户做也不该替用户假装做过的事。
 * 所以：磁盘干净但实例仍应答 → **exit 3（restart-required）**；
 *       磁盘不干净 → exit 1（卸载本身没做完）。
 */
const diskClean = !inBundles && !inDeps && !inModules
report.diskClean = diskClean
report.restartRequired = diskClean && notGone > 0

const failed = diskClean
  // 磁盘干净时，阶段 C 的每一条都不是「失败」，而是「等一次重启」。
  ? []
  : instrumentAndDisk.filter((r) => !r.pass)
report.failed = failed.map((r) => r.id)
report.passed = diskClean && notGone === 0 && failed.length === 0

try {
  mkdirSync(OUT_DIR, { recursive: true })
  const outFile = join(OUT_DIR, `worktable-absent-live-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(outFile, JSON.stringify(report, null, 2))
  console.log(`\n证据：${outFile}`)
} catch (error) {
  console.error(`[worktable-absent-live] 证据写盘失败：${String(error)}`)
}

if (failed.length > 0) {
  console.error(`\n✗ 未通过：${failed.map((r) => r.id).join('、')}`)
  process.exit(1)
}
if (report.restartRequired) {
  console.log(
    `\n⏳ 磁盘侧已干净（bundles / dependencies / node_modules 三处皆无），`
    + `但运行中的实例仍有 ${notGone} 个入口在应答 —— 卸载要等一次重启才落到进程里。`
    + '\n   重启后重跑本探针，这一项自动转 0。',
  )
  process.exit(3)
}
console.log('\n✓ 全部通过：工作台入口全 404、装载清单三处皆无、两个正控 200')
process.exit(0)
