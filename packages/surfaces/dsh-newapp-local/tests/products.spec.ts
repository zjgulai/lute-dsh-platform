/**
 * `product.json` discovery contract.
 *
 * What this file exists to catch, all of which is silent at runtime:
 *
 *  1. **A bad declaration taking the whole scan down.** The drawer reads the
 *     scan and degrades with a stated reason; a scanner that throws on one
 *     malformed file would blank every card instead of one.
 *  2. **A directory without a declaration coming back as a card.** R2: the page
 *     lists products, not directories. An undeclared directory must not be a
 *     card — but it must still be *counted*, because "nothing declared" and
 *     "nothing scanned" are different answers (ADR-0045 supersedes ADR-0028).
 *  3. **A scan that cannot read anything looking like a scan that found
 *     nothing.** `scannedRoots` / `skipped` / `unreadable` must say which.
 *  4. **Silently accepting a product with no role.** ADR-0033 makes `preset`
 *     required; a product belonging to no role has not decided who it works for.
 *  5. **Scanning by default.** An empty root list must read nothing at all.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseProductDeclaration, scanProducts } from '../src/products.ts'

/** Build a throwaway tree: root/<name>/{product.json?}. */
function makeTree(spec: Record<string, string | null>, prefix = 'products-spec-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  for (const [name, declaration] of Object.entries(spec)) {
    const dir = join(root, name)
    mkdirSync(dir, { recursive: true })
    if (declaration !== null) writeFileSync(join(dir, 'product.json'), declaration, 'utf8')
  }
  return root
}

