/**
 * Preset roster + LUTE manifest collector for the role matrix.
 *
 * Two sources, deliberately kept separate:
 *   - `preset.yml` — the OFFICIAL display metadata: name / description / order
 *     and `icon`. The loader's `readPresetMetadata` carries all four through
 *     verbatim, and the roster ships `icon` to the client, which renders it as
 *     an `<img class="cardAvatar">`. The panel therefore reads the avatar from
 *     HERE rather than from the sidecar, so a matrix card and the official
 *     preset card for the same role cannot show different faces.
 *   - `manifest.json` — the LUTE-owned sidecar carrying the material
 *     provenance, the two-level classification (plane / domain), the squad
 *     contract and the skill inventory. The official roster never reads it,
 *     so extending it cannot break preset loading.
 *
 * A preset missing its manifest still renders (degraded): the official roster
 * is the capability source and the matrix is presentation, so presentation
 * must not decide whether a row is visible.
 * @module dsh-role-matrix-local/collect
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** One role card as the panel renders it. */
export interface RoleCard {
  /** Preset id / directory name, e.g. `agt-007`. */
  id: string
  /** Material role id, e.g. `AGT-007`. */
  agt: string
  /** Role alias (the persona's stable work-style handle), e.g. `望野`. */
  alias: string
  /** Job title inside the organization. */
  title: string
  /** Official display name from preset.yml. */
  name: string
  /** Official one-line description from preset.yml. */
  description: string
  /** Inline SVG avatar (data URI) from preset.yml; empty when the preset declares none. */
  icon: string
  /** Official roster order (plane-blocked); undefined when the preset declares none. */
  order: number | undefined
  /** Standard artifact the role is accountable for. */
  artifact: string
  /** Business metric the role is judged on. */
  metrics: string
  /** Organization plane id, e.g. `PLN-OPS`. */
  planeId: string
  /** Organization plane display name. */
  planeName: string
  /** Responsibility-domain id, e.g. `DOM-02`. */
  domainId: string
  /** Responsibility-domain display name. */
  domainName: string
  /** LUTE lifecycle marker from the manifest (always `draft` today). */
  lifecycleStatus: string
  /** Whether the material authorized production for this role (always false today). */
  productionAuthorized: boolean
  /** Resolved skill-subset ids compiled into the preset composition. */
  subset: string[]
  /** Material business-skill names the platform has no supply for. */
  gaps: string[]
  /** Material business-skill names (verbatim, Chinese) this role declares. */
  materialSkillNames: string[]
  /** Primary/eligible value-flow ids. */
  flows: string[]
  /** Business scenario ids. */
  scenarios: string[]
  /** Roles this one routinely collaborates with (material `collaborates_with`). */
  collaboratesWith: string[]
  /** Playbook ids this role participates in. */
  playbooks: string[]
  /** Why this card renders with less than the full manifest, absent when complete. */
  degraded?: string
}

/** One responsibility domain inside a plane, with its roles. */
export interface DomainGroup {
  /** Domain id. */
  id: string
  /** Domain display name. */
  name: string
  /** Roles in this domain, ordered by the official roster order. */
  roles: RoleCard[]
}

/** One organization plane, with its domains. */
export interface PlaneGroup {
  /** Plane id. */
  id: string
  /** Plane display name. */
  name: string
  /** Why the plane exists (material `planes[].purpose`). */
  purpose: string
  /** Role count directly under the plane. */
  roles: number
  /** Domains present inside this plane. */
  domains: DomainGroup[]
}

/** Whole-matrix payload served to the panel. */
export interface MatrixPayload {
  /** Scanned preset root. */
  root: string
  /** Scan timestamp (ISO). */
  scannedAt: string
  /** Planes in the material's own order. */
  planes: PlaneGroup[]
  /** Aggregate counts, including how many rows lost part of their manifest. */
  totals: { roles: number; planes: number; domains: number; degraded: number }
}

/**
 * The official preset id pattern (`@deepseek-ai/dsh-agent-presets` `PRESET_ID`):
 * the id becomes a path segment, so this is a containment boundary. Only role
 * presets (`agt-NNN`) are listed by this surface; the shipped set and any other
 * local preset stay owned by the official picker.
 */
export const ROLE_PRESET_ID = /^agt-(\d{3})$/

/** Plane display order, matching the material's `planes[]` order. */
const PLANE_ORDER: Record<string, number> = { 'PLN-MGT': 1, 'PLN-OPS': 2, 'PLN-CTL': 3, 'PLN-PLT': 4 }

/** Domain display order, matching the material's `domain_views[]` order. */
const DOMAIN_ORDER: Record<string, number> = {
  'DOM-01': 1, 'DOM-02': 2, 'DOM-03': 3, 'DOM-04': 4,
  'DOM-05': 5, 'DOM-06': 6, 'DOM-07': 7, 'DOM-08': 8,
}

