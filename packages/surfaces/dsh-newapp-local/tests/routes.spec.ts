/**
 * Route contract: trust fence, method guard, and payload shape for
 * /api/dsh-newapp.
 *
 * The fence assertions matter even though this route serves no private data:
 * the payload names the sibling routes the launcher reads and is answered
 * WITHOUT the harness's launch-token cookie (that is the whole point of an
 * exact route — see src/routes.ts). Anything reachable that way has to be
 * loopback-only by construction, not by convention.
 *
 * The fake request mirrors the fields `isLoopbackRequest` reads (socket
 * address, Host header, same-origin markers) rather than mocking the fence
 * itself, so a fence regression reds these tests.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { COMPOSED_SOURCES, makeRoutes, ROUTES } from '../src/routes.ts'

/** Fake request carrying exactly what the loopback fence inspects. */
function fakeRequest(overrides: {
  method?: string
  remoteAddress?: string
  host?: string
  url?: string
  headers?: Record<string, string>
} = {}): IncomingMessage {
  return {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? ROUTES.health,
    headers: { host: overrides.host ?? 'localhost:3080', ...(overrides.headers ?? {}) },
    socket: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' },
  } as unknown as IncomingMessage
}

/** Fake response recording status + body. */
function fakeResponse(): { res: ServerResponse; status: () => number; body: () => string } {
  let status = 0
  let text = ''
  const res = {
    writeHead(code: number) { status = code; return this },
    end(chunk?: string) { if (typeof chunk === 'string') text = chunk; return this },
  } as unknown as ServerResponse
  return { res, status: () => status, body: () => text }
}

/** Routes over a context with no pairing service (loopback-only, the default). */
function routesWith(ctx: unknown = {}, version = '0.1.0'): ReturnType<typeof makeRoutes> {
  return makeRoutes(ctx as Context, { version, logger: { warn: vi.fn() } })
}

/** Invoke one route by its declared path. */
function call(
  request: IncomingMessage,
  ctx: unknown = {},
  path: string = ROUTES.health,
): { status: number; body: Record<string, unknown> } {
  const route = routesWith(ctx).find((r) => r.path === path)!
  if (route === undefined) throw new Error(`no route at ${path}`)
  const { res, status, body } = fakeResponse()
  ;(route.handler as (req: IncomingMessage, res: ServerResponse) => void)(request, res)
  return { status: status(), body: JSON.parse(body() === '' ? '{}' : body()) as Record<string, unknown> }
}

describe('route shape', () => {
  it('registers an exact route for every declared path, and nothing else', () => {
    const routes = routesWith()
    // The count is not the point — completeness and exactness are. A prefix
    // route here would swallow the /api guard's 401 load detector (see routes.ts).
    expect(routes.map((r) => r.path).sort()).toEqual(Object.values(ROUTES).sort())
    for (const route of routes) expect(route.kind).toBe('exact')
  })
})

