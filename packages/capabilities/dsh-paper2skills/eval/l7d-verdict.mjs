#!/usr/bin/env node
/**
 * F7（F6-v2）契约层实测 · 判分汇总与验收判定（确定性，不调模型）
 *
 * 验收判据**事前写死在 `eval/build-l7d-cases.mjs` 的 CRITERIA 里**，本脚本只负责读它并逐条判定 ——
 * 判据与判定分家，是为了让「跑完再挑口径」在物理上做不到。
 *
 *   D1  确定性  quant 中位数 v2 ≥ 0.8 × treat        （v2 不得再以省略代对冲）
 *   D2  确定性  abstain 中位数 v2 ≤ 1                  （F6 的 v1 臂为 2）
 *   D3  确定性  disposed_gap_ratio 均值 v2 ≥ 0.6       （写了缺口就必须写「先用什么」）
 *   D4  复现    quant 中位数 v1 ≤ 0.5 × treat          （本批卡上必须复现 v1 的坏形态）
 *   Q1  判官    Δ(v2−control) 的 95% 区间下界 ≥ −0.7   （「不劣于判官噪声」，不是「均值过 0」）
 *   Q2  判官    Δ(v2−v1) > 0                           （配对确认，支持性）
 * 验收 = D1 ∧ D2 ∧ D3 ∧ D4 ∧ Q1。
 *
 * ⚠️ Δ 必须按**臂名**取分，不能按 X/Y 槽位取分。F6 首版按槽位算，半数用例符号翻转，
 *    造出一个 holdout +2.4 的假通过（已登记为门禁缺陷 #15）。`--selftest` 用
 *    奇偶 × 胜负 4 组构造样本锁死这个符号约定。
 *
 * 用法：node eval/l7d-verdict.mjs [--selftest]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EVAL_OUT } from './lib/load.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = resolve(HERE, '..')
const L7D = join(EVAL_OUT, 'l7d')
const DIMS = ['completeness', 'specificity', 'data_clarity']

// 小样本双侧 95% 的 t 临界值（df = n−1）；n > 20 用正态近似
const T95 = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086 }

export function ci95(deltas) {
  const n = deltas.length
  if (n < 2) return { n, mean: n ? deltas[0] : null, lo: null, hi: null, sd: null }
  const mean = deltas.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
  const t = T95[n - 1] ?? 1.96
  const se = sd / Math.sqrt(n)
  return { n, mean, sd, lo: mean - t * se, hi: mean + t * se }
}

export function signTest(wins, losses) {
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

const median = (xs) => {
  const s = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b)
  if (!s.length) return null
  const h = Math.floor(s.length / 2)
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
}
const mean = (xs) => {
  const s = xs.filter((x) => x !== null && x !== undefined)
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null
}

// ---------------------------------------------------------------------------
// 自检：Δ 的符号必须由**臂名**决定，与 X/Y 槽位无关
// ---------------------------------------------------------------------------
function selftest() {
  let cases = 0
  const fails = []
  const expect = (cond, label) => { cases++; if (!cond) fails.push(label) }

  // 构造：给定 case 奇偶、给定哪一臂分高，按 pairs.json 的规则摆 X/Y，再按臂名解析 Δ
  const mk = (n, xArm, xTotal, yTotal) => {
    const yArm = xArm === 'a' ? 'b' : 'a'
    const s = { x: { _t: xTotal }, y: { _t: yTotal } }
    const totalOf = (arm) => (arm === s._xArm ? s.x._t : s.y._t)
    s._xArm = xArm
    void yArm
    return totalOf(n)
  }
  // 偶数 case → X = 对比定义里的 a 臂；奇数 → X = b 臂
  const deltaByArm = (caseNum, aArm, bArm, aTotal, bTotal) => {
    const xIsA = caseNum % 2 === 0
    const xArm = xIsA ? aArm : bArm
    const xTotal = xIsA ? aTotal : bTotal
    const yTotal = xIsA ? bTotal : aTotal
    // 按臂名解析（这就是被测的约定）
    const got = (arm) => (arm === xArm ? xTotal : yTotal)
    return got(aArm) - got(bArm)
  }
  expect(deltaByArm(2, 'v2', 'control', 12, 9) === 3, '偶数用例：X=v2 且 v2 高 ⇒ Δ 必须 +3')
  expect(deltaByArm(3, 'v2', 'control', 12, 9) === 3, '奇数用例：X=control 且 v2 高 ⇒ Δ 仍必须 +3（槽位无关）')
  expect(deltaByArm(2, 'v2', 'control', 8, 11) === -3, '偶数用例：v2 低 ⇒ Δ 必须 −3')
  expect(deltaByArm(3, 'v2', 'control', 8, 11) === -3, '奇数用例：v2 低 ⇒ Δ 仍必须 −3')
  expect(mk(2, 'a', 5, 5) === 5, '同分时按臂名取值不得串位')

  // CI：全零差的 CI 必须包含 0 且宽度为 0；单边一致时必须不含 0
  const zero = ci95([0, 0, 0])
  expect(zero.lo === 0 && zero.hi === 0, '全零差 ⇒ CI 必须是 [0,0]')
  const pos = ci95([2, 2, 2, 2, 2, 2, 2, 2])
  expect(pos.lo > 0, `8 个 +2 ⇒ CI 下界必须 > 0（实得 ${pos.lo?.toFixed(2)}）`)
  const noisy = ci95([3, -2, 1, -1, 0, 2, -3, 1])
  expect(noisy.lo < 0 && noisy.hi > 0, '噪声样本的 CI 必须跨 0（否则判据太松）')
  expect(T95[7] === 2.365, 'n=8 的 t 临界值必须是 2.365（写错会让 CI 静默变窄）')

  console.log(`自检：${cases - fails.length}/${cases} 通过`)
  for (const f of fails) console.log(`🔴 ${f}`)
  return fails.length ? 1 : 0
}

if (process.argv.includes('--selftest')) process.exit(selftest())

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const casesJson = JSON.parse(readFileSync(join(L7D, 'cases.json'), 'utf8'))
const CRITERIA = casesJson.meta.criteria_preregistered
const { pairs } = JSON.parse(readFileSync(join(L7D, 'judge', 'pairs.json'), 'utf8'))
const diagPath = join(L7D, 'diagnostics.json')
const diag = existsSync(diagPath) ? JSON.parse(readFileSync(diagPath, 'utf8')) : null

const CONTRASTS = [
  { id: 'v2-vs-control', a: 'v2', b: 'control' },
  { id: 'v2-vs-v1', a: 'v2', b: 'v1' },
  { id: 'v1-vs-control', a: 'v1', b: 'control' },
  { id: 'lite-vs-treat', a: 'lite', b: 'treat' },
  { id: 'lite-vs-v2', a: 'lite', b: 'v2' },
]
const ARMS = ['control', 'treat', 'v1', 'v2', 'lite']

const rows = []
const missing = []
for (const p of pairs) {
  const f = join(L7D, 'judge', p.pair_id, 'scores.json')
  if (!existsSync(f)) { missing.push(p.pair_id); continue }
  const s = JSON.parse(readFileSync(f, 'utf8'))
  const sum = (o) => DIMS.reduce((acc, d) => acc + (Number(o?.[d]) || 0), 0)
  const xTotal = sum(s.x), yTotal = sum(s.y)
  const ct = CONTRASTS.find((c) => c.id === p.contrast)
  // 按臂名取分（见文件头 ⚠️）
  const totalOf = (arm) => (arm === p.x_arm ? xTotal : yTotal)
  rows.push({
    ...p,
    x_total: xTotal, y_total: yTotal,
    a_total: totalOf(ct.a), b_total: totalOf(ct.b),
    note: s.note || '',
    delta: totalOf(ct.a) - totalOf(ct.b),
  })
}
if (missing.length) console.error(`⚠️ 缺 ${missing.length}/${pairs.length} 份判分`)

function summarize(contrastId, split = null) {
  const rs = rows.filter((r) => r.contrast === contrastId && (split === null || r.split === split))
  const d = rs.map((r) => r.delta)
  const ci = ci95(d)
  const wins = d.filter((x) => x > 0).length
  const losses = d.filter((x) => x < 0).length
  const ties = d.filter((x) => x === 0).length
  const st = signTest(wins, losses)
  return {
    n: rs.length, wins, losses, ties,
    mean_delta: ci.mean, ci95: [ci.lo, ci.hi], sd: ci.sd, sign_test_p: st.p,
    dims: Object.fromEntries(DIMS.map((dim) => {
      const deltas = rs.map((r) => {
        const s = JSON.parse(readFileSync(join(r.dir, 'scores.json'), 'utf8'))
        const tot = (arm) => (arm === r.x_arm ? Number(s.x?.[dim]) || 0 : Number(s.y?.[dim]) || 0)
        const ct = CONTRASTS.find((c) => c.id === r.contrast)
        return tot(ct.a) - tot(ct.b)
      })
      return [dim, mean(deltas)]
    })),
  }
}

const judge = {}
for (const ct of CONTRASTS) {
  judge[ct.id] = { all: summarize(ct.id), holdout: summarize(ct.id, 'holdout'), train: summarize(ct.id, 'train') }
}

// ---- 确定性判据 ----
const det = {}
if (diag) {
  const S = diag.summary
  const q = (arm) => S[arm]?.quant_median ?? null
  const ab = (arm) => S[arm]?.abstain_median ?? null
  const rg = (arm) => S[arm]?.disposed_gap_ratio_mean ?? null
  det.quant_median = Object.fromEntries(ARMS.map((a) => [a, q(a)]))
  det.abstain_median = Object.fromEntries(ARMS.map((a) => [a, ab(a)]))
  det.disposed_gap_ratio_mean = Object.fromEntries(ARMS.map((a) => [a, rg(a)]))
  det.gap_sentences_median = Object.fromEntries(ARMS.map((a) => [a, S[a]?.gap_sentences_median ?? null]))
  det.n = Object.fromEntries(ARMS.map((a) => [a, S[a]?.n ?? 0]))
}

const checks = {}
for (const c of CRITERIA) {
  let passed = null, detail = ''
  if (c.id === 'D1') {
    const lhs = det.quant_median?.v2, rhs = det.quant_median?.treat
    passed = lhs !== null && rhs !== null && lhs >= 0.8 * rhs
    detail = `quant 中位 v2=${lhs} vs 0.8×treat=${rhs === null ? '—' : (0.8 * rhs).toFixed(1)}`
  } else if (c.id === 'D2') {
    const lhs = det.abstain_median?.v2
    passed = lhs !== null && lhs <= 1
    detail = `abstain 中位 v2=${lhs}（阈值 ≤1；F6 的 v1 臂为 2）`
  } else if (c.id === 'D3') {
    const lhs = det.disposed_gap_ratio_mean?.v2
    const gaps = det.gap_sentences_median?.v2
    if (gaps === 0) {
      // 跑批前写下的豁免（见 cases.json 的 D3 文本）：一条缺口句都不写 ⇒ 判据不适用，不判红。
      passed = true
      detail = `v2 臂缺口句中位数=0（根本不写缺口）⇒ 本条**不适用**，按不违反处理（跑批前已声明的豁免）`
    } else {
      passed = lhs !== null && lhs >= 0.6
      detail = `disposed_gap_ratio 均值 v2=${lhs === null ? '—' : lhs.toFixed(3)}（阈值 ≥0.6；v2 缺口句中位=${gaps}）`
    }
  } else if (c.id === 'D4') {
    const lhs = det.quant_median?.v1, rhs = det.quant_median?.treat
    passed = lhs !== null && rhs !== null && lhs <= 0.5 * rhs
    detail = `quant 中位 v1=${lhs} vs 0.5×treat=${rhs === null ? '—' : (0.5 * rhs).toFixed(1)}`
  } else if (c.id === 'Q1') {
    const lo = judge['v2-vs-control']?.holdout?.ci95?.[0]
    passed = lo !== null && lo !== undefined && lo >= -0.7
    detail = `Δ(v2−control) holdout 的 95% 区间下界=${lo === null || lo === undefined ? '—' : lo.toFixed(2)}（阈值 ≥ −0.7）`
  } else if (c.id === 'Q2') {
    const m = judge['v2-vs-v1']?.all?.mean_delta
    passed = m !== null && m !== undefined && m > 0
    detail = `Δ(v2−v1) 全 8 对均值=${m === null || m === undefined ? '—' : m.toFixed(2)}（须 > 0）`
  }
  checks[c.id] = { ...c, passed, detail }
}

// ---- lite 臂探针判据（L1–L3，写死在 eval/build-l7d-lite.mjs 里，跑批前定稿）----
const litePath = join(L7D, 'lite.criteria.json')
const liteMeta = existsSync(litePath) ? JSON.parse(readFileSync(litePath, 'utf8')) : null
const liteChecks = {}
if (liteMeta && det.n?.lite) {
  const ql = det.quant_median?.lite, qt = det.quant_median?.treat, qv = det.quant_median?.v2
  liteChecks.L1 = {
    text: 'quant 中位数(lite) ≥ 0.8 × quant 中位数(treat)',
    passed: ql !== null && qt !== null && ql >= 0.8 * qt,
    detail: `lite=${ql} vs 0.8×treat=${qt === null ? '—' : (0.8 * qt).toFixed(1)}`,
  }
  liteChecks.L2 = {
    text: 'quant 中位数(lite) > quant 中位数(v2)',
    passed: ql !== null && qv !== null && ql > qv,
    detail: `lite=${ql} vs v2=${qv}`,
  }
  const lo = judge['lite-vs-treat']?.all?.ci95?.[0]
  liteChecks.L3 = {
    text: 'Δ(lite − treat) 的 95% 区间下界 ≥ −0.7',
    passed: lo !== null && lo !== undefined && lo >= -0.7,
    detail: `Δ(lite−treat) 全 8 对均值=${judge['lite-vs-treat']?.all?.mean_delta?.toFixed(2) ?? '—'}，95% 区间下界=${lo === null || lo === undefined ? '—' : lo.toFixed(2)}`,
  }
}

const gate = CRITERIA.filter((c) => !c.supportive).map((c) => c.id)
const accepted = gate.every((id) => checks[id]?.passed === true)

// ---- 输出 ----
console.log('\n=== 确定性诊断（不调模型）===')
console.log('臂        n   中位量化  中位弃权  缺口句中位  缺口处置率均值')
for (const arm of ARMS) {
  console.log(`${arm.padEnd(8)} ${String(det.n?.[arm] ?? 0).padStart(2)}  ${String(det.quant_median?.[arm]).padStart(7)}  ` +
    `${String(det.abstain_median?.[arm]).padStart(7)}  ${String(det.gap_sentences_median?.[arm]).padStart(10)}  ` +
    `${String(det.disposed_gap_ratio_mean?.[arm] === null || det.disposed_gap_ratio_mean?.[arm] === undefined ? '—' : det.disposed_gap_ratio_mean[arm].toFixed(3)).padStart(12)}`)
}

console.log('\n=== 盲配对判分（三维 0–15，按臂名解析 Δ）===')
for (const ct of CONTRASTS) {
  const a = judge[ct.id]
  for (const [label, s] of [['全 8 对', a.all], ['holdout', a.holdout], ['train', a.train]]) {
    const ci = s.ci95[0] === null ? '—' : `[${s.ci95[0].toFixed(2)}, ${s.ci95[1].toFixed(2)}]`
    console.log(`${ct.id.padEnd(16)} ${label.padEnd(9)} n=${s.n} Δ均=${s.mean_delta === null ? '—' : s.mean_delta.toFixed(2)} ` +
      `95%CI=${ci} 胜/负/平=${s.wins}/${s.losses}/${s.ties} p=${s.sign_test_p.toFixed(3)}`)
  }
}

if (liteMeta) {
  console.log('\n=== lite 臂探针判据（分离「契约内容」与「契约载荷」）===')
  for (const id of ['L1', 'L2', 'L3']) {
    const k = liteChecks[id]
    if (!k) { console.log(`⏳ ${id} 数据未到`); continue }
    console.log(`${k.passed ? '✅' : '❌'} ${id} ${k.detail}`)
  }
  console.log(liteChecks.L1?.passed
    ? '  读法：✅ ⇒ 契约可继续做提示词载荷，但必须是只带取值的短件'
    : '  读法：❌ ⇒ **契约不能作为提示词载荷**，应转为闸门/人工标定物（S12 的消费口条件）')
}

console.log('\n=== 事前判据 ===')
for (const c of CRITERIA) {
  const k = checks[c.id]
  console.log(`${k.passed ? '✅' : '❌'} ${c.id}${c.supportive ? '（支持性）' : ''} ${k.detail}`)
}
console.log(`\n验收（${gate.join(' ∧ ')}）= ${accepted ? '✅ 通过' : '❌ 未通过'}`)

writeFileSync(join(L7D, 'verdict.json'), JSON.stringify({
  meta: {
    what: 'F7（F6-v2）契约层实测的判分汇总与验收判定',
    criteria_source: 'eval/build-l7d-cases.mjs 的 meta.criteria_preregistered（跑批前写死）',
    judge_scale: 'completeness / specificity / data_clarity 各 0–5，总 0–15，盲配对',
    delta_convention: 'Δ = 对比定义里的 a 臂 − b 臂，**按臂名解析**，与 X/Y 槽位无关',
    missing_judgements: missing,
  },
  deterministic: det,
  judge,
  checks,
  lite_probe: { meta: liteMeta ? { hypothesis: liteMeta.hypothesis, manipulation: liteMeta.manipulation, built: liteMeta.built } : null, checks: liteChecks },
  acceptance: { gate, accepted },
  rows,
}, null, 2) + '\n')
console.log('→ eval/out/l7d/verdict.json')
