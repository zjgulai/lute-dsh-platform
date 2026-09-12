/**
 * Shared composer hero-entry injection core.
 *
 * Places one row in the composer stack, directly **below** the input card, and
 * keeps it there across React re-renders and session phase changes. Packages
 * receive this file as a generated copy via `scripts/sync-shared.mjs`; edit the
 * shared source and re-run the sync instead of editing a copy.
 *
 * ## Why this is DOM placement and not a slot registration
 *
 * Three routes were read out of the live client bundle (not guessed) and all
 * three are structurally unavailable to a surface that only exists in the empty
 * ("hero") session:
 *
 *  1. `conversation.composer.dock` — the composer footer — renders as
 *     `!hero && zone !== undefined ? … : null`, so it is absent in exactly the
 *     phase this row needs.
 *  2. `conversation.composer` is an `overlay` chain: registering elects the
 *     registration and sets the shipped fallback (the real input) to
 *     `display:none`. Registering there replaces the composer.
 *  3. Adding a slot to the shipped bundle is "modifying a base component",
 *     which the launch plan's negative list excludes.
 *
 * So the row is placed by DOM. It must be **idempotent and self-healing**,
 * because the shell re-renders the composer subtree and moves nodes within it.
 *
 * ## Anchor discipline (architecture.md red line: never pin a module hash)
 *
 * Only shipped **semantic** anchors are read:
 *  - `[data-composer-seat]` — the composer seat's own data attribute;
 *  - `[data-slot="conversation.composer.bar"]` — the `div[data-slot="<key>"]`
 *    the shipped SlotOutlet renders for every slot outlet.
 *
 * Hashes drift: the same ConversationRoot stylesheet carries the module prefix
 * `_4RFuWq_` in the 2.0.x archived bundle and `uPhUma_` in the live install.
 * Anything pinned to a hash silently stops matching at the next upstream build.
 *
 * A missing anchor is **reported** (a warn plus a `documentElement` diagnostic
 * attribute). The worst acceptable outcome is a row that does not render; the
 * unacceptable one is a row that does not render and says nothing.
 */

/**
 * Row marker attribute — the single idempotency key.
 *
 * It must **not** collide with the attribute {@link DIAGNOSTIC_KEY} produces:
 * `dataset.dshHeroEntry` lands on the DOM exactly as `data-dsh-hero-entry`, and
 * when both names are the same `querySelector(ROW_ATTR)` matches the `<html>`
 * element carrying the diagnostic first — turning "re-place the row" into
 * "append the entire document into the composer stack". That is not
 * hypothetical: it is what the first probe run did.
 */
export const HERO_ENTRY_ROW_ATTR = 'data-dsh-hero-entry-row'

/** Diagnostic attribute name: `documentElement.dataset[DIAGNOSTIC_KEY]` → `data-dsh-hero-entry`. */
export const HERO_ENTRY_DIAGNOSTIC_KEY = 'dshHeroEntry'

/** Shipped composer input slot outlet selector. */
const BAR_SELECTOR = '[data-slot="conversation.composer.bar"]'

/** Shipped composer seat selector (observed, never used as the mount point). */
const SEAT_SELECTOR = '[data-composer-seat]'

/** Why the row could not be placed. */
export type HeroEntryFailure = 'no-document' | 'no-seat' | 'no-bar'

/** Outcome of one {@link ensureHeroEntry} call. */
export interface HeroEntryResult {
  /** Whether the row is now in the right place. */
  readonly ok: boolean
  /** Failure reason; absent when `ok`. */
  readonly reason?: HeroEntryFailure
  /** Whether this call actually wrote to the DOM. An idempotent call is `false`. */
  readonly changed: boolean
  /** The row node, when one exists. */
  readonly row?: HTMLElement
}

/** Options for {@link ensureHeroEntry}. */
export interface EnsureHeroEntryOptions {
  /** Carrying document. */
  readonly doc: Document | null | undefined
  /** Build the row; the caller supplies its content. */
  readonly create: () => HTMLElement
  /** Diagnostic sink; defaults to `console.warn`. */
  readonly warn?: (message: string) => void
}

/**
 * Publish the diagnostic attribute.
 *
 * `dataset` accepts strings only, and a diagnostic must never be the thing that
 * breaks the feature — hence the swallow.
 * @param doc - carrying document.
 * @param value - diagnostic value; the empty string clears it.
 */
