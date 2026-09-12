/**
 * Sidebar entry injection — package-specific wiring over the shared core.
 *
 * This is the first consumer to use `position: 'split'`: the row sits **beside**
 * the official New Session button, each taking half the row, instead of
 * stacking after it in the plugin family block. The DOM injection, geometry,
 * self-healing and idempotency all live in the shared
 * sidebar-entry-core.ts (synced copy) — this wrapper supplies only this
 * package's glyph, copy, CSS module, placement, and the drawer toggle.
 *
 * Why the split rather than a fifth stacked row: 「新会话」 and 「新应用」 are the
 * two ways to *start*, and the shell gives starting exactly one band. Adding a
 * second row would push the workspace browser down and imply the two are
 * sequential (pick a session type, then pick an app) when they are alternatives.
 * Sharing the band states the relationship in the layout itself.
 */
import { tt } from './panel-helpers.ts'
import css from './newapp.module.css'
import { mountSidebarEntry as mountSharedSidebarEntry } from './sidebar-entry-core.ts'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-newapp-entry]'

/** Inline app-grid glyph normalized to the shell's 18px navigation size. */
const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.8" y="1.8" width="5.4" height="5.4" rx="1.4"/><rect x="8.8" y="1.8" width="5.4" height="5.4" rx="1.4"/><rect x="1.8" y="8.8" width="5.4" height="5.4" rx="1.4"/><path d="M11.5 9.1v4.8M9.1 11.5h4.8"/></svg>'

/** Live signals the row mirrors. */
export interface SidebarEntrySignals {
  /** Whether the drawer is currently mounted. */
  isOpen(): boolean
  /** Subscribe to open/close transitions. */
  subscribe(listener: () => void): () => void
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing on
 * later React re-renders.
 * @param onClick - toggles the application-matrix drawer.
 * @param signals - open-state provider.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(onClick: () => void, signals: SidebarEntrySignals): () => void {
  return mountSharedSidebarEntry({
    rowAttribute: 'data-dsh-newapp-entry',
    rowSelector: ENTRY_SELECTOR,
    // L2 plugin id: makes the row carry data-dsh-plugin + data-dsh-part="sidebar-entry".
    plugin: 'newapp-local',
    icon: ICON,
    css,
    label: () => tt('entry.label'),
    tooltip: () => tt('entry.tooltip'),
    onToggle: onClick,
    position: 'split',
    // Carried for the shared core's family-block path (and for the collapsed
    // rail fallback, which stacks rather than splitting): the split mode places
    // against the official button itself, but a downgrade must still land in
    // the same relative order as the sibling plugin rows.
    familySelectors: [
      '[data-dsh-taskboard-entry]',
      '[data-dsh-ssh-entry]',
      '[data-dsh-skill-center-entry]',
      '[data-dsh-role-matrix-entry]',
      '[data-dsh-newapp-entry]',
    ],
    active: {
      subscribe: (listener: () => void) => signals.subscribe(listener),
      isOpen: () => signals.isOpen(),
    },
  })
}
