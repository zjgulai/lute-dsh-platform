/**
 * Seat-width contract.
 *
 * The settings page does not get to choose its width. The official shell owns a
 * fixed-width panel with a fixed-width nav rail, and the page is handed what is
 * left. The first acceptance render missed this: it placed the page in a
 * hand-made 880px wrapper and checked "no horizontal overflow" there — a number
 * 56% wider than reality, so the check proved nothing about the page a user
 * actually opens.
 *
 * That is the failure this file exists to stop: not a broken layout, but a
 * confident check performed at a width that does not exist. Two assertions:
 *
 *  1. The page's own stylesheet must fit the seat: no fixed `width`/`min-width`
 *     larger than the seat, and the card grid's minimum column must fit.
 *  2. The recorded seat width must still match the official shell. When the
 *     vendored reference is present the number is re-derived from the official
 *     stylesheet; a mismatch means upstream resized the panel and the acceptance
 *     render has to be re-run before anyone trusts it again.
 *
 * jsdom cannot lay out CSS, so neither assertion is a layout test. They are
 * static checks over the stylesheet — which is exactly what they need to be to
 * run in a fresh checkout with no browser.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const CSS = join(HERE, '..', 'src', 'client', 'algo-skills.module.css')
const OFFICIAL = join(
  HERE, '..', '..', '..', '..',
  'vendor', 'dsh-desktop', 'deepseek-harness',
  'packages', 'client', 'ui-settings-general', 'src', 'client', 'SettingsRoot.module.css',
)

/**
 * The seat the page is handed, in CSS pixels.
 *
 * Measured 2026-09-12 from the official panel (`width: 800px`), nav rail
 * (`width: 188px`) and options padding (`0 24px 24px`): 800 − 188 − 2×24.
 * Re-derived below whenever the vendored reference is on disk.
 */
const RECORDED_SEAT_PX = 564

/** The page stylesheet, comments stripped so a commented-out rule cannot pass. */
function pageCss(): string {
  return readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Pull one declaration out of one official rule. */
function officialDecl(css: string, selector: string, property: string): string {
  const block = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)
  if (block === null) throw new Error(`official CSS has no ${selector} rule`)
  const found = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+);`).exec(block[1] as string)
  if (found === null) throw new Error(`official ${selector} has no ${property}`)
  return (found[1] as string).trim()
}

/** First px length in a declaration, e.g. `min(800px, …)` -> 800. */
function px(value: string): number {
  const n = /(\d+(?:\.\d+)?)px/.exec(value)
  if (n === null) throw new Error(`no px length in ${value}`)
  return Number(n[1])
}

/** Every `width` / `min-width` length the page stylesheet declares, in px. */
function declaredWidths(css: string): Array<{ property: string; value: number }> {
  const out: Array<{ property: string; value: number }> = []
  for (const m of css.matchAll(/(?:^|[;{])\s*(min-width|width)\s*:\s*([^;{}]+)/g)) {
    const [, property, raw] = m as unknown as [string, string, string]
    for (const n of raw.matchAll(/(\d+(?:\.\d+)?)px/g)) {
      out.push({ property, value: Number(n[1]) })
    }
  }
  return out
}

/** The smallest column the card grid will accept, or undefined when absent. */
function gridMinColumn(css: string): number | undefined {
  const m = /grid-template-columns\s*:\s*repeat\(\s*auto-fill\s*,\s*minmax\(\s*(\d+(?:\.\d+)?)px/.exec(css)
  return m === null ? undefined : Number(m[1])
}

describe('settings seat width', () => {
  it('keeps every fixed width inside the seat', () => {
    const offenders = declaredWidths(pageCss())
      .filter(({ value }) => value > RECORDED_SEAT_PX)
      .map(({ property, value }) => `${property}: ${value}px`)
    expect(
      offenders,
      `the settings seat is ${RECORDED_SEAT_PX}px; these cannot fit and will force the shell to scroll sideways: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('lets the card grid lay out at least one column in the seat', () => {
    const min = gridMinColumn(pageCss())
    expect(min, 'the card grid must keep an explicit minmax() minimum').toBeTypeOf('number')
    expect(
      min as number,
      `grid column minimum ${String(min)}px exceeds the ${RECORDED_SEAT_PX}px seat, so the grid would overflow`,
    ).toBeLessThanOrEqual(RECORDED_SEAT_PX)
  })

  it('still matches the official shell geometry it was recorded from', () => {
    if (!existsSync(OFFICIAL)) {
      // The vendored base is a read-only reference and may be absent in a fresh
      // checkout (ADR-0008). The assertions above still hold against the
      // recorded number; only the drift check needs the file.
      expect(existsSync(OFFICIAL), 'vendored official stylesheet absent — drift check skipped').toBe(false)
      return
    }
    const official = readFileSync(OFFICIAL, 'utf8')
    const seat = px(officialDecl(official, '.panel', 'width'))
      - px(officialDecl(official, '.nav', 'width'))
      - 2 * px(officialDecl(official, '.options', 'padding').split(/\s+/).slice(1, 2).join(''))
    expect(
      seat,
      `the official settings seat is now ${seat}px, not the recorded ${RECORDED_SEAT_PX}px — `
      + 're-run the acceptance render (compose-panel.mjs) and update this constant',
    ).toBe(RECORDED_SEAT_PX)
  })
})
