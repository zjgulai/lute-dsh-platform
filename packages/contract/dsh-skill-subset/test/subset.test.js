import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

/** 建一个临时技能目录，每个技能一份 SKILL.md。 */
function skillDir(skills) {
  const dir = mkdtempSync(join(tmpdir(), 'lute-subset-'))
  for (const [name, frontmatter] of Object.entries(skills)) {
    mkdirSync(join(dir, name), { recursive: true })
    writeFileSync(join(dir, name, 'SKILL.md'), `---\n${frontmatter}\n---\n\n正文内容 ${name}\n`)
  }
  return dir
}

/** 最小 ctx：只提供插件实际使用的 skills.register / skills.list / effect / logger。 */
function makeContext({ catalog = [] } = {}) {
  const registrations = []
  const context = {
    skills: {
      register: (skill) => {
        registrations.push(skill)
        return () => {}
      },
      list: async () => catalog,
    },
    logger: { warn: () => {} },
    effect: (fn) => {
      context.effects.push(fn)
      return () => {}
    },
    effects: [],
  }
  return { context, registrations }
}

async function run(config, options) {
  const { context, registrations } = makeContext(options)
  apply(context, config)
  for (const effect of context.effects) await effect()
  return registrations
}

/**
 * 判据：每条注册载荷都必须带非空字符串 source。
 *
 * 为什么单列成函数：`dsh-skill` 的 `validateRuntimeSkill()` 不检查 source（注册必成功），
 * 而加载路径的 `validateDefinition()` 要求它是字符串（加载必炸）。漏传的症状是
 * 「注册成功、调用失败」——目录里看得见这条技能，`skill` 工具一调就报
 * `loaded skill "<name>" source must be a string`。
 * 本函数同时被文末的自测打靶，保证它不是一条恒真判据。
 */
function assertEveryRegistrationHasSource(registrations) {
  for (const skill of registrations) {
    assert.equal(
      typeof skill.source,
      'string',
      `注册 ${skill.name} 漏传 source —— dsh-skill 加载时会抛 "source must be a string"`,
    )
    assert.notEqual(skill.source, '', `注册 ${skill.name} 的 source 不可为空串`)
  }
}

test('子集内技能以可调用状态注册，正文来自 SKILL.md', async () => {
  const skillsDir = skillDir({
    'alpha-skill': 'name: alpha-skill\ndescription: 甲技能',
    'beta-skill': 'name: beta-skill\ndescription: 乙技能',
  })

  const registered = await run({ skills: ['alpha-skill'], skillsDir })

  const alpha = registered.find((s) => s.name === 'alpha-skill')
  assert.equal(alpha.description, '甲技能')
  assert.equal(alpha.content, '正文内容 alpha-skill\n')
  assert.deepEqual(alpha.invocation, { modelInvocable: true, userInvocable: true })
})

test('子集外的技能被遮蔽为不可见', async () => {
  const skillsDir = skillDir({
    'alpha-skill': 'name: alpha-skill\ndescription: 甲技能',
    'beta-skill': 'name: beta-skill\ndescription: 乙技能',
  })

  const registered = await run({ skills: ['alpha-skill'], skillsDir })

  const beta = registered.find((s) => s.name === 'beta-skill')
  assert.equal(beta.description, '（本预设未启用）')
  assert.deepEqual(beta.invocation, { modelInvocable: false, userInvocable: false })
  assert.equal(beta.metadata.hidden, true)
})

test('正向与遮蔽两条注册路径都必须带 source（回归：2026-09-16 两处均漏传）', async () => {
  const skillsDir = skillDir({
    'alpha-skill': 'name: alpha-skill\ndescription: 甲技能',
    'beta-skill': 'name: beta-skill\ndescription: 乙技能',
  })

  const registered = await run({ skills: ['alpha-skill'], skillsDir })

  // 两条路径都要过判据：只修正向、漏掉遮蔽，等于没修。
  assertEveryRegistrationHasSource(registered)
  // 自定义根 → custom（默认根 ~/.dsh/skills 才是 user-dsh）。
  assert.equal(registered.find((s) => s.name === 'alpha-skill').source, 'custom')
  assert.equal(registered.find((s) => s.name === 'beta-skill').source, 'custom')
})

