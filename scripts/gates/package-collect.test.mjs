import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { collectManagedManifests, collectPackages } from './package-collect.mjs'
import { createMutationFixture } from '../lib/mutation-fixture.mjs'

const fixtures = []
afterEach(() => {
  while (fixtures.length > 0) fixtures.pop().cleanup()
})

function fixture(entries) {
  const owned = createMutationFixture({ prefix: 'lute-collect' })
  fixtures.push(owned)
  const root = owned.repo
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

test('身份判定面：根包与受管包由同一收集器给出，根包固定登记为点路径', () => {
  const root = fixture({
    'packages/platform/dsh-a': { name: 'a', luteOrigin: 'self' },
    '.': { name: 'root', luteOrigin: 'self' },
  })

  const entries = collectManagedManifests(root)

  assert.deepEqual(entries.map((entry) => entry.dir), ['.', 'packages/platform/dsh-a'])
})
