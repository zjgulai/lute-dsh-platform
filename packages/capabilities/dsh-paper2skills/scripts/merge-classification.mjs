#!/usr/bin/env node
/**
 * merge-classification.mjs — 把 25 个源域的分类结果合并为入库的分类资产。
 *
 * 入：$P2S_S1_OUT/<源域>.json + generated/cards.json + data/taxonomy.json
 * 出：data/classification.json   1338 卡的分类落点（L1/L2/L3 已展开，入库）
 *     generated/coverage.json   151 个 L3 的供给覆盖表 + 空白登记（派生，不入库）
 *
 * 只在 classify-check.mjs 通过后运行；本脚本自身也重跑一遍同款断言（不信任上游）。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadTaxonomy, l3Index, slugFor, validateClassification, resolveFacets, auditGapClaims, DATA_DIR, GENERATED_DIR, EXPECTED_GAPS, ADDITIONAL_GAPS } from '../lib/taxonomy.js'

const OUT_DIR = process.env.P2S_S1_OUT || '/tmp/p2s/s1/out'
const CARDS = join(GENERATED_DIR, 'cards.json')
const ALLOWED_GAPS = [...EXPECTED_GAPS, ...ADDITIONAL_GAPS]

if (!existsSync(CARDS)) {
  console.error(`✗ 缺少 ${CARDS}，先跑 scripts/extract-cards.mjs`)
  process.exit(1)
}
const tax = loadTaxonomy()
const index = l3Index(tax)
const cards = /** @type {any[]} */ (JSON.parse(readFileSync(CARDS, 'utf8')).cards)

/** @type {Map<string, any>} */
const byId = new Map()
for (const f of readdirSync(OUT_DIR).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
  const parsed = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'))
  for (const it of parsed.items || []) byId.set(it.id, it)
}

/** @type {string[]} */
const problems = []
/** @type {any[]} */
const out = []
/** @type {Map<string, {name:string, plane:string, domain:string, role:string, cards:string[]}>} */
const coverage = new Map()
for (const e of tax.l3) coverage.set(e.name, { name: e.name, plane: e.plane, domain: e.domain, role: `${e.role_id} ${e.role_alias}`, cards: [] })

let blank = 0
/** @type {{strong:number,adjacent:number,dropped:number}} */
const gapTiers = { strong: 0, adjacent: 0, dropped: 0 }
/** @type {Map<string,{strong:number,adjacent:number}>} */
const gapByTier = new Map()
for (const c of cards) {
  const cls = byId.get(c.id)
  if (!cls) {
    problems.push(`${c.id}: 无分类结果`)
    continue
  }
  const r = validateClassification([cls], tax, { allowedGaps: ALLOWED_GAPS })
  for (const p of r.problems) problems.push(p)
  const tiers = auditGapClaims(cls, tax)
  gapTiers.strong += tiers.strong.length
  gapTiers.adjacent += tiers.adjacent.length
  gapTiers.dropped += tiers.dropped.length
  for (const g of tiers.strong) {
    const cur = gapByTier.get(g) || { strong: 0, adjacent: 0 }
    cur.strong += 1
    gapByTier.set(g, cur)
  }
  for (const g of tiers.adjacent) {
    const cur = gapByTier.get(g) || { strong: 0, adjacent: 0 }
    cur.adjacent += 1
    gapByTier.set(g, cur)
  }
  /** 校准后的认领 = strong ∪ adjacent（strong 排前） */
  const auditedGap = [...tiers.strong, ...tiers.adjacent]
  if (!cls.l3 || cls.l3.length === 0) {
    blank += 1
    out.push({
      id: c.id,
      slug: slugFor(c.id),
      title: c.title,
      src_domain: c.src_domain,
      l3: [],
      facets: null,
      planes: [],
      domains: [],
      cross_plane: false,
      confidence: cls.confidence || '',
      fills_gap: [],
      fills_gap_strong: [],
      fills_gap_adjacent: [],
      fills_gap_dropped: tiers.dropped,
      note: cls.note || '',
    })
    continue
  }
  const facets = resolveFacets(cls, tax)
  if (!facets) {
    problems.push(`${c.id}: 无法解析 L1/L2（首个 L3「${cls.l3[0]}」不在 taxonomy）`)
    continue
  }
  for (const name of cls.l3) {
    const cov = coverage.get(name)
    if (cov) cov.cards.push(c.id)
  }
  /** 该卡服务到的全部侧面/责任域（跨面多挂是真实供给，不是错误；树的唯一归属由 facets 决定） */
  const planes = [...new Set(cls.l3.map((n) => index.get(n)?.plane_id).filter(Boolean))]
  const doms = [...new Set(cls.l3.map((n) => index.get(n)?.domain_id).filter(Boolean))]
  out.push({
    id: c.id,
    slug: slugFor(c.id),
    title: c.title,
    src_domain: c.src_domain,
    l3: cls.l3,
    facets,
    planes,
    domains: doms,
    cross_plane: planes.length > 1,
    confidence: cls.confidence || '',
    fills_gap: auditedGap,
    fills_gap_strong: tiers.strong,
    fills_gap_adjacent: tiers.adjacent,
    fills_gap_dropped: tiers.dropped,
    note: cls.note || '',
  })
}

