/**
 * Browser-half entry for the role-matrix plugin — runs inside the dsh web GUI.
 *
 * Registers the panel locale dictionaries and mounts two DOM surfaces: the
 * sidebar entry row (toggles the panel, carries the live role-count badge) and
 * the matrix drawer panel. Failure policy: DOM mounting problems are logged,
 * never thrown — the web shell fails the whole boot when a plugin apply throws,
 * and an external plugin must not take the GUI down.
 *
 * Export discipline (packages/client rule): the /client surface carries what
 * cordis loading needs plus types only — all value exports stay internal.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { MatrixApi } from './api.ts'
import { en, zh, type RoleMatrixKey } from './locales.ts'
import { mountPanel } from './panel-mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'

/** Locale namespace this plugin owns. */
const NS = 'dsh-role-matrix-local'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** role matrix surface copy. */
    'dsh-role-matrix-local': RoleMatrixKey
  }
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale']

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { RoleMatrixPanelProps } from './RoleMatrixPanel.tsx'
export type { RoleMatrixKey } from './locales.ts'
export type { MatrixApi } from './api.ts'

/**
 * Mount the role matrix surfaces.
 * @param ctx - client root context (locale service).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'role-matrix-local: dictionaries')

  const api = new MatrixApi()
  const panel = mountPanel(api)
  let total: number | undefined
  // Preload the role count for the sidebar badge (silent failure keeps the row clean).
  api.list().then((payload) => { total = payload.totals.roles }).catch(() => { total = undefined })

  // Failure policy (see the module doc): a DOM mounting problem is logged and
  // swallowed, never thrown. `apply` is called during the shell's boot, so a
  // throw here takes the whole GUI down — an external plugin must never be able
  // to do that. The panel still works through the entry row when mounting
  // succeeds; when it does not, the plugin is simply inert.
  ctx.effect(() => {
    try {
      return mountSidebarEntry(() => panel.toggle(), {
        isOpen: () => panel.isOpen(),
        subscribe: (listener: () => void) => panel.subscribe(listener),
        total: () => total,
      })
    } catch (error) {
      console.warn('[role-matrix-local] sidebar entry mount failed', error)
      return () => {}
    }
  }, 'role-matrix-local: sidebar entry')
  ctx.effect(() => () => panel.dispose(), 'role-matrix-local: panel')
}
