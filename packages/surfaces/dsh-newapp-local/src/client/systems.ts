/**
 * The systems section: parse, group, search, and decide what a click does.
 *
 * ## What lives here, and what deliberately does not
 *
 * This module is the **external systems** half of the drawer — the 31 addresses
 * the LUTE portal publishes. It shares no code path with `product-cards.ts` and
 * that separation is the design, not an accident:
 *
 *  - A product's open decision is a three-level fallback that can end in a
 *    **disabled** card, because a product needs a local declaration, a preset,
 *    or a registered panel before anything can happen (ADR-0045 / ADR-0033).
 *  - A system's open decision is a single fact: hand the address to the OS. It
 *    cannot be "not installed here", and it has no session to fall back to.
 *
 * Folding them into one union would invite exactly the wrong reuse — a
 * `planOpen` branch that returns `session` for something with no working
 * directory, or an `external` level offered for a product that has no address.
 * Two surfaces, two contracts, one drawer.
 *
 * ## Why the open decision refuses things the catalog already excludes
 *
 * `planOpenSystem` re-checks the scheme and the domain even though
 * `tests/catalog.spec.ts` asserts both. The address is not decoration: it is
 * handed to the operating system, which will launch whatever it names. A second
 * gate that costs one string comparison is cheaper than trusting that every
 * future path into this value ran through the sync script.
 *
 * @module dsh-newapp-local/client/systems
 */

/** One icon primitive, exactly as `catalog/systems.json` stored it. */
export interface IconShape {
  tag: string
  attrs: Record<string, string>
}

/** One external system, normalised for display. */
export interface SystemView {
  slug: string
  name: string
  nameEn: string
  desc: string
  descEn: string
  /** The portal's own type label: 「Docker 应用」/「静态站点」/「静态报告」. */
  kind: string
  tags: string[]
  /** The portal's call-to-action copy, used verbatim on the card's button. */
  cta: string
  href: string
  host: string
  icon: IconShape[]
  /** The role this system is grouped under ('' when the map did not name one). */
  primary: string
  /** Secondary roles — chips, and search targets. */
  also: string[]
  /** Whether the last probe reached it. */
  reachable: boolean
  /** Whether the entry itself is the portal login page. */
  loginRequired: boolean
}

/** The parsed section. */
export interface SystemsView {
  systems: SystemView[]
  /** Date of the reachability reading, `YYYY-MM-DD`. */
  probedOn: string
  /**
   * The open route the host published, verbatim ('' when the payload did not
   * carry one).
   *
   * This is how the section learns whether an opener exists **without guessing
   * from a version number**: an older host half answers with the catalog but no
   * route, and a card whose button would then do nothing is refused up front
   * instead.
   */
  openRoute: string
  /**
   * Entries the parser refused, one reason each.
   *
   * Kept rather than logged: a section that silently renders 29 of 31 systems
   * looks exactly like a portal that publishes 29, and the difference is the
   * whole of what a reader needs to know.
   */
  dropped: string[]
}

/** Result of parsing the route payload. */
export type SystemsResult = { ok: true; view: SystemsView } | { ok: false; reason: string }

/**
 * One role, as the roster describes it.
 *
 * Defined by the roster's own reader (`./launcher.ts`) and re-exported here:
 * this module's grouping functions are typed in terms of it, and both halves
 * must mean the same thing by "a role".
 */
import type { RoleLabel } from './launcher.ts'

export type { RoleLabel }

/** One group in the role matrix: the primary role and everything under it. */
export interface RoleGroup {
  id: string
  /** `AGT-031 绘影 · 视觉视频与素材生产`, or the bare id when the roster is silent. */
  label: string
  plane: string
  domain: string
  /** Whether the roster knows this role. `false` still renders — marked, not hidden. */
  known: boolean
  systems: SystemView[]
}

/** Why a system card cannot act. Closed set — each has copy in locales.ts. */
export type SystemBlockReason = 'no-href' | 'no-opener'

