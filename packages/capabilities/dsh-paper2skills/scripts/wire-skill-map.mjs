#!/usr/bin/env node
/**
 * wire-skill-map.mjs — 把已分类的论文技能接到 50 岗位的 `skill-map.json` 上。
 *
 * 入：data/classification.json（1338 张卡的 L1/L2/L3 落点）
 *     scripts/role-presets/skill-map.json（151 个业务技能名 → {kind, supply[]}）
 * 出：scripts/role-presets/skill-map.json（就地更新；原文件先备份）
 *     generated/wire-report.json
 *
 * 接线判据：
 *  - 一个 L3 名（业务技能名）的新增供给 = 落在这个 L3 上的论文技能里**排名最高**的 N 个。
 *    排名：① 该 L3 是卡的首位 L3（主归属）> ② 该 L3 是卡的次位 L3 > ③ 卡仅在 `fills_gap_adjacent` 里邻接提到
 *    同级内：confidence high > medium > low；再按卡 id 稳定排序。
 *  - **绝不动已有 supply**（只追加），绝不删除已有条目。
 *  - `kind`：原有 `gap` 且新增了 ①/② 类供给 → `direct`；只有 ③ 类邻接供给 → `partial`；否则保持 `gap`。
 *  - 每 L3 追加数量有上限（默认 3；原为 gap 的 L3 放宽到 5），防止把 preset 的 skill-subset 撑爆。
 *
 * 用法：node scripts/wire-skill-map.mjs [--dry]
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, GENERATED_DIR, PKG_ROOT, EXPECTED_GAPS } from '../lib/taxonomy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(PKG_ROOT, '..', '..', '..')
const SKILL_MAP = join(REPO, 'scripts', 'role-presets', 'skill-map.json')
const CLASSIFICATION = join(DATA_DIR, 'classification.json')
const BACKUP_DIR = join(PKG_ROOT, 'staging', 'backup')
const DRY = process.argv.includes('--dry')

const PER_L3 = Number(process.env.P2S_PER_L3 || 3)
const PER_L3_GAP = Number(process.env.P2S_PER_L3_GAP || 5)
const CONF_RANK = { high: 0, medium: 1, low: 2, '': 3 }

if (!existsSync(CLASSIFICATION)) {
  console.error(`✗ 缺少 ${CLASSIFICATION}，先跑 scripts/merge-classification.mjs`)
  process.exit(1)
}
if (!existsSync(SKILL_MAP)) {
  console.error(`✗ 找不到 ${SKILL_MAP}`)
  process.exit(1)
}

const cls = JSON.parse(readFileSync(CLASSIFICATION, 'utf8'))
const mapFile = JSON.parse(readFileSync(SKILL_MAP, 'utf8'))
/** @type {Record<string,{kind:string,supply:string[],note?:string}>} */
const skills = mapFile.skills

/** L3 名 → 按排名排好的候选卡 */
/** @type {Map<string,{primary:any[],secondary:any[],adjacent:any[]}>} */
const cand = new Map()
const ensure = (/** @type {string} */ n) => {
  if (!cand.has(n)) cand.set(n, { primary: [], secondary: [], adjacent: [] })
  return cand.get(n)
}
for (const item of cls.items) {
  for (let i = 0; i < item.l3.length; i++) {
    const n = item.l3[i]
    if (!(n in skills)) continue
    ;(i === 0 ? ensure(n).primary : ensure(n).secondary).push(item)
  }
  for (const n of item.fills_gap_adjacent || []) {
    if (!(n in skills)) continue
    ensure(n).adjacent.push(item)
  }
}
const byRank = (/** @type {any[]} */ arr) =>
  arr.sort((a, b) => (CONF_RANK[a.confidence] ?? 3) - (CONF_RANK[b.confidence] ?? 3) || (a.id < b.id ? -1 : 1))

/** @type {{name:string,was:string,now:string,added:string[],addedCount:number,jumped:boolean}[]} */
const changes = []
let touched = 0
let addedTotal = 0

for (const [name, entry] of Object.entries(skills)) {
  const groups = cand.get(name)
  if (!groups) continue
  const limit = entry.kind === 'gap' ? PER_L3_GAP : PER_L3
  const pool = [...byRank(groups.primary), ...byRank(groups.secondary)]
  const adjacent = byRank(groups.adjacent)
  const picked = [...pool, ...adjacent].slice(0, limit).map((x) => x.slug)
  const fresh = picked.filter((s) => !entry.supply.includes(s))
  if (fresh.length === 0) continue

  const strongCount = pool.slice(0, limit).length
  const was = entry.kind
  let now = was
  if (was === 'gap') now = strongCount > 0 ? 'direct' : 'partial'
  else if (was === 'partial' && strongCount > 0) now = 'partial' // 部分供给仍是 partial，只有人工确认后才升 direct

  changes.push({ name, was, now, added: fresh, addedCount: fresh.length, jumped: was === 'gap' && now !== 'gap' })
  entry.supply = [...entry.supply, ...fresh]
  if (now !== was) entry.kind = now
  if (entry.kind === 'gap') delete entry.note
  else if (was === 'gap') entry.note = `由论文技能库补充供给（${fresh.length} 项）：${fresh.join('、')}`
  touched += 1
  addedTotal += fresh.length
}

/** 原 9 个缺口里，接线后仍为 gap 的 */
const stillGaps = Object.entries(skills)
  .filter(([n, e]) => EXPECTED_GAPS.includes(n) && e.kind === 'gap')
  .map(([n]) => n)

const report = {
  per_l3: PER_L3,
  per_l3_gap: PER_L3_GAP,
  l3_touched: touched,
  skills_added: addedTotal,
  gaps_closed: changes.filter((c) => c.jumped).map((c) => c.name),
  gaps_still_open: stillGaps,
  changes,
}

mkdirSync(GENERATED_DIR, { recursive: true })
writeFileSync(join(GENERATED_DIR, 'wire-report.json'), JSON.stringify(report, null, 2) + '\n')

console.log(`接线：${touched} 个 L3 获得新增供给，共追加 ${addedTotal} 条技能引用（每 L3 上限 ${PER_L3}，原缺口放宽到 ${PER_L3_GAP}）`)
console.log(`原 9 个缺口中，接线后关闭 ${report.gaps_closed.length} 个：${report.gaps_closed.join('、') || '—'}`)
if (stillGaps.length) console.log(`仍为「平台无供给」：${stillGaps.join('、')}`)
console.log('重点变化：')
for (const c of changes.filter((x) => x.jumped)) console.log(`  ${c.name}: ${c.was} → ${c.now}  +${c.addedCount}  ${c.added.join(', ')}`)

if (DRY) {
  console.log('\ndry-run：未写回 skill-map.json')
  process.exit(0)
}
mkdirSync(BACKUP_DIR, { recursive: true })
copyFileSync(SKILL_MAP, join(BACKUP_DIR, 'skill-map.json.pre-paper2skills'))
writeFileSync(SKILL_MAP, JSON.stringify(mapFile, null, 2) + '\n')
console.log(`\n已写回 ${SKILL_MAP}（原件备份到 staging/backup/skill-map.json.pre-paper2skills）`)
