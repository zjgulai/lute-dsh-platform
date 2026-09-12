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
import { mountHeroEntry } from './hero-entry.tsx'
import { en, zh, type RoleMatrixKey } from './locales.ts'
import { mountPanel } from './panel-mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { prefillDraft, prefillPrompt } from './prefill.ts'

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
 * The role preset pattern, mirroring the host collector's `ROLE_PRESET_ID`.
 *
 * Mirrored rather than imported for the same reason the card shape is: the
 * client bundle must not pull the host half in. `routes.spec.ts` and the
 * capability tests hold both copies to the same behaviour, and the host stays
 * the one that enforces it — this copy only decides whether to *ask*.
 */
const ROLE_PRESET_ID = /^agt-\d{3}$/

/** One session summary, narrowed to the two shipped projections this surface reads. */
interface SessionSummaryLike {
  id: string
  /** The shipped "provisional New Session row" flag: true while the composer is in its hero phase. */
  blank?: boolean
  /** The shipped session projection map; `agentPreset` is a first-class entry (spike ②). */
  projectionValues?: { agentPreset?: unknown }
}

/** The `sessions` client service, narrowed to the list projection. */
interface SessionsLike {
  list: {
    getSnapshot(): { current?: string; byId: Record<string, SessionSummaryLike> }
    subscribe(listener: () => void): () => void
  }
}

/** `ctx.inject` result for the services the hero entry needs. */
interface ScopedServices {
  ctx: unknown
  sessions: SessionsLike
}

/** The parts of the client context this module uses (the package's own narrow face). */
interface HeroContext {
  inject(services: readonly string[], callback: (scoped: ScopedServices) => unknown): { dispose(): Promise<void> }
  get(name: string): unknown
}

/**
 * Read one service without declaring an inject dependency.
 *
 * A bare read of an undeclared service **throws** in cordis, so `ctx[name] ??
 * fallback` dies while evaluating its left operand. `ctx.get` is the documented
 * read-without-inject, and it is what keeps the prefill channel optional.
 * @param ctx - client root context.
 * @param name - service name.
 * @returns the service, or undefined when it is not registered.
 */
function lookup(ctx: HeroContext, name: string): unknown {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

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

  mountHeroEntrySurface(ctx as unknown as HeroContext, api)
}

/**
 * Mount the composer capability row, once the session list exists.
 *
 * Why the mount waits on `inject(['sessions'])` instead of reading the service
 * up front: `sessions` is provided by the shipped session plugin, whose boot
 * order is not this plugin's to assume. Injecting defers the mount until the
 * service is actually there, and — the part that matters — a shell that never
 * provides it leaves this surface absent rather than throwing during boot.
 * @param ctx - client root context.
 * @param api - host route client (shared with the panel).
 */
function mountHeroEntrySurface(ctx: HeroContext, api: MatrixApi): void {
  ctx.inject(['sessions'], (scoped) => {
    const sessions = scoped.sessions
    const current = (): SessionSummaryLike | undefined => {
      try {
        const state = sessions.list.getSnapshot()
        return state.current === undefined ? undefined : state.byId[state.current]
      } catch {
        return undefined
      }
    }
    const presetOf = (session: SessionSummaryLike | undefined): string | undefined => {
      const value = session?.projectionValues?.agentPreset
      // A preset that is not a role preset is not "no answer" — it is the answer
      // "this session is not a role", which is what keeps ordinary sessions
      // quiet with no special case (R6).
      return typeof value === 'string' && ROLE_PRESET_ID.test(value) ? value : undefined
    }

    const mount = mountHeroEntry(
      api,
      {
        preset: () => presetOf(current()),
        hero: () => current()?.blank === true,
        subscribe: (listener: () => void) => sessions.list.subscribe(listener),
      },
      (supply, groupName) => {
        const state = (() => {
          try {
            return sessions.list.getSnapshot()
          } catch {
            return undefined
          }
        })()
        const sessionId = state?.current
        if (sessionId === undefined) return
        const conversation = lookup(ctx, 'conversation')
        const outcome = prefillDraft(conversation, sessionId, prefillPrompt(supply.label, groupName))
        if (!outcome.ok) {
          // Never silent: the click did nothing visible, so the reason has to be
          // somewhere a person can find it.
          console.warn(`[role-matrix-local] ${outcome.reason}`)
        }
      },
    )
    return () => { mount.dispose() }
  })
}
