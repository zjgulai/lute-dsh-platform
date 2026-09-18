// @vitest-environment node
/**
 * Layout guards for the role matrix surface.
 *
 * These assert the *shape* of the stylesheet and the panel source, because the
 * failures they describe are invisible to a DOM test and invisible at runtime:
 * nothing throws when a drawer loses a stacking race, when a reset rule keeps a
 * closed dialog on screen, or when the close button is squeezed to a few pixels
 * by a long title. Each one is a real defect this surface shipped with once.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/role-matrix.module.css', import.meta.url), 'utf8')
const heroCss = readFileSync(new URL('../src/client/hero-entry.module.css', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/client/RoleMatrixPanel.tsx', import.meta.url), 'utf8')

describe('role matrix drawer stacking', () => {
  it('enters the top layer instead of betting on a z-index', () => {
    expect(panel).toContain('<dialog')
    expect(panel).toContain('showModal()')
    // Any z-index here would put the drawer back into the race it left: the
    // plugins installed alongside it reach 2500 / 99999 / 2147483000.
    expect(css).not.toMatch(/\.root\s*\{[^}]*z-index/s)
  })

  it('keeps a closed dialog hidden despite the full-viewport reset', () => {
    // `display: flex` on .root overrides the UA's `dialog:not([open])` rule, so
    // without this the panel stays painted after being closed and unmounted.
    expect(css).toMatch(/\.root:not\(\[open\]\)\s*\{[^}]*display:\s*none/s)
  })

  it('carries the dim on ::backdrop and never on the panel box', () => {
    expect(css).toMatch(/\.root::backdrop\s*\{[^}]*background:/s)
    expect(css).toMatch(/\.panel\s*\{[^}]*background:\s*var\(--dsw-alias-bg-layer-1/s)
  })
})

describe('role matrix close affordance', () => {
  it('gives the close button an unsqueezable 32px box', () => {
    const close = css.match(/\.close\s*\{([^}]*)\}/s)?.[1] ?? ''
    expect(close).toContain('width: 32px')
    expect(close).toContain('height: 32px')
    expect(close).toContain('flex: none')
    expect(close).toContain('padding: 0')
  })

  it('draws the ✕ as a glyph, not as a font character', () => {
    // A text "✕" renders in whatever font the shell resolved and can shift or
    // fall back to tofu; the drawn path cannot.
    expect(panel).not.toMatch(/>\s*✕\s*</)
    expect(panel).toContain('<IconClose />')
    expect(panel).toContain('aria-label={tt(\'panel.close\')}')
  })
})

describe('role matrix sidebar entry row', () => {
  it('uses the shared navigation icon dimensions', () => {
    // Same 24px box + 18px glyph ratio the shell's own nav rows use, so the
    // injected row lines up with them instead of drifting by its icon.
    expect(css).toMatch(/\.entryIcon\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s)
    expect(css).toMatch(/\.entryIcon svg\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s)
  })
})

describe('role matrix brand treatment', () => {
  it('carries the business green on the strip, mark and selected state without gradients', () => {
    expect(css).toContain('--dsw-alias-state-business-primary')
    expect(css).not.toContain('linear-gradient')
    expect(css).toMatch(/\.header::before\s*\{[^}]*background:\s*var\(--dsw-alias-state-business-primary/s)
    expect(css).toMatch(/\.mark\s*\{[^}]*background:\s*var\(--dsw-alias-state-business-tertiary/s)
    expect(css).toMatch(/\.totalAccent\s*\{[^}]*background:\s*var\(--dsw-alias-state-business-tertiary/s)
    expect(css).toMatch(/\.totalAccent::before\s*\{[^}]*background:\s*var\(--dsw-alias-state-business-primary/s)
  })

  it('rides harness semantic tokens for every theme-dependent colour', () => {
    expect(css).toContain('var(--dsw-alias-bg-layer-1')
    expect(css).toContain('var(--dsw-alias-label-primary')
    expect(css).toContain('var(--dsw-alias-label-secondary')
    expect(css).toContain('var(--dsw-alias-border-l1')
    expect(css).toContain('var(--dsw-alias-state-error-primary')
  })
})

describe('role matrix visual contract', () => {
  it('keeps ordinary cards flat and reserves fill for selected or stateful content', () => {
    expect(css).toMatch(/\.card\s*\{[^}]*background:\s*transparent/s)
    expect(heroCss).toMatch(/\.dsh-hero-entry__card\s*\{[^}]*background:\s*transparent/s)
    expect(css).not.toContain('linear-gradient')
    expect(heroCss).not.toContain('linear-gradient')
  })

  it('covers focus-visible and disabled control states', () => {
    expect(css).toMatch(/\.search:focus-visible\s*\{[^}]*outline:/s)
    expect(css).toMatch(/\.card:focus-visible\s*\{[^}]*outline:/s)
    expect(css).toMatch(/\.card:disabled[\s\S]*cursor:\s*not-allowed/s)
    expect(css).toMatch(/\.retry:disabled[\s\S]*opacity:/s)
    expect(heroCss).toMatch(/\.dsh-hero-entry__card:focus-visible\s*\{[^}]*outline:/s)
    expect(heroCss).toMatch(/\.dsh-hero-entry__card:disabled[\s\S]*cursor:\s*not-allowed/s)
  })

  it('keeps error surfaces on semantic state tokens', () => {
    expect(css).toContain('color-mix(in srgb, var(--dsw-alias-state-error-primary)')
    expect(css).not.toContain('#c0392b')
    expect(css).not.toContain('rgba(192, 57, 43')
  })

  it('pins the 180ms motion and reduced-motion fallback', () => {
    expect(css).toContain('180ms')
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toMatch(/@media \(max-width:\s*720px\)[\s\S]*\.cards\s*\{[^}]*grid-template-columns:\s*1fr/s)
    expect(heroCss).toContain('180ms')
    expect(heroCss).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/)
    expect(heroCss).toMatch(/@container \(max-width:\s*620px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
  })
})