/** What pressing a system card will do. */
export type SystemOpenPlan =
  | { level: 0; kind: 'url'; href: string }
  | { level: 3; kind: 'disabled'; reason: SystemBlockReason }

/** The only domain this section may hand to the operating system. */
const PORTAL_SUFFIX = '.lute-tlz-dddd.top'

/** Read a string-valued property without trusting the payload's shape. */
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Read a string list, dropping non-strings instead of coercing them. */
function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
}

/** Read the icon primitives, keeping only shapes the renderer understands. */
function iconShapes(value: unknown): IconShape[] {
  if (!Array.isArray(value)) return []
  const shapes: IconShape[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const tag = str(record['tag'])
    const rawAttrs = record['attrs']
    if (tag === '' || typeof rawAttrs !== 'object' || rawAttrs === null) continue
    const attrs: Record<string, string> = {}
    for (const [key, one] of Object.entries(rawAttrs as Record<string, unknown>)) {
      if (typeof one === 'string') attrs[key] = one
    }
    shapes.push({ tag, attrs })
  }
  return shapes
}

/**
 * Whether an address is one this section is allowed to hand to the OS.
 * @param href - the candidate address.
 * @returns true when it is https on a portal subdomain.
 */
export function isPortalHref(href: string): boolean {
  if (!href.startsWith('https://')) return false
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return false
  }
  return url.protocol === 'https:' && url.hostname.endsWith(PORTAL_SUFFIX)
}

/**
 * Parse the systems route payload into a view the panel can render.
 *
 * Total by construction: a malformed entry is dropped **with its reason**, and
 * only a payload that is not a systems document at all is refused wholesale.
 * @param payload - the decoded JSON body.
 * @returns the view, or why the payload was not one.
 */
export function parseSystems(payload: unknown): SystemsResult {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, reason: '响应不是对象' }
  }
  const record = payload as Record<string, unknown>
  if (record['ok'] !== true) {
    return { ok: false, reason: str(record['error']) || '宿主回答 ok:false' }
  }
  const raw = record['systems']
  if (!Array.isArray(raw)) return { ok: false, reason: '响应缺少 systems 数组' }

  const systems: SystemView[] = []
  const dropped: string[] = []
  const seen = new Set<string>()

  raw.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      dropped.push(`#${String(index)}：不是对象`)
      return
    }
    const one = entry as Record<string, unknown>
    const slug = str(one['slug'])
    const href = str(one['href'])
    if (slug === '') {
      dropped.push(`#${String(index)}：缺 slug`)
      return
    }
    if (seen.has(slug)) {
      dropped.push(`${slug}：重复`)
      return
    }
    if (!isPortalHref(href)) {
      dropped.push(`${slug}：地址不是 ${PORTAL_SUFFIX} 上的 https`)
      return
    }
    if (str(one['name']) === '') {
      dropped.push(`${slug}：缺 name`)
      return
    }
    seen.add(slug)
    systems.push({
      slug,
      name: str(one['name']),
      nameEn: str(one['nameEn']),
      desc: str(one['desc']),
      descEn: str(one['descEn']),
      kind: str(one['kind']),
      tags: strList(one['tags']),
      cta: str(one['cta']),
      href,
      host: str(one['host']),
      icon: iconShapes(one['icon']),
      primary: str(one['primary']),
      also: strList(one['also']),
      reachable: one['reachable'] === true,
      loginRequired: one['loginRequired'] === true,
    })
  })

  return {
    ok: true,
    view: { systems, probedOn: str(record['probedOn']), openRoute: str(record['openRoute']), dropped },
  }
}

/**
 * Fold systems into one group per primary role.
 *
 * Ordering is (plane, domain, role id) rather than "whatever order the catalog
 * arrived in", so the same catalog always draws the same page and a diff in the
 * panel means a diff in the data.
 *
 * A system whose primary role the roster does not know is **kept** — grouped
 * under its raw id and marked `known: false`. Hiding it would make a renamed
 * preset look like a deleted system.
 * @param systems - the parsed systems.
 * @param labels - role id → roster label, as `dsh-role-matrix-local` publishes it.
 * @returns the groups, roles that own nothing omitted.
 */
