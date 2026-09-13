/**
 * Catalog discipline — the three data files, asserted rather than trusted.
 *
 * Three files, three owners, and each one is silent when it goes wrong:
 *
 *  - `systems.json` is machine-written. A portal restyle can quietly drop a card
 *    from the parse, and the drawer would simply show 30 systems instead of 31 —
 *    no error, no warning, and the missing one is exactly the kind of thing
 *    nobody notices until they need it.
 *  - `role-map.json` is **human**-written, which is the failure surface that
 *    matters most: a role id that was renamed upstream, a slug that was
 *    respelled by a portal change, an `also` entry that repeats `primary`. Each
 *    renders as a card in the wrong group or a chip that leads nowhere.
 *  - `reachability.json` is a dated measurement. A file that stops covering the
 *    catalog is worse than no file, because the card would claim a status for a
 *    system nobody measured.
 *
 * The assertions below are deliberately about **coverage and vocabulary**, not
 * about specific values: pinning today's 31 titles here would turn every portal
 * copy edit into a red test, and a test that cries wolf gets updated without
 * being read.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const catalogDir = join(process.cwd(), 'src', 'catalog')

interface IconShape {
  tag: string
  attrs: Record<string, string>
}
interface SystemEntry {
  slug: string
  name: string
  nameEn: string
  desc: string
  descEn: string
  kind: string
  tags: string[]
  cta: string
  href: string
  host: string
  sourceCategory: string
  icon: IconShape[]
}
interface SystemsDocument {
  source: string
  iconVocabulary: { elements: string[]; attributes: string[] }
  systems: SystemEntry[]
}
interface RoleMapDocument {
  note: string
  roles: Record<string, { primary: string; also: string[]; why: string }>
}
interface ReachabilityDocument {
  source: string
  probedOn: string
  summary: { total: number; reachable: number; loginRequired: number }
  results: Record<string, { status: number; ok: boolean; loginRequired: boolean; title: string; error: string }>
}

const systemsDoc: SystemsDocument = JSON.parse(readFileSync(join(catalogDir, 'systems.json'), 'utf8'))
const roleMapDoc: RoleMapDocument = JSON.parse(readFileSync(join(catalogDir, 'role-map.json'), 'utf8'))
const reachabilityDoc: ReachabilityDocument = JSON.parse(
  readFileSync(join(catalogDir, 'reachability.json'), 'utf8'),
)

const slugs = systemsDoc.systems.map((system) => system.slug)

/** `AGT-001` … `AGT-050` — the roster this machine publishes. */
const ROLE_ID = /^AGT-(0[0-9]{2}|050)$/

describe('systems.json — identity, machine-written', () => {
  it('covers every card the portal publishes', () => {
    // 31 on 2026-09-13. Stated as a floor rather than an equality: the portal
    // adding a system must not turn this red, but losing one must.
    expect(systemsDoc.systems.length).toBeGreaterThanOrEqual(31)
  })

  it('keys each system exactly once', () => {
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(systemsDoc.systems.map((system) => system.host)).size).toBe(slugs.length)
  })

  it('points only at https addresses under the one portal domain', () => {
    // This is the security property the host's open route leans on: nothing in
    // the catalog can name an address outside the LUTE domain.
    for (const system of systemsDoc.systems) {
      expect(system.href, system.slug).toMatch(/^https:\/\/[a-z0-9.-]+\.lute-tlz-dddd\.top$/)
      expect(system.host.endsWith('.lute-tlz-dddd.top'), system.slug).toBe(true)
    }
  })

  it('carries the six display facts with nothing empty', () => {
    for (const system of systemsDoc.systems) {
      for (const key of ['name', 'nameEn', 'desc', 'descEn', 'kind', 'cta'] as const) {
        expect(system[key].length, `${system.slug}.${key}`).toBeGreaterThan(0)
      }
      expect(['Docker 应用', '静态站点', '静态报告'], system.slug).toContain(system.kind)
      expect(['creation', 'insight', 'growth', 'ai', 'operations'], system.slug).toContain(
        system.sourceCategory,
      )
    }
  })

  it('keeps every icon inside the closed vocabulary the catalog declares', () => {
    // The browser half renders these as React elements. An unknown tag or
    // attribute would render as nothing (or, worse, as something the parser did
    // not vet), so the vocabulary is asserted on both sides.
    const elements = new Set(systemsDoc.iconVocabulary.elements)
    const attributes = new Set(systemsDoc.iconVocabulary.attributes)
    for (const system of systemsDoc.systems) {
      expect(system.icon.length, `${system.slug} has no icon`).toBeGreaterThan(0)
      for (const shape of system.icon) {
        expect(elements, `${system.slug}: <${shape.tag}>`).toContain(shape.tag)
        for (const attr of Object.keys(shape.attrs)) {
          expect(attributes, `${system.slug}: ${shape.tag}[${attr}]`).toContain(attr)
        }
      }
    }
  })
})

