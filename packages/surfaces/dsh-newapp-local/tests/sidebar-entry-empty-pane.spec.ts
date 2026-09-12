// @vitest-environment jsdom
/**
 * Regression: a sidebar pane that exists while momentarily **empty**.
 *
 * `sidebarRoot()` resolves the shell's sidebar through its pane marker and then
 * through the logo row's parent, falling back to the pane's `firstElementChild`.
 * That fallback is `Element | null` — not `| undefined` — so an empty pane used
 * to return `null` while every caller in the shared core guards on `undefined`
 * alone. Measured consequences, both from `scripts/reconcile-probe.mjs` under
 * real React rather than reasoned about:
 *
 *   - the guard is bypassed and the core throws out of its MutationObserver
 *     callback (an uncaught error in the host page);
 *   - worse, the stuck value stays `null`, so the `!== undefined` check keeps
 *     failing on every later mutation and the row is **never placed again** —
 *     across a full pane teardown and rebuild, plus five further re-renders,
 *     with one TypeError per mutation batch.
 *
 * This case pins the contract at unit speed with no React and no shipped bundle.
 * The React-level evidence lives in `scripts/reconcile-probe.mjs`; the two are
 * complements and neither substitutes for the other.
 *
 * It lives in its own file deliberately. The sibling spec's later cases mount
 * the entry and never dispose it, leaving observers that resurrect their rows
 * into whatever DOM the next test builds; two rows then fight over the same
 * anchor and the move-triggers-observer loop starves the microtask queue. A
 * regression test that can only pass in a pristine document belongs in one.
 */
import { describe, expect, it } from 'vitest'
import { ENTRY_SELECTOR, mountSidebarEntry } from '../src/client/sidebar-entry.ts'

/** Report the box the core reads, since jsdom performs no layout. */
function stubRect(el: HTMLElement, width: number, height: number): void {
  el.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect
}

describe('empty sidebar pane', () => {
  it('does not throw, and still places the row once the pane fills', async () => {
    const pane = document.createElement('div')
    pane.setAttribute('data-pane', 'sidebar')
    document.body.append(pane)

    // The pane exists with no children — the state that used to return `null`.
    let dispose: () => void = () => {}
    expect(() => {
      dispose = mountSidebarEntry(() => {}, { isOpen: () => false, subscribe: () => () => {} })
    }).not.toThrow()
    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()

    // The shell fills the pane; the body-level watcher must still place the row.
    const root = document.createElement('div')
    const official = document.createElement('button')
    official.type = 'button'
    official.className = 'x-Wl6W_newSession'
    stubRect(official, 240, 38)
    root.append(official)
    pane.append(root)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const entry = document.querySelector(ENTRY_SELECTOR)
    expect(entry).not.toBeNull()
    expect(entry!.previousElementSibling).toBe(official)
    expect(entry!.parentElement).toBe(root)

    // Dispose the mount: its observers outlive the test otherwise, and jsdom
    // tears the `document` global down before it stops delivering mutations,
    // which surfaces as a `ReferenceError: document is not defined` after the
    // run. The browser always has a document — that failure is this harness's,
    // not the core's, so the fix belongs here rather than behind a defensive
    // `typeof document` guard in the shared layer.
    dispose()
    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()
  })
})
