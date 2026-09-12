/**
 * Build + wiring contract. Three failure modes this file exists to catch,
 * each of which is silent at runtime:
 *
 *  1. **The two halves disagree on a route literal.** The client bundle
 *     hardcodes its fetch paths; a renamed host route would 404 in the browser
 *     with nothing red anywhere.
 *  2. **A client require the frozen module table cannot answer.** The bundle
 *     resolves externals through the loader's module table; an unlisted
 *     specifier is a guaranteed `require is not a function` at boot.
 *  3. **A missing anti-white-screen declaration.** A package listed in a
 *     profile's `dsh.profile.bundles` without `dsh.bundle` + a real patch with
 *     an `insert` puts the desktop into the recovery window.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTES } from '../src/routes.ts'
import { PLATFORM_MODULES } from '../build/web-platform.ts'

// vitest runs with cwd pinned to the package root (the established convention in
// this repo's sibling plugin tests); `import.meta.url` is not a file: URL under
// the jsdom environment, so it cannot be used to locate the package.
const PACKAGE_ROOT = process.cwd()
const read = (rel: string): string => readFileSync(join(PACKAGE_ROOT, rel), 'utf8')
const exists = (rel: string): boolean => existsSync(join(PACKAGE_ROOT, rel))

/** The package's own manifest. */
function manifest(): Record<string, any> {
  return JSON.parse(read('package.json')) as Record<string, any>
}

describe('host ↔ client route agreement', () => {
  it('keeps every route the browser hardcodes an actual host route', () => {
    // The client half mirrors route paths as literals (it must not import the
    // host half, which pulls node builtins into the browser graph). A typo there
    // is a silent 404 in the panel, so the literals are checked against the
    // host's own ROUTES table — not against a copy of it.
    const declared = new Set<string>(Object.values(ROUTES))
    const clientLiterals = [...read('src/client/api.ts').matchAll(/'((?:\/api\/)[^']*)'/g)].map((match) => match[1]!)
    expect(clientLiterals.length).toBeGreaterThan(0)
    for (const literal of clientLiterals) {
      expect([...declared], `client path ${literal} is not a host route`).toContain(literal)
    }
  })

  it('carries every client-called route inside the built bundle', () => {
    const client = read('lib/client.js')
    const clientLiterals = [...read('src/client/api.ts').matchAll(/'((?:\/api\/)[^']*)'/g)].map((match) => match[1]!)
    for (const literal of clientLiterals) {
      expect(client, `client bundle must carry ${literal}`).toContain(literal)
    }
  })

  it('keeps the host-only route out of the browser half', () => {
    // `health` is a host probe the panel never calls; shipping it would be a
    // dead literal in the bundle.
    expect(read('lib/client.js')).not.toContain(ROUTES.health)
  })

  it('names the ModuleLoader id exactly as the package name', () => {
    const client = read('lib/client.js')
    expect(client).toContain('window.__ModuleLoader__.load(')
    expect(client).toContain(`id: ${JSON.stringify(manifest()['name'])}`)
  })
})

describe('client bundle module table', () => {
  it('resolves every real require through the frozen platform module table', () => {
    const client = read('lib/client.js')
    const requires = [...new Set([...client.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]!))]
    expect(requires.length).toBeGreaterThan(0)
    // PLATFORM_MODULES is a readonly literal tuple (its element type is the
    // union of known specifiers), so widen it before a runtime membership test.
    const table: readonly string[] = PLATFORM_MODULES
    const missing = requires.filter((specifier) => !table.includes(specifier))
    expect(missing, `unresolvable require(s): ${missing.join(', ')}`).toEqual([])
  })
})

describe('anti-white-screen declarations', () => {
  it('declares dsh.bundle and ships a patch that inserts a unique row id', () => {
    const pkg = manifest()
    expect(pkg['dsh']?.['bundle']?.['patch']).toBe('./cordis.patch.yml')
    expect(exists('cordis.patch.yml')).toBe(true)
    const patch = read('cordis.patch.yml')
    expect(patch).toContain('insert')
    expect(patch).toContain(pkg['name'])
  })

  it('declares the client face for the web platform', () => {
    const dsh = manifest()['dsh']
    expect(dsh?.['client']?.['platform']).toBe('web')
    expect(dsh?.['client']?.['inject']).toContain('@deepseek-ai/dsh-client-runtime')
  })

  it('keeps both halves in the published file list', () => {
    expect(manifest()['files']).toContain('lib')
  })
})

describe('build artifacts', () => {
  it('emits the host half and the browser half', () => {
    expect(exists('lib/index.js')).toBe(true)
    expect(exists('lib/client.js')).toBe(true)
  })

  it('registers a route effect in the host half instead of touching the loader at import time', () => {
    const host = read('lib/index.js')
    expect(host).toContain('webServer')
    expect(host).toContain('register')
  })

  it('injects only services the client actually uses', () => {
    const client = read('src/client/index.ts')
    expect(client).toContain("export const inject = ['slots', 'locale']")
    const host = read('src/index.ts')
    expect(host).toContain("export const inject = ['webServer']")
  })
})

describe('host route registration', () => {
  it('calls webServer.register once per route, with kind and path intact', async () => {
    // The real contract is `register(route: WebRoute): () => void` — ONE route,
    // filed by `route.kind` + `route.path`. Handed the whole array instead, it
    // reads `kind === undefined` and files both routes under the `undefined`
    // key of the PREFIX table; `table.has(route.path)` is `has(undefined)` so
    // the duplicate check cannot fire either. Nothing throws, nothing logs, and
    // both exact routes are unreachable — the panel then reports a bare
    // "读取失败：HTTP 404" produced by the /api prefix guard, which answers
    // identically for a path that was never registered at all.
    //
    // This stub therefore enforces the contract rather than accepting whatever
    // it is handed; an array-receiving `register` must fail here.
    const { apply } = (await import('../src/index.ts')) as {
      apply: (ctx: unknown, config?: unknown) => void
    }
    const calls: Array<{ kind?: unknown; path?: unknown }> = []
    const ctx = {
      effect: (fn: () => unknown) => fn(),
      logger: { warn: () => {} },
      webServer: {
        register: (route: { kind?: unknown; path?: unknown }) => {
          if (route === null || typeof route !== 'object' || Array.isArray(route)) {
            throw new Error('webServer.register expects one WebRoute, not an array')
          }
          calls.push(route)
          return () => {}
        },
      },
    }

    apply(ctx)

    expect(calls.map((route) => [route.kind, route.path])).toEqual([
      ['exact', ROUTES.list],
      ['exact', ROUTES.capabilities],
      ['exact', ROUTES.health],
    ])
  })
})
