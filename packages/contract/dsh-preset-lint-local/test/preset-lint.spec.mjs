import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, name } from '../lib/index.js'
import { lintFile } from '../lib/lint-preset.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

/** 构造 preset 根目录，每个 preset 一个 agent.cordis.yml。 */
async function presetRoot(presets) {
  const root = await mkdtemp(join(tmpdir(), 'preset-lint-'))
  for (const [dir, content] of Object.entries(presets)) {
    await mkdir(join(root, dir), { recursive: true })
    await writeFile(join(root, dir, 'agent.cordis.yml'), content)
  }
  return root
}

/** 构造可控 ctx，记录 logger 输出与 effect/dispose 注册。 */
function context() {
  /** @type {{ warn: string[], info: string[] }} */
  const logs = { warn: [], info: [] }
  /** @type {string[]} */
  const effects = []
  /** @type {Array<() => void>} */
  const disposers = []
  const ctx = {
    logger: { warn: (m) => logs.warn.push(m), info: (m) => logs.info.push(m) },
    effect: (fn, label) => { effects.push(label); const d = fn(); if (typeof d === 'function') disposers.push(d); return () => {} },
    on: (event, handler) => { if (event === 'dispose') disposers.push(handler) },
    get: () => undefined,
  }
  return { ctx, logs, effects, disposers }
}

/** 等待启动扫描完成（延迟被环境变量压到 0）。 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 60))

let originalHome
let originalDelay
let originalLint
/** 每个用例注册的释放器：apply 会 fs.watch 目录，不释放则测试进程不退出。 */
const liveDisposers = []

before(() => {
  originalHome = process.env.DSH_HOME
  originalDelay = process.env.DSH_PRESET_LINT_START_DELAY_MS
  originalLint = process.env.DSH_LINT_PATH
  process.env.DSH_PRESET_LINT_START_DELAY_MS = '0'
  // 显式注入随包发布的 linter，避免依赖仓库内其它路径。
  process.env.DSH_LINT_PATH = join(packageRoot, 'lib', 'lint-preset.mjs')
})

after(() => {
  for (const dispose of liveDisposers.splice(0)) { try { dispose() } catch { /* 释放失败不影响断言 */ } }
  if (originalHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalHome
  if (originalDelay === undefined) delete process.env.DSH_PRESET_LINT_START_DELAY_MS
  else process.env.DSH_PRESET_LINT_START_DELAY_MS = originalDelay
  if (originalLint === undefined) delete process.env.DSH_LINT_PATH
  else process.env.DSH_LINT_PATH = originalLint
})

/** 应用插件并登记其释放器。 */
function mount(ctx, disposers) {
  apply(ctx)
  liveDisposers.push(...disposers)
}

test('linter 随包发布，且源码不再硬编码本机绝对路径', async () => {
  const bundled = join(packageRoot, 'lib', 'lint-preset.mjs')
  assert.ok(existsSync(bundled), `linter 应随包发布：${bundled}`)

  const source = await readFile(join(packageRoot, 'lib', 'index.js'), 'utf8')
  // 只检查可执行代码：硬编码期望形如 "/Users/.../lint-preset.mjs"
  assert.ok(
    !/["'][^"']*\/Users\/[^"']*lint-preset\.mjs["']/.test(source),
    '源码不得硬编码本机绝对路径（客户机上会静默失效）',
  )
  assert.match(source, /new URL\("\.\/lint-preset\.mjs", import\.meta\.url\)/, '应相对本模块解析 linter')
})

test('开关：未启用时不注册任何 effect', () => {
  const { ctx, effects, disposers } = context()
  mount(ctx, disposers)
  assert.equal(effects.length, 0)
})

test('启动扫描对存量 preset 执行 lint，并把结果写入宿主日志', async () => {
  process.env.DSH_HOME = await presetRoot({
    'good-preset': 'id: good\nname: 好预设\ncordis:group:\n  - id: g1\n',
  })
  const { ctx, logs, disposers } = context()
  mount(ctx, disposers)
  await settle()

  const all = [...logs.warn, ...logs.info].join('\n')
  assert.match(all, /preset-lint:/, `应有 preset-lint 日志，实际：${all}`)
})

test('坏 preset（YAML 不可解析）产生 warn 级别告警，而非静默通过', async () => {
  process.env.DSH_HOME = await presetRoot({
    'broken-preset': 'id: broken\n  name: [unclosed\n',
  })
  const { ctx, logs, disposers } = context()
  mount(ctx, disposers)
  await settle()

  assert.ok(logs.warn.length > 0, `坏 preset 必须告警，实际 warn=${logs.warn.length} info=${logs.info.length}`)
})

test('preset 根不存在时不抛错（宿主启动不得被拖垮）', () => {
  process.env.DSH_HOME = join(tmpdir(), 'definitely-missing-preset-root')
  const { ctx, disposers } = context()
  assert.doesNotThrow(() => { mount(ctx, disposers) })
})

test('同源守卫：随包 linter 与 dsh-patches 内的权威副本保持一致', async () => {
  // 一份事实一个 home：dsh-patches/lint-preset.mjs 是补丁素材目录中的权威副本，
  // lib/lint-preset.mjs 是随插件发布的运行时副本。两者漂移即失败，防止静默分叉。
  const bundled = join(packageRoot, 'lib', 'lint-preset.mjs')
  const authoritative = join(packageRoot, '..', '..', '..', 'dsh-patches', 'lint-preset.mjs')
  if (!existsSync(authoritative)) return // 素材目录不在仓库内（打包形态）时跳过

  const [a, b] = await Promise.all([readFile(bundled, 'utf8'), readFile(authoritative, 'utf8')])
  assert.equal(a, b, '两份 linter 已漂移：请以 dsh-patches/lint-preset.mjs 为准重新同步 lib/lint-preset.mjs')
})

// —— dsh-skill-subset 配置规则（2026-09-11 实测事故的直接成因）——
// 规则用 fixture 显式给出的 config.skillsDir 指向临时目录，不读真实 ~/.dsh/skills。

/** 建一个临时 skillsDir，其中只存在 names 列出的技能。 */
async function skillsDir(names) {
  const root = await mkdtemp(join(tmpdir(), 'preset-skills-'))
  for (const skill of names) {
    await mkdir(join(root, skill), { recursive: true })
    await writeFile(join(root, skill, 'SKILL.md'), '---\nname: ' + skill + '\ndescription: 测试用\n---\n')
  }
  return root
}

/** 写一份含 skill-subset 行的 preset，返回其路径。 */
async function presetWithSubset(configLines) {
  const dir = await mkdtemp(join(tmpdir(), 'preset-subset-'))
  const file = join(dir, 'agent.cordis.yml')
  await writeFile(file, ['- id: skill-subset', "  name: 'dsh-skill-subset'", '  config:', ...configLines, ''].join('\n'))
  return file
}

/** 在 preset 目录内建一个自带技能（preset 的 skill-filesystem 行会读这里）。 */
async function presetOwnSkill(presetFile, skill) {
  const dir = join(dirname(presetFile), 'skills', skill)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), '---\nname: ' + skill + '\ndescription: preset 自带\n---\n')
}

