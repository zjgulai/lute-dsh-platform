/**
 * Stylesheet discipline — the three token laws, asserted instead of trusted.
 *
 * Why a test rather than a review habit: every failure this file guards against
 * is **silent**. A hallucinated token name is valid CSS, so the declaration
 * quietly falls back to its literal. A `font-size` without its paired
 * `line-height` renders fine until the text wraps. A brand literal outside the
 * brand block still paints — it just stops following the theme. None of these
 * produce an error, a warning, or a visible defect in the theme they were
 * written in. The measured cost of that silence is on record: eight
 * hallucinated tokens accumulated in
 * `scripts/gates/theme-tokens-baseline.json`, and the previous revision of this
 * very stylesheet shipped `--dsw-font-mono` — a name our own theme plugin
 * defines on a path that never reaches the page, so it resolved to nothing in
 * both themes while a static gate called it "defined".
 *
 * The rules:
 *
 *  A. **Literals live in the brand block only.** Every `#hex` / `rgb()` /
 *     `rgba()` / `hsl()` outside a `var(…, <literal>)` fallback must sit inside
 *     the single `.root, .entry` declaration block, or be a colour named in a
 *     comment. Brand colour is fixed by brand, so it is the one thing that may
 *     not be a token; everything else must be.
 *  B. **Fallbacks are the truth, not a guess** — shape-checked here (never a
 *     named colour like `black`, which is a different colour per theme engine);
 *     the values themselves are verified against the live engine by
 *     `pnpm run accept:theme-tokens`, which is the only instrument that can.
 *  C. **Type rides the official shorthands.** No bare `font-size`/`line-height`
 *     pairs: the pairing is the design decision and the shell already made it.
 *     Where a shorthand is deliberately followed by a family/variant override,
 *     the order is asserted — `font:` resets both, so a reversed pair silently
 *     undoes the override.
 *  D. **Token names are well formed**, so a typo fails here rather than in a
 *     theme nobody is currently looking at.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// vitest runs with cwd pinned to the package root (the established convention in
// this repo's sibling plugin tests).
const CSS_PATH = join(process.cwd(), 'src/client/newapp.module.css')
const css = readFileSync(CSS_PATH, 'utf8')

/** Strip block comments, so prose about colours is not read as colour. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

const code = stripComments(css)
const lines = code.split('\n')

/** The one declaration block allowed to hold literals: `.root,\n.entry { … }`. */
function brandBlockRange(text: string): { start: number; end: number } {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.trim() === '.root,')
  expect(start, 'the brand block selector list `.root,` must exist').toBeGreaterThanOrEqual(0)
  const end = lines.findIndex((line, i) => i > start && line.trim() === '}')
  return { start, end }
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g

