/**
 * Route contract: trust fence, method guard, and payload shape for
 * /api/dsh-role-matrix.
 *
 * The fence assertions matter more than the payload ones — the matrix exposes
 * each role's collaboration and skill inventory, so an unpaired LAN client must
 * not reach it. The fake request mirrors the fields `isLoopbackRequest` reads
 * (socket address, Host header, same-origin markers) rather than mocking the
 * fence itself, so a fence regression reds these tests.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { makeRoutes, ROUTES } from '../src/routes.ts'

const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/**
 * A preset root holding one complete role plus its installed skills, so the
 * matrix payload and the capability projection are both non-empty.
 *
 * The skill body is written the way a real one is: `title` names the skill,
 * `user_summary` is the author's one-liner, and one skill deliberately carries
 * **no** frontmatter at all — the id-as-label fallback is the path most likely
 * to rot unnoticed, so a fixture that always supplies a title cannot guard it.
 */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'role-matrix-routes-'))
  roots.push(root)
  const dir = join(root, 'agt-007')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'preset.yml'), "name: '望野 · 市场竞争与机会研究'\ndescription: 'd'\norder: 2102\n", 'utf8')
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    x_lute: {
      plane: { id: 'PLN-OPS', name: '业务运营', purpose: '' },
      domain: { id: 'DOM-02', name: '产品与创新' },
      lifecycle: { status: 'draft', production_authorized: false },
      squad: { eligible_flows: [] },
      skills: {
        subset: [],
        gaps: [],
        material_skill_names: ['市场扫描'],
        mapping: [{
          name: '市场扫描',
          kind: 'partial',
          note: '只有品类级扫描，无竞品级',
          supply: ['market-scanner', 'untitled-skill'],
        }],
      },
    },
    material: {
      role_catalog: { record: { id: 'AGT-007', alias: '望野', title: 't', artifact: 'a', scenarios: [], collaborates_with: [], playbooks: [] } },
      playbooks: { sections: [{ heading: '## PB-002 新品需求到商业验证', body: '…' }] },
    },
  }), 'utf8')

  const skills = join(root, 'skills')
  mkdirSync(join(skills, 'market-scanner'), { recursive: true })
  writeFileSync(join(skills, 'market-scanner', 'SKILL.md'), [
    '---',
    'name: market-scanner',
    'title: "市场扫描器"',
    'description: 扫描目标品类的市场规模与增速，输出机会清单',
    'user_summary: 品类级市场规模与增速扫描',
    '---',
    '# body',
  ].join('\n'), 'utf8')
  // No SKILL.md at all: the reader must answer with the id rather than throw.
  mkdirSync(join(skills, 'untitled-skill'), { recursive: true })
  return root
}

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
    url: overrides.url ?? ROUTES.list,
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

/** Context whose fence falls back to loopback-only (no pairing service). */
function fakeContext(): Context {
  return { get: () => undefined } as unknown as Context
}

/** Build the routes over a fixture root. */
function routesFor(root: string, skills = join(root, 'skills')): WebRoute[] {
  return makeRoutes(fakeContext(), {
    presetRoot: () => root,
    skillsRoot: () => skills,
    logger: { warn: () => {} },
  })
}

/** Look up one route by path. */
function routeAt(routes: WebRoute[], path: string): WebRoute {
  const route = routes.find((candidate) => candidate.path === path)
  if (route === undefined) throw new Error(`route not found: ${path}`)
  return route
}

