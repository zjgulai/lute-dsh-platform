/**
 * Build + wiring contract. Four failure modes this file exists to catch, each
 * of which is silent at runtime:
 *
 *  1. **The two halves disagree on a route literal.** The client bundle
 *     hardcodes its fetch path; a renamed sibling route would leave the drawer
 *     reporting "the roster is missing" while the roster is right there.
 *  2. **A client require the frozen module table cannot answer.** The bundle
 *     resolves externals through the loader's module table; an unlisted
 *     specifier is a guaranteed `require is not a function` at boot.
 *  3. **A missing anti-white-screen declaration.** A package listed in a
 *     profile's `dsh.profile.bundles` without `dsh.bundle` + a real patch with
 *     an `insert` puts the desktop into the recovery window.
 *  4. **A hand-edited shared copy.** This package's entry core and host fence
 *     are generated copies; editing one in place is how the shared layer forks.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPOSED_SOURCES, ROUTES } from '../src/routes.ts'
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

/** Every `/api/...` literal the browser half fetches. */
function clientRouteLiterals(): string[] {
  return [...read('src/client/api.ts').matchAll(/'((?:\/api\/)[^']*)'/g)].map((match) => match[1]!)
}

describe('host ↔ client route agreement', () => {
  it('keeps every route the browser hardcodes a declared route (own or composed)', () => {
    // The client half mirrors route paths as literals (it must not import the
    // host half, which pulls node builtins into the browser graph). A typo there
    // is a silently empty drawer.
    //
    // Unlike the sibling surfaces, the literals here are NOT all this package's
    // own routes: the drawer reads a route published by dsh-role-matrix-local.
    // So the expected set is the union of this package's ROUTES and the routes
    // published in COMPOSED_SOURCES — which is what makes that constant the
    // declaration of the coupling rather than documentation of it.
    const declared = new Set<string>([
      ...Object.values(ROUTES),
      ...COMPOSED_SOURCES.map((source) => source.route),
    ])
    const literals = clientRouteLiterals()
    expect(literals.length).toBeGreaterThan(0)
    for (const literal of literals) {
      expect([...declared], `client path ${literal} is not a declared route`).toContain(literal)
    }
  })

  it('declares each composed source with an owner and the fact that owner holds', () => {
    // The composition contract is only useful if it names *who* owns each half:
    // that is what lets a reader act on a degraded drawer ("install
    // dsh-worktable") instead of just seeing a gap.
    expect(COMPOSED_SOURCES.length).toBeGreaterThan(0)
    for (const source of COMPOSED_SOURCES) {
      expect(source.route.startsWith('/api/')).toBe(true)
      expect(source.owner).not.toBe('')
      expect(source.owns).not.toBe('')
    }
    // This package owns **exactly one** dataset, and the route list is where it
    // says so. `systems` reads it (the external systems catalog bundled under
    // src/catalog/), and `openSystem` is the one route that acts on it. The
    // other two own nothing: `products` reads `product.json` files that live in
    // their own directories, and `health` only reports that this plugin loaded.
    //
    // The list stays pinned, because the rule it guards has now been amended
    // once and the amendment is the interesting part: this package used to own
    // no data at all (ADR-0045), and adding a *second* owned dataset is a
    // decision someone has to make on purpose rather than a diff that slips in.
    expect(Object.keys(ROUTES).sort()).toEqual(['health', 'openSystem', 'products', 'systems'])
  })

  it('carries every client-called route inside the built bundle', () => {
    const client = read('lib/client.js')
    for (const literal of clientRouteLiterals()) {
      expect(client, `client bundle must carry ${literal}`).toContain(literal)
    }
  })

  it('keeps the host-only health route out of the browser half', () => {
    // `health` is a host probe the drawer never calls; shipping it would be a
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

  it('uses a row id that cannot collide with a sibling surface row', () => {
    // Row ids are unique inside the composition tree; a duplicate makes the
    // loader log a collision and drop one of the two rows.
    const patch = read('cordis.patch.yml')
    for (const sibling of ['ui-role-matrix-local', 'ui-skill-center-local', 'ui-taskboard-local', 'dsh-worktable']) {
      expect(patch).not.toContain(`id: ${sibling}`)
    }
    expect(patch).toContain('id: ui-newapp-local')
  })

  it('declares the client face for the web platform', () => {
    const dsh = manifest()['dsh']
    expect(dsh?.['client']?.['platform']).toBe('web')
    expect(dsh?.['client']?.['inject']).toContain('@deepseek-ai/dsh-client-runtime')
  })

  it('keeps both halves in the published file list', () => {
    expect(manifest()['files']).toContain('lib')
  })

  it('carries the three LUTE governance fields (ADR-0010/0012)', () => {
    const pkg = manifest()
    expect(pkg['luteOrigin']).toBe('self')
    expect(pkg['luteOwner']).toBe('lute')
    expect(pkg['lutePublish']).toBe(false)
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

describe('generated shared copies stay generated', () => {
  it('keeps the sync-shared marker as the first line of every copy', () => {
    // scripts/sync-shared.mjs discovers consumers by parsing this marker; a copy
    // whose marker was dropped stops being checked while still looking shared,
    // which is the failure A5 was opened for.
    const copies: Array<[string, string]> = [
      ['src/client/sidebar-entry-core.ts', 'shared/client/sidebar-entry-core.ts'],
      ['src/http.ts', 'shared/host/http.ts'],
      ['src/loopback.ts', 'shared/host/loopback.ts'],
      ['src/pair-access.ts', 'shared/host/pair-access.ts'],
      ['src/mount-once.ts', 'shared/host/mount-once.ts'],
    ]
    for (const [copy, shared] of copies) {
      const firstLine = read(copy).split('\n')[0]!
      expect(firstLine).toContain(`Generated by scripts/sync-shared.mjs from ${shared}.`)
    }
  })
})

describe('host route registration', () => {
  it('calls webServer.register once per route, with kind and path intact', async () => {
    // The real contract is `register(route: WebRoute): () => void` — ONE route,
    // filed by `route.kind` + `route.path`. Handed the whole array instead, it
    // reads `kind === undefined` and files the routes under the `undefined` key
    // of the PREFIX table; `table.has(route.path)` is `has(undefined)` so the
    // duplicate check cannot fire either. Nothing throws, nothing logs, and the
    // exact route is unreachable — the drawer's probe then reports 401, which is
    // exactly what an unloaded plugin reports.
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

    expect(calls.map((route) => [route.kind, route.path]).sort()).toEqual(
      Object.values(ROUTES).map((path) => ['exact', path]).sort(),
    )
  })
})

describe('no dsh-worktable coupling left in the browser half (ablation A4/A5/A6)', () => {
  /** Every source file the browser half is built from, relative to the package root. */
  function clientSources(dir = 'src/client'): string[] {
    const out: string[] = []
    for (const entry of readdirSync(join(PACKAGE_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) out.push(...clientSources(rel))
      else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(rel)
    }
    return out
  }

  it('carries no worktable route literal and no worktable storage key', () => {
    // M6. The drawer's read points on another owner's state are *exactly* these
    // two literal kinds — an `/api/worktable/...` fetch and a `dsh.worktable.*`
    // localStorage key. Asserted over the whole browser half rather than over
    // the one module known to hold them today, because the failure this guards
    // against is a future edit reintroducing either literal somewhere new.
    //
    // Prose is deliberately not searched: the comments that name the worktable
    // explain where a *technique* came from (the open triple), which is
    // provenance, not a dependency. Grepping raw text would fail on those and
    // could only be satisfied by deleting the history.
    const offenders: string[] = []
    for (const file of clientSources()) {
      const text = read(file)
      for (const match of text.matchAll(/'(\/api\/worktable[^']*)'|'(dsh\.worktable\.[^']*)'/g)) {
        offenders.push(`${file}: ${match[1] ?? match[2] ?? ''}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('has no composed-matrix module at all', () => {
    // A5/A6: once the three sources are gone the module that joined them has no
    // subject. Leaving the file behind with an emptied `buildMatrix` would keep
    // a second, silently-unused home for the composition idea (ADR-0009).
    expect(exists('src/client/sources.ts')).toBe(false)
  })

  it('ships no client-side matrix reader and no roster route literal', () => {
    // The roster route literal belongs to the *launcher*, which reads it for one
    // question (does the declared preset exist here) and never renders it. A
    // second copy inside the read-only reader module would be two readers of one
    // owner's route — the drift ADR-0009 forbids.
    const api = read('src/client/api.ts')
    expect(api).not.toMatch(/matrix\s*\(/)
    expect(api).not.toContain('/api/dsh-role-matrix/list')
  })
})
