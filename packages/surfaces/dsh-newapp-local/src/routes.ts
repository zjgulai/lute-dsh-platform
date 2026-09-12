/**
 * The /api/dsh-newapp route family — one route: `health`.
 *
 * **This plugin deliberately owns no data.** A product declares itself in its
 * own `<产品目录>/product.json`; the preset a product belongs to is named by
 * that product and verified against the roster (`dsh-role-matrix-local`) at open
 * time. Re-deriving either half here would create a second home for a fact that
 * already has one (ADR-0009), and a scan of the preset directories would drift
 * from the roster the moment either side changed. So the host half serves
 * exactly two things: the product scan (a filesystem read the browser cannot do)
 * and proof that this plugin loaded.
 *
 * Why `health` is not decoration: dsh-host-webserver's `match()` consults the
 * EXACT route table first and returns on a hit, and the DSH global auth layer
 * answers 401 only for the `/api` PREFIX. So on a running app, an exact route
 * registered by this plugin answers **without a cookie**, while an unloaded
 * plugin leaves `/api/dsh-newapp/health` falling through to the prefix guard
 * and answering 401. The status code is therefore a load detector that needs no
 * launch token — see the C0.3 note for the measurement behind this claim.
 * @module dsh-newapp-local/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isNewAppAllowed } from './access.ts'
import { writeJson } from './http.ts'
import { scanProducts } from './products.ts'

/** Route paths (the client bundle mirrors these literals; tests assert both sides). */
export const ROUTES = {
  health: '/api/dsh-newapp/health',
  products: '/api/dsh-newapp/products',
} as const

/**
 * The sibling surface the drawer still consults, with the fact it owns.
 *
 * Declared here as *contract data*, not as a registry: nothing in this plugin
 * enforces it, and the drawer degrades when it is absent. It is published on
 * `health` so an operator can see what the launcher expects without reading the
 * bundle.
 *
 * **One entry, and it is not a data source.** The roster is read by the
 * launcher for a single boolean — *is the preset this product declares
 * installed here?* — and never rendered; the health probe reports it because a
 * reader of the health answer would otherwise have no way to learn that the
 * launcher's degrade story has an outside dependency at all.
 *
 * The worktable used to be listed here as a second source (its containers and
 * their split layouts). It is not any more: nothing in this package reads it,
 * and a declaration that outlives its reader is documentation of a coupling
 * that no longer exists (ADR-0045).
 */
export const COMPOSED_SOURCES = [
  {
    id: 'agents',
    route: '/api/dsh-role-matrix/list',
    owner: 'dsh-role-matrix-local',
    owns: 'the agent roster (which presets exist) — read by the launcher, never rendered',
  },
] as const

/** Route family dependencies (tests inject fakes). */
export interface NewAppRoutesDeps {
  /** Package version, echoed on health for operator confirmation. */
  version: string
  /**
   * Allowed scan roots: the *parents* of the working directories the drawer
   * lists. Explicit, and empty by default — a filesystem read the operator did
   * not ask for is a read this plugin does not do. A root is a read boundary,
   * so this list is the whole of what this route can see.
   */
  productRoots?: readonly string[]
  /** Logger. */
  logger: { warn(error: unknown): void }
}

/**
 * Build every /api/dsh-newapp route (exact paths).
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param deps - version and logger.
 * @returns the route list for ctx.webServer.register.
 */
export function makeRoutes(ctx: Context, deps: NewAppRoutesDeps): WebRoute[] {
  return [
    {
      kind: 'exact',
      path: ROUTES.products,
      handler: (req: IncomingMessage, res: ServerResponse) => {
        if (!isNewAppAllowed(ctx, req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        if (req.method !== 'GET') {
          writeJson(res, 405, { error: `method not allowed: ${String(req.method)}` })
          return
        }
        try {
          const report = scanProducts(deps.productRoots ?? [])
          writeJson(res, 200, {
            ok: true,
            // The launcher reads declarations; it owns none of them. What it
            // reports is where it looked and what it could not read, so a
            // misconfigured root is visible instead of looking like "no products".
            owns: 'nothing — this is a read of <dir>/product.json',
            ...report,
          })
        } catch (error) {
          deps.logger.warn(error)
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.health,
      handler: (req: IncomingMessage, res: ServerResponse) => {
        if (!isNewAppAllowed(ctx, req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        if (req.method !== 'GET') {
          writeJson(res, 405, { error: `method not allowed: ${String(req.method)}` })
          return
        }
        try {
          writeJson(res, 200, {
            ok: true,
            plugin: 'newapp-local',
            version: deps.version,
            // The load detector's own explanation, so the 401-vs-200 difference
            // is legible to whoever runs the probe next.
            detector: 'exact route — a 401 here means this plugin did not load',
            composes: COMPOSED_SOURCES,
          })
        } catch (error) {
          deps.logger.warn(error)
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
  ]
}
