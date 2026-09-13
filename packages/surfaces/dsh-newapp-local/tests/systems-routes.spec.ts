/**
 * The systems routes and the OS opener — the decisions, asserted without
 * launching anything.
 *
 * Two properties carry the whole design, and both fail silently if nobody
 * checks them:
 *
 *  1. **`open-system` cannot be turned into a URL opener.** Its input vocabulary
 *     is the catalog's slugs; an unknown key is refused, and an address is never
 *     accepted from the client. If that ever loosens, the app grows back the
 *     "any link can launch a browser" surface that P0-6v2 deliberately removed.
 *  2. **The argv handed to the OS is built, not interpolated.** A URL that
 *     reaches a shell instead of an argv slot is a command-injection hole with a
 *     friendly name. The opener is exercised through an injected runner, so all
 *     three platforms' argv are asserted by reading them, never by spawning.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { makeRoutes, ROUTES } from '../src/routes.ts'
import { hrefForSlug, knownSlugs, loadSystems } from '../src/systems.ts'
import { openerCommand, openExternalUrl } from '../src/open-external.ts'

/** Fake request carrying exactly what the loopback fence inspects. */
function fakeRequest(overrides: { method?: string; body?: unknown } = {}): IncomingMessage {
  const body = overrides.body === undefined ? '' : JSON.stringify(overrides.body)
  const req = {
    method: overrides.method ?? 'POST',
    url: ROUTES.openSystem,
    headers: { host: 'localhost:3080', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (body !== '') yield Buffer.from(body, 'utf8')
    },
  }
  return req as unknown as IncomingMessage
}

/** Fake response recording status + body. */
function fakeResponse(): { res: ServerResponse; status: () => number; text: () => string } {
  let status = 0
  let text = ''
  const res = {
    writeHead(code: number) {
      status = code
      return this
    },
    end(chunk?: string) {
      if (typeof chunk === 'string') text = chunk
      return this
    },
    destroy() {},
  } as unknown as ServerResponse
  return { res, status: () => status, text: () => text }
}

/** Invoke one route by path, with an optional injected opener. */
async function call(
  request: IncomingMessage,
  path: string,
  deps: { openUrl?: (href: string) => Promise<void> } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const route = makeRoutes({} as Context, {
    version: '0.1.0',
    logger: { warn: vi.fn() },
    ...deps,
  }).find((one) => one.path === path)
  if (route === undefined) throw new Error(`no route at ${path}`)
  const { res, status, text } = fakeResponse()
  ;(route.handler as (req: IncomingMessage, res: ServerResponse) => void)(request, res)
  // The open route answers from an async IIFE; one macrotask is enough for the
  // injected opener (which never touches the network) to settle.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { status: status(), body: JSON.parse(text() === '' ? '{}' : text()) as Record<string, unknown> }
}

