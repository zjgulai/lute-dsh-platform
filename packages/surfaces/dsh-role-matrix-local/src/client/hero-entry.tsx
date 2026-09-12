/**
 * Composer hero entry — the capability guide under the input card.
 *
 * ## What this surface answers, in the user's words
 *
 * A session that was started under a role preset should tell its user, before
 * they type anything, **what this role can actually do and how well**. The
 * answer is hierarchical and the layout has to say so: one column per material
 * business skill, the platform skills inside it, and the scene manuals on their
 * own band below. Four levels of drill-down stay in the skill centre; this is
 * the one-screen answer. The columns start collapsed, so the one-screen answer
 * really is one screen.
 *
 * ## Why the row is plain DOM with a React root inside it
 *
 * The placement core ({@link ./hero-entry-core.ts}) inserts a host node into the
 * shipped composer stack. React renders *into* that host; the host itself is
 * never part of the shell's reconciliation, so a re-render of the composer can
 * never be corrupted by this row — and if it does displace the row, the
 * observer below re-places the same node rather than rendering a second one.
 *
 * ## When it appears (R6)
 *
 * Only while the selected session is **blank** (the composer is still in its
 * hero phase) *and* the session's preset is a role preset. Both facts are read
 * from the shipped projections — `session.blank` and
 * `session.projectionValues.agentPreset` — never re-derived here. An ordinary
 * session has no role preset, so nothing renders and no special case is needed
 * for it; the first message makes `blank` false and the row goes away.
 *
 * ## Failure policy
 *
 * Same as the rest of this plugin: mounting problems are logged and swallowed.
 * There is no state in which this row can prevent the composer from working —
 * the worst case is that it is absent, and the reason is on `<html
 * data-dsh-hero-entry>` (written by the shared core) plus the console.
 */
import { useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CapabilityGroup, CapabilityKind, CapabilitySupply, MatrixApi, PresetCapabilities } from './api.ts'
import css from './hero-entry.module.css'
import { ensureHeroEntry, HERO_ENTRY_ROW_ATTR, removeHeroEntry } from './hero-entry-core.ts'
import { tt } from './panel-helpers.ts'

/** The composer outlet this row sits behind; the placement core's anchor. */
const BAR_SELECTOR = '[data-slot="conversation.composer.bar"]'

/**
 * Live signals the row mirrors.
 *
 * Passed in rather than read from a service here so this module stays testable
 * with a plain object, and so the *policy* (which sessions get the row) lives in
 * one place in `index.ts`.
 */
export interface HeroEntrySignals {
  /** Preset id of the selected session, or undefined when it declares none. */
  preset(): string | undefined
  /** Whether the selected session is still blank (composer hero phase). */
  hero(): boolean
  /** Subscribe to changes of either signal. */
  subscribe(listener: () => void): () => void
}

/**
 * A pick carries the business skill it was made under as well as the platform
 * skill: the prefill sentence names both levels, and only the column knows which
 * group a card belongs to.
 */
type PickHandler = (supply: CapabilitySupply, groupName: string) => void

/** Per-grade class, so the grade is legible at a glance rather than by reading. */
const KIND_CLASS: Record<CapabilityKind, string> = {
  direct: css['dsh-hero-entry__badge--direct'] ?? '',
  partial: css['dsh-hero-entry__badge--partial'] ?? '',
  gap: css['dsh-hero-entry__badge--gap'] ?? '',
}

/**
 * One supply card.
 *
 * A card is a **prompt prefill**, not a run: clicking puts a sentence naming the
 * skill into the composer and leaves it there for the user to finish. Nothing is
 * sent (R7).
 * @param props - the supply and the pick handler.
 * @returns the card.
 */
function SupplyCard({ supply, onPick }: { supply: CapabilitySupply; onPick: (supply: CapabilitySupply) => void }): ReactElement {
  return (
    <button type="button" className={css['dsh-hero-entry__card']} title={tt('hero.card.tip')} onClick={() => { onPick(supply) }}>
      <div className={css['dsh-hero-entry__cardTitle']}>{supply.label}</div>
      <div className={css['dsh-hero-entry__cardSub']}>
        <span className={css['dsh-hero-entry__cardSummary']}>{supply.summary !== '' ? supply.summary : supply.id}</span>
        <span className={css['dsh-hero-entry__cardGo']}>{tt('hero.card.go')}</span>
      </div>
    </button>
  )
}

