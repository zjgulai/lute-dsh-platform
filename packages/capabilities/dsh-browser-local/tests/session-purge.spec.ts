import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionPurgeError, assertPurgeableSessionId, purgeSessionFiles } from '../src/session-purge.ts'

const SESSION_A = 'session-82222a77-aab5-4c0b-b33e-6376973ec93d'
const SESSION_B = 'session-92bad0de-136e-4d1f-a308-d1f5388d608f'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

async function makeSessionsRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-session-purge-'))
  tempRoots.push(root)
  return root
}

async function makeSession(root: string, workspace: string, sessionId: string): Promise<string> {
  const dir = path.join(root, workspace, sessionId)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'session.jsonl.zstd'), 'x')
  return dir
}

describe('assertPurgeableSessionId', () => {
  it('accepts the persisted session-id shape', () => {
    expect(assertPurgeableSessionId(SESSION_A)).toBe(SESSION_A)
  })

  it.each([
    ['../escape'],
    ['workspace/../../escape'],
    ['not-a-uuid'],
    ['session-82222a77'],
    [''],
  ])('rejects %j', (sessionId) => {
    expect(() => assertPurgeableSessionId(sessionId)).toThrow(SessionPurgeError)
    try {
      assertPurgeableSessionId(sessionId)
    } catch (error) {
      expect((error as SessionPurgeError).code).toBe('invalid-id')
    }
  })
})

describe('purgeSessionFiles', () => {
  it('removes the session directory in every workspace and keeps siblings', async () => {
    const root = await makeSessionsRoot()
    const targetA = await makeSession(root, '--Users-apple-browser-sessions--', SESSION_A)
    const targetB = await makeSession(root, '--other-workspace--', SESSION_A)
    const sibling = await makeSession(root, '--Users-apple-browser-sessions--', SESSION_B)

    await purgeSessionFiles({ sessionsRoot: root, runningSessionIds: new Set() }, SESSION_A)

    await expect(stat(targetA)).rejects.toThrow()
    await expect(stat(targetB)).rejects.toThrow()
    await expect(stat(sibling)).resolves.toBeTruthy()
  })

  it('refuses running sessions before touching the disk', async () => {
    const root = await makeSessionsRoot()
    const target = await makeSession(root, 'ws', SESSION_A)

    await expect(purgeSessionFiles(
      { sessionsRoot: root, runningSessionIds: new Set([SESSION_A]) },
      SESSION_A,
    )).rejects.toMatchObject({ code: 'running' })
    await expect(stat(target)).resolves.toBeTruthy()
  })

  it('reports not-found when no durable directory matches', async () => {
    const root = await makeSessionsRoot()
    await expect(purgeSessionFiles({ sessionsRoot: root, runningSessionIds: new Set() }, SESSION_A))
      .rejects.toMatchObject({ code: 'not-found' })
  })

  it('rejects ids that do not match the persisted shape', async () => {
    const root = await makeSessionsRoot()
    await expect(purgeSessionFiles({ sessionsRoot: root, runningSessionIds: new Set() }, '../escape'))
      .rejects.toMatchObject({ code: 'invalid-id' })
  })
})
