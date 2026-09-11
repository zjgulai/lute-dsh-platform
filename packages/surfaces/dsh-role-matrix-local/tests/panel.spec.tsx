/**
 * Panel behaviour tests (jsdom).
 *
 * Three properties this file exists to hold, each of which regressed silently
 * in the real app before:
 *
 *  1. **The drawer enters the browser's top layer.** A `<dialog>` opened with
 *     `showModal()` is the only thing here that cannot be covered by another
 *     plugin's overlay; a drawer that merely sets `z-index` can be, and was —
 *     a foreign icon ended up sitting on the close button.
 *  2. **Every documented close path actually closes.** The ✕, a click on the
 *     dimmed area and Escape all have to reach `onClose`, because the ✕ is the
 *     one users reach for and the other two are what save them when a foreign
 *     layer eats its click.
 *  3. **The material's own vocabulary survives the render.** Plane → domain →
 *     card nesting, per-card skill/flow chips, and the verbatim skill names.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatrixPayload, RoleCard } from '../src/client/api.ts'
import { RoleMatrixPanel } from '../src/client/RoleMatrixPanel.tsx'

/* ── <dialog> stand-in ────────────────────────────────────────────────────── */

// jsdom ships HTMLDialogElement but not showModal()/close(), so the panel's
// top-layer entry has to be observed through a stand-in that mirrors the two
// behaviours the panel depends on: `open` tracking and the `close` event.
let showModalCalls = 0
const proto = window.HTMLDialogElement.prototype