export function groupSystems(
  systems: readonly SystemView[],
  labels: ReadonlyMap<string, RoleLabel>,
): RoleGroup[] {
  const byRole = new Map<string, SystemView[]>()
  for (const system of systems) {
    const id = system.primary === '' ? '—' : system.primary
    const bucket = byRole.get(id)
    if (bucket === undefined) byRole.set(id, [system])
    else bucket.push(system)
  }

  const groups: RoleGroup[] = []
  for (const [id, members] of byRole) {
    const label = labels.get(id)
    groups.push({
      id,
      label: label === undefined ? id : `${id} ${label.name}`,
      plane: label?.plane ?? '',
      domain: label?.domain ?? '',
      known: label !== undefined,
      // Sorted by name so the group's order is about the group, not about the
      // order the portal happened to publish.
      systems: [...members].sort((a, b) => a.name.localeCompare(b.name, 'zh')),
    })
  }

  groups.sort((a, b) => {
    const plane = a.plane.localeCompare(b.plane, 'zh')
    if (plane !== 0) return plane
    const domain = a.domain.localeCompare(b.domain, 'zh')
    if (domain !== 0) return domain
    return a.id.localeCompare(b.id)
  })
  return groups
}

/**
 * Whether one system matches a search query.
 *
 * The secondary roles are matched on purpose: `also` is how a role that owns no
 * group reaches a system that belongs to it, so search is the only path from
 * 「叙事」 to a system grouped under 「绘影」.
 * @param system - the system.
 * @param query - raw user input; whitespace and case are ignored.
 * @param labels - role id → roster label.
 * @returns true when the system should stay visible.
 */
export function matchSystem(
  system: SystemView,
  query: string,
  labels: ReadonlyMap<string, RoleLabel>,
): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const roleText = (id: string): string => {
    const label = labels.get(id)
    return label === undefined ? id : `${id} ${label.name} ${label.plane} ${label.domain}`
  }
  const haystack = [
    system.name,
    system.nameEn,
    system.desc,
    system.descEn,
    system.kind,
    system.slug,
    system.host,
    system.cta,
    ...system.tags,
    roleText(system.primary),
    ...system.also.map(roleText),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

/**
 * Decide what pressing a system card does.
 *
 * There is no browser-side fallback to fall back to: this shell's main process
 * **denies** `target="_blank"` for http(s) (measured — see the Note), so a link
 * that looks live and does nothing is the default outcome unless the host half
 * performs the open. Hence `hostSupportsOpen` is an input, not an assumption.
 * @param inputs - the system and whether the host's open route answered.
 * @returns the plan; level 3 always carries a reason the card writes out.
 */
export function planOpenSystem(inputs: {
  system: SystemView
  hostSupportsOpen: boolean
}): SystemOpenPlan {
  const { system, hostSupportsOpen } = inputs
  if (!isPortalHref(system.href)) return { level: 3, kind: 'disabled', reason: 'no-href' }
  if (!hostSupportsOpen) return { level: 3, kind: 'disabled', reason: 'no-opener' }
  return { level: 0, kind: 'url', href: system.href }
}

/**
 * Coverage of the role matrix by this section, for the footer's honest count.
 * @param groups - the groups actually drawn.
 * @param labels - role id → roster label.
 * @param systems - the parsed systems, for the secondary roles.
 * @returns how many roles are reachable, and how many exist.
 */
export function roleCoverage(
  groups: readonly RoleGroup[],
  labels: ReadonlyMap<string, RoleLabel>,
  systems: readonly SystemView[],
): { touched: number; total: number } {
  const touched = new Set<string>()
  for (const group of groups) touched.add(group.id)
  for (const system of systems) for (const role of system.also) touched.add(role)
  touched.delete('—')
  return { touched: touched.size, total: labels.size }
}
