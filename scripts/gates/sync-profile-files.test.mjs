import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkProfileFilesSync } from './sync-profile.mjs'

/**
 * 构造一个「源码目录 + profile 副本目录」对。
 * files 是包 package.json 的 files 清单；sourceEntries 只写入源码目录，
 * copyEntries 只写入副本目录（用于制造两侧各自的缺件）。
 */
async function makePair({ files, sourceEntries = [], copyEntries = [] }) {
  const root = await mkdtemp(join(tmpdir(), 'profile-files-'))
  const sourceDir = join(root, 'source')
  const targetDir = join(root, 'target')
  for (const entry of sourceEntries) await write(join(sourceDir, entry))
  for (const entry of copyEntries) await write(join(targetDir, entry))
  await mkdir(sourceDir, { recursive: true })
  await mkdir(targetDir, { recursive: true })
  // 副本内有 package.json 才算「已安装」——与 checkProfileMetadata 的跳过语义一致。
  await writeFile(join(targetDir, 'package.json'), '{}\n')
  return { name: 'fixture-pkg', files, sourceDir, targetDir }
}

async function write(path) {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, 'x\n')
}

test('源码有而 profile 副本缺失的文件必须报违规（本案 lib/lint-preset.mjs 的形态）', async () => {
  const pair = await makePair({
    files: ['lib/index.js', 'lib/lint-preset.mjs'],
    sourceEntries: ['lib/index.js', 'lib/lint-preset.mjs'],
    copyEntries: ['lib/index.js'],
  })

  const result = checkProfileFilesSync([pair])
  assert.equal(result.passed, false, `副本缺件必须失败，实际=${JSON.stringify(result)}`)
  assert.ok(
    result.violations.some((v) => v.includes('lib/lint-preset.mjs')),
    `违规信息必须点名具体文件，实际=${JSON.stringify(result.violations)}`,
  )
})

test('清单声明但源码里不存在的条目必须报违规（陈旧清单形态）', async () => {
  const pair = await makePair({
    files: ['lib/index.js', 'lib/invariant.js'],
    sourceEntries: ['lib/index.js'],
    copyEntries: ['lib/index.js'],
  })

  const result = checkProfileFilesSync([pair])
  assert.equal(result.passed, false, `陈旧清单必须失败，实际=${JSON.stringify(result)}`)
  assert.ok(
    result.violations.some((v) => v.includes('lib/invariant.js')),
    `违规信息必须点名具体文件，实际=${JSON.stringify(result.violations)}`,
  )
})

test('源码与副本一致的包不报违规', async () => {
  const pair = await makePair({
    files: ['lib/index.js', 'lib/client.js'],
    sourceEntries: ['lib/index.js', 'lib/client.js'],
    copyEntries: ['lib/index.js', 'lib/client.js'],
  })

  const result = checkProfileFilesSync([pair])
  assert.deepEqual(result.violations, [], `一致时不应报违规，实际=${JSON.stringify(result.violations)}`)
  assert.equal(result.passed, true)
})
