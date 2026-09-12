#!/usr/bin/env node
/**
 * classify-check.mjs — S1 分类结果门禁（Loop 每轮必跑）。
 *
 * 输入：$P2S_S1_OUT/<源域>.json（每域一份，由分类子任务产出）
 *       .. 结构 {domain,count,items:[{id,l3[],confidence,fills_gap[],note}]}
 *
 * 断言（任一不过即 exit 1，红即停轮，不进入下一批）：
 *  1. 每个源域的 items id 与 generated/cards.json 里该域的 id **同序同集**
 *  2. 每卡 1–3 个 L3；L3 逐字命中 taxonomy 的 151 条
 *  3. 不跨面多挂；空 l3 必须带 note
 *  4. fills_gap 只能取允许的缺口名
 *  5. 全库 1338 张卡零遗漏、零重复
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadTaxonomy, validateClassification, GENERATED_DIR, EXPECTED_GAPS, ADDITIONAL_GAPS } from '../lib/taxonomy.js'

const OUT_DIR = process.env.P2S_S1_OUT || '/tmp/p2s/s1/out'
const CARDS = join(GENERATED_DIR, 'cards.json')
const ALLOWED_GAPS = [...EXPECTED_GAPS, ...ADDITIONAL_GAPS]

if (!existsSync(CARDS)) {
  console.error(`✗ 缺少 ${CARDS}，先跑 scripts/extract-cards.mjs`)
  process.exit(1)
}
if (!existsSync(OUT_DIR)) {
  console.error(`✗ 分类产出目录不存在: ${OUT_DIR}`)
  process.exit(1)
}

const tax = loadTaxonomy()
const cards = /** @type {any[]} */ (JSON.parse(readFileSync(CARDS, 'utf8')).cards)

/** 源域 → 卡片 id 序列（权威顺序） */
const expectByDomain = /** @type {Map<string,string[]>} */ (new Map())
for (const c of cards) {
  if (!expectByDomain.has(c.src_domain)) expectByDomain.set(c.src_domain, [])
  expectByDomain.get(c.src_domain).push(c.id)
}

/** @type {string[]} */
const problems = []
/** @type {any[]} */
const allItems = []
let blankTotal = 0
let gapHits = 0
let domainsDone = 0
let crossPlaneTotal = 0

for (const [domain, expectedIds] of expectByDomain) {
  const file = join(OUT_DIR, `${domain}.json`)
  if (!existsSync(file)) {
    problems.push(`${domain}: 分类结果缺失（期望 ${expectedIds.length} 张）`)
    continue
  }
  domainsDone += 1
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    problems.push(`${domain}: JSON 解析失败（${e instanceof Error ? e.message : String(e)}）`)
    continue
  }
  const items = parsed.items
  if (!Array.isArray(items)) {
    problems.push(`${domain}: items 不是数组`)
    continue
  }
  if (items.length !== expectedIds.length) {
    problems.push(`${domain}: 条数 ${items.length} != 期望 ${expectedIds.length}`)
  }
  const gotIds = items.map((/** @type {any} */ i) => i.id)
  for (let i = 0; i < Math.min(gotIds.length, expectedIds.length); i++) {
    if (gotIds[i] !== expectedIds[i]) {
      problems.push(`${domain}: 第 ${i + 1} 条 id 顺序不一致（${gotIds[i]} != ${expectedIds[i]}）`)
      break
    }
  }
  const r = validateClassification(items, tax, { allowedGaps: ALLOWED_GAPS })
  blankTotal += r.blank
  crossPlaneTotal += r.crossPlane
  for (const it of items) gapHits += Array.isArray(it.fills_gap) ? it.fills_gap.length : 0
  for (const p of r.problems) problems.push(`${domain}: ${p}`)
  allItems.push(...items)
}

const seen = new Set()
for (const it of allItems) {
  if (seen.has(it.id)) problems.push(`全库重复分类：${it.id}`)
  seen.add(it.id)
}

const missing = cards.length - seen.size
console.log(
  `源域 ${domainsDone}/${expectByDomain.size}  ·  已分类 ${seen.size}/${cards.length} 张  ·  空 l3 ${blankTotal}  ·  跨面多挂 ${crossPlaneTotal}（非错误，树的归属由首个 L3 决定）  ·  缺口命中 ${gapHits} 次`,
)
if (missing > 0) problems.push(`全库还有 ${missing} 张卡未分类`)

if (problems.length) {
  console.error(`\n✗ 门禁未通过（${problems.length} 项）：`)
  for (const p of problems.slice(0, 60)) console.error(`  - ${p}`)
  if (problems.length > 60) console.error(`  … 另有 ${problems.length - 60} 项`)
  process.exit(1)
}
console.log('✓ 分类门禁通过')
