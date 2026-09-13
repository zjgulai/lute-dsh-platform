/**
 * The /api/dsh-newapp route family: `health`, `products`, `systems`, `open-system`.
 *
 * **This plugin owns exactly one dataset**, and it says which: the external
 * systems catalog under `src/catalog/` (see ./systems.ts). Everything else here
 * is a read of something that lives elsewhere. A product declares itself in its
 * own `<产品目录>/product.json`; the preset a product belongs to is named by
 * that product and verified against the roster (`dsh-role-matrix-local`) at open
 * time. Re-deriving either half here would create a second home for a fact that
 * already has one (ADR-0009). So the host half serves:
 *
 *   - the product scan — a filesystem read the browser cannot do;
 *   - the systems catalog — a bundled read, joined at request time;
 *   - `open-system` — the only route that **acts**, because measured behaviour
 *     says the browser cannot: this shell's main process denies `target="_blank"`
 *     for http(s) (P0-6v2), so a card that opens an external system has to ask
 *     the host to do it;
 *   - `health` — proof that this plugin loaded.
 *
 * ## Why `open-system` takes a slug and never a URL
 *
 * The route's entire input vocabulary is the catalog's own keys. A route that
 * accepted an address would be an "open any URL in the user's browser" primitive
 * — precisely what P0-6v2 was written to remove from this app. Here the client
 * names *which catalog entry*, and the host decides what that name resolves to.
 *
 * ## Why `health` is not decoration
 *
 * dsh-host-webserver's `match()` consults the EXACT route table first and returns
 * on a hit, and the DSH global auth layer answers 401 only for the `/api` PREFIX.
 * So on a running app, an exact route registered by this plugin answers
 * **without a cookie**, while an unloaded plugin leaves `/api/dsh-newapp/health`
 * falling through to the prefix guard and answering 401. The status code is
 * therefore a load detector that needs no launch token — and it is also how the
 * browser half learns whether the opener exists at all.
 * @module dsh-newapp-local/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isNewAppAllowed } from './access.ts'
import { asJsonObject, readJsonBody, writeJson } from './http.ts'
import { openExternalUrl } from './open-external.ts'
import { scanProducts } from './products.ts'
import { hrefForSlug, loadSystems } from './systems.ts'

/** Route paths (the client bundle mirrors these literals; tests assert both sides). */
export const ROUTES = {
  health: '/api/dsh-newapp/health',
  products: '/api/dsh-newapp/products',
  systems: '/api/dsh-newapp/systems',
  openSystem: '/api/dsh-newapp/open-system',
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
  /**
   * Opens one address with the OS default browser. Injectable so the route's
   * decisions — which slug resolves, what is refused — are asserted without
   * launching anything.
   */
  openUrl?: (href: string) => Promise<void>
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
          writeJson(
            res,
            200,
            {
              ok: true,
              // The launcher reads declarations; it owns none of them. What it
              // reports is where it looked and what it could not read, so a
              // misconfigured root is visible instead of looking like "no products".
              owns: 'nothing — this is a read of <dir>/product.json',
              ...report,
            },
            {
              // The scan reflects the filesystem right now; a cached response
              // would make the drawer use stale declarations after a product
              // author edits product.json. Never cache it.
              'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
              pragma: 'no-cache',
            },
          )
        } catch (error) {
          deps.logger.warn(error)
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.systems,
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
          writeJson(
            res,
            200,
            {
              ...loadSystems(),
              // The browser half needs to know an opener exists before it draws a
              // live button. Both routes ship in the same bundle, so "this route
              // answered" already implies it — publishing the literal turns that
              // inference into something the client can check rather than assume.
              openRoute: ROUTES.openSystem,
            },
            {
              // The catalog is a snapshot in the bundle: it changes when the
              // plugin is rebuilt, not between two requests. Still `no-store`,
              // because a stale catalog after an upgrade is indistinguishable
              // from a catalog that never changed.
              'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
              pragma: 'no-cache',
            },
          )
        } catch (error) {
          deps.logger.warn(error)
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.openSystem,
      handler: (req: IncomingMessage, res: ServerResponse) => {
        if (!isNewAppAllowed(ctx, req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        if (req.method !== 'POST') {
          writeJson(res, 405, { error: `method not allowed: ${String(req.method)}` })
          return
        }
        void (async () => {
          // A slug and nothing else. 4 KiB is generous for one catalog key and
          // small enough that a body is never worth buffering twice.
          const body = await readJsonBody(req, { maxBytes: 4096, objectOnly: true })
          const slug = typeof asJsonObject(body)?.['slug'] === 'string' ? (body as Record<string, unknown>)['slug'] as string : ''
          if (slug === '') {
            writeJson(res, 400, { error: 'body must be {"slug": "<catalog key>"}' })
            return
          }
          const href = hrefForSlug(slug)
          if (href === undefined) {
            // Unknown keys are refused rather than passed through: this is the
            // boundary that keeps the route from being a URL opener, so it has
            // to be a boundary and not a formality.
            writeJson(res, 404, { error: `unknown system: ${slug}` })
            return
          }
          try {
            await (deps.openUrl ?? ((target: string) => openExternalUrl(target)))(href)
            writeJson(res, 200, { ok: true, slug, href })
          } catch (error) {
            // The message reaches the card, which writes it next to the button —
            // a failed launch must be sayable, not silent.
            const message = error instanceof Error ? error.message : String(error)
            deps.logger.warn(error)
            writeJson(res, 502, { error: `打开失败：${message}` })
          }
        })()
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
