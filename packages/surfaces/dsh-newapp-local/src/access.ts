/**
 * Per-package trust-fence wrapper for dsh-newapp-local.
 *
 * A self-describing alias over the shared decision (shared/host/pair-access.ts)
 * so this plugin's own call sites read as its own policy. The security decision
 * itself lives only in the shared module — a per-package re-implementation is
 * how two plugins end up disagreeing about who is allowed in.
 * @module dsh-newapp-local/access
 */
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { isPairedOrLoopbackAllowed } from './pair-access.ts'

/**
 * Whether this request may enter the New App launcher's host routes.
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param request - the incoming HTTP request.
 * @returns true for loopback, or a live paired-device cookie.
 */
export function isNewAppAllowed(ctx: Context, request: IncomingMessage): boolean {
  return isPairedOrLoopbackAllowed(ctx, request)
}
