import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const gate = join(repoRoot, 'scripts', 'gate.mjs')
const require = createRequire(import.meta.url)

function runGate(args) {
  const result = spawnSync(process.execPath, [gate, ...args], { cwd: repoRoot, encoding: 'utf8' })
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
