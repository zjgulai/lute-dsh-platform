import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256, gitBlobOid, unitFiles } from '../scripts/fetch-third-party-skills.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = join(HERE, '..', 'scripts')

test('SEC-RT-002: 双重哈希计算算法（SHA-256 与 Git blob OID）一致性', () => {
  const content = Buffer.from('hello world', 'utf8')
  
  // 1. sha256
  const sha = sha256(content)
  assert.equal(sha, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')

  // 2. gitBlobOid: sha1("blob 11\0hello world")
  const oid = gitBlobOid(content)
  assert.equal(oid, '95d09f2b10159347eece71399a7e2e907ea3df4f')
})

test('SEC-RT-002: intake 清单与 fetch 脚本必须强制不可变 commit，禁止 HEAD 浮动引用', () => {
  const fetchScript = readFileSync(join(SCRIPTS_DIR, 'fetch-third-party-skills.mjs'), 'utf8')
  assert.ok(!fetchScript.includes('trees/HEAD'), 'fetch 脚本不得包含 trees/HEAD')
  assert.ok(!fetchScript.includes('/HEAD/'), 'fetch 脚本不得包含 /HEAD/ raw 路径')

  const inventory = JSON.parse(readFileSync(join(SCRIPTS_DIR, 'third-party-source-inventory.json'), 'utf8'))
  for (const repo of inventory.repos) {
    assert.ok(repo.commit, `repo ${repo.id} 必须包含不可变 commit`)
    assert.match(repo.commit, /^[0-9a-f]{40}$/i, `commit 必须为 40 位十六进制 SHA`)
  }

  const intake = JSON.parse(readFileSync(join(SCRIPTS_DIR, 'third-party-intake.json'), 'utf8'))
  for (const repo of intake.repos) {
    assert.ok(repo.commit, `intake repo ${repo.id} 必须包含不可变 commit`)
    assert.match(repo.commit, /^[0-9a-f]{40}$/i, `intake commit 必须为 40 位十六进制 SHA`)
  }
})

test('SEC-RT-002: import-fullstack 严禁 /tmp 回退路径', () => {
  const importScript = readFileSync(join(SCRIPTS_DIR, 'import-fullstack.mjs'), 'utf8')
  assert.ok(!importScript.includes('/tmp/'), 'import-fullstack 脚本禁止包含 /tmp 回退目录')
})