test('遮蔽注册沿用 catalog 里该技能的真实来源，取不到才兜底', async () => {
  const skillsDir = skillDir({ 'alpha-skill': 'name: alpha-skill\ndescription: 甲技能' })

  const registered = await run(
    { skills: ['alpha-skill'], skillsDir },
    { catalog: [{ name: 'alpha-skill', source: 'user-dsh' }, { name: 'bundled-skill', source: 'bundled' }, { name: 'origin-less-skill' }] },
  )

  assertEveryRegistrationHasSource(registered)
  assert.equal(registered.find((s) => s.name === 'bundled-skill').source, 'bundled')
  assert.equal(registered.find((s) => s.name === 'origin-less-skill').source, 'dsh-skill-subset')
})

test('source 判据自测：恒真桩突变下必须变红', () => {
  // 没有这条自测，「每条都带 source」可以退化成恒真断言而没人发现。
  assert.throws(
    () => assertEveryRegistrationHasSource([{ name: 'stub-skill', description: 'd', content: '' }]),
    /漏传 source/,
  )
  assert.throws(
    () => assertEveryRegistrationHasSource([{ name: 'stub-skill', description: 'd', content: '', source: '' }]),
    /不可为空串/,
  )
})

test('hideOthers 为 false 时不产生任何遮蔽注册', async () => {
  const skillsDir = skillDir({
    'alpha-skill': 'name: alpha-skill\ndescription: 甲技能',
    'beta-skill': 'name: beta-skill\ndescription: 乙技能',
  })

  const registered = await run({ skills: ['alpha-skill'], skillsDir, hideOthers: false })

  assert.deepEqual(registered.map((s) => s.name), ['alpha-skill'])
})

test('respectFileFlags 为 true 时文件开关决定可见性', async () => {
  const skillsDir = skillDir({
    'quiet-skill': 'name: quiet-skill\ndescription: 静默技能\ndisable-model-invocation: true',
    'loud-skill': 'name: loud-skill\ndescription: 喧闹技能',
  })

  const registered = await run({ skills: ['quiet-skill', 'loud-skill'], skillsDir, respectFileFlags: true })

  const quiet = registered.find((s) => s.name === 'quiet-skill')
  assert.equal(quiet.invocation.modelInvocable, false)
  const loud = registered.find((s) => s.name === 'loud-skill')
  assert.equal(loud.invocation.modelInvocable, true)
})

test('positiveSource=none 时不做正向注册（负向遮蔽关闭以隔离环境）', async () => {
  const registered = await run({ skills: ['alpha-skill'], positiveSource: 'none', hideOthers: false })

  assert.deepEqual(registered, [])
})

test('hideOthers 默认开：catalog 中的其他技能被遮蔽，子集内技能不被遮蔽', async () => {
  const skillsDir = skillDir({ 'alpha-skill': 'name: alpha-skill\ndescription: 甲技能' })

  const registered = await run(
    { skills: ['alpha-skill'], skillsDir },
    { catalog: [{ name: 'alpha-skill' }, { name: 'global-skill' }] },
  )

  const names = registered.map((s) => s.name).sort()
  assert.deepEqual(names, ['alpha-skill', 'global-skill'])
  assert.equal(registered.find((s) => s.name === 'global-skill').metadata.hidden, true)
  assert.equal(registered.find((s) => s.name === 'alpha-skill').metadata.hidden, undefined)
})

test('非法的技能名在加载期即抛错', () => {
  const { context } = makeContext()

  assert.throws(() => apply(context, { skills: ['Bad Name', 'ok-name'] }), /invalid skill names in config: Bad Name/)
})
