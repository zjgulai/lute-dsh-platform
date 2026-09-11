import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyTypeLinks, dshPackagesInManifest, dshPackagesInSource, planTypeLinks } from './dsh-types.mjs'

function pkg(files) {
  const root = mkdtempSync(join(tmpdir(), 'lute-types-'))
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  return root
}

test('依赖收集：从 package.json 的 dependencies/devDependencies/peerDependencies 取 @deepseek-ai/*', () => {
  const root = pkg({
    'package.json': JSON.stringify({
      dependencies: { '@deepseek-ai/dsh-tools': '0.1.2-rc.1', 'ws': '^8' },
      devDependencies: { '@deepseek-ai/cordis': '4.0.1', vitest: '^4' },
      peerDependencies: { '@deepseek-ai/dsh-session': '*' },
    }),
  })

  assert.deepEqual(dshPackagesInManifest(root).sort(), [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-tools',
  ])
})

test('依赖收集：从源码 import 中取 @deepseek-ai/*，不打进普通依赖', () => {
  const root = pkg({
    'src/index.ts': 'import { defineTool } from "@deepseek-ai/dsh-tools"\nimport { readFile } from "node:fs/promises"\nimport WebSocket from "ws"\n',
    'src/client.tsx': 'import type {} from "@deepseek-ai/dsh-client-ui-slots"\n',
  })

  assert.deepEqual(dshPackagesInSource(root).sort(), [
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-tools',
  ])
})

test('类型链接计划：只为存在对应 tgz 的包生成链接，缺 tgz 的报为缺口', () => {
  const plan = planTypeLinks({
    needed: ['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-not-built'],
    available: ['@deepseek-ai/dsh-tools'],
  })

  assert.deepEqual(plan.links, ['@deepseek-ai/dsh-tools'])
  assert.deepEqual(plan.missing, ['@deepseek-ai/dsh-not-built'])
})

test('类型链接执行：目标存在时建立可达的符号链接', () => {
  const source = mkdtempSync(join(tmpdir(), 'lute-types-src-'))
  mkdirSync(join(source, 'dsh-tools'), { recursive: true })
  writeFileSync(join(source, 'dsh-tools', 'package.json'), '{"name":"@deepseek-ai/dsh-tools"}')
  const target = mkdtempSync(join(tmpdir(), 'lute-types-dst-'))
  mkdirSync(join(target, 'node_modules', '@deepseek-ai'), { recursive: true })

  const written = applyTypeLinks({ root: target, source, links: ['@deepseek-ai/dsh-tools'] })

  assert.equal(written, 1)
  assert.ok(existsSync(join(target, 'node_modules', '@deepseek-ai', 'dsh-tools', 'package.json')))
})

test('类型链接执行：不覆盖已存在的实体目录（包自装依赖优先）', () => {
  const source = mkdtempSync(join(tmpdir(), 'lute-types-src2-'))
  mkdirSync(join(source, 'dsh-tools'), { recursive: true })
  writeFileSync(join(source, 'dsh-tools', 'package.json'), '{}')
  const target = mkdtempSync(join(tmpdir(), 'lute-types-dst2-'))
  const ownDir = join(target, 'node_modules', '@deepseek-ai', 'dsh-tools')
  mkdirSync(ownDir, { recursive: true })
  writeFileSync(join(ownDir, 'package.json'), '{"own":true}')

  const written = applyTypeLinks({ root: target, source, links: ['@deepseek-ai/dsh-tools'] })

  assert.equal(written, 0)
  assert.equal(JSON.parse(readFileSync(join(ownDir, 'package.json'), 'utf8')).own, true)
})
