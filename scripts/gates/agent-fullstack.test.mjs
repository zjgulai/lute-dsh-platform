/**
 * `verify-agent-fullstack.mjs` 人格层判据的反向自测：判据必须能说「不」。
 *
 * ## 为什么单独测人格层
 *
 * 其余五层（身份 / 组合 / 压缩 / 子集 / 开关）的腐烂都会在页面上留下可见痕迹 ——
 * 名字不对、卡片少一条、压缩没生效。**人格层的腐烂完全不可见**：persona 行变成骨架占位、
 * 被截断成半段、或只留开场白而丢掉 M00–M13 派活表，加载、日志、页面读数一律正常，
 * 只有模型的行为变了 —— 而「行为变了」没有读数。所以这一层的每一条判据都必须被证明
 * 真的会红，否则它只是一条让人放心的装饰。
 *
 * ## 钉住的东西
 *
 *   B0 干净 fixture 上判据必须**静默**（否则它是在对所有副本喊狼来了）；
 *   M1 逐字比对：**同长度**的单字符替换必须判红（打掉「只比长度」的退化实现，P-02）；
 *   M2 骨架占位（P1 遗留）必须判红；
 *   M3 截断成开场白必须判红；
 *   M4/M5/M6 源与副本**一起**改：同源成立、但派活表/三无条文/运行时占位符缺项仍要判红
 *      —— 这一组证明 6b–6d 不是 6a 的附庸（只比字节的话，两边一起删就一致了）；
 *   M7 锚点被改坏必须响亮失败，而不是退化成「无发现」（空转守卫）；
 *   M8 SOUL.md 不存在必须判红；
 *   M9 SOUL.md 正文为空：渲染器必须拒绝产出空人格，门禁必须点名。
 *
 * ## 射程
 *
 * 只测人格层（断言 `[人格] ` 前缀的判据）。fixture 是 tmp 目录里的最小组合文件，
 * 其它五层在 fixture 上必然报出问题 —— 那是预期的，不属于本文件的范围，
 * 各层的自测分别在 `live-presets.test.mjs`（组合层解析面）与本门禁的静态判据里。
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createMutationFixture } from '../lib/mutation-fixture.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = join(HERE, '..', '..', 'packages', 'capabilities', 'dsh-overseas-skills')
const syncUrl = pathToFileURL(join(PKG, 'scripts', 'sync-fullstack-persona.mjs')).href
const gateUrl = pathToFileURL(join(PKG, 'scripts', 'verify-agent-fullstack.mjs')).href
const contractUrl = pathToFileURL(join(PKG, 'scripts', 'fullstack-contract.mjs')).href
const { renderPersonaText, loadSoulBody, extractPersonaBody } = await import(syncUrl)
const { checkAgentFullstack, NODE_IDS } = await import(gateUrl)
const { auditFullstackCatalog } = await import(contractUrl)

const REAL_SOUL = join(PKG, 'presets', 'agent-fullstack', 'SOUL.md')

const fixtures = []
afterEach(() => {
  while (fixtures.length > 0) fixtures.pop().cleanup()
})

function makeRoot() {
  const fixture = createMutationFixture({ prefix: 'agent-fullstack' })
  fixtures.push(fixture)
  return fixture.repo
}

/** 由人格正文反推出 SOUL.md 的可读形态（正文前加一段人类注释，模拟真实文件形状）。 */
function soulFileText(body) {
  return `<!-- 注释块：不进人格。 -->\n\n${body}\n`
}

/** 造一份最小 preset 副本：身份文件 + 只有 persona 行与 agent-instructions 行的组合文件。 */
function writeFixture(root, { soulBody, personaBody, soulText, breakAnchor = false } = {}) {
  mkdirSync(root, { recursive: true })
  // 组合文件里的正文与 SOUL.md 的正文默认同源；要造「不同源」就把 personaBody 单独给出来。
  const body = personaBody ?? soulBody ?? REAL_BODY
  if (soulText !== undefined) writeFileSync(join(root, 'SOUL.md'), soulText)
  else if (soulBody !== undefined) writeFileSync(join(root, 'SOUL.md'), soulFileText(soulBody))
  writeFileSync(join(root, 'preset.yml'), 'name: \'三无 · Agent全栈专家\'\ndescription: \'最小 fixture：只用于人格层判据的反向自测，其余五层由别的自测守着\'\norder: 5\n')
  const head = breakAnchor
    ? "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: |\n"
    : "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: |-\n"
  const yml = `${head}${renderPersonaText(body)}\n- id: agent-instructions\n  name: '@deepseek-ai/dsh-agent-instructions'\n  config:\n    maxBytes: 65536\n`
  writeFileSync(join(root, 'agent.cordis.yml'), yml)
  return root
}

