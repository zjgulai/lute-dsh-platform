/**
 * The rendered drawer — the assertions that only exist once React has run.
 *
 * Everything else in `tests/` tests arithmetic: parsers, planners, the scan.
 * This file exists for the one question arithmetic cannot answer: **what is
 * actually on the card?**
 *
 * That question is the user's own sentence — 「只保留已经产品化的产品，同时使用
 * 大卡片的矩阵形式」 — and it decomposes into two claims a parser cannot make:
 *
 *   1. **M1/M2**: the page renders one card per *product*, and zero cards for a
 *      directory that declares nothing. The scan can count products all day; only
 *      the render shows whether the page agreed.
 *   2. **M4**: every card carries the six facts the matrix is specified to show
 *      (name, summary, status, role, version, feature count). A field can be
 *      present in the view model and absent from the markup — that is exactly how
 *      a "complete" card ships with four fields on it.
 *
 * jsdom performs no layout, so nothing here asserts geometry: the grid's real
 * column count is measured in Chrome by `scripts/geometry-probe.mjs` (M3). This
 * file asserts *content*; that one asserts *boxes*.
 */
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JSX } from 'react'
import { NewAppPanel } from '../src/client/NewAppPanel.tsx'
import type { AppLauncher } from '../src/client/launcher.ts'
import type { ScanResult } from '../src/client/product-cards.ts'

// React 18 reads this to decide whether `act` should warn. Without it every
// assertion below still passes but the run is full of "not wrapped in act".
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/*
 * jsdom 25 ships `HTMLDialogElement` with `open` but **without** `showModal` /
 * `close` (measured). The panel already degrades on that — it logs, falls back to
 * a plainly visible dialog, and only closes when the method exists — so the cards
 * still render. But the fallback logs an error on every mount, which would bury
 * this file's real output.
 *
 * So the fixture supplies the two methods the way a browser does. This is not
 * papering over a failure: the assertions below are about **card content**, and
 * dialog modality is measured in a real browser by `scripts/geometry-probe.mjs`.
 */
beforeAll(() => {
  const proto = window.HTMLDialogElement?.prototype as (HTMLDialogElement & { close(): void }) | undefined
  if (proto !== undefined) {
    proto.showModal = function showModal(this: HTMLDialogElement): void { this.open = true }
    proto.close = function close(this: HTMLDialogElement): void { this.open = false }
  }
})

/** One declaration, as a product author would write it. */
const DECLARATION = {
  id: 'kol-hunter',
  name: '深链星探 KOL Hunter',
  summary: '红人选人工作台',
  version: '0.1.0',
  status: 'draft',
  statusReason: '入口服务尚未安装',
  preset: 'agt-033',
  entry: { kind: 'panel', service: 'kol-hunter-workbench', action: 'open' },
  features: [
    { id: 'select-candidates', label: '选人条件 → 推荐名单', kind: 'model', inputs: [{ key: 'a' }], steps: [{ id: 's' }] },
  ],
}

/** A scan as `/api/dsh-newapp/products` would publish it. */
function scan(cards: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): ScanResult {
  return {
    ok: true,
    scan: {
      scannedRoots: ['/Users/lute/project'],
      skipped: [],
      unreadable: [],
      cards: cards as never,
      declaredCount: cards.length,
      undeclaredCount: 24,
      truncated: false,
      ...extra,
    },
  }
}

/** The one declared card this machine really has. */
const ONE_CARD = scan([{ dir: '/Users/lute/project/KOL-Hunter', label: 'KOL-Hunter', products: [DECLARATION] }])

/** A launcher that answers without a registry: preset installed, service not. */
function launcher(): AppLauncher {
  return {
    prime: async () => {},
    isRegistered: () => false,
    hasPreset: () => true,
    run: async () => ({ ok: true, note: '' }),
  } as unknown as AppLauncher
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  act(() => { root?.unmount() })
  container.remove()
  vi.restoreAllMocks()
})

