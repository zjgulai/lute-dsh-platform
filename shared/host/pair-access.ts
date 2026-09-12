/**
 * Pairing trust fence shared by plugins that expose host routes: loopback
 * (the desktop) always passes; a live paired-device cookie is an additional
 * allow path when remote-web-ui is loaded. The consuming plugin never
 * depends on that plugin — without the service the fence stays
 * loopback-only.
 *
 * Per-package wrappers (access.ts) call this with their own name so each
 * plugin keeps a self-describing export; the security decision lives only
 * here.
 *
 * ## Why the pairing lookup must not be able to throw (measured, 2026-09-12)
 *
 * `ctx.remoteWebUiPairing` is a **property read on the cordis context proxy**,
 * and cordis throws `cannot get property "…" without inject` for any service the
 * fiber did not declare. This module deliberately does not inject it (the whole
 * point is that the plugin works without remote-web-ui), so on every request
 * that is *not* loopback the read threw — inside the fence, before the verdict.
 *
 * The route's `403 forbidden: loopback-only` branch was therefore unreachable in
 * production: the webserver caught the exception and answered **400 with an
 * empty body**, and logged an error per request. Denial still held (400 is not
 * 200), which is exactly what made it invisible — but the fence was denying by
 * accident rather than by decision, and any future handler that swallows a throw
 * turns the accident into a bypass. Measured live on three plugins
 * (`/api/dsh-role-matrix/list`, `/api/dsh-newapp/health`,
 * `/api/dsh-skill-explorer/health`): cross-site request → 400, not 403.
 *
 * So: the lookup is best-effort, and **failure to find the pairing service means
 * deny** — the same verdict as "the service exists and says no".
 */
import type { IncomingMessage } from 'node:http'
import { isLoopbackRequest } from './loopback.ts'

/** Structural pairing lookup (no package dependency on remote-web-ui). */
interface PairingAccess {
  isPairedDevice(request: IncomingMessage): boolean
}

/**
 * Structural host-context shape: shared sources carry no @deepseek-ai
 * dependency (the shared package must typecheck standalone), so the fence
 * reads only the two members it needs; cordis Context satisfies this.
 * ctx.get is optional on the test harness; production Context always has it.
 */
interface LookupCtx {
  get?(name: string, strict?: boolean): unknown
  remoteWebUiPairing?: PairingAccess
}

/**
 * Find the pairing service, or `undefined` — never a throw.
 *
 * Two lookups because the two shells differ: a cordis context exposes services
 * through the proxy (`ctx.remoteWebUiPairing`) and a plain test double through a
 * property. Both are attempted, and both are wrapped, because the failure mode
 * being guarded here is a *fence that throws*.
 * @param ctx - host context.
 * @returns the pairing service when one is reachable and usable.
 */
function findPairing(ctx: LookupCtx): PairingAccess | undefined {
  try {
    const fromGet = typeof ctx.get === 'function' ? ctx.get('remoteWebUiPairing', false) : undefined
    if (isPairingAccess(fromGet)) return fromGet
  } catch {
    // A getter that refuses to be read is not a reason to admit the request.
  }
  try {
    const fromProperty = ctx.remoteWebUiPairing
    if (isPairingAccess(fromProperty)) return fromProperty
  } catch {
    // cordis raises `cannot get property "…" without inject` here; see the
    // module doc for the measurement.
  }
  return undefined
}

/**
 * Whether this request may enter the plugin's host routes.
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param request - the incoming HTTP request.
 * @returns true for loopback, or a live paired-device cookie.
 */
export function isPairedOrLoopbackAllowed(ctx: LookupCtx, request: IncomingMessage): boolean {
  if (isLoopbackRequest(request)) return true
  const pairing = findPairing(ctx)
  if (pairing === undefined) return false
  try {
    return pairing.isPairedDevice(request) === true
  } catch {
    return false
  }
}

function isPairingAccess(value: unknown): value is PairingAccess {
  return value !== undefined
    && value !== null
    && typeof (value as PairingAccess).isPairedDevice === 'function'
}
