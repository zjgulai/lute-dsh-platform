#!/usr/bin/env node
/**
 * 活体状态取证 —— 「现在这一秒，算法技能页在真实进程里是被接上的吗？」
 *
 * 它和这个目录里另外两个探针的分工：
 *
 *   live-toggle-probe.py     打写路径（真进程 + 真栅栏 + 真语料），自还原
 *   deployed-toggle-probe.mjs 打出货产物（装机 profile 里那份 lib/index.js）
 *   live-state-probe.mjs     **打接线**：不写任何东西，只回答「接上了没有」
 *
 * 为什么需要第三个。前两个探针都假定接线是对的——它们 import 模块、直接调函数，
 * 绕过了「这个模块在运行中的进程里到底挂没挂上」这一层。而这一层恰恰是
 * 设置页里那一行出不出现的唯一决定因素，且只有真实进程能回答：
 *
 *   - 宿主半边挂上了吗（路由答不答 200）
 *   - dsh-market 自己的账本怎么判它（activation.state / live 列表）
 *   - 下次启动还会不会加载它（bundle 清单——这一条和热挂载是两套机制）
 *   - 进程里跑的是磁盘上哪一版模块（**只有这一条能证伪「改了源码就生效」**）
 *
 * 最后一条是这台机器上真实踩过的坑：插件是 12:22 热挂载的，源码 13:18 才修好。
 * Node 的 ESM 缓存不会因为磁盘变了就回滚，所以「修好了」和「进程在跑修好的那份」
 * 是两件事。本脚本把这件事**算出来**而不是写在注释里：拿被 import 的那个文件的
 * mtime 去比日志里那次挂载的时刻。
 *
 * 全程只读：三次 GET + 两次 stat + 读日志。没有写路径，不需要还原。
 *
 * 用法：
 *   node live-state-probe.mjs            # 人类可读报告，接线断了退出码 1
 *   DSH_WEB_PORT=43120 node live-state-probe.mjs
 */
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const BASE = `http://127.0.0.1:${process.env.DSH_WEB_PORT ?? '43120'}`
const PROFILE_DIR = process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'desktop')
const LOG_DIR = join(homedir(), 'Library', 'Application Support', 'DSH Desktop', 'logs')
const PACKAGE = 'dsh-algo-skills-local'
const ROW_ID = 'ui-algo-skills-local'

/** 语料事实：改了分类才该变，切换开关不该变（所以计数能当断言，哈希不能）。 */
const EXPECTED = { planes: 4, domainSlices: 12, distinctDomains: 8, roles: 50, skills: 1338, placed: 1327, unplaced: 11, emptyRoles: 2 }

/** 验收基线（见本目录 README「真机负载」）：只作观察报告，不作断言——开关也能改它。 */
const BASELINE_SHA = '413c63b91e208cbfa83f39fba65efa3b747b8a4da019634cc33546a66ab81e6b'

const results = []
let failed = 0

/**
 * 记一条判定。
 * @param {boolean} ok - 判定结果。
 * @param {string} label - 判据。
 * @param {string} detail - 实测值。
 * @param {{ soft?: boolean }} [opts] - soft 只报告不计入退出码。
 */
function check(ok, label, detail, opts = {}) {
  const mark = ok ? 'PASS' : opts.soft ? 'NOTE' : 'FAIL'
  if (!ok && !opts.soft) failed += 1
  results.push({ mark, label, detail })
}

/**
 * GET 一个路径，返回 { status, text }。
 * @param {string} path - 以 / 开头的路径。
 * @returns {Promise<{status: number, text: string}>} 响应。
 */
async function get(path) {
  const response = await fetch(BASE + path, { signal: AbortSignal.timeout(20000) })
  return { status: response.status, text: await response.text() }
}

/**
 * 装机副本里那个会被 import 的文件（`main` 指向 lib/index.js），连同它的 mtime。
 * @returns {{ deployed: string, mtime: number|null, ino: bigint|null }} 路径、mtime、inode。
 */
function deployedArtifact() {
  const deployed = join(PROFILE_DIR, 'node_modules', PACKAGE, 'lib', 'index.js')
  try {
    const stat = statSync(deployed, { bigint: true })
    return { deployed, mtime: Number(stat.mtimeMs), ino: stat.ino }
  } catch {
    return { deployed, mtime: null, ino: null }
  }
}