beforeEach(() => {
  showModalCalls = 0
  Object.defineProperty(proto, 'showModal', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      showModalCalls += 1
      if (this.hasAttribute('open')) throw new Error('InvalidStateError: dialog already open')
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(proto, 'close', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    },
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  delete (proto as unknown as Record<string, unknown>)['showModal']
  delete (proto as unknown as Record<string, unknown>)['close']
})

/* ── fixtures ─────────────────────────────────────────────────────────────── */

/** One role card with every field the panel reads. */
function card(over: Partial<RoleCard> & Pick<RoleCard, 'id' | 'agt' | 'alias'>): RoleCard {
  return {
    title: '岗位名',
    name: `${over.agt} ${over.alias}`,
    description: '把目标转成可执行的方案',
    icon: 'data:image/svg+xml;base64,PHN2Zy8+',
    artifact: '目标与资源决策包',
    metrics: '',
    planeId: 'plane-1',
    planeName: '经营管理',
    domainId: 'domain-1',
    domainName: '经营与组织',
    lifecycleStatus: 'draft',
    productionAuthorized: false,
    subset: ['skill-a', 'skill-b'],
    gaps: [],
    materialSkillNames: ['经营目标拆解'],
    flows: ['FLOW-02'],
    scenarios: ['SCN-001'],
    collaboratesWith: ['AGT-003'],
    playbooks: ['PB-002'],
    ...over,
  }
}

/** Two planes / three domains: enough nesting to prove the grouping renders. */
const payload: MatrixPayload = {
  root: '/Users/lute/.dsh/.agent-presets',
  scannedAt: '2026-09-12T00:00:00.000Z',
  planes: [
    {
      id: 'plane-1',
      name: '经营管理',
      purpose: '经营目标到资源分配',
      roles: 2,
      domains: [
        {
          id: 'domain-1',
          name: '经营与组织',
          roles: [
            card({ id: 'agt-001', agt: 'AGT-001', alias: '衡远' }),
            card({ id: 'agt-002', agt: 'AGT-002', alias: '知微', gaps: ['预算建模'], domainId: 'domain-1' }),
          ],
        },
      ],
    },
    {
      id: 'plane-2',
      name: '业务运营',
      purpose: '成交与履约',
      roles: 1,
      domains: [
        {
          id: 'domain-2',
          name: '增长与渠道',
          roles: [card({
            id: 'agt-021', agt: 'AGT-021', alias: '拓野',
            planeId: 'plane-2', planeName: '业务运营', domainId: 'domain-2', domainName: '增长与渠道',
          })],
        },
      ],
    },
  ],
  totals: { roles: 3, planes: 2, domains: 2, degraded: 0 },
}

/* ── harness ──────────────────────────────────────────────────────────────── */

/** Mount the panel into a fresh container and return its handles. */
async function mount(api: { list: () => Promise<MatrixPayload> }, onClose: () => void): Promise<{
  dialog: HTMLDialogElement
  container: HTMLDivElement
  dispose: () => void
}> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  // Render inside act so the commit and the passive effects (top-layer entry,
  // keydown listener) are drained synchronously.
  act(() => {
    root.render(<RoleMatrixPanel api={api as never} onClose={onClose} />)
  })
  const dialog = container.querySelector('dialog')
  if (dialog === null) throw new Error('panel did not render a <dialog>')
  // Drain the list promise inside act: a pending state update that resolves
  // after the test ends is both a warning and a race.
  await act(async () => { await Promise.resolve() })
  return {
    dialog,
    container,
    dispose: () => {
      // Unmounting is itself a state update: outside act it warns, and the
      // warning would mask the next real one.
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

/** Set a controlled input's value the way React's own event plumbing expects. */
function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('RoleMatrixPanel top layer', () => {
  it('opens itself with showModal() instead of relying on a z-index', async () => {
    const { dialog, dispose } = await mount({ list: async () => payload }, () => {})
    expect(showModalCalls).toBe(1)
    expect(dialog.open).toBe(true)
    expect(dialog.hasAttribute('data-dsh-plugin')).toBe(true)
    dispose()
  })

  it('never sets an inline z-index on the drawer', async () => {
    const { dialog, dispose } = await mount({ list: async () => payload }, () => {})
    // Stacking is the browser's job here; an inline z-index would put the
    // drawer back into the race this design exists to leave.
    expect(dialog.style.zIndex).toBe('')
    dispose()
  })
})

describe('RoleMatrixPanel close paths', () => {
  it('closes from the ✕ button', async () => {
    const onClose = vi.fn()
    const { dialog, dispose } = await mount({ list: async () => payload }, onClose)
    const close = dialog.querySelector<HTMLButtonElement>('[data-dsh-part="panel-close"]')
    expect(close).not.toBeNull()
    expect(close?.getAttribute('aria-label')).not.toBe('')
    act(() => { close?.click() })
    expect(onClose).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('closes from the dimmed area but not from a click inside the panel', async () => {
    const onClose = vi.fn()
    const { dialog, dispose } = await mount({ list: async () => payload }, onClose)
    const inside = dialog.querySelector<HTMLElement>('h2')
    expect(inside).not.toBeNull()
    act(() => { inside?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onClose, 'a click inside the drawer must not dismiss it').not.toHaveBeenCalled()
    // A click whose target is the dialog box itself is a click on the backdrop:
    // the panel occupies the right edge, the rest of the box is the dimmed area.
    act(() => { dialog.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const { dispose } = await mount({ list: async () => payload }, onClose)
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(1)
    dispose()
  })
})

describe('RoleMatrixPanel content', () => {
  it('renders planes as sections and domains as sub-sections', async () => {
    const { dialog, dispose } = await mount({ list: async () => payload }, () => {})
    const text = dialog.textContent ?? ''
    expect(text).toContain('经营管理')
    expect(text).toContain('经营与组织')
    expect(text).toContain('业务运营')
    expect(dialog.querySelectorAll('li > button').length).toBe(3)
    dispose()
  })

  it('expands a card into the material’s verbatim skill names as chips', async () => {
    const { dialog, dispose } = await mount({ list: async () => payload }, () => {})
    const first = dialog.querySelector<HTMLButtonElement>('li > button')
    expect(first?.getAttribute('aria-expanded')).toBe('false')
    act(() => { first?.click() })
    expect(first?.getAttribute('aria-expanded')).toBe('true')
    const expanded = dialog.textContent ?? ''
    expect(expanded).toContain('经营目标拆解')
    expect(expanded).toContain('FLOW-02')
    expect(expanded).toContain('PB-002')
    dispose()
  })

  it('prunes the sections a query does not match', async () => {
    const { dialog, dispose } = await mount({ list: async () => payload }, () => {})
    const input = dialog.querySelector<HTMLInputElement>('input[type="search"]')
    expect(input).not.toBeNull()
    type(input!, '拓野')
    const text = dialog.textContent ?? ''
    expect(text).toContain('业务运营')
    expect(text, 'a plane with no match must not render an empty header').not.toContain('经营管理')
    dispose()
  })

  it('offers a retry when the host list call fails, and re-asks on click', async () => {
    let calls = 0
    const api = {
      list: async () => { calls += 1; throw new Error('HTTP 404') },
    }
    const { dialog, dispose } = await mount(api, () => {})
    expect(dialog.textContent ?? '').toContain('HTTP 404')
    const retry = [...dialog.querySelectorAll('button')]
      .find((button) => button.textContent === '重试')
    expect(retry, 'an error state without a retry strands the user').toBeDefined()
    await act(async () => { retry?.click(); await Promise.resolve() })
    expect(calls).toBe(2)
    dispose()
  })
})
