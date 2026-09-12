/**
 * Algorithm-skills tree collector.
 *
 * The surface answers one question the paper→skills pipeline never had a page
 * for: "the 1338 cards are installed — where do they sit in the organization?"
 * The skeleton is the same one the role matrix and the preset roster use
 * (4 planes → 8 responsibility domains → 50 roles), and this module reads it
 * from **installed runtime state only**:
 *
 *   - `<presets>/agt-<id>/manifest.json` — the LUTE sidecar carrying each role's
 *     plane / domain / order, its three material skill names (`x_lute.skills.
 *     material_skill_names`, the 151-name taxonomy as spelled per role), its
 *     standard artifact and its metric, plus the official avatar.
 *   - `<skills>/p2s-<slug>/SKILL.md` — every installed card, whose frontmatter
 *     already carries its classification (`l1_plane` / `l2_domain` /
 *     `l3_business`). The card IS the data; no package reads another package's
 *     `data/` directory.
 *
 * Two consequences worth stating, because both are load-bearing:
 *
 *  1. The join is `card.l3_business → role`. A card is placed by how it was
 *     *classified*, not by which preset happened to wire it into a subset.
 *     Those differ for most cards (349 of 1338 are wired somewhere), and
 *     conflating them would hide exactly the gap this page exists to show. The
 *     wiring state is therefore carried as a separate `wired` flag per card.
 *
 *  2. The build is fallible in ways that are silent by default: an L3 name the
 *     taxonomist misspelled, a plane/dimension pair that disagrees with the
 *     role it landed on, a role manifest that failed to parse. Every such case
 *     is collected into `issues` instead of dropping the card off the page.
 * @module dsh-algo-skills-local/collect
 */

import { parseFields } from './frontmatter.ts'
import { LAYER_ICONS } from './layer-icons.ts'
import type {
  DomainNode,
  PlaneNode,
  RoleNode,
  SkillRow,
  TreePayload,
  TreeTotals,
} from './wire.ts'

export type { DomainNode, PlaneNode, RoleNode, SkillRow, TreePayload, TreeTotals } from './wire.ts'

/** Filesystem boundary, injected so the collector can be tested without disk. */
export interface TreeSource {
  /** Skills root (for display). */
  readonly skillsRoot: string
  /** Preset root (for display). */
  readonly presetRoot: string
  /** Installed `p2s-` skill directory names. */
  listSkillDirs(): string[]
  /** Raw SKILL.md text for one skill directory. */
  readSkillFile(dir: string): string
  /** Preset directory ids matching `agt-*`. */
  listRoleDirs(): string[]
  /** Raw manifest.json text for one preset; `undefined` when unreadable. */
  readRoleManifest(dir: string): string | undefined
}

/** The subset-wiring fact extracted from a role manifest. */
interface RoleWire {
  /** Skill names the role's preset mounts. */
  subset: string[]
  /** Chinese responsibility names mapped to this role. */
  responsibilities: string[]
}

/** Official display fields read from a preset manifest. */
export interface RoleManifest {
  /** Preset directory id, e.g. `agt-019`. */
  id: string
  /** Material role id (`AGT-019`), derived from the preset id. */
  agt: string
  name: string
  description: string
  icon: string
  plane: { id: string; name: string; purpose: string }
  domain: { id: string; name: string }
  order: number
  artifact: string
  metrics: string
  wire: RoleWire
}

/** Read one field off an unknown JSON object without trusting its shape. */
function field(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined
  return (source as Record<string, unknown>)[key]
}

/** Read a string field, defaulting to empty. */
function str(source: unknown, key: string): string {
  const value = field(source, key)
  return typeof value === 'string' ? value : ''
}

/** Read a string-array field, dropping non-strings. */
function strList(source: unknown, key: string): string[] {
  const value = field(source, key)
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/**
 * Parse a role manifest into the fields this surface renders.
 *
 * Returns `undefined` rather than throwing: a single unreadable manifest must
 * cost one role's metadata, not the whole page (the same stance the role matrix
 * takes — presentation never decides whether a row exists).
 * @param id - preset directory id.
 * @param raw - manifest.json contents.
 * @returns parsed manifest, or `undefined` when it is not usable.
 */
export function parseRoleManifest(id: string, raw: string): RoleManifest | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  const xLute = field(parsed, 'x_lute')
  const plane = field(xLute, 'plane')
  const domain = field(xLute, 'domain')
  const planeId = str(plane, 'id')
  const domainId = str(domain, 'id')
  if (planeId === '' || domainId === '') return undefined
  const squad = field(xLute, 'squad')
  const skills = field(xLute, 'skills')
  const responsibilities = strList(skills, 'material_skill_names')
  const mapping = field(skills, 'mapping')
  const mappedNames = Array.isArray(mapping)
    ? mapping.map((row) => str(row, 'name')).filter((name) => name !== '')
    : []
  const order = field(xLute, 'order')
  return {
    id,
    agt: id.replace(/^agt-/, 'AGT-').toUpperCase(),
    name: str(parsed, 'name'),
    description: str(parsed, 'description'),
    icon: str(parsed, 'icon'),
    plane: { id: planeId, name: str(plane, 'name'), purpose: str(plane, 'purpose') },
    domain: { id: domainId, name: str(domain, 'name') },
    order: typeof order === 'number' && Number.isFinite(order) ? order : 0,
    artifact: str(squad, 'artifact'),
    metrics: str(squad, 'metrics'),
    wire: {
      subset: strList(skills, 'subset'),
      // `material_skill_names` is the authored key; `mapping[].name` and
      // `squad.skills` are the same three names in older/newer shapes, so the
      // L3→role index survives a manifest that only carries one of them.
      responsibilities: responsibilities.length > 0
        ? responsibilities
        : (mappedNames.length > 0 ? mappedNames : strList(squad, 'skills')),
    },
  }
}

