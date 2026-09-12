#!/usr/bin/env node
/**
 * 出海技能页 · 活体状态取证 —— 「这一秒，新页面在真实进程里是活的吗？」
 *
 * 为什么要单独有它。前七个脚本验的都是「模块里的逻辑对不对」：
 *
 *   validate-assignments.py   判定表自身合不合规
 *   probe-client-render.mjs   真 bundle + 真负载在 jsdom 里走不走得完四级下钻
 *   compose-page.mjs / shoot-pages.sh  渲染出来的 DOM 长什么样
 *
 * 没有一条在问：**这个页面在运行中的宿主里挂上了没有**。而这两件事互为独立——
 * 平台把一次改动的生效拆成两半（architecture.md 第 1 节）：
 *
 *   客户端半边 lib/client.js  改完 = **刷新浏览器**即生效
 *   宿主半边 lib/index.js     改完 = **必须重启应用**才注册新路由
 *
 * 更细的一层：Node 的 ESM 缓存不会因为磁盘变了就回滚。本机踩过——插件 12:22 热挂载、
 * 源码 13:18 才修好，于是「修好了」和「进程在跑修好的那份」是两个答案。所以本脚本
 * 不引用任何注释里的结论，每一条都现算。
 *
 * 判据（每条都能证伪，写法见 README「活体状态」一节）：
 *
 *   /list       200 + 2MB JSON            插件在进程里是活的
 *   POST /list  405 {"error":...}         处理器真的可达（排除「全局 /api 兜底拦掉了」）
 *   /org        200 {"ok":true,...}       宿主半边已是新修订 → 四层下钻可用
 *   /org        401 + 纯文本 unauthorized 路由不存在（旧修订），落入全局兜底
 *                                         ⚠️ 插件自己的 401 是 JSON {"error":"unauthorized"}，
 *                                            两者可区分——这是本条判据的关键，不能只看状态码
 *   /plugins/events 里 dsh-overseas-skills 的 rev
 *                == framedHash("plugin-artifact", [client.js 字节])
 *                                          浏览器刷新后取到的就是当前 bundle
 *
 * 只读：三次 GET + 一次 SSE + 读文件 + stat。不写任何东西，不需要还原。
 * 退出码：0 = 新页面在真实进程里可用；1 = 还不能（此时页面会走退化视图，见 README）。
 *
 * 用法：
 *   node .scratch/overseas-skills-refactor/live-state-probe.mjs
 *   DSH_WEB_PORT=43120 node .scratch/overseas-skills-refactor/live-state-probe.mjs
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const PACKAGE = 'dsh-overseas-skills'
const PKG_DIR = join(REPO, 'packages', 'capabilities', PACKAGE)
const PROFILE = process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'desktop')
const BASE = `http://127.0.0.1:${process.env.DSH_WEB_PORT ?? '43120'}`
const API = '/api/dsh-overseas-skills'

/** 装载点里那些**决定行为**的文件：缺一个或旧一个，页面就少一层东西。 */
const LOADED_FILES = [
  'lib/index.js',
  'lib/client.js',
  'lib/org-tree.js',
  'lib/preset-roles.js',
  'lib/role-map.js',
  'lib/layer-icons.js',
  'manifest/role-assignments.json',
]

/** 四层树的验收计数（离线复算得出，见 README；/org 可用时逐条对）。 */
const EXPECTED = {
  scenarios: 8,
  cards: 222,
  cardsAssigned: 209,
  cardsUnassigned: 13,
  rows: 319,
  roles: 50,
  rolesWithCards: 47,
  presetRoles: 50,
}

const results = []
let failed = 0
/** 宿主 webServer 有没有应答过任何一条路由——决定结论那一行说「等重启」还是「先修宿主」。 */
let hostAnswered = false

/**
 * 记一条判定。
 * @param {boolean} ok - 判定结果。
 * @param {string} label - 判据。
 * @param {string} detail - 实测值。
 * @param {{ soft?: boolean }} [opts] - soft 只报告，不计入退出码。
 */
function check(ok, label, detail, opts = {}) {
  if (!ok && !opts.soft) failed += 1
  results.push({ mark: ok ? 'PASS' : opts.soft ? 'NOTE' : 'FAIL', label, detail })
}

/**
 * 读一个路径的字节；读不到返回 null。
 * @param {string} path - 绝对路径。
 * @returns {Buffer|null} 内容。
 */
function bytes(path) {
  try {
    return readFileSync(path)
  } catch {
    return null
  }
}

/** sha1 前 12 位（与平台 HASH_REVISION_LENGTH 同口径）。 */
function shortHash(input) {
  return createHash('sha1').update(input).digest('hex').slice(0, 12)
}

