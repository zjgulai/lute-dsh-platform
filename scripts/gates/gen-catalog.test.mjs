import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderCatalog, groupOf } from '../gen-catalog.mjs'
import { checkCatalogFresh } from './checks.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

test('目录墙：显示物理路径（归组后即为 packages/<组>/<包>）', () => {
  const catalog = renderCatalog({
    packages: [
      { relPath: 'packages/capabilities/dsh-overseas-skills', dir: 'packages/capabilities/dsh-overseas-skills', group: 'capabilities', manifest: { name: 'dsh-overseas-skills', version: '0.1.0', luteOrigin: 'self', luteOwner: 'lute', lutePublish: false } },
    ],
  })

  assert.match(catalog, /\| capabilities \| `packages\/capabilities\/dsh-overseas-skills` \|/)
})

test('目录墙：按能力组归类受管包', () => {
  const catalog = renderCatalog({
    packages: [
      { dir: 'dsh-overseas-skills', manifest: { name: 'dsh-overseas-skills', version: '0.1.0', luteOrigin: 'self', luteOwner: 'lute', lutePublish: false } },
      { dir: 'dsh-team-hub', manifest: { name: 'dsh-team-hub', version: '0.2.7', luteOrigin: 'self', luteOwner: 'lute', lutePublish: false } },
    ],
  })

  assert.match(catalog, /# 受管包目录墙/)
  assert.match(catalog, /\| capabilities \| `dsh-overseas-skills` \|/)
  assert.match(catalog, /\| infra \| `dsh-team-hub` \|/)
  assert.match(catalog, /## 分组统计/)
})

test('目录墙：表格包含目录、包名、来源、owner、是否发布', () => {
  const catalog = renderCatalog({
    packages: [
      { dir: 'dsh-loopx-plugin', manifest: { name: 'dsh-loopx-plugin', version: '0.1.1-beta.4', luteOrigin: 'self', luteOwner: 'lute', lutePublish: true } },
    ],
  })

  assert.match(catalog, /\| capabilities \| `dsh-loopx-plugin` \| `dsh-loopx-plugin` \| `self` \| `lute` \| `true` \|/)
})

test('目录墙：同一批输入两次渲染结果一致（可作门禁比对）', () => {
  const input = {
    packages: [
      { dir: 'dsh-theme-local', manifest: { name: 'dsh-theme', version: '0.1.0-local.1', luteOrigin: 'self', luteOwner: 'lute', lutePublish: false } },
    ],
  }

  assert.equal(renderCatalog(input), renderCatalog(input))
})

test('能力组归属：每个受管包都落在声明的五组之一', () => {
  const groups = ['capabilities', 'surfaces', 'platform', 'contract', 'infra']
  for (const dir of ['dsh-overseas-skills', 'dsh-agent-team-gui-local', 'dsh-theme-local', 'dsh-skill-subset', 'dsh-team-hub', 'dsh-patches', 'dsh-renderer-heal']) {
    assert.ok(groups.includes(groupOf(dir)), `${dir} 应归属五组之一，实际 ${groupOf(dir)}`)
  }
})

test('目录墙新鲜度：产物与再生成结果不一致必须被拒绝', () => {
  const result = checkCatalogFresh({
    current: '# 受管包目录墙\n\n被手改过的内容\n',
    regenerated: '# 受管包目录墙\n\n生成器输出\n',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'docs/catalog/packages.md: 与再生成结果不一致（生成物请勿手改，运行 node scripts/gen-catalog.mjs 更新，ADR-0011）',
  ])
})

test('目录墙新鲜度：产物与再生成结果一致时通过', () => {
  const text = '# 受管包目录墙\n'
  const result = checkCatalogFresh({ current: text, regenerated: text })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})
