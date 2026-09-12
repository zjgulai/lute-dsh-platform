/**
 * Role matrix API client (browser half). Talks to the host route family over
 * same-origin fetch; the host enforces the trust fence on its side.
 *
 * The card shape duplicates the host's `RoleCard` structurally rather than
 * importing it: the client bundle must not pull the host half (node builtins)
 * into the browser, and a type-only import across the half boundary would still
 * drag the module into the build graph.
 */

/** Route paths mirrored from the host (src/routes.ts ROUTES). */
const API = {
  list: '/api/dsh-role-matrix/list',
  capabilities: '/api/dsh-role-matrix/capabilities',
} as const

/** How well the platform covers one material business skill. */
export type CapabilityKind = 'direct' | 'partial' | 'gap'

/** One platform skill serving a business skill. */
export interface CapabilitySupply {
  id: string
  /** Display name from the skill's own `SKILL.md`; the id when it declares none. */
  label: string
  /** One-line summary; empty when the skill declares none. */
  summary: string
}

/** One business skill of the role, with the platform supply behind it. */
export interface CapabilityGroup {
  name: string
  kind: CapabilityKind
  /** Boundary note, verbatim from the mapping; empty when it declares none. */
  note: string
  supplies: CapabilitySupply[]
}

/** One scene manual the role participates in. */
export interface CapabilityManual {
  id: string
  label: string
}

/** One role preset's capabilities, as served by the host. */
export interface PresetCapabilities {
  preset: string
  agt: string
  alias: string
  title: string
  name: string
  planeId: string
  planeName: string
  domainId: string
  domainName: string
  artifact: string
  groups: CapabilityGroup[]
  manuals: CapabilityManual[]
  degraded?: string
}

/**
 * Outcome of a capability read.
 *
 * **Missing** is a first-class answer, not a failure: asking about a preset
 * that is not a role preset — or is not installed — is the ordinary situation on
 * every ordinary session, and it means "render nothing". Folding it into the
 * failure channel would make the common path look like a fault, and a fault look
 * like the common path.
 */
export type CapabilitiesResult =
  | { ok: true; value: PresetCapabilities }
  | { ok: false; missing: true; reason: string }
  | { ok: false; missing: false; reason: string }

/** One role card as served by the host. */
export interface RoleCard {
  id: string
  agt: string
  alias: string
  title: string
  name: string
  description: string
  /** Inline SVG avatar (data URI) from preset.yml; empty when the preset declares none. */
  icon: string
  order?: number
  artifact: string
  metrics: string
  planeId: string
  planeName: string
  domainId: string
  domainName: string
  lifecycleStatus: string
  productionAuthorized: boolean
  subset: string[]
  gaps: string[]
  materialSkillNames: string[]
  flows: string[]
  scenarios: string[]
  collaboratesWith: string[]
  playbooks: string[]
  degraded?: string
}

/** One responsibility domain inside a plane. */
export interface DomainGroup {
  id: string
  name: string
  roles: RoleCard[]
}

/** One organization plane. */
export interface PlaneGroup {
  id: string
  name: string
  purpose: string
  roles: number
  domains: DomainGroup[]
}

/** Whole-matrix payload served by the host. */
export interface MatrixPayload {
  root: string
  scannedAt: string
  planes: PlaneGroup[]
  totals: { roles: number; planes: number; domains: number; degraded: number }
}

/** One thrown API error with the host-provided message. */
export class MatrixApiError extends Error {
  /**
   * @param message - host-provided or transport error text.
   * @param status - HTTP status when the host answered.
   */
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'MatrixApiError'
  }
}

/** Role matrix API client. */
export class MatrixApi {
  /**
   * Read the whole grouped matrix.
   * @returns the payload served by the host.
   * @throws {MatrixApiError} on a non-2xx answer or a transport failure.
   */
  async list(): Promise<MatrixPayload> {
    let response: Response
    try {
      response = await fetch(API.list, { headers: { accept: 'application/json' } })
    } catch (error) {
      throw new MatrixApiError(error instanceof Error ? error.message : String(error))
    }
    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try {
        const body = (await response.json()) as { error?: unknown }
        if (typeof body.error === 'string' && body.error !== '') detail = body.error
      } catch {
        // Non-JSON error body: keep the status text.
      }
      throw new MatrixApiError(detail, response.status)
    }
    return (await response.json()) as MatrixPayload
  }

  /**
   * Read one preset's role capabilities.
   *
   * Never throws: the caller is a surface that must decide *whether to render*,
   * and every outcome here has a defensible answer (render, render nothing, or
   * report). A 404 is the host saying "that is not an installed role preset",
   * which is the normal result for application presets and for a role that was
   * deleted since the session started.
   * @param preset - preset id, e.g. `agt-027`.
   * @returns the projection, or why it is unavailable.
   */
  async capabilities(preset: string): Promise<CapabilitiesResult> {
    const url = `${API.capabilities}?preset=${encodeURIComponent(preset)}`
    let response: Response
    try {
      response = await fetch(url, { headers: { accept: 'application/json' } })
    } catch (error) {
      return { ok: false, missing: false, reason: error instanceof Error ? error.message : String(error) }
    }
    if (response.status === 404) {
      return { ok: false, missing: true, reason: `未安装的岗位 preset：${preset}` }
    }
    if (response.status === 400) {
      // Not a role preset id. The caller should not have asked; report it as
      // missing so a non-role session stays quiet, and let the reason carry the
      // distinction for anyone reading the console.
      return { ok: false, missing: true, reason: `不是岗位 preset：${preset}` }
    }
    if (!response.ok) {
      return { ok: false, missing: false, reason: `${API.capabilities} 回答 HTTP ${response.status}` }
    }
    try {
      const payload = (await response.json()) as { ok?: unknown; capabilities?: unknown }
      const value = payload.capabilities
      if (payload.ok !== true || value === null || typeof value !== 'object') {
        return { ok: false, missing: false, reason: '响应里没有 capabilities' }
      }
      return { ok: true, value: value as PresetCapabilities }
    } catch (error) {
      return { ok: false, missing: false, reason: `响应不是 JSON：${error instanceof Error ? error.message : String(error)}` }
    }
  }
}
