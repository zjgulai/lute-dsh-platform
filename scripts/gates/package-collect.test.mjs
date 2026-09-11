import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectPackages } from './package-collect.mjs'

function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), 'lute-collect-'))
  for (const [rel, manifest] of Object.entries(entries)) {
    mkdirSync(join(root, rel), { recursive: true })
    writeFileSync(join(root, rel, 'package.json'), JSON.stringify(manifest))
  }
  return root
}

test('包收集：产物用 entries 按固定顺序排列，条目含 relPath/dir/group/manifest', () => {
  const root = fixture({
    'packages/capabilities/dsh-a': { name: 'a', luteOrigin: 'self' },
    'packages/infra/dsh-b': { name: 'b', luteOrigin: 'self' },
    '.': { name: 'root' },
  })

  const { packages } = collectPackages(root)

  assert.deepEqual(
    packages.map((entry) => entry.relPath),
    ['packages/capabilities/dsh-a', 'packages/infra/dsh-b'],
  )
  assert.equal(packages[0].group, 'capabilities')
  assert.equal(packages[1].group, 'infra')
})

test('包收集：根包单列，不混入受管包列表', () => {
  const root = fixture({ 'packages/platform/dsh-a': { name: 'a', luteOrigin: 'self' }, '.': { name: 'root', luteOrigin: 'self' } })

  const { packages, rootManifest } = collectPackages(root)

  assert.equal(rootManifest.name, 'root')
  assert.deepEqual(packages.map((entry) => entry.relPath), ['packages/platform/dsh-a'])
})
