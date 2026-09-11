import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage, rebuildFrontmatter, isValidSkillName, findCatalogInconsistencies } from '../lib/host-util.js'

/**
 * dsh-overseas-skills — Host 侧契约测试。
 *
 * 公开 seam：宿主插件在**外部边界**上的纯函数。
 * 其中 `rebuildFrontmatter` 是风险最高的一处——它直接重写用户 ~/.dsh/skills 下
 * 的真实 SKILL.md，写坏了就是用户资产损坏，因此在抽取时必须先有契约测试。
 *
 * 覆盖动机（每项对应一次真实的类型/契约缺口）：
 *  - errorMessage：`catch (e)` 的 e 在 checkJs 下为未知类型，7 处直接读 `e?.message`
 *  - rebuildFrontmatter：开关重写 frontmatter，此前内联在 handleToggle 里不可独立验证
 *  - isValidSkillName：名称直接参与路径拼接，必须拒绝任何可能逃出 skills 目录的输入
 *  - findCatalogInconsistencies：catalog.js 是快照，需可机器校验内部一致性
 */

const FRONTMATTER = '---\nname: demo-skill\ndescription: "示例"\ncategory: a-market\n---\n\n# 正文\n\n内容不应被改动。\n'

/**
 * 断言重写成功并收窄类型（rebuildFrontmatter 在没有 frontmatter 时返回 null）。
 * 断言失败即抛错，因此返回的字符串在后续断言中可安全当作 string 使用。
 * @param {string} text 原始文件文本
 * @param {boolean} enabled 目标开关状态
 * @returns {string} 重写后的文本
 */
function rewrite(text, enabled) {
  const next = rebuildFrontmatter(text, enabled)
  assert.notEqual(next, null, '期望重写成功，实际得到 null（输入：' + JSON.stringify(text.slice(0, 40)) + '）')
  return /** @type {string} */ (next)
}

test('errorMessage：Error 取 message，字符串取自身，其余走兜底且绝不为 undefined', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom')
  assert.equal(errorMessage('boom'), 'boom')
  assert.equal(errorMessage({ code: 42 }), '[object Object]')
  assert.equal(errorMessage(null), '')
  assert.equal(errorMessage(undefined), '')
})

test('isValidSkillName：只接受安全的 kebab-case，拒绝路径穿越', () => {
  assert.equal(isValidSkillName('seo-master'), true)
  assert.equal(isValidSkillName('a1'), true)
  for (const bad of ['../etc', 'a/b', 'A-B', '-lead', 'trail-', '', 'has space', '中文', 'a..b', './x']) {
    assert.equal(isValidSkillName(bad), false, `${bad} 必须被拒绝`)
  }
})

test('rebuildFrontmatter：关闭时写入 disable-model-invocation: true 且 user-invocable 恒为 true', () => {
  const next = rewrite(FRONTMATTER, false)
  assert.match(next, /^disable-model-invocation: true$/m)
  assert.match(next, /^user-invocable: true$/m)
})

test('rebuildFrontmatter：开启时写入 disable-model-invocation: false', () => {
  const next = rewrite(FRONTMATTER, true)
  assert.match(next, /^disable-model-invocation: false$/m)
})

test('rebuildFrontmatter：已有开关字段被替换而非追加（幂等，无重复键）', () => {
  const once = rewrite(FRONTMATTER, false)
  const twice = rewrite(once, false)
  assert.equal(twice, once, '同一输入重复重写必须得到逐字节相同的结果')
  assert.equal((twice.match(/^disable-model-invocation:/gm) ?? []).length, 1)
  assert.equal((twice.match(/^user-invocable:/gm) ?? []).length, 1)
})

test('rebuildFrontmatter：保留其它 frontmatter 字段与正文，不触碰正文内容', () => {
  const next = rewrite(FRONTMATTER, false)
  assert.match(next, /^name: demo-skill$/m)
  assert.match(next, /^description: "示例"$/m)
  assert.match(next, /^category: a-market$/m)
  assert.ok(next.endsWith('\n\n# 正文\n\n内容不应被改动。\n'), '正文必须原样保留')
})

test('rebuildFrontmatter：CRLF 输入仍产出干净可解析的 frontmatter，且重写幂等', () => {
  const crlf = FRONTMATTER.replace(/\n/g, '\r\n')
  const next = rewrite(crlf, false)
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(next)?.[1] ?? ''
  assert.notEqual(fm, '', 'frontmatter 块必须仍可被解析')
  assert.equal(fm.includes('\r'), false, 'frontmatter 块内不应残留 CR 字符')
  assert.match(fm, /^disable-model-invocation: true$/m)
  assert.equal(rewrite(next, false), next, '同一输入重复重写必须得到逐字节相同的结果')
})

test('rebuildFrontmatter：没有 frontmatter 时返回 null（调用方据此报 400，而不是写坏文件）', () => {
  assert.equal(rebuildFrontmatter('# 只有正文\n', true), null)
  assert.equal(rebuildFrontmatter('', true), null)
})

test('rebuildFrontmatter：与抽取前的内联实现逐字节一致（抽取行为保全）', () => {
  // 抽取前 handleToggle 里的原始逻辑，原样保留作为参照。
  // 抽函数绝不能顺带改行为——用户资产写入必须可证明等价。
  const original = (text, enabled) => {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    if (!match) return null
    const kept = match[1].split(/\r?\n/).filter((line) => !/^(disable-model-invocation|user-invocable):/.test(line))
    const nextFm = [...kept, `disable-model-invocation: ${String(!enabled)}`, 'user-invocable: true'].join('\n')
    return text.slice(0, match.index) + '---\n' + nextFm + '\n---' + text.slice(match.index + match[0].length)
  }
  const cases = [
    FRONTMATTER,
    FRONTMATTER.replace(/\n/g, '\r\n'),
    '---\nname: d\n---\n',
    rewrite(FRONTMATTER, true),
    '# 无 frontmatter\n',
  ]
  for (const text of cases) {
    for (const enabled of [true, false]) {
      assert.equal(rebuildFrontmatter(text, enabled), original(text, enabled), `不一致：${JSON.stringify(text.slice(0, 40))} enabled=${enabled}`)
    }
  }
})

test('findCatalogInconsistencies：skill 引用的 category/subcategory 必须在分类表中存在', () => {
  const cats = [{ key: 'a', title: 'A', subs: [{ key: 'a1', title: 'A1' }] }]
  const skills = [
    { name: 'ok', category: 'a', subcategory: 'a1' },
    { name: 'bad-cat', category: 'zzz', subcategory: 'a1' },
    { name: 'bad-sub', category: 'a', subcategory: 'zzz' },
  ]
  const found = findCatalogInconsistencies(cats, skills)
  assert.deepEqual(found, ['bad-cat: 未知 category zzz', 'bad-sub: 未知 subcategory zzz'])
})

test('findCatalogInconsistencies：skill 名称非法或重复同样被报出', () => {
  const cats = [{ key: 'a', title: 'A', subs: [{ key: 'a1', title: 'A1' }] }]
  const skills = [
    { name: 'dupe', category: 'a', subcategory: 'a1' },
    { name: 'dupe', category: 'a', subcategory: 'a1' },
    { name: 'Bad Name', category: 'a', subcategory: 'a1' },
  ]
  const found = findCatalogInconsistencies(cats, skills)
  assert.ok(found.some((line) => line.includes('重复')), JSON.stringify(found))
  assert.ok(found.some((line) => line.includes('名称非法')), JSON.stringify(found))
})
