/**
 * Role-matrix trust fence: loopback (the desktop) always passes; a live
 * paired-device cookie is an additional allow path when remote-web-ui is
 * loaded. The plugin never depends on that plugin — without the service the
 * fence stays loopback-only. The decision logic lives in the generated
 * pair-access.ts copy (shared with skill-center / task-board).
 *
 * The matrix route is read-only (it exposes preset display metadata and the
 * LUTE manifest of each role preset), but it still rides the fence: the
 * manifest carries collaboration and skill inventories that are not meant for
 * an unpaired LAN client.
 */
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { isPairedOrLoopbackAllowed } from './pair-access.ts'

/**
 * Whether this request may enter any /api/dsh-role-matrix route.
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param request - the incoming HTTP request.
 * @returns true for loopback, or a live paired-device cookie.
 */
export function isRoleMatrixAllowed(ctx: Context, request: IncomingMessage): boolean {
  return isPairedOrLoopbackAllowed(ctx, request)
}
