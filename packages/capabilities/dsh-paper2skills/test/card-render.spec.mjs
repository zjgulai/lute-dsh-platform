/**
 * lib/card-render.js 的判据。
 *
 * 核心一条：**短 ≠ 占位**。`isPlaceholder()` 里曾有一条 `if (t.length < 40) return true`，
 * 于是论文出处（arXiv ID 10–30 字）、ROI 数字（`1-5 万元`）、算法名（29 字）全被判成占位，
 * 全库 1,440 处真内容被替换成同一句假话。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isPlaceholder,
  fenceCode,
  renderCodeSection,
  renderNoCodeNote,
  renderPaperSource,
  PLACEHOLDER_NOTES,
  PLACEHOLDER_NOTE_FALLBACK,
  CODE_META_LINES,
  CODE_SOURCE_CAP_LINES,
} from '../lib/card-render.js'

/**
 * `renderPaperSource` 的返回是 `string|null`（null = 交回调用方按原正文渲染）。
 * 下面这些用例断言的是「渲染出来了、且写对了」，所以取不到就该当场判失败 ——
 * 直接 `assert.match(s, …)` 在 `s` 为 null 时既过不了类型检查，也说不清是哪种失败。
 * @param {Parameters<typeof renderPaperSource>[0]} e
 * @returns {string}
 */
function mustSource(e) {
  const s = renderPaperSource(e)
  assert.ok(s, `本该给出出处渲染，却返回了 null（grade=${JSON.stringify(e && e.grade)}）`)
  return s
}

test('isPlaceholder：短的真内容一律不是占位（回归：<40 字规则）', () => {
  const real = [
    '2406.12089', // 论文出处，10 字 —— 被误清的 1,041 处就是这个形状
    '2502.12110',
    '1-5 万元', // ROI，被误清的 171 处
    '75%',
    '3D 装箱问题（Bin Packing Problem）：', // 算法名，被误清的 168 处
    '增长经理面临实验结论看不懂——AB解读将误判率从30%降至8%', // 被误清的 60 处
    'a', // 极端短
  ]
  for (const t of real) {
    assert.equal(isPlaceholder(t), false, `被误判为占位：${JSON.stringify(t)}`)
  }
})

test('isPlaceholder：只有「拼法」命中才算占位', () => {
  for (const t of [
    '请查看原始代码模板获取输入规格。', // 16 字，真占位串
    '请查看原始代码模板获取输出规格。',
    '请查看原始 Skill 卡片获取完整代码。',
    '未自动抽取；请查看原始 Skill 卡片。',
    '未抽取。',
  ]) {
    assert.equal(isPlaceholder(t), true, `漏判占位：${JSON.stringify(t)}`)
  }
})

test('isPlaceholder：空与纯空白算占位（调用方本已提前 return，这里锁住语义）', () => {
  assert.equal(isPlaceholder(''), true)
  assert.equal(isPlaceholder('   \n  '), true)
  assert.equal(isPlaceholder(null), true)
  assert.equal(isPlaceholder(undefined), true)
})

test('占位说明：④⑤ 指向「输入 / 输出契约」，其余段落不许指向它', () => {
  assert.match(PLACEHOLDER_NOTES['4. 输入数据要求'], /输入 \/ 输出契约/)
  assert.match(PLACEHOLDER_NOTES['5. 输出结果'], /输入 \/ 输出契约/)
  // 论文出处与输入输出契约毫无关系 —— 这句曾经在 432 处是错的
  assert.doesNotMatch(PLACEHOLDER_NOTES['8. 论文来源'], /输入 \/ 输出契约/)
  assert.doesNotMatch(PLACEHOLDER_NOTES['6. 业务价值 / ROI'], /输入 \/ 输出契约/)
  assert.doesNotMatch(PLACEHOLDER_NOTE_FALLBACK, /输入 \/ 输出契约/)
  assert.ok(PLACEHOLDER_NOTES['8. 论文来源'].includes('未记录论文出处'))
})

