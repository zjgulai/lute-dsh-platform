/**
 * Shared sidebar entry injection core.
 *
 * dsh's sidebar shell exposes no slot an external plugin can register into,
 * so the entry row is injected between the shell's New Session button and the
 * workspace browser. The injection self-heals: a MutationObserver watches the
 * sidebar root and re-inserts the row whenever a React re-render displaces it
 * (re-insertion happens in the same frame, before paint, so no flicker).
 *
 * The row is plain DOM (no React tree) so it can never disturb the shell's
 * reconciliation; the view it toggles is a separate root owned by the caller.
 *
 * Packages receive this file as a generated copy via scripts/sync-shared.mjs;
 * edit the shared source and re-run the sync instead of editing a copy.
 */

/** Per-package configuration for one sidebar entry row. */
export interface SidebarEntryOptions {
  /** Full attribute name identifying the injected row (idempotency key), e.g. 'data-dsh-ssh-entry'. */
  rowAttribute: string
  /** CSS selector matching the injected row, e.g. '[data-dsh-ssh-entry]'. */
  rowSelector: string
  /**
   * L2 semantic-attribute plugin id (issue #506, enum table:
   * skins/skin-center/contracts/semantic-attrs-v1.md). When set, the row also
   * outputs data-dsh-plugin="<id>" and data-dsh-part="sidebar-entry"; unset
   * leaves the row without semantic attributes.
   */
  plugin?: string
  /** Inline icon markup (matches the shell's 16px nav-icon look). */
  icon: string
  /** CSS module class names for the row and its two spans (entry / entryIcon / entryLabel). */
  css: Record<string, string>
  /** Localized row label (aria-label + visible text). */
  label(): string
  /** Optional localized tooltip (title attribute). */
  tooltip?(): string
  /** Click action (open/toggle the owning panel). */
  onToggle(): void
  /**
   * Row placement:
   *   - `'before'` — insert ahead of the sibling plugin rows (family block);
   *   - `'after'` — insert behind them;
   *   - `'split'` — sit **beside** the official New Session button, sharing
   *     its row 50/50. See {@link applySplitGeometry} for why that is done with
   *     inline styles instead of a stylesheet rule.
   */
  position: 'before' | 'after' | 'split'
  /**
   * Selectors of the sibling plugin entry rows this package orders against
   * (its own row included — the placement guard excludes a row that is
   * already inside the root). Each package passes the same list it used
   * before the consolidation so the rendered order stays stable.
   */
  familySelectors: readonly string[]
  /** Optional active-state bridge; highlights the row while the panel is open. */
  active?: {
    subscribe(listener: () => void): () => void
    isOpen(): boolean
  }
}

/** Find the sidebar shell root element, or undefined while not yet mounted. */
function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  // Current shells wrap the sidebar UI: column > wrapper > root(logoRow owner).
  // Prefer the element that owns the logo row — the real sidebar UI root —
  // and fall back to the column's first child for legacy shells.
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  // `firstElementChild` is `Element | null`, NOT `| undefined`: a sidebar pane
  // that exists while momentarily empty (a full-pane teardown/rebuild between
  // frames) yields null. Every caller in this module guards on `undefined`
  // alone, so returning that null would slip past the guard and throw inside a
  // MutationObserver callback — measured, not theorised: the reconciliation
  // probe reproduces it deterministically at whole-tree teardown. Normalise to
  // undefined so the declared type is the truth the guards rely on.
  return logoOwner ?? (column.firstElementChild as HTMLElement | null) ?? undefined
}

/**
 * The New Session button is a **direct flex child of the sidebar root** on the
 * shipping shell, not a descendant of the logo row: measured against
 * @deepseek-ai/dsh-client-ui-sidebar's client bundle, the `logoRow` element's
 * children array closes (offset 14744) before the `newSession` button is
 * rendered (offset 15043). The `closest('[class*="logoRow"]')` probe below
 * therefore does not match on this generation, and placement falls back to
 * anchoring on the button itself.
 */
function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

/**
 * Below this rendered width the official button is the collapsed rail icon
 * (36px) rather than the full-width expanded button. Measured at runtime on
 * purpose: the collapsed state is expressed through a hashed class name and
 * through `align-self`/`width` inside the shell's own stylesheet, neither of
 * which a plugin may pin (ADR-0019).
 */
