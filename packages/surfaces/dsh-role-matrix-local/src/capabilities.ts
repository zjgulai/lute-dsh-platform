/**
 * Preset capability projection — *what can this role preset actually do?*
 *
 * ## Why this is a read and not a derivation
 *
 * The launch plan for this surface (`.scratch/newapp-midcol-design/plan.md`, R5)
 * called for `scripts/role-presets/generate.mjs` to emit a new
 * `preset-capabilities.json` and for a gate to keep it in sync with the 51
 * presets. Implementation found that unnecessary, and worse than what already
 * exists:
 *
 *   - the fact already has a home — each preset's own `manifest.json`, written
 *     by `generate.mjs` from `role-catalog.json` + `skill-map.json`. Its
 *     `x_lute.skills.mapping` **is** the derived capability map, with the
 *     material's verbatim `kind` / `note` / `supply` per business skill;
 *   - this plugin already reads that exact file ({@link ./collect.ts}), for the
 *     roster it serves;
 *   - a second copy would need a gate to hold it in step, and that gate could
 *     not regenerate the copy (the material root is outside the repo), so it
 *     would be a check that cannot fail meaningfully. A preset authored
 *     tomorrow would render an empty surface until someone remembered to run
 *     the generator.
 *
 * Reading the manifest at request time makes that drift structurally
 * impossible (ADR-0009: one fact, one home). So this module is the same read
 * as the roster's, projected one level deeper — not a second source.
 *
 * ## The one thing the manifest does not carry: display names
 *
 * `x_lute.skills.mapping[].supply` is a list of **skill ids**
 * (`p2s-account-health-early-warning-system`). A person reading the hero entry
 * needs the skill's own name and one-line summary, which live in the skill
 * itself (`~/.dsh/skills/<id>/SKILL.md` frontmatter) — ADR-0041: the installed
 * skill body is the runtime home. That is a read, never a copy.
 *
 * Totality: every parser here degrades rather than throws. A skill with no
 * `SKILL.md`, an unreadable frontmatter block and a manifest missing its
 * `x_lute` section each produce a reported degradation, never an exception and
 * never a silently empty surface.
 * @module dsh-role-matrix-local/capabilities
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROLE_PRESET_ID } from './collect.ts'

/** How well the platform covers one material business skill. */
export type CapabilityKind = 'direct' | 'partial' | 'gap'

/** One platform skill the role's business skill is served by. */
export interface CapabilitySupply {
  /** Skill id — the directory name under the skills root. */
  id: string
  /** Display name from `SKILL.md`; falls back to the id when the skill declares none. */
  label: string
  /** One-line summary for the card subtitle; empty when the skill declares none. */
  summary: string
}

/** One business skill of the role, with the platform supply behind it. */
export interface CapabilityGroup {
  /** Material business-skill name, verbatim (Chinese). */
  name: string
  /** Coverage grade, verbatim from `skill-map.json` through the manifest. */
  kind: CapabilityKind
  /** Honest boundary note, verbatim; empty when the mapping declares none. */
  note: string
  /** Platform skills serving this business skill, in mapping order. */
  supplies: CapabilitySupply[]
}

/** One material playbook (scene manual) the role participates in. */
export interface CapabilityManual {
  /** Playbook id, e.g. `PB-001`. */
  id: string
  /** Playbook title from the material's own section heading. */
  label: string
}

/** Everything the hero entry renders for one role preset. */
export interface PresetCapabilities {
  /** Preset id / directory name, e.g. `agt-027`. */
  preset: string
  /** Material role id, e.g. `AGT-027`. */
  agt: string
  /** Role alias, e.g. `守店`. */
  alias: string
  /** Job title, e.g. `店铺账号健康与规则`. */
  title: string
  /** Official display name from `preset.yml`. */
  name: string
  /** Organization plane id. */
  planeId: string
  /** Organization plane display name. */
  planeName: string
  /** Responsibility-domain id. */
  domainId: string
  /** Responsibility-domain display name. */
  domainName: string
  /** The role's standard artifact (the material's own words). */
  artifact: string
  /** One business-skill group per material skill (always three today). */
  groups: CapabilityGroup[]
  /** Scene manuals, in the manifest's section order. */
  manuals: CapabilityManual[]
  /** Why this projection is thinner than a complete manifest, absent when complete. */
  degraded?: string
}

/** Longest `description`-derived summary kept before it stops being a subtitle. */
const SUMMARY_MAX = 120

/**
 * Unquote one frontmatter scalar.
 *
 * Deliberately minimal — the same call the roster's `preset.yml` reader makes:
 * quoted values lose their quotes, `''` unwraps to `'`, and a YAML block scalar
 * (`|` / `>`) yields nothing rather than a guess. A wrong guess here would put
 * `description: |` on screen as a skill's name.
 * @param value - the raw right-hand side of a frontmatter line.
 * @returns the scalar, or undefined when the value is not a usable scalar.
 */
