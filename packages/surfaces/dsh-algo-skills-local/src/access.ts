/**
 * Algorithm-skills trust fence.
 *
 * Loopback (the desktop) always passes; a live paired-device cookie is an
 * additional allow path when remote-web-ui is loaded. The plugin never depends
 * on that plugin — without the service the fence stays loopback-only. The
 * decision logic lives in the generated `pair-access.ts` copy, shared with the
 * role matrix, the skill center and the New App launcher.
 *
 * The tree route is read-only, but it is not public: it discloses this
 * machine's role roster, its card inventory and which cards each preset
 * actually mounts. That is an internal picture of the organization, not a
 * directory listing.
 * @module dsh-algo-skills-local/access
 */

import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { isPairedOrLoopbackAllowed } from './pair-access.ts'

/**
 * Whether this request may enter any /api/dsh-algo-skills route.
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param request - the incoming HTTP request.
 * @returns true for loopback, or a live paired-device cookie.
 */
export function isAlgoSkillsAllowed(ctx: Context, request: IncomingMessage): boolean {
  return isPairedOrLoopbackAllowed(ctx, request)
}
