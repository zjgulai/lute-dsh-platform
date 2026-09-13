#!/usr/bin/env node
/**
 * F7（F6-v2）· 契约层实测的用例构造 —— **第二批留出集**
 *
 * 为什么另起一批卡，而不是复用 `eval/out/l7c/cases.json` 的 5 张：
 *   那 5 张卡的失败形态已经被读过，模板 v2 的修法正是照着它写的。
 *   再用它当验证集，只能证明「v2 拟合了那 5 张」，不能证明修法有效。
 *   ⇒ 本脚本取**同一份高价值卡池里既没被原 L7 抽中、也没被 F6 用过的**卡。
 *
 * ⚠️ 抽样框快照（本轮新增的纪律）：F6 实测撞出「原 L7 的框今天不可复现」（36 → 16）。
 *   本次把四个输入一起钉进 `frame.snapshot.json`（逐个 sha256），
 *   跑批前后各算一次；**不一致即 exit 2**（`--verify-frame`）。
 *   ⚠️ 另有一处口径订正：F6 报告里「池 22 → 16」的说法**不成立** ——
 *      22 是 `build-f6-cases.mjs` 的宽口径（不查正文①②段可用性），16 是 `list-l7-pool.mjs` 的严口径。
 *      两者同一天同数据，是**判据不同**，不是框漂移。真正的漂移是 36 → 16（跨天）。
 *
 * 用法：
 *   node eval/build-l7d-cases.mjs                 # 出 author-input + cases.json + frame.snapshot.json
 *   node eval/build-l7d-cases.mjs --verify-frame  # 只校验框架未变（跑批后再跑一次）
 */
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EVAL_OUT, loadInstalledSkills, loadPresets, loadJson } from './lib/load.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = resolve(HERE, '..')
const OUT = join(EVAL_OUT, 'l7d')
const CONTRACTS = '/Users/lute/project/paper_to_skills/paper2skills-vault/07-资源库/contracts'

// 入选卡：两批实验都没读过、且仍在严口径池里的（缺口 → 卡 → 它挂的契约）
// 契约按**责任**建，不按卡建：安全事件处理的 2 张卡共用 CTR-B-066。
const PICK = [
  ['安全事件处理', 'p2s-agenttrust-runtime-safety-interception', 'B/CTR-B-066-安全事件处理.md'],
  ['安全事件处理', 'p2s-cross-border-payment-fraud-detection', 'B/CTR-B-066-安全事件处理.md'],
  ['纠正预防措施', 'p2s-cs-supply-chain-feedback-loop-tag', 'B/CTR-B-023-纠正预防措施.md'],
  ['证据复核', 'p2s-decision-audit-trail-ontology', 'B/CTR-B-006-证据复核.md'],
]

// ---- 事前写死的验收判据（跑批前定稿；跑完只许读，不许改）----
const CRITERIA = [
  { id: 'D1', kind: 'deterministic', arm: 'v2', text: 'quant 中位数 ≥ 0.8 × treat 臂 quant 中位数（v2 不得再以省略代对冲）' },
  { id: 'D2', kind: 'deterministic', arm: 'v2', text: 'abstain 中位数 ≤ 1（F6 的 v1 臂为 2）' },
  { id: 'D3', kind: 'deterministic', arm: 'v2', text: 'disposed_gap_ratio 均值 ≥ 0.6（写了缺口就必须写「先用什么」）；⚠️ 若 v2 臂**一条缺口句都不写**（缺口句中位数 = 0），本条记为**不适用**并如实登记 —— 判据的目的是「写了缺口要带处置」，没有缺口就没有违反。此豁免在**跑批前**写下（当时尚无任何 v2 产出），不是跑完再补的口径。' },
  { id: 'D4', kind: 'reproduction', arm: 'v1', text: 'quant 中位数 ≤ 0.5 × treat 臂 quant 中位数 —— 本批卡上必须复现 v1 的坏形态，否则对比无意义' },
  { id: 'Q1', kind: 'judge', contrast: 'v2-vs-control', text: 'Δ 的 95% 置信区间下界 ≥ −0.7（「不劣于判官噪声」，不是「均值过 0」）' },
  { id: 'Q2', kind: 'judge', contrast: 'v2-vs-v1', text: 'Δ > 0（配对确认：修法相对 v1 是净改善）', supportive: true },
]

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16)

