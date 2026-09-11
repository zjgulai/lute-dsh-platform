import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverPackages, packageRelPath } from './package-layout.mjs'

function fixture(relPaths) {
  const root = mkdtempSync(join(tmpdir(), 'lute-layout-'))
  for (const rel of relPaths) {
    mkdirSync(join(root, rel), { recursive: true })
    writeFileSync(join(root, rel, 'package.json'), JSON.stringify({ name: rel.split('/').pop() }))
  }
  return root
}

test('包发现：只认归组布局 packages/<组>/<包>（历史平铺已退役，ADR-0011 二期迁移完成）', () => {
  const root = fixture(['packages/capabilities/dsh-overseas-skills', 'dsh-theme-local'])

  const found = discoverPackages(root).map((entry) => entry.relPath).sort()

  assert.deepEqual(
    found,
    ['packages/capabilities/dsh-overseas-skills'],
    '根层平铺目录即使含 package.json 也不得被当作受管包（过渡期兼容分支已退役）',
  )
})

test('包发现：无 package.json 的目录不计为包', () => {
  const root = fixture(['packages/infra/dsh-team-hub'])
  mkdirSync(join(root, 'dsh-renderer-heal'), { recursive: true })

  const found = discoverPackages(root).map((entry) => entry.relPath)

  assert.deepEqual(found, ['packages/infra/dsh-team-hub'])
})

test('包相对路径：归组后的包以组路径表达，供 profile file: 依赖使用', () => {
  const root = fixture(['packages/surfaces/dsh-my-quotes'])

  const [entry] = discoverPackages(root)

  assert.equal(packageRelPath(entry), 'packages/surfaces/dsh-my-quotes')
})