/** 跑门禁，只取人格层判据。 */
function personaProblems(root, soulPath) {
  const { problems } = checkAgentFullstack({
    presetRoot: root,
    soulPath: soulPath ?? join(root, 'SOUL.md'),
    skillsDir: join(root, 'isolated-skills'),
    profileBase: join(root, 'isolated-profile'),
    iconManifest: join(root, 'isolated-icon-manifest.json'),
  })
  return problems.filter((p) => p.startsWith('[人格] '))
}

const has = (problems, needle) => problems.some((p) => p.includes(needle))

const REAL_BODY = loadSoulBody(REAL_SOUL)

test('B0 干净副本上人格层判据必须静默', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const problems = personaProblems(root)
  assert.deepEqual(problems, [], `干净副本上不该有人格层问题，实得：\n${problems.join('\n')}`)
})

test('M1 同长度的单字符替换必须判红（打掉「只比长度」的退化实现）', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  // 只改副本，且**长度不变** —— 任何「比长度 / 比行数 / 比前 N 字」的实现都会放过它。
  const mutated = REAL_BODY.replace('无越权承诺', '无越权承偌')
  assert.notEqual(mutated, REAL_BODY)
  assert.equal(mutated.length, REAL_BODY.length, 'M1 的前提就是长度不变')
  writeFixture(root, { personaBody: mutated, soulBody: REAL_BODY })
  const problems = personaProblems(root)
  assert.ok(has(problems, '不同源'), `必须点名不同源，实得：\n${problems.join('\n')}`)
})

test('M2 P1 遗留的骨架占位必须判红', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const skeleton = 'You are 三无 · Agent全栈专家, a coding agent powered by the {{model}} model, running on the DeepSeek Harness. Your working directory is {{cwd}}.\n\n（人格正文在 P4 阶段写入；本行为骨架占位，用于验证该行可加载。）'
  writeFixture(root, { personaBody: skeleton, soulBody: REAL_BODY })
  const problems = personaProblems(root)
  assert.ok(has(problems, '仍是 P1 的骨架占位'), `必须点名骨架占位，实得：\n${problems.join('\n')}`)
})

test('M3 截断成开场白必须判红', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const truncated = REAL_BODY.split('\n').slice(0, 2).join('\n')
  writeFixture(root, { personaBody: truncated, soulBody: REAL_BODY })
  const problems = personaProblems(root)
  assert.ok(has(problems, '低于本 preset 人格的下限'), `必须点名截断，实得：\n${problems.join('\n')}`)
})

test('M4 源与副本一起删掉 M09 行：同源成立，但派活链断点仍要判红', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const mutated = REAL_BODY.split('\n').filter((l) => !l.startsWith('| M09 ')).join('\n')
  assert.notEqual(mutated, REAL_BODY, 'M4 必须真的删掉了一行')
  writeFixture(root, { soulBody: mutated })          // 副本由变异后的源渲染 → 同源成立
  const problems = personaProblems(root)
  assert.ok(!has(problems, '不同源'), `M4 里同源应当成立，实得：\n${problems.join('\n')}`)
  assert.ok(has(problems, '缺 1 个节点') && has(problems, 'M09'), `必须点名 M09 断点，实得：\n${problems.join('\n')}`)
})

test('M5 源与副本一起删掉「无越权承诺」：三无条文缺项要判红', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const mutated = REAL_BODY.replace(/\*\*无越权承诺。\*\*/, '**本条已删。**')
  assert.notEqual(mutated, REAL_BODY)
  writeFixture(root, { soulBody: mutated })
  const problems = personaProblems(root)
  assert.ok(has(problems, '缺三无条文') && has(problems, '无越权承诺'), `必须点名缺哪一条，实得：\n${problems.join('\n')}`)
})

