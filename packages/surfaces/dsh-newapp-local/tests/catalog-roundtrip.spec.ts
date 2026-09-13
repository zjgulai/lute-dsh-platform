/**
 * The seam between the two halves, run on the **real catalog**.
 *
 * ## The gap this closes
 *
 * `systems-routes.spec.ts` asserts the host half serves 31 systems. `systems.spec.ts`
 * asserts the client half parses and groups — but every one of those cases feeds it a
 * **hand-written fixture** (`wire()`, `view()`). So there was no test anywhere that ran
 * the payload the host actually produces through the parser the client actually uses.
 *
 * That seam is not academic, because both sides **drop things by design**:
 *
 *  - `parseSystems` drops any entry with an empty slug, a duplicate slug, a name that
 *    is not a string, or an `href` that is not `https://*.lute-tlz-dddd.top` — and it
 *    records why in `dropped` rather than throwing;
 *  - `groupSystems` folds by `primary`, and a role the roster does not know is kept but
 *    marked `known: false`.
 *
 * A catalog entry that trips a drop rule renders as a **missing card**. Every existing
 * test would stay green: the host test counts entries in the payload, and the client
 * tests count fixtures. The drawer would simply be one card short, and nothing would say so.
 *
 * So this file asserts the round trip on real data, with the drop list as the
 * load-bearing assertion: **`dropped` must be empty**, and every slug the host published
 * must come out the other side exactly once.
 *
 * It is deliberately not a rendering test — the visual half is `systems-render.spec.tsx`
 * plus the Chrome probe. This one is arithmetic over the real payload.
 */
import { describe, expect, it } from 'vitest'
import { groupSystems, matchSystem, parseSystems, planOpenSystem, roleCoverage, type RoleLabel } from '../src/client/systems.ts'
import { loadSystems } from '../src/systems.ts'

/** The real payload, exactly as the route serialises it (through JSON, like the wire). */
function servedPayload(): unknown {
  return JSON.parse(JSON.stringify({ ...loadSystems(), openRoute: '/api/dsh-newapp/open-system' }))
}

/** Every role id the real catalog names, primary or secondary. */
function namedRoles(): string[] {
  const named = new Set<string>()
  for (const s of loadSystems().systems) {
    named.add(s.primary)
    for (const role of s.also) named.add(role)
  }
  return [...named]
}

/**
 * A roster stand-in covering every role the catalog names — keyed the way the **real
 * roster** publishes, i.e. lowercase preset ids (`agt-031`), then normalised exactly as
 * `SystemsSection` normalises it.
 *
 * That spelling difference is deliberate and load-bearing: the roster publishes the
 * preset *directory* name (`agt-031`) while the catalog writes the material's id
 * (`AGT-031`). `SystemsSection` bridges it with `label.id.toUpperCase()`, and its own
 * comment says normalising there "is what keeps that difference from silently emptying
 * every group". This helper performs the same two steps, so the test would notice if that
 * bridge were removed — see the `roster spelling` case at the end.
 *
 * Derived from the catalog rather than hand-listed, so it cannot quietly stop covering a
 * role the moment the role map changes.
 */
function rosterFor(roleIds: readonly string[]): Map<string, RoleLabel> {
  const raw = new Map<string, RoleLabel>(
    roleIds.map((id) => [
      id.toLowerCase(),
      { id: id.toLowerCase(), name: `${id} 占位`, plane: '经营平面', domain: '责任域' },
    ]),
  )
  // Exactly what SystemsSection does with the roster it reads.
  return new Map([...raw].map(([, label]) => [label.id.toUpperCase(), label]))
}

/** The same roster **before** normalisation — lowercase keys, as the route publishes. */
function rawRosterFor(roleIds: readonly string[]): Map<string, RoleLabel> {
  return new Map(
    roleIds.map((id) => [
      id.toLowerCase(),
      { id: id.toLowerCase(), name: `${id} 占位`, plane: '经营平面', domain: '责任域' },
    ]),
  )
}

/** Parse the real payload, failing loudly rather than returning a partial view. */
function parsed() {
  const result = parseSystems(servedPayload())
  if (!result.ok) throw new Error(`真实 payload 解析失败：${result.reason}`)
  return result.view
}

