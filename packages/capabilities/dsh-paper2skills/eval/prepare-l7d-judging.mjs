#!/usr/bin/env node
/**
 * F7（F6-v2）实测 · 盲配对判分的前置（确定性，不调模型）
 *
 * 把每个 (用例, 对比) 的两份交付物复制成**中性文件名** `X.md` / `Y.md`，
 * 判分 agent 从文件名上看不出哪一臂是哪一臂。X/Y 的位置由 case_id 的奇偶决定，
 * 三组对比共用同一套位置规则 —— 位置偏差若存在，会在两臂上成对抵消（与 F6 同规）。
 *
 * ⚠️ 位置规则必须与 `l7d-verdict.mjs` 的**按臂名取分**配套。F6 首版按 X/Y 槽位算 Δ，
 *    半数用例符号翻转，造出一个 holdout +2.4 的假通过（已登记为门禁缺陷 #15）。
 *    本脚本只负责摆位置；符号由 verdict 按 arm 名解析，两边都有 selftest 锁。
 *
 * 用法：node eval/prepare-l7d-judging.mjs
 *   → eval/out/l7d/judge/<case>-<split>-<contrast>/X.md | Y.md
 *   → eval/out/l7d/judge/pairs.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { EVAL_OUT } from './lib/load.mjs'

const L7D = join(EVAL_OUT, 'l7d')
const ROLLOUT = join(L7D, 'rollout')
const JUDGE = join(L7D, 'judge')

// 三组对比。主判据 = v2 vs control；配对确认 = v2 vs v1；复现检查 = v1 vs control
const CONTRASTS = [
  { id: 'v2-vs-control', a: 'v2', b: 'control', role: 'primary' },
  { id: 'v2-vs-v1', a: 'v2', b: 'v1', role: 'paired_fix' },
  { id: 'v1-vs-control', a: 'v1', b: 'control', role: 'reproduction' },
  // lite 臂探针（补跑）：分离「契约内容」与「契约载荷」
  { id: 'lite-vs-treat', a: 'lite', b: 'treat', role: 'lite_probe' },
  { id: 'lite-vs-v2', a: 'lite', b: 'v2', role: 'lite_probe' },
]

const cases = JSON.parse(readFileSync(join(L7D, 'cases.json'), 'utf8')).cases
// ⚠️ 只创建/覆盖 X.md、Y.md，**不动已存在的 scores.json** ——
// 补跑新对比时若把整个目录删掉，前一批的判分就没了（那等于重判一次，噪声也重来一遍）。
mkdirSync(JUDGE, { recursive: true })

const pairs = []
const missing = []
for (const c of cases) {
  for (const split of ['train', 'holdout']) {
    for (const ct of CONTRASTS) {
      const fileA = join(ROLLOUT, `${c.case_id}-${split}-${ct.a}.md`)
      const fileB = join(ROLLOUT, `${c.case_id}-${split}-${ct.b}.md`)
      if (!existsSync(fileA) || !existsSync(fileB)) { missing.push(`${c.case_id}-${split}-${ct.id}`); continue }
      const dir = join(JUDGE, `${c.case_id}-${split}-${ct.id}`)
      mkdirSync(dir, { recursive: true })
      const n = Number(c.case_id.slice(-3))
      const xIsA = n % 2 === 0
      const xArm = xIsA ? ct.a : ct.b
      const yArm = xIsA ? ct.b : ct.a
      writeFileSync(join(dir, 'X.md'), readFileSync(xIsA ? fileA : fileB))
      writeFileSync(join(dir, 'Y.md'), readFileSync(xIsA ? fileB : fileA))
      pairs.push({
        pair_id: `${c.case_id}-${split}-${ct.id}`,
        case_id: c.case_id, split, contrast: ct.id, role: ct.role,
        gap: c.gap, card: c.card, dir,
        x_arm: xArm, y_arm: yArm,
      })
    }
  }
}

if (missing.length) {
  console.error(`❌ 缺 ${missing.length} 份交付物，先跑完生成批：`)
  for (const m of missing.slice(0, 10)) console.error('   - ' + m)
  process.exit(2)
}

writeFileSync(join(JUDGE, 'pairs.json'), JSON.stringify({
  meta: {
    rule: 'X/Y 位置由 case_id 奇偶决定；判分 agent 只看 X.md / Y.md，不看臂名',
    contrasts: CONTRASTS,
  },
  n: pairs.length,
  pairs,
}, null, 2) + '\n')

console.log(`盲配对 ${pairs.length} 组（${cases.length} 用例 × 2 切分 × 3 组对比）`)
for (const ct of CONTRASTS) {
  console.log(`  ${ct.id.padEnd(16)} ${pairs.filter((p) => p.contrast === ct.id).length} 组 · 角色 ${ct.role}`)
}
console.log('→ eval/out/l7d/judge/')
