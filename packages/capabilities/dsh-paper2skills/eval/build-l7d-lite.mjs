#!/usr/bin/env node
/**
 * F7 · `lite` 臂的材料构造（确定性，不调模型）
 *
 * 为什么要有这一臂 —— F6 → F7 两轮负结果留下的唯一未分离变量：
 *   v1（只有禁令）量化判据中位 3、v2（禁令+义务）6.5，而单卡臂 17、对照 12。
 *   两次都把「12–14 KB 的治理文档塞进上下文」和「文档里写的是禁令还是义务」混在一起测了。
 *   于是剩下一个必须回答、且直接决定 S1 形态的问题：
 *
 *     **是契约的内容在压制判断，还是「把一份契约塞进上下文」这件事本身在压制判断？**
 *
 * 分离办法：`lite` 臂只喂**取值**——从 v2 契约里逐字抽出 §1（可达部分：算式与取值）
 * 与 §5（数据要求五维三列），丢掉 §2 不可达、§3 外部证据、§4 冻结、§6 FLOW 与读者说明。
 * 即「有取值、没有禁令、没有治理」。抽取是**机械**的：同样的小节切分、同样的重新编号，
 * 不由人挑段落（挑段落 = 用测试集调参）。
 *
 * 事前判据（写在本文件里，跑批前定稿）：
 *   L1  quant 中位数(lite) ≥ 0.8 × quant 中位数(treat)   —— 「有取值就够了」成立
 *   L2  quant 中位数(lite) > quant 中位数(v2)             —— 至少比整份文档好
 *   L3  Δ(lite − treat) 的 95% 区间下界 ≥ −0.7（盲配对，8 对）
 *   若 L1 不成立 ⇒ **契约不能作为提示词载荷**，S1 的形态必须改（转闸门/人工标定物）。
 *
 * ⚠️ 留出性代价（必须写明）：本臂与前两臂共用同 4 张卡、同 8 道题。
 *    它是在**已用过的用例集**上做的机制探针，不是新的泛化验证。
 *    若 L1/L3 成立，S1 依赖它之前必须换新卡复测。
 *
 * 用法：node eval/build-l7d-lite.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EVAL_OUT } from './lib/load.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = resolve(HERE, '..')
const L7D = join(EVAL_OUT, 'l7d')
const LITE = join(L7D, 'lite')

/** 按 `## N 标题` 切小节（与 check_contracts.py 的 Contract._split_sections 同规则） */
function sections(text) {
  const out = {}
  let cur = null
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^#{2,3}\s*(\d)\s*(.*)$/)
    if (m && '123456'.includes(m[1])) { cur = Number(m[1]); out[cur] = { title: m[2], lines: [] }; continue }
    if (cur !== null) out[cur].lines.push(line)
  }
  return out
}

const cases = JSON.parse(readFileSync(join(L7D, 'cases.json'), 'utf8')).cases

rmSync(LITE, { recursive: true, force: true })
mkdirSync(LITE, { recursive: true })

const built = []
for (const c of cases) {
  const src = readFileSync(c.contract_v2_path, 'utf8')
  const sec = sections(src)
  const idLine = src.match(/^contract_id:\s*(\S+)/m)?.[1] ?? 'CTR-?'
  const resp = src.match(/^responsibility:\s*(\S+)/m)?.[1] ?? '?'
  if (!sec[1] || !sec[5]) throw new Error(`${idLine}: 抽不到 §1 或 §5 —— 抽取规则与契约形态不符，修规则不要放宽`)

  // 机械抽取：只保留 §1 与 §5，正文逐字，重新编号为 1 / 2
  const body = [
    `# ${resp} · 标定取值（lite 版：只有取值，没有禁令与治理）`,
    '',
    '## 1 可达部分（算式与取值）',
    ...sec[1].lines.map((l) => l.replace(/^\s*<!--.*?-->\s*$/, '')),
    '',
    '## 2 数据要求（五维 · 三列）',
    ...sec[5].lines,
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'

  const file = join(LITE, `${idLine}-${resp}.md`)
  writeFileSync(file, body)
  built.push({
    case_id: c.case_id, contract_id: idLine, responsibility: resp,
    src: c.contract_v2_path, src_bytes: Buffer.byteLength(src), lite_bytes: Buffer.byteLength(body),
    lite_path: file,
  })
}

const crit = {
  what: '`lite` 臂的事前判据与留出性代价（跑批前定稿）',
  hypothesis: '分离「契约内容在压制判断」与「把契约塞进上下文这件事本身在压制判断」',
  manipulation: '只保留 v2 契约的 §1（算式与取值）与 §5（数据要求五维），机械抽取、逐字保留、丢掉其余四节',
  criteria: [
    { id: 'L1', text: 'quant 中位数(lite) ≥ 0.8 × quant 中位数(treat)' },
    { id: 'L2', text: 'quant 中位数(lite) > quant 中位数(v2)' },
    { id: 'L3', text: 'Δ(lite − treat) 的 95% 区间下界 ≥ −0.7（盲配对，8 对）' },
  ],
  reading: {
    'L1 成立': '契约可以继续做提示词载荷，但**必须是只带取值的短件**；S1 按 lite 形态写',
    'L1 不成立': '契约不能作为提示词载荷 —— 它应转为闸门/人工标定物（S12 的消费口条件），S1 的 139 份按「给人看与给闸门用」重定义',
  },
  holdout_cost: '本臂与前两臂共用同 4 张卡、同 8 道题 ⇒ 这是**已用过的用例集**上的机制探针，不是新的泛化验证；若成立，S1 依赖它之前必须换新卡复测',
}
writeFileSync(join(L7D, 'lite.criteria.json'), JSON.stringify({ ...crit, built }, null, 2) + '\n')

console.log('lite 材料（只含 §1 取值 + §5 五维）')
for (const b of built) {
  console.log(`  ${b.case_id} ${b.contract_id.padEnd(12)} ${String(b.src_bytes).padStart(6)} B → ${String(b.lite_bytes).padStart(5)} B  (${(b.lite_bytes / b.src_bytes * 100).toFixed(0)}%)`)
}
console.log('→ eval/out/l7d/lite/ + lite.criteria.json')