test('fenceCode：代码正文逐字节不变，且非 Python 退化成 text（不假装是 Python）', () => {
  const code = 'import numpy as np\n\n\n@dataclass\nclass Item:\n    item_id: str'
  const out = fenceCode(code, 'python')
  assert.ok(out.startsWith('```python\n'))
  assert.ok(out.endsWith('\n```'))
  const inner = out.slice('```python\n'.length, -'\n```'.length)
  assert.equal(inner, code, '围栏内必须逐字节等于原文')
  assert.ok(inner.includes('\n    item_id: str'), '围栏内必须保留 4 空格缩进')

  assert.ok(fenceCode('key: value', 'yaml').startsWith('```text\n'))
  assert.ok(fenceCode('cd x', 'code').startsWith('```text\n'))
  assert.ok(fenceCode('x = 1', 'PYTHON').startsWith('```python\n'))
})

// —— ⑦ 段口径 ——（回归：卡面曾经原样转发源站自述「代码模板 / N 行 · 可运行复制」，
// 把顶在上限的节选说成完整实现、把截断文本说成可运行代码）

const CAP_AVAIL = {
  declared_lines: 60, lines: 59, capped: true, parses: false,
  syntax_error: '第 58 行：unexpected EOF while parsing',
  declared_blocks: 3, path: 'paper2skills-code/logistics/x', path_claimed: true, lang: 'python',
}
const codeBody = (code) =>
  `代码块数量：3 · 路径：paper2skills-code/logistics/x\n\n Python60 行 · 可运行复制\n${code}`

test('renderCodeSection：顶到上限 + 语法不完整时，两件事都要说出口', () => {
  const out = renderCodeSection(CAP_AVAIL, codeBody('class Item:\n    x = 1'))
  assert.match(out, /预览节选，不是完整实现/)
  assert.match(out, new RegExp(`已顶到上限`))
  assert.match(out, new RegExp(String(CODE_SOURCE_CAP_LINES)))
  assert.match(out, /不能直接运行/)
  assert.match(out, /unexpected EOF/)
  // 源站那句「可运行复制」不许出现在卡面上 —— 它正是被证伪的自述
  assert.doesNotMatch(out, /可运行复制/)
})

test('renderCodeSection：未顶上限且可解析时，不许把话说满', () => {
  const out = renderCodeSection(
    { declared_lines: 34, lines: 34, capped: false, parses: true, syntax_error: null,
      declared_blocks: 1, path: null, path_claimed: false, lang: 'python' },
    `代码块数量：1 · 路径：未检测到\n\n Python34 行 · 可运行复制\nx = 1`,
  )
  assert.match(out, /未到上限/)
  assert.match(out, /语法完整/)
  assert.match(out, /未必可独立运行/)
  assert.doesNotMatch(out, /不能直接运行/)
})

test('renderCodeSection：代码位置是转述，且必须点明那棵树不在本包内', () => {
  const out = renderCodeSection(CAP_AVAIL, codeBody('x = 1'))
  assert.match(out, /paper2skills-code\/logistics\/x/)
  assert.match(out, /该代码树不在本包内/)
  assert.match(out, /仅转述源站记录/)
})

test('renderCodeSection：源站写「未检测到」就说没记录位置，不编一个出来', () => {
  const out = renderCodeSection(
    { declared_lines: 20, lines: 20, capped: false, parses: true, syntax_error: null,
      declared_blocks: 2, path: null, path_claimed: false, lang: 'python' },
    `代码块数量：2 · 路径：未检测到\n\n Python20 行 · 可运行复制\nx = 1`,
  )
  assert.match(out, /未记录代码位置/)
  assert.doesNotMatch(out, /paper2skills-code/)
})

test('renderCodeSection：非 Python 片段不做语法断言', () => {
  const out = renderCodeSection(
    { declared_lines: 2, lines: 2, capped: false, parses: null, syntax_error: null,
      declared_blocks: 6, path: 'paper2skills-code/mas/x', path_claimed: true, lang: 'code' },
    `代码块数量：6 · 路径：paper2skills-code/mas/x\n\n Code2 行 · 可运行复制\ncd paper2skills-code/mas/x`,
  )
  assert.match(out, /非 Python 片段/)
  assert.match(out, /不对其做语法断言/)
  assert.ok(out.includes('```text\n'), '非 Python 代码要用 text 围栏')
})