// ---- 框架快照 ----
function frame() {
  const skills = loadInstalledSkills()
  const presets = loadPresets()
  const exposed = new Set([...presets.values()].flatMap((p) => p.skills))
  const presetOf = new Map()
  for (const [p, info] of presets) for (const s of info.p2s) if (!presetOf.has(s)) presetOf.set(s, p)
  const presetFiles = [...presets.entries()]
    .map(([id, info]) => `${id}:${(info.skills || []).length}`)
    .sort()
    .join('|')
  return {
    skills,
    exposed,
    presetOf,
    snapshot: {
      classification_json: sha(join(PKG, 'data/classification.json')),
      taxonomy_json: sha(join(PKG, 'data/taxonomy.json')),
      capability_graph_json: sha('/Users/lute/project/paper_to_skills/paper2skills-vault/07-资源库/capability-graph.json'),
      exposed_surface: exposed.size,
      preset_digest: createHash('sha256').update(presetFiles).digest('hex').slice(0, 16),
      installed_skills: skills.size,
      card_digests: Object.fromEntries(PICK.map(([, slug]) => [slug, sha(join(process.env.HOME, '.dsh/skills', slug, 'SKILL.md'))])),
    },
  }
}

const f = frame()
const SNAP_PATH = join(OUT, 'frame.snapshot.json')

if (process.argv.includes('--verify-frame')) {
  if (!existsSync(SNAP_PATH)) {
    console.error(`❌ 没有快照可比：${SNAP_PATH} 不存在 —— 先跑一次不带参数的版本`)
    process.exit(2)
  }
  const before = JSON.parse(readFileSync(SNAP_PATH, 'utf8')).snapshot
  const now = f.snapshot
  const diffs = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(now[k]))
  if (diffs.length) {
    console.error('❌ 抽样框在跑批期间变了 —— 结论不可归因，必须重跑：')
    for (const k of diffs) console.error(`   - ${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(now[k])}`)
    process.exit(2)
  }
  console.log('✅ 抽样框未变（6 项逐个一致）')
  process.exit(0)
}

const cl = new Map(loadJson('data/classification.json').items.map((i) => [i.slug, i]))
const prevL7 = new Set(loadJson('eval/out/l7-cases.json').cases.map((c) => c.card))
const prevF6 = new Set(loadJson('eval/out/l7c/cases.json').cases.map((c) => c.card))

// ---- 自证：入选卡必须同时满足四条 ----
const problems = []
for (const [gap, slug, rel] of PICK) {
  const it = cl.get(slug)
  if (!it) { problems.push(`${slug}: 不在 classification 里`); continue }
  if (!it.fills_gap_strong?.length) problems.push(`${slug}: fills_gap_strong 为空`)
  if (!f.exposed.has(slug)) problems.push(`${slug}: 未被任何 preset 露出`)
  const s = f.skills.get(slug)
  if (!s) { problems.push(`${slug}: 未安装`); continue }
  if (s.sec.problem.length < 60 || s.sec.scenario.length < 60) problems.push(`${slug}: 正文 ①③ 段不可用（严口径池的判据之一）`)
  if (prevL7.has(slug)) problems.push(`${slug}: 已被原 L7 抽中，**不构成留出集**`)
  if (prevF6.has(slug)) problems.push(`${slug}: 已被 F6 用过，**不构成留出集**`)
  if (it.fills_gap_strong[0] !== gap) problems.push(`${slug}: 缺口名实测为 ${it.fills_gap_strong[0]}，脚本写的是 ${gap}`)
  const v1 = join(CONTRACTS, rel)
  const v2 = join(CONTRACTS, 'v2', rel)
  if (!existsSync(v1)) problems.push(`${slug}: v1 契约不存在（${v1}）`)
  if (!existsSync(v2)) problems.push(`${slug}: v2 契约不存在（${v2}）`)
}
if (problems.length) {
  console.error('❌ 留出集入选判据不成立，先修入选卡/契约而不是放宽判据：')
  for (const p of problems) console.error('   - ' + p)
  process.exit(2)
}