describe('role-map.json — the human judgement', () => {
  it('maps every system and nothing else', () => {
    // Both directions matter. A missing entry is a system that vanishes from the
    // drawer's grouped view; an extra entry is a typo that silently attaches a
    // role to nothing.
    const mapped = Object.keys(roleMapDoc.roles).sort()
    expect(mapped).toEqual([...slugs].sort())
  })

  it('names only roles this machine actually has', () => {
    for (const [slug, entry] of Object.entries(roleMapDoc.roles)) {
      expect(entry.primary, slug).toMatch(ROLE_ID)
      for (const role of entry.also) expect(role, slug).toMatch(ROLE_ID)
      expect(entry.also, `${slug}: primary repeated in also`).not.toContain(entry.primary)
      expect(new Set(entry.also).size, `${slug}: duplicate also entry`).toBe(entry.also.length)
    }
  })

  it('gives every assignment a reason', () => {
    // An assignment without a reason cannot be re-judged later; it can only be
    // trusted or deleted. The reason is what makes this file reviewable.
    for (const [slug, entry] of Object.entries(roleMapDoc.roles)) {
      expect(entry.why.trim().length, slug).toBeGreaterThan(10)
    }
  })

  it('groups into a matrix, not a list — and reports its own coverage', () => {
    const primaries = new Set(Object.values(roleMapDoc.roles).map((entry) => entry.primary))
    const touched = new Set<string>()
    for (const entry of Object.values(roleMapDoc.roles)) {
      touched.add(entry.primary)
      for (const role of entry.also) touched.add(role)
    }
    // A single group would mean the mapping collapsed to "everything belongs to
    // one role", which is the shape of a mapping nobody made a decision in.
    expect(primaries.size).toBeGreaterThanOrEqual(8)
    // Coverage is a published number (the panel footer states it), so it is
    // asserted here rather than discovered in the UI. 50 roles exist; these 31
    // systems reach a minority of them, and saying so is the honest report.
    expect(touched.size).toBeLessThanOrEqual(50)
    expect(touched.size).toBeGreaterThanOrEqual(15)
  })
})

describe('reachability.json — the dated measurement', () => {
  it('measures every system in the catalog', () => {
    expect(Object.keys(reachabilityDoc.results).sort()).toEqual([...slugs].sort())
  })

  it('is dated, not timestamped', () => {
    // A date keeps two runs in one day byte-identical, so `git diff` reports
    // availability changes rather than the probe having run again.
    expect(reachabilityDoc.probedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('agrees with its own summary', () => {
    const values = Object.values(reachabilityDoc.results)
    expect(reachabilityDoc.summary.total).toBe(values.length)
    expect(reachabilityDoc.summary.reachable).toBe(values.filter((one) => one.ok).length)
    expect(reachabilityDoc.summary.loginRequired).toBe(
      values.filter((one) => one.loginRequired).length,
    )
  })

  it('gives a failed probe a reason, so a red card is actionable', () => {
    for (const [slug, reading] of Object.entries(reachabilityDoc.results)) {
      if (reading.ok) continue
      expect(reading.error.length, `${slug} failed with no reason`).toBeGreaterThan(0)
    }
  })
})