export function scalar(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '|' || trimmed === '>' || trimmed === '|-' || trimmed === '>-') {
    return undefined
  }
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    const inner = trimmed.slice(1, -1)
    return trimmed.startsWith('"')
      ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : inner.replace(/''/g, "'")
  }
  return trimmed
}

/**
 * Read the top-level scalars of a `SKILL.md` frontmatter block.
 *
 * Only the leading `---` fence is read. Nested keys and block scalars are
 * ignored rather than guessed at: this feeds a *label*, and a label is not
 * worth a YAML parser in the host half.
 * @param text - full `SKILL.md` contents.
 * @returns top-level scalar key/value pairs (empty when there is no frontmatter).
 */
export function parseFrontmatter(text: string): Record<string, string> {
  const lines = text.split('\n')
  if (lines.length === 0 || lines[0]?.trim() !== '---') return {}
  const out: Record<string, string> = {}
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (line.trim() === '---') break
    if (line === '' || line.startsWith(' ') || line.startsWith('\t') || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    const value = scalar(line.slice(colon + 1))
    if (key !== '' && value !== undefined) out[key] = value
  }
  return out
}

/**
 * Shorten a skill description into a card subtitle.
 *
 * The material's skills write long, comma-spliced descriptions whose first
 * clause is the actual subject ("电商多账户关联风险检测，覆盖…" → "电商多账户关联风险检测").
 * Cutting at the first sentence end, then at the first comma, then at
 * {@link SUMMARY_MAX} keeps the subject and drops the syllabus.
 * @param description - raw description.
 * @returns the subtitle, possibly empty.
 */
export function summarize(description: string): string {
  const flat = description.replace(/\s+/g, ' ').trim()
  if (flat === '') return ''
  const sentence = /^(.*?[。．.！!？?])/.exec(flat)
  const first = (sentence?.[1] ?? flat).replace(/[。．.！!？?]$/u, '').trim()
  const clause = first.split(/[，,；;]/u)[0]?.trim() ?? first
  const pick = clause !== '' ? clause : first
  return pick.length > SUMMARY_MAX ? `${pick.slice(0, SUMMARY_MAX - 1)}…` : pick
}

/** One resolved skill label, cached for the duration of a request. */
interface SkillLabel {
  label: string
  summary: string
}

/**
 * Resolve one skill id to its display name and subtitle.
 *
 * Order is the skill's own authority order: `title` names it, `description`
 * describes it, `user_summary` is the author's own one-liner for exactly this
 * kind of surface. When there is no `SKILL.md` (a skill mid-install, or a name
 * that only exists in a mapping), the id is the honest display name — the
 * alternative is an empty card.
 * @param skillsRoot - installed-skills root (one directory per skill).
 * @param id - skill id.
 * @param cache - per-request memo.
 * @returns the label pair; never throws.
 */
export function readSkillLabel(skillsRoot: string, id: string, cache: Map<string, SkillLabel>): SkillLabel {
  const hit = cache.get(id)
  if (hit !== undefined) return hit
  let resolved: SkillLabel = { label: id, summary: '' }
  try {
    const path = join(skillsRoot, id, 'SKILL.md')
    if (existsSync(path)) {
      const meta = parseFrontmatter(readFileSync(path, 'utf8'))
      const title = meta['title']
      const description = meta['description']
      const summary = meta['user_summary']
      resolved = {
        label: title !== undefined && title !== '' ? title : summarize(description ?? '') || id,
        summary: summary !== undefined && summary !== '' ? summarize(summary) : summarize(description ?? ''),
      }
    }
  } catch {
    // A label read is best-effort by construction; the id remains the answer.
  }
  cache.set(id, resolved)
  return resolved
}

/**
 * One mapping entry before its supply ids are resolved to skill labels.
 *
 * Kept separate from {@link CapabilityGroup} on purpose: the manifest carries
 * ids and the surface needs labels, and a single type for both would let an
 * unresolved id reach the UI looking like a resolved one.
 */
interface RawGroup {
  name: string
  kind: CapabilityKind
  note: string
  supplies: string[]
}

/** Parse `## PB-001 存量GMV联合经营` into its id and title. */
const PLAYBOOK_HEADING = /^##\s+(PB-\d+)\s*(.*)$/