/**
 * 仓库 ↔ 装机副本的硬链接同一性，只看两个真的会被加载的文件。
 *
 * `file:` 依赖在本平台是**硬链接**（不是符号链接），所以两边 inode 必须相等。
 * 这条之所以值得每次量：编辑工具是 tmp+mv，写一次就断一条硬链接——而断了之后
 * 装机副本变成一份**静态拷贝**，此后所有重建都对它无效，页面停在旧代码上且毫无提示。
 * （本仓库的 24 文件全量对账是另一个命令；这里只盯住会被 import 的那两个。）
 *
 * @param {string} repoDir - 仓库里的包目录。
 * @returns {{ same: number, drift: string[], total: number }} 判定。
 */
function linkIntegrity(repoDir) {
  const drift = []
  const loaded = ['lib/index.js', 'lib/client.js']
  for (const rel of loaded) {
    try {
      const a = statSync(join(repoDir, rel), { bigint: true }).ino
      const b = statSync(join(PROFILE_DIR, 'node_modules', PACKAGE, rel), { bigint: true }).ino
      if (a !== b) drift.push(rel)
    } catch {
      drift.push(`${rel} (缺失)`)
    }
  }
  return { same: loaded.length - drift.length, drift, total: loaded.length }
}

/**
 * 今天这份宿主日志里，最后一次把本插件挂进组合树的时刻。
 * @param {number|null} bootMs - 启动时刻（毫秒），用来选日志文件。
 * @returns {{ file: string, at: number|null, line: string|null }} 日志与那条记录。
 */
