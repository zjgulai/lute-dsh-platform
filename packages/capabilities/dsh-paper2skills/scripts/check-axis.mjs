#!/usr/bin/env node
/**
 * check-axis.mjs — PHASE6 F4 门禁：五层分类轴 + facet 层在**真实 vault 数据**上跑通。
 *
 * 入：
 *   paper2skills-vault/07-资源库/capability-graph.json      （F2 图谱，链的唯一事实源）
 *   paper2skills-vault/07-资源库/card-classification.json   （F5 卡端 L3 落点）
 *   paper2skills-vault/<域>/Skill-*.md                      （venue_tier / quality_tier facet）
 *   data/taxonomy.json                                      （判据，经 lib/taxonomy.js）
 *
 * 出：stdout 报告 + `--json-out` 机读结果。退出码 0 绿 / 1 判据失败 / 2 **输入没拿到**
 *     （「没东西可查」不等于「查过了没问题」—— 与 scan_secrets.py 同一条纪律）。
 *
 * 跨仓路径：vault 在另一个仓库里，故用 `P2S_VAULT` 覆盖；默认按同级目录推导，
 * 推不到就 **exit 2**，绝不静默当空数据跑绿。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAxisIndex, validateAxis, venueLegacyAudit, resolveChain, byBusiness, byFacet, AXIS, VENUE_TIERS, VENUE_UNLABELED, VENUE_LEGACY_PENDING, QUALITY_TIERS, parseFrontmatter } from '../lib/axis.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(HERE, '..')
const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const has = (n) => argv.includes(`--${n}`)

const VAULT = flag('vault', process.env.P2S_VAULT
  ?? resolve(PKG_ROOT, '../../../../paper_to_skills/paper2skills-vault'))
const RES = join(VAULT, '07-资源库')
const GRAPH = flag('graph', join(RES, 'capability-graph.json'))
const CLS = flag('classification', join(RES, 'card-classification.json'))

for (const [name, p] of [['vault', VAULT], ['capability-graph.json', GRAPH], ['card-classification.json', CLS]]) {
  if (!existsSync(p)) {
    console.error(`✗ 输入没拿到：${name} 不存在（${p}）`)
    console.error('  用 --vault/--graph/--classification 或环境变量 P2S_VAULT 指定。')
    console.error('  退出码 2 = 没测，不是通过。')
    process.exit(2)
  }
}

const graph = JSON.parse(readFileSync(GRAPH, 'utf8'))
const cls = JSON.parse(readFileSync(CLS, 'utf8'))

/** 卡 id → L3 / note，取自 F5 产物。 */
const l3ByCard = {}
const notes = {}
for (const it of cls.items) {
  l3ByCard[it.id] = it.l3 ?? []
  notes[it.id] = it.note ?? ''
}

/** 卡 id → frontmatter（按图谱里的 path 逐张读）。 */
const frontmatters = {}
let unreadable = 0
for (const c of graph.cards) {
  const p = join(resolve(PKG_ROOT, '../../../../paper_to_skills'), c.path)
  if (!existsSync(p)) {
    unreadable += 1
    continue
  }
  frontmatters[c.name] = parseFrontmatter(readFileSync(p, 'utf8'))
}
if (unreadable) {
  console.error(`✗ ${unreadable}/${graph.cards.length} 张卡读不到（图谱 path 与实物对不上）`)
  process.exit(2)
}

/** vault 顶层实有的技术域目录（实测，不是从文档抄名单）。 */
const knownDomains = readdirSync(VAULT)
  .filter((d) => /^\d{2}-/.test(d) && statSync(join(VAULT, d)).isDirectory())
  .sort()

const index = buildAxisIndex(graph, { l3ByCard, notes, frontmatters })
const res = validateAxis(index, { knownDomains })
const legacy = venueLegacyAudit(index)

const line = (k, v) => console.log(`  ${String(k).padEnd(22)} ${v}`)
console.log('PHASE6 F4 · 五层分类轴 + facet 层')
console.log(`vault: ${VAULT}`)
console.log('\n【五层链】')
for (const a of AXIS) {
  const n = a.key === 'card' ? res.stats.cards : (graph[a.graph_path] ?? []).length
  line(`${a.level}. ${a.name}`, `${n}${a.key === 'solution' && n === 0 ? '（S1 未交付）' : ''}  · ${a.docs}`)
}
console.log('\n【facet 层】')
line('tech_domain', `${res.stats.tech_domains.length} 个（vault 顶层实有 ${knownDomains.length} 个）：${res.stats.tech_domains.join(' ')}`)
line('venue_tier', `${VENUE_TIERS.length} 档 + ${VENUE_UNLABELED}（缺失 ${res.stats.venue_unlabeled}/`
  + `${res.stats.cards} = ${(res.stats.venue_unlabeled / res.stats.cards * 100).toFixed(1)}% 未标注，S10 负责回填）`)
line('  · 已登记遗留', legacy.seen && Object.keys(legacy.seen).length
  ? Object.entries(legacy.seen).map(([k, v]) => `${k}×${v}`).join(' ') : '（无）')
line('quality_tier', QUALITY_TIERS.join(' / '))
console.log('\n【覆盖】')
line('已分类', `${res.stats.classified}/${res.stats.cards}`)
line('可挂 M 格的卡', `${res.stats.mountable_cards}/${res.stats.cards}（M 格 ${res.stats.cells_mountable}/24 被覆盖）`)
line('业务轴可筛', `${byBusiness(index, {}).length} 张`)
line('facet 轴可筛', `${byFacet(index, {}).length} 张`)

if (legacy.stale.length) {
  console.log(`\n🟡 已登记的遗留 venue 取值有 ${legacy.stale.length} 项已不再出现，请从 VENUE_LEGACY_PENDING 删除：${legacy.stale.join(' ')}`)
}
if (legacy.drift.length) {
  console.log(`\n🟡 遗留 venue 取值的登记计数与实测不符（口径过期）：${legacy.drift.join('；')}`)
}

const ok = res.problems.length === 0
const out = {
  ok,
  cards: res.stats.cards,
  classified: res.stats.classified,
  blank: res.blank,
  tech_domains: res.stats.tech_domains,
  venue_unlabeled: res.stats.venue_unlabeled,
  venue_legacy: legacy,
  mountable_cards: res.stats.mountable_cards,
  cells_mountable: res.stats.cells_mountable,
  problems: res.problems,
}
if (has('json-out')) {
  const p = flag('json-out')
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(out, null, 1))
}

if (has('chain')) {
  const id = flag('chain')
  console.log(`\n【五层链】${id}`)
  console.log(JSON.stringify(resolveChain(id, index), null, 1))
}

if (!ok) {
  console.log(`\n✗ ${res.problems.length} 项不合格：`)
  for (const p of res.problems.slice(0, 40)) console.log(`  · ${p}`)
  if (res.problems.length > 40) console.log(`  …（共 ${res.problems.length} 项）`)
  process.exit(1)
}
console.log('\n✅ 判据全过')
