/**
 * `data/code-availability.json` 的判据。
 *
 * 这张表决定 ⑦ 段卡面怎么写，所以它自己必须是对的、且与脚本不漂移。
 * 背景见 ADR-0048：卡页自称「代码模板」，实测是**顶在 60 行上限的预览节选**，
 * 其中近三分之一连 `ast.parse` 都过不了。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const doc = JSON.parse(readFileSync(join(PKG, 'data/code-availability.json'), 'utf8'))
const recs = Object.values(doc.cards)

/**
 * `generated/` 是**派生件、不入库**（.gitignore 挡着），所以新检出里没有 `cards.json`。
 * 用它做对照的用例必须**响亮跳过**，而不是让整个文件在模块加载期 ENOENT 崩掉 ——
 * 那种崩法在全新检出里表现为「这个 spec 的每条断言都没跑」，却只报一句 ENOENT。
 */
const CARDS_PATH = join(PKG, 'generated/cards.json')
const cardsSkip = existsSync(CARDS_PATH)
  ? false
  : '缺 generated/cards.json（派生件不入库）——先跑 npm run extract:cards'

test('可得性表与编译脚本一致（改了判据或卡数据必须重跑 --check）', { skip: cardsSkip }, () => {
  const out = execFileSync('python3', [join(PKG, 'scripts/build-code-availability.py'), '--check'], {
    encoding: 'utf8',
  })
  assert.match(out, /✓ 代码节选可得性表一致/)
})

test('每张卡都有记录 —— 少一张就装配不了，必须响亮失败而不是静默跳过', { skip: cardsSkip }, () => {
  const cards = JSON.parse(readFileSync(CARDS_PATH, 'utf8')).cards
  const missing = cards.filter((c) => !doc.cards[c.id]).map((c) => c.id)
  assert.deepEqual(missing, [], `缺 ${missing.length} 张卡的可得性记录`)
  assert.equal(Object.keys(doc.cards).length, cards.length)
})

test('stats 与逐卡记录一致（报告数字不许是另一套口径算出来的）', () => {
  const s = doc.stats
  assert.equal(s.cards, recs.length)
  assert.equal(s.with_code, recs.filter((r) => r.lines > 0).length)
  assert.equal(s.capped, recs.filter((r) => r.capped).length)
  assert.equal(s.python, recs.filter((r) => r.lang === 'python').length)
  assert.equal(s.unparseable, recs.filter((r) => r.parses === false).length)
  assert.equal(s.path_claimed, recs.filter((r) => r.path_claimed).length)
})

test('上限是真的：观测到的最大自述行数正好等于上限，且确有卡顶在上面', () => {
  const max = Math.max(...recs.map((r) => r.declared_lines || 0))
  assert.equal(max, doc.source_cap_lines, '源站若改了预览口径，上限常量必须跟着改')
  assert.ok(doc.stats.capped > 0, '一张都没顶到上限 → 上限判据多半失效')
  // capped 与 declared_lines 必须同进同出，不许出现「顶到上限但行数没到」
  for (const r of recs) {
    assert.equal(r.capped, (r.declared_lines || 0) >= doc.source_cap_lines)
  }
})

test('parses 的语义：Python 段必须是 true/false，非 Python 一律 null（不做语法断言）', () => {
  for (const [id, r] of Object.entries(doc.cards)) {
    if (r.lines === 0) {
      assert.equal(r.parses, null, `${id}: 没有代码段，parses 应为 null`)
      continue
    }
    if (r.lang === 'python') {
      assert.ok(r.parses === true || r.parses === false, `${id}: Python 段的 parses 必须是布尔`)
      if (r.parses === false) assert.ok(r.syntax_error, `${id}: 判为不可解析就要给出错在哪`)
      else assert.equal(r.syntax_error, null)
    } else {
      assert.equal(r.parses, null, `${id}: 非 Python 段（${r.lang}）不许做语法断言`)
    }
  }
})

test('路径与代码块数量：声明了就非空，没声明也说得出源站写了什么', () => {
  for (const [id, r] of Object.entries(doc.cards)) {
    if (r.path_claimed) assert.ok(r.path, `${id}: path_claimed 为真却没有 path`)
    if (r.path) assert.ok(r.path_claimed, `${id}: 有 path 却没标 path_claimed`)
    // 卡页写「未检测到」时 path 为 null，但「代码块数量」这类自述仍要留住
    if (!r.path_claimed && r.declared_blocks !== null) {
      assert.match(r.raw_meta, /未检测到|代码块数量/, `${id}: 源站自述原文没留档`)
    }
  }
})

test('源站自述原文逐卡留档 —— 卡面按实测渲染，但审计要能回看源站到底写了什么', () => {
  const withMeta = recs.filter((r) => r.raw_meta)
  assert.ok(withMeta.length > 1200, `留档太少（${withMeta.length}）`)
  for (const r of withMeta) {
    assert.doesNotMatch(r.raw_meta, /\n/, 'raw_meta 只存那一行，不该带换行')
  }
})

test('未顶上限的卡确实存在 —— 若全顶上限，说明这张表只剩一种情况，判据要重看', () => {
  const uncapped = recs.filter((r) => r.lines > 0 && !r.capped)
  assert.ok(uncapped.length > 0)
  // 未到上限的必须说不出「其余代码源站未发布」这种话（渲染层据此分岔）
  assert.ok(uncapped.every((r) => (r.declared_lines || 0) < doc.source_cap_lines))
})
