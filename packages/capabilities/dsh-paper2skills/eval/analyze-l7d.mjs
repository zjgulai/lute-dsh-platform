#!/usr/bin/env node
/**
 * F7（F6-v2）契约层实测 · 确定性诊断（不调模型，纯文本度量）
 *
 * 与 `analyze-l7c.mjs` 的关系：**度量定义逐字沿用**（quant / abstain / hedge / meta_talk），
 * 以便与 F6 的数字直接对比；只新增一项 D3。
 *
 * 为什么要新增 D3：F6 实测的失败形态不是「分低」，而是**以省略代对冲**——
 * 契约臂的量化判据中位数 3（对照 19.5），弃权语中位数 2（其余两臂 0）。
 * 模板 v2 的修法正是给「缺口陈述」补上对称的**处置**（先用什么替代 + 何时失效）。
 * 所以必须有一个直接测「缺口有没有被处置」的度量，否则 v2 的成功或失败都只能靠判官说。
 *
 * D3 定义（写死在这里，跑批前定稿，不许事后调口径）：
 *   · 缺口句 gap_sentence = 命中 GAP_RE 的句子（按 。；！？\n 切句）
 *   · 已处置 disposed     = 该句内**同时**出现 ① 数字+单位，或 ② 替换条件词（DISPOSAL_RE）
 *   · disposed_gap_ratio  = disposed / gap_sentences（gap_sentences = 0 记 null，不记 1 —— 没缺口不等于处置了缺口）
 *
 * 用法：
 *   node eval/analyze-l7d.mjs --dir eval/out/l7d/rollout --out eval/out/l7d/diagnostics.json
 *   node eval/analyze-l7d.mjs --dir eval/out/l7c/rollout --out /tmp/l7c-d3.json   # 仪器校验：D3 能不能区分臂
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// 相对路径按**包根**解析（脚本在 eval/ 下，而数据在 eval/out/ 下）
const PKG = resolve(HERE, '..')

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const DIR = resolve(PKG, arg('dir', 'eval/out/l7d/rollout'))
const OUT = arg('out', null)

// ---- 词表（与 analyze-l7c.mjs 逐字一致的三项；新增一项）----
const HEDGE_NARROW = ['待标定', '重新标定', '临时默认值', '标定前', '待实测标定', '未标定', '待校准', '重新校准']
const HEDGE_WIDE = [...HEDGE_NARROW, '待人工', '转人工', '待确认', '需确认', '待补']
const UNIT_RE = /\d+(?:\.\d+)?\s*(?:%|％|倍|天|小时|分钟|秒|日|周|月|年|个|条|款|元|美元|万|亿|次|人|分|星|折|国|SKU|pp|‰)/g
const ABSTAIN_RE = /暂无|未定名|未定名前|不作本业务取值|不采用|不引用|只出诊断|不产|不得据此|不进入|待补|不套用/g
const FORMULA_KEYS = ['账单', '完成任务数', '重跑率', '新鲜度', '指纹', '并发', '限额']
// D3 新增：缺口句的词表比 ABSTAIN 宽一档 —— 加上「不可得 / 需授权 / 未定名 / 缺」这类缺口陈述
const GAP_RE = /暂无|未定名|不可得|需授权|拿不到|取不到|尚未|待补|缺(?:失|口|少)|不产|只出诊断|不进入|不作本业务取值/g
// 替换条件词：写清「那先用什么 / 什么时候换掉」
const DISPOSAL_RE = /替换|失效|改用|顶替|代为|先行|暂按|暂用|退出|生效条件|到位后|上线后/g

const hits = (text, words) => words.filter((w) => text.includes(w))

function sentencesOf(text) {
  return text
    .split(/[。；！？\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
}

function d3(text) {
  const sents = sentencesOf(text)
  const gap = sents.filter((s) => {
    GAP_RE.lastIndex = 0
    return GAP_RE.test(s)
  })
  const disposed = gap.filter((s) => {
    UNIT_RE.lastIndex = 0
    DISPOSAL_RE.lastIndex = 0
    return UNIT_RE.test(s) || DISPOSAL_RE.test(s)
  })
  return { gap: gap.length, disposed: disposed.length, ratio: gap.length ? disposed.length / gap.length : null }
}

const FNAME_RE = /^([A-Z0-9]+-\d{3})-(train|holdout)-([a-z0-9_]+)\.md$/

const files = readdirSync(DIR).filter((f) => f.endsWith('.md'))
const rows = []
for (const f of files) {
  const m = f.match(FNAME_RE)
  if (!m) continue
  const [, caseId, split, arm] = m
  const text = readFileSync(join(DIR, f), 'utf8')
  const dd = d3(text)
  rows.push({
    file: f, case_id: caseId, split, arm,
    chars: text.length,
    hedge_narrow: hits(text, HEDGE_NARROW),
    hedge_wide: hits(text, HEDGE_WIDE),
    quant: (text.match(UNIT_RE) || []).length,
    abstain: (text.match(ABSTAIN_RE) || []).length,
    formula_uptake: FORMULA_KEYS.some((k) => text.includes(k)),
    meta_talk: /(本资料|该技能|这张卡|技能卡|参考资料|文献)/.test(text),
    gap_sentences: dd.gap, disposed_gap: dd.disposed, disposed_gap_ratio: dd.ratio,
  })
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

const arms = [...new Set(rows.map((r) => r.arm))].sort()
const summary = {}
for (const arm of arms) {
  const rs = rows.filter((r) => r.arm === arm)
  summary[arm] = {
    n: rs.length,
    hedge_narrow_files: rs.filter((r) => r.hedge_narrow.length).length,
    hedge_wide_files: rs.filter((r) => r.hedge_wide.length).length,
    meta_talk_files: rs.filter((r) => r.meta_talk).length,
    chars_median: median(rs.map((r) => r.chars)),
    quant_median: median(rs.map((r) => r.quant)),
    abstain_median: median(rs.map((r) => r.abstain)),
    formula_uptake_files: rs.filter((r) => r.formula_uptake).length,
    gap_sentences_median: median(rs.map((r) => r.gap_sentences)),
    disposed_gap_ratio_mean: mean(rs.map((r) => r.disposed_gap_ratio)),
    disposed_gap_ratio_median: median(rs.map((r) => r.disposed_gap_ratio)),
  }
}

if (!rows.length) {
  console.error(`❌ ${DIR} 下没有匹配 <CASE>-<split>-<arm>.md 的文件 —— 「没东西可查」不等于「查过了没问题」`)
  process.exit(2)
}

console.log(`目录 ${DIR} · ${rows.length} 份`)
console.log('臂         n  中位量化  中位弃权  对冲(窄)  缺口句中位  处置率均值  采用契约算式')
for (const arm of arms) {
  const s = summary[arm]
  console.log(`${arm.padEnd(9)} ${String(s.n).padStart(2)}  ${String(s.quant_median).padStart(7)}  ` +
    `${String(s.abstain_median).padStart(7)}  ${String(s.hedge_narrow_files).padStart(7)}  ` +
    `${String(s.gap_sentences_median).padStart(10)}  ${String(s.disposed_gap_ratio_mean === null ? '—' : s.disposed_gap_ratio_mean.toFixed(3)).padStart(10)}  ` +
    `${String(s.formula_uptake_files).padStart(7)}/${s.n}`)
}

const payload = {
  meta: {
    what: '契约层实测的确定性诊断（无模型调用）',
    dir: DIR,
    hedge_narrow: HEDGE_NARROW,
    hedge_wide: HEDGE_WIDE,
    abstain_regex: String(ABSTAIN_RE),
    gap_regex: String(GAP_RE),
    disposal_regex: String(DISPOSAL_RE),
    unit_regex: String(UNIT_RE),
    formula_keys: FORMULA_KEYS,
    d3_rule: '缺口句内同时出现 数字+单位 或 替换条件词 ⇒ 记已处置；gap_sentences=0 时 ratio=null（不记 1）',
  },
  summary,
  rows,
}
if (OUT) {
  const out = resolve(PKG, OUT)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(payload, null, 2) + '\n')
  console.log(`→ ${out}`)
}