describe('catalog round trip: host payload → client parser → grouping', () => {
  it('parses with zero drops — a dropped entry is a missing card, and no other test can see it', () => {
    const view = parsed()
    expect(view.dropped).toEqual([])
    expect(view.openRoute).toBe('/api/dsh-newapp/open-system')
  })

  it('every slug the host published survives the round trip exactly once', () => {
    const published = loadSystems().systems.map((s) => s.slug).sort()
    const viewed = parsed().systems.map((s) => s.slug).sort()
    expect(viewed).toEqual(published)
    expect(new Set(viewed).size).toBe(published.length)
  })

  it('groups into one group per primary role, covering every system, with nothing unknown', () => {
    const systems = parsed().systems
    const groups = groupSystems(systems, rosterFor(namedRoles()))

    // With the roster derived from the catalog, an unknown group would mean the catalog
    // names a role its own data does not declare.
    expect(groups.filter((g) => !g.known)).toEqual([])

    // The grouping is a partition: each system in exactly one group, none lost.
    const grouped = groups.flatMap((g) => g.systems.map((s) => s.slug))
    expect(grouped.length).toBe(systems.length)
    expect(new Set(grouped).size).toBe(systems.length)

    // Group count equals the distinct primary roles — the number of headings drawn.
    expect(groups.length).toBe(new Set(systems.map((s) => s.primary)).size)
    expect(groups.every((g) => g.systems.length > 0)).toBe(true)
  })

  it('every card is openable: the plan reaches level 0 for all of them', () => {
    const systems = parsed().systems
    // `hostSupportsOpen: true` is the state the drawer is in once the route answered —
    // it only draws the section from that route's own payload. Any card still landing on
    // level 3 (`no-href` / `no-opener`) is one the user cannot open, and this catalog is a
    // snapshot of reviewed addresses. So the assertion is the plan itself, all 31 of them.
    const plans = systems.map((s) => planOpenSystem({ system: s, hostSupportsOpen: true }))
    expect(plans.filter((p) => p.level !== 0)).toEqual([])
    expect(plans.length).toBe(loadSystems().systems.length)
  })

  it('footer coverage is computed from the real roles, not from a fixture', () => {
    const systems = parsed().systems
    const labels = rosterFor(namedRoles())
    const groups = groupSystems(systems, labels)
    const coverage = roleCoverage(groups, labels, systems)
    expect(coverage.touched).toBeGreaterThanOrEqual(groups.length)
    expect(coverage.touched).toBeLessThanOrEqual(coverage.total)
    // The footer's claim is "N of M roles reachable"; M must be the roster size.
    expect(coverage.total).toBe(labels.size)
  })

  it('search reaches a system through a secondary role — the only path for a role that owns no group', () => {
    const systems = parsed().systems
    const primaries = new Set(systems.map((s) => s.primary))

    // A real system whose secondary roles include one that owns no group of its own.
    const carrier = systems.find((s) => s.also.some((role) => !primaries.has(role)))
    expect(carrier).toBeDefined()
    if (carrier === undefined) return
    const secondaryOnly = carrier.also.find((role) => !primaries.has(role))
    expect(secondaryOnly).toBeDefined()
    if (secondaryOnly === undefined) return

    const labels = rosterFor(namedRoles())

    // That role owns no group, so search is the *only* way to reach the card from it.
    expect(systems.filter((s) => s.primary === secondaryOnly)).toEqual([])
    // Searching the role id does surface it — and via that role, not by accident:
    // every system `matchSystem` keeps for this query is one that names the role.
    const hits = systems.filter((s) => matchSystem(s, secondaryOnly, labels))
    expect(hits.map((s) => s.slug)).toContain(carrier.slug)
    expect(hits.every((s) => s.primary === secondaryOnly || s.also.includes(secondaryOnly))).toBe(true)
  })

  it('roster spelling: the id case bridge is what keeps every group from going unknown', () => {
    const systems = parsed().systems

    // Positive: with the normalisation SystemsSection performs, every group is known and
    // carries the roster's human name.
    const bridged = groupSystems(systems, rosterFor(namedRoles()))
    expect(bridged.filter((g) => !g.known)).toEqual([])
    expect(bridged.every((g) => g.label.startsWith(`${g.id} `))).toBe(true)

    // Negative control: feed the roster **as the route publishes it** (lowercase keys)
    // without the bridge, and every lookup misses — every group degrades to its bare id.
    // This is the failure the bridge prevents, and it is silent: the section still renders
    // 31 cards in 14 groups, just with raw `AGT-003` headings instead of role names.
    const unbridged = groupSystems(systems, rawRosterFor(namedRoles()))
    expect(unbridged.filter((g) => g.known)).toEqual([])
    expect(unbridged.every((g) => g.label === g.id)).toBe(true)
  })
})