test('renderCodeSection：卡页没抽到代码时不编围栏，占位说明照旧', () => {
  const noCode = '代码块数量：0 · 路径：未检测到\n\n 请查看原始 Skill 卡片获取完整代码。'
  const out = renderCodeSection(
    { declared_lines: null, lines: 0, capped: false, parses: null, syntax_error: null,
      declared_blocks: 0, path: null, path_claimed: false, lang: null },
    noCode,
  )
  assert.equal(out, PLACEHOLDER_NOTES['7. 代码模板'])
  assert.ok(!out.includes('```'))
  assert.equal(renderCodeSection(undefined, noCode), PLACEHOLDER_NOTES['7. 代码模板'])
})

test('renderNoCodeNote：有路径时把「树不在本包内」一并说清，而不是只说没附代码', () => {
  const s = renderNoCodeNote({
    declared_lines: null, lines: 0, declared_blocks: 0,
    path: 'paper2skills-code/ab_testing/x', path_claimed: true,
  })
  assert.match(s, /未附代码/)
  assert.match(s, /paper2skills-code\/ab_testing\/x/)
  assert.match(s, /该代码树不在本包内/)
})

test('renderCodeSection：元数据占位那三行是硬约定，行数不够时按无代码处理', () => {
  const short = [...Array(CODE_META_LINES)].join('\n')
  assert.equal(renderCodeSection(undefined, short), PLACEHOLDER_NOTES['7. 代码模板'])
})

test('renderPaperSource：NO_ID 交回调用方，不擅自编出处', () => {
  assert.equal(renderPaperSource(null), null)
  assert.equal(renderPaperSource({ grade: 'NO_ID' }), null)
})

test('renderPaperSource：已核验给出号 + 论文标题', () => {
  const s = mustSource({
    grade: 'VERIFIED', flags: [], arxiv: '2502.12110',
    paper: 'A-MEM: Agentic Memory for LLM Agents',
  })
  assert.match(s, /已核验/)
  assert.match(s, /arXiv:2502\.12110/)
  assert.match(s, /A-MEM: Agentic Memory for LLM Agents/)
})

test('renderPaperSource：错配的号必须点明它其实指向哪篇，并判为无论文来源', () => {
  const s = mustSource({
    grade: 'MISMATCH', flags: [], arxiv: '2406.12089',
    paper: 'Many-Body Quantum Geometric Dipole',
  })
  assert.match(s, /不可采信/)
  assert.match(s, /2406\.12089/)
  assert.match(s, /Many-Body Quantum Geometric Dipole/)
  assert.match(s, /本卡视为无论文来源/)
  assert.match(s, /不要引用上面这个号/)
})

test('renderPaperSource：UNDECIDABLE 不做断言（宁可说判不了，也不硬判）', () => {
  const s = mustSource({
    grade: 'UNDECIDABLE', flags: [], arxiv: '1305.2828', n_tokens: 1,
  })
  assert.match(s, /待人工判定/)
  assert.match(s, /不做断言/)
  assert.doesNotMatch(s, /视为无论文来源/) // 判不了 ≠ 判为假
})

test('renderPaperSource：共用号与「点名另一篇」两个旗标都要显形', () => {
  const s = mustSource({
    grade: 'MISMATCH', flags: ['shared_by_19', 'id_vs_named_conflict'],
    arxiv: '2305.12345', paper: 'Overspinning a rotating black hole',
    named: 'Dark Patterns in AIPowered Consumer Platforms',
  })
  assert.match(s, /被 19 张卡共用/)
  assert.match(s, /Dark Patterns in AIPowered Consumer Platforms/)
})

test('renderPaperSource：查无此号如实说查无，不假装有出处', () => {
  const s = mustSource({ grade: 'NOT_FOUND', flags: ['not_found'], arxiv: '1969.0001' })
  assert.match(s, /查无此号/)
  assert.match(s, /本卡视为无论文来源/)
})

