/**
 * profile 覆盖率判据的反向自测（QG-004）。
 *
 * 守的是 2026-09-17 实测的 Red：把 `~/.dsh/profiles/desktop/package.json` 写成
 * 截断的 JSON，三个 profile 门禁**全部绿**——`profile-files-sync` 一个字都不报，
 * `profile-bundle-sync` 的读数写着「对比 0/0 个 file: 依赖」。根因是
 * `installedProfileDependencies()` 把解析失败吞成 `{}`，于是「清单坏了」与
 * 「没有 file: 依赖」在读数上完全同形（P-02）。
 *
 * 本文件全在内存树 / 临时 fixture 上跑，**不碰真实 profile、不碰仓库任何文件**。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'

import { withMutationFixture } from '../lib/mutation-fixture.mjs'
import { validateGateResult } from './gate-result.mjs'
import { collectManagedManifests } from './package-collect.mjs'
import {
  PROFILE_TARGETS,
  accountPerObject,
  buildExpectedSet,
  checkTargetPresence,
  readProfileManifest,
  specTargetsPackage,
  summarizeTarget,
} from './profile-coverage.mjs'

const PROFILE_DIR = '/tmp/fixture-profile'

/** 造一份内存文件树：键是绝对路径。 */
function memoryFs(entries) {
  return {
    readText: (path) => (path in entries ? entries[path] : null),
    exists: (path) => {
      if (path in entries) return true
      // 目录：只要有以它开头的条目就算存在。
      return Object.keys(entries).some((key) => key.startsWith(`${path}/`))
    },
  }
}

const PACKAGES = [
  { relPath: 'packages/surfaces/dsh-alpha', dir: 'packages/surfaces/dsh-alpha', manifest: { name: 'dsh-alpha', files: ['lib/index.js'] } },
  { relPath: 'packages/infra/dsh-beta', dir: 'packages/infra/dsh-beta', manifest: { name: 'dsh-beta', files: ['lib/index.js'] } },
  { relPath: 'packages/contract/dsh-gamma', dir: 'packages/contract/dsh-gamma', manifest: { name: 'dsh-gamma', files: ['lib/index.js'] } },
]

/** 三个包都被声明、且处处一致的「全绿」内存树。 */
function healthyEntries({ declared = 3 } = {}) {
  const entries = {}
  entries[join(PROFILE_DIR, 'package.json')] = JSON.stringify({
    name: 'fixture-profile',
    dependencies: {
      'dsh-alpha': 'file:./vendor/packages/surfaces/dsh-alpha',
      'dsh-beta': 'file:./vendor/packages/infra/dsh-beta',
      ...(declared >= 3 ? { 'dsh-gamma': 'file:./vendor/packages/contract/dsh-gamma' } : {}),
      'unrelated-package': '^1.2.3',
    },
  })
  for (const item of PACKAGES) {
    const sourcePackageJson = JSON.stringify({ name: item.manifest.name, main: 'lib/index.js', files: item.manifest.files })
    entries[join(PROFILE_DIR, 'vendor', item.relPath, 'package.json')] = sourcePackageJson
    entries[join(PROFILE_DIR, 'node_modules', item.manifest.name, 'package.json')] = sourcePackageJson
    entries[join(PROFILE_DIR, 'node_modules', item.manifest.name, 'lib/index.js')] = 'export const x = 1\n'
  }
  return entries
}