/**
 * Read one installed card into a row.
 *
 * A card whose frontmatter is unreadable still yields a row (identified by its
 * directory name) so it appears in the unplaced group instead of vanishing.
 * @param name - skill directory name.
 * @param text - SKILL.md contents.
 * @returns the parsed row plus the classification keys used for placement.
 */
export function parseSkill(name: string, text: string): { row: SkillRow; plane: string; domain: string; l3: string } {
  const fields = parseFields(text)
  const l3All = fields.get('l3_all') ?? ''
  const l3 = (fields.get('l3_business') ?? '').split(' / ')[0]?.trim() ?? ''
  const alsoServes = l3All
    .split(' / ')
    .map((part) => part.trim())
    .filter((part) => part !== '' && part !== l3)
  return {
    row: {
      name: fields.get('name') ?? name,
      title: fields.get('title') ?? name,
      summary: fields.get('user_summary') ?? '',
      modelEnabled: (fields.get('disable-model-invocation') ?? 'false') !== 'true',
      srcDomain: fields.get('p2s_src_domain') ?? '',
      cardId: fields.get('p2s_card_id') ?? '',
      alsoServes,
      wired: false,
      wiredElsewhere: [],
    },
    plane: fields.get('l1_plane') ?? '',
    domain: fields.get('l2_domain') ?? '',
    l3,
  }
}

/**
 * Build the whole tree from an injected source.
 * @param source - filesystem boundary (real disk in production, fakes in tests).
 * @returns the payload served to the settings page.
 */