// ────────────────────────────────────────────────────────────────
// 第六轮：完整实现可得之后的 ⑦ 段口径
//
// 上一轮这里写着「**完整实现不在本包内**」——那句已随恢复管线作废。
// 下面几条钉住新口径，且钉住「不得退回旧说法」。
// ────────────────────────────────────────────────────────────────

/** 造一段形如卡页 ⑦ 段的原文：3 行头 + 正文。 */
const sec = (code, declared = 60) =>
  [`代码块数量：1 · 路径：paper2skills-code/x/y`, '', `Python${declared} 行 · 可运行复制`, code].join('\n')

const AVAIL = {
  declared_lines: 60, lines: 3, capped: true, parses: false,
  syntax_error: '第 60 行：unexpected EOF while parsing',
  declared_blocks: 1, path: 'paper2skills-code/x/y', path_claimed: true, lang: 'python',
}

test('⑦ 段：完整实现可得时，不再说「不是完整实现」', () => {
  const s = renderCodeSection(AVAIL, sec('import numpy as np\nx = 1\ny = 2'), CODE_SOURCE_CAP_LINES, {
    tier: 'oracle', lines: 214, cross_check: 'prefix@1', parses: true,
    vault_path: 'paper2skills-vault/18-物流履约/Skill-3D-Bin-Packing-Optimization.md',
  })
  assert.match(s, /references\/implementation\.py/)
  assert.match(s, /214 行/)
  assert.doesNotMatch(s, /不是完整实现/, '旧说法必须消失')
  assert.doesNotMatch(s, /完整实现不在本包内/, '旧说法必须消失')
})

test('⑦ 段：截断的是节选不是实现——两者必须分开说', () => {
  const s = renderCodeSection(AVAIL, sec('import numpy as np\nx = 1'), CODE_SOURCE_CAP_LINES, {
    tier: 'oracle', lines: 300, parses: true,
  })
  assert.match(s, /该\*\*节选\*\*在断点处被截断/)
  assert.match(s, /完整实现\*\*没有这个问题\*\*/)
})

test('⑦ 段：完整实现自己也解析不了时，不许说它没问题', () => {
  const s = renderCodeSection(AVAIL, sec('import numpy as np\nx = 1'), CODE_SOURCE_CAP_LINES, {
    tier: 'oracle', lines: 300, parses: false,
  })
  assert.match(s, /同样未能通过 `ast\.parse`/)
})

test('⑦ 段：无 oracle 的卡必须点明「未经交叉核对」', () => {
  const s = renderCodeSection(AVAIL, sec('x = 1'), CODE_SOURCE_CAP_LINES, {
    tier: 'unverified', lines: 226,
  })
  assert.match(s, /未经交叉核对/)
  assert.match(s, /卡面无节选/)
})

test('⑦ 段：未恢复时退回旧说法（那时它是对的）', () => {
  const s = renderCodeSection(AVAIL, sec('x = 1'), CODE_SOURCE_CAP_LINES, {
    tier: 'unrecovered', lines: 0, reason: 'NO_FENCE_IN_VAULT',
  })
  assert.match(s, /不是完整实现/)
  assert.doesNotMatch(s, /implementation\.py/)
})

test('⑦ 段：不给 recovery 参数时行为与上一轮一致（向后兼容）', () => {
  const s = renderCodeSection(AVAIL, sec('x = 1'))
  assert.match(s, /不是完整实现/)
})

test('renderNoCodeNote：卡面无代码但已恢复时，如实说清来源与核对状态', () => {
  const s = renderNoCodeNote({ path_claimed: false }, {
    tier: 'unverified', lines: 226,
  })
  assert.match(s, /implementation\.py/)
  assert.match(s, /226 行/)
  assert.match(s, /未经交叉核对/)
})

test('renderNoCodeNote：未恢复时退回原话', () => {
  const s = renderNoCodeNote({ path_claimed: true, path: 'a/b', declared_blocks: 2 }, { tier: 'unrecovered' })
  assert.match(s, /该代码树不在本包内/)
  assert.doesNotMatch(s, /implementation\.py/)
})
