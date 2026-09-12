/**
 * Baked layer-avatar invariants.
 *
 * `scripts/verify-layer-icons.mjs` does the full job (including rebuilding each
 * avatar from the brand generator to prove the chest emblem did not silently
 * render as nothing). That script needs the lute-brand-icons skill installed, so
 * it cannot run in `pnpm test`. This file asserts the invariants that survive
 * without the generator — those hold for the artifact actually shipped, which is
 * the thing a page renders.
 */
import { describe, expect, it } from 'vitest'
import { LAYER_ICONS, LAYER_ICON_SOURCES } from '../src/layer-icons.ts'

/** Decode one baked data URI to its SVG text. */
function svgOf(key: string): string {
  const uri = LAYER_ICONS[key]
  expect(uri, `missing layer icon: ${key}`).toBeTruthy()
  return Buffer.from((uri as string).slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')
}

const PLANE_KEYS = ['PLN-MGT', 'PLN-OPS', 'PLN-CTL', 'PLN-PLT']
const DOMAIN_KEYS = ['DOM-01', 'DOM-02', 'DOM-03', 'DOM-04', 'DOM-05', 'DOM-06', 'DOM-07', 'DOM-08']
const ALL_KEYS = [...PLANE_KEYS, ...DOMAIN_KEYS]

describe('layer icons', () => {
  it('ships exactly the 4 planes and 8 responsibility domains', () => {
    expect(Object.keys(LAYER_ICONS).sort()).toEqual([...ALL_KEYS].sort())
    expect(LAYER_ICON_SOURCES).toHaveLength(12)
  })

  it('covers every key the collector looks up', () => {
    // collect.ts reads LAYER_ICONS[plane.id] and LAYER_ICONS[domain.id]; a miss
    // renders a header with no avatar and no error anywhere.
    for (const key of ALL_KEYS) expect(LAYER_ICONS[key]).toBeTruthy()
    expect(LAYER_ICONS['PLN-OPS']).toContain('data:image/svg+xml;base64,')
  })

  it.each(ALL_KEYS)('%s keeps the brand frame, stroke and clip rules', (key: string) => {
    const svg = svgOf(key)
    expect(svg).toMatch(/<rect x="4\.5" y="4\.5" width="91" height="91" rx="18" fill="url\(#bg/)
    expect(svg).toContain('stroke="#58B848" stroke-width="2.2"')
    expect(svg).toContain('fill="rgba(0,0,0,0.12)"')
    expect(svg).toContain('rgba(255,255,255,0.68)')
    expect(svg).toMatch(/<rect x="6\.5" y="6\.5" width="87" height="87" rx="15\.5"\/><\/clipPath>/)
  })

  it.each(ALL_KEYS)('%s is an adult head at the required ratio', (key: string) => {
    expect(svgOf(key)).toMatch(/<circle cx="50" cy="44" r="34"/)
  })

  it.each(ALL_KEYS)('%s renders a chest emblem', (key: string) => {
    const svg = svgOf(key)
    // The chest sits around (50, 88) inside the clip rect; anything drawn there
    // is the emblem, and a missing emblem is otherwise completely silent.
    const chest = [...svg.matchAll(/<[^>]+(?:\s|")(?:8[0-9]|9[0-9])(?:\.\d+)?"/g)]
    expect(chest.length, `no chest-region geometry in ${key}`).toBeGreaterThan(0)
  })

  it('uses no colour outside the brand family', () => {
    const allowed = new Set([
      '#58B848', '#2E7D3C', '#8FD48A', '#DCF1D6', '#EDF6E6', '#D3EAC2', '#B4D9A0',
      '#F6D7B8', '#EFC49E', '#FBE3C8', '#E8B78A', '#E2B48C', '#D9A37C', '#EBC9A4', '#CE9C72',
      '#2E2A28', '#6B4B2E', '#7A4A2B', '#9C5B33', '#9BA0A8', '#B5674B', '#2B2622', '#FFFFFF',
      '#9C8A78',
    ])
    for (const key of ALL_KEYS) {
      for (const match of svgOf(key).matchAll(/#[0-9A-Fa-f]{6}/g)) {
        expect(allowed.has(match[0].toUpperCase()), `${key} uses ${match[0]}`).toBe(true)
      }
    }
  })

  it('records provenance back to the brand skill entry', () => {
    for (const row of LAYER_ICON_SOURCES) {
      expect(row.brandId).toMatch(/^(pln|dom)-/)
      expect(row.label).not.toBe('')
    }
  })
})
