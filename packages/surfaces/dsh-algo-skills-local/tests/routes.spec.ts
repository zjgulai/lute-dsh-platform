/**
 * Route contract: trust fence, method guard, the toggle's authority limit, and
 * the client/host route-literal mirror.
 *
 * The fence assertions matter more than the payload ones — the tree discloses
 * this machine's role roster, its whole card inventory and which cards each
 * preset mounts, so an unpaired LAN client must not reach it. The fake request
 * mirrors the fields `isLoopbackRequest` reads (socket address + Host header)
 * rather than mocking the fence itself, so a fence regression reds these tests.
 *
 * The toggle assertions are the other half: this is the plugin's only write, and
 * every path that must NOT reach a file is asserted here rather than trusted.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { makeRoutes, ROUTES as HOST_ROUTES } from '../src/routes.ts'
import { ROUTES as CLIENT_ROUTES } from '../src/client/routes.ts'
import { diskSource } from '../src/tree-source.ts'

const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/**
 * A minimal but complete machine: one role and one card, on disk.
 * @returns the harness home the routes will read.
 */
function fixtureHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'algo-skills-routes-'))
  roots.push(home)
  const role = join(home, '.agent-presets', 'agt-019')
  mkdirSync(role, { recursive: true })
  writeFileSync(join(role, 'manifest.json'), JSON.stringify({
    name: '通途 · 跨境物流与关务',
    description: 'd',
    icon: 'data:image/svg+xml;base64,AA==',
    x_lute: {
      plane: { id: 'PLN-OPS', name: '业务运营', purpose: 'p' },
      domain: { id: 'DOM-03', name: '供应与履约' },
      order: 2206,
      squad: { artifact: '运输方案', metrics: '到货偏差' },
      skills: { material_skill_names: ['物流方案'], subset: ['p2s-demo'] },
    },
  }), 'utf8')
  const skills = [
    join(home, 'skills', 'p2s-demo'),
    // 合法 kebab、但不是本页承载的 p2s- 卡：切换路由必须拒绝它
    join(home, 'skills', 'handwritten-skill'),
  ]
  for (const dir of skills) {
    mkdirSync(dir, { recursive: true })
    const name = dir.split('/').pop() as string
    writeFileSync(join(dir, 'SKILL.md'), [
      '---',
      `name: "${name}"`,
      `title: "${name}"`,
      'l1_plane: "业务运营"',
      'l2_domain: "供应与履约"',
      'l3_business: "物流方案"',
      'disable-model-invocation: "true"',
      'user-invocable: "true"',
      '---',
      '',
      '# body',
      '',
    ].join('\n'), 'utf8')
  }
  return home
}