rmSync(join(OUT, 'author-input'), { recursive: true, force: true })
mkdirSync(join(OUT, 'author-input'), { recursive: true })
mkdirSync(join(OUT, 'tasks'), { recursive: true })
mkdirSync(join(OUT, 'rollout'), { recursive: true })
mkdirSync(join(OUT, 'judge'), { recursive: true })

const cases = PICK.map(([gap, slug, rel], i) => {
  const s = f.skills.get(slug)
  const caseId = `F7-${String(i + 1).padStart(3, '0')}`
  writeFileSync(join(OUT, 'author-input', `${slug}.md`),
    `# ${s.fm.title}\n\n## ① 解决的问题\n\n${s.sec.problem.slice(0, 1600)}\n\n## ③ 业务应用场景\n\n${s.sec.scenario.slice(0, 1600)}\n`)
  return {
    case_id: caseId,
    card: slug,
    card_path: join(process.env.HOME, '.dsh/skills', slug, 'SKILL.md'),
    gap,
    preset: f.presetOf.get(slug) ?? null,
    contract_v1_path: join(CONTRACTS, rel),
    contract_v2_path: join(CONTRACTS, 'v2', rel),
    task_train: join(OUT, 'tasks', `${caseId}-train.txt`),
    task_holdout: join(OUT, 'tasks', `${caseId}-holdout.txt`),
  }
})

writeFileSync(SNAP_PATH, JSON.stringify({
  meta: {
    what: 'F7 实测的抽样框快照 —— 输入一变，结论即不可归因',
    pinned_before_run: true,
    note: 'classification 36→16 是跨天真实漂移；F6 报告里的「22→16」是宽/严两口径之差，已订正',
  },
  snapshot: f.snapshot,
}, null, 2) + '\n')

writeFileSync(join(OUT, 'cases.json'), JSON.stringify({
  meta: {
    what: 'F7（F6-v2）契约层实测的第二批留出集',
    generator: 'eval/build-l7d-cases.mjs',
    rule: '严口径高价值卡（fills_gap_strong 非空 + 被 preset 露出 + 正文①③≥60 字符）；既不在原 L7 的 20 张里，也不在 F6 的 5 张里',
    arms: ['control', 'treat', 'v1', 'v2'],
    arms_meaning: {
      control: '只有任务',
      treat: '任务 + 卡全文',
      v1: '任务 + 卡全文 + 契约模板 v1 版（与 F6 同形）',
      v2: '任务 + 卡全文 + 契约模板 v2 版（加与禁令对称的正面义务）',
    },
    frame_snapshot: 'eval/out/l7d/frame.snapshot.json',
    criteria_preregistered: CRITERIA,
    acceptance: 'D1 ∧ D2 ∧ D3 ∧ D4 ∧ Q1（Q2 为支持性证据）',
  },
  cases,
}, null, 2) + '\n')

console.log(`留出集 ${cases.length} 张卡（每卡出 train / holdout 两题 ⇒ 8 题 × 4 臂 = 32 份）`)
for (const c of cases) console.log(`  ${c.case_id}  ${c.gap.padEnd(8)} ${c.card}`)
console.log('事前判据：' + CRITERIA.map((c) => c.id).join(' / '))
console.log('→ eval/out/l7d/author-input/ + cases.json + frame.snapshot.json')
