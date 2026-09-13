/**
 * The systems section's pure core — grouping, search, and the open decision.
 *
 * Everything here is arithmetic over values, so it is testable without a DOM, a
 * browser, or a running app. That matters for the same reason it does in
 * `product-cards.spec.ts`: the interesting cases are the degradations (a role
 * the roster does not know, a card whose address is missing, a host half that is
 * not loaded), and those are exactly the ones a live app never shows you.
 *
 * Three behaviours are asserted rather than left to review:
 *
 *  1. **A system appears exactly once.** The primary role decides the group; the
 *     secondary roles are chips and a search target. Duplicating a card into
 *     every group it touches would turn 31 systems into an apparent 45 and make
 *     the count meaningless.
 *  2. **An unknown role still renders.** If the roster is missing a preset the
 *     role map names, the card is grouped under its raw id and marked — the
 *     `role-matrix` degrade rule, applied here: a card that exists and cannot be
 *     classified must not look like a card that does not exist.
 *  3. **The open plan has a level for "the host cannot open anything".** A card
 *     whose button looks live and does nothing is the failure this surface is
 *     built to avoid, so the plan refuses *before* the click.
 */
import { describe, expect, it } from 'vitest'
import {
  groupSystems,
  matchSystem,
  parseSystems,
  planOpenSystem,
  type RoleLabel,
  type SystemView,
} from '../src/client/systems.ts'

/** A well-formed wire entry, so each test can vary exactly one field. */
function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'video',
    name: 'AI 原生视频系统',
    nameEn: 'AI Native Video',
    desc: 'AI 视频生成 · 资产管理',
    descEn: 'Native AI video creation platform',
    kind: 'Docker 应用',
    tags: ['AI Video', 'Next.js'],
    cta: '打开视频系统',
    href: 'https://video.lute-tlz-dddd.top',
    host: 'video.lute-tlz-dddd.top',
    icon: [{ tag: 'path', attrs: { d: 'M4 4h16', stroke: 'currentColor' } }],
    primary: 'AGT-031',
    also: ['AGT-030'],
    reachable: true,
    loginRequired: false,
    ...overrides,
  }
}

/** A minimal view entry, for the pure functions that take parsed values. */
function view(overrides: Partial<SystemView> = {}): SystemView {
  return {
    slug: 'video',
    name: 'AI 原生视频系统',
    nameEn: 'AI Native Video',
    desc: 'AI 视频生成 · 资产管理',
    descEn: 'Native AI video creation platform',
    kind: 'Docker 应用',
    tags: ['AI Video'],
    cta: '打开视频系统',
    href: 'https://video.lute-tlz-dddd.top',
    host: 'video.lute-tlz-dddd.top',
    icon: [{ tag: 'path', attrs: { d: 'M4 4h16' } }],
    primary: 'AGT-031',
    also: ['AGT-030'],
    reachable: true,
    loginRequired: false,
    ...overrides,
  }
}

/** Roster labels, as the role-matrix route would supply them. */
function labels(entries: Array<[string, string, string, string]>): Map<string, RoleLabel> {
  return new Map(
    entries.map(([id, name, plane, domain]) => [id, { id, name, plane, domain }]),
  )
}

