#!/usr/bin/env node
/**
 * L6-B · 抽样构造真实路由用例
 *
 * 设计要点（每一条都是为了让结论站得住）：
 *  1. **只从「模型真能看见的卡」里抽**——1338 张全部 model-off，只有被某个 preset 的
 *     skill-subset 露出的那些才可能被路由到。在看不见的卡上测路由是假问题。
 *  2. **任务文本由「卡的逐字正文」生成，不由合成字段生成**。description / whenToUse
 *     是 S2 子任务写的，若用它们出题就是自己考自己。出题 agent 只看卡页 ①②③ 段
 *     （逐字保真、与合成字段非同源）。
 *  3. **两级难度**：`keyword`（用户就会照技能名说）与 `situational`（只给业务处境、
 *     不许出现论文/技术词）。两者差多少，就是 description 的触发词到底在起多大作用。
 *  4. **负向臂取同 L2 责任域的另一岗**，且该岗 preset 与本卡**不共享任何 L3**——
 *     这样「none」才是可辩护的正确答案；跨域负向太容易，测不出东西。
 *  5. **近重复分层**：preset 内是否有与本卡共享 L3 的兄弟，是已知风险点，单独记账。
 *
 * 输出：eval/out/l6-cases.json
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  EVAL_OUT, loadInstalledSkills, loadPresets, loadJson, roleToPreset, rng,
} from './lib/load.mjs'

const N = Number(process.env.L6_SAMPLE || 40)
const SEED = Number(process.env.L6_SEED || 20260912)

mkdirSync(EVAL_OUT, { recursive: true })
const classification = loadJson('data/classification.json')
const coverage = loadJson('generated/coverage.json')
const skills = loadInstalledSkills()
const presets = loadPresets()
const cls = new Map(classification.items.map((it) => [it.slug, it]))

const ownerOfL3 = new Map(coverage.coverage.map((c) => [c.name, roleToPreset(c.role)]))
const l3OfPreset = new Map()
for (const [name, p] of ownerOfL3) {
  if (!p) continue
  if (!l3OfPreset.has(p)) l3OfPreset.set(p, new Set())
  l3OfPreset.get(p).add(name)
}
const domainOfPreset = new Map()
for (const c of coverage.coverage) {
  const p = roleToPreset(c.role)
  if (p && !domainOfPreset.has(p)) domainOfPreset.set(p, c.domain)
}

// ── 抽样框：被某 preset 露出、正文可用、有 L3 的卡 ────────────────────────────
const frame = []
for (const [p, info] of presets) {
  for (const slug of info.p2s) {
    const it = cls.get(slug)
    const s = skills.get(slug)
    if (!it || !s || !it.l3.length) continue
    const ownerP = ownerOfL3.get(it.l3[0])
    if (ownerP !== p) continue // 只把「本岗拥有的 L3」上的卡当作正样本锚点
    const problem = s.sec.problem, scenario = s.sec.scenario
    if (problem.length < 60 || scenario.length < 60) continue
    frame.push({ preset: p, slug, l3: it.l3, domain: domainOfPreset.get(p) || it.facets.l2_domain })
  }
}

// ── 近重复分层 ──────────────────────────────────────────────────────────────
const siblingOf = new Map()
for (const [p, info] of presets) {
  for (let i = 0; i < info.p2s.length; i++) {
    for (let j = i + 1; j < info.p2s.length; j++) {
      const A = cls.get(info.p2s[i]), B = cls.get(info.p2s[j])
      if (!A || !B || !A.l3.some((n) => B.l3.includes(n))) continue
      siblingOf.set(`${p}|${A.slug}`, (siblingOf.get(`${p}|${A.slug}`) || []).concat(B.slug))
      siblingOf.set(`${p}|${B.slug}`, (siblingOf.get(`${p}|${B.slug}`) || []).concat(A.slug))
    }
  }
}

// ── 分层抽样：先按「近重复 vs 非近重复 × 8 责任域」分桶，再桶内确定性打散 ────────
const buckets = new Map()
for (const f of frame) {
  const key = `${siblingOf.has(`${f.preset}|${f.slug}`) ? 'dup' : 'solo'}|${f.domain}`
  if (!buckets.has(key)) buckets.set(key, [])
  buckets.get(key).push(f)
}
const rand = rng(SEED)
const picked = []
const keys = [...buckets.keys()].sort()
// 轮转填充，保证 dup/solo 与各责任域都进样本
let progress = true
while (picked.length < N && progress) {
  progress = false
  for (const k of keys) {
    if (picked.length >= N) break
    const b = buckets.get(k)
    if (!b.length) continue
    const idx = Math.floor(rand() * b.length)
    picked.push(b.splice(idx, 1)[0])
    progress = true
  }
}

// ── 为每张卡找负向 preset：同 L2 责任域、不含本卡、且与本卡零 L3 交集 ──────────
function negativePresetFor(card) {
  const myL3 = new Set(card.l3)
  const cands = []
  for (const [p, info] of presets) {
    if (p === card.preset) continue
    if (info.p2s.length < 4) continue
    if (info.p2s.includes(card.slug)) continue
    if ((domainOfPreset.get(p) || '') !== card.domain) continue
    const theirL3 = l3OfPreset.get(p) || new Set()
    if ([...myL3].some((n) => theirL3.has(n))) continue
    // 也不能有别的卡挂着本卡的 L3
    const overlap = info.p2s.some((s) => (cls.get(s)?.l3 || []).some((n) => myL3.has(n)))
    if (overlap) continue
    cands.push(p)
  }
  if (!cands.length) return null
  return cands[Math.floor(rand() * cands.length)]
}

const cases = picked.map((f, i) => {
  const s = skills.get(f.slug)
  const neg = negativePresetFor(f)
  return {
    case_id: `L6-${String(i + 1).padStart(3, '0')}`,
    card: f.slug,
    preset: f.preset,
    domain: f.domain,
    l3: f.l3,
    dup_in_preset: siblingOf.get(`${f.preset}|${f.slug}`) || [],
    candidates: presets.get(f.preset).skills,
    neg_preset: neg,
    neg_candidates: neg ? presets.get(neg).skills : null,
    // 只给出题 agent 看：逐字正文（不含任何合成字段）
    title: s.fm.title,
    src_problem: s.sec.problem.slice(0, 1600),
    src_scenario: s.sec.scenario.slice(0, 1600),
  }
})

// ── 出题输入落盘：只含标题 + 逐字正文 ①②③，物理上不含任何合成字段 ──────────────
const AUTHOR_DIR = join(EVAL_OUT, 'author-input')
rmSync(AUTHOR_DIR, { recursive: true, force: true })
mkdirSync(AUTHOR_DIR, { recursive: true })
for (const c of cases) {
  writeFileSync(join(AUTHOR_DIR, `${c.card}.md`),
    `# ${c.title}\n\n## ① 解决的问题\n\n${c.src_problem}\n\n## ③ 业务应用场景\n\n${c.src_scenario}\n`)
}

// ── 候选目录落盘：模型实际看见的就是这三样（name / title / description），一卡一行 ──
function catalogOf(list) {
  return list.map((n) => {
    const s = skills.get(n)
    if (s) return `- ${n}\n    title: ${s.fm.title || '(无)'}\n    description: ${String(s.fm.description || '(无)').replace(/\s+/g, ' ')}`
    return `- ${n}\n    title: (非 p2s 技能，来自既有技能库)\n    description: (既有技能，未参与本次分类)`
  }).join('\n')
}
const CAND_DIR = join(EVAL_OUT, 'cand')
rmSync(CAND_DIR, { recursive: true, force: true })
mkdirSync(CAND_DIR, { recursive: true })
for (const c of cases) {
  writeFileSync(join(CAND_DIR, `${c.case_id}-positive.txt`), catalogOf(c.candidates) + '\n')
  if (c.neg_preset) writeFileSync(join(CAND_DIR, `${c.case_id}-negative.txt`), catalogOf(c.neg_candidates) + '\n')
}

const noNeg = cases.filter((c) => !c.neg_preset).length
writeFileSync(join(EVAL_OUT, 'l6-cases.json'), JSON.stringify({
  meta: {
    seed: SEED, n: cases.length, frame: frame.length,
    with_negative_arm: cases.length - noNeg, without_negative_arm: noNeg,
    strat: { dup: cases.filter((c) => c.dup_in_preset.length).length, solo: cases.filter((c) => !c.dup_in_preset.length).length },
    note: '任务文本由逐字正文 ①②③ 段生成，不由合成字段生成；候选集 = 该岗 preset 的 skill-subset 全量（含非 p2s 技能）。',
  },
  cases,
}, null, 2) + '\n')

console.log(`抽样框 ${frame.length} 张（模型可见且归属本岗）→ 抽 ${cases.length} 张`)
console.log(`  近重复分层：有兄弟 ${cases.filter((c) => c.dup_in_preset.length).length} · 独苗 ${cases.filter((c) => !c.dup_in_preset.length).length}`)
console.log(`  负向臂可用：${cases.length - noNeg} / ${cases.length}`)
console.log(`  责任域分布：${JSON.stringify(Object.fromEntries([...new Set(cases.map((c) => c.domain))].map((d) => [d, cases.filter((c) => c.domain === d).length])))}`)
console.log('→ eval/out/l6-cases.json')
