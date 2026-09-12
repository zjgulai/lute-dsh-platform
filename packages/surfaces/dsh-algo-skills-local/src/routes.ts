/**
 * The /api/dsh-algo-skills route family.
 *
 * Three routes, and the split is deliberate:
 *
 *   - `tree` — read-only, the whole classification skeleton plus every card's
 *     index row. One request renders the entire page, so opening Settings never
 *     fans out into 1338 requests. It is cached briefly (see `cacheTtlMs`)
 *     because building it reads ~1388 files; the cache is dropped the moment a
 *     toggle writes.
 *   - `toggle` — the only write in this plugin, and it is narrowed twice: the
 *     name must be an installed `p2s-` skill (not merely a safe kebab name), so
 *     the route can only reach the cards this page actually shows.
 *   - `health` — the counters plus the drift diagnostics, for a one-line check
 *     without pulling the full payload.
 *
 * Every route rides the shared trust fence (loopback, or a live paired-device
 * cookie). The tree is not a secret, but it does disclose the machine's role
 * roster and skill inventory, which is not meant for an unpaired LAN client.
 * @module dsh-algo-skills-local/routes
 */

import { readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isAlgoSkillsAllowed } from './access.ts'
import { collectTree, type TreePayload, type TreeSource } from './collect.ts'
import { errorMessage, isValidSkillName, rebuildFrontmatter } from './frontmatter.ts'
import { asJsonObject, readJsonBody, writeJson } from './http.ts'

/** Route paths. The client bundle mirrors these literals; a test asserts both sides. */
export const ROUTES = {
  tree: '/api/dsh-algo-skills/tree',
  toggle: '/api/dsh-algo-skills/toggle',
  health: '/api/dsh-algo-skills/health',
} as const

/** Largest accepted toggle body; the payload is two short fields. */
const MAX_BODY_BYTES = 4 * 1024

/** How long a built tree is reused. Long enough to collapse a page's burst of
 * requests, short enough that a hand-edited SKILL.md shows up without a restart. */
const DEFAULT_CACHE_TTL_MS = 15_000

/** Route family dependencies (tests inject fakes). */
export interface AlgoSkillsRoutesDeps {
  /** Filesystem boundary the tree is built from. */
  source: TreeSource
  /** Logger for unexpected failures. */
  logger: { warn(error: unknown): void }
  /** Collector override (tests). */
  collect?: (source: TreeSource) => TreePayload
  /** Clock override (tests). */
  now?: () => number
  /** Tree cache lifetime in ms; 0 disables caching (tests). */
  cacheTtlMs?: number
}

/**
 * The `p2s-` skill-name shape this route may write to.
 *
 * Narrower than `isValidSkillName` on purpose: a safe kebab name is not the
 * same as a card this page owns, and this route has no business writing to a
 * hand-authored skill that merely happens to live in the same directory.
 */
const P2S_NAME = /^p2s-[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Build every /api/dsh-algo-skills route (exact paths).
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param deps - filesystem source, logger, and test seams.
 * @returns the route list for ctx.webServer.register.
 */
export function makeRoutes(ctx: Context, deps: AlgoSkillsRoutesDeps): WebRoute[] {
  const { source, logger } = deps
  const collect = deps.collect ?? collectTree
  const now = deps.now ?? (() => Date.now())
  const ttl = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS

  /** Cached payload plus the instant it stops being reusable. */
  let cached: { at: number; payload: TreePayload } | undefined
  const build = (): TreePayload => {
    const at = now()
    if (ttl > 0 && cached !== undefined && at - cached.at < ttl) return cached.payload
    const payload = collect(source)
    if (ttl > 0) cached = { at, payload }
    return payload
  }
  const invalidate = (): void => { cached = undefined }

  /** Trust fence + method check; false means a response was already written. */
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (!isAlgoSkillsAllowed(ctx, req)) {
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
      path: ROUTES.tree,
      handler: (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          writeJson(res, 200, build())
        } catch (error) {
          logger.warn(error)
          writeJson(res, 500, { ok: false, error: errorMessage(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.health,
      handler: (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const payload = build()
          writeJson(res, 200, {
            ok: true,
            plugin: 'algo-skills-local',
            root: payload.root,
            presetRoot: payload.presetRoot,
            totals: payload.totals,
            issues: payload.issues.length,
          })
        } catch (error) {
          logger.warn(error)
          writeJson(res, 500, { ok: false, error: errorMessage(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.toggle,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        try {
          const body = asJsonObject(await readJsonBody(req, { maxBytes: MAX_BODY_BYTES, objectOnly: true }))
          const name = typeof body?.['name'] === 'string' ? body['name'] : ''
          const enabled = body?.['enabled'] === true
          if (!isValidSkillName(name) || !P2S_NAME.test(name)) {
            writeJson(res, 400, { ok: false, error: 'invalid name' })
            return
          }
          const file = join(source.skillsRoot, name, 'SKILL.md')
          let text: string
          try {
            text = readFileSync(file, 'utf8')
          } catch {
            writeJson(res, 404, { ok: false, error: 'not found' })
            return
          }
          const rebuilt = rebuildFrontmatter(text, enabled)
          if (rebuilt === null) {
            writeJson(res, 400, { ok: false, error: 'no frontmatter' })
            return
          }
          writeFileSync(file, rebuilt, 'utf8')
          invalidate()
          writeJson(res, 200, { ok: true, name, enabled })
        } catch (error) {
          logger.warn(error)
          writeJson(res, 500, { ok: false, error: errorMessage(error) })
        }
      },
    },
  ]
}
