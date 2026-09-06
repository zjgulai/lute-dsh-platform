/**
 * File-level removal of one session's durable storage under the dsh home.
 *
 * The gateway exposes no session.delete, so the bridge performs the removal
 * itself: archive first (index update via `workspace.archiveSession`, done by
 * the caller), then this module deletes the session directories. Strictly
 * defensive: session ids are validated against the persisted shape, only
 * exact-name directories two levels below the sessions root are removed, and
 * running sessions are refused before anything touches the disk.
 *
 * @module @yuxianglin/dsh-bridge-browser/src/session-purge
 */

import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'

/** Stable failure codes surfaced to the panel. Open set: callers must tolerate growth. */
export type SessionPurgeErrorCode = 'not-found' | 'running' | 'invalid-id' | 'internal'

/** Error thrown by {@link purgeSessionFiles}; the server turns it into a wire error. */
export class SessionPurgeError extends Error {
  constructor(
    readonly code: SessionPurgeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SessionPurgeError'
  }
}

/** Persisted session ids are `session-` plus one lowercase UUID. */
const SESSION_ID_PATTERN = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

/** Dependencies purging needs from the plugin. */
export interface SessionPurgeDeps {
  /** The dsh sessions root (`dshHomePath('sessions')`). */
  sessionsRoot: string
  /** Session ids currently running; purging any of these is refused. */
  runningSessionIds: ReadonlySet<string>
}

/**
 * Validate one session id against the persisted shape. Rejects everything
 * that could escape the sessions root (separators, dot segments) before any
 * filesystem call sees it.
 * @param sessionId - untrusted id from the panel.
 * @returns the id when well-formed.
 * @throws SessionPurgeError with code `invalid-id` otherwise.
 */
export function assertPurgeableSessionId(sessionId: string): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new SessionPurgeError('invalid-id', `session id "${sessionId}" does not match the persisted shape`)
  }
  return sessionId
}

/**
 * Permanently delete every durable directory of one session. Idempotent over
 * multiple workspaces: each workspace directory may hold its own copy of the
 * session, and all of them are removed.
 * @param deps - root and running-set inputs.
 * @param sessionId - validated session id.
 * @returns nothing; throws {@link SessionPurgeError} on refusal or failure.
 */
export async function purgeSessionFiles(deps: SessionPurgeDeps, sessionId: string): Promise<void> {
  assertPurgeableSessionId(sessionId)
  if (deps.runningSessionIds.has(sessionId)) {
    throw new SessionPurgeError('running', 'refusing to purge a running session; cancel it first')
  }

  let workspaces: string[]
  try {
    workspaces = await readdir(deps.sessionsRoot, { withFileTypes: true })
      .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  } catch (error: unknown) {
    throw new SessionPurgeError('internal', `could not read the sessions root "${deps.sessionsRoot}": ${String(error)}`)
  }

  const targets: string[] = []
  for (const workspace of workspaces) {
    // path.join is safe here: the id pattern above excludes separators and
    // dot segments, so the joined segment cannot escape the workspace dir.
    const candidate = path.join(deps.sessionsRoot, workspace, sessionId)
    try {
      await readdir(candidate)
      targets.push(candidate)
    } catch {
      // Absent in this workspace: nothing to remove there.
    }
  }

  if (targets.length === 0) {
    throw new SessionPurgeError('not-found', `no durable storage found for session "${sessionId}"`)
  }
  for (const target of targets) {
    try {
      await rm(target, { recursive: true, force: true })
    } catch (error: unknown) {
      throw new SessionPurgeError('internal', `could not remove "${target}": ${String(error)}`)
    }
  }
}
