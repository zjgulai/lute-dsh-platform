// @vitest-environment jsdom
/**
 * Contract test for the shared sidebar-entry core's `split` placement.
 *
 * jsdom performs no layout, so the shell's geometry is *supplied* here: the
 * official button's rect is stubbed with the values the shipping stylesheet
 * actually produces (`height: 38px`, `margin: 0 2px 8px` expanded; `36x36`
 * collapsed). What is under test is therefore the core's own arithmetic and
 * its choice of styles — not the browser's layout engine. Real-browser geometry
 * is asserted separately at the product level.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  applySplitGeometry,
  mountSidebarEntry,
  SPLIT_COLLAPSED_LIMIT,
  type SidebarEntryOptions,
} from '../src/client/sidebar-entry-core'

/** Build the shell's sidebar skeleton: column > root > [logoRow, newSession, regionArea]. */
function buildShell(): { root: HTMLElement; official: HTMLButtonElement } {
  document.body.innerHTML = ''
  const column = document.createElement('div')
  column.setAttribute('data-pane', 'sidebar')
  const root = document.createElement('div')
  root.className = 'x-Wl6W_root'
  const logoRow = document.createElement('div')
  logoRow.className = 'x-Wl6W_logoRow'
  const official = document.createElement('button')
  official.type = 'button'
  official.className = 'x-Wl6W_newSession'
  // Inline so jsdom's getComputedStyle reports it; the real value comes from
  // the shell's stylesheet (`.newSession { margin: 0 2px 8px }`).
  official.style.marginBottom = '8px'
  const region = document.createElement('div')
  region.className = 'x-Wl6W_regionArea'
  root.append(logoRow, official, region)
  column.append(root)
  document.body.append(column)
  return { root, official }
}

/** Stub the official button's rendered box (jsdom measures everything as 0). */
function stubRect(el: HTMLElement, width: number, height: number): void {
  el.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect
}

function options(overrides: Partial<SidebarEntryOptions> = {}): SidebarEntryOptions {
  return {
    rowAttribute: 'data-dsh-newapp-entry',
    rowSelector: '[data-dsh-newapp-entry]',
    icon: '<svg width="16" height="16"></svg>',
    css: { entry: 'entry', entryIcon: 'entryIcon', entryLabel: 'entryLabel' },
    label: () => '新应用',
    onToggle: () => {},
    position: 'split',
    familySelectors: ['[data-dsh-newapp-entry]'],
    ...overrides,
  }
}

describe('sidebar entry · split placement geometry', () => {
  let shell: { root: HTMLElement; official: HTMLButtonElement }
  let entry: HTMLButtonElement

  beforeEach(() => {
    shell = buildShell()
    entry = document.createElement('button')
  })

  it('splits the expanded row 50/50 and lifts the entry by the official advance', () => {
    stubRect(shell.official, 240, 38)

    applySplitGeometry(shell.official, entry)

    // 2 + W + 2 (official margins) + 2 + W + 2 (entry margins) = 100%  =>  W = 50% - 4px
    expect(shell.official.style.width).toBe('calc(50% - 4px)')
    expect(entry.style.width).toBe('calc(50% - 4px)')
    // Lift = official height (38) + official margin-bottom (8). A hard-coded
    // -46px would silently break the moment the shell changes either value.
    expect(entry.style.marginTop).toBe('-46px')
    expect(entry.style.alignSelf).toBe('flex-end')
    expect(entry.dataset.split).toBe('expanded')
  })

  it('derives the lift from the measured box instead of a magic number', () => {
    stubRect(shell.official, 200, 44)
    shell.official.style.marginBottom = '6px'

    applySplitGeometry(shell.official, entry)

    expect(entry.style.marginTop).toBe('-50px')
  })

  it('stacks instead of splitting in the collapsed rail (36px content box, 18px icon)', () => {
    stubRect(shell.official, 36, 36)
    shell.official.style.width = '36px'
    entry.style.width = 'calc(50% - 4px)'

    applySplitGeometry(shell.official, entry)

    // The shell's own 36px metric is restored and nothing is lifted: forcing a
    // split here would leave ~17px per button and clip the 18px icon.
    expect(shell.official.style.width).toBe('')
    expect(entry.style.width).toBe('')
    expect(entry.style.marginTop).toBe('')
    expect(entry.style.alignSelf).toBe('')
    expect(entry.dataset.split).toBe('collapsed')
  })

  it('leaves the layout untouched before the shell has laid out (width 0)', () => {
    stubRect(shell.official, 0, 0)

    applySplitGeometry(shell.official, entry)

    expect(shell.official.style.width).toBe('')
    expect(entry.style.marginTop).toBe('')
    expect(entry.dataset.split).toBeUndefined()
  })

  it('treats the collapsed threshold as exclusive of the expanded button', () => {
    stubRect(shell.official, SPLIT_COLLAPSED_LIMIT, 36)
    applySplitGeometry(shell.official, entry)
    expect(entry.dataset.split).toBe('expanded')

    stubRect(shell.official, SPLIT_COLLAPSED_LIMIT - 1, 36)
    applySplitGeometry(shell.official, entry)
    expect(entry.dataset.split).toBe('collapsed')
  })
})

describe('sidebar entry · split placement wiring', () => {
  it('inserts the entry as the official button\'s immediate next sibling', () => {
    const { root, official } = buildShell()
    stubRect(official, 240, 38)

    const dispose = mountSidebarEntry(options())

    const entry = document.querySelector<HTMLButtonElement>('[data-dsh-newapp-entry]')
    expect(entry).not.toBeNull()
    // Immediate sibling matters: the negative top margin only lands in the same
    // visual band when nothing sits between the two buttons.
    expect(entry!.previousElementSibling).toBe(official)
    expect(entry!.parentElement).toBe(root)
    // The official button was narrowed, and its node identity was not replaced.
    expect(official.style.width).toBe('calc(50% - 4px)')
    expect(root.querySelector('button[class*="newSession"]')).toBe(official)

    dispose()
  })

  it('restores the shell\'s own layout on unmount', () => {
    const { official } = buildShell()
    stubRect(official, 240, 38)

    const dispose = mountSidebarEntry(options())
    expect(official.style.width).toBe('calc(50% - 4px)')

    dispose()

    expect(official.style.width).toBe('')
    expect(document.querySelector('[data-dsh-newapp-entry]')).toBeNull()
  })

  it('never mounts a second row when called twice (idempotent)', () => {
    const { official } = buildShell()
    stubRect(official, 240, 38)

    const disposeA = mountSidebarEntry(options())
    const disposeB = mountSidebarEntry(options())

    expect(document.querySelectorAll('[data-dsh-newapp-entry]').length).toBe(1)
    disposeA()
    disposeB()
  })
})