const roots: string[] = []
function tree(spec: Record<string, string | null>): string {
  const root = makeTree(spec)
  roots.push(root)
  return root
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

const VALID = JSON.stringify({
  schemaVersion: 1,
  products: [
    {
      id: 'kol-hunter',
      name: '深链星探 KOL Hunter',
      summary: '红人选人工作台',
      version: '0.1.0',
      status: 'draft',
      statusReason: '入口服务尚未安装',
      preset: 'agt-033',
      entry: { kind: 'panel', service: 'kol-hunter-workbench', action: 'open' },
      features: [{ id: 'select-candidates', label: '选人条件 → 推荐名单', kind: 'model', steps: [{ id: 'score' }, { id: 'advise' }] }],
    },
  ],
})

/** A minimal valid declaration for one product, named by its id. */
function declaration(id: string): string {
  return JSON.stringify({ schemaVersion: 1, products: [{ id, name: id, preset: 'agt-001' }] })
}

describe('parseProductDeclaration', () => {
  it('reads the fields a card needs, including the preset and the entry service', () => {
    const parsed = parseProductDeclaration(VALID)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const [p] = parsed.products
    expect(p.id).toBe('kol-hunter')
    expect(p.preset).toBe('agt-033')
    expect(p.entryService).toBe('kol-hunter-workbench')
    expect(p.statusReason).toBe('入口服务尚未安装')
    expect(p.features).toEqual([{ id: 'select-candidates', label: '选人条件 → 推荐名单', kind: 'model', steps: 2 }])
  })

  it('is total: every malformed shape returns a reason instead of throwing', () => {
    const cases: Array<[string, RegExp]> = [
      ['{not json', /不是合法 JSON/],
      ['[]', /顶层不是对象/],
      ['{"schemaVersion":2,"products":[{}]}', /只认 1/],
      ['{"schemaVersion":1,"products":[]}', /products\[\] 为空/],
      ['{"schemaVersion":1,"products":["x"]}', /不是对象/],
      ['{"schemaVersion":1,"products":[{"name":"无 id"}]}', /id 缺失/],
    ]
    for (const [text, pattern] of cases) {
      const parsed = parseProductDeclaration(text)
      expect(parsed.ok).toBe(false)
      if (parsed.ok) continue
      expect(parsed.reason).toMatch(pattern)
    }
  })

  it('refuses a product that belongs to no role (ADR-0033: preset is required)', () => {
    const parsed = parseProductDeclaration(JSON.stringify({ schemaVersion: 1, products: [{ id: 'x', name: 'X' }] }))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toMatch(/缺 preset/)
  })

  it('defaults status to draft rather than trusting an unknown value', () => {
    const parsed = parseProductDeclaration(JSON.stringify({ schemaVersion: 1, products: [{ id: 'x', name: 'X', preset: 'agt-001', status: 'whatever' }] }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.products[0].status).toBe('draft')
  })

  it('relays the declaration verbatim, including the fields the card does not use', () => {
    // The card's view drops `features[].inputs[]` (it counts them, it does not
    // carry them). The entry panel renders its form *from* them, so the
    // declaration has to travel whole — normalizing it here is how a drawer ends
    // up listing products it cannot open.
    const withInputs = JSON.stringify({
      schemaVersion: 1,
      products: [{
        id: 'kol-hunter',
        name: 'KOL Hunter',
        preset: 'agt-033',
        entry: { kind: 'panel', service: 'kol-hunter-workbench', action: 'open' },
        features: [{
          id: 'select-candidates',
          label: '选人条件 → 推荐名单',
          kind: 'model',
          inputs: [{ key: 'product', type: 'text', required: true }],
          steps: [{ id: 'score', kind: 'deterministic' }],
          skills: [{ id: 'p2s-kol-creator-matching', layer: 'L1' }],
        }],
      }],
    })
    const parsed = parseProductDeclaration(withInputs)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.products[0].declaration).toEqual(JSON.parse(withInputs).products[0])
    const [feature] = parsed.products[0].declaration['features'] as Array<Record<string, unknown>>
    expect(feature!['inputs']).toHaveLength(1)
    expect(feature!['skills']).toHaveLength(1)
  })
})

describe('scanProducts', () => {
  it('scans nothing when no root is configured (safe default)', () => {
    const report = scanProducts([])
    expect(report.scannedRoots).toEqual([])
    expect(report.cards).toEqual([])
    expect(report.declaredCount).toBe(0)
    expect(report.undeclaredCount).toBe(0)
    expect(report.truncated).toBe(false)
  })

  it('lists only declared directories, and counts the ones that declare nothing (R1/R2)', () => {
    const root = tree({ 'KOL-Hunter': VALID, 'some-other-project': null, '.hidden': null })
    const report = scanProducts([root])
    // The directory is not a card any more: the page lists products.
    expect(report.cards.map((c) => c.label)).toEqual(['KOL-Hunter'])
    expect(report.declaredCount).toBe(1)
    // …but its existence still has to be legible, so the count carries it.
    expect(report.undeclaredCount).toBe(1)
  })

  it('really counts the undeclared directories (negative control for M1)', () => {
    // Without this, `undeclaredCount === 0` on the real machine would be
    // indistinguishable from a constant zero. A tree of nothing but bare
    // directories must push the count up and leave the card list empty.
    const root = tree({ a: null, b: null, c: null })
    const report = scanProducts([root])
    expect(report.cards).toEqual([])
    expect(report.undeclaredCount).toBe(3)
  })

  it('keeps one bad declaration from taking the rest of the scan down', () => {
    const root = tree({ good: VALID, bad: '{oops', half: JSON.stringify({ schemaVersion: 1, products: [{ id: 'no-preset' }] }) })
    const report = scanProducts([root])
    expect(report.declaredCount).toBe(1)
    expect(report.cards.map((c) => c.label)).toEqual(['good'])
    expect(report.unreadable.map((u) => u.dir.split('/').at(-1)).sort()).toEqual(['bad', 'half'])
    expect(report.unreadable.some((u) => /不是合法 JSON/.test(u.reason))).toBe(true)
    expect(report.unreadable.some((u) => /缺 preset/.test(u.reason))).toBe(true)
    // A broken declaration is not productized either — it just fails for a
    // reason the `unreadable` list names.
    expect(report.undeclaredCount).toBe(2)
  })

  it('says which roots it could not scan — an unreadable scan must not look like an empty one', () => {
    const report = scanProducts(['/definitely/not/here'])
    expect(report.scannedRoots).toEqual(['/definitely/not/here'])
    expect(report.cards).toEqual([])
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0].root).toBe('/definitely/not/here')
    expect(report.skipped[0].reason).toBeTruthy()
  })

  it('reports a file given as a root rather than pretending to scan it', () => {
    const root = tree({ 'a-project': VALID })
    const report = scanProducts([join(root, 'a-project', 'product.json')])
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0].reason).toMatch(/不是一个目录/)
  })

  it('bounds the card list and says it was bounded', () => {
    // The bound is on *cards*, so the fixture has to carry declarations: bounding
    // a scan that returns nothing would assert a cap that never fires.
    const spec: Record<string, string | null> = {}
    for (let i = 0; i < 8; i += 1) spec[`p${i}`] = declaration(`p${i}`)
    const root = tree(spec)
    const report = scanProducts([root], { maxCards: 3 })
    expect(report.cards).toHaveLength(3)
    expect(report.truncated).toBe(true)
  })

  it('works with the real product this machine now carries', () => {
    // Not a fixture: the point is that the launcher reads a product written by
    // whoever owns it. If this file moves, the assertion is meant to fail loudly.
    const report = scanProducts(['/Users/lute/project'])
    const card = report.cards.find((c) => c.label === 'KOL-Hunter')
    expect(card?.products[0].preset).toBe('agt-033')
    expect(card?.products[0].entryService).toBe('kol-hunter-workbench')
  })
})
