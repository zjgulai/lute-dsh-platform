/**
 * dsh-newapp-local — host half.
 *
 * The LUTE New App launcher. The browser half (./client) shares the sidebar's
 * New Session row 50/50 and opens the application-matrix drawer; this half
 * registers the one exact route that proves the plugin loaded
 * (/api/dsh-newapp/health) over the shared trust fence.
 *
 * Why this plugin exists: the official New Session button is a single
 * full-width row that starts an *empty* session — it cannot express "resume
 * this container with this agent", because the shell knows nothing about
 * containers and the worktable knows nothing about agents. The launcher is the
 * only surface that sees both halves, so it is the only place that join can be
 * rendered. It owns neither half: see ./routes.ts for the composition contract.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeRoutes, ROUTES } from './routes.ts'
import { mountOnce } from './mount-once.ts'

/** Stable cordis plugin name. */
export const name = 'newapp-local'

/** Services required before the health route can mount. */
export const inject = ['webServer']

/** Route paths (re-exported for the client contract check). */
export { ROUTES }

/** Plugin version echoed on health (kept in one place for the probe). */
export const VERSION = '0.1.0'

/** Plugin config. */
export interface Config {
  /** Master switch for the plugin (health route). */
  enabled?: boolean
  /**
   * Allowed scan roots for `product.json` discovery — the parents of the
   * working directories the drawer lists. **Empty by default: nothing is
   * scanned.** A product declares itself in its own directory; this list says
   * only where the launcher is allowed to *look*.
   */
  productRoots?: string[]
}

/**
 * Mount the New App routes.
 * @param ctx - host plugin context carrying webServer.
 * @param config - resolved plugin config.
 */
function applyImpl(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const routes = makeRoutes(ctx, {
    version: VERSION,
    productRoots: Array.isArray(config?.productRoots) ? config.productRoots : [],
    logger: { warn: (error: unknown) => { ctx.logger?.warn?.(error) } },
  })
  const webServer = (ctx as unknown as { webServer: { register(route: unknown): () => void } }).webServer
  // One route per `register` call — never the whole array: handed an array,
  // `register` reads `kind === undefined` and files every entry into the PREFIX
  // table under the key `undefined`, where the duplicate check cannot fire.
  // Nothing throws and nothing logs, and the exact routes never reach the exact
  // table — every request then falls through to the /api guard and answers 401
  // exactly as it does for a path that was never registered (measured, see the
  // role-matrix note). The loop costs one line.
  ctx.effect(() => {
    const disposers = routes.map((route) => webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'newapp-local: routes')
}

/** Apply, guarded so a second install source cannot double-register the route. */
export const apply = mountOnce('dsh-newapp-local', applyImpl)
