/**
 * The wire contract between the host route family and the browser half.
 *
 * It lives in its own module for one concrete reason: the client bundle must
 * never import `collect.ts`, because that module reaches `layer-icons.ts` (a
 * 48 KiB blob of base64 avatars) and the host's filesystem types. Importing
 * types alone is erased, but keeping the shapes in a module with no imports
 * makes that structural rather than a property of how each bundler treats
 * `import type` today.
 * @module dsh-algo-skills-local/wire
 */

/** One installed card, as the settings page renders it. */
export interface SkillRow {
  /** Installed skill name (= directory name), e.g. `p2s-3d-bin-packing-optimization`. */
  name: string
  /** Card title (Chinese + English, as authored). */
  title: string
  /** One-line "what it does for you" summary; empty for hand-authored cards. */
  summary: string
  /** Whether the model may invoke it without a "/" command. */
  modelEnabled: boolean
  /** Source technology family from the corpus, e.g. `18-物流履约`. */
  srcDomain: string
  /** Source card id, e.g. `Skill-3D-Bin-Packing-Optimization`. */
  cardId: string
  /** Secondary responsibilities this card also serves, when it declares more than one. */
  alsoServes: string[]
  /** Whether this role's preset actually wires the card into its skill-subset. */
  wired: boolean
  /** Other roles whose preset mounts this card — classification and wiring disagreeing. */
  wiredElsewhere: string[]
}

/** One role (job) inside a responsibility domain. */
export interface RoleNode {
  /** Preset directory id, e.g. `agt-019`. */
  id: string
  /** Material role id, e.g. `AGT-019`. */
  agt: string
  /** Role alias, the stable work-style handle, e.g. `通途`. */
  alias: string
  /** Job title inside the organization. */
  title: string
  /** Official display name, e.g. `通途 · 跨境物流与关务`. */
  name: string
  /** Official one-line description (already carries plane/domain prefixes). */
  description: string
  /** Inline SVG avatar (data URI) from the role's LUTE manifest. */
  icon: string
  /** Roster order (plane-blocked); 0 when the manifest declares none. */
  order: number
  /** Standard artifact this role is accountable for. */
  artifact: string
  /** Business metric this role is judged on. */
  metrics: string
  /** The role's material responsibility names (its slice of the 151). */
  responsibilities: string[]
  /** Cards classified into this role, in card order. */
  skills: SkillRow[]
  /** How many of those cards the role's preset actually wires up. */
  wired: number
}

/** One responsibility domain inside a plane. */
export interface DomainNode {
  /** Domain id, e.g. `DOM-03`. */
  id: string
  /** Domain display name, e.g. `供应与履约`. */
  name: string
  /** Avatar (data URI) for the domain layer. */
  icon: string
  /** Roles present in this domain, ordered by roster order. */
  roles: RoleNode[]
}

/** One organization plane. */
export interface PlaneNode {
  /** Plane id, e.g. `PLN-OPS`. */
  id: string
  /** Plane display name, e.g. `业务运营`. */
  name: string
  /** Why this plane exists (the material's own wording). */
  purpose: string
  /** Avatar (data URI) for the plane layer. */
  icon: string
  /** Domains present in this plane. */
  domains: DomainNode[]
}

/** Payload totals, so the page can state coverage without re-walking the tree. */
export interface TreeTotals {
  /** Planes rendered. */
  planes: number
  /** Domain *slices* rendered. A responsibility domain can serve more than one plane,
   * so this exceeds the taxonomy's 8 distinct domains whenever it does. */
  domainSlices: number
  /** Distinct responsibility domains (the taxonomy's 8). */
  distinctDomains: number
  /** Roles rendered (every role appears, including empty ones). */
  roles: number
  /** Installed cards scanned. */
  skills: number
  /** Cards that landed on a role. */
  placed: number
  /** Cards the corpus never classified (matrix-blank cards). */
  unplaced: number
  /** Cards wired into their own role's skill-subset (the page's "本岗已接线" tag). */
  wired: number
  /** Cards wired into at least one role's skill-subset, anywhere. */
  wiredAnywhere: number
  /** Roles with no card of their own. */
  emptyRoles: number
}

/** The whole payload served to the settings page. */
export interface TreePayload {
  /** Always true; the client narrows on it. */
  ok: true
  /** Skills root scanned (absolute path, shown in the page footer). */
  root: string
  /** Preset root scanned (absolute path). */
  presetRoot: string
  /** Coverage totals. */
  totals: TreeTotals
  /** The classification skeleton. */
  planes: PlaneNode[]
  /** Cards with no classification at all; rendered as a trailing group. */
  unplaced: SkillRow[]
  /** Drift diagnostics; empty when the tree is fully consistent. */
  issues: string[]
}
