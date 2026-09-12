#!/usr/bin/env node
/**
 * L7 · SkillOpt 用例构造
 *
 * 「高价值卡」的判据是机械的、事前定的，不是跑完挑好看的：
 *   ① 该卡补上了平台缺口（classification 的 `fills_gap_strong` 非空，即缺口名就是它的 L3）
 *   ② 该卡已被某个岗位 preset 的 skill-subset 露出（否则模型根本看不见，谈不上效果）
 * 全库满足这两条的共 54 张——它们是这次接线真正派上用场的卡。
 *
 * 出题同 L6：只读卡页逐字正文 ①②③，不接触任何合成字段。
 * 每卡出两题：`train` 用于优化、`holdout` 只用于验证门（不许被优化过程看见）。
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { EVAL_OUT, loadInstalledSkills, loadPresets, loadJson, rng } from './lib/load.mjs'

const N = Number(process.env.L7_SAMPLE || 20)
const SEED = Number(process.env.L7_SEED || 20260913)

mkdirSync(EVAL_OUT, { recursive: true })
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

// 按缺口分层轮转抽样
const buckets = new Map()
for (const c of pool) {
  const k = c.gap[0]
  if (!buckets.has(k)) buckets.set(k, [])
  buckets.get(k).push(c)
}
const rand = rng(SEED)
const picked = []
let go = true
while (picked.length < N && go) {
  go = false
  for (const k of [...buckets.keys()].sort()) {
    if (picked.length >= N) break
    const b = buckets.get(k)
    if (!b.length) continue
    picked.push(b.splice(Math.floor(rand() * b.length), 1)[0])
    go = true
  }
}

const AUTHOR_DIR = join(EVAL_OUT, 'l7-author-input')
rmSync(AUTHOR_DIR, { recursive: true, force: true })
mkdirSync(AUTHOR_DIR, { recursive: true })

const cases = picked.map((c, i) => {
  const s = skills.get(c.slug)
  writeFileSync(join(AUTHOR_DIR, `${c.slug}.md`),
    `# ${s.fm.title}\n\n## ① 解决的问题\n\n${s.sec.problem.slice(0, 1600)}\n\n## ③ 业务应用场景\n\n${s.sec.scenario.slice(0, 1600)}\n`)
  return {
    case_id: `L7-${String(i + 1).padStart(3, '0')}`,
    card: c.slug,
    preset: c.preset,
    gap: c.gap,
    l3: c.l3,
    // 轨迹证据用：该卡自己声明的执行步骤（frontmatter workflow，合成字段，正是被优化对象之一）
    steps_field: String(s.fm.workflow || '').slice(0, 400) || null,
    // 判据不看卡自己的契约——评审用与卡无关的固定三维度，避免「自己考自己」
    distinctive: [...new Set(String(s.fm.description || '').match(/[\u4e00-\u9fa5A-Za-z0-9]{4,}/g) || [])].slice(0, 12),
    skill_md: `~/.dsh/skills/${c.slug}/SKILL.md`,
    desc_len: String(s.fm.description || '').length,
  }
})

writeFileSync(join(EVAL_OUT, 'l7-cases.json'), JSON.stringify({
  meta: {
    seed: SEED, pool: pool.length, n: cases.length,
    rule: '高价值卡 = fills_gap_strong 非空 且 被某岗 preset 露出；出题只读逐字正文 ①②③',
    gap_spread: Object.fromEntries([...new Set(cases.map((c) => c.gap[0]))].map((g) => [g, cases.filter((c) => c.gap[0] === g).length])),
  },
  cases,
}, null, 2) + '\n')

console.log(`高价值卡池 ${pool.length} → 抽 ${cases.length}`)
console.log(`  缺口分布：${JSON.stringify(Object.fromEntries([...new Set(cases.map((c) => c.gap[0]))].map((g) => [g, cases.filter((c) => c.gap[0] === g).length])))}`)
console.log('→ eval/out/l7-cases.json + eval/out/l7-author-input/')