test('skill-subset 的 skills 里存在但磁盘上没有的技能名必须报错', async () => {
  const dir = await skillsDir(['present-skill'])
  const file = await presetWithSubset(['    skills:', '      - present-skill', '      - missing-skill', `    skillsDir: '${dir}'`])

  const { errors } = lintFile(file)
  assert.ok(
    errors.some((e) => e.includes('missing-skill')),
    `必须报出缺失的技能名 missing-skill，实际 errors=${JSON.stringify(errors)}`,
  )
})

test('技能只存在于 preset 自带的 skills/ 目录时不得报错（实测：6 个 preset 都是这种形态）', async () => {
  const dir = await skillsDir(['present-skill']) // 该目录里没有 preset-own-skill
  const file = await presetWithSubset(['    skills:', '      - present-skill', '      - preset-own-skill', `    skillsDir: '${dir}'`])
  await presetOwnSkill(file, 'preset-own-skill')

  const { errors } = lintFile(file)
  const subsetErrors = errors.filter((e) => e.includes('preset-own-skill'))
  assert.deepEqual(subsetErrors, [], `preset 自带目录里的技能不应报错，实际=${JSON.stringify(subsetErrors)}`)
})

test('skill-subset 的 skills 全部存在时不报错（规则不得一味报错）', async () => {
  const dir = await skillsDir(['present-skill'])
  const file = await presetWithSubset(['    skills:', '      - present-skill', `    skillsDir: '${dir}'`])

  const { errors } = lintFile(file)
  const subsetErrors = errors.filter((e) => e.includes('skill-subset'))
  assert.deepEqual(subsetErrors, [], `技能都在时不应报错，实际=${JSON.stringify(subsetErrors)}`)
})

test("positiveSource: 'dir' 而 skillsDir 不存在时必须报错", async () => {
  const file = await presetWithSubset([
    '    skills:',
    '      - some-skill',
    "    positiveSource: 'dir'",
    `    skillsDir: '${join(tmpdir(), 'definitely-missing-skills-dir')}'`,
  ])

  const { errors } = lintFile(file)
  assert.ok(
    errors.some((e) => e.includes('skillsDir') || e.includes('definitely-missing-skills-dir')),
    `必须报出 skillsDir 不存在，实际 errors=${JSON.stringify(errors)}`,
  )
})