/** Narrow unknown JSON into the slices this projection needs, without asserting a shape. */
function readManifest(raw: unknown): {
  planeId: string; planeName: string
  domainId: string; domainName: string
  agt: string; alias: string; title: string; artifact: string
  groups: RawGroup[]
  manuals: CapabilityManual[]
} | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const root = raw as Record<string, unknown>
  const x = root['x_lute']
  if (x === null || typeof x !== 'object') return undefined
  const xl = x as Record<string, unknown>
  const str = (value: unknown): string => (typeof value === 'string' ? value : '')
  const obj = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  const plane = obj(xl['plane'])
  const domain = obj(xl['domain'])
  const skills = obj(xl['skills'])
  const material = obj(root['material'])
  const catalog = obj(material['role_catalog'])
  const record = obj(catalog['record'])

  const rawMapping = skills['mapping']
  const groups: RawGroup[] = Array.isArray(rawMapping)
    ? rawMapping.flatMap((entry): RawGroup[] => {
        const m = obj(entry)
        const name = str(m['name'])
        if (name === '') return []
        const kind = str(m['kind'])
        return [{
          name,
          kind: kind === 'direct' || kind === 'partial' || kind === 'gap' ? kind : 'gap',
          note: str(m['note']),
          supplies: Array.isArray(m['supply'])
            ? m['supply'].filter((s): s is string => typeof s === 'string' && s !== '')
            : [],
        }]
      })
    : []

  const rawSections = obj(material['playbooks'])['sections']
  const manuals: CapabilityManual[] = Array.isArray(rawSections)
    ? rawSections.flatMap((section): CapabilityManual[] => {
        const heading = str(obj(section)['heading'])
        const match = PLAYBOOK_HEADING.exec(heading)
        if (match === null) return []
        return [{ id: match[1] ?? '', label: (match[2] ?? '').trim() }]
      })
    : []

  const planeName = str(plane['name'])
  if (planeName === '') return undefined
  return {
    planeId: str(plane['id']),
    planeName,
    domainId: str(domain['id']),
    domainName: str(domain['name']),
    agt: str(record['id']),
    alias: str(record['alias']),
    title: str(record['title']),
    artifact: str(record['artifact']),
    groups,
    manuals,
  }
}

/**
 * Project one role preset into what the hero entry renders.
 *
 * Returns `undefined` for anything that is not a role preset, an id that
 * escapes the preset root, or a preset whose manifest carries no `x_lute`
 * section — the three cases where "this preset has no role capabilities" is
 * the true answer rather than a degradation.
 * @param presetRoot - preset root directory (one subdirectory per preset).
 * @param skillsRoot - installed-skills root.
 * @param presetId - preset id, e.g. `agt-027`.
 * @returns the projection, or undefined.
 */
export function readCapabilities(
  presetRoot: string,
  skillsRoot: string,
  presetId: string,
): PresetCapabilities | undefined {
  // The id becomes a path segment, so this check is the containment boundary —
  // the same rule and the same regex the roster scan uses (one fact, one home).
  if (!ROLE_PRESET_ID.test(presetId)) return undefined
  const dirPath = join(presetRoot, presetId)
  if (!existsSync(dirPath)) return undefined

  let name = presetId
  const displayPath = join(dirPath, 'preset.yml')
  if (existsSync(displayPath)) {
    try {
      for (const line of readFileSync(displayPath, 'utf8').split('\n')) {
        const colon = line.indexOf(':')
        if (colon <= 0 || line.startsWith(' ') || line.startsWith('\t')) continue
        if (line.slice(0, colon).trim() !== 'name') continue
        const value = scalar(line.slice(colon + 1))
        if (value !== undefined && value !== '') name = value
        break
      }
    } catch {
      // preset.yml is display metadata; the directory name still identifies it.
    }
  }

  const manifestPath = join(dirPath, 'manifest.json')
  if (!existsSync(manifestPath)) return undefined
  let projection: ReturnType<typeof readManifest>
  try {
    projection = readManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
  } catch {
    return undefined
  }
  if (projection === undefined) return undefined

  const cache = new Map<string, SkillLabel>()
  const groups: CapabilityGroup[] = projection.groups.map((group) => ({
    name: group.name,
    kind: group.kind,
    note: group.note,
    supplies: group.supplies.map((id) => {
      const { label, summary } = readSkillLabel(skillsRoot, id, cache)
      return { id, label, summary }
    }),
  }))

  const degraded: string[] = []
  if (groups.length === 0) degraded.push('manifest 里没有业务技能映射')
  if (projection.manuals.length === 0) degraded.push('manifest 里没有场景手册小节')

  return {
    preset: presetId,
    agt: projection.agt,
    alias: projection.alias,
    title: projection.title,
    name,
    planeId: projection.planeId,
    planeName: projection.planeName,
    domainId: projection.domainId,
    domainName: projection.domainName,
    artifact: projection.artifact,
    groups,
    manuals: projection.manuals,
    ...(degraded.length === 0 ? {} : { degraded: degraded.join('；') }),
  }
}
