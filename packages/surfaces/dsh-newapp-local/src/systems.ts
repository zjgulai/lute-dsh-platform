/**
 * The systems catalog, read by the host half and served as one joined payload.
 *
 * ## Why the catalog is bundled instead of read at runtime
 *
 * Measured, not assumed: the built host half of this package imports **only**
 * `node:fs` and `node:path` — every `@deepseek-ai/*` import it declares is
 * type-only and erased — and the installed package at the load point carries
 * `lib/`, `cordis.patch.yml`, `README.md` and nothing else (`files` in
 * package.json). A `readFileSync('../catalog/systems.json')` would therefore
 * resolve to a path that does not exist in the installed package, and the
 * failure would appear only after a profile sync, in a drawer that renders an
 * empty section. Importing the JSON makes the build inline it, so what the
 * source says and what the load point holds cannot drift.
 *
 * ## Three files, one join
 *
 * `systems.json` (machine-written identity), `role-map.json` (human judgement),
 * `reachability.json` (a dated measurement) are joined here, at read time, so
 * that none of them has to carry a copy of another's fields. If a slug is
 * missing from either companion file the entry is served with an honest empty
 * value rather than being dropped: a system with no role is still a system, and
 * the panel marks it as unclassified instead of losing it.
 *
 * @module dsh-newapp-local/systems
 */
import systemsDocument from './catalog/systems.json' with { type: 'json' }
import roleMapDocument from './catalog/role-map.json' with { type: 'json' }
import reachabilityDocument from './catalog/reachability.json' with { type: 'json' }

/** One icon primitive, in the closed vocabulary the catalog declares. */
export interface CatalogIconShape {
  tag: string
  attrs: Record<string, string>
}

/** One system as the route serves it. */
export interface CatalogSystem {
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
  icon: CatalogIconShape[]
  /** The role this system is grouped under; '' when `role-map.json` is silent. */
  primary: string
  also: string[]
  reachable: boolean
  loginRequired: boolean
}

/** The joined payload `GET /api/dsh-newapp/systems` answers with. */
export interface SystemsPayload {
  ok: true
  owns: string
  source: string
  probedOn: string
  systems: CatalogSystem[]
  coverage: { systems: number; rolesTouched: number; byKind: Record<string, number> }
}

/** One role assignment, as `role-map.json` writes it. */
interface RoleAssignment {
  primary: string
  also: string[]
  why: string
}

/**
 * The shape `systems.json` really holds.
 *
 * The import is typed from the JSON itself, which infers a *union* over the 81
 * icon shapes (the compiler sees that one entry has `stroke-linecap` and the
 * next does not, and models the difference as an optional `undefined`). Widening
 * through this interface is how the optionals become what they are at runtime:
 * attributes a shape does not carry, rather than attributes set to undefined.
 */
interface RawSystem {
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
  icon: Array<{ tag: string; attrs: Record<string, string | undefined> }>
}

const catalogSystems = systemsDocument.systems as unknown as RawSystem[]
const roleMap = roleMapDocument.roles as Record<string, RoleAssignment>
const reachability = reachabilityDocument.results as Record<
  string,
  { ok: boolean; loginRequired: boolean }
>

/**
 * Join the three files into the wire payload.
 *
 * Pure and synchronous: it reads module-level constants, so calling it twice
 * cannot produce two different answers. `coverage` is computed here rather than
 * in the browser because it is a fact about the catalog, and the panel's footer
 * states it as such.
 * @returns the payload the route writes.
 */
export function loadSystems(): SystemsPayload {
  const systems: CatalogSystem[] = catalogSystems.map((entry) => {
    const assignment = roleMap[entry.slug]
    const reading = reachability[entry.slug]
    return {
      slug: entry.slug,
      name: entry.name,
      nameEn: entry.nameEn,
      desc: entry.desc,
      descEn: entry.descEn,
      kind: entry.kind,
      tags: [...entry.tags],
      cta: entry.cta,
      href: entry.href,
      host: entry.host,
      sourceCategory: entry.sourceCategory,
      icon: entry.icon.map((shape) => ({
        tag: shape.tag,
        // Drop undefined-valued attributes rather than passing them on: React
        // renders `stroke-linecap={undefined}` as "not set", and a key that is
        // present-but-undefined is the kind of value that survives one hop and
        // breaks on the next.
        attrs: Object.fromEntries(
          Object.entries(shape.attrs).filter((pair): pair is [string, string] => pair[1] !== undefined),
        ),
      })),
      primary: assignment?.primary ?? '',
      also: assignment === undefined ? [] : [...assignment.also],
      reachable: reading?.ok === true,
      loginRequired: reading?.loginRequired === true,
    }
  })

  const roles = new Set<string>()
  for (const system of systems) {
    if (system.primary !== '') roles.add(system.primary)
    for (const role of system.also) roles.add(role)
  }
  const byKind: Record<string, number> = {}
  for (const system of systems) byKind[system.kind] = (byKind[system.kind] ?? 0) + 1

  return {
    ok: true,
    owns: 'src/catalog/{systems,role-map,reachability}.json — joined at read time, owned by the sync script and by hand',
    source: systemsDocument.source,
    probedOn: reachabilityDocument.probedOn,
    systems,
    coverage: { systems: systems.length, rolesTouched: roles.size, byKind },
  }
}

/**
 * Resolve one slug to the address the OS may be asked to open.
 *
 * **The client never sends an address.** It sends a slug, and the address comes
 * from here — the whole reason the open route can exist in a shell whose main
 * process deliberately refuses to let arbitrary links launch a browser
 * (P0-6v2). A caller that could pass a URL would be that same hole with extra
 * steps.
 * @param slug - the catalog key.
 * @returns the address, or undefined when the slug is not in the catalog.
 */
export function hrefForSlug(slug: string): string | undefined {
  const entry = catalogSystems.find((one) => one.slug === slug)
  return entry?.href
}

/** Every slug the catalog knows — the open route's entire input vocabulary. */
export function knownSlugs(): string[] {
  return catalogSystems.map((one) => one.slug)
}
