/**
 * dsh-role-matrix-local — host half.
 *
 * Serves the role matrix data source: the /api/dsh-role-matrix route family
 * (grouped card matrix + health) over the shared trust fence (loopback by
 * default; a live paired-device cookie is an extra allow path). The browser
 * half (./client) renders the sidebar entry and the matrix panel.
 *
 * Why this plugin exists at all: the official new-session picker is a chip
 * plus an unsearchable flat dropdown that renders only `itemName`/`itemDesc`,
 * and the official Settings manager groups presets by `trust` (built-in vs
 * custom) — a grouping key no local preset can influence. Neither surface can
 * express "5 经营管理 / 35 业务运营 / 5 独立控制 / 5 数据与Agent平台". This
 * surface adds exactly that, and nothing else: it does not author, delete, or
 * select presets.
 *
 * The official package explicitly reserves this shape — `compositionInventory()`
 * documents itself as being "for plugin-listing surfaces beside the roster's own
 * picker". This plugin reads the preset directories directly instead, because
 * the classification it needs lives in each preset's LUTE manifest, which the
 * roster does not project.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeRoutes, ROUTES } from './routes.ts'
import { mountOnce } from './mount-once.ts'

/** Stable cordis plugin name. */
export const name = 'role-matrix-local'

/** Services required before the matrix routes can mount. */
export const inject = ['webServer']

/** Route paths (re-exported for the client contract check). */
export { ROUTES }

/** Plugin config. */
export interface Config {
  /** Master switch for the plugin (routes). */
  enabled?: boolean
  /** Harness home override (defaults to $DSH_HOME or ~/.dsh). */
  dshHome?: string
  /** Preset root override (wins over `dshHome`). */
  presetRoot?: string
}

/** The user preset root, derived the same way `@deepseek-ai/dsh-agent-presets` derives its own. */
function resolvePresetRoot(config: Config | undefined): string {
  if (config?.presetRoot !== undefined && config.presetRoot !== '') return config.presetRoot
  const home = config?.dshHome !== undefined && config.dshHome !== ''
    ? config.dshHome
    : (process.env['DSH_HOME'] !== undefined && process.env['DSH_HOME'] !== '' ? process.env['DSH_HOME'] : join(homedir(), '.dsh'))
  return join(home, '.agent-presets')
}

/**
 * Mount the role-matrix routes.
 * @param ctx - host plugin context carrying webServer.
 * @param config - resolved plugin config.
 */
function applyImpl(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const presetRoot = resolvePresetRoot(config)
  const routes = makeRoutes(ctx, {
    presetRoot: () => presetRoot,
    logger: { warn: (error: unknown) => { ctx.logger?.warn?.(error) } },
  })
  const webServer = (ctx as unknown as { webServer: { register(route: unknown): () => void } }).webServer
  // One route per `register` call — never the whole array.
  //
  // `webServer.register(route)` files a SINGLE WebRoute by `route.kind` and
  // `route.path`. Handed an array it reads `kind === undefined`, so both routes
  // land in the PREFIX table under the key `undefined`; and because the
  // duplicate check is `table.has(route.path)` with `path` also undefined, the
  // collision never fires. Nothing throws, nothing logs, and the two exact
  // routes never reach the exact table — every request falls through to the
  // `/api` prefix guard, which answers 401 "unauthorized" exactly as it does
  // for a path that was never registered. Diagnosing that costs an hour; the
  // loop below costs one line.
  ctx.effect(() => {
    const disposers = routes.map((route) => webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'role-matrix-local: routes')
}

/** Apply, guarded so a second install source cannot double-register the routes. */
export const apply = mountOnce('dsh-role-matrix-local', applyImpl)