describe('trust fence', () => {
  it('admits a loopback request', () => {
    expect(call(fakeRequest()).status).toBe(200)
  })

  it('admits a loopback request carrying a same-origin Origin', () => {
    const request = fakeRequest({ headers: { origin: 'http://localhost:3080', 'sec-fetch-site': 'same-origin' } })
    expect(call(request).status).toBe(200)
  })

  it('rejects a request from a non-loopback socket', () => {
    const result = call(fakeRequest({ remoteAddress: '192.168.1.44' }))
    expect(result.status).toBe(403)
    expect(result.body['error']).toContain('loopback-only')
  })

  it('guards the products route with the same fence as health', () => {
    // A second route is a second way in. It gets the same three checks, and the
    // probe asserts them by path, not by "some route rejected it".
    expect(call(fakeRequest({ remoteAddress: '192.168.1.44' }), {}, ROUTES.products).status).toBe(403)
    expect(call(fakeRequest({ host: 'evil.example' }), {}, ROUTES.products).status).toBe(403)
    expect(
      call(fakeRequest({ headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } }), {}, ROUTES.products).status,
    ).toBe(403)
    expect(call(fakeRequest({ method: 'POST' }), {}, ROUTES.products).status).toBe(405)
  })

  it('scans nothing when no root is configured, and says so', () => {
    const result = call(fakeRequest(), {}, ROUTES.products)
    expect(result.status).toBe(200)
    expect(result.body['ok']).toBe(true)
    // The safe default is a report, not a bare 200: scannedRoots: [] is how a
    // caller tells "nothing configured" from "configured but empty".
    expect(result.body['scannedRoots']).toEqual([])
    expect(result.body['cards']).toEqual([])
    expect(result.body['declaredCount']).toBe(0)
    expect(String(result.body['owns'])).toContain('product.json')
  })

  it('scans exactly the configured roots and reports them back', () => {
    const root = mkdtempSync(join(tmpdir(), 'newapp-route-'))
    try {
      mkdirSync(join(root, 'KOL-Hunter'), { recursive: true })
      writeFileSync(
        join(root, 'KOL-Hunter', 'product.json'),
        JSON.stringify({ schemaVersion: 1, products: [{ id: 'kol-hunter', name: 'K', preset: 'agt-033' }] }),
        'utf8',
      )
      const routes = makeRoutes({} as Context, {
        version: '0.1.0',
        productRoots: [root],
        logger: { warn: vi.fn() },
      })
      const route = routes.find((r) => r.path === ROUTES.products)!
      const { res, status, body } = fakeResponse()
      ;(route.handler as (req: IncomingMessage, res: ServerResponse) => void)(fakeRequest(), res)
      expect(status()).toBe(200)
      const payload = JSON.parse(body()) as Record<string, unknown>
      expect(payload['scannedRoots']).toEqual([root])
      expect(payload['declaredCount']).toBe(1)
      const card = (payload['cards'] as Array<Record<string, unknown>>)[0]!
      expect(card['label']).toBe('KOL-Hunter')
      expect(payload['undeclaredCount']).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a cross-site browser request even from loopback (DNS-rebinding shape)', () => {
    // The socket is loopback and the Host is loopback, but the browser tells us
    // the request was initiated by another site. This is the case a Host check
    // alone cannot catch.
    const request = fakeRequest({ headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } })
    expect(call(request).status).toBe(403)
  })

  it('rejects a foreign Host header', () => {
    expect(call(fakeRequest({ host: 'evil.example' })).status).toBe(403)
  })

  it('rejects a non-loopback client unless the pairing service vouches for it', () => {
    const paired: Record<string, unknown> = {}
    paired['remoteWebUiPairing'] = { isPairedDevice: () => true }
    expect(call(fakeRequest({ remoteAddress: '192.168.1.44' }), paired).status).toBe(200)
  })

  it('does not treat a pairing service that says no as an allow path', () => {
    const paired: Record<string, unknown> = {}
    paired['remoteWebUiPairing'] = { isPairedDevice: () => false }
    expect(call(fakeRequest({ remoteAddress: '192.168.1.44' }), paired).status).toBe(403)
  })

  it('denies — rather than throwing — when the context will not hand over an un-injected service', () => {
    // **This is the shape a real cordis context has**, and it is the shape every
    // other case in this file does not have: the doubles above are plain objects
    // whose `remoteWebUiPairing` is simply absent, while cordis answers a read of
    // an un-injected service by *throwing* `cannot get property "…" without
    // inject`. So the fence's fallback lookup threw on every non-loopback
    // request, before it could return a verdict.
    //
    // Measured on the running app before the fix: `/api/dsh-newapp/health`,
    // `/api/dsh-role-matrix/list` and `/api/dsh-skill-explorer/health` all
    // answered **400 with an empty body** to a cross-site request — the
    // webserver catching the throw. Denial held (400 is not 200), which is why
    // nothing noticed; what did not hold is that the verdict came from the
    // fence, and any caller that swallowed the throw instead would have turned
    // it into a bypass.
    const cordisLike = {
      get(name: string): unknown {
        if (name === 'remoteWebUiPairing') throw new Error(`cannot get property "${name}" without inject`)
        return undefined
      },
      get remoteWebUiPairing(): never {
        throw new Error('cannot get property "remoteWebUiPairing" without inject')
      },
    }
    const result = call(fakeRequest({ remoteAddress: '192.168.1.44' }), cordisLike)
    expect(result.status).toBe(403)
    expect(result.body['error']).toContain('loopback-only')
    // …and the loopback path still short-circuits before any of that.
    expect(call(fakeRequest(), cordisLike).status).toBe(200)
  })

  it('denies when a pairing service throws instead of answering', () => {
    // A broken pairing implementation is not an allow path either.
    const hostile: Record<string, unknown> = {}
    hostile['remoteWebUiPairing'] = { isPairedDevice: () => { throw new Error('pairing exploded') } }
    expect(call(fakeRequest({ remoteAddress: '192.168.1.44' }), hostile).status).toBe(403)
  })

  it('checks the fence before the method, so a rejected caller learns nothing', () => {
    const result = call(fakeRequest({ method: 'POST', remoteAddress: '192.168.1.44' }))
    expect(result.status).toBe(403)
  })
})

describe('method guard', () => {
  it('rejects a non-GET method from an allowed caller', () => {
    const result = call(fakeRequest({ method: 'POST' }))
    expect(result.status).toBe(405)
    expect(result.body['error']).toContain('POST')
  })
})

describe('payload', () => {
  it('reports identity, version, and the load-detector explanation', () => {
    const result = call(fakeRequest())
    expect(result.body).toMatchObject({ ok: true, plugin: 'newapp-local', version: '0.1.0' })
    // The detector string is what makes a 401-vs-200 probe legible to whoever
    // runs it next; without it the status code is an unexplained difference.
    expect(String(result.body['detector'])).toContain('401')
  })

  it('publishes the composition contract so an operator can read it without the bundle', () => {
    const result = call(fakeRequest())
    expect(result.body['composes']).toEqual(COMPOSED_SOURCES.map((source) => ({ ...source })))
    // Each source names its owner — the fact that makes a degraded drawer
    // actionable ("install this plugin") rather than merely informative.
    for (const source of result.body['composes'] as Array<Record<string, unknown>>) {
      expect(typeof source['owner']).toBe('string')
      expect(typeof source['owns']).toBe('string')
    }
  })

  it('reports an unexpected failure as 500 with the message rather than throwing out of the handler', () => {
    // A handler that throws propagates into the harness's request path. The
    // drawer's probe would then see a socket error instead of a status code,
    // and — worse — a plugin must never be able to take the webserver's request
    // handling down. A version value JSON cannot serialise stands in for any
    // unexpected failure while assembling the body.
    const warn = vi.fn()
    const route = makeRoutes({} as Context, {
      version: 10n as unknown as string,
      logger: { warn },
    }).find((r) => r.path === ROUTES.health)!
    const { res, status, body } = fakeResponse()
    expect(() => {
      ;(route.handler as (req: IncomingMessage, res: ServerResponse) => void)(fakeRequest(), res)
    }).not.toThrow()
    expect(status()).toBe(500)
    expect(body()).toContain('BigInt')
    expect(warn).toHaveBeenCalled()
  })
})
