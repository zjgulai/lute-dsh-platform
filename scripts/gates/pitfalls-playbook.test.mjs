/**
 * `pitfalls-playbook.mjs` 的反向自测。
 *
 * 为什么这些用例必须是「能说**不**」的用例：本项守的是一份**清单的可信度**。
 * 一份只会在正确时判绿的校验，与没有校验的区别只在于它更让人放心——而那正是 P-02
 * 「仪器假绿」的成因。所以每条规则都配一个**坏输入**，并且断言违规文本里**指名道姓**
 * 地说出坏在哪（只说「校验失败」的校验，下次没人知道该改什么）。
 *
 * 最要紧的是最后一条「恒真桩突变」：把每条条目的机制换成一句**永远成立**的免责话
 * （「有门禁守着」），校验必须变红。这是 P-03 的可执行形式——机制必须**有名字**，
 * 否则「已落地机制」这四个字本身就成了一句自我安慰。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPitfallsPlaybook } from './pitfalls-playbook.mjs'

/** 门禁名字的本用例样本（真实注册表由 gate.mjs 在运行时传入）。 */
const GATE_NAMES = ['pitfalls-playbook', 'shell-var-multibyte', 'tcc-dead-grant']

/** 两个必须有入口的文件，正文里含总账链接。 */
const BACKLINKS = {
  'AGENTS.md': '- 复发故障总账见 [docs/pitfalls-playbook.md](docs/pitfalls-playbook.md)。',
  'docs/README.md': '- [pitfalls-playbook.md](pitfalls-playbook.md) 复发故障总账',
}

/** 门禁里真实存在的脚本路径样本。 */
const SCRIPTS = new Set(['packaging/scripts/setup-app-locate-test.sh'])
/** 链接可达性样本：只有这一个文档存在。 */
const DOCS = new Set(['docs/adr/ADR-0001.md', 'docs/pitfalls-playbook.md'])

/**
 * 生成一条结构完整的条目，可按需破坏其中一段。
 * @param {string} id 条目编号
 * @param {Record<string, string>} [overrides] 覆盖字段：title/symptom/cause/mechanism/action
 * @returns {string}
 */
function entry(id, overrides = {}) {
  const fields = {
    title: '示例故障',
    symptom: '现象描述',
    cause: '原因描述',
    mechanism: '`gate:shell-var-multibyte`',
    action: '下一个人该做的事',
    ...overrides,
  }
  const lines = [
    `## ${id} · ${fields.title}`,
    '',
    `- **症状**：${fields.symptom}`,
    `- **根因类**：${fields.cause}`,
    `- **已落地机制**：${fields.mechanism}`,
    `- **下一版默认动作**：${fields.action}`,
    '',
  ]
  return lines.join('\n')
}

/**
 * 跑一次校验，默认输入全部合法。
 * @param {string} playbookText 总账正文
 * @param {Record<string, unknown>} [options] 覆盖默认输入
 * @returns {{passed: boolean, violations: string[]}}
 */
function run(playbookText, options = {}) {
  return checkPitfallsPlaybook({
    playbookText,
    gateNames: GATE_NAMES,
    fileExists: (path) => SCRIPTS.has(path) || DOCS.has(path),
    backlinkTexts: BACKLINKS,
    ...options,
  })
}

/** 断言红，并断言违规文本里出现了预期片段——「红在哪」必须自己说得出来。 */
function assertRed(result, needle) {
  assert.equal(result.passed, false, '本用例要求判红，实际判绿')
  assert.ok(
    result.violations.some((violation) => violation.includes(needle)),
    `违规文本里没有出现「${needle}」，实际为：\n${result.violations.join('\n')}`,
  )
}

test('总账：结构完整、机制真实、编号连续、链接可达时判绿', () => {
  const result = run(
    entry('P-01') + entry('P-02', { mechanism: '`gate:tcc-dead-grant`、`script:packaging/scripts/setup-app-locate-test.sh`' }),
  )
  assert.deepEqual(result.violations, [])
  assert.equal(result.passed, true)
})

test('总账：机制段换行续写不破坏解析（四段常需两行才写得完）', () => {
  const text = `## P-01 · 换行续写

- **症状**：一句话
- **根因类**：一句话
- **已落地机制**：\`gate:tcc-dead-grant\`
  （换行续写的说明，仍在同一段内）
- **下一版默认动作**：一句话
`
  assert.equal(run(text).passed, true)
})

test('总账：缺「根因类」段必须判红，并指名缺的是哪段', () => {
  const text = `## P-01 · 缺一段

- **症状**：一句话
- **已落地机制**：\`gate:tcc-dead-grant\`
- **下一版默认动作**：一句话
`
  assertRed(run(text), '缺「根因类」段')
})

test('总账：某段只有标签没有正文也必须判红', () => {
  const text = `## P-01 · 空段

- **症状**：
- **根因类**：一句话
- **已落地机制**：\`gate:tcc-dead-grant\`
- **下一版默认动作**：一句话
`
  assertRed(run(text), '「症状」段为空')
})

test('总账：点名不存在的门禁必须判红，并报出那个名字', () => {
  assertRed(run(entry('P-01', { mechanism: '`gate:never-existed`' })), 'gate:never-existed')
})

test('总账：点名不存在的脚本必须判红，并报出那个路径', () => {
  assertRed(run(entry('P-01', { mechanism: '`script:packaging/scripts/ghost.sh`' })), 'ghost.sh')
})

test('总账：机制段没有任何具名机制必须判红（「有门禁守着」不算机制）', () => {
  assertRed(run(entry('P-01', { mechanism: '有门禁守着' })), '没有点名任何机制')
})

test('总账：恒真桩突变下必须失效——把每条机制换成永远成立的免责话', () => {
  // 这是本项存在的理由：一份「每条都写了机制、但机制全无名字」的总账，
  // 读起来完全正常，且永远不会与真实注册表对不上。
  const stubbed = entry('P-01', { mechanism: '已有门禁覆盖' }) + entry('P-02', { mechanism: '已在流程中保证' })
  assertRed(run(stubbed), '没有点名任何机制')
})

test('总账：编号跳号必须判红（编号是别处引用的凭据）', () => {
  assertRed(run(entry('P-01') + entry('P-03')), '编号应为 P-02')
})

test('总账：编号重号必须判红', () => {
  assertRed(run(entry('P-01') + entry('P-01')), '编号应为 P-02')
})

test('总账：一条条目都没有时必须判红，而不是「没什么可校验的」判绿', () => {
  assertRed(run('# 复发故障总账\n\n> 引言而已。\n'), '一条条目都没有')
})

test('总账：正文读不到时必须判红（删掉总账不该是绿的）', () => {
  assertRed(run(''), '读不到总账正文')
})

test('总账：相对链接不可达必须判红', () => {
  const text = entry('P-01', { action: '见 [不存在的文档](adr/ADR-9999.md)' })
  assertRed(run(text), 'ADR-9999.md')
})

test('总账：没被 AGENTS.md 回引必须判红（没入口的总账等于不存在）', () => {
  const result = run(entry('P-01'), {
    backlinkTexts: { 'AGENTS.md': '（这里没有链接）', 'docs/README.md': BACKLINKS['docs/README.md'] },
  })
  assertRed(result, 'AGENTS.md')
})

test('总账：没被 docs/README.md 回引必须判红', () => {
  const result = run(entry('P-01'), {
    backlinkTexts: { 'AGENTS.md': BACKLINKS['AGENTS.md'], 'docs/README.md': '（这里没有链接）' },
  })
  assertRed(result, 'docs/README.md')
})