function runTarget(target, { entries = healthyEntries(), packages = PACKAGES } = {}) {
  const fs = memoryFs(entries)
  const manifest = readProfileManifest({ readText: fs.readText, profileDir: PROFILE_DIR })
  const set = buildExpectedSet({
    profileDir: PROFILE_DIR,
    repoRoot: '/repo',
    dependencies: manifest.ok ? manifest.dependencies : {},
    packages,
  })
  return {
    manifest,
    set,
    result: summarizeTarget({
      target,
      profileDir: PROFILE_DIR,
      exists: fs.exists,
      manifest,
      set,
      judge: (item) => {
        const stored = entries[join(PROFILE_DIR, 'node_modules', item.name, 'package.json')]
        const vendor = entries[join(PROFILE_DIR, 'vendor', item.relPath, 'package.json')]
        const expected = entries[join('/repo', item.relPath, 'package.json')] ?? vendor
        if (target === 'metadata') {
          return vendor === entries[join('/repo', item.relPath, 'package.json')] || vendor === expected
            ? { passed: true, violations: [] }
            : { passed: false, violations: [`${item.relPath}: 内嵌副本 package.json 与仓库源不一致`] }
        }
        if (target === 'files') {
          return entries[join(item.loadDirSafe ?? join(PROFILE_DIR, 'node_modules', item.name), 'lib/index.js')] === undefined
            ? { passed: false, violations: [`${item.name}: files 声明的 lib/index.js 缺失`] }
            : { passed: true, violations: [] }
        }
        return stored === undefined
          ? { passed: false, violations: [`${item.name}: 装载点缺少 package.json`] }
          : { passed: true, violations: [] }
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// Red 重放：坏 JSON 必须判红
// ---------------------------------------------------------------------------

test('QG-004 Red：profile package.json 坏了必须判红，不能吞成「没有 file: 依赖」', () => {
  const entries = healthyEntries()
  entries[join(PROFILE_DIR, 'package.json')] = '{ "name": "fixture-profile", "dependencies": { '
  const manifest = readProfileManifest({ readText: memoryFs(entries).readText, profileDir: PROFILE_DIR })
  assert.equal(manifest.ok, false)
  assert.match(manifest.reason, /不是合法 JSON/)
  assert.match(manifest.reason, /静默变绿/, '原因里要点名旧实现的失败路径')
})

test('QG-004 Red：坏 JSON 时三个断言面都判红，而不是各自静默', () => {
  const entries = healthyEntries()
  entries[join(PROFILE_DIR, 'package.json')] = '{ broken'
  for (const target of PROFILE_TARGETS) {
    const { result } = runTarget(target, { entries })
    assert.equal(result.status, 'fail', `${target} 必须判红`)
    assert.equal(result.failed, 1)
    assert.ok(validateGateResult(result).valid, `${target}: ${validateGateResult(result).errors.join('；')}`)
  }
})

test('QG-004 Red：profile 根存在但读不到 package.json 也算坏，不算「没装」', () => {
  const entries = healthyEntries()
  delete entries[join(PROFILE_DIR, 'package.json')]
  const manifest = readProfileManifest({ readText: memoryFs(entries).readText, profileDir: PROFILE_DIR })
  assert.equal(manifest.ok, false)
  assert.match(manifest.reason, /读不到/)
})

// ---------------------------------------------------------------------------
// 期望集：0/N、1/N、N-1/N
// ---------------------------------------------------------------------------

test('QG-004：期望集按完整相对路径建立，不按 basename', () => {
  const { set } = runTarget('bundle')
  assert.deepEqual(set.expected.map((item) => item.relPath), [
    'packages/contract/dsh-gamma',
    'packages/infra/dsh-beta',
    'packages/surfaces/dsh-alpha',
  ])
  assert.equal(set.expected[0].vendorDir, join(PROFILE_DIR, 'vendor', 'packages/contract/dsh-gamma'))
  assert.equal(set.expected[0].loadDir, join(PROFILE_DIR, 'node_modules', 'dsh-gamma'))
})

test('QG-004：分段后缀对齐——同名不同路径的包不会互相顶替', () => {
  assert.equal(specTargetsPackage('packages/surfaces/dsh-x', 'file:./vendor/packages/surfaces/dsh-x'), true)
  assert.equal(specTargetsPackage('packages/surfaces/dsh-x', 'file:./packages/surfaces/dsh-x'), true)
  assert.equal(specTargetsPackage('packages/surfaces/dsh-x', 'file:./vendor/packages/infra/dsh-x'), false)
  // basename 相同、组不同：旧实现的 `split('/').pop()` 会认成同一个包。
  assert.equal(specTargetsPackage('packages/infra/dsh-x', 'file:./vendor/packages/surfaces/dsh-x'), false)
  assert.equal(specTargetsPackage('packages/surfaces/dsh-x', '^1.0.0'), false)
})

test('QG-004：0/N（装载点目录在，但一个包都没有）必须判红', () => {
  const full = healthyEntries()
  // 目录**存在**但空：这才是干净的 0/N。目录整个不存在是另一条判据（见下面那条），
  // 两者的报错必须指向不同的修法。
  const entries = {
    [join(PROFILE_DIR, 'package.json')]: full[join(PROFILE_DIR, 'package.json')],
    [join(PROFILE_DIR, 'vendor', '.keep')]: '',
    [join(PROFILE_DIR, 'node_modules', '.keep')]: '',
  }
  for (const target of PROFILE_TARGETS) {
    const { result } = runTarget(target, { entries })
    assert.equal(result.status, 'fail', `${target} 必须判红`)
    assert.equal(result.expected, 3)
    assert.equal(result.checked, 0)
    assert.equal(result.failed, 3)
    assert.match(result.note, /期望 3 个，核对 0 个/)
  }
})

test('QG-004：1/N（只剩一个包）必须判红——少看的那些不能从分母里消失', () => {
  const full = healthyEntries()
  const entries = { [join(PROFILE_DIR, 'package.json')]: full[join(PROFILE_DIR, 'package.json')] }
  for (const item of PACKAGES.slice(0, 1)) {
    entries[join(PROFILE_DIR, 'vendor', item.relPath, 'package.json')] = '{}'
    entries[join(PROFILE_DIR, 'node_modules', item.manifest.name, 'package.json')] = '{}'
    entries[join(PROFILE_DIR, 'node_modules', item.manifest.name, 'lib/index.js')] = 'x\n'
  }
  const { result } = runTarget('bundle', { entries })
  assert.equal(result.status, 'fail')
  assert.equal(result.expected, 3, '分母仍然是 3')
  assert.equal(result.checked, 1)
  assert.equal(result.failed, 2)
  for (const violation of result.violations) assert.match(violation, /装载点|没有它/)
})

test('QG-004：N-1/N（缺一个）必须判红并点名那一个', () => {
  const entries = healthyEntries()
  const victim = PACKAGES[1]
  delete entries[join(PROFILE_DIR, 'node_modules', victim.manifest.name, 'package.json')]
  delete entries[join(PROFILE_DIR, 'node_modules', victim.manifest.name, 'lib/index.js')]
  const { result } = runTarget('bundle', { entries })
  assert.equal(result.status, 'fail')
  assert.equal(result.expected, 3)
  assert.equal(result.checked, 2)
  assert.equal(result.failed, 1)
  assert.match(result.violations[0], /packages\/infra\/dsh-beta/)
})

test('QG-004：全绿时必须真的核对满 N 个（不能 0 个也叫绿）', () => {
  for (const target of PROFILE_TARGETS) {
    const { result } = runTarget(target)
    assert.equal(result.status, 'pass', `${target}: ${result.violations.join('；')}`)
    assert.equal(result.expected, 3)
    assert.equal(result.checked, 3)
    assert.equal(result.skipped, 0)
    assert.equal(result.failed, 0)
    assert.ok(validateGateResult(result).valid, validateGateResult(result).errors.join('；'))
    assert.match(result.note, /期望 3 个，核对 3 个/)
  }
})

test('QG-004：断言面各自结账，note 里写清是那一个面', () => {
  const notes = PROFILE_TARGETS.map((target) => runTarget(target).result.note)
  assert.match(notes[0], /断言面 metadata（vendor）/)
  assert.match(notes[1], /断言面 files（node_modules）/)
  assert.match(notes[2], /断言面 bundle（node_modules）/)
})

// ---------------------------------------------------------------------------
// 分类：受管 / 不受管 / 未声明
// ---------------------------------------------------------------------------

test('QG-004：不受管的 file: 依赖只进读数，不参与本仓库判红', () => {
  const entries = healthyEntries()
  entries[join(PROFILE_DIR, 'package.json')] = JSON.stringify({
    name: 'fixture-profile',
    dependencies: {
      'dsh-alpha': 'file:./vendor/packages/surfaces/dsh-alpha',
      'someone-elses-thing': 'file:../../other-project/thing',
    },
  })
  const { set, result } = runTarget('bundle', { entries })
  assert.deepEqual(set.unmanaged, [{ name: 'someone-elses-thing', spec: 'file:../../other-project/thing' }])
  assert.equal(set.expected.length, 1, '期望集只含受管的那个')
  assert.match(result.note, /不受管 1/)
})

test('QG-004：受管但未声明的包进读数，带 dsh 声明的会被单独点出来', () => {
  const packages = PACKAGES.map((item, index) => ({
    ...item,
    manifest: { ...item.manifest, ...(index === 2 ? { dsh: { bundle: { patch: './cordis.patch.yml' } } } : {}) },
  }))
  const entries = healthyEntries({ declared: 2 })
  const { set, result } = runTarget('bundle', { entries, packages })
  assert.deepEqual(set.undeclared.map((entry) => entry.relPath), ['packages/contract/dsh-gamma'])
  assert.equal(set.undeclared[0].declaresBundle, true)
  assert.match(result.note, /受管但未声明 1 个（其中带 dsh 声明的是 packages\/contract\/dsh-gamma）/)
  // 它是**读数**而不是判红：本机 profile 裁剪是合法的，把它判红只会换来一条豁免。
  assert.equal(result.status, 'pass')
})

test('QG-004：期望集为空只允许 skip，且必须写明「未核对任何包」', () => {
  const entries = healthyEntries()
  entries[join(PROFILE_DIR, 'package.json')] = JSON.stringify({ name: 'p', dependencies: { lodash: '^4' } })
  const { result } = runTarget('bundle', { entries })
  assert.equal(result.status, 'skip')
  assert.equal(result.checked, 0)
  assert.match(result.typedSkips[0].reason, /未核对任何包/)
})

// ---------------------------------------------------------------------------
// 目标目录缺失：只有 profile 根整体不存在才允许 skip
// ---------------------------------------------------------------------------

test('QG-004：vendor 或 node_modules 缺失必须是判红，不是 skip', () => {
  const entries = healthyEntries()
  const cases = [
    ['metadata', join(PROFILE_DIR, 'vendor')],
    ['files', join(PROFILE_DIR, 'node_modules')],
    ['bundle', join(PROFILE_DIR, 'node_modules')],
  ]
  for (const [target, dir] of cases) {
    const pruned = Object.fromEntries(Object.entries(entries).filter(([key]) => !key.startsWith(`${dir}/`)))
    const { result } = runTarget(target, { entries: pruned })
    assert.equal(result.status, 'fail', `${target} 在 ${dir} 缺失时必须判红`)
    assert.match(result.violations[0], /只有 profile 根\*\*整体\*\*不存在才允许跳过本项/)
  }
})

// ---------------------------------------------------------------------------
// 存在性层的独立自测
// ---------------------------------------------------------------------------

test('QG-004：存在性层按断言面选目标与标记文件', () => {
  const expected = PACKAGES.map((item) => ({
    name: item.manifest.name,
    relPath: item.relPath,
    vendorDir: join('/p', 'vendor', item.relPath),
    loadDir: join('/p', 'node_modules', item.manifest.name),
  }))
  const present = checkTargetPresence({ expected, target: 'metadata', exists: () => true })
  assert.equal(present.present, 3)
  assert.deepEqual(present.missing, [])

  const nothing = checkTargetPresence({
    expected,
    target: 'bundle',
    exists: (path) => path === join('/p', 'node_modules', 'dsh-beta'),
  })
  assert.equal(nothing.present, 1)
  assert.deepEqual(nothing.missing.map((entry) => entry.name).sort(), ['dsh-alpha', 'dsh-gamma'])
})

test('QG-004：对象级账目逐条判定，一个包出问题不会把别的算成失败', () => {
  const items = ['a', 'b', 'c']
  const result = accountPerObject(items, (item) => (
    item === 'b' ? { passed: false, violations: ['b 不达标'] } : { passed: true, violations: [] }
  ))
  assert.equal(result.ok, 2)
  assert.equal(result.failed, 1)
  assert.deepEqual(result.violations, ['b 不达标'])
})

// ---------------------------------------------------------------------------
// L2：真实仓库的受管清单与真实 profile 布局（只读）
// ---------------------------------------------------------------------------

test('QG-004 L2：真实受管清单能被完整路径匹配，且真实 profile 的声明全部对上', async () => {
  const packages = collectManagedManifests('/Users/lute/project/Magpie-Horch').filter((entry) => entry.dir !== '.')
  // 用真实 profile 的声明形状（`file:./vendor/packages/<组>/<包>`）构造期望集，
  // 但不读真实 profile：本测试不依赖这台机器上 profile 的具体内容。
  const dependencies = Object.fromEntries(
    packages.map((entry) => [`name-of-${entry.relPath}`, `file:./vendor/${entry.relPath}`]),
  )
  const set = buildExpectedSet({
    profileDir: '/tmp/does-not-matter',
    repoRoot: '/repo',
    dependencies,
    packages,
  })
  assert.equal(set.expected.length, packages.length, '每个受管包都必须被完整路径匹配到')
  assert.equal(set.unmanaged.length, 0)
  for (const item of set.expected) {
    assert.match(item.relPath, /^packages\/[^/]+\/[^/]+$/, `完整相对路径必须是 packages/<组>/<包>：${item.relPath}`)
  }
})

test('QG-004 L2：在临时目录上跑一遍真实读取器，确认判红路径可达（不碰真实 profile）', async () => {
  await withMutationFixture({ prefix: 'lute-qg004' }, async (fixture) => {
    const profileDir = fixture.path('profile', 'desktop')
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(join(profileDir, 'node_modules'), { recursive: true })
    mkdirSync(join(profileDir, 'vendor', 'packages', 'surfaces', 'dsh-alpha'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), '{ "name": "p", "dependencies": { ')

    const { readFileSync, existsSync } = await import('node:fs')
    const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
    const manifest = readProfileManifest({ readText, profileDir })
    assert.equal(manifest.ok, false, '真实读取器在真实文件系统上必须也判红')
  })
})