describe('route family', () => {
  it('declares the documented paths', () => {
    const routes = routesFor(fixtureRoot())
    expect(routes.map((route) => route.path).sort())
      .toEqual([ROUTES.capabilities, ROUTES.health, ROUTES.list].sort())
    expect(ROUTES.list).toBe('/api/dsh-role-matrix/list')
    expect(ROUTES.capabilities).toBe('/api/dsh-role-matrix/capabilities')
  })

  it('serves the grouped matrix to a loopback GET', async () => {
    const routes = routesFor(fixtureRoot())
    const { res, status, body } = fakeResponse()
    await routeAt(routes, ROUTES.list).handler(fakeRequest(), res)

    expect(status()).toBe(200)
    const payload = JSON.parse(body()) as { totals: { roles: number; planes: number }; planes: Array<{ id: string }> }
    expect(payload.totals.roles).toBe(1)
    expect(payload.totals.planes).toBe(1)
    expect(payload.planes[0]!.id).toBe('PLN-OPS')
  })

  it('refuses a non-loopback socket with 403 and never runs the collector', async () => {
    const collect = vi.fn()
    const routes = makeRoutes(fakeContext(), {
      presetRoot: () => fixtureRoot(),
      skillsRoot: () => '/nonexistent',
      logger: { warn: () => {} },
      collect: collect as never,
    })
    const { res, status, body } = fakeResponse()
    await routeAt(routes, ROUTES.list).handler(fakeRequest({ remoteAddress: '203.0.113.7' }), res)

    expect(status()).toBe(403)
    expect(JSON.parse(body())).toEqual({ error: 'forbidden: loopback-only' })
    expect(collect).not.toHaveBeenCalled()
  })

  it('refuses a loopback socket answering for a non-loopback Host header', async () => {
    const routes = routesFor(fixtureRoot())
    const { res, status } = fakeResponse()
    await routeAt(routes, ROUTES.list).handler(fakeRequest({ host: 'example.com' }), res)
    expect(status()).toBe(403)
  })

  it('refuses a cross-site browser request', async () => {
    const routes = routesFor(fixtureRoot())
    const { res, status } = fakeResponse()
    await routeAt(routes, ROUTES.list).handler(fakeRequest({ headers: { 'sec-fetch-site': 'cross-site' } }), res)
    expect(status()).toBe(403)
  })

  it('rejects a non-GET method with 405', async () => {
    const routes = routesFor(fixtureRoot())
    const { res, status } = routeAndCall(routes, ROUTES.list, fakeRequest({ method: 'POST' }))
    expect(status()).toBe(405)
  })

  it('reports health with the root, role count and degraded count', async () => {
    const routes = routesFor(fixtureRoot())
    const { res, status, body } = fakeResponse()
    await routeAt(routes, ROUTES.health).handler(fakeRequest({ url: ROUTES.health }), res)

    expect(status()).toBe(200)
    const payload = JSON.parse(body()) as { ok: boolean; plugin: string; roles: number; degraded: number; root: string }
    expect(payload.ok).toBe(true)
    expect(payload.plugin).toBe('role-matrix-local')
    expect(payload.roles).toBe(1)
    expect(payload.degraded).toBe(0)
    expect(payload.root).toContain('role-matrix-routes-')
  })

  it('answers 500 with the error text when the collector throws', async () => {
    const routes = makeRoutes(fakeContext(), {
      presetRoot: () => '/nonexistent',
      skillsRoot: () => '/nonexistent',
      logger: { warn: () => {} },
      collect: () => { throw new Error('scan exploded') },
    })
    const { res, status, body } = fakeResponse()
    await routeAt(routes, ROUTES.list).handler(fakeRequest(), res)
    expect(status()).toBe(500)
    expect(JSON.parse(body())).toEqual({ error: 'scan exploded' })
  })
})

