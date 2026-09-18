import assert from 'node:assert/strict'
import {
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { mutationRoot } from '../../../../scripts/lib/mutation-fixture.mjs'
import {
  FullstackInstallError,
  buildInstallPlan,
  expectedInstallManifest,
  parseInstallerArgs,
  publicInstallPlan,
  selectInstallTasks,
  stageInstallItem,
} from '../scripts/install-fullstack-core.mjs'
import { runInstallerCli } from '../scripts/install-fullstack-skills.mjs'

/**
 * 每个用例一棵自有临时树。
 *
 * 这里原先写 `mkdtempSync(join(tmpdir(), 'fullstack-installer-'))` 且**从不清理**：
 * 2026-09-17 在真实 TMPDIR 上数出 1,555 个 `fullstack-installer-*` 残留根
 * （约 26 MB），全部来自历次 `pnpm run gate`。改用 `mutationRoot()` 后，
 * 前缀仍然随机，但根登记进进程回收表：正常退出、断言抛错、SIGTERM 都会回收
 * （机制与依据见 scripts/lib/mutation-fixture.mjs 的 reaper 注释）。
 */
function fixture() {
  const root = mutationRoot('fullstack-installer-')
  const skillsRoot = join(root, 'skills')
  const translationsRoot = join(root, 'translations')
  const mp = join(root, 'third-party', 'mp')
  const pm = join(root, 'third-party', 'pm')
  mkdirSync(skillsRoot, { recursive: true })
  mkdirSync(translationsRoot)
  mkdirSync(mp, { recursive: true })
  mkdirSync(pm, { recursive: true })
  return { root, skillsRoot, translationsRoot, sourceRoots: { mp, pm } }
}

/** @returns {any} */
function skill({ name, repo = 'pm', installAs = name, isExisting = false }) {
  if (isExisting) {
    return { name, src: `engineering/${name}`, title: `标题${name}`, cat: 'M08', summaryZh: `摘要内容足够长 ${name}` }
  }
  return { name, installAs, dir: `group/${name}`, repo, titleZh: `标题${name}`, cat: 'M08', summaryZh: `摘要内容足够长 ${name}` }
}

function writeSkill(directory, name, { flags = '', resource = 'resource' } = {}) {
  mkdirSync(join(directory, 'references'), { recursive: true })
  writeFileSync(join(directory, 'SKILL.md'), `---\nname: ${name}\n${flags}---\nupstream body\n`)
  writeFileSync(join(directory, 'references', 'keep.txt'), resource)
}

test('parseInstallerArgs 默认 dry-run；--apply 显式；--only 缺值/未知/重复均拒绝', () => {
  assert.deepEqual(parseInstallerArgs([]), { apply: false, dryRun: true, json: false, only: [] })
  assert.deepEqual(parseInstallerArgs(['--apply', '--only', 'pm,mp', '--json']), {
    apply: true, dryRun: false, json: true, only: ['pm', 'mp'],
  })
  assert.throws(() => parseInstallerArgs(['--only']), /必须给/)
  assert.throws(() => parseInstallerArgs(['--only', 'unknown']), /不认识/)
  assert.throws(() => parseInstallerArgs(['--only', 'pm,pm']), /不得重复/)
  assert.throws(() => parseInstallerArgs(['--apply', '--dry']), /只能指定一次/)
})

test('--only pm 只选 pm，不再无条件夹带 existing', () => {
  const mapping = { skills: [skill({ name: 'old-one', isExisting: true })] }
  const extra = { skills: [skill({ name: 'pm-one' }), skill({ name: 'mp-one', repo: 'mp' })] }
  assert.deepEqual(selectInstallTasks(mapping, extra, ['pm']).map((row) => row.name), ['pm-one'])
  assert.deepEqual(selectInstallTasks(mapping, extra, ['existing']).map((row) => row.name), ['old-one'])
})

test('批尾 installAs traversal 在任何 staging 写入前判红', () => {
  const fx = fixture()
  const good = skill({ name: 'good-one' })
  const bad = skill({ name: 'bad-one', installAs: '../outside' })
  writeSkill(join(fx.sourceRoots.pm, good.dir), good.name)
  writeSkill(join(fx.sourceRoots.pm, bad.dir), bad.name)
  const canary = join(fx.root, 'outside-canary')
  writeFileSync(canary, 'unchanged')
  assert.throws(() => buildInstallPlan({
    mapping: { skills: [] }, extra: { skills: [good, bad] }, skillsRoot: fx.skillsRoot,
    sourceRoots: fx.sourceRoots, translationsRoot: fx.translationsRoot,
  }), /final name/)
  assert.equal(readFileSync(canary, 'utf8'), 'unchanged')
  assert.throws(() => readFileSync(join(fx.skillsRoot, 'good-one', 'SKILL.md')), /ENOENT/)
})

test('source parent symlink 判红且根外 canary 不变', () => {
  const fx = fixture()
  const outside = join(fx.root, 'outside')
  writeSkill(join(outside, 'skill-one'), 'skill-one')
  symlinkSync(outside, join(fx.sourceRoots.pm, 'linked'), 'dir')
  const row = { ...skill({ name: 'skill-one' }), dir: 'linked/skill-one' }
  assert.throws(() => buildInstallPlan({
    mapping: { skills: [] }, extra: { skills: [row] }, skillsRoot: fx.skillsRoot,
    sourceRoots: fx.sourceRoots, translationsRoot: fx.translationsRoot,
  }), /symlink/)
  assert.equal(readFileSync(join(outside, 'skill-one', 'references', 'keep.txt'), 'utf8'), 'resource')
})

test('existing 完整目录 staging 后只替换 SKILL.md，资源与 invocation flags 保留', () => {
  const fx = fixture()
  const target = join(fx.skillsRoot, 'old-one')
  writeSkill(target, 'old-one', {
    flags: 'disable-model-invocation: true\nuser-invocable: false\n',
    resource: 'keep-old-resource',
  })
  writeFileSync(join(fx.translationsRoot, 'old-one.body.md'), '新的中文正文\n')
  const plan = buildInstallPlan({
    mapping: { skills: [skill({ name: 'old-one', isExisting: true })] }, extra: { skills: [] },
    skillsRoot: fx.skillsRoot, sourceRoots: fx.sourceRoots, translationsRoot: fx.translationsRoot,
  })
  const staged = join(fx.root, 'staged-old-one')
  const manifest = stageInstallItem(plan.items[0], staged)
  const output = readFileSync(join(staged, 'SKILL.md'), 'utf8')
  assert.match(output, /disable-model-invocation: true/)
  assert.match(output, /user-invocable: false/)
  assert.match(output, /新的中文正文/)
  assert.equal(readFileSync(join(staged, 'references', 'keep.txt'), 'utf8'), 'keep-old-resource')
  assert.match(manifest.treeSha256, /^[a-f0-9]{64}$/)
  assert.equal(manifest.treeSha256, expectedInstallManifest(plan.items[0]).treeSha256)
})

test('new skill 以完整上游目录为 staging 单元，dry JSON 不泄露正文', () => {
  const fx = fixture()
  const row = skill({ name: 'new-one' })
  writeSkill(join(fx.sourceRoots.pm, row.dir), row.name, { resource: 'binary\u0000safe' })
  writeFileSync(join(fx.translationsRoot, 'new-one.body.md'), '私有正文不应出现在 plan JSON\n')
  const plan = buildInstallPlan({
    mapping: { skills: [] }, extra: { skills: [row] }, skillsRoot: fx.skillsRoot,
    sourceRoots: fx.sourceRoots, translationsRoot: fx.translationsRoot,
  })
  const publicPlan = publicInstallPlan(plan)
  assert.equal(publicPlan.selected, 1)
  assert.equal(publicPlan.requiresThirdPartyApproval, true)
  assert.doesNotMatch(JSON.stringify(publicPlan), /私有正文/)

  const staged = join(fx.root, 'staged-new-one')
  const stagedManifest = stageInstallItem(plan.items[0], staged)
  assert.equal(stagedManifest.treeSha256, expectedInstallManifest(plan.items[0]).treeSha256)
  assert.equal(readFileSync(join(staged, 'references', 'keep.txt'), 'utf8'), 'binary\u0000safe')
})

test('existing --apply 走 journaled whole-directory swap，资源保留且返回 recovery 证据', async () => {
  const fx = fixture()
  const target = join(fx.skillsRoot, 'old-one')
  writeSkill(target, 'old-one', {
    flags: 'disable-model-invocation: true\nuser-invocable: false\n',
    resource: 'keep-through-transaction',
  })
  writeFileSync(join(fx.translationsRoot, 'old-one.body.md'), '事务后的正文\n')
  let stdout = ''
  const result = await runInstallerCli(['--apply', '--only', 'existing', '--json'], {
    home: fx.root,
    skillsRoot: fx.skillsRoot,
    sourceRoots: fx.sourceRoots,
    translationsRoot: fx.translationsRoot,
    mapping: { skills: [skill({ name: 'old-one', isExisting: true })] },
    extra: { skills: [] },
    batchId: 'installer-existing-apply',
    stdout: (text) => { stdout = text },
  })
  assert.equal(result.state, 'COMMITTED')
  assert.equal(JSON.parse(stdout).report.installed[0], 'old-one')
  assert.match(readFileSync(join(target, 'SKILL.md'), 'utf8'), /事务后的正文/)
  assert.equal(readFileSync(join(target, 'references', 'keep.txt'), 'utf8'), 'keep-through-transaction')
  assert.equal(readFileSync(result.journalPath, 'utf8').includes('COMMITTED'), true)
})

test('third-party --apply 在审批账本缺失时整批 fail-closed、零 target 写入', async () => {
  const fx = fixture()
  const row = skill({ name: 'new-one' })
  writeSkill(join(fx.sourceRoots.pm, row.dir), row.name)
  await assert.rejects(runInstallerCli(['--apply', '--only', 'pm'], {
    home: fx.root,
    skillsRoot: fx.skillsRoot,
    sourceRoots: fx.sourceRoots,
    translationsRoot: fx.translationsRoot,
    mapping: { skills: [] },
    extra: { skills: [row] },
    batchId: 'installer-third-party-blocked',
  }), (error) => error instanceof FullstackInstallError && error.code === 'APPROVAL_LEDGER_MISSING')
  assert.throws(() => readFileSync(join(fx.skillsRoot, 'new-one', 'SKILL.md')), /ENOENT/)
})