/**
 * One business-skill column: header, boundary note, supply cards.
 *
 * **Collapsed is the default** (R3, revised 2026-09-12). The header alone — name,
 * grade, count — already answers "what can this role do"; the cards are one click
 * away. Three fully expanded columns put a wall of text under the input card, and
 * a surface nobody reads to the end is worse than one they open on purpose. This
 * is the same shape the capability wall uses: a header line with a count, body
 * behind a toggle.
 * @param props - the group and the pick handler.
 * @returns the column.
 */
function GroupColumn({ group, onPick }: { group: CapabilityGroup; onPick: PickHandler }): ReactElement {
  const [open, setOpen] = useState(false)
  const bodyId = `dsh-hero-entry-group-${group.name}`
  return (
    <div className={css['dsh-hero-entry__col']}>
      <button
        type="button"
        className={css['dsh-hero-entry__colHead']}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => { setOpen(!open) }}
      >
        <span className={`${css['dsh-hero-entry__caret']} ${open ? '' : (css['dsh-hero-entry__caret--collapsed'] ?? '')}`} aria-hidden="true">▼</span>
        <span className={css['dsh-hero-entry__colName']} title={group.name}>{group.name}</span>
        <span className={`${css['dsh-hero-entry__badge']} ${KIND_CLASS[group.kind]}`}>{group.kind}</span>
        <span className={css['dsh-hero-entry__count']}>{group.supplies.length}</span>
      </button>
      {open ? (
        <div className={css['dsh-hero-entry__colBody']} id={bodyId}>
          {group.note !== '' ? (
            <div className={css['dsh-hero-entry__note']}>
              <span className={css['dsh-hero-entry__noteLabel']}>{tt('hero.noteLabel')}：</span>
              {group.note}
            </div>
          ) : null}
          {group.supplies.length === 0 ? (
            // R4: an uncovered business skill says so in words. It never gets a
            // placeholder card — a fake card is indistinguishable from a real one
            // at a glance, which is exactly the lie this grade exists to prevent.
            <div className={css['dsh-hero-entry__gap']}>{tt('hero.gap.empty')}</div>
          ) : (
            <div className={css['dsh-hero-entry__cards']}>
              {group.supplies.map((supply) => (
                <SupplyCard key={supply.id} supply={supply} onPick={(picked) => { onPick(picked, group.name) }} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The whole row.
 * @param props - the projection and the pick handler.
 * @returns the row content (the host node carries the placement marker).
 */
export function HeroEntryView({ data, onPick }: {
  data: PresetCapabilities
  onPick: PickHandler
}): ReactElement {
  const role = `${data.agt} ${data.alias}`.trim()
  return (
    <div className={css['dsh-hero-entry']} data-dsh-plugin="role-matrix-local" data-dsh-part="hero-entry">
      <div className={css['dsh-hero-entry__identity']}>
        {tt('hero.identity')} · {data.planeName} · {data.domainName} ·{' '}
        <span className={css['dsh-hero-entry__identityName']}>{role}</span>
        {data.title !== '' ? `（${data.title}）` : ''}
      </div>

      <div className={css['dsh-hero-entry__section']}>{tt('hero.section.skills')}</div>
      <div className={css['dsh-hero-entry__grid']}>
        {data.groups.map((group) => (
          <GroupColumn key={group.name} group={group} onPick={onPick} />
        ))}
      </div>

      {data.manuals.length > 0 ? (
        <>
          <div className={css['dsh-hero-entry__section']}>{tt('hero.section.manuals')}</div>
          <div className={css['dsh-hero-entry__manuals']}>
            {data.manuals.map((manual) => (
              <span key={manual.id} className={css['dsh-hero-entry__manual']}>
                <span className={css['dsh-hero-entry__manualId']}>{manual.id}</span>
                {manual.label}
              </span>
            ))}
          </div>
        </>
      ) : null}

      {data.degraded !== undefined ? (
        <div className={css['dsh-hero-entry__degraded']}>{tt('hero.degraded', { detail: data.degraded })}</div>
      ) : null}
    </div>
  )
}

/** What {@link mountHeroEntry} hands back. */
export interface HeroEntryMount {
  /** Re-read the signals and converge. Safe to call at any time. */
  sync(): void
  /** Remove the row and every observer. Idempotent. */
  dispose(): void
}

/**
 * Mount the capability row and keep it converged with the session signals.
 *
 * The fetch is per preset and memoised, so switching between two role sessions
 * costs one request each and a re-render costs none.
 * @param api - host route client.
 * @param signals - session preset + phase.
 * @param onPick - called with the picked supply (the caller owns the prefill).
 * @returns the mount handle.
 */
export function mountHeroEntry(
  api: MatrixApi,
  signals: HeroEntrySignals,
  onPick: PickHandler,
): HeroEntryMount {
  const warn = (message: string): void => { console.warn(`[role-matrix-local] ${message}`) }
  const cache = new Map<string, PresetCapabilities>()

  let host: HTMLElement | undefined
  let root: Root | undefined
  /** Preset currently shown *or* being fetched; undefined when nothing is wanted. */
  let active: string | undefined
  let data: PresetCapabilities | undefined
  let disposed = false

  /** Remove the row and its React root, keeping the fetch cache. */
  const teardown = (): void => {
    if (root !== undefined) {
      const dying = root
      root = undefined
      // Unmounting during a render pass throws; a microtask keeps it off the
      // shell's own stack, and the row is invisible either way.
      queueMicrotask(() => { try { dying.unmount() } catch { /* already gone */ } })
    }
    removeHeroEntry(document)
    host = undefined
    data = undefined
  }

  /** Place the host if needed and render the current data into it. */
  const show = (value: PresetCapabilities): void => {
    data = value
    const result = ensureHeroEntry({
      doc: document,
      create: () => {
        const element = document.createElement('div')
        root = createRoot(element)
        return element
      },
      warn,
    })
    if (!result.ok || result.row === undefined) {
      // The core already reported which anchor was missing.
      if (root !== undefined) {
        const dying = root
        root = undefined
        queueMicrotask(() => { try { dying.unmount() } catch { /* already gone */ } })
      }
      host = undefined
      return
    }
    host = result.row
    root?.render(<HeroEntryView data={value} onPick={onPick} />)
  }

  const sync = (): void => {
    if (disposed) return
    const preset = signals.hero() ? signals.preset() : undefined
    if (preset === undefined) {
      teardown()
      active = undefined
      return
    }
    if (preset === active) return
    teardown()
    active = preset
    const known = cache.get(preset)
    if (known !== undefined) {
      show(known)
      return
    }
    void api.capabilities(preset).then((result) => {
      // A newer session may have been selected while this was in flight.
      if (disposed || active !== preset) return
      if (!result.ok) {
        // "Missing" is the ordinary answer for a non-role or uninstalled preset;
        // anything else is a real fault and belongs in the console.
        if (!result.missing) warn(result.reason)
        return
      }
      cache.set(preset, result.value)
      show(result.value)
    })
  }

  // Self-heal. The shipped composer subtree re-renders on its own schedule and
  // may drop or displace the host; re-placing the *same* node is idempotent,
  // while letting a re-render be the last word would make the row vanish with no
  // explanation. The callback is gated on two cheap reads (is the host still
  // connected, is the outlet still its previous sibling) so unrelated mutations
  // — chat streaming above all — cost two property reads, not a re-query.
  const observer = new MutationObserver(() => {
    if (disposed || host === undefined || data === undefined) return
    if (!host.isConnected) { show(data); return }
    const previous = host.previousElementSibling
    if (previous === null || !previous.matches(BAR_SELECTOR)) show(data)
  })
  if (typeof document !== 'undefined' && document.body !== null) {
    observer.observe(document.body, { childList: true, subtree: true })
  }

  const unsubscribe = signals.subscribe(sync)
  sync()

  return {
    sync,
    dispose: () => {
      if (disposed) return
      disposed = true
      unsubscribe()
      observer.disconnect()
      teardown()
      active = undefined
    },
  }
}

/** The marker attribute the shared core puts on the host node (re-exported for probes). */
export const HERO_ENTRY_SELECTOR = `[${HERO_ENTRY_ROW_ATTR}]`
