/**
 * Client-side narrowing of the tree: one search field, four levels of context.
 *
 * Kept out of the component because it is the part with actual decisions in it,
 * and because the mistakes here are invisible in a browser: a branch that keeps
 * a role with zero matches renders an empty expansion, and a branch that drops a
 * matching card just makes the count lie. The rules, stated so they can be
 * argued with:
 *
 *  - A query matches a CARD through its name, title, summary, source technology
 *    family, or a secondary responsibility. It matches a ROLE through its alias
 *    or job title, a DOMAIN through its name, and a PLANE through its name — a
 *    query naming 「物流」 should reach the role that owns logistics even when no
 *    single card spells it, because that is how a person looks for a card they
 *    cannot name.
 *  - A role that matches at the role level keeps ALL its cards. Showing a role
 *    header over an empty grid would be a worse lie than showing too much.
 *  - The unplaced group is searched like any other; it is not special-cased.
 * @module dsh-algo-skills-local/client/filter
 */

import type { DomainNode, PlaneNode, RoleNode, SkillRow, TreePayload } from '../wire.ts'

/** A tree narrowed to the active query, with empty branches already removed. */
export interface NarrowedTree {
  /** Planes that survived, each with only surviving branches. */
  planes: PlaneNode[]
  /** Unplaced cards that survived. */
  unplaced: SkillRow[]
  /** How many cards survived in total. */
  cards: number
  /** Whether a query was active at all. */
  searching: boolean
}

/** Lowercase haystack for one card. */
function cardHaystack(card: SkillRow): string {
  return [card.name, card.title, card.summary, card.srcDomain, card.alsoServes.join(' ')]
    .join('\u0000')
    .toLowerCase()
}

/** Lowercase haystack for one role's own identity (not its cards'). */
function roleHaystack(role: RoleNode): string {
  return [role.alias, role.title, role.name, role.agt, role.artifact, role.metrics, role.responsibilities.join(' ')]
    .join('\u0000')
    .toLowerCase()
}

/**
 * Narrow the tree to a query.
 * @param tree - the full payload.
 * @param query - raw user input; whitespace-only means "no query".
 * @returns the narrowed tree; with no query it is the input tree unchanged.
 */
export function narrowTree(tree: TreePayload, query: string): NarrowedTree {
  const q = query.trim().toLowerCase()
  if (q === '') {
    let cards = 0
    for (const plane of tree.planes) {
      for (const domain of plane.domains) {
        for (const role of domain.roles) cards += role.skills.length
      }
    }
    return { planes: tree.planes, unplaced: tree.unplaced, cards, searching: false }
  }

  let cards = 0
  const planes: PlaneNode[] = []
  for (const plane of tree.planes) {
    const planeHit = plane.name.toLowerCase().includes(q) || plane.purpose.toLowerCase().includes(q)
    const domains: DomainNode[] = []
    for (const domain of plane.domains) {
      const domainHit = planeHit || domain.name.toLowerCase().includes(q)
      const roles: RoleNode[] = []
      for (const role of domain.roles) {
        const roleHit = domainHit || roleHaystack(role).includes(q)
        const skills = roleHit ? role.skills : role.skills.filter((card) => cardHaystack(card).includes(q))
        if (skills.length === 0) continue
        cards += skills.length
        roles.push(skills === role.skills ? role : { ...role, skills })
      }
      if (roles.length === 0) continue
      domains.push({ ...domain, roles })
    }
    if (domains.length === 0) continue
    planes.push({ ...plane, domains })
  }

  const unplaced = tree.unplaced.filter((card) => cardHaystack(card).includes(q))
  cards += unplaced.length
  return { planes, unplaced, cards, searching: true }
}

/**
 * Every expandable key that should be open for a narrowed tree.
 *
 * Search opens what it matched: leaving a hit behind a collapsed parent means
 * the page reports a count it will not show.
 * @param narrowed - the narrowed tree.
 * @returns role ids and `plane/domain` keys to expand.
 */
export function expansionFor(narrowed: NarrowedTree): Set<string> {
  const open = new Set<string>()
  if (!narrowed.searching) return open
  for (const plane of narrowed.planes) {
    open.add(plane.id)
    for (const domain of plane.domains) {
      open.add(`${plane.id}/${domain.id}`)
      for (const role of domain.roles) open.add(role.id)
    }
  }
  return open
}
