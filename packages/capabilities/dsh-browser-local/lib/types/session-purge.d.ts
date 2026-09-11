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
/** Stable failure codes surfaced to the panel. Open set: callers must tolerate growth. */
export type SessionPurgeErrorCode = 'not-found' | 'running' | 'invalid-id' | 'internal';
/** Error thrown by {@link purgeSessionFiles}; the server turns it into a wire error. */
export declare class SessionPurgeError extends Error {
    readonly code: SessionPurgeErrorCode;
    constructor(code: SessionPurgeErrorCode, message: string);
}
/** Dependencies purging needs from the plugin. */
export interface SessionPurgeDeps {
    /** The dsh sessions root (`dshHomePath('sessions')`). */
    sessionsRoot: string;
    /** Session ids currently running; purging any of these is refused. */
    runningSessionIds: ReadonlySet<string>;
}
/**
 * Validate one session id against the persisted shape. Rejects everything
 * that could escape the sessions root (separators, dot segments) before any
 * filesystem call sees it.
 * @param sessionId - untrusted id from the panel.
 * @returns the id when well-formed.
 * @throws SessionPurgeError with code `invalid-id` otherwise.
 */
export declare function assertPurgeableSessionId(sessionId: string): string;
/**
 * Permanently delete every durable directory of one session. Idempotent over
 * multiple workspaces: each workspace directory may hold its own copy of the
 * session, and all of them are removed.
 * @param deps - root and running-set inputs.
 * @param sessionId - validated session id.
 * @returns nothing; throws {@link SessionPurgeError} on refusal or failure.
 */
export declare function purgeSessionFiles(deps: SessionPurgeDeps, sessionId: string): Promise<void>;
//# sourceMappingURL=session-purge.d.ts.map