describe('stylesheet tokens', () => {
  it('keeps every colour literal inside the single brand block (Law A)', () => {
    const { start, end } = brandBlockRange(code)
    const outside: string[] = []
    lines.forEach((line, i) => {
      if (i > start && i < end) return
      const hits = line.match(COLOR_LITERAL)
      if (hits === null) return
      // A literal inside a `var()` fallback is Law B, checked separately.
      const inFallback = /var\(\s*--[a-z0-9-]+\s*,[^)]*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/.test(line)
      if (inFallback) return
      outside.push(`${String(i + 1)}: ${line.trim()}`)
    })
    expect(outside, 'colour literals outside the brand block').toEqual([])
  })

  it('declares the brand block on both roots, since they are separate trees', () => {
    // The drawer (`.root`) and the sidebar row (`.entry`) have no shared
    // ancestor, so a single-selector block would leave half the UI untinted.
    const { start } = brandBlockRange(code)
    expect(lines[start + 1].trim()).toBe('.entry {')
    expect(css).toMatch(/--lute-brand:\s*#58b848/)
  })

  it('uses no named colours as fallbacks (Law B)', () => {
    // A named colour is a different colour in different engines, and it is the
    // shape a "just make it work" edit takes.
    for (const line of lines) {
      const named = /var\(\s*--[a-z0-9-]+\s*,\s*(black|white|red|green|blue|gray|grey|silver)\s*\)/.exec(line)
      expect(named, `named colour fallback on: ${line.trim()}`).toBeNull()
    }
  })

  it('never pairs a bare font-size with a line-height (Law C)', () => {
    // The official ladder (`--dsw-font-*`) carries the pair. A bare size is how
    // a line-height drifts away from the design system one rule at a time.
    const bareSizes = lines
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /^\s*font-size\s*:/.test(line))
    expect(bareSizes, 'bare font-size declarations — use `font: var(--dsw-font-…)`').toEqual([])
  })

  it('always takes type from the official shorthand family (Law C)', () => {
    for (const line of lines) {
      const shorthand = /^\s*font\s*:/.exec(line)
      if (shorthand === null) continue
      expect(line, `font shorthand must use an official token: ${line.trim()}`).toMatch(
        /font:\s*var\(--dsw-font-[a-z0-9-]+\)/,
      )
    }
  })

  it('orders family/numeric overrides after the font shorthand they override (Law C)', () => {
    // `font:` is a shorthand and resets font-family *and* font-variant. A
    // reversed pair is valid CSS that silently does nothing.
    const declarations = code.split('}')
    for (const block of declarations) {
      const fontIndex = block.search(/^\s*font\s*:/m)
      if (fontIndex < 0) continue
      for (const prop of ['font-family', 'font-variant-numeric']) {
        const overrideIndex = block.search(new RegExp(`^\\s*${prop}\\s*:`, 'm'))
        if (overrideIndex < 0) continue
        expect(
          overrideIndex,
          `${prop} must come after the shorthand that resets it:\n${block.trim()}`,
        ).toBeGreaterThan(fontIndex)
      }
    }
  })

  it('names only well-formed dsw tokens (Law D)', () => {
    const tokens = new Set(code.match(/var\(\s*(--[a-z0-9-]+)/g)?.map((m) => m.replace(/var\(\s*/, '')) ?? [])
    const vendor = [...tokens].filter((token) => /^--(dsw|ds)-/.test(token))
    expect(vendor.length).toBeGreaterThan(10)
    for (const token of vendor) {
      // At least two non-empty segments after the vendor prefix: `--dsw-` and
      // `--dsw-alias-` are prefix fragments, not token names.
      expect(token, `ill-formed token name: ${token}`).toMatch(/^--(dsw|ds)-[a-z0-9]+(-[a-z0-9]+)+$/)
    }
    // The package's own variables are namespaced `--lute-*`, so a vendor-looking
    // name can never be one of ours by accident.
    for (const token of tokens) {
      const isOurs = token.startsWith('--lute-')
      const isVendor = /^--(dsw|ds)-/.test(token)
      expect(isOurs || isVendor, `un-namespaced custom property: ${token}`).toBe(true)
    }
  })

  it('no longer claims the theme plugin token that never reaches the page', () => {
    // `--dsw-font-mono` is declared by dsh-theme-local's override map but lands
    // on a path that never reaches the rendered page (measured: resolves to
    // `rgba(0, 0, 0, 0)` in both themes under `pnpm run accept:theme-tokens`).
    // Referencing it looks themed and is not.
    expect(code).not.toContain('--dsw-font-mono')
    expect(code).toContain('--ds-font-family-code')
  })

  it('keeps reduced-motion and focus-visible coverage', () => {
    // Both are shell-wide expectations; a drawer that animates under
    // `prefers-reduced-motion` is the accessibility regression that ships
    // silently because nobody runs the OS setting during review.
    expect(code).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    for (const selector of ['.ghost:focus-visible', '.close:focus-visible', '.search:focus-visible', '.primary:focus-visible', '.entry:focus-visible', '.sysCard:focus-visible']) {
      expect(code, `missing ${selector}`).toContain(selector)
    }
  })
})

/**
 * Every class name the components ask this stylesheet for, and every class name
 * the stylesheet defines — so the two sets can be compared.
 *
 * Why this exists: `css['x'] ?? ''` is the idiom every component here uses, so a
 * class name that does not resolve renders as an *empty class attribute* — a
 * perfectly valid, perfectly unstyled card, with nothing logged. The same
 * silence runs the other way: a rule left behind after its component stopped
 * rendering is dead CSS that reads like live UI to the next person.
 */
function askersAndDefinitions(): { asked: Set<string>; defined: Set<string> } {
  const asked = new Set<string>()
  // Every file that renders against this stylesheet. The section files joined
  // the list when the drawer gained its second section: a class defined but
  // never asked for is dead CSS, and the check is only worth running if it
  // covers the components that exist.
  for (const file of ['NewAppPanel.tsx', 'SystemsSection.tsx', 'sidebar-entry-core.ts']) {
    const text = stripComments(readFileSync(join(process.cwd(), 'src/client', file), 'utf8'))
    for (const match of text.matchAll(/css\['([A-Za-z0-9_-]+)'\]/g)) asked.add(match[1]!)
  }
  const defined = new Set<string>()
  for (const match of code.matchAll(/^\.([A-Za-z][A-Za-z0-9_-]*)/gm)) defined.add(match[1]!)
  return { asked, defined }
}

describe('matrix layout (M3)', () => {
  it('lays the product cards out as a wrapping grid, not a column', () => {
    // M3: 「大卡片的矩阵形式」. The complaint this answers is concrete — the old
    // shape was a flex column, so 25 cards stacked one per row and every one of
    // them was as short as a list item.
    expect(code).toMatch(/\.grid\s*\{[^}]*display:\s*grid/)
    expect(code).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/)
  })

  it('keeps the card a card at every width, so the count is the only thing that moves', () => {
    // `auto-fill` + `minmax` is what makes the column count follow the viewport.
    // A hard `repeat(3, 1fr)` would be three cards on a phone; a percentage
    // would be one, always.
    const gridStart = code.indexOf('.grid {')
    expect(gridStart).toBeGreaterThanOrEqual(0)
    const block = code.slice(gridStart, code.indexOf('}', gridStart))
    expect(block).toContain('auto-fill')
    expect(block).not.toMatch(/repeat\(\s*\d/)
    // The cell is a card, not a row: it must be allowed to be tall.
    expect(code).toMatch(/\.card\s*\{[^}]*align-items:\s*stretch/)
  })

  it('defines every class the components ask for, and asks for every class it defines', () => {
    const { asked, defined } = askersAndDefinitions()
    expect(asked.size).toBeGreaterThan(20)
    // A rule for a class nothing renders is how a retired UI keeps looking alive.
    const orphaned = [...defined].filter((name) => !asked.has(name)).sort()
    expect(orphaned, 'stylesheet rules no component asks for').toEqual([])
    // A class asked for but never defined is an empty class attribute: valid
    // HTML, no styling, no error.
    const missing = [...asked].filter((name) => !defined.has(name)).sort()
    expect(missing, 'class names the components ask for but the stylesheet lacks').toEqual([])
  })
})
