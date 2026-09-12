#!/usr/bin/env node
/**
 * 「岗位 preset 能力投影」的**实况探针**（R5 的验收）。
 *
 * ## 它回答的问题（单测答不了的那些）
 *
 * `tests/**` 的断言全部打在**夹具**上：它们证明解析器对给定输入返回给定视图，
 * **不**证明：
 *
 *   1. 真实安装里的 **51 个 preset 全部投影得出来**（`undefined` 会让整行不渲染，
 *      而一个自己写出来的 manifest 永远不会触发那条路径）；
 *   2. 供给技能的显示名在**真实的 `~/.dsh/skills/<id>/SKILL.md`** 上真的取得到
 *      ——这是唯一一处需要读第二份真实数据的地方，夹具里的假技能证不了它；
 *   3. 投影**没有悄悄少组**：组数必须等于 manifest 里 `material_skill_names` 的条数；
 *   4. 路由在**真实 HTTP 事务**里成立（栅栏、方法、状态码、body 形状），
 *      而不是在直接调用 handler 的函数调用里成立。
 *
 * ## 仪器自检（没有它这片绿色不可信）
 *
 * - `curl-alive`：连一个**没人监听**的端口必须失败 —— 证明 curl 的失败能被我看见。
 * - `srv-alive`：一条**不存在**的路由必须回 404 —— 证明服务真的在派发，而不是「一切都 403」。
 * - `node-ts`：本探针直接 import `.ts` 源（node 的类型剥离），必须先证明它能读到产品文件。
 *
 * 任何一条自检不成立 → **exit 2**，绝不产出一片绿色。
 *
 * ## 边界（诚实写清楚）
 *
 * - 断言只用**跨机器成立的不变量**（每个 preset 都能投影、每个供给都有非空显示名、
 *   组数与材料技能名一一对应）。具体某个岗位有几组、名称是什么，随材料版本变化，
 *   这里只**打印**不断言。
 * - 本探针**不**验证浏览器里的渲染（那需要页面刷新 + DOM 探针，见
 *   `scripts/acceptance/role-hero-entry-live.mjs` 与 `tests/hero-entry.spec.tsx`）。
 *
 * 用法：`node scripts/acceptance/role-capabilities-live.mjs`
 * 退出码：0 = 全部通过；1 = 有探针未通过；2 = 前置条件或仪器不可用。
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
const SRC = join(REPO_ROOT, 'packages', 'surfaces', 'dsh-role-matrix-local', 'src')

const results = []
/** Record one probe result. */
function probe(ok, name, detail) {
  results.push({ ok, name, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(52)} ${detail ?? ''}`)
}
/** Precondition or instrument failure: never a green run. */
function bail(message) {
  console.error(`\nrole-capabilities-live: ${message}`)
  process.exit(2)
}
/** Run curl; resolve with status + body, never throw for a non-2xx. */
async function curl(url, extra = []) {
  const args = ['-s', '-o', '-', '-w', '\n%{http_code}', ...extra, url]
  try {
    const { stdout } = await execFileAsync('curl', args, { timeout: 10_000 })
    const cut = stdout.lastIndexOf('\n')
    return { body: stdout.slice(0, cut), status: Number(stdout.slice(cut + 1).trim()) }
  } catch (error) {
    return { body: '', status: 0, error: error instanceof Error ? error.message : String(error) }
  }
}

// ── 自检 ──────────────────────────────────────────────────────────────────────
try {
  await execFileAsync('curl', ['--version'], { timeout: 5_000 })
} catch {
  bail('找不到 curl —— 本探针用真实 HTTP 事务判分，没有 curl 就无法自证')
}
// 没人监听的端口：curl 必须失败。
const dead = await curl('http://127.0.0.1:1/nothing')
probe(dead.status === 0, 'curl-alive 无人监听的端口必须失败', `status=${dead.status}`)

let readCapabilities
let makeRoutes
let ROUTES
try {
  // Imported by assignment rather than by destructuring pattern: two adjacent
  // `({ … } = …)` statements are one call expression to the parser (ASI does not
  // insert a semicolon before a line starting with `(`), which fails as
  // "{(intermediate value)} is not a function".
  const capabilitiesModule = await import(join(SRC, 'capabilities.ts'))
  const routesModule = await import(join(SRC, 'routes.ts'))
  readCapabilities = capabilitiesModule.readCapabilities
  makeRoutes = routesModule.makeRoutes
  ROUTES = routesModule.ROUTES
} catch (error) {
  bail(`无法直接 import 产品 .ts 源（node 类型剥离）：${error instanceof Error ? error.message : String(error)}`)
}
probe(typeof readCapabilities === 'function' && typeof makeRoutes === 'function', 'node-ts 直接读到产品源', 'capabilities.ts + routes.ts')

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PRESET_ROOT = join(DSH_HOME, '.agent-presets')
const SKILLS_ROOT = join(DSH_HOME, 'skills')
if (!existsSync(PRESET_ROOT)) bail(`找不到 preset 根：${PRESET_ROOT}`)
if (!existsSync(SKILLS_ROOT)) bail(`找不到技能根：${SKILLS_ROOT}`)

// ── A. 真实安装上的数据投影 ────────────────────────────────────────────────────
const roleDirs = readdirSync(PRESET_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^agt-\d{3}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort()
probe(roleDirs.length > 0, 'A0 真实安装里存在岗位 preset', `${roleDirs.length} 个目录`)

const unreadable = []
const droppedGroups = []
const namelessSupplies = []
const labelIsId = []
let groupTotal = 0
let supplyTotal = 0
let agt027 = null

for (const preset of roleDirs) {
  const payload = readCapabilities(PRESET_ROOT, SKILLS_ROOT, preset)
  if (payload === undefined) {
    unreadable.push(preset)
    continue
  }
  if (preset === 'agt-027') agt027 = payload

  // Cross-check the projection against the manifest it was read from: a group
  // can only disappear if the reader mis-parsed, and a silent drop is exactly
  // the failure this projection must not have.
  let declared = null
  try {
    const manifest = JSON.parse(readFileSync(join(PRESET_ROOT, preset, 'manifest.json'), 'utf8'))
    declared = manifest?.x_lute?.skills?.material_skill_names
  } catch { /* an unreadable manifest is already covered by the projection check */ }
  if (Array.isArray(declared) && declared.length !== payload.groups.length) {
    droppedGroups.push(`${preset}: 材料声明 ${declared.length} 条，投影 ${payload.groups.length} 组`)
  }
  groupTotal += payload.groups.length
  for (const group of payload.groups) {
    for (const supply of group.supplies) {
      supplyTotal += 1
      if (supply.id === '' || supply.label === '') namelessSupplies.push(`${preset} → ${group.name} → ${supply.id}`)
      else if (supply.label === supply.id) labelIsId.push(`${preset} → ${supply.id}`)
    }
  }
}

probe(unreadable.length === 0, 'A1 每个岗位 preset 都投影得出来（无 undefined）', `不可投影 ${unreadable.length} 个${unreadable.length ? `：${unreadable.slice(0, 5).join('、')}` : ''}`)
probe(droppedGroups.length === 0, 'A2 组数与材料技能名一一对应（没有静默少组）', droppedGroups.slice(0, 3).join('；') || `共 ${groupTotal} 组`)
probe(namelessSupplies.length === 0, 'A3 每个供给都有非空的 id 与显示名', `共 ${supplyTotal} 条${namelessSupplies.length ? `；无名 ${namelessSupplies.slice(0, 5).join('、')}` : ''}`)
probe(agt027 !== null && agt027.groups.length > 0, 'A4 实例投影：agt-027（守店）', agt027 === null ? '未投影' : `${agt027.planeName}·${agt027.domainName} · ${agt027.groups.length} 组 · ${agt027.manuals.length} 份手册`)
if (agt027 !== null) {
  for (const group of agt027.groups) {
    console.log(`      · ${group.name}（${group.kind}，${group.supplies.length} 供给）→ ${group.supplies.map((s) => s.label).join('、')}`)
  }
  console.log(`      · 场景手册：${agt027.manuals.map((m) => `${m.id} ${m.label}`).join('、')}`)
}
// 显示名回退到 id 是**允许**的（技能本体没有 title/description），但必须是少数；
// 大面积回退意味着技能库里那批 SKILL.md 读不到，那是真问题。
const fallbackShare = supplyTotal === 0 ? 0 : labelIsId.length / supplyTotal
probe(fallbackShare <= 0.2, 'A5 显示名回退到 id 的比例不异常', `${labelIsId.length}/${supplyTotal} = ${(fallbackShare * 100).toFixed(1)}%`)

// ── B. 真实 HTTP 事务 ─────────────────────────────────────────────────────────
const fakeContext = { get: () => undefined }
const routeList = makeRoutes(fakeContext, {
  presetRoot: () => PRESET_ROOT,
  skillsRoot: () => SKILLS_ROOT,
  logger: { warn: () => {} },
})
const server = createServer((req, res) => {
  const route = routeList.find((candidate) => candidate.path === (req.url ?? '').split('?')[0])
  if (route === undefined) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'no such route' }))
    return
  }
  void route.handler(req, res)
})
await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve) })
const port = server.address().port
const base = `http://127.0.0.1:${port}`

try {
  const ghost = await curl(`${base}/api/dsh-role-matrix/nope`)
  probe(ghost.status === 404, 'srv-alive 不存在的路由回 404（服务真的在派发）', `status=${ghost.status}`)

  const sample = roleDirs.includes('agt-027') ? 'agt-027' : roleDirs[0]
  const ok = await curl(`${base}${ROUTES.capabilities}?preset=${sample}`)
  let shape = null
  try { shape = JSON.parse(ok.body) } catch { /* reported below */ }
  probe(ok.status === 200 && shape?.ok === true && typeof shape?.capabilities?.preset === 'string',
    'B1 真实 curl 取到一个岗位的能力投影（200 + ok + capabilities）',
    `HTTP ${ok.status} · preset=${shape?.capabilities?.preset ?? '—'} · 组=${shape?.capabilities?.groups?.length ?? '—'}`)

  const notRole = await curl(`${base}${ROUTES.capabilities}?preset=cordis`)
  probe(notRole.status === 400, 'B2 非岗位 preset id 回 400（不问文件系统）', `HTTP ${notRole.status}`)

  const missing = await curl(`${base}${ROUTES.capabilities}?preset=agt-999`)
  probe(missing.status === 404, 'B3 未安装的岗位回 404', `HTTP ${missing.status}`)

  const noParam = await curl(`${base}${ROUTES.capabilities}`)
  probe(noParam.status === 400, 'B4 缺 preset 参数回 400', `HTTP ${noParam.status}`)

  const alien = await curl(`${base}${ROUTES.capabilities}?preset=${sample}`, ['-H', 'Host: example.com'])
  probe(alien.status === 403, 'B5 非本机 Host 被栅栏挡下（403）', `HTTP ${alien.status}`)

  const post = await curl(`${base}${ROUTES.capabilities}?preset=${sample}`, ['-X', 'POST'])
  probe(post.status === 405, 'B6 非 GET 回 405', `HTTP ${post.status}`)

  const list = await curl(`${base}${ROUTES.list}`)
  probe(list.status === 200, 'B7 既有 list 路由未被新路由挤掉', `HTTP ${list.status}`)
} finally {
  await new Promise((resolve) => { server.close(resolve) })
}

// ── 汇总 ─────────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过（真实安装数据 + 真实 curl 事务）`)
process.exit(failed.length === 0 ? 0 : 1)
