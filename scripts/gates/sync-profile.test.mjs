import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, linkSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applySync, checkProfileBundleSync, checkProfileMetadata, loadPointFiles, planSync } from './sync-profile.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lute-sync-'))
  const src = join(root, 'src')
  const dst = join(root, 'dst')
  mkdirSync(src)
  mkdirSync(dst)
  writeFileSync(join(src, 'a.js'), 'export const a = 1\n')
  writeFileSync(join(dst, 'a.js'), 'export const a = 0\n')
  return { root, src, dst }
}

test('同步计划：内容不同的文件列入待同步，内容相同的不列', () => {
  const { src, dst } = fixture()
  writeFileSync(join(src, 'same.js'), 'same\n')
  writeFileSync(join(dst, 'same.js'), 'same\n')

  const plan = planSync(src, dst, ['a.js', 'same.js'])

  assert.deepEqual(plan.diverged, ['a.js'])
})

test('同步计划：副本缺失的文件只登记为 absentInTarget，不得被追加（副本可能含运行所需产物）', () => {
  const { src, dst } = fixture()
  writeFileSync(join(src, 'only-src.js'), 'new\n')

  const plan = planSync(src, dst, ['only-src.js'])

  assert.deepEqual(plan.absentInTarget, ['only-src.js'])
  assert.deepEqual(plan.diverged, [])
})

test('同步执行：原子替换后目标内容更新，且硬链接按 file 语义被切断', () => {
  const { src, dst } = fixture()
  const twin = join(dst, 'a-twin.js')
  linkSync(join(dst, 'a.js'), twin)

  applySync(src, dst, ['a.js'])

  assert.equal(readFileSync(join(dst, 'a.js'), 'utf8'), 'export const a = 1\n')
  assert.equal(
    readFileSync(twin, 'utf8'),
    'export const a = 0\n',
    'tmp+mv 会以新 inode 替换目标，双胞胎保留旧内容——这正是架构红线第 4 条的语义',
  )
  assert.notEqual(statSync(join(dst, 'a.js')).ino, statSync(twin).ino, '替换后两者不再共享 inode')
})

test('副本元数据校验：package.json 内容与仓库不一致必须被拒绝', () => {
  const { src, dst } = fixture()
  writeFileSync(join(src, 'package.json'), '{"name":"a","luteOrigin":"self"}\n')
  writeFileSync(join(dst, 'package.json'), '{"name":"a"}\n')

  const result = checkProfileMetadata([{ name: 'a', sourceDir: src, targetDir: dst }])

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['a: 内嵌副本（profile/vendor）的 package.json 与仓库源不一致（运行 scripts/sync-profile.mjs --apply --only-metadata）'])
})

test('副本元数据校验：副本不存在该包时视为未安装，不报错', () => {
  const { src, dst } = fixture()
  writeFileSync(join(src, 'package.json'), '{"name":"a"}\n')

  const result = checkProfileMetadata([{ name: 'a', sourceDir: src, targetDir: join(dst, 'not-installed') }])

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('装载点断言面：lib 顶层 bundle 直接读源码目录，类型产物/文档/package.json/备份不进面', () => {
  const { src } = fixture()
  mkdirSync(join(src, 'lib/types/client'), { recursive: true })
  writeFileSync(join(src, 'lib/index.js'), 'host\n')
  writeFileSync(join(src, 'lib/client.js'), 'web\n')
  writeFileSync(join(src, 'lib/lint-preset.mjs'), 'tool\n')
  writeFileSync(join(src, 'lib/client.js.map'), 'map\n')
  writeFileSync(join(src, 'lib/globals.d.ts'), 'types\n')
  writeFileSync(join(src, 'lib/client.js.bak-cn-slash'), 'backup\n')
  writeFileSync(join(src, 'lib/types/client/index.js'), 'types\n')
  // 声明的目录条目（`lib`）不展开；声明的**文件**条目要进面。
  mkdirSync(join(src, 'manifest'), { recursive: true })
  writeFileSync(join(src, 'manifest/role-assignments.json'), '{}\n')

  assert.deepEqual(
    // `lib/**` 这种通配条目取不到具体文件——正因如此断言面才直接读源码目录。
    loadPointFiles(src, ['lib/**', 'README.md', 'package.json', 'manifest/role-assignments.json']),
    ['lib/client.js', 'lib/index.js', 'lib/lint-preset.mjs', 'manifest/role-assignments.json'],
  )
})

test('装载点内容校验：副本旧但存在必须被拒绝（这正是「门禁全绿但功能没生效」的形态）', () => {
  const { src, dst } = fixture()
  mkdirSync(join(src, 'lib'))
  mkdirSync(join(dst, 'lib'))
  // 同一个文件、同一长度区间，但仓库已经改过而副本停在旧字节。
  writeFileSync(join(src, 'lib/client.js'), 'register("settings.section")\n')
  writeFileSync(join(dst, 'lib/client.js'), 'register("conversation.input.dock")\n')
  writeFileSync(join(dst, 'package.json'), '{"name":"a"}\n')

  const result = checkProfileBundleSync([{ name: 'a', sourceDir: src, targetDir: dst, files: ['lib/client.js'] }])

  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /装载点的 lib\/client\.js 与仓库源字节不一致/)
})

test('装载点内容校验：lib/types 下的类型产物漂移不算违规（装载点不执行它们）', () => {
  const { src, dst } = fixture()
  mkdirSync(join(src, 'lib/types'), { recursive: true })
  mkdirSync(join(dst, 'lib/types'), { recursive: true })
  writeFileSync(join(src, 'lib/types/index.js'), 'export type A = 2\n')
  writeFileSync(join(dst, 'lib/types/index.js'), 'export type A = 1\n')
  writeFileSync(join(dst, 'package.json'), '{"name":"a"}\n')

  const result = checkProfileBundleSync([{ name: 'a', sourceDir: src, targetDir: dst, files: ['lib/index.js', 'lib/types/index.js'] }])

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('装载点内容校验：逐字节相同的 bundle 通过', () => {
  const { src, dst } = fixture()
  mkdirSync(join(src, 'lib'))
  mkdirSync(join(dst, 'lib'))
  writeFileSync(join(src, 'lib/client.js'), 'same bytes\n')
  writeFileSync(join(dst, 'lib/client.js'), 'same bytes\n')
  writeFileSync(join(dst, 'package.json'), '{"name":"a"}\n')

  const result = checkProfileBundleSync([{ name: 'a', sourceDir: src, targetDir: dst, files: ['lib/client.js'] }])

  assert.equal(result.passed, true)
})
