#!/usr/bin/env node
/**
 * F6 契约层实测 · 确定性诊断（不调模型，纯文本度量）
 *
 * 为什么必须有这一层：SkillOpt 补丁的死因不是「分低」，而是**形态变了** ——
 * 它让 26/40 份产出挂上「待标定 / 需重新标定 / 临时默认值」这类对冲措辞（对照臂 0/40），
 * 把「敢下判断的方案」变成了「处处留白的说明」。所以契约臂若靠对冲取胜，必须当场看得见。
 *
 * 三项度量（定义写死在这里，不许事后调整口径）：
 *   ① 对冲措辞率：命中「参数缓议族」词表的文件占比。
 *      窄表 = 参数缓议族（待标定/重新标定/临时默认值/标定前/待实测标定/未标定）；
 *      宽表 = 再加上一切「转人工/待确认」类词（**只作参考，不作判据** —— 对照组本身也会写人工终审）。
 *   ② 中位长度（字符数）。
 *   ③ 中位量化判据数：`数字+单位/量词` 的出现次数（单位表见 UNIT_RE）。
 *
 * 用法：node eval/analyze-l7c.mjs            → eval/out/l7c/diagnostics.json
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVAL_OUT } from './lib/load.mjs'

const ROLLOUT = join(EVAL_OUT, 'l7c', 'rollout')

// 参数缓议族：把论文参数的处理推给未来，而不是给出本业务取值（SkillOpt 补丁的写法）
const HEDGE_NARROW = ['待标定', '重新标定', '临时默认值', '标定前', '待实测标定', '未标定', '待校准', '重新校准']
// 宽表：再加一切「转人工 / 待确认」——仅作参考
const HEDGE_WIDE = [...HEDGE_NARROW, '待人工', '转人工', '待确认', '需确认', '待补']
const UNIT_RE = /\d+(?:\.\d+)?\s*(?:%|％|倍|天|小时|分钟|秒|日|周|月|年|个|条|款|元|美元|万|亿|次|人|分|星|折|国|SKU|pp|‰)/g
// 「限定/弃权语」：不给业务取值、把判断推回去的说法。
// ⚠️ 这是 SkillOpt 补丁死法的**第二种形态** —— 补丁是挂对冲短语（26/40），
//    契约臂实测是**以省略代对冲**（量化判据中位数 3 vs 对照 19.5）。两种都让交付物变空。
const ABSTAIN_RE = /暂无|未定名|未定名前|不作本业务取值|不采用|不引用|只出诊断|不产|不得据此|不进入|待补|不套用/g
// 契约专有算式的「被采用率」：证明模型确实读了契约，而不是忽略它
const FORMULA_KEYS = ['账单', '完成任务数', '重跑率', '新鲜度', '指纹', '并发', '限额']

const hits = (text, words) => words.filter((w) => text.includes(w))

const files = readdirSync(ROLLOUT).filter((f) => f.endsWith('.md'))
const byArm = new Map()
for (const f of files) {
  const m = f.match(/^(F6-\d{3})-(train|holdout)-(control|treat|contract)\.md$/)
  if (!m) continue
  const [, caseId, split, arm] = m
  const text = readFileSync(join(ROLLOUT, f), 'utf8')
  const row = {
    file: f, case_id: caseId, split, arm,
    chars: text.length,
    hedge_narrow: hits(text, HEDGE_NARROW),
    hedge_wide: hits(text, HEDGE_WIDE),
    quant: (text.match(UNIT_RE) || []).length,
    abstain: (text.match(ABSTAIN_RE) || []).length,
    formula_uptake: FORMULA_KEYS.some((k) => text.includes(k)),
    // 元话语：围着资料本身写说明（原实验里三臂均为 0/40，此处保留同一度量）
    meta_talk: /(本资料|该技能|这张卡|技能卡|参考资料|文献)/.test(text),
  }
  if (!byArm.has(arm)) byArm.set(arm, [])
  byArm.get(arm).push(row)
}

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const h = Math.floor(s.length / 2)
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
}

const summary = {}
for (const arm of ['control', 'treat', 'contract']) {
  const rows = byArm.get(arm) || []
  summary[arm] = {
    n: rows.length,
    hedge_narrow_files: rows.filter((r) => r.hedge_narrow.length).length,
    hedge_wide_files: rows.filter((r) => r.hedge_wide.length).length,
    meta_talk_files: rows.filter((r) => r.meta_talk).length,
    chars_median: median(rows.map((r) => r.chars)),
    quant_median: median(rows.map((r) => r.quant)),
    abstain_median: median(rows.map((r) => r.abstain)),
    formula_uptake_files: rows.filter((r) => r.formula_uptake).length,
  }
}

console.log('臂          n  对冲(窄)  对冲(宽)  元话语  中位长度  中位量化判据  中位弃权语  采用契约算式')
for (const arm of ['control', 'treat', 'contract']) {
  const s = summary[arm]
  console.log(`${arm.padEnd(10)} ${String(s.n).padStart(2)}  ${String(s.hedge_narrow_files).padStart(6)}  ` +
    `${String(s.hedge_wide_files).padStart(7)}  ${String(s.meta_talk_files).padStart(5)}  ` +
    `${String(s.chars_median).padStart(8)}  ${String(s.quant_median).padStart(11)}  ` +
    `${String(s.abstain_median).padStart(9)}  ${String(s.formula_uptake_files).padStart(9)}/${s.n}`)
}

writeFileSync(join(EVAL_OUT, 'l7c', 'diagnostics.json'), JSON.stringify({
  meta: {
    what: 'F6 契约层实测的确定性诊断（无模型调用）',
    hedge_narrow: HEDGE_NARROW,
    abstain_regex: String(ABSTAIN_RE),
    formula_keys: FORMULA_KEYS,
    hedge_wide: HEDGE_WIDE,
    unit_regex: String(UNIT_RE),
    why: 'SkillOpt 补丁靠对冲措辞取胜（26/40 vs 0/40）并因此被判死；契约臂必须不重蹈',
  },
  summary,
  rows: [...byArm.values()].flat(),
}, null, 2) + '\n')
console.log('→ eval/out/l7c/diagnostics.json')
