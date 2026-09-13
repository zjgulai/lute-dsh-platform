#!/usr/bin/env node
/**
 * L7 高价值卡池清单（含「是否已被 L7 抽样命中」标记）
 *
 * 用途：F6 契约层小样本实测需要一批**未被读过的**卡与题面做留出集。
 * 原 L7 实验用 seed 20260913 抽了 20 张（40 题）；本脚本把整个池列出来并标注
 * 哪 20 张已被抽中 —— 剩下的就是天然留出集。
 *
 * ⚠️ 入选规则必须与 build-l7-cases.mjs 逐字一致（同一份池、同一份判据），
 * 否则「留出集」会变成另一批卡，两次实验不可比。判据只有一处：
 *   ① classification 的 fills_gap_strong 非空  ② 被某岗 preset 露出
 *   ③ 正文 ①② 段可用（≥60 字符）
 *
 * 用法：node eval/list-l7-pool.mjs   → eval/out/l7-pool.json + stdout 表格
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVAL_OUT, loadInstalledSkills, loadPresets, loadJson } from './lib/load.mjs'

const classification = loadJson('data/classification.json')
const skills = loadInstalledSkills()
const presets = loadPresets()
const exposed = new Set([...presets.values()].flatMap((p) => p.skills))
const presetOf = new Map()
for (const [p, info] of presets) for (const s of info.p2s) if (!presetOf.has(s)) presetOf.set(s, p)

const cl = new Map(classification.items.map((i) => [i.slug, i]))
const pool = []
for (const [slug, it] of cl) {
  if (!it.fills_gap_strong?.length) continue
  if (!exposed.has(slug)) continue
  const s = skills.get(slug)
  if (!s) continue
  if (s.sec.problem.length < 60 || s.sec.scenario.length < 60) continue
  pool.push({ slug, gap: it.fills_gap_strong, preset: presetOf.get(slug), l3: it.l3 })
}

const sampled = new Set(loadJson('eval/out/l7-cases.json').cases.map((c) => c.card))
const rows = pool
  .map((c) => ({ ...c, sampled: sampled.has(c.slug) }))
  .sort((a, b) => (a.gap[0] < b.gap[0] ? -1 : a.gap[0] > b.gap[0] ? 1 : a.slug < b.slug ? -1 : 1))

console.log(`高价值卡池 ${pool.length} 张 · 原 L7 已抽 ${pool.filter((c) => sampled.has(c.slug)).length} · 未读留出 ${rows.filter((r) => !r.sampled).length}`)
console.log('缺口'.padEnd(16) + '用/留'.padEnd(8) + 'card')
for (const r of rows) console.log(String(r.gap[0]).padEnd(16) + (r.sampled ? '已抽' : '**留出**').padEnd(8) + r.slug)

writeFileSync(join(EVAL_OUT, 'l7-pool.json'), JSON.stringify({
  meta: {
    rule: '高价值卡 = fills_gap_strong 非空 且 被某岗 preset 露出 且 正文①②段可用（≥60 字符）',
    pool: pool.length,
    sampled: rows.filter((r) => r.sampled).length,
    holdout_available: rows.filter((r) => !r.sampled).length,
  },
  cards: rows,
}, null, 2) + '\n')
console.log('→ eval/out/l7-pool.json')
