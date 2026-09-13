/**
 * `docs-links.mjs` 的反向自测。
 *
 * 重点是两类用例，缺一不可：
 * - **能说「不」**：层级写错的链接必须判红，并报出解析后的错误路径（只报「链接不可达」
 *   而不报它被解析成了什么，读的人还得自己算一遍层级——那正是当初写错的那一步）。
 * - **不误报**：代码块里的模板占位符、行内代码里的示例、外链、页内锚点都不该判红。
 *   一项会误报的校验很快会被当成噪声关掉，那比没有校验更坏（P-02 的同族）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDocsLinkIntegrity } from './docs-links.mjs'

/** 存在性样本：只有这两处真实存在。 */
const EXISTING = new Set(['docs/adr/ADR-0067.md', 'docs/notes/implemented/contract/note.md'])

/**
 * 跑一次校验。
 * @param {Array<{path: string, text: string}>} docs 待校验文档
 * @returns {{passed: boolean, violations: string[]}}
 */
function run(docs) {
  return checkDocsLinkIntegrity({ docs, fileExists: (path) => EXISTING.has(path) })
}

/** 断言红，并断言违规文本里出现了预期片段。 */
function assertRed(result, needle) {
  assert.equal(result.passed, false, '本用例要求判红，实际判绿')
  assert.ok(
    result.violations.some((violation) => violation.includes(needle)),
    `违规文本里没有出现「${needle}」，实际为：\n${result.violations.join('\n')}`,
  )
}

test('文档链接：深度正确的相对链接判绿', () => {
  const result = run([
    {
      path: 'docs/notes/implemented/contract/note.md',
      text: '对应 ADR：[ADR-0067](../../../adr/ADR-0067.md)\n',
    },
  ])
  assert.deepEqual(result.violations, [])
  assert.equal(result.passed, true)
})

test('文档链接：层级少写一层的链接必须判红，并报出解析后的错误路径', () => {
  // 2026-09-13 实测的原始形态：Note 住在 docs/notes/<lifecycle>/<class>/ 下，却按两层上溯。
  const result = run([
    {
      path: 'docs/notes/implemented/contract/note.md',
      text: '对应 ADR：[ADR-0067](../../adr/ADR-0067.md)\n',
    },
  ])
  assertRed(result, 'docs/notes/adr/ADR-0067.md')
})

test('文档链接：围栏代码块里的模板占位符不得判红', () => {
  const result = run([
    {
      path: 'docs/adr/README.md',
      text: ['```markdown', '- 决策记录：[Note](../notes/{lifecycle}/{class}/YYYY-MM-DD-topic.md)', '```', ''].join('\n'),
    },
  ])
  assert.equal(result.passed, true)
})

test('文档链接：行内代码里的示例不得判红', () => {
  const result = run([
    {
      path: 'docs/guide.md',
      text: '写法是 `[标题](不存在的路径.md)`，别照抄。\n',
    },
  ])
  assert.equal(result.passed, true)
})

test('文档链接：外链、页内锚点与绝对路径不得判红', () => {
  const result = run([
    {
      path: 'docs/guide.md',
      text: '[官网](https://example.com/a.md) · [本页](#section) · [绝对](/etc/hosts)\n',
    },
  ])
  assert.equal(result.passed, true)
})

test('文档链接：带锚点的相对链接只校验路径部分', () => {
  const result = run([
    {
      path: 'docs/notes/implemented/contract/note.md',
      text: '见 [ADR-0067](../../../adr/ADR-0067.md#决策)\n',
    },
  ])
  assert.equal(result.passed, true)
})

test('文档链接：报错行号指向出问题的那一行，便于直接跳过去', () => {
  const result = run([
    {
      path: 'docs/guide.md',
      text: '第一行没问题\n第二行 [坏链](nope.md)\n第三行没问题\n',
    },
  ])
  assertRed(result, 'docs/guide.md:2:')
})

test('文档链接：恒真桩突变——把所有链接换成必然不可达的路径，必须判红', () => {
  const result = run([
    { path: 'docs/a.md', text: '[x](ghost-1.md)\n[y](ghost-2.md)\n' },
    { path: 'docs/b.md', text: '[z](ghost-3.md)\n' },
  ])
  assert.equal(result.violations.length, 3)
})

test('文档链接：一份文档都没扫到时必须判红（本项唯一的真空绿路径）', () => {
  assertRed(run([]), '未扫到任何文档')
})