test('M6 源与副本一起吃掉 {{cwd}}：运行时占位符缺失要判红', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const mutated = REAL_BODY.replace('{{cwd}}', 'the current directory')
  assert.notEqual(mutated, REAL_BODY)
  writeFixture(root, { soulBody: mutated })
  const problems = personaProblems(root)
  assert.ok(has(problems, '丢了运行时占位符') && has(problems, '{{cwd}}'), `必须点名缺哪个占位符，实得：\n${problems.join('\n')}`)
})

test('M7 锚点被改坏必须响亮失败，而不是退化成「无发现」', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY, breakAnchor: true })
  const problems = personaProblems(root)
  assert.ok(has(problems, '抽不到 persona 行的正文'), `锚点坏了必须点名空转，实得：\n${problems.join('\n')}`)
})

test('M8 SOUL.md 不存在必须判红', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  rmSync(join(root, 'SOUL.md'))
  const problems = personaProblems(root)
  assert.ok(has(problems, '缺人格事实源 SOUL.md'), `必须点名无源副本，实得：\n${problems.join('\n')}`)
})

test('M9 SOUL.md 正文为空：渲染器拒绝产出空人格，门禁必须点名', () => {
  const root = makeRoot()
  // 只剩人类注释块的文件 —— 抽取结果为空串。空人格能加载、能运行、日志正常，只是不再约束任何行为。
  writeFixture(root, { soulText: '<!-- 只有注释，没有正文 -->\n' })
  const problems = personaProblems(root)
  assert.ok(has(problems, '读 SOUL.md 失败') && has(problems, '正文为空'), `必须点名空正文，实得：\n${problems.join('\n')}`)

  // 渲染器本身是这条守卫的第一道：它是写盘前的最后一道，不能只是「写个空块」。
  assert.throws(() => renderPersonaText(''), /正文为空/)
})

test('M10 渲染器与抽取器必须互逆（同源判据的地基）', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const yml = readFileSync(join(root, 'agent.cordis.yml'), 'utf8')
  assert.equal(extractPersonaBody(yml), REAL_BODY)
  // 再渲染一次必须得到同一份字节 —— 否则每次同步都会产生幽灵 diff。
  assert.equal(extractPersonaBody(yml.replace(/\n$/, '\n')), REAL_BODY)
})

// ── 头像层（第 7 层）的反向自测 ────────────────────────────────────────────
//
// 这一层守的是一坨几千字符的 base64 —— **没人读得动**。所以两种腐烂都不响：
// 「丢」（icon 行被删 → 卡片回落成没有头像）与「霉」（图标库重画过 → 副本停在上一版）。
// 下面每条都必须是「干净副本静默、突变判红」。

const avatarSyncUrl = pathToFileURL(join(PKG, 'scripts', 'sync-fullstack-avatar.mjs')).href
const { renderIconLine, extractIcon, replaceIcon } = await import(avatarSyncUrl)

/**
 * 一枚形状合法的最小徽章（判据只认 viewBox 与 <svg 开头，不要求画得像）。
 * 但它**必须带真实的 paint 值**：paint 判据带空转哨兵，一枚零 paint 的 SVG
 * 会被判「判据空转」而不是判绿 —— 第一版 fixture 就是这个形状，当场红了。
 */
const BADGE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="4.5" y="4.5" width="91" height="91" rx="18" fill="#FFFFFF" stroke="#58B848" stroke-width="2.2"/></svg>'
const OTHER_BADGE = BADGE.replace('width="91"', 'width="90"')
const uriOf = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')

/** 造一份图标库清单 fixture —— 不依赖本机真的装了 lute-brand-icons。 */
function writeIconManifest(root, icon = uriOf(BADGE)) {
  const p = join(root, 'icon-manifest.json')
  writeFileSync(p, JSON.stringify([{ id: 'sanwu-emperor', name: '测试用徽章', icon, file: 'assets/icons/sanwu-emperor.svg' }], null, 2))
  return p
}

/** 跑门禁，只取头像层判据。 */
function avatarProblems(root, manifest) {
  const { problems } = checkAgentFullstack({
    presetRoot: root,
    skillsDir: join(root, 'isolated-skills'),
    profileBase: join(root, 'isolated-profile'),
    iconManifest: manifest ?? writeIconManifest(root),
  })
  return problems.filter((p) => p.startsWith('[头像] '))
}