/**
 * 复刻 dsh-client-modules 的 framedHash：域名 + \0，再按「长度:字节」逐个框住。
 * 不做字节移位的框定，两个不同输入可能撞成同一个哈希。
 * @param {string} domain - 域标签。
 * @param {Array<Buffer|string>} parts - 参与哈希的字节。
 * @returns {string} 12 位十六进制。
 */
function framedHash(domain, parts) {
  const hash = createHash('sha1').update(domain).update('\0')
  for (const part of parts) hash.update(`${String(part.byteLength)}:`).update(part)
  return hash.digest('hex').slice(0, 12)
}

/**
 * GET 一个路径，返回状态与原始文本。
 * @param {string} path - 以 / 开头的路径。
 * @param {string} [method] - HTTP 方法。
 * @returns {Promise<{status: number, text: string}>} 响应。
 */
async function request(path, method = 'GET') {
  const response = await fetch(BASE + path, { method, signal: AbortSignal.timeout(15000) })
  return { status: response.status, text: await response.text() }
}

/**
 * 读 /plugins/events 的第一帧 graph（SSE 长连接，读到就断）。
 * @returns {Promise<Record<string, unknown>|null>} 客户端图，取不到为 null。
 */
async function clientGraph() {
  const controller = new AbortController()
  try {
    const response = await fetch(`${BASE}/plugins/events`, { signal: controller.signal })
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const line = /^data: (.*)$/m.exec(buffer)
      if (line !== null) return JSON.parse(line[1]).graph
    }
    return null
  } catch {
    return null
  } finally {
    controller.abort()
  }
}

/**
 * 把毫秒差写成人类可读时长。
 * @param {number} ms - 毫秒差（正数 = 更晚）。
 * @returns {string} 时长描述。
 */
function human(ms) {
  const minutes = Math.round(Math.abs(ms) / 60000)
  if (minutes < 1) return '不足 1 分钟'
  if (minutes < 60) return `${String(minutes)} 分钟`
  return `${String(Math.floor(minutes / 60))} 小时 ${String(minutes % 60)} 分钟`
}

/** 打印报告。 */
function report() {
  const width = Math.max(...results.map((r) => r.label.length))
  console.log('')
  console.log(`  出海技能页 · 活体状态 · ${new Date().toLocaleString('zh-CN', { hour12: false })} · ${BASE}`)
  console.log('')
  for (const r of results) console.log(`  ${r.mark}  ${r.label.padEnd(width)}  ${r.detail}`)
  console.log('')
  console.log(failed === 0
    ? '  新页面在真实进程里可用：宿主 /org 已在答，客户端 bundle 就是当前这份。'
    : hostAnswered
      ? '  宿主半边还没生效 —— 页面此刻走退化视图（原场景分组 + 一行说明），重启应用后本命令转绿。'
      : '  连不上宿主 webServer（不是本次改动造成的事）—— 先把这一层修好，上面的端口/进程读数才有意义。')
  console.log('')
}

// ── 1. 进程身份：这一版回答的是「谁在跑」 ────────────────────────────────────
let bootMs = null
try {
  const status = JSON.parse((await request('/dsh-market/status')).text)
  const boot = String(status.boot ?? '')
  const epoch = Number(boot.split('-')[1])
  bootMs = Number.isFinite(epoch) ? epoch : null
  check(bootMs !== null, '宿主进程', bootMs === null ? `boot 字段无法解析：${boot}` : `${boot.split('-')[0]} 启动于 ${new Date(bootMs).toLocaleString('zh-CN', { hour12: false })}`)
} catch (error) {
  check(false, '宿主进程', `取不到 /dsh-market/status — ${String(error)}`)
}

// ── 2. 装载点对账：repo ↔ node_modules（file: 依赖的真实落点） ──────────────
// 查 node_modules 而不是 vendor：gate.mjs 的 profile-files-sync 已经写明
// 「node_modules 是 DSH 真实装载点，vendor/ 是另一份命名不同的副本」。
const loadPoint = join(PROFILE, 'node_modules', PACKAGE)
if (!existsSync(loadPoint)) {
  check(false, '装载点', `不存在 ${loadPoint}`)
} else {
  const drift = []
  const broken = []
  for (const rel of LOADED_FILES) {
    const source = bytes(join(PKG_DIR, rel))
    const deployed = bytes(join(loadPoint, rel))
    if (deployed === null) broken.push(`${rel}(缺)`)
    else if (source === null) broken.push(`${rel}(仓库缺)`)
    else if (shortHash(source) !== shortHash(deployed)) drift.push(rel)
  }
  check(broken.length === 0 && drift.length === 0, '装载点内容 = 仓库源',
    broken.length === 0 && drift.length === 0
      ? `${String(LOADED_FILES.length)} 个决定行为的文件逐字节一致（重启后加载的就是它们）`
      : `**${[...broken, ...drift].join(', ')}** 与仓库不一致，重启会加载旧内容`)
  const index = join(loadPoint, 'lib', 'index.js')
  try {
    const stat = statSync(index)
    check(true, '装载点修订时刻', `${new Date(stat.mtimeMs).toLocaleString('zh-CN', { hour12: false })} · inode ${String(stat.ino)}`)
    if (bootMs !== null) {
      const late = stat.mtimeMs - bootMs
      check(late <= 0, '装载点 vs 进程启动',
        late <= 0
          ? '磁盘修订不晚于启动 —— 进程加载的就是当前修订'
          : `磁盘比启动晚 ${human(late)} —— **进程里跑的是旧修订**（客户端半边不受影响；宿主路由要等下次启动）`,
        { soft: true })
    }
  } catch {
    check(false, '装载点修订时刻', `读不到 ${index}`)
  }
}