const SPLIT_COLLAPSED_MAX_WIDTH = 60

/** Exported for the contract test that pins the split arithmetic. */
export const SPLIT_COLLAPSED_LIMIT = SPLIT_COLLAPSED_MAX_WIDTH

/**
 * Share the official New Session row 50/50 with the injected entry.
 *
 * Geometry, measured from the shell's own stylesheet rather than guessed: the
 * root is `flex-direction: column`; the official button is `flex: none`,
 * `height: 38px`, `margin: 0 2px 8px`, and expanded carries **no explicit
 * width** — it stretches to the root's content box. Two siblings in a column
 * container would stack, so the injected entry takes half the width, aligns to
 * the far edge, and is pulled back up by exactly the official button's own
 * vertical advance (height + margin-bottom). The pair then shares one visual
 * band while the container's total height is unchanged, so nothing below it
 * shifts.
 *
 * `calc(50% - 4px)` falls out of that: with the official button's 2px side
 * margins on both boxes, `2 + W + 2 + 2 + W + 2 = 100%` gives `W = 50% - 4px`.
 *
 * Inline styles are used because the shell's stylesheet contains no
 * `!important` (measured: zero occurrences in the shipped bundle), so inline
 * always wins — and writing only `style` leaves the button's node identity,
 * and therefore React's reconciliation, untouched.
 *
 * Collapsed rail: the content box is 36px wide while the icon inside is 18px,
 * so two side-by-side entries would be ~17px each and clip the icon. The entry
 * therefore stacks under the official button at the rail's own metric instead
 * of forcing the split.
 */
export function applySplitGeometry(official: HTMLButtonElement, entry: HTMLButtonElement): void {
  const rect = official.getBoundingClientRect()
  if (rect.width === 0) return // not laid out yet; the resize observer retries

  if (rect.width < SPLIT_COLLAPSED_MAX_WIDTH) {
    official.style.removeProperty('width')
    entry.style.removeProperty('width')
    entry.style.removeProperty('margin-top')
    entry.style.removeProperty('align-self')
    entry.dataset.split = 'collapsed'
    return
  }

  const marginBottom = Number.parseFloat(getComputedStyle(official).marginBottom)
  const lift = rect.height + (Number.isNaN(marginBottom) ? 0 : marginBottom)
  official.style.width = 'calc(50% - 4px)'
  entry.style.width = 'calc(50% - 4px)'
  entry.style.alignSelf = 'flex-end'
  entry.style.marginTop = `-${lift}px`
  entry.dataset.split = 'expanded'
}

/** Build the entry row (a detached button; insert once the shell is up). */
function createEntry(options: SidebarEntryOptions): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.setAttribute(options.rowAttribute, '')
  if (options.plugin !== undefined) {
    entry.setAttribute('data-dsh-plugin', options.plugin)
    entry.setAttribute('data-dsh-part', 'sidebar-entry')
  }
  entry.className = options.css['entry'] ?? ''
  entry.setAttribute('aria-label', options.label())
  if (options.tooltip !== undefined) entry.setAttribute('title', options.tooltip())
  entry.innerHTML = '<span class="' + (options.css['entryIcon'] ?? '') + '">' + options.icon
    + '</span><span class="' + (options.css['entryLabel'] ?? '') + '">' + options.label() + '</span>'
  entry.addEventListener('click', options.onToggle)
  return entry
}

/**
 * Insert the entry: beside the New Session button in `split` mode, otherwise
 * into the family block between that button and the browser region.
 */
