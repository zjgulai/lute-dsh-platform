/**
 * The /api/dsh-role-matrix route family: `list` (the grouped card matrix) and
 * `health`. Both are read-only and carry the shared trust fence (loopback by
 * default; a live paired-device cookie is an extra allow path when
 * remote-web-ui is loaded).
 *
 * Read-only by design. The official roster owns preset authoring
 * (`agentPresets/copy` / `deletePreset` / the settings-backed default), and
 * this surface deliberately does not duplicate those writes: two owners for
 * "which preset is the default" is how a roster starts lying. What this plugin
 * adds is the one thing the official picker does not render — the two-level
 * classification carried by each preset's LUTE manifest.
 * @module dsh-role-matrix-local/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isRoleMatrixAllowed } from './access.ts'
import { collectRoleMatrix, type MatrixPayload } from './collect.ts'
import { writeJson } from './http.ts'

/** Route paths (the client bundle mirrors these literals; tests assert both sides). */
export const ROUTES = {
  list: '/api/dsh-role-matrix/list',
  health: '/api/dsh-role-matrix/health',
} as const

/** Route family dependencies (tests inject fakes). */
export interface RoleMatrixRoutesDeps {
  /** Preset root the matrix scans (one subdirectory per preset). */
  presetRoot(): string
  /** Logger. */
  logger: { warn(error: unknown): void }
  /** Scanner override (tests). */
  collect?: (root: string) => MatrixPayload
}

/**
 * Build every /api/dsh-role-matrix route (exact paths).
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param deps - preset root, logger, optional scanner override.
 * @returns the route list for ctx.webServer.register.
 */
export function makeRoutes(ctx: Context, deps: RoleMatrixRoutesDeps): WebRoute[] {
  const { presetRoot, logger } = deps
  const collect = deps.collect ?? collectRoleMatrix

  /** Guard helper: trust fence + method check. */
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (!isRoleMatrixAllowed(ctx, req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: `method not allowed: ${String(req.method)}` })
      return false
    }
    return true
  }

  return [
    {
      kind: 'exact',
      path: ROUTES.list,
      handler: (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const root = presetRoot()
          writeJson(res, 200, collect(root))
        } catch (error) {
          logger.warn(error)
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.health,
      handler: (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const payload = collect(presetRoot())
          writeJson(res, 200, {
            ok: true,
            plugin: 'role-matrix-local',
            root: payload.root,
            roles: payload.totals.roles,
            degraded: payload.totals.degraded,
          })
        } catch (error) {
          logger.warn(error)
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
  ]
}