/** 把 icon 行写进 fixture 的 preset.yml（append 或替换）。 */
function setIcon(root, iconLine) {
  const p = join(root, 'preset.yml')
  const y = readFileSync(p, 'utf8')
  writeFileSync(p, /^icon:/m.test(y) ? y.replace(/^icon:.*$/m, iconLine) : `${y}${iconLine}\n`)
}

test('I0 干净副本 + 同源图标上，头像层必须静默', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  setIcon(root, renderIconLine(uriOf(BADGE)))
  const problems = avatarProblems(root)
  assert.deepEqual(problems, [], `干净副本上不该有头像层问题，实得：\n${problems.join('\n')}`)
})

test('I1 icon 行被删必须判红（「丢」是完全静默的）', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const problems = avatarProblems(root)
  assert.ok(has(problems, '没有 icon 行'), `必须点名缺 icon 行，实得：\n${problems.join('\n')}`)
})

test('I2 icon 写成相对路径必须判红（会 404 成一枚空白头像，不报错）', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  setIcon(root, "icon: 'assets/icons/sanwu-emperor.svg'")
  const problems = avatarProblems(root)
  assert.ok(has(problems, '不是 base64 SVG data URI'), `必须点名形状不对，实得：\n${problems.join('\n')}`)
})

test('I3 合法 data URI 但解出来不是徽章必须判红', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  setIcon(root, renderIconLine(uriOf('<svg viewBox="0 0 24 24"><circle r="10"/></svg>')))
  const problems = avatarProblems(root)
  assert.ok(has(problems, '不是 100×100 的品牌徽章'), `必须点名徽章形状，实得：\n${problems.join('\n')}`)
})

test('I4 合法徽章但停在上一个版本必须判红（「霉」）', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const manifest = writeIconManifest(root, uriOf(BADGE))
  setIcon(root, renderIconLine(uriOf(OTHER_BADGE))) // 图标库画的是 BADGE，副本还是上一版
  const problems = avatarProblems(root, manifest)
  assert.ok(has(problems, '不同源'), `必须点名不同源，实得：\n${problems.join('\n')}`)
})

test('I5 图标库读不到时不许静默降级（否则同源判据空转仍报绿）', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  setIcon(root, renderIconLine(uriOf(BADGE)))
  const problems = avatarProblems(root, join(root, '不存在的清单.json'))
  assert.ok(has(problems, '无法核对同源'), `必须点名无法核对，实得：\n${problems.join('\n')}`)
})

test('I6 渲染器与抽取器必须互逆，且只改 icon 一处字节', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  const before = readFileSync(join(root, 'preset.yml'), 'utf8')
  const { text, action } = replaceIcon(before, uriOf(BADGE))
  assert.equal(action, 'appended')
  assert.equal(extractIcon(text), uriOf(BADGE))
  // 身份三行必须逐字节保留 —— 同步器不许顺手重排人写的文件。
  assert.ok(text.startsWith(before), '追加 icon 行不得改动既有的 name/description/order 字节')

  const again = replaceIcon(text, uriOf(OTHER_BADGE))
  assert.equal(again.action, 'replaced')
  assert.equal(extractIcon(again.text), uriOf(OTHER_BADGE))
  assert.equal(again.text.split('\n').filter((l) => l.startsWith('icon:')).length, 1, '替换后仍必须只有一行 icon:')
})

test('I7 非法 paint 值必须判红（ADR-0090 的形状：静默回落成黑色，看着像设计）', () => {
  const root = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  // 正是 ADR-0090 的真实缺陷形状：把颜色**名字**当成颜色值写进产物。
  const brokenBadge = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="4.5" y="4.5" width="91" height="91" rx="18" fill="W" stroke="#58B848"/></svg>'
  writeIconManifest(root, uriOf(brokenBadge))
  setIcon(root, renderIconLine(uriOf(brokenBadge)))
  const problems = avatarProblems(root)
  assert.ok(has(problems, '非法 paint 值'), `必须点名非法 paint，实得：\n${problems.join('\n')}`)

  // 空转哨兵：解出来的 SVG 里一个 paint 都没有时，判据必须报「空转」而不是报绿。
  const noPaint = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>'
  const root2 = writeFixture(makeRoot(), { soulBody: REAL_BODY })
  writeIconManifest(root2, uriOf(noPaint))
  setIcon(root2, renderIconLine(uriOf(noPaint)))
  assert.ok(has(avatarProblems(root2), '一个 paint 值都没有'), '零 paint 必须与「零违规」不同形')
})