/**
 * Parse the top-level scalar keys of a display-metadata file.
 *
 * Deliberately minimal: `preset.yml` is a flat display document (name /
 * description / order / icon) written by the authoring seam, and pulling a full
 * YAML parser into the host half would add a dependency for no reachable case.
 * Anything nested or non-scalar is ignored rather than guessed at. `icon` is a
 * single-quoted base64 data URI — no single quotes inside, so the quote-strip
 * below round-trips it byte for byte, the same string the official card shows.
 * @param text - preset.yml contents.
 * @returns top-level scalar key/value pairs.
 */
export function parseDisplayScalars(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    if (raw === '' || raw.startsWith(' ') || raw.startsWith('\t') || raw.startsWith('#')) continue
    const colon = raw.indexOf(':')
    if (colon <= 0) continue
    const key = raw.slice(0, colon).trim()
    let value = raw.slice(colon + 1).trim()
    if (value.length >= 2 && ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))) {
      value = value.slice(1, -1).replace(/''/g, "'")
    }
    if (key !== '') out[key] = value
  }
  return out
}

/** Narrow unknown JSON into the slices the matrix needs, without asserting a shape. */
function readManifest(raw: unknown): {
  planeName: string; planeId: string; planePurpose: string
  domainName: string; domainId: string
  alias: string; title: string; agt: string
  artifact: string; metrics: string
  lifecycleStatus: string; productionAuthorized: boolean
  subset: string[]; gaps: string[]; materialSkillNames: string[]
  flows: string[]; scenarios: string[]; collaboratesWith: string[]; playbooks: string[]
} | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const root = raw as Record<string, any>
  const x = root['x_lute']
  if (x === null || typeof x !== 'object') return undefined
  const material = (root['material'] ?? {}) as Record<string, any>
  const catalog = (material['role_catalog'] ?? {}) as Record<string, any>
  const record = (catalog['record'] ?? {}) as Record<string, any>
  const skills = (x['skills'] ?? {}) as Record<string, any>
  const squad = (x['squad'] ?? {}) as Record<string, any>
  const lifecycle = (x['lifecycle'] ?? {}) as Record<string, any>
  const plane = (x['plane'] ?? {}) as Record<string, any>
  const domain = (x['domain'] ?? {}) as Record<string, any>
  const collab = (material['collaboration_graph'] ?? {}) as Record<string, any>
  const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  return {
    planeId: String(plane['id'] ?? ''),
    planeName: String(plane['name'] ?? ''),
    planePurpose: String(plane['purpose'] ?? ''),
    domainId: String(domain['id'] ?? ''),
    domainName: String(domain['name'] ?? ''),
    agt: String(record['id'] ?? ''),
    alias: String(record['alias'] ?? ''),
    title: String(record['title'] ?? ''),
    artifact: String(record['artifact'] ?? ''),
    metrics: String(record['metrics'] ?? ''),
    lifecycleStatus: String(lifecycle['status'] ?? ''),
    productionAuthorized: lifecycle['production_authorized'] === true,
    subset: list(skills['subset']),
    gaps: list(skills['gaps']),
    materialSkillNames: list(skills['material_skill_names']),
    flows: list(squad['eligible_flows']),
    scenarios: list(record['scenarios']),
    collaboratesWith: list(record['collaborates_with']),
    playbooks: list(record['playbooks']),
  }
}

/**
 * Scan one preset root and build the whole matrix payload.
 *
 * Read order per preset: `preset.yml` (official display) then `manifest.json`
 * (LUTE sidecar). A preset missing either still produces a card; the missing
 * half is reported through {@link RoleCard.degraded} rather than dropped,
 * because hiding a row would make a broken preset invisible exactly where the
 * user goes to find it.
 * @param root - the preset root directory (one subdirectory per preset).
 * @returns the grouped matrix payload.
 */