function placeEntry(root: HTMLElement, entry: HTMLButtonElement, options: SidebarEntryOptions): boolean {
  const button = newSessionButton(root)
  if (button === undefined) return false
  if (options.position === 'split') {
    // Must be the button's *immediate* next sibling: the geometry stacks the
    // pair with a negative top margin, which only lands in the same band when
    // nothing sits between them.
    if (entry.previousElementSibling !== button) button.after(entry)
    applySplitGeometry(button, entry)
    return true
  }
  if (entry.parentElement !== root) {
    // Position relative to the family block (entries injected by sibling
    // plugins), never relative to transient logoRow geometry: every family
    // plugin that self-heals during a re-render then lands in the same
    // relative order, so the entries cannot swap positions regardless of
    // observer callback order or of shell wrapper changes. There is no
    // append-to-end fallback: appending at the end would randomly reorder
    // the block after a shell re-render.
    const row = button.closest('[class*="logoRow"]')
    const base = (row !== null && row.parentElement === root) ? row : button
    const family = Array.from(root.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches(options.familySelectors.join(', ')),
    )
    const anchor = options.position === 'before'
      ? (family.length > 0 ? family[0] : base.nextElementSibling)
      : (family.length > 0 ? family[family.length - 1]!.nextElementSibling : base.nextElementSibling)
    root.insertBefore(entry, anchor)
  }
  return true
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param options - the row's attribute/icon/copy/action/ordering configuration.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(options: SidebarEntryOptions): () => void {
  // DOM-level idempotency: whatever path mounted an entry row before this
  // call (a duplicated apply, an HMR re-injection, a stale module still
  // alive), never mount a second one. The existing row keeps working; a full
  // page reload is the ultimate reset.
  if (typeof document !== 'undefined' && document.querySelector(options.rowSelector) !== null) {
    return () => {}
  }
  const entry = createEntry(options)
  let root: HTMLElement | undefined
  let placed = false

  // Split geometry is a function of the root's rendered width, so it has to be
  // re-measured when the sidebar is dragged wider, collapsed, or the window
  // resizes — none of which is a childList mutation. Observing an already
  // observed target is a no-op, so tryPlace may call observe() freely.
  const resizeObserver = options.position === 'split' && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      if (root === undefined || !root.isConnected) return
      const button = newSessionButton(root)
      if (button !== undefined) applySplitGeometry(button, entry)
    })
    : undefined

  const tryPlace = (): void => {
    if (root !== undefined && !root.isConnected) {
      // The shell rebuilt the sidebar pane (whole-tree teardown); the root
      // observer is gone with the old tree, so detach it and re-query from
      // scratch. The new pane is later noticed by the body-level watcher.
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      // Cheap short-circuit: entry still lives in a mountable subtree.
      if (document.body.contains(entry)) return
      // Entry was torn down together with the old tree; reset and re-place.
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeEntry(root, entry, options)
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true })
      resizeObserver?.observe(root)
    }
  }

  // Body-level watcher retained as the "whole rebuild" fallback: when the shell
  // tears down the whole sidebar pane, the root observer is gone with it and
  // only this body observation can notice the new pane mounting. It is no
  // longer disconnected after placement; the placed-and-still-mounted case
  // short-circuits through the cheap document.body.contains(entry) check, so
  // unrelated app mutations (e.g. chat streaming) cost one contains check
  // instead of churning the full re-query.
  const waitObserver = new MutationObserver(() => { tryPlace() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  // Self-heal: if a React re-render displaces the row, re-insert it in the
  // same frame (microtask before paint -> no visible flicker).
  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (!root.contains(entry)) {
      placed = placeEntry(root, entry, options)
    } else if (options.position === 'split') {
      // The row survived, but a re-render may have replaced the official button
      // node (taking the injected inline width with it) or changed the shell's
      // collapsed state. Re-asserting is idempotent and touches no node identity.
      const button = newSessionButton(root)
      if (button !== undefined) {
        if (entry.previousElementSibling !== button) button.after(entry)
        applySplitGeometry(button, entry)
      }
    }
  })

  // Reflect the panel's open state on the row (active highlight). Note: assigning
  // undefined to dataset.active materializes data-active="undefined" and keeps the
  // row permanently highlighted — delete the attribute instead.
  const unsubscribeActive = options.active === undefined ? undefined : (() => {
    const syncActive = (): void => {
      if (options.active!.isOpen()) entry.dataset.active = 'true'
      else delete entry.dataset.active
    }
    const unsubscribe = options.active.subscribe(syncActive)
    syncActive()
    return unsubscribe
  })()

  tryPlace()

  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    resizeObserver?.disconnect()
    unsubscribeActive?.()
    // Undo the geometry we imposed on the official button so unmounting this
    // package restores the shell's own layout exactly.
    const button = root === undefined ? undefined : newSessionButton(root)
    button?.style.removeProperty('width')
    entry.remove()
  }
}