describe('parseSystems', () => {
  it('accepts a well-formed payload', () => {
    const result = parseSystems({ ok: true, probedOn: '2026-09-13', systems: [wire()] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.view.systems).toHaveLength(1)
    expect(result.view.systems[0]?.slug).toBe('video')
    expect(result.view.probedOn).toBe('2026-09-13')
  })

  it('carries the open route the host published, so the section need not guess', () => {
    const withRoute = parseSystems({
      ok: true,
      probedOn: '2026-09-13',
      openRoute: '/api/dsh-newapp/open-system',
      systems: [wire()],
    })
    expect(withRoute.ok).toBe(true)
    if (!withRoute.ok) return
    expect(withRoute.view.openRoute).toBe('/api/dsh-newapp/open-system')
    // An older host half answers with the catalog and no route: the section must
    // read that as "no opener", not as "the route is called nothing".
    const withoutRoute = parseSystems({ ok: true, probedOn: '2026-09-13', systems: [wire()] })
    expect(withoutRoute.ok).toBe(true)
    if (!withoutRoute.ok) return
    expect(withoutRoute.view.openRoute).toBe('')
  })

  it('refuses a payload that is not the shape it claims', () => {
    expect(parseSystems(null).ok).toBe(false)
    expect(parseSystems({ ok: false, error: 'boom' }).ok).toBe(false)
    expect(parseSystems({ ok: true, systems: 'nope' }).ok).toBe(false)
  })

  it('keeps the good entries and names the bad ones instead of blanking the section', () => {
    // A catalog is machine-written and can drift a version behind the client.
    // Dropping one malformed entry and saying which is a usable answer; an empty
    // section is not, because it looks identical to "there are no systems".
    const result = parseSystems({
      ok: true,
      probedOn: '2026-09-13',
      systems: [wire(), wire({ slug: '', name: 'no slug' }), wire({ slug: 'noscheme', href: 'ftp://x' })],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.view.systems.map((one) => one.slug)).toEqual(['video'])
    expect(result.view.dropped).toHaveLength(2)
    for (const reason of result.view.dropped) expect(reason.length).toBeGreaterThan(0)
  })

  it('normalises a missing role or tag list rather than inventing one', () => {
    const result = parseSystems({
      ok: true,
      probedOn: '2026-09-13',
      systems: [wire({ primary: undefined, also: undefined, tags: undefined, icon: undefined })],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const system = result.view.systems[0]!
    expect(system.primary).toBe('')
    expect(system.also).toEqual([])
    expect(system.tags).toEqual([])
    expect(system.icon).toEqual([])
  })
})

describe('groupSystems', () => {
  const roster = labels([
    ['AGT-029', '立言 · 品牌战略与传播', '业务运营', '品牌与增长'],
    ['AGT-030', '叙事 · 内容与创意策划', '业务运营', '品牌与增长'],
    ['AGT-031', '绘影 · 视觉视频与素材生产', '业务运营', '品牌与增长'],
  ])

  it('puts each system in exactly one group, keyed by its primary role', () => {
    const groups = groupSystems(
      [
        view({ slug: 'video', primary: 'AGT-031' }),
        view({ slug: 'redbook', primary: 'AGT-030', also: [] }),
      ],
      roster,
    )
    const total = groups.reduce((sum, group) => sum + group.systems.length, 0)
    expect(total).toBe(2)
    expect(groups.map((group) => group.id)).toEqual(['AGT-030', 'AGT-031'])
  })

  it('orders groups by plane, then domain, then role id — not by insertion', () => {
    const groups = groupSystems(
      [
        view({ slug: 'a', primary: 'AGT-031' }),
        view({ slug: 'b', primary: 'AGT-029' }),
        view({ slug: 'c', primary: 'AGT-030' }),
      ],
      roster,
    )
    // Same plane and domain here, so the role id decides.
    expect(groups.map((group) => group.id)).toEqual(['AGT-029', 'AGT-030', 'AGT-031'])
  })

  it('omits roles that own nothing, instead of printing empty groups', () => {
    const groups = groupSystems([view({ primary: 'AGT-031' })], roster)
    expect(groups.map((group) => group.id)).toEqual(['AGT-031'])
  })

  it('keeps a system whose role the roster does not know, and marks it', () => {
    // The failure this prevents: a preset gets renamed or removed and 5 systems
    // silently disappear from a page that looks complete.
    const groups = groupSystems([view({ slug: 'ghost', primary: 'AGT-099' })], roster)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.known).toBe(false)
    expect(groups[0]?.systems.map((one) => one.slug)).toEqual(['ghost'])
    // The label falls back to the id: an unknown role must still be readable.
    expect(groups[0]?.label).toContain('AGT-099')
  })

  it('sorts systems inside a group by name, so the order is not the catalog order', () => {
    const groups = groupSystems(
      [
        view({ slug: 'z', name: 'Z 系统', primary: 'AGT-031' }),
        view({ slug: 'a', name: 'A 系统', primary: 'AGT-031' }),
      ],
      roster,
    )
    expect(groups[0]?.systems.map((one) => one.name)).toEqual(['A 系统', 'Z 系统'])
  })
})

describe('matchSystem', () => {
  const roster = labels([
    ['AGT-030', '叙事 · 内容与创意策划', '业务运营', '品牌与增长'],
    ['AGT-031', '绘影 · 视觉视频与素材生产', '业务运营', '品牌与增长'],
  ])
  const system = view()

  it('matches the empty query, so an empty search shows everything', () => {
    expect(matchSystem(system, '', roster)).toBe(true)
    expect(matchSystem(system, '   ', roster)).toBe(true)
  })

  it('matches the facts a person would search by', () => {
    for (const query of ['原生视频', 'native video', 'AI Video', 'video.lute', 'video']) {
      expect(matchSystem(system, query, roster), query).toBe(true)
    }
  })

  it('matches the primary role, and the secondary roles as well', () => {
    // The secondary half is the point: those roles have no group of their own
    // for this system, so search is the only way to reach it from them.
    expect(matchSystem(system, '绘影', roster)).toBe(true)
    expect(matchSystem(system, '叙事', roster)).toBe(true)
    expect(matchSystem(system, 'AGT-030', roster)).toBe(true)
  })

  it('does not match a system that has nothing to do with the query', () => {
    expect(matchSystem(system, '供应链', roster)).toBe(false)
  })
})

describe('planOpenSystem', () => {
  it('opens at level 0 when the host can hand the address to the OS', () => {
    const plan = planOpenSystem({ system: view(), hostSupportsOpen: true })
    expect(plan).toEqual({ level: 0, kind: 'url', href: 'https://video.lute-tlz-dddd.top' })
  })

  it('refuses with a stated reason when the host half is not loaded', () => {
    // Measured behaviour of this shell: `target="_blank"` on an http(s) link is
    // denied by the main process, so there is no browser-side fallback to lean
    // on. Without the host's opener the click would do nothing at all.
    const plan = planOpenSystem({ system: view(), hostSupportsOpen: false })
    expect(plan).toEqual({ level: 3, kind: 'disabled', reason: 'no-opener' })
  })

  it('refuses a system that carries no address', () => {
    const plan = planOpenSystem({ system: view({ href: '' }), hostSupportsOpen: true })
    expect(plan).toEqual({ level: 3, kind: 'disabled', reason: 'no-href' })
  })

  it('never plans an address outside https on the portal domain', () => {
    // Defence in depth: the catalog is asserted to hold only portal addresses,
    // and the plan refuses anything else even if it somehow got in.
    for (const href of ['http://video.lute-tlz-dddd.top', 'https://evil.example.com', 'javascript:alert(1)']) {
      const plan = planOpenSystem({ system: view({ href }), hostSupportsOpen: true })
      expect(plan.kind, href).toBe('disabled')
    }
  })
})
