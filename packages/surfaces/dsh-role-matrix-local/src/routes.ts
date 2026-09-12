/**
 * The /api/dsh-role-matrix route family: `list` (the grouped card matrix),
 * `capabilities` (one preset's role capabilities, for the composer hero entry)
 * and `health`. All are read-only and carry the shared trust fence (loopback by
 * default; a live paired-device cookie is an extra allow path when
 * remote-web-ui is loaded).
 *
 * Read-only by design. The official roster owns preset authoring
 * (`agentPresets/copy` / `deletePreset` / the settings-backed default), and
 * this surface deliberately does not duplicate those writes: two owners for
 * "which preset is the default" is how a roster starts lying. What this plugin
 * adds is the one thing the official picker does not render — the two-level
 * classification carried by each preset's LUTE manifest.
 *
 * `capabilities` is a *second projection of the same read*, not a second
 * source: `list` groups all presets for the matrix panel, `capabilities`
 * answers for one preset with the skill detail the matrix row does not carry.
 * It is addressed by query (`?preset=agt-027`) rather than by path segment so
 * the route table stays a fixed set of exact paths, and it validates the id
 * against the roster's own pattern before touching the filesystem.
 * @module dsh-role-matrix-local/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isRoleMatrixAllowed } from './access.ts'
import { readCapabilities, type PresetCapabilities } from './capabilities.ts'
import { collectRoleMatrix, ROLE_PRESET_ID, type MatrixPayload } from './collect.ts'
import { writeJson } from './http.ts'

/** Route paths (the client bundle mirrors these literals; tests assert both sides). */
export const ROUTES = {
  list: '/api/dsh-role-matrix/list',
  capabilities: '/api/dsh-role-matrix/capabilities',
  health: '/api/dsh-role-matrix/health',
} as const

/** Route family dependencies (tests inject fakes). */
export interface RoleMatrixRoutesDeps {
  /** Preset root the matrix scans (one subdirectory per preset). */
  presetRoot(): string
  /** Installed-skills root, read for skill display names (`<root>/<id>/SKILL.md`). */
  skillsRoot(): string
  /** Logger. */
  logger: { warn(error: unknown): void }
  /** Scanner override (tests). */
  collect?: (root: string) => MatrixPayload
  /** Capability reader override (tests). */
  capabilities?: (presetId: string) => PresetCapabilities | undefined
}

/**
 * Read the `preset` query parameter from a request line.
 *
 * A malformed request target yields `undefined` rather than throwing: an
 * unparseable URL is a bad request, and the handler already has a branch for
 * that. Built against a dummy origin because the request target is a path.
 * @param req - the HTTP request.
 * @returns the parameter value, or undefined.
 */
function presetParam(req: IncomingMessage): string | undefined {
  try {
    const value = new URL(req.url ?? '', 'http://localhost').searchParams.get('preset')
    return value === null ? undefined : value
  } catch {
    return undefined
  }
}

/**
 * Build every /api/dsh-role-matrix route (exact paths).
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param deps - preset root, logger, optional scanner override.
 * @returns the route list for ctx.webServer.register.
 */
export function makeRoutes(ctx: Context, deps: RoleMatrixRoutesDeps): WebRoute[] {
  const { presetRoot, skillsRoot, logger } = deps
  const collect = deps.collect ?? collectRoleMatrix
  const capabilities = deps.capabilities
    ?? ((presetId: string): PresetCapabilities | undefined =>
      readCapabilities(presetRoot(), skillsRoot(), presetId))

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
      path: ROUTES.capabilities,
      handler: (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        const preset = presetParam(req)
        if (preset === undefined || preset === '') {
          writeJson(res, 400, { error: 'missing query parameter: preset' })
          return
        }
        // Reject anything that is not a role preset *before* the filesystem sees
        // it. The reader repeats this check (it is the containment boundary
        // there); here it buys a precise status code instead of a blanket 404 —
        // "you asked about an application preset" and "that role is not
        // installed" are different facts, and only one of them is fixed by
        // installing something.
        if (!ROLE_PRESET_ID.test(preset)) {
          writeJson(res, 400, { error: `not a role preset id: ${preset}` })
          return
        }
        try {
          const payload = capabilities(preset)
          if (payload === undefined) {
            writeJson(res, 404, { error: `role preset not installed: ${preset}` })
            return
          }
          writeJson(res, 200, { ok: true, capabilities: payload })
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
