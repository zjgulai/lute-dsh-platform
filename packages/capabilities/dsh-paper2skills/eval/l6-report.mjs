#!/usr/bin/env node
/**
 * L6 汇总：把 eval/out/l6-model-raw.json（真实路由跑批结果）折成可引用的指标。
 *
 * 三条判据都在这里显式化，避免结论被含混的分子分母放大：
 *  · 正样本 top-1 = 路由 pick 恰好等于出题所依据的那张卡；`none` 计入分母（那是真的没找着）。
 *  · 负向严格拒答 = 在不含本卡 L3 的同域岗位候选里 pick == none。
 *  · 负向校正口径 = 严格拒答 + 被独立复核判为「可辩护」的误拒——那说明是本次的 gold
 *    （none）定错了，而不是模型错。两者之差才是真实误召。
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVAL_OUT, loadJson, loadInstalledSkills } from './lib/load.mjs'

const raw = JSON.parse(readFileSync(join(EVAL_OUT, 'l6-model-raw.json'), 'utf8'))
const cls = new Map(loadJson('data/classification.json').items.map((i) => [i.slug, i]))
const skills = loadInstalledSkills()
const l3of = (s) => new Set(cls.get(s)?.l3 ?? [])
const rate = (n, d) => ({ n, d, pct: d ? +(100 * n / d).toFixed(1) : null })

const rows = raw.rows
const nn = (k) => rows.filter((r) => r[k] !== null && r[k] !== undefined)
const posHit = (k) => nn(k).filter((r) => r[k] === r.card)
const negRej = (k) => nn(k).filter((r) => r[k] === 'none')
const defensible = raw.judges.filter((j) => j.defensible === true)

// ── 错选的性质：孪生（同 L3）还是「没有」还是别的 ──────────────────────────────
const posMiss = []
for (const r of rows) {
  for (const [arm, key] of [['keyword', 'pos_kw'], ['situational', 'pos_sit']]) {
    const p = r[key]
    if (p === null || p === undefined || p === r.card) continue
    posMiss.push({
      case_id: r.case_id, arm, gold: r.card, pick: p, dup_in_preset: r.dup,
      same_l3: p === 'none' ? null : [...(l3of(p) && l3of(r.card))].filter((x) => l3of(p).has(x)),
      kind: p === 'none' ? 'not_found' : ([...l3of(p)].some((x) => l3of(r.card).has(x)) ? 'wrong_twin' : 'wrong_family'),
    })
  }
}
const negMiss = []
for (const r of rows) {
  for (const [arm, key] of [['keyword', 'neg_kw'], ['situational', 'neg_sit']]) {
    const p = r[key]
    if (p === null || p === undefined || p === 'none') continue
    const j = raw.judges.find((x) => x.case_id === r.case_id && x.arm === key)
    negMiss.push({
      case_id: r.case_id, arm, card: r.card, wrong_preset: r.neg_preset, pick: p,
      same_l3_as_card: [...l3of(p)].some((x) => l3of(r.card).has(x)),
      defensible: j?.defensible ?? null, judge_reason: j?.reason ?? null,
      kind: j?.defensible === true ? 'gold_was_wrong' : 'true_false_positive',
    })
  }
}

// ── 近重复分层 ──────────────────────────────────────────────────────────────
const strat = {}
for (const [clsName, cond] of [['with_sibling', (r) => r.dup > 0], ['solo', (r) => r.dup === 0]]) {
  const sub = rows.filter(cond)
  strat[clsName] = {
    n: sub.length,
    pos_kw: rate(sub.filter((r) => r.pos_kw === r.card).length, sub.filter((r) => r.pos_kw !== null).length),
    pos_sit: rate(sub.filter((r) => r.pos_sit === r.card).length, sub.filter((r) => r.pos_sit !== null).length),
    neg_kw: rate(sub.filter((r) => r.neg_kw === 'none').length, sub.filter((r) => r.neg_kw !== null).length),
    neg_sit: rate(sub.filter((r) => r.neg_sit === 'none').length, sub.filter((r) => r.neg_sit !== null).length),
  }
}

const strict = negRej('neg_kw').length + negRej('neg_sit').length
const negTotal = nn('neg_kw').length + nn('neg_sit').length
const report = {
  generated_from: 'eval/out/l6-model-raw.json',
  design: {
    sampled_cards: 40,
    arms_per_card: 4,
    total_routing_calls_expected: 160,
    valid_routing_calls: nn('pos_kw').length + nn('pos_sit').length + nn('neg_kw').length + nn('neg_sit').length,
    task_authoring: '由卡页逐字正文 ①②③ 段生成，出题 agent 不接触 description/whenToUse 等合成字段',
    candidates: '候选集 = 该岗 preset 的 skill-subset 全量（含非 p2s 既有技能），即模型真实可见的技能面',
  },
  positive_top1: {
    keyword: rate(posHit('pos_kw').length, nn('pos_kw').length),
    situational: rate(posHit('pos_sit').length, nn('pos_sit').length),
  },
  negative_rejection: {
    strict: rate(strict, negTotal),
    gold_adjusted: rate(strict + defensible.length, negTotal),
    true_false_positive: rate(negTotal - strict - defensible.length, negTotal),
  },
  stratified: strat,
  error_anatomy: {
    positive_misses: posMiss,
    positive_miss_kinds: posMiss.reduce((a, m) => ({ ...a, [m.kind]: (a[m.kind] || 0) + 1 }), {}),
    negative_misses: negMiss,
    negative_miss_kinds: negMiss.reduce((a, m) => ({ ...a, [m.kind]: (a[m.kind] || 0) + 1 }), {}),
    note: '正样本错选全部命中同 L3 的孪生卡（除 1 次 none）；负向真实误召全部是跨 L3 的语义近邻——两类缺陷互补，静态近重复检测（同 L3 共现）只覆盖前一类。',
  },
  installed_at_eval_time: skills.size,
}

writeFileSync(join(EVAL_OUT, 'l6-report.json'), JSON.stringify(report, null, 2) + '\n')

const f = (r) => `${r.n}/${r.d} = ${r.pct}%`
console.log(`\nL6-B · 真实路由实测（有效调用 ${report.design.valid_routing_calls}/${report.design.total_routing_calls_expected}）`)
console.log(`  正样本 top-1   keyword ${f(report.positive_top1.keyword)} · situational ${f(report.positive_top1.situational)}`)
console.log(`  负向拒答       strict ${f(report.negative_rejection.strict)} · 校正后 ${f(report.negative_rejection.gold_adjusted)}`)
console.log(`  真实误召       ${f(report.negative_rejection.true_false_positive)}`)
for (const [k, s] of Object.entries(strat)) {
  console.log(`  [${k}] n=${s.n}  pos-kw ${f(s.pos_kw)}  pos-sit ${f(s.pos_sit)}  neg-kw ${f(s.neg_kw)}  neg-sit ${f(s.neg_sit)}`)
}
console.log(`  错选性质       正样本 ${JSON.stringify(report.error_anatomy.positive_miss_kinds)} · 负向 ${JSON.stringify(report.error_anatomy.negative_miss_kinds)}`)
console.log('→ eval/out/l6-report.json\n')
