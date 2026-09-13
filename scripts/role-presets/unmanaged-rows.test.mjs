import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unmanagedRowBlocks, reinstateRows } from './unmanaged-rows.mjs'

/**
 * 「生成器不拥有的行，不许删」——这一组锁的是一次真实的数据丢失事故。
 *
 * 2026-09-13 实测：`agt-033` 里按 ADR-0061 手插了一行 `product-kol-hunter`（本机装配，
 * 不进仓库出货物）。`generate.mjs` **整文件重写** `agent.cordis.yml`，那一行被静默删掉，
 * 页面上表现为「产品卡点了打不开」。文件里其实有一句注释预告了这件事
 * （「运行 generate.mjs 会重写本文件，届时需重新插入本行」）—— **写了警告不等于有了判据**。
 */

const STD = [
  '- id: persona',
  "  name: '@deepseek-ai/dsh-persona'",
  '- id: tool-skill',
  "  name: '@deepseek-ai/dsh-tool-skill'",
  '- id: skill-subset',
  "  name: 'dsh-skill-subset'",
  '  config:',
  '    skills: [\'p2s-a\']',
  '',
].join('\n')

test('unmanagedRowBlocks：识别出手插行，并把它的前驱行 id 一并带出（供插回原位）', () => {
  const existing = `${STD}
# 本机装配：深链星探 KOL Hunter（ADR-0061）
# 这条只在本机 profile 生效，不进仓库出货物。
- id: product-kol-hunter
  name: 'dsh-kol-hunter-local'

- id: another-hand-row
  name: 'x'
`
  const blocks = unmanagedRowBlocks(existing, new Set(['persona', 'tool-skill', 'skill-subset']))
  assert.deepEqual(blocks.map((b) => b.id), ['product-kol-hunter', 'another-hand-row'])
  assert.equal(blocks[0].afterId, 'skill-subset', '前驱行必须是生成器认得的那一行（决定插回位置）')
  assert.equal(blocks[1].afterId, 'product-kol-hunter')
  assert.ok(blocks[0].lines.join('\n').includes('KOL Hunter（ADR-0061）'), '紧邻上方的注释属于这一块，不许丢')
})

test('unmanagedRowBlocks：生成器自己产出的行一律不算「手插」', () => {
  const blocks = unmanagedRowBlocks(STD, new Set(['persona', 'tool-skill', 'skill-subset']))
  assert.deepEqual(blocks, [])
})

test('unmanagedRowBlocks：空文件 / 没有 frontmatter 的行不炸', () => {
  assert.deepEqual(unmanagedRowBlocks('', new Set()), [])
  assert.deepEqual(unmanagedRowBlocks('name: x\n', new Set()), [])
})

test('reinstateRows：插回**原位**（紧跟前驱行之后），不是追加到文件尾', () => {
  const existing = `${STD}
# 本机装配注释
- id: product-kol-hunter
  name: 'dsh-kol-hunter-local'
`
  const fresh = `${STD}- id: product-paper2skills
  name: 'dsh-paper2skills'
`
  const carried = unmanagedRowBlocks(existing, new Set(['persona', 'tool-skill', 'skill-subset', 'product-paper2skills']))
  const { text, repositioned, appended } = reinstateRows(fresh, carried)
  assert.deepEqual(repositioned, ['product-kol-hunter'])
  assert.deepEqual(appended, [])
  const lines = text.split('\n')
  // 位置判据：手插行必须紧跟在 skill-subset 行块之后，且在生成器产出的 product-paper2skills 之前
  const iSub = lines.findIndex((l) => l === '- id: skill-subset')
  const iKol = lines.findIndex((l) => l === '- id: product-kol-hunter')
  const iP2s = lines.findIndex((l) => l === '- id: product-paper2skills')
  assert.ok(iSub >= 0 && iKol > iSub, '手插行在 skill-subset 之后')
  assert.ok(iP2s >= 0 && iKol < iP2s, '手插行必须仍在生成器产出行之前（挂载次序敏感）')
})

test('reinstateRows：前驱行本轮不存在 ⇒ 追加到末尾，且**必须报出来**（位置丢了也要可见）', () => {
  // 前驱是**生成器拥有的行**（`product-a` 在 managedIds 里，故不会被带过），
  // 而本轮生成不再产出它 ⇒ 手插行找不到自己的位置，只能落到末尾。
  const existing = `- id: product-a
- id: product-kol-hunter
  name: 'dsh-kol-hunter-local'
`
  const fresh = `${STD}`
  const managed = new Set(['persona', 'tool-skill', 'skill-subset', 'product-a'])
  const carried = unmanagedRowBlocks(existing, managed)
  assert.deepEqual(carried.map((b) => b.id), ['product-kol-hunter'], 'product-a 是生成器拥有的行，不算手插')
  const { repositioned, appended, text } = reinstateRows(fresh, carried)
  assert.deepEqual(repositioned, [])
  assert.ok(appended.includes('product-kol-hunter'), '位置退化必须被点名，不许静默')
  assert.ok(text.includes('product-kol-hunter'), '但行本身不许丢')
})

test('reinstateRows：手插行串成链时，后一条仍能跟住被插回原位的前一条', () => {
  const existing = `${STD}- id: hand-a
- id: hand-b
`
  const carried = unmanagedRowBlocks(existing, new Set(['persona', 'tool-skill', 'skill-subset']))
  assert.deepEqual(carried.map((b) => b.id), ['hand-a', 'hand-b'])
  const { repositioned, appended, text } = reinstateRows(STD, carried)
  assert.deepEqual(appended, [], '第二条的前驱（hand-a）被插回后就存在了，不该退化')
  assert.deepEqual(repositioned, ['hand-a', 'hand-b'])
  assert.ok(text.indexOf('- id: hand-a') < text.indexOf('- id: hand-b'), '相对次序必须保持')
})

test('reinstateRows：反复重生成是**幂等**的（不会每次多长一个空行）', () => {
  const existing = `${STD}
# 注释
- id: product-kol-hunter
  name: 'dsh-kol-hunter-local'
`
  const managed = new Set(['persona', 'tool-skill', 'skill-subset'])
  const once = reinstateRows(STD, unmanagedRowBlocks(existing, managed)).text
  const twice = reinstateRows(STD, unmanagedRowBlocks(once, managed)).text
  assert.equal(twice, once, '第二轮的产出必须与第一轮逐字节相同')
})

test('reinstateRows：没有任何手插行时，产出与输入逐字节相同（不引入无关改动）', () => {
  const { text, repositioned, appended } = reinstateRows(STD, [])
  assert.equal(text, STD)
  assert.deepEqual(repositioned, [])
  assert.deepEqual(appended, [])
})