if (problems.length) {
  console.error(`✗ 合并前门禁未通过（${problems.length} 项）：`)
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`)
  process.exit(1)
}

const byConfidence = { high: 0, medium: 0, low: 0, '': 0 }
for (const o of out) byConfidence[/** @type {keyof typeof byConfidence} */ (o.confidence)] += 1

const gapCount = new Map()
for (const o of out) for (const g of o.fills_gap) gapCount.set(g, (gapCount.get(g) || 0) + 1)

mkdirSync(DATA_DIR, { recursive: true })
writeFileSync(
  join(DATA_DIR, 'classification.json'),
  JSON.stringify(
    {
      version: '1.0',
      total: out.length,
      classified: out.filter((o) => o.l3.length > 0).length,
      unassigned: blank,
      taxonomy_version: tax.version,
      by_confidence: byConfidence,
      gap_audit: {
        rule: 'fills_gap 必须与卡的 L3 落点自洽：strong=缺口名即本卡 L3；adjacent=与缺口同 L2 责任域；dropped=跨域且未挂该 L3（虚报，丢弃但留档）',
        strong: gapTiers.strong,
        adjacent: gapTiers.adjacent,
        dropped: gapTiers.dropped,
      },
      gap_hits: Object.fromEntries([...gapCount].sort((a, b) => b[1] - a[1])),
      gap_by_tier: Object.fromEntries([...gapByTier].sort((a, b) => b[1].strong + b[1].adjacent - (a[1].strong + a[1].adjacent))),
      gap_dropped_names: [...new Set(out.flatMap((o) => o.fills_gap_dropped))].sort(),
      items: out,
    },
    null,
    1,
  ) + '\n',
)

const covList = [...coverage.values()].map((v) => ({ ...v, count: v.cards.length })).sort((a, b) => b.count - a.count)
const emptyL3 = covList.filter((c) => c.count === 0)
writeFileSync(
  join(GENERATED_DIR, 'coverage.json'),
  JSON.stringify(
    {
      generated_from: 'data/classification.json',
      l3_total: covList.length,
      l3_covered: covList.length - emptyL3.length,
      l3_empty: emptyL3.length,
      empty: emptyL3.map((c) => `${c.plane}/${c.domain}/${c.name} (${c.role})`),
      coverage: covList,
    },
    null,
    1,
  ) + '\n',
)

console.log(`分类落点：${out.length} 张（已分类 ${out.length - blank} / 空 l3 ${blank}）`)
console.log(`置信度：high ${byConfidence.high} / medium ${byConfidence.medium} / low ${byConfidence.low}`)
console.log(`L3 覆盖：${covList.length - emptyL3.length}/${covList.length} 有供给，空白 ${emptyL3.length} 条`)
console.log(`缺口认领（校准后）：strong ${gapTiers.strong} · adjacent ${gapTiers.adjacent} · 丢弃虚报 ${gapTiers.dropped}`)
console.log(`  ${[...gapCount].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('  ')}`)
console.log('输出：data/classification.json · generated/coverage.json')
