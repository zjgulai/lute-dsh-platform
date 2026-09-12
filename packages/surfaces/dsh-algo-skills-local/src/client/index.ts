/**
 * Browser-half entry: the 算法技能 settings section.
 *
 * Registers one `settings.section` row beside the existing skills pages
 * (出海技能 / AI全栈技能 / 小队), so the library sits where a person goes looking
 * for skills rather than in a surface of its own.
 *
 * Order 29 puts it after 出海技能 (26), AI全栈技能 (27) and 万物互联 (28): the
 * catalogs are the same kind of page — a browsable skill library — and splitting
 * them across the sidebar would make the user learn which catalog lives where.
 *
 * 29, not 28: 万物互联 already registers at 28. The slot core sorts by
 * `(priority, order)` and leaves equal orders in insertion order, which for
 * external plugins means mount order — so two rows sharing 28 trade places
 * whenever one of them is hot-mounted. A number of its own is what keeps this
 * row's position stable.
 *
 * Failure policy: `apply` logs and returns rather than throwing. It runs during
 * the shell's boot, and an external plugin that throws there takes the whole GUI
 * down; a missing settings row is the correct worst case.
 * @module dsh-algo-skills-local/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot's name + prop contract (`settings.section`).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AlgoSkillsPage } from './AlgoSkillsPage.tsx'
import { en, zh, type AlgoSkillKey } from './locales.ts'

/** Locale namespace this plugin owns. */
export const NS = 'dsh-algo-skills-local'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Algorithm-skills page copy. */
    'dsh-algo-skills-local': AlgoSkillKey
  }
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale']

/** Settings sidebar position: right after 万物互联 (28), which follows 27 and 26. */
const SECTION_ORDER = 29

/** Type-only export discipline: the plugin contract only. */
export type { AlgoSkillsPageProps } from './AlgoSkillsPage.tsx'
export type { AlgoSkillKey } from './locales.ts'

/**
 * Register the settings section and its dictionaries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch (error) {
      console.warn('[algo-skills-local] locale registration failed', error)
      return () => {}
    }
  }, 'algo-skills-local: dictionaries')

  // `slots.inject`, not a bare `slots.register`: the core registry throws
  // `slot "settings.section" is not declared` when the settings shell has not
  // declared the key yet, and an external plugin applies before it does. The
  // inject controller waits for the declaration and runs the callback once it
  // lands (synchronously when it already exists), and binds that wait to this
  // fiber, so unload cancels a pending wait and removes an active row.
  ctx.slots.inject('settings.section', () => {
    try {
      const t = ctx.locale.bind(NS) as unknown as (key: AlgoSkillKey, params?: Record<string, string | number>) => string
      return ctx.slots.register(
        {
          name: 'settings.section',
          id: 'algo-skills',
          order: SECTION_ORDER,
          label: () => t('nav'),
          locale: NS,
        },
        // The component is registered directly, not wrapped: a wrapper arrow
        // receives the slot props and would have to forward them, and the page
        // deliberately takes none (see ./i18n.ts).
        AlgoSkillsPage,
      )
    } catch (error) {
      // Keep the no-throw policy even inside the deferred callback: a
      // synchronous throw here escapes slots.inject() into the shell's boot.
      console.warn('[algo-skills-local] settings section registration failed', error)
      return () => {}
    }
  })
}
