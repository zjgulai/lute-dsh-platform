#!/usr/bin/env node
/**
 * F6 契约层实测 · 判分汇总与验收判定（确定性，不调模型）
 *
 * 验收判据（**事前定死**，不许跑完再挑口径）：
 *   · 主判据 = holdout 上 Δ(契约臂 − 对照臂) ≥ 0
 *   · 辅判据 = 同一批里「单给卡」的臂仍应劣于对照臂（否则这一批根本没复现出那个负结果，
 *              主判据通过也不能算数 —— 那只能说明这批卡不伤人）
 *   · 形态判据 = 契约臂的对冲措辞率不得高于对照臂（SkillOpt 补丁就是靠对冲取胜然后被判死的）
 *
 * 判分口径：三维固定量表（交付物完整度 / 具体性 / 数据与口径明确），各 0–5，总分 0–15；
 * 盲配对（X/Y 由 case 奇偶决定），判分 agent 看不到臂名。
 *
 * 用法：node eval/l7c-verdict.mjs → eval/out/l7c/verdict.json + stdout 表
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { EVAL_OUT } from './lib/load.mjs'

const L7C = join(EVAL_OUT, 'l7c')
const { pairs } = JSON.parse(readFileSync(join(L7C, 'judge', 'pairs.json'), 'utf8'))
const diagPath = join(L7C, 'diagnostics.json')
const diag = existsSync(diagPath) ? JSON.parse(readFileSync(diagPath, 'utf8')) : null

const DIMS = ['completeness', 'specificity', 'data_clarity']
// 对比定义（a 臂 − b 臂），与 eval/prepare-l7c-judging.mjs 的 CONTRASTS 逐字一致
const CONTRASTS = [
  { id: 'K-vs-C', a: 'contract', b: 'control' },
  { id: 'K-vs-T', a: 'contract', b: 'treat' },
  { id: 'T-vs-C', a: 'treat', b: 'control' },
]
const rows = []
const missing = []
for (const p of pairs) {
  const f = join(L7C, 'judge', p.pair_id, 'scores.json')
  if (!existsSync(f)) { missing.push(p.pair_id); continue }
  const s = JSON.parse(readFileSync(f, 'utf8'))
  const sum = (o) => DIMS.reduce((a, d) => a + (Number(o?.[d]) || 0), 0)
  const xTotal = sum(s.x), yTotal = sum(s.y)
  const ct = CONTRASTS.find((c) => c.id === p.contrast)
  // ⚠️ 必须按**臂名**取分，不能按 X/Y 槽位取分：
  //    X/Y 的位置由 case 奇偶决定，按槽位算会让半数用例的 Δ 符号反过来
  //    （首版就是这么错的：把 control−contract 当成 contract−control，直接造出一个假通过）。
  //    `--selftest` 用两种奇偶各一份构造样本锁死这个符号约定。
  const totalOf = (arm) => (arm === p.x_arm ? xTotal : yTotal)
  rows.push({
    ...p,
    x_total: xTotal, y_total: yTotal,
    a_total: totalOf(ct.a), b_total: totalOf(ct.b),
    note: s.note || '',
  })
}
// Δ = 对比定义里的 a 臂 − b 臂
for (const r of rows) r.delta = r.a_total - r.b_total

if (missing.length) console.error(`⚠️ 缺 ${missing.length}/${pairs.length} 份判分`)

// 精确二项检验（双侧，p=0.5），忽略平局
function signTest(wins, losses) {
  const n = wins + losses
  if (!n) return { n: 0, p: 1 }
  const logC = (n, k) => {
    let s = 0
    for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i)
    return s
  }
  const k = Math.min(wins, losses)
  let tail = 0
  for (let i = 0; i <= k; i++) tail += Math.exp(logC(n, i) - n * Math.log(2))
  return { n, p: Math.min(1, 2 * tail) }
}

// ---- 自检：Δ 的符号必须由**臂名**决定，与 X/Y 槽位无关 ----
if (process.argv.includes('--selftest')) {
  const mk = (id, contrast, xArm, xT, yT) => ({
    pair_id: id, contrast, x_arm: xArm, y_arm: xArm === 'contract' ? (contrast === 'K-vs-T' ? 'treat' : 'control') : 'contract',
    _x: xT, _y: yT,
  })
  const cases = [
    // 偶数用例：X=contract（第一臂）；判 contract 胜 ⇒ Δ 必须为正
    { contrast: 'K-vs-C', p: mk('even', 'K-vs-C', 'contract', 12, 9), want: +3 },
    // 奇数用例：X=control（第二臂）；判 contract 胜（即 Y 更高）⇒ Δ 仍必须为正
    { contrast: 'K-vs-C', p: mk('odd', 'K-vs-C', 'control', 9, 12), want: +3 },
    // 反向：contract 输 ⇒ Δ 必须为负（两种槽位各一）
    { contrast: 'K-vs-C', p: mk('even-lose', 'K-vs-C', 'contract', 8, 11), want: -3 },
    { contrast: 'K-vs-C', p: mk('odd-lose', 'K-vs-C', 'control', 11, 8), want: -3 },
  ]
  let bad = 0
  for (const c of cases) {
    const ct = CONTRASTS.find((x) => x.id === c.contrast)
    const totalOf = (arm) => (arm === c.p.x_arm ? c.p._x : c.p._y)
    const got = totalOf(ct.a) - totalOf(ct.b)
    if (got !== c.want) { console.log(`🔴 ${c.p.pair_id}: Δ 应为 ${c.want}，实得 ${got}`); bad++ }
  }
  console.log(bad ? `自检失败 ${bad}/${cases.length}` : `自检：${cases.length}/${cases.length} 通过（Δ 符号由臂名决定，与槽位无关）`)
  process.exit(bad ? 1 : 0)
}

const contrasts = ['K-vs-C', 'K-vs-T', 'T-vs-C']
const splits = ['all', 'train', 'holdout']
const table = {}
for (const ct of contrasts) {
  table[ct] = {}
  for (const sp of splits) {
    const rs = rows.filter((r) => r.contrast === ct && (sp === 'all' || r.split === sp))
    if (!rs.length) { table[ct][sp] = null; continue }
    const wins = rs.filter((r) => r.delta > 0).length
    const losses = rs.filter((r) => r.delta < 0).length
    const ties = rs.filter((r) => r.delta === 0).length
    const mean = rs.reduce((a, r) => a + r.delta, 0) / rs.length
    table[ct][sp] = { n: rs.length, mean_delta: Number(mean.toFixed(3)), wins, losses, ties, sign_p: Number(signTest(wins, losses).p.toFixed(4)) }
  }
}

const label = { 'K-vs-C': '契约臂 − 对照臂', 'K-vs-T': '契约臂 − 单卡臂', 'T-vs-C': '单卡臂 − 对照臂' }
console.log('对比          分层      n    Δ均值   胜/负/平      符号检验 p')
for (const ct of contrasts) {
  for (const sp of splits) {
    const t = table[ct][sp]
    if (!t) continue
    console.log(`${label[ct].padEnd(14)} ${sp.padEnd(7)} ${String(t.n).padStart(2)}  ${String(t.mean_delta).padStart(6)}   ` +
      `${t.wins}/${t.losses}/${t.ties}`.padEnd(12) + `  ${t.sign_p}`)
  }
}

// ---- 验收判定（事前定死）----
const primary = table['K-vs-C']?.holdout
const harm = table['T-vs-C']?.all
const verdict = {
  primary_holdout_delta_ge_0: primary ? primary.mean_delta >= 0 : null,
  harm_reproduced_treat_worse: harm ? harm.mean_delta < 0 : null,
}
const hedge = diag?.summary
verdict.hedge_contract_not_worse = hedge
  ? hedge.contract.hedge_narrow_files <= hedge.control.hedge_narrow_files : null

console.log('\n=== 验收（事前定死） ===')
console.log(`① 主判据 holdout Δ(契约−对照) ≥ 0 ：${primary ? primary.mean_delta : 'NA'} ⇒ ${verdict.primary_holdout_delta_ge_0}`)
console.log(`② 同批里单卡臂仍劣于对照臂（负结果复现）：${harm ? harm.mean_delta : 'NA'} ⇒ ${verdict.harm_reproduced_treat_worse}`)
console.log(`③ 契约臂对冲措辞率不高于对照臂：` +
  (hedge ? `契约 ${hedge.contract.hedge_narrow_files}/${hedge.contract.n} vs 对照 ${hedge.control.hedge_narrow_files}/${hedge.control.n}` : 'NA') +
  ` ⇒ ${verdict.hedge_contract_not_worse}`)
const accepted = Object.values(verdict).every((v) => v === true)
console.log(accepted ? '\n✅ 三项全过：契约层在小样本上成立' : '\n❌ 未全过 —— 按判据不许声称通过')

writeFileSync(join(L7C, 'verdict.json'), JSON.stringify({
  meta: {
    what: 'F6 契约双模板的小样本实测结论',
    acceptance_predeclared: '① holdout Δ(K−C) ≥ 0；② 同批单卡臂仍劣于对照臂；③ 契约臂对冲率不高于对照臂',
    judge_rubric: '三维固定量表 0–5（completeness / specificity / data_clarity），盲配对',
    note: '判官是 LLM；原实验实测判官噪声 ±0.6~0.7（满分 15），小于该数的 Δ 不可分辨',
  },
  table, verdict, accepted,
  rows,
}, null, 2) + '\n')
console.log('→ eval/out/l7c/verdict.json')