function diagnose(doc: Document, value: string): void {
  try {
    const root = doc.documentElement
    if (root === null) return
    if (value === '') delete root.dataset[HERO_ENTRY_DIAGNOSTIC_KEY]
    else root.dataset[HERO_ENTRY_DIAGNOSTIC_KEY] = value
  } catch {
    /* a diagnostic failure does not change the functional result */
  }
}

/**
 * Resolve the shipped composer input outlet inside the seat.
 * @param doc - carrying document.
 * @returns the outlet node, or undefined.
 */
export function resolveComposerBar(doc: Document): HTMLElement | undefined {
  const seat = doc.querySelector(SEAT_SELECTOR)
  if (seat === null) return undefined
  const bar = seat.querySelector(BAR_SELECTOR)
  return bar instanceof HTMLElement ? bar : undefined
}

/**
 * Idempotently guarantee the row is the input outlet's **next sibling**.
 *
 * Why a sibling rather than a child of the seat: the input outlet's parent is
 * the shipped `composerStack` (`flex-direction: column`; in the hero phase it
 * also carries the card width axis, centering and bottom clearance). As its
 * sibling the row inherits that width axis and gap for free; hung off the seat
 * it would take the full column width and sit off-axis from the input.
 *
 * @param options - document, row factory and diagnostic sink.
 * @returns this call's outcome; `reason` names the broken link on failure.
 */
export function ensureHeroEntry(options: EnsureHeroEntryOptions): HeroEntryResult {
  const doc = options.doc
  const warn = options.warn ?? ((message: string): void => { console.warn(message) })
  if (doc === null || doc === undefined) return { ok: false, reason: 'no-document', changed: false }

  const seat = doc.querySelector(SEAT_SELECTOR)
  if (seat === null) {
    diagnose(doc, 'no-seat')
    warn('[hero-entry] the shipped composer seat [data-composer-seat] was not found; the row does not render (degraded, not silent)')
    return { ok: false, reason: 'no-seat', changed: false }
  }

  const bar = resolveComposerBar(doc)
  if (bar === undefined) {
    diagnose(doc, 'no-bar')
    warn(`[hero-entry] no ${BAR_SELECTOR} inside the composer seat; the shipped slot outlet shape may have changed, so the row does not render`)
    return { ok: false, reason: 'no-bar', changed: false }
  }

  const parent = bar.parentElement
  if (parent === null) {
    diagnose(doc, 'no-bar')
    warn('[hero-entry] the composer outlet has no parent; the width axis cannot be located, so the row does not render')
    return { ok: false, reason: 'no-bar', changed: false }
  }

  // An existing row is moved only when it is in the wrong place. When it is
  // already right this must cost zero DOM writes — otherwise every render pass
  // re-inserts the node and the row can never settle.
  //
  // The lookup is over the **whole document**, not `:scope >`: React may move
  // the row within the same subtree (its insertBefore reference frame is its
  // own), by which point the parent has changed. Searching only the direct
  // parent then misses it and inserts a **second** row — measured, nodes = 2.
  // Claiming by marker attribute globally is what stops the row duplicating
  // itself.
  const existing = doc.querySelector(`[${HERO_ENTRY_ROW_ATTR}]`)
  if (existing instanceof HTMLElement) {
    if (existing.parentElement === parent && existing.previousElementSibling === bar) {
      diagnose(doc, 'ok')
      return { ok: true, changed: false, row: existing }
    }
    parent.insertBefore(existing, bar.nextSibling)
    diagnose(doc, 'ok')
    return { ok: true, changed: true, row: existing }
  }

  const row = options.create()
  row.setAttribute(HERO_ENTRY_ROW_ATTR, '')
  parent.insertBefore(row, bar.nextSibling)
  diagnose(doc, 'ok')
  return { ok: true, changed: true, row }
}

/**
 * Remove the row (called when the session leaves the phase that shows it). Idempotent.
 * @param doc - carrying document.
 * @returns whether a node was actually removed.
 */
export function removeHeroEntry(doc: Document | null | undefined): boolean {
  if (doc === null || doc === undefined) return false
  const row = doc.querySelector(`[${HERO_ENTRY_ROW_ATTR}]`)
  if (row === null) return false
  row.remove()
  diagnose(doc, '')
  return true
}
