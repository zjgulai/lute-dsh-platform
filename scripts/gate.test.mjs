import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { nodeCommand } from './lib/real-node.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const gate = join(repoRoot, 'scripts', 'gate.mjs')
const require = createRequire(import.meta.url)

// 本文件原先自带一份 `resolveNode()`（看 basename 是不是 node，不是就 `which node`）。
// 那份兜底能用，但它是**同一事实的第二个家**——2026-09-12 提为
// scripts/lib/real-node.mjs，判据与取证随之搬过去（ADR-0009）；本文件只引用。
//
// **两半都要拿。** 第一版这里只写了 `nodeCommand().command`，于是下面 `spawnSync` 起的是
// Electron 二进制而**没有** `ELECTRON_RUN_AS_NODE`——四条 CLI 测试立刻全红（`spawnSync`
// 不报错，只是子进程不说话）。`nodeCommand()` 返回 `{command, env}` 就是防这个，
// 只取一半等于把刚拆掉的那个 bug 又装回去。判据见 scripts/gates/node-interpreter.mjs 的规则二。
const { command: NODE, env: NODE_ENV } = nodeCommand()

function runGate(args) {
  const result = spawnSync(NODE, [gate, ...args], { cwd: repoRoot, encoding: 'utf8', env: NODE_ENV })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

test('门禁 CLI：quick 模式打印校验摘要并返回退出码', () => {
  const { stdout, code } = runGate(['--mode', 'quick'])

  assert.match(stdout, /(^|\n)(ok|fail) \d+\/\d+ 项通过/)
  assert.match(stdout, /contract/)
  assert.equal(typeof code, 'number')
})

test('门禁 CLI：未知模式必须被拒绝', () => {
  const { code, stderr } = runGate(['--mode', 'bogus'])

  assert.equal(code, 2)
  assert.match(stderr, /未知模式/)
})

test('门禁 CLI：--list 暴露全部校验项名称', () => {
  const { stdout, code } = runGate(['--list'])

  assert.equal(code, 0)
  for (const name of ['package-identity', 'pin-consistency', 'gitignore-whitelist']) {
    assert.match(stdout, new RegExp(name))
  }
})

test('门禁 CLI：根包自身也受身份契约约束（负向用例）', () => {
  const { readFileSync, writeFileSync } = require('node:fs')
  const manifestPath = join(repoRoot, 'package.json')
  const original = readFileSync(manifestPath, 'utf8')
  try {
    const broken = JSON.parse(original)
    delete broken.luteOrigin
    writeFileSync(manifestPath, JSON.stringify(broken, null, 2) + '\n')
    const { code, stdout } = runGate(['--mode', 'quick'])
    assert.equal(code, 1)
    assert.match(stdout, /\.: 缺少 luteOrigin/)
  } finally {
    writeFileSync(manifestPath, original)
  }
})

// ── theme-tokens 收集器：注释不是引用，定义不是引用 ──────────────────────────
//
// 这两个用例守的是**仪器本身**：旧口径把「文本里出现过」当成「被引用」，于是
// ①一句话「不要再用 --dsw-x」会让 --dsw-x 重新变成一个必须存在的 token（写文档造违规）；
// ②主题插件自己的映射键 "--dsw-x": … 被算成「有人引用 --dsw-x」。
// 两种都让门禁答错，且都是假红——假红会训练人忽略输出。

test('theme-tokens 收集器：注释与定义不算引用，var() 才算', () => {
  const { writeFileSync, mkdirSync, rmSync } = require('node:fs')
  const { collectReferencedTokens } = require('./gates/theme-tokens.mjs')
  const fixtureRoot = join(repoRoot, '.scratch', 'theme-token-collector-fixture')
  const src = join(fixtureRoot, 'packages', 'surfaces', 'fixture-pkg', 'src')
  rmSync(fixtureRoot, { recursive: true, force: true })
  mkdirSync(src, { recursive: true })
  try {
    writeFileSync(
      join(src, 'panel.module.css'),
      [
        '/* 弃用说明：这里不要再用 var(--dsw-alias-retired-thing)，见 ADR-0000。 */',
        '.a { color: var(--dsw-alias-label-primary, #0f1115); }',
        '.b { background: var(--dsw-alias-bg-layer-2, #fff); }',
      ].join('\n'),
    )
    writeFileSync(
      join(src, 'tokens.ts'),
      [
        '// 记录：--dsw-font-mono 已弃用，别再引用。',
        'export const map = { "--dsw-alias-defined-here": "value" }',
        '// https://example.com/docs?token=--dsw-alias-in-a-url',
        "export const used = 'var(--dsw-alias-really-used)'",
      ].join('\n'),
    )
    const refs = collectReferencedTokens(fixtureRoot)
    const names = [...refs.keys()].sort()

    // 真引用被收下
    assert.deepEqual(names, ['--dsw-alias-bg-layer-2', '--dsw-alias-label-primary', '--dsw-alias-really-used'])
    // 注释里的名字不产生义务（含块注释、行注释、以及 URL 里的那一个）
    assert.equal(refs.has('--dsw-alias-retired-thing'), false)
    assert.equal(refs.has('--dsw-font-mono'), false)
    assert.equal(refs.has('--dsw-alias-in-a-url'), false)
    // 自己的定义不是自己的引用
    assert.equal(refs.has('--dsw-alias-defined-here'), false)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('theme-tokens 收集器：真引用仍然会被抓（防收紧过度）', () => {
  const { writeFileSync, mkdirSync, rmSync } = require('node:fs')
  const { collectReferencedTokens } = require('./gates/theme-tokens.mjs')
  const fixtureRoot = join(repoRoot, '.scratch', 'theme-token-collector-fixture-2')
  const src = join(fixtureRoot, 'packages', 'surfaces', 'fixture-pkg', 'src')
  rmSync(fixtureRoot, { recursive: true, force: true })
  mkdirSync(src, { recursive: true })
  try {
    // 基线上那 8 条违规的形状：var() 里一个没人定义的名字，必须仍然被抓到。
    writeFileSync(join(src, 'bad.css'), '.x { background: var(--dsw-alias-fill-tsp-secondary, rgba(0,0,0,.06)); }\n')
    const refs = collectReferencedTokens(fixtureRoot)
    assert.equal(refs.has('--dsw-alias-fill-tsp-secondary'), true)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