/** Render the drawer against a fixed scan and let its effects settle. */
async function render(result: ScanResult): Promise<HTMLDialogElement> {
  const api = { products: async () => result }
  await act(async () => {
    root = createRoot(container)
    root.render(<NewAppPanel api={api as never} launcher={launcher()} onClose={() => {}} /> as JSX.Element)
  })
  // The load is a promise chain inside an effect; a second flush lands its setState.
  await act(async () => { await Promise.resolve() })
  const dialog = container.querySelector('dialog')
  if (dialog === null) throw new Error('panel did not render a <dialog>')
  return dialog as HTMLDialogElement
}

const cards = (dialog: HTMLElement): HTMLElement[] =>
  [...dialog.querySelectorAll('[data-dsh-part="product-card"]')] as HTMLElement[]

describe('the rendered product matrix', () => {
  it('renders exactly one card for one declared product (M2)', async () => {
    const dialog = await render(ONE_CARD)
    const rendered = cards(dialog)
    expect(rendered).toHaveLength(1)
    expect(rendered[0]!.dataset['dshProduct']).toBe('kol-hunter')
    // The directory is metadata on the card, not its identity.
    expect(rendered[0]!.dataset['dshDir']).toBe('/Users/lute/project/KOL-Hunter')
  })

  it('renders no card at all for a machine that declares nothing (M1)', async () => {
    // The negative control for M2: if this also rendered one card, the assertion
    // above would be satisfied by a component that always renders one card.
    const dialog = await render(scan([]))
    expect(cards(dialog)).toEqual([])
    // …and the bare directories are still legible. R3 puts that fact in the empty
    // state here — there is no card list to hang a footer note on — so this is the
    // line that has to carry it.
    const empty = dialog.querySelector('[data-dsh-part="empty-state"]')
    expect(empty?.textContent ?? '').toContain('24')
    expect(empty?.textContent ?? '').toContain('product.json')
    expect(dialog.querySelector('[data-dsh-part="undeclared-count"]')).toBeNull()
  })

  it('puts all six specified facts on the card (M4)', async () => {
    const dialog = await render(ONE_CARD)
    const card = cards(dialog)[0]!
    const text = card.textContent ?? ''
    // 名称 / summary / 状态 / 岗位 / 版本 / 功能数 — one assertion each, so a
    // missing one names itself instead of failing as "text mismatch".
    expect(text, '名称').toContain('深链星探 KOL Hunter')
    expect(text, 'summary').toContain('红人选人工作台')
    expect(text, '状态').toContain('草案')
    expect(text, '岗位').toContain('agt-033')
    expect(text, '版本').toContain('0.1.0')
    expect(text, '功能数').toContain('1 个功能')
    // The directory rides along as the seventh, and the button says what it does.
    expect(text, '目录').toContain('KOL-Hunter')
    expect(card.querySelector('[data-dsh-part="open-product"]')?.textContent).toBe('开会话')
  })

  it('renders one card per product when a single directory declares several', async () => {
    // The card key is the product. A directory declaring two products is two
    // things a person can start, so it is two cards.
    const dialog = await render(scan([
      { dir: '/Users/lute/project/KOL-Hunter', label: 'KOL-Hunter', products: [DECLARATION, { ...DECLARATION, id: 'second', name: '第二个产品' }] },
    ]))
    const rendered = cards(dialog)
    expect(rendered).toHaveLength(2)
    expect(rendered.map((c) => c.dataset['dshProduct'])).toEqual(['kol-hunter', 'second'])
    // Both keep the directory they came from.
    expect(new Set(rendered.map((c) => c.dataset['dshDir']))).toEqual(new Set(['/Users/lute/project/KOL-Hunter']))
  })

  it('says which directories are not productized without spending a card on them (R3)', async () => {
    const dialog = await render(ONE_CARD)
    // One card, and the 24 undeclared directories appear only as a count.
    expect(cards(dialog)).toHaveLength(1)
    expect(dialog.querySelector('[data-dsh-part="undeclared-count"]')?.textContent ?? '').toContain('24')
  })
})