describe('GET /api/dsh-newapp/systems', () => {
  it('joins the three catalog files into one payload', () => {
    const payload = loadSystems()
    expect(payload.ok).toBe(true)
    expect(payload.systems.length).toBeGreaterThanOrEqual(31)
    expect(payload.probedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(payload.coverage.systems).toBe(payload.systems.length)
    expect(payload.coverage.rolesTouched).toBeGreaterThan(10)
  })

  it('carries the role assignment for every system, and never invents one', () => {
    for (const system of loadSystems().systems) {
      // Every system must land in a group; an empty primary would drop it into
      // the "unclassified" bucket and quietly shrink the matrix.
      expect(system.primary, system.slug).toMatch(/^AGT-\d{3}$/)
      expect(system.also, system.slug).not.toContain(system.primary)
    }
  })

  it('serves the reachability reading as of a date, not as a live claim', () => {
    const payload = loadSystems()
    const gated = payload.systems.filter((one) => one.loginRequired)
    // The portal's own login-redirecting entries. If this ever becomes 0 the
    // probe stopped detecting them, which is a probe regression, not a fix.
    expect(gated.length).toBeGreaterThan(0)
    for (const system of gated) expect(system.reachable, system.slug).toBe(true)
  })

  it('answers its own route with the open route published, so the client need not guess', async () => {
    const request = fakeRequest({ method: 'GET' })
    const { status, body } = await call(request, ROUTES.systems)
    expect(status).toBe(200)
    expect(body['openRoute']).toBe(ROUTES.openSystem)
  })

  it('refuses a non-GET method', async () => {
    const { status } = await call(fakeRequest({ method: 'POST' }), ROUTES.systems)
    expect(status).toBe(405)
  })

  it('refuses a non-loopback caller before reading anything', async () => {
    const request = {
      method: 'GET',
      url: ROUTES.systems,
      headers: { host: 'evil.example.com' },
      socket: { remoteAddress: '203.0.113.7' },
    } as unknown as IncomingMessage
    const { status } = await call(request, ROUTES.systems)
    expect(status).toBe(403)
  })
})

describe('POST /api/dsh-newapp/open-system', () => {
  it('opens the address the catalog holds for a known slug', async () => {
    const opened: string[] = []
    const { status, body } = await call(fakeRequest({ body: { slug: 'video' } }), ROUTES.openSystem, {
      openUrl: async (href) => {
        opened.push(href)
      },
    })
    expect(status).toBe(200)
    expect(opened).toEqual(['https://video.lute-tlz-dddd.top'])
    expect(body['slug']).toBe('video')
  })

  it('refuses an unknown slug instead of passing it through', async () => {
    // The boundary that keeps this route from being a URL opener. An unknown key
    // must be a 404, not an attempt.
    const opened: string[] = []
    const { status } = await call(
      fakeRequest({ body: { slug: 'https://evil.example.com' } }),
      ROUTES.openSystem,
      { openUrl: async (href) => void opened.push(href) },
    )
    expect(status).toBe(404)
    expect(opened).toEqual([])
  })

  it('refuses a body with no slug, and a body that is not JSON', async () => {
    expect((await call(fakeRequest({ body: {} }), ROUTES.openSystem)).status).toBe(400)
    expect((await call(fakeRequest({ body: 42 }), ROUTES.openSystem)).status).toBe(400)
    expect((await call(fakeRequest({ method: 'GET' }), ROUTES.openSystem)).status).toBe(405)
  })

  it('reports an opener failure as a reason the card can print', async () => {
    // A launch that fails silently is the failure shape this drawer exists to
    // remove, so the message has to reach the caller.
    const { status, body } = await call(fakeRequest({ body: { slug: 'video' } }), ROUTES.openSystem, {
      openUrl: async () => {
        throw new Error('spawn failed')
      },
    })
    expect(status).toBe(502)
    expect(String(body['error'])).toContain('spawn failed')
  })

  it('knows every slug the catalog publishes', () => {
    const slugs = knownSlugs()
    expect(slugs.length).toBe(loadSystems().systems.length)
    for (const slug of slugs) expect(hrefForSlug(slug), slug).toMatch(/^https:\/\//)
    expect(hrefForSlug('nope')).toBeUndefined()
  })
})

describe('openExternalUrl', () => {
  it('builds a shell-free argv per platform', () => {
    // Asserted by reading, not by spawning: no test in this repo should launch a
    // browser, and the thing being checked is the argv, not the launch.
    expect(openerCommand('https://video.lute-tlz-dddd.top', 'darwin')).toEqual({
      command: 'open',
      args: ['https://video.lute-tlz-dddd.top'],
    })
    expect(openerCommand('https://video.lute-tlz-dddd.top', 'linux')).toEqual({
      command: 'xdg-open',
      args: ['https://video.lute-tlz-dddd.top'],
    })
    const windows = openerCommand('https://video.lute-tlz-dddd.top', 'win32')
    expect(windows.command).toBe('rundll32.exe')
    // The address is its own argv element — never concatenated into a command
    // string, which is what keeps a crafted address from being interpreted.
    expect(windows.args).toContain('https://video.lute-tlz-dddd.top')
  })

  it('hands the address to the runner as one argument', async () => {
    const calls: Array<[string, readonly string[]]> = []
    await openExternalUrl('https://kg.lute-tlz-dddd.top', {
      platform: 'darwin',
      run: async (command, args) => void calls.push([command, args]),
    })
    expect(calls).toEqual([['open', ['https://kg.lute-tlz-dddd.top']]])
  })

  it('refuses anything that is not an https portal address', async () => {
    const run = vi.fn(async () => {})
    for (const href of [
      'http://video.lute-tlz-dddd.top',
      'https://evil.example.com',
      'https://lute-tlz-dddd.top.evil.example.com',
      'javascript:alert(1)',
      'file:///etc/passwd',
      '',
    ]) {
      await expect(openExternalUrl(href, { platform: 'darwin', run }), href).rejects.toThrow()
    }
    expect(run).not.toHaveBeenCalled()
  })
})
