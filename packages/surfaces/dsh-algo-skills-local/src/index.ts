/**
 * dsh-algo-skills-local — host half.
 *
 * Serves the /api/dsh-algo-skills route family (tree, toggle, health) over the
 * shared trust fence. The tree is the paper→skills library (1338 installed
 * cards) arranged on the same organization skeleton the role matrix renders:
 * 4 planes → responsibility domains → 50 roles.
 *
 * Why this plugin exists: the paper→skills pipeline classified every card into
 * the organization's own taxonomy at install time and wrote that classification
 * into each card's frontmatter — and then nothing ever showed it. The cards were
 * reachable only as an undifferentiated list of 1338 names in the skill picker.
 * This surface renders the classification that already exists, and marks the two
 * gaps it makes visible: cards that the corpus never classified, and roles the
 * corpus has no supply for.
 *
 * It is deliberately NOT a second skills manager. Enable/disable writes the same
 * frontmatter keys the official skill center writes, and it will only ever touch
 * `p2s-` cards; authoring, deleting and default-selection stay with the official
 * surfaces.
 * @module dsh-algo-skills-local
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeRoutes, ROUTES } from './routes.ts'
import { mountOnce } from './mount-once.ts'
import { diskSource } from './tree-source.ts'

/** Stable cordis plugin name. */
export const name = 'algo-skills-local'

/** Services required before the routes can mount. */
export const inject = ['webServer']

/** Route paths (re-exported for the client contract check). */
export { ROUTES }

/** Plugin config. */
export interface Config {
  /** Master switch for the plugin (routes). */
  enabled?: boolean
  /** Harness home override (defaults to $DSH_HOME or ~/.dsh). */
  dshHome?: string
  /** Skills root override (wins over `dshHome`). */
  skillsRoot?: string
  /** Preset root override (wins over `dshHome`). */
  presetRoot?: string
  /** Tree cache lifetime in ms; 0 disables caching. */
  cacheTtlMs?: number
}

/**
 * Mount the algorithm-skills routes.
 * @param ctx - host plugin context carrying webServer.
 * @param config - resolved plugin config.
 */
function applyImpl(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const source = diskSource({
    dshHome: config?.dshHome,
    skillsRoot: config?.skillsRoot,
    presetRoot: config?.presetRoot,
  })
  const routes = makeRoutes(ctx, {
    source,
    cacheTtlMs: config?.cacheTtlMs,
    logger: { warn: (error: unknown) => { ctx.logger?.warn?.(error) } },
  })
  const webServer = (ctx as unknown as { webServer: { register(route: unknown): () => void } }).webServer
  // One route per `register` call — never the whole array.
  //
  // `webServer.register(route)` files a SINGLE WebRoute by `route.kind` and
  // `route.path`. Handed an array it reads `kind === undefined`, so every route
  // lands in the PREFIX table under the key `undefined`; and because the
  // duplicate check is `table.has(route.path)` with `path` also undefined, the
  // collision never fires. Nothing throws, nothing logs, and no exact route
  // reaches the exact table — every request falls through to the `/api` prefix
  // guard, which answers 401 exactly as it does for a path that was never
  // registered. (Measured in dsh-role-matrix-local; the same trap applies here.)
  ctx.effect(() => {
    const disposers = routes.map((route) => webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'algo-skills-local: routes')
}

/** Apply, guarded so a second install source cannot double-register the routes. */
export const apply = mountOnce('dsh-algo-skills-local', applyImpl)
