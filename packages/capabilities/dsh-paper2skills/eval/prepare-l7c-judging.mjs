#!/usr/bin/env node
/**
 * F6 契约层实测 · 盲配对判分的前置（确定性，不调模型）
 *
 * 把每个 (用例, 对比) 的两份交付物复制成**中性文件名** `X.md` / `Y.md`，
 * 使得判分 agent 从文件名上看不出哪一臂是哪一臂。
 * X/Y 的位置由 case_id 的奇偶决定（偶数 → X=契约臂，奇数 → X=对照臂），
 * 三组对比共用同一套位置规则 —— 位置偏差若存在，会在两臂上成对抵消（原实验的做法）。
 *
 * 用法：node eval/prepare-l7c-judging.mjs
 *   → eval/out/l7c/judge/<case>-<contrast>/X.md | Y.md
 *   → eval/out/l7c/judge/pairs.json
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { EVAL_OUT } from './lib/load.mjs'

const L7C = join(EVAL_OUT, 'l7c')
const ROLLOUT = join(L7C, 'rollout')
const JUDGE = join(L7C, 'judge')

const ARMS = { control: 'control', treat: 'treat', contract: 'contract' }
// 三组对比：主判据 = 契约臂 vs 对照臂；另两组用于定性（harm 是否复现 / 卡单独给是否更差）
const CONTRASTS = [
  { id: 'K-vs-C', a: 'contract', b: 'control', role: 'primary' },
  { id: 'K-vs-T', a: 'contract', b: 'treat', role: 'secondary' },
  { id: 'T-vs-C', a: 'treat', b: 'control', role: 'harm_check' },
]

const cases = JSON.parse(readFileSync(join(L7C, 'cases.json'), 'utf8')).cases
rmSync(JUDGE, { recursive: true, force: true })
mkdirSync(JUDGE, { recursive: true })

const pairs = []
const missing = []
for (const c of cases) {
  for (const split of ['train', 'holdout']) {
    for (const ct of CONTRASTS) {
      const fileA = join(ROLLOUT, `${c.case_id}-${split}-${ARMS[ct.a]}.md`)
      const fileB = join(ROLLOUT, `${c.case_id}-${split}-${ARMS[ct.b]}.md`)
      if (!existsSync(fileA) || !existsSync(fileB)) { missing.push(`${c.case_id}-${split}-${ct.id}`); continue }
      const dir = join(JUDGE, `${c.case_id}-${split}-${ct.id}`)
      mkdirSync(dir, { recursive: true })
      // 偶数 case → X=第一臂；奇数 → X=第二臂（位置平衡）
      const n = Number(c.case_id.slice(-3))
      const xIsA = n % 2 === 0
      const xArm = xIsA ? ct.a : ct.b
      const yArm = xIsA ? ct.b : ct.a
      writeFileSync(join(dir, 'X.md'), readFileSync(xIsA ? fileA : fileB))
      writeFileSync(join(dir, 'Y.md'), readFileSync(xIsA ? fileB : fileA))
      pairs.push({
        pair_id: `${c.case_id}-${split}-${ct.id}`,
        case_id: c.case_id, split, contrast: ct.id, role: ct.role,
        gap: c.gap, card: c.card,
        dir,
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

writeFileSync(join(L7C, 'judge', 'pairs.json'), JSON.stringify({
  meta: {
    rule: 'X/Y 位置由 case_id 奇偶决定；判分 agent 只看 X.md / Y.md，不看臂名',
    contrasts: CONTRASTS,
  },
  n: pairs.length,
  pairs,
}, null, 2) + '\n')

console.log(`盲配对 ${pairs.length} 组（${cases.length} 用例 × 3 组对比）`)
for (const ct of CONTRASTS) {
  console.log(`  ${ct.id.padEnd(8)} ${pairs.filter((p) => p.contrast === ct.id).length} 组 · 角色 ${ct.role}`)
}
console.log('→ eval/out/l7c/judge/')
