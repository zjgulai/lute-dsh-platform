/**
 * Browser-half entry for the skill center plugin — runs inside the dsh web GUI.
 *
 * Registers the skill center locale dictionaries and mounts the two DOM
 * surfaces: the sidebar entry row (toggles the panel, carries the live
 * total-skill badge) and the skill center drawer panel. Failure policy: DOM
 * mounting problems are logged, never thrown — the web shell fails the whole
 * boot when a plugin apply throws, and an external plugin must not take the
 * GUI down.
 *
 * Export discipline (packages/client rule): the /client surface carries what
 * cordis loading needs plus types only — all value exports stay internal.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { SkillApi } from './api.ts'
import { en, zh, type SkillExplorerKey } from './locales.ts'
import { mountPanel } from './panel-mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'

/** Locale namespace this plugin owns. */
const NS = 'dsh-skill-center-local'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** skill center surface copy. */
    'dsh-skill-center-local': SkillExplorerKey
  }
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale']

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { SkillPanelProps } from './SkillPanel.tsx'
export type { SkillExplorerKey } from './locales.ts'
export type { SkillApi } from './api.ts'

/**
 * Mount the skill center surfaces.
 * @param ctx - client root context (locale service).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'skill-center-local: dictionaries')

  const api = new SkillApi()
  const panel = mountPanel(api)
  let total: number | undefined
  // Preload the count for the sidebar badge (silent failure keeps the row clean).
  api.list().then((payload) => {
    let count = 0
    for (const group of payload.groups) count += group.skills.length
    total = count
  }).catch(() => {})

  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntry(() => panel.toggle(), () => total))
    disposers.push(() => panel.dispose())
  } catch (error) {
    // DOM failures degrade the panel, never the GUI.
    console.warn('[skill-center-local] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'skill-center-local: ui mounts')
}