export function collectRoleMatrix(root: string): MatrixPayload {
  const cards: RoleCard[] = []

  const dirs = existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && ROLE_PRESET_ID.test(entry.name))
        .map((entry) => entry.name)
        .sort()
    : []

  for (const dir of dirs) {
    const dirPath = join(root, dir)
    let name = dir
    let description = ''
    let order: number | undefined
    let icon = ''
    const notes: string[] = []

    const displayPath = join(dirPath, 'preset.yml')
    if (existsSync(displayPath)) {
      const scalars = parseDisplayScalars(readFileSync(displayPath, 'utf8'))
      if (scalars['name'] !== undefined && scalars['name'] !== '') name = scalars['name']
      if (scalars['description'] !== undefined) description = scalars['description']
      const parsed = Number(scalars['order'])
      if (scalars['order'] !== undefined && Number.isFinite(parsed)) order = parsed
      if (scalars['icon'] !== undefined) icon = scalars['icon']
    } else {
      notes.push('preset.yml 缺失')
    }

    const manifestPath = join(dirPath, 'manifest.json')
    let manifest: ReturnType<typeof readManifest>
    if (existsSync(manifestPath)) {
      try {
        manifest = readManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
      } catch {
        manifest = undefined
      }
      if (manifest === undefined) notes.push('manifest.json 不可解析或缺 x_lute 段')
    } else {
      notes.push('manifest.json 缺失')
    }

    if (manifest !== undefined && manifest.planeName !== '') {
      // A complete card: everything comes from the manifest.
      cards.push({
        id: dir,
        agt: manifest.agt,
        alias: manifest.alias,
        title: manifest.title,
        name,
        description,
        icon,
        order,
        artifact: manifest.artifact,
        metrics: manifest.metrics,
        planeId: manifest.planeId,
        planeName: manifest.planeName,
        domainId: manifest.domainId,
        domainName: manifest.domainName,
        lifecycleStatus: manifest.lifecycleStatus,
        productionAuthorized: manifest.productionAuthorized,
        subset: manifest.subset,
        gaps: manifest.gaps,
        materialSkillNames: manifest.materialSkillNames,
        flows: manifest.flows,
        scenarios: manifest.scenarios,
        collaboratesWith: manifest.collaboratesWith,
        playbooks: manifest.playbooks,
      })
      continue
    }

    // Degraded card: the official roster still describes it, so show it under
    // an explicit "unclassified" bucket instead of dropping the row.
    cards.push({
      id: dir,
      agt: `AGT-${dir.slice(4)}`,
      alias: '',
      title: name,
      name,
      description,
      icon,
      order,
      artifact: '',
      metrics: '',
      planeId: 'UNCLASSIFIED',
      planeName: '未分类',
      domainId: 'UNCLASSIFIED',
      domainName: '缺少 manifest',
      lifecycleStatus: '',
      productionAuthorized: false,
      subset: [],
      gaps: [],
      materialSkillNames: [],
      flows: [],
      scenarios: [],
      collaboratesWith: [],
      playbooks: [],
      degraded: notes.join('；'),
    })
  }

  const planeMap = new Map<string, { id: string; name: string; purpose: string; domains: Map<string, DomainGroup> }>()
  for (const card of cards) {
    let plane = planeMap.get(card.planeId)
    if (plane === undefined) {
      plane = { id: card.planeId, name: card.planeName, purpose: '', domains: new Map() }
      planeMap.set(card.planeId, plane)
    }
    let domain = plane.domains.get(card.domainId)
    if (domain === undefined) {
      domain = { id: card.domainId, name: card.domainName, roles: [] }
      plane.domains.set(card.domainId, domain)
    }
    domain.roles.push(card)
  }

  /** Order by the official roster order, then by id — the same tiebreak the roster itself uses. */
  const byOrder = (a: RoleCard, b: RoleCard): number =>
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)

  const planes: PlaneGroup[] = [...planeMap.values()]
    .map((plane) => {
      const domains = [...plane.domains.values()]
        .map((domain) => ({ ...domain, roles: [...domain.roles].sort(byOrder) }))
        .sort((a, b) => (DOMAIN_ORDER[a.id] ?? 99) - (DOMAIN_ORDER[b.id] ?? 99) || a.id.localeCompare(b.id))
      return {
        id: plane.id,
        name: plane.name,
        purpose: plane.purpose,
        roles: domains.reduce((sum, domain) => sum + domain.roles.length, 0),
        domains,
      }
    })
    .sort((a, b) => (PLANE_ORDER[a.id] ?? 99) - (PLANE_ORDER[b.id] ?? 99) || a.id.localeCompare(b.id))

  return {
    root,
    scannedAt: new Date().toISOString(),
    planes,
    totals: {
      roles: cards.length,
      planes: planes.length,
      // Distinct MATERIAL domains, not (plane, domain) tree nodes. Three of the
      // eight domains — 经营与组织, 财务与合规, 数据与AI运行 — legitimately appear
      // under two or three planes, so counting nodes reported "12 责任域" directly
      // beside a subtitle that says "八责任域". Rows the material never classified
      // are not domains, so they do not count here (they still show in the tree).
      domains: new Set(
        cards.map((card) => card.domainId).filter((id) => id !== '' && id !== 'UNCLASSIFIED'),
      ).size,
      degraded: cards.filter((card) => card.degraded !== undefined).length,
    },
  }
}
