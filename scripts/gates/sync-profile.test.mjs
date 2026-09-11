import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, linkSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applySync, checkProfileMetadata, planSync } from './sync-profile.mjs'

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
  assert.deepEqual(result.violations, ['a: live profile 副本的 package.json 与仓库源不一致（运行 scripts/sync-profile.mjs --apply --only-metadata）'])
})

test('副本元数据校验：副本不存在该包时视为未安装，不报错', () => {
  const { src, dst } = fixture()
  writeFileSync(join(src, 'package.json'), '{"name":"a"}\n')

  const result = checkProfileMetadata([{ name: 'a', sourceDir: src, targetDir: join(dst, 'not-installed') }])

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})
