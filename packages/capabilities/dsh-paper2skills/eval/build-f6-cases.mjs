#!/usr/bin/env node
/**
 * F6 · 契约层小样本实测（L7 重跑）的用例构造 —— **留出集**
 *
 * 为什么另起一批卡，而不是复用 `eval/out/l7-cases.json` 的 20 张：
 *   原 L7 实验的 20 张卡、40 道题，在撰写契约模板之前已被读过。
 *   用它当验证集，只能证明「模板拟合了这批题」，不能证明契约层本身有效。
 *   ⇒ 本脚本从**同一份高价值卡池**里取**从未被读过的**卡，另出题，作为留出集。
 *
 * ⚠️ 实测发现（已登记）：`eval/out/l7-cases.json` 记的 `meta.pool = 36`，
 *    而今天用同一份判据重算，池只剩 **16 张**（其中 7 张与原来重叠）。
 *    原因：`data/classification.json` 在 L7 跑批**之后**被改过（mtime 15:45 > 10:22），
 *    `fills_gap_strong` 与 preset 露出面（349 → 258）都变了。
 *    ⇒ **原实验的抽样框今天已不可复现**。故本脚本不承诺复现旧框，只承诺：
 *      ① 抽样判据与 `build-l7-cases.mjs` 逐字一致；② 入选卡在**跑批当天**的池里；
 *      ③ 入选卡不在原 L7 的 20 张里（留出性由此保证，而非由 seed 保证）。
 *
 * 用法：node eval/build-f6-cases.mjs
 *   → eval/out/l7c/author-input/*.md（出题输入，只含逐字正文 ①③）
 *   → eval/out/l7c/cases.json（机读用例表；题面由出题 agent 写入 tasks/）
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { EVAL_OUT, loadInstalledSkills, loadPresets, loadJson } from './lib/load.mjs'

// 入选卡：每个缺口取「从未被原 L7 读过」的那些（缺口 → 卡）
// 括号里是它们要挂的契约（契约按**责任**建，不按卡建）
const PICK = [
  ['容量管理', 'p2s-agent-production-engineering'],            // CTR-A-072
  ['容量管理', 'p2s-context-token-compression'],               // CTR-A-072
  ['数据管道', 'p2s-amazon-sp-api-data-pipeline'],             // CTR-B-058
  ['纠正预防措施', 'p2s-return-root-cause-attribution-graph'],   // CTR-B-023
  ['纠正预防措施', 'p2s-causal-voc-sentiment-attribution'],     // CTR-B-023
]

const OUT = join(EVAL_OUT, 'l7c')
const classification = loadJson('data/classification.json')
const skills = loadInstalledSkills()
const presets = loadPresets()
const exposed = new Set([...presets.values()].flatMap((p) => p.skills))
const presetOf = new Map()
for (const [p, info] of presets) for (const s of info.p2s) if (!presetOf.has(s)) presetOf.set(s, p)

const cl = new Map(classification.items.map((i) => [i.slug, i]))
const previouslySampled = new Set(loadJson('eval/out/l7-cases.json').cases.map((c) => c.card))

// ---- 自证：入选卡必须同时满足「在池里」「未被原 L7 读过」----
const problems = []
for (const [gap, slug] of PICK) {
  const it = cl.get(slug)
  if (!it) { problems.push(`${slug}: 不在 classification 里`); continue }
  if (!it.fills_gap_strong?.length) problems.push(`${slug}: fills_gap_strong 为空`)
  if (!exposed.has(slug)) problems.push(`${slug}: 未被任何 preset 露出`)
  const s = skills.get(slug)
  if (!s) { problems.push(`${slug}: 未安装`); continue }
  if (s.sec.problem.length < 60 || s.sec.scenario.length < 60) problems.push(`${slug}: 正文 ①③ 段不可用`)
  if (previouslySampled.has(slug)) problems.push(`${slug}: 已被原 L7 抽中，**不构成留出集**`)
  const gap0 = it.fills_gap_strong[0]
  if (gap0 !== gap) problems.push(`${slug}: 缺口名实测为 ${gap0}，脚本写的是 ${gap}`)
}
if (problems.length) {
  console.error('❌ 留出集入选判据不成立，先修入选卡而不是放宽判据：')
  for (const p of problems) console.error('   - ' + p)
  process.exit(2)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'author-input'), { recursive: true })
mkdirSync(join(OUT, 'tasks'), { recursive: true })
mkdirSync(join(OUT, 'rollout'), { recursive: true })

const cases = PICK.map(([gap, slug], i) => {
  const s = skills.get(slug)
  const caseId = `F6-${String(i + 1).padStart(3, '0')}`
  writeFileSync(join(OUT, 'author-input', `${slug}.md`),
    `# ${s.fm.title}\n\n## ① 解决的问题\n\n${s.sec.problem.slice(0, 1600)}\n\n## ③ 业务应用场景\n\n${s.sec.scenario.slice(0, 1600)}\n`)
  return {
    case_id: caseId,
    card: slug,
    card_path: join(process.env.HOME, '.dsh/skills', slug, 'SKILL.md'),
    gap,
    preset: presetOf.get(slug),
    task_train: join(OUT, 'tasks', `${caseId}-train.txt`),
    task_holdout: join(OUT, 'tasks', `${caseId}-holdout.txt`),
  }
})

writeFileSync(join(OUT, 'cases.json'), JSON.stringify({
  meta: {
    what: 'F6 契约层小样本实测的留出集（从未被读过的卡与题）',
    generator: 'eval/build-f6-cases.mjs',
    rule: '与 build-l7-cases.mjs 同判据的高价值卡；且不在 l7-cases.json 的 20 张里 ⇒ 留出',
    pool_today: [...cl.values()].filter((i) => i.fills_gap_strong?.length && exposed.has(i.slug)).length,
    prior_experiment_pool_claimed: 36,
    note: '原实验抽样框今天不可复现（classification.json 跑批后被改）—— 见脚本头注释',
  },
  cases,
}, null, 2) + '\n')

console.log(`留出集 ${cases.length} 张卡（每卡出 train / holdout 两题）`)
for (const c of cases) console.log(`  ${c.case_id}  ${c.gap.padEnd(8)} ${c.card}`)
console.log('→ eval/out/l7c/author-input/ + cases.json')
