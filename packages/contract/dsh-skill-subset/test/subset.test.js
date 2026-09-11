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