function mountRecord(bootMs) {
  const day = new Date(bootMs ?? Date.now())
  const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  const file = join(LOG_DIR, `dsh-${stamp}.log`)
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return { file, at: null, line: null }
  }
  let at = null
  let line = null
  for (const candidate of text.split('\n')) {
    if (!candidate.includes(`hot-mounted ${PACKAGE}`)) continue
    const stamp = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})/.exec(candidate)
    if (stamp === null) continue
    at = new Date(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}.${stamp[7]}`).getTime()
    line = candidate.trim()
  }
  return { file, at, line }
}

/**
 * 把毫秒差写成「X 分钟」「X 小时 Y 分钟」。
 * @param {number} ms - 毫秒差（正数=更晚）。
 * @returns {string} 人类可读时长。
 */
function human(ms) {
  const minutes = Math.round(Math.abs(ms) / 60000)
  if (minutes < 1) return '不足 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

/** 打印报告。 */
function report() {
  const width = Math.max(...results.map(r => r.label.length))
  console.log('')
  console.log(`  算法技能页 · 活体状态 · ${new Date().toLocaleString('zh-CN', { hour12: false })} · ${BASE}`)
  console.log('')
  for (const r of results) {
    console.log(`  ${r.mark}  ${r.label.padEnd(width)}  ${r.detail}`)
  }
  console.log('')
  console.log(failed === 0
    ? '  接线完好：真实进程正在服务算法技能页。'
    : `  ${String(failed)} 条硬判据不过 —— 接线断了，先修这里再看页面。`)
  console.log('')
}

// ── 1. 宿主自己的账本：这个进程是谁、它认为插件活着没有 ────────────────────────
let bootMs = null
let repoDir = null
try {
  const status = JSON.parse((await get('/dsh-market/status')).text)
  const boot = String(status.boot ?? '')
  const epoch = Number(boot.split('-')[1])
  bootMs = Number.isFinite(epoch) ? epoch : null
  check(boot !== '', '宿主进程标识', boot === '' ? '(缺失)' : boot)
  if (bootMs !== null) {
    check(true, '本进程启动于', new Date(bootMs).toLocaleString('zh-CN', { hour12: false }))
  }
} catch (error) {
  check(false, '宿主进程标识', `取不到 /dsh-market/status — ${String(error)}`)
}

try {
  const installed = JSON.parse((await get('/dsh-market/installed')).text)
  const activation = installed.activation?.[PACKAGE]
  const spec = installed.installed?.[PACKAGE]
  check(spec !== undefined, '装机账本里有它', spec ?? '(不在 installed)')
  if (typeof spec === 'string' && spec.startsWith('file:')) repoDir = spec.slice('file:'.length)
  check(activation?.state === 'live', 'dsh-market 判定', activation === undefined ? '(无 activation 记录)' : `${activation.state} — ${(activation.reasons ?? []).join('; ')}`)
  check((installed.live ?? []).includes(PACKAGE), '热挂载存活列表', JSON.stringify(installed.live ?? []))
  check((installed.bundles ?? []).includes(PACKAGE), 'bundle 清单（决定下次启动）', (installed.bundles ?? []).includes(PACKAGE) ? '在 —— 重启后由常规 bundle 层加载' : '不在 —— 重启后不会加载')
  check((installed.patch?.forced ?? []).includes(ROW_ID), '用户 patch 层强制行', JSON.stringify(installed.patch ?? {}))
  const findings = installed.diagnostics?.findings ?? []
  check(findings.length === 0, 'dsh-market 诊断发现', findings.length === 0 ? '0 条' : JSON.stringify(findings).slice(0, 200))
} catch (error) {
  check(false, '装机账本', `取不到 /dsh-market/installed — ${String(error)}`)
}

// ── 2. 宿主半边：路由真的在答，而且答的是那份树 ───────────────────────────────
let tree = null
let treeSha = null
try {
  const response = await get('/api/dsh-algo-skills/health')
  const health = JSON.parse(response.text)
  check(response.status === 200 && health.ok === true, '健康路由', `${response.status} · ok=${String(health.ok)} · issues=${String(health.issues)}`)
  check(health.root === join(homedir(), '.dsh', 'skills'), '语料根', String(health.root))
} catch (error) {
  check(false, '健康路由', `取不到 /api/dsh-algo-skills/health — ${String(error)}`)
}

try {
  const response = await get('/api/dsh-algo-skills/tree')
  check(response.status === 200, '树路由', `${response.status} · ${(response.text.length / 1024).toFixed(0)} KiB`)
  treeSha = createHash('sha256').update(response.text).digest('hex')
  tree = JSON.parse(response.text)
  check(tree.ok === true, '负载 ok 标志', String(tree.ok))
} catch (error) {
  check(false, '树路由', `取不到 /api/dsh-algo-skills/tree — ${String(error)}`)
}

if (tree !== null) {
  const totals = tree.totals ?? {}
  for (const [key, want] of Object.entries(EXPECTED)) {
    check(totals[key] === want, `树计数 · ${key}`, `${String(totals[key])}${totals[key] === want ? '' : ` (期望 ${String(want)})`}`)
  }
  check(tree.issues?.length === EXPECTED.emptyRoles, '如实呈现的空白岗位', `${String(tree.issues?.length)} 条：${(tree.issues ?? []).map(s => s.split('：')[0]).join(' / ')}`)
  check(treeSha === BASELINE_SHA, '负载哈希 vs 验收基线', treeSha === BASELINE_SHA ? '逐字节一致' : `${treeSha.slice(0, 12)}… ≠ ${BASELINE_SHA.slice(0, 12)}…（开关状态或语料变过，计数仍以上面为准）`, { soft: true })
}

// ── 3. 进程里跑的是哪一版模块（这一条只有它能把「改了源码」和「生效了」分开）──
const artifact = deployedArtifact()
if (artifact.mtime === null) {
  check(false, '装机产物', `找不到 ${artifact.deployed}`)
} else {
  check(true, '装机产物', `${artifact.deployed} · inode ${String(artifact.ino)}`)
  if (repoDir === null) {
    check(false, '仓库 ↔ 装机副本', '装机账本没给出 file: 路径，无法比对硬链接')
  } else {
    const link = linkIntegrity(repoDir)
    check(link.drift.length === 0, '仓库 ↔ 装机副本（硬链接）',
      link.drift.length === 0
        ? `被加载的 ${String(link.total)} 个文件 inode 全等`
        : `**${link.drift.join(', ')} 断链** —— 装机副本已成静态拷贝，重建对它无效（ln -f 接回）`)
  }
  const mount = mountRecord(bootMs)
  if (mount.at === null) {
    check(false, '挂载时刻', `日志里没有 hot-mounted ${PACKAGE} 记录（${mount.file}）`)
  } else {
    check(true, '挂载时刻', `${new Date(mount.at).toLocaleString('zh-CN', { hour12: false })} · ${mount.line.slice(11, 23)}`)
    const drift = artifact.mtime - mount.at
    check(drift <= 0, '进程内修订 vs 磁盘修订',
      drift <= 0
        ? '磁盘修订不晚于挂载时刻 —— 进程里就是当前修订'
        : `磁盘比挂载晚 ${human(drift)} —— **进程里跑的是旧修订，本次修改要等下次启动**（页面行为不受影响；本行只说明这一件事）`,
      { soft: true })
  }
}

report()
process.exit(failed === 0 ? 0 : 1)