export function collectTree(source: TreeSource): TreePayload {
  const issues: string[] = []

  // ── roles ───────────────────────────────────────────────────────────────
  const manifests: RoleManifest[] = []
  for (const id of source.listRoleDirs()) {
    const raw = source.readRoleManifest(id)
    if (raw === undefined) { issues.push(`${id}: manifest.json 不可读，该岗位未进入矩阵`); continue }
    const manifest = parseRoleManifest(id, raw)
    if (manifest === undefined) { issues.push(`${id}: manifest.json 缺 x_lute.plane/domain，该岗位未进入矩阵`); continue }
    manifests.push(manifest)
  }
  manifests.sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))

  /** L3 responsibility name → the single role that owns it. */
  const roleByResponsibility = new Map<string, string>()
  /** Role id → skill names its preset mounts. */
  const wireByRole = new Map<string, Set<string>>()
  /** Role id → its parsed manifest, for classification-consistency checks. */
  const manifestById = new Map<string, RoleManifest>()
  for (const manifest of manifests) {
    manifestById.set(manifest.id, manifest)
    wireByRole.set(manifest.id, new Set(manifest.wire.subset))
    for (const name of manifest.wire.responsibilities) {
      const owner = roleByResponsibility.get(name)
      if (owner !== undefined && owner !== manifest.id) {
        issues.push(`责任「${name}」同时挂在 ${owner} 与 ${manifest.id}，按先到先得归 ${owner}`)
        continue
      }
      roleByResponsibility.set(name, manifest.id)
    }
  }
  /** Cards wired anywhere, for the totals line. */
  const wiredAnywhere = new Set<string>()
  for (const subset of wireByRole.values()) for (const name of subset) wiredAnywhere.add(name)

  // ── cards ───────────────────────────────────────────────────────────────
  const roleSkills = new Map<string, SkillRow[]>()
  const unplaced: SkillRow[] = []
  /** Cards wired into at least one role's subset — counted over installed cards only. */
  const wiredInstalled = new Set<string>()
  let scanned = 0
  for (const dir of source.listSkillDirs()) {
    scanned += 1
    const parsed = parseSkill(dir, source.readSkillFile(dir))
    const owner = roleByResponsibility.get(parsed.l3)
    if (owner === undefined) {
      parsed.row.wired = wiredAnywhere.has(parsed.row.name)
      unplaced.push(parsed.row)
      continue
    }
    parsed.row.wired = wireByRole.get(owner)?.has(parsed.row.name) === true
    if (parsed.row.wired) wiredInstalled.add(parsed.row.name)
    else {
      // 归本岗、却接线到别的岗位：分类与接线不一致，页面必须能看见。
      for (const [roleId, subset] of wireByRole) {
        if (roleId !== owner && subset.has(parsed.row.name)) parsed.row.wiredElsewhere.push(roleId)
      }
      parsed.row.wiredElsewhere.sort()
    }

    // 分类自洽：卡自己的 L1/L2 必须与它落到的岗位所属面/域一致。
    // 这两份事实由不同管线写出（卡是 S2 分类产物，岗位是 preset 生成产物），
    // 不一致时界面不会报错，只会把卡片画在一个它其实不属于的域下面。
    const manifest = manifestById.get(owner)
    if (manifest !== undefined) {
      if (parsed.plane !== '' && parsed.plane !== manifest.plane.name) {
        issues.push(`${parsed.row.name}: 卡的 L1「${parsed.plane}」≠ 岗位 ${manifest.agt} 所属面「${manifest.plane.name}」`)
      }
      if (parsed.domain !== '' && parsed.domain !== manifest.domain.name) {
        issues.push(`${parsed.row.name}: 卡的 L2「${parsed.domain}」≠ 岗位 ${manifest.agt} 所属域「${manifest.domain.name}」`)
      }
    }

    const bucket = roleSkills.get(owner)
    if (bucket === undefined) roleSkills.set(owner, [parsed.row])
    else bucket.push(parsed.row)
  }

  // ── assemble ────────────────────────────────────────────────────────────
  const planes: PlaneNode[] = []
  const planeById = new Map<string, PlaneNode>()
  const domainById = new Map<string, DomainNode>()
  for (const manifest of manifests) {
    let plane = planeById.get(manifest.plane.id)
    if (plane === undefined) {
      plane = {
        id: manifest.plane.id,
        name: manifest.plane.name,
        purpose: manifest.plane.purpose,
        icon: LAYER_ICONS[manifest.plane.id] ?? '',
        domains: [],
      }
      planeById.set(manifest.plane.id, plane)
      planes.push(plane)
    }
    const domainKey = `${manifest.plane.id}/${manifest.domain.id}`
    let domain = domainById.get(domainKey)
    if (domain === undefined) {
      domain = {
        id: manifest.domain.id,
        name: manifest.domain.name,
        icon: LAYER_ICONS[manifest.domain.id] ?? '',
        roles: [],
      }
      domainById.set(domainKey, domain)
      plane.domains.push(domain)
    }
    const skills = roleSkills.get(manifest.id) ?? []
    const [alias, title] = splitAlias(manifest.name)
    domain.roles.push({
      id: manifest.id,
      agt: manifest.agt,
      alias,
      title: title === '' ? manifest.name : title,
      name: manifest.name,
      description: manifest.description,
      icon: manifest.icon,
      order: manifest.order,
      artifact: manifest.artifact,
      metrics: manifest.metrics,
      responsibilities: manifest.wire.responsibilities,
      skills,
      wired: skills.filter((skill) => skill.wired).length,
    })
  }

  const placed = manifests.reduce((sum, manifest) => sum + (roleSkills.get(manifest.id)?.length ?? 0), 0)
  for (const manifest of manifests) {
    const count = roleSkills.get(manifest.id)?.length ?? 0
    if (count === 0) issues.push(`${manifest.agt} ${manifest.name}：本岗 0 张卡（矩阵空白岗位）`)
  }
  const domainSlices = planes.reduce((sum, plane) => sum + plane.domains.length, 0)
  const distinctDomains = new Set(manifests.map((manifest) => manifest.domain.id)).size

  return {
    ok: true,
    root: source.skillsRoot,
    presetRoot: source.presetRoot,
    totals: {
      planes: planes.length,
      domainSlices,
      distinctDomains,
      roles: manifests.length,
      skills: scanned,
      placed,
      unplaced: unplaced.length,
      wired: wiredInstalled.size,
      wiredAnywhere: wiredAnywhere.size,
      emptyRoles: manifests.filter((manifest) => (roleSkills.get(manifest.id)?.length ?? 0) === 0).length,
    },
    planes,
    unplaced,
    issues,
  }
}

/** Split `望野 · 市场竞争与机会研究` into alias and job title. */
function splitAlias(name: string): [string, string] {
  const at = name.indexOf(' · ')
  if (at < 0) return ['', name]
  return [name.slice(0, at), name.slice(at + 3)]
}