// ── 产品批准白名单（第 4 层）的端到端负例 ──────────────────────────────────

const APPROVED_WHITELIST = JSON.parse(readFileSync(join(PKG, 'manifest', 'agent-fullstack-whitelist.json'), 'utf8'))
const FULLSTACK_CATALOG = auditFullstackCatalog({ packageRoot: PKG, checkInstalled: false })
assert.equal(FULLSTACK_CATALOG.failed, 0, `测试前提：catalog 必须闭合，实得：\n${FULLSTACK_CATALOG.problems.join('\n')}`)
const NODE_BY_NAME = new Map(FULLSTACK_CATALOG.rows.map((row) => [row.name, row.nodeId]))

function whitelistYml(names, nodeOverrides = {}) {
  const grouped = new Map(NODE_IDS.map((node) => [node, []]))
  for (const name of names) {
    const node = nodeOverrides[name] ?? NODE_BY_NAME.get(name) ?? 'M00'
    grouped.get(node).push(name)
  }
  return [
    '- id: skill-subset',
    "  name: 'dsh-skill-subset'",
    '  config:',
    '    respectFileFlags: true',
    '    hideOthers: true',
    '    skills:',
    ...NODE_IDS.flatMap((node) => [
      `      # ${node}（${grouped.get(node).length} 条）`,
      ...grouped.get(node).map((name) => `      - "${name}"`),
    ]),
    '',
  ].join('\n')
}

test('W0/W1/W2 live 白名单消费 approved set；同数替换与节点错挂都必须点名', () => {
  const root = makeRoot()
  const skillsDir = join(root, 'skills')
  mkdirSync(skillsDir, { recursive: true })
  for (const name of [...APPROVED_WHITELIST.skillIds, 'grill-me']) {
    const dir = join(skillsDir, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), 'fixture')
  }
  writeFileSync(join(root, 'preset.yml'), "name: 三无 · Agent全栈专家\ndescription: 这是用于批准白名单集成回归的最小 fixture，其他层问题不在本用例射程\norder: 1\n")
  writeFileSync(join(root, 'agent.cordis.yml'), whitelistYml(APPROVED_WHITELIST.skillIds))

  const clean = checkAgentFullstack({
    presetRoot: root,
    skillsDir,
    profileBase: root,
    iconManifest: join(root, 'isolated-icon-manifest.json'),
  })
  assert.deepEqual(clean.problems.filter((problem) => problem.startsWith('[批准白名单]')), [])
  assert.equal(clean.facts.subset.approved, 89)
  assert.equal(clean.facts.subset.owner, 'lute')
  assert.equal(clean.facts.subset.nodeMismatches, 0)

  writeFileSync(
    join(root, 'agent.cordis.yml'),
    whitelistYml(APPROVED_WHITELIST.skillIds, { 'writing-for-agents': 'M00' }),
  )
  const placementProblems = checkAgentFullstack({
    presetRoot: root,
    skillsDir,
    profileBase: root,
    iconManifest: join(root, 'isolated-icon-manifest.json'),
  }).problems
    .filter((problem) => problem.startsWith('[批准白名单]'))
  assert.ok(
    placementProblems.some((problem) => problem.includes('节点归属不符')
      && problem.includes('writing-for-agents: expected M13, actual M00')),
    placementProblems.join('\n'),
  )

  const mutated = [...APPROVED_WHITELIST.skillIds]
  const removed = mutated.pop()
  mutated.push('grill-me')
  writeFileSync(join(root, 'agent.cordis.yml'), whitelistYml(mutated))
  const problems = checkAgentFullstack({
    presetRoot: root,
    skillsDir,
    profileBase: root,
    iconManifest: join(root, 'isolated-icon-manifest.json'),
  }).problems
    .filter((problem) => problem.startsWith('[批准白名单]'))
  assert.ok(problems.some((problem) => problem.includes(`missing：${removed}`)), problems.join('\n'))
  assert.ok(problems.some((problem) => problem.includes('unexpected：grill-me')), problems.join('\n'))
})