describe('capabilities route', () => {
  const URL_FOR = `${ROUTES.capabilities}?preset=agt-007`

  it('serves one role preset\'s capabilities with skill labels resolved', async () => {
    const routes = routesFor(fixtureRoot())
    const { res, status, body } = fakeResponse()
    await routeAt(routes, ROUTES.capabilities).handler(fakeRequest({ url: URL_FOR }), res)

    expect(status()).toBe(200)
    const payload = JSON.parse(body()) as {
      ok: boolean
      capabilities: {
        preset: string
        name: string
        planeName: string
        domainName: string
        groups: Array<{ name: string; kind: string; note: string; supplies: Array<{ id: string; label: string; summary: string }> }>
        manuals: Array<{ id: string; label: string }>
      }
    }
    expect(payload.ok).toBe(true)
    expect(payload.capabilities.preset).toBe('agt-007')
    expect(payload.capabilities.name).toBe('望野 · 市场竞争与机会研究')
    expect(payload.capabilities.planeName).toBe('业务运营')
    expect(payload.capabilities.domainName).toBe('产品与创新')
    expect(payload.capabilities.groups).toHaveLength(1)
    expect(payload.capabilities.groups[0]!.kind).toBe('partial')
    expect(payload.capabilities.groups[0]!.note).toBe('只有品类级扫描，无竞品级')
    expect(payload.capabilities.groups[0]!.supplies[0]).toEqual({
      id: 'market-scanner',
      label: '市场扫描器',
      summary: '品类级市场规模与增速扫描',
    })
    // No SKILL.md: the id is the honest label, and nothing throws.
    expect(payload.capabilities.groups[0]!.supplies[1]).toEqual({
      id: 'untitled-skill',
      label: 'untitled-skill',
      summary: '',
    })
    expect(payload.capabilities.manuals).toEqual([{ id: 'PB-002', label: '新品需求到商业验证' }])
  })

  it('rejects a missing preset parameter with 400', async () => {
    const routes = routesFor(fixtureRoot())
    const { res, status, body } = fakeResponse()
    await routeAt(routes, ROUTES.capabilities).handler(fakeRequest({ url: ROUTES.capabilities }), res)
    expect(status()).toBe(400)
    expect(JSON.parse(body())).toEqual({ error: 'missing query parameter: preset' })
  })

  it('rejects a non-role preset id with 400 before touching the filesystem', async () => {
    const capabilities = vi.fn()
    const routes = makeRoutes(fakeContext(), {
      presetRoot: () => '/nonexistent',
      skillsRoot: () => '/nonexistent',
      logger: { warn: () => {} },
      capabilities: capabilities as never,
    })
    const { res, status, body } = fakeResponse()
    await routeAt(routes, ROUTES.capabilities)
      .handler(fakeRequest({ url: `${ROUTES.capabilities}?preset=cordis` }), res)
    expect(status()).toBe(400)
    expect(JSON.parse(body())).toEqual({ error: 'not a role preset id: cordis' })
    expect(capabilities).not.toHaveBeenCalled()
  })

  it('rejects a traversal-shaped id with 400', async () => {
    const routes = routesFor(fixtureRoot())
    const { res, status } = fakeResponse()
    await routeAt(routes, ROUTES.capabilities)
      .handler(fakeRequest({ url: `${ROUTES.capabilities}?preset=${encodeURIComponent('agt-007/../agt-008')}` }), res)
    expect(status()).toBe(400)
  })

  it('answers 404 for a role preset that is not installed', async () => {
    const routes = routesFor(fixtureRoot())
    const { res, status, body } = fakeResponse()
    await routeAt(routes, ROUTES.capabilities)
      .handler(fakeRequest({ url: `${ROUTES.capabilities}?preset=agt-050` }), res)
    expect(status()).toBe(404)
    expect(JSON.parse(body())).toEqual({ error: 'role preset not installed: agt-050' })
  })

  it('refuses a non-loopback socket with 403 and never reads the preset', async () => {
    const capabilities = vi.fn()
    const routes = makeRoutes(fakeContext(), {
      presetRoot: () => fixtureRoot(),
      skillsRoot: () => '/nonexistent',
      logger: { warn: () => {} },
      capabilities: capabilities as never,
    })
    const { res, status, body } = fakeResponse()
    await routeAt(routes, ROUTES.capabilities)
      .handler(fakeRequest({ url: URL_FOR, remoteAddress: '203.0.113.7' }), res)
    expect(status()).toBe(403)
    expect(JSON.parse(body())).toEqual({ error: 'forbidden: loopback-only' })
    expect(capabilities).not.toHaveBeenCalled()
  })

  it('rejects a non-GET method with 405', async () => {
    const routes = routesFor(fixtureRoot())
    const { status } = routeAndCall(routes, ROUTES.capabilities, fakeRequest({ url: URL_FOR, method: 'POST' }))
    expect(status()).toBe(405)
  })
})

/** Call a route and return the recorded response (sync wrapper for the 405 path). */
function routeAndCall(routes: WebRoute[], path: string, req: IncomingMessage): { res: ServerResponse; status: () => number } {
  const captured = fakeResponse()
  void routeAt(routes, path).handler(req, captured.res)
  return captured
}
