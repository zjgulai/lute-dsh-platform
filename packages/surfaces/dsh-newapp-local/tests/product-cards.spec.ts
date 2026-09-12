/**
 * The drawer's view model and — more importantly — **what its buttons do**.
 *
 * The failure this file exists to catch is the one the drawer cannot show: a
 * card that renders perfectly and whose button does nothing. Every level of
 * {@link planOpen} is a decision that is invisible in a screenshot, so it is
 * asserted here as arithmetic over observable facts rather than exercised
 * through a browser.
 *
 * Two specific regressions are pinned:
 *
 *  1. **The declaration must survive the parse.** `features[].inputs[]` is what
 *     the entry panel renders its form from; a parser that normalizes it away
 *     produces a card that lists products it cannot open. That is not
 *     hypothetical — it shipped in the first cut of the host scan.
 *  2. **A missing roster must not disable cards.** When `dsh-role-matrix-local`
 *     is uninstalled, "the preset is not installed" is *unknown*, not false; a
 *     card disabled by another plugin's absence would be unrecoverable without
 *     reinstalling that plugin.
 */
import { describe, expect, it } from 'vitest'
import { parseScanPayload, planOpen, productCardMatches, toProductCards, type ProductView } from '../src/client/product-cards.ts'

/** A declaration as a product author would write it — including `inputs`. */
const DECLARATION = {
  id: 'kol-hunter',
  name: '深链星探 KOL Hunter',
  summary: '红人选人工作台',
  version: '0.1.0',
  status: 'draft',
  statusReason: '入口面板的客户端服务尚未打包安装',
  preset: 'agt-033',
  entry: { kind: 'panel', service: 'kol-hunter-workbench', action: 'open' },
  features: [
    {
      id: 'select-candidates',
      label: '选人条件 → 推荐名单',
      kind: 'model',
      inputs: [{ key: 'product' }, { key: 'market' }, { key: 'budget' }],
      steps: [{ id: 'score' }, { id: 'advise' }],
    },
  ],
}

/** A whole route payload with exactly one declared card. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    scannedRoots: ['/Users/lute/project'],
    skipped: [],
    unreadable: [],
    declaredCount: 1,
    undeclaredCount: 24,
    truncated: false,
    cards: [
      {
        dir: '/Users/lute/project/KOL-Hunter',
        label: 'KOL-Hunter',
        products: [DECLARATION],
      },
    ],
    ...overrides,
  }
}

/** The product view from a standard payload. */
function product(): ProductView {
  const parsed = parseScanPayload(payload())
  if (!parsed.ok) throw new Error('fixture must parse')
  return parsed.scan.cards[0]!.products[0]!
}