/** Fake request carrying exactly what the loopback fence inspects. */
function fakeRequest(overrides: {
  method?: string
  remoteAddress?: string
  host?: string
  body?: string
} = {}): IncomingMessage {
  const body = overrides.body ?? ''
  const chunks = body === '' ? [] : [Buffer.from(body, 'utf8')]
  return {
    method: overrides.method ?? 'GET',
    url: HOST_ROUTES.tree,
    headers: { host: overrides.host ?? 'localhost:43120' },
    socket: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
    destroy() {},
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

/** Build the routes over a fixture home. */
function routesFor(home: string, collect?: unknown): WebRoute[] {
  return makeRoutes(fakeContext(), {
    source: diskSource({ dshHome: home }),
    logger: { warn: () => {} },
    cacheTtlMs: 0,
    ...(collect === undefined ? {} : { collect: collect as never }),
  })
}

/** Look up one route by path. */
function routeAt(routes: WebRoute[], path: string): WebRoute {
  const route = routes.find((candidate) => candidate.path === path)
  if (route === undefined) throw new Error(`route not found: ${path}`)
  return route
}

/** Read a card's frontmatter switch straight off disk. */
function readSwitch(home: string, name: string): boolean {
  const text = readFileSync(join(home, 'skills', name, 'SKILL.md'), 'utf8')
  // 管线写的是 JSON 引号化的 "true"；手工卡是裸 true。两种都要认。
  return !/disable-model-invocation:\s*"?true"?/.test(text)
}

describe('route literals', () => {
  it('mirrors the host paths in the client bundle', () => {
    expect(CLIENT_ROUTES).toEqual(HOST_ROUTES)
  })

  it('declares the documented paths', () => {
    expect(HOST_ROUTES.tree).toBe('/api/dsh-algo-skills/tree')
    expect(HOST_ROUTES.toggle).toBe('/api/dsh-algo-skills/toggle')
    expect(HOST_ROUTES.health).toBe('/api/dsh-algo-skills/health')
    expect(routesFor(fixtureHome()).map((route) => route.path).sort())
      .toEqual([HOST_ROUTES.health, HOST_ROUTES.toggle, HOST_ROUTES.tree].sort())
  })
})

describe('tree route', () => {
  it('serves the classification tree to a loopback GET', async () => {
    const routes = routesFor(fixtureHome())
    const { res, status, body } = fakeResponse()
    await routeAt(routes, HOST_ROUTES.tree).handler(fakeRequest(), res)

    expect(status()).toBe(200)
    const payload = JSON.parse(body()) as {
      totals: { planes: number; roles: number; skills: number; placed: number }
      planes: Array<{ id: string; domains: Array<{ id: string; roles: Array<{ agt: string; skills: Array<{ name: string; wired: boolean }> }> }> }>
    }
    // 只扫 p2s- 卡：同目录下的 handwritten-skill 有意不进树（切换路由也不受理它）
    expect(payload.totals).toMatchObject({ planes: 1, roles: 1, skills: 1, placed: 1 })
    expect(payload.planes[0]?.id).toBe('PLN-OPS')
    const role = payload.planes[0]?.domains[0]?.roles[0]
    expect(role?.agt).toBe('AGT-019')
    expect(role?.skills.map((s) => s.name)).toEqual(['p2s-demo'])
    expect(role?.skills[0]?.wired).toBe(true)
  })

  it('refuses a non-loopback socket with 403 and never runs the collector', async () => {
    const collect = vi.fn()
    const routes = routesFor(fixtureHome(), collect)
    const { res, status, body } = fakeResponse()
    await routeAt(routes, HOST_ROUTES.tree).handler(fakeRequest({ remoteAddress: '203.0.113.7' }), res)

    expect(status()).toBe(403)
    expect(JSON.parse(body())).toEqual({ error: 'forbidden: loopback-only' })
    expect(collect).not.toHaveBeenCalled()
  })

  it('refuses a non-loopback Host header even from a loopback socket', async () => {
    const routes = routesFor(fixtureHome())
    const { res, status } = fakeResponse()
    await routeAt(routes, HOST_ROUTES.tree).handler(fakeRequest({ host: 'evil.example.com' }), res)
    expect(status()).toBe(403)
  })

  it('guards the method', async () => {
    const routes = routesFor(fixtureHome())
    const { res, status } = fakeResponse()
    await routeAt(routes, HOST_ROUTES.tree).handler(fakeRequest({ method: 'POST' }), res)
    expect(status()).toBe(405)
  })
})

describe('toggle route', () => {
  it('flips the switch on an installed p2s- card and writes the file', async () => {
    const home = fixtureHome()
    const routes = routesFor(home)
    expect(readSwitch(home, 'p2s-demo')).toBe(false)
    const { res, status, body } = fakeResponse()
    await routeAt(routes, HOST_ROUTES.toggle).handler(
      fakeRequest({ method: 'POST', body: JSON.stringify({ name: 'p2s-demo', enabled: true }) }),
      res,
    )
    expect(status()).toBe(200)
    expect(JSON.parse(body())).toEqual({ ok: true, name: 'p2s-demo', enabled: true })
    expect(readSwitch(home, 'p2s-demo')).toBe(true)
    // 正文必须逐字保留
    expect(readFileSync(join(home, 'skills', 'p2s-demo', 'SKILL.md'), 'utf8')).toContain('# body')
  })

  it('refuses a safe kebab name that is not a p2s- card, and leaves it untouched', async () => {
    const home = fixtureHome()
    const routes = routesFor(home)
    const { res, status, body } = fakeResponse()
    await routeAt(routes, HOST_ROUTES.toggle).handler(
      fakeRequest({ method: 'POST', body: JSON.stringify({ name: 'handwritten-skill', enabled: true }) }),
      res,
    )
    expect(status()).toBe(400)
    expect(JSON.parse(body())).toEqual({ ok: false, error: 'invalid name' })
    expect(readSwitch(home, 'handwritten-skill')).toBe(false)
  })

  it('refuses path escapes and names that are not installed', async () => {
    const home = fixtureHome()
    const routes = routesFor(home)
    for (const [name, expected] of [['../evil', 400], ['p2s-does-not-exist', 404]] as const) {
      const { res, status } = fakeResponse()
      await routeAt(routes, HOST_ROUTES.toggle).handler(
        fakeRequest({ method: 'POST', body: JSON.stringify({ name, enabled: true }) }),
        res,
      )
      expect(status(), `name=${name}`).toBe(expected)
    }
  })

  it('treats a missing or non-true enabled flag as "disable", never as "enable"', async () => {
    const home = fixtureHome()
    const routes = routesFor(home)
    // 先打开，再发一个只有 name 的请求：必须回到关闭，而不是保持/打开
    await routeAt(routes, HOST_ROUTES.toggle).handler(
      fakeRequest({ method: 'POST', body: JSON.stringify({ name: 'p2s-demo', enabled: true }) }), fakeResponse().res,
    )
    expect(readSwitch(home, 'p2s-demo')).toBe(true)
    await routeAt(routes, HOST_ROUTES.toggle).handler(
      fakeRequest({ method: 'POST', body: JSON.stringify({ name: 'p2s-demo' }) }), fakeResponse().res,
    )
    expect(readSwitch(home, 'p2s-demo')).toBe(false)
  })

  it('refuses a non-loopback caller', async () => {
    const home = fixtureHome()
    const routes = routesFor(home)
    const { res, status } = fakeResponse()
    await routeAt(routes, HOST_ROUTES.toggle).handler(
      fakeRequest({ method: 'POST', remoteAddress: '10.0.0.5', body: JSON.stringify({ name: 'p2s-demo', enabled: true }) }),
      res,
    )
    expect(status()).toBe(403)
    expect(readSwitch(home, 'p2s-demo')).toBe(false)
  })
})

describe('health route', () => {
  it('reports counters without the full payload', async () => {
    const routes = routesFor(fixtureHome())
    const { res, status, body } = fakeResponse()
    await routeAt(routes, HOST_ROUTES.health).handler(fakeRequest(), res)
    expect(status()).toBe(200)
    const payload = JSON.parse(body()) as { ok: boolean; plugin: string; totals: { skills: number }; issues: number }
    expect(payload.ok).toBe(true)
    expect(payload.plugin).toBe('algo-skills-local')
    expect(payload.totals.skills).toBe(1)
    expect(typeof payload.issues).toBe('number')
  })
})
