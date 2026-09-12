#!/usr/bin/env node
/**
 * build-batches.mjs — 把分类结果切成 S2 适配批次。
 *
 * 入：data/classification.json + generated/cards.json
 * 出：generated/batches/S2-NN.json（每个是适配子任务的完整输入）
 *     generated/batches/_manifest.json
 *
 * 切批原则（不是按源域，而是按**目标责任域 + L3 邻域**切）：
 *  - 同一批的卡尽量落在同一个 L2 责任域、相邻 L3，便于一次写出风格一致的技能；
 *  - 空 L3 的卡单列一批（适配规则不同：照常安装但不进 subset）；
 *  - 每批 ≤ P2S_BATCH（默认 48）张。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, GENERATED_DIR } from '../lib/taxonomy.js'

const MAX = Number(process.env.P2S_BATCH || 48)
const cls = JSON.parse(readFileSync(join(DATA_DIR, 'classification.json'), 'utf8'))
const cards = /** @type {any[]} */ (JSON.parse(readFileSync(join(GENERATED_DIR, 'cards.json'), 'utf8')).cards)
/** @type {Map<string, any>} */
const cardById = new Map(cards.map((c) => [c.id, c]))

const OUT = join(GENERATED_DIR, 'batches')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

/** 按 (L2 责任域, 首位 L3) 排序后顺序切批：
 *  —— 批内保持 L3 相邻（同一细分业务的卡在一起，风格一致）；
 *  —— 只在 MAX 张数处切批，不在 L3 边界处切碎（批次数 ≈ 卡数 / MAX）。 */
const sorted = [...cls.items].sort((a, b) => {
  const ka = a.facets ? `${a.facets.l2_domain}\u0000${a.facets.l3_business}` : '\uffff'
  const kb = b.facets ? `${b.facets.l2_domain}\u0000${b.facets.l3_business}` : '\uffff'
  if (ka !== kb) return ka < kb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
})

const manifest = []
let n = 0
for (let i = 0; i < sorted.length; i += MAX) {
  const chunk = sorted.slice(i, i + MAX)
  n += 1
  const id = `S2-${String(n).padStart(2, '0')}`
  const l2s = [...new Set(chunk.map((c) => c.facets?.l2_domain || '（矩阵空白）'))]
  const l3s = [...new Set(chunk.map((c) => c.facets?.l3_business || '（无 L3）'))]
  const payload = {
    batch: id,
    l2_domains: l2s,
    l3_in_batch: l3s,
    count: chunk.length,
    spec: 'packages/capabilities/dsh-paper2skills/docs/synthesis-spec.md',
    cards: chunk.map((it) => {
      const c = cardById.get(it.id)
      return {
        id: it.id,
        slug: it.slug,
        title: it.title,
        src_domain: it.src_domain,
        l3: it.l3,
        facets: it.facets,
        confidence: it.confidence,
        fills_gap_strong: it.fills_gap_strong,
        fills_gap_adjacent: it.fills_gap_adjacent,
        sections: c?.sections || {},
        relations: c?.relations || {},
        tags: (c?.tags || []).slice(0, 20),
      }
    }),
  }
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(payload, null, 1) + '\n')
  manifest.push({ batch: id, l2_domains: l2s, l3_count: l3s.length, count: chunk.length, file: `generated/batches/${id}.json` })
}

writeFileSync(
  join(OUT, '_manifest.json'),
  JSON.stringify({ total_cards: cls.items.length, batches: manifest.length, batch_max: MAX, manifest }, null, 1) + '\n',
)

console.log(`批次数：${manifest.length}   卡总数：${cls.items.length}   每批上限：${MAX}`)
console.log('按责任域的卡数分布：')
/** @type {Map<string,number>} */
const byL2 = new Map()
for (const c of sorted) {
  const k = c.facets?.l2_domain || '（矩阵空白）'
  byL2.set(k, (byL2.get(k) || 0) + 1)
}
for (const [k, v] of [...byL2].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v} 张`)
console.log('每批：' + manifest.map((m) => `${m.batch}(${m.count})`).join(' '))
console.log('输出：generated/batches/')