describe('parseScanPayload', () => {
  it('reads a full scan into cards, products and feature counts', () => {
    const parsed = parseScanPayload(payload())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.scan.scannedRoots).toEqual(['/Users/lute/project'])
    expect(parsed.scan.declaredCount).toBe(1)
    expect(parsed.scan.undeclaredCount).toBe(24)
    const [card] = parsed.scan.cards
    expect(card?.dir).toBe('/Users/lute/project/KOL-Hunter')
    const p = card?.products[0]
    expect(p?.id).toBe('kol-hunter')
    expect(p?.preset).toBe('agt-033')
    expect(p?.service).toBe('kol-hunter-workbench')
    expect(p?.status).toBe('draft')
    expect(p?.statusReason).toBe('入口面板的客户端服务尚未打包安装')
    // Both counts are read from the declaration, not assumed from `steps.length`.
    expect(p?.features).toEqual([
      { id: 'select-candidates', label: '选人条件 → 推荐名单', kind: 'model', steps: 2, inputs: 3 },
    ])
  })

  it('carries the declaration verbatim so the entry panel can render its form', () => {
    // The regression: a normalized view model that drops `inputs[]` yields a
    // card whose button opens a panel with no fields.
    const p = product()
    expect(p.declaration).toEqual(DECLARATION)
    expect((p.declaration['features'] as Array<Record<string, unknown>>)[0]!['inputs']).toHaveLength(3)
    expect(p.declaration['entry']).toEqual({ kind: 'panel', service: 'kol-hunter-workbench', action: 'open' })
  })

  it('is total: a payload that is not a scan report returns a reason, not an empty scan', () => {
    const cases: Array<[unknown, RegExp]> = [
      [null, /不是一个对象/],
      ['nope', /不是一个对象/],
      [{}, /没有 ok:true/],
      [{ ok: false, error: 'boom' }, /boom/],
      [{ ok: true }, /没有 cards\[\]/],
    ]
    for (const [input, pattern] of cases) {
      const parsed = parseScanPayload(input)
      expect(parsed.ok, `input ${JSON.stringify(input)}`).toBe(false)
      if (!parsed.ok) expect(parsed.reason).toMatch(pattern)
    }
  })

  it('keeps a malformed card out of the list without taking the rest down', () => {
    const parsed = parseScanPayload(payload({
      cards: [
        { dir: '', label: 'no-dir', products: [] },
        { dir: '/ok', label: 'ok', products: [{ preset: 'agt-1' }] },
        { dir: '/fine', label: 'fine', products: [DECLARATION] },
        'garbage',
      ],
    }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    // The card with no dir is unusable (it is half the render key); the card
    // whose only product has no id declares nothing a person could open, so it
    // is not a card either — the page lists products, and that card has none.
    expect(parsed.scan.cards.map((c) => c.dir)).toEqual(['/fine'])
    expect(parsed.scan.cards[0]?.products[0]?.id).toBe('kol-hunter')
  })

  it('carries the undeclared count instead of a placeholder card for each (M1/M2)', () => {
    // Negative control: the count has to move when the payload says so, else
    // "0 placeholders" would be indistinguishable from a constant.
    const parsed = parseScanPayload(payload({ undeclaredCount: 24 }))
    if (!parsed.ok) throw new Error('must parse')
    expect(parsed.scan.cards.filter((c) => c.products.length === 0)).toEqual([])
    expect(parsed.scan.undeclaredCount).toBe(24)
  })

  it('reports the scan\u2019s own gaps instead of summarizing them away', () => {
    const parsed = parseScanPayload(payload({
      scannedRoots: [],
      skipped: [{ root: '/nope', reason: 'ENOENT' }],
      unreadable: [{ dir: '/broken', reason: '不是合法 JSON' }],
      truncated: true,
    }))
    if (!parsed.ok) throw new Error('must parse')
    expect(parsed.scan.scannedRoots).toEqual([])
    expect(parsed.scan.skipped).toEqual([{ root: '/nope', reason: 'ENOENT' }])
    expect(parsed.scan.unreadable).toEqual([{ dir: '/broken', reason: '不是合法 JSON' }])
    expect(parsed.scan.truncated).toBe(true)
  })

  it('defaults a missing entry action to open rather than rendering an empty call', () => {
    const parsed = parseScanPayload(payload({
      cards: [{ dir: '/d', label: 'd', products: [{ id: 'x', preset: 'agt-1', entry: { service: 'svc' } }] }],
    }))
    if (!parsed.ok) throw new Error('must parse')
    const plan = planOpen({
      product: parsed.scan.cards[0]!.products[0]!,
      serviceRegistered: true,
      presetInstalled: true,
    })
    expect(plan).toEqual({ level: 1, kind: 'panel', service: 'svc', action: 'open' })
  })
})

describe('toProductCards', () => {
  it('makes one card per product, and the directory becomes metadata (R4)', () => {
    const parsed = parseScanPayload(payload({
      cards: [
        { dir: '/a', label: 'A', products: [DECLARATION] },
        { dir: '/b', label: 'B', products: [{ ...DECLARATION, id: 'second', name: 'Second' }] },
      ],
      declaredCount: 2,
    }))
    if (!parsed.ok) throw new Error('must parse')
    const cards = toProductCards(parsed.scan.cards)
    expect(cards.map((c) => c.product.id)).toEqual(['kol-hunter', 'second'])
    expect(cards.map((c) => c.dir)).toEqual(['/a', '/b'])
    expect(cards.map((c) => c.dirLabel)).toEqual(['A', 'B'])
    // The render key is the product *inside* its directory: product ids are
    // authored by whoever owns the product and are not guaranteed machine-unique.
    expect(cards.map((c) => c.key)).toEqual(['/a::kol-hunter', '/b::second'])
  })

  it('counts cards as products, not directories, when one directory declares several', () => {
    const parsed = parseScanPayload(payload({
      cards: [{ dir: '/a', label: 'A', products: [DECLARATION, { ...DECLARATION, id: 'second' }] }],
    }))
    if (!parsed.ok) throw new Error('must parse')
    const cards = toProductCards(parsed.scan.cards)
    expect(cards).toHaveLength(2)
    expect(cards.every((c) => c.dir === '/a')).toBe(true)
  })
})

describe('planOpen', () => {
  it('level 1: hands the declaration to a registered entry service', () => {
    expect(planOpen({ product: product(), serviceRegistered: true, presetInstalled: true }))
      .toEqual({ level: 1, kind: 'panel', service: 'kol-hunter-workbench', action: 'open' })
  })

  it('level 2: falls back to a session only when the declared preset is really here', () => {
    expect(planOpen({ product: product(), serviceRegistered: false, presetInstalled: true }))
      .toEqual({ level: 2, kind: 'session', preset: 'agt-033' })
  })

  it('level 3: refuses a preset this machine does not have instead of selecting nothing', () => {
    // The silent no-op this level exists for: `agentPresets.select` with an id
    // that is not installed does not throw and does not switch the session.
    expect(planOpen({ product: product(), serviceRegistered: false, presetInstalled: false }))
      .toEqual({ level: 3, kind: 'disabled', reason: 'no-preset-installed' })
  })

  it('level 3: refuses a product that belongs to no role even with a live service name', () => {
    const orphan: ProductView = { ...product(), preset: '' }
    expect(planOpen({ product: orphan, serviceRegistered: false, presetInstalled: true }))
      .toEqual({ level: 3, kind: 'disabled', reason: 'no-preset' })
  })

  it('prefers the product\u2019s own panel over the session fallback whenever it is up', () => {
    // Ordering matters: level 1 is "the product is installed", which is strictly
    // better than "start a chat on its preset".
    const p = product()
    expect(planOpen({ product: p, serviceRegistered: true, presetInstalled: false }).level).toBe(1)
  })
})

describe('productCardMatches', () => {
  const card = {
    key: '/Users/lute/project/KOL-Hunter::kol-hunter',
    dir: '/Users/lute/project/KOL-Hunter',
    dirLabel: 'KOL-Hunter',
    product: product(),
  }

  it('matches on the product, its directory, and its declared preset', () => {
    expect(productCardMatches(card, 'kol')).toBe(true)
    expect(productCardMatches(card, 'agt-033')).toBe(true)
    expect(productCardMatches(card, '红人选人')).toBe(true)
    expect(productCardMatches(card, '')).toBe(true)
    expect(productCardMatches(card, 'nothing-like-this')).toBe(false)
  })

  it('matches on the directory even when the query names nothing about the product', () => {
    // The directory is what a person navigates by when they think of the thing
    // as a project rather than as a product. Searching for it must not come back
    // empty — that reads as "it is gone".
    expect(productCardMatches({ ...card, product: { ...card.product, name: 'x', summary: '', id: 'x' } }, 'KOL-Hunter')).toBe(true)
  })
})