// ── 3. 客户端半边：浏览器刷新后拿到的是不是当前这份 bundle ──────────────────
const bundle = bytes(join(PKG_DIR, 'lib', 'client.js'))
if (bundle === null) {
  check(false, '客户端 bundle', '读不到 lib/client.js')
} else {
  const graph = await clientGraph()
  if (graph === null) {
    check(false, '客户端 bundle', '取不到 /plugins/events 的 graph')
  } else {
    const entry = (graph.entries ?? []).find((item) => item.id === PACKAGE)
    const want = framedHash('plugin-artifact', [bundle])
    check(entry !== undefined && entry.rev === want, '客户端 bundle = 当前这份',
      entry === undefined
        ? `graph 里没有 ${PACKAGE} 这一行（客户端半边没被注入）`
        : entry.rev === want
          ? `rev ${entry.rev} == framedHash(client.js) · 刷新即生效`
          : `rev ${String(entry.rev)} ≠ framedHash(client.js) ${want} —— 浏览器还在拿旧 bundle`)
  }
}

// ── 4. 宿主半边：路由可达性，以及 /org 在不在 ──────────────────────────────
try {
  const list = await request(`${API}/list`)
  hostAnswered = true
  check(list.status === 200 && list.text.startsWith('{"ok":true'), 'GET /list',
    `${String(list.status)} · ${(Buffer.byteLength(list.text) / 1048576).toFixed(2)} MiB`)
  const post = await request(`${API}/list`, 'POST')
  check(post.status === 405 && post.text.includes('method not allowed'), 'POST /list（处理器可达性）',
    `${String(post.status)} · ${post.text.trim().slice(0, 40)}`)
} catch (error) {
  check(false, '宿主路由可达性', `请求失败 — ${String(error)}`)
}

let org = null
try {
  const response = await request(`${API}/org`)
  // 关键区分：插件自己的 401 是 JSON；纯文本 unauthorized 是全局 /api 兜底 = 路由不存在。
  const pluginAnswered = response.text.trim().startsWith('{')
  if (response.status === 200) {
    org = JSON.parse(response.text)
    check(org.ok === true, 'GET /org', `200 · ok=${String(org.ok)} · ${(Buffer.byteLength(response.text) / 1024).toFixed(0)} KiB`)
  } else {
    check(false, 'GET /org', pluginAnswered
      ? `插件答了 ${String(response.status)}：${response.text.trim().slice(0, 80)}`
      : `${String(response.status)} 纯文本 unauthorized = 路由不在这个进程里（旧修订），需重启一次`)
  }
} catch (error) {
  check(false, 'GET /org', `请求失败 — ${String(error)}`)
}

// ── 5. /org 真在答时，顺手对一遍四层树的验收计数 ────────────────────────────
if (org !== null) {
  const stats = org.tree?.stats ?? {}
  const counts = {
    scenarios: (org.tree?.scenarios ?? []).length,
    cards: stats.cards,
    cardsAssigned: stats.cardsAssigned,
    cardsUnassigned: stats.cardsUnassigned,
    rows: stats.rows,
    roles: stats.roles,
    rolesWithCards: stats.rolesWithCards,
    presetRoles: org.presets?.count,
  }
  const wrong = Object.entries(EXPECTED).filter(([key, want]) => counts[key] !== want)
  check(wrong.length === 0, '四层树计数',
    wrong.length === 0
      ? Object.entries(EXPECTED).map(([k, v]) => `${k}=${String(v)}`).join(' ')
      : wrong.map(([k, want]) => `${k}=${String(counts[k])} (期望 ${String(want)})`).join(' · '))
  const zero = (org.tree?.zeroCardRoles ?? []).map((r) => r.id)
  check(zero.length === 3 && zero.includes('AGT-005'), '零卡岗位如实呈现',
    `${String(zero.length)} 个：${zero.join(' / ')}`)
}

report()
process.exit(failed === 0 ? 0 : 1)
