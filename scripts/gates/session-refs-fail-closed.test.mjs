import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'

import { scanSessions } from '../role-presets/session-refs.mjs'
import { createMutationFixture } from '../lib/mutation-fixture.mjs'

const fixtures = []
afterEach(() => {
  while (fixtures.length > 0) fixtures.pop().cleanup()
})

function fixtureRoot() {
  const fixture = createMutationFixture({ prefix: 'session-refs-fail-closed' })
  fixtures.push(fixture)
  return fixture.repo
}

function writeSession(root) {
  const sessions = join(root, 'sessions')
  const dir = join(sessions, 'project', 'session')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.jsonl.zstd'), 'fixture')
  return sessions
}

function writeDecoder(root, stdout, exitCode = 0) {
  const decoder = join(root, 'fake-zstd.mjs')
  writeFileSync(decoder, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(stdout)})\nprocess.exit(${exitCode})\n`)
  chmodSync(decoder, 0o755)
  return decoder
}

test('session scan rejects a missing or symlink root instead of treating it as zero references', async () => {
  const root = fixtureRoot()
  await assert.rejects(
    scanSessions({ sessionsRoot: join(root, 'missing') }),
    /会话根不存在或不可读/,
  )

  const real = join(root, 'real')
  mkdirSync(real)
  const alias = join(root, 'alias')
  symlinkSync(real, alias)
  await assert.rejects(
    scanSessions({ sessionsRoot: alias }),
    /非 symlink 目录/,
  )
})

test('session scan rejects a decoder non-zero exit', async () => {
  const root = fixtureRoot()
  const sessionsRoot = writeSession(root)
  const decoder = writeDecoder(root, '', 9)
  await assert.rejects(
    scanSessions({ sessionsRoot, zstd: decoder }),
    /zstd 解码失败.*exit=9/,
  )
})

test('session scan rejects malformed records that could hide a preset reference', async () => {
  const root = fixtureRoot()
  const sessionsRoot = writeSession(root)
  const decoder = writeDecoder(root, '{"type":"session","agentPreset":"safe"}\n{"session":broken}\n')
  await assert.rejects(
    scanSessions({ sessionsRoot, zstd: decoder }),
    /无法解析的关键记录/,
  )
})
