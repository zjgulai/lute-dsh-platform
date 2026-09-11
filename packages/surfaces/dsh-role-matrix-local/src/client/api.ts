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
} as const

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
}
