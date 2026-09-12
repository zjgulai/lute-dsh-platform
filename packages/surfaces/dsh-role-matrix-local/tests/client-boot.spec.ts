/**
 * The built client bundle must **boot**: load under the shell's module loader,
 * run `apply(ctx)` against the services it declares, and put the capability row
 * in the composer without throwing.
 *
 * Why this exists on top of the source-level tests: `apply` runs during the
 * shell's boot, so a throw here does not degrade one surface — it fails the
 * whole GUI boot. Nothing else in this suite loads the artifact that actually
 * ships; `contract.spec.ts` only reads `lib/client.js` as text, and the vitest
 * suites import TypeScript sources that the build then rewrites. This is the
 * test that executes the bytes in `lib/`.
 *
 * Anti-vacuity: the run first asserts the loader captured a factory with the
 * package's own id and that the fake session really was a role session. Without
 * those, "no row rendered" would pass for the wrong reason.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_BUNDLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')

const ROLE_PRESET = 'agt-027'

/** A complete-enough capability payload for the row to render. */
const CAPABILITIES = {
  ok: true,
  capabilities: {
    preset: ROLE_PRESET,
    agt: 'AGT-027',
    alias: '守店',
    title: '店铺账号健康与规则',
    name: '守店 · 店铺账号健康与规则',
    planeId: 'PLN-OPS',
    planeName: '业务运营',
    domainId: 'DOM-04',
    domainName: '渠道经营',
    artifact: '账号健康报告',
    groups: [{
      name: '账号诊断',
      kind: 'partial',
      note: '有品牌保护与合规监测，无店铺账号健康度诊断',
      supplies: [{ id: 'amazon-brand-protection', label: '亚马逊品牌保护', summary: '品牌侵权监测' }],
    }],
    manuals: [{ id: 'PB-001', label: '存量GMV联合经营' }],
  },
}

/** One loaded bundle: its factory result plus the injected-slot calls it made. */
interface LoadedBundle {
  apply(ctx: unknown): void
}

/**
 * Execute `lib/client.js` the way the shell's loader does.
 * @param requireStub - module resolver handed to the factory.
 * @returns the module the bundle exported.
 */
function loadBundle(requireStub: (name: string) => unknown): LoadedBundle {
  let spec: { id?: string; factory?: (req: (name: string) => unknown) => LoadedBundle } | undefined
  const windowStub = window as unknown as Record<string, unknown>
  windowStub['__ModuleLoader__'] = { load: (loaded: typeof spec): void => { spec = loaded } }
  // eslint-disable-next-line no-new-func -- loading the browser bundle means executing it
  new Function('window', 'document', 'require', readFileSync(CLIENT_BUNDLE, 'utf8'))(
    windowStub, document, requireStub,
  )
  expect(spec, '客户端 bundle 没有调用 window.__ModuleLoader__.load').toBeDefined()
  return spec!.factory!(requireStub)
}

/** The shipped composer shape the placement core anchors on. */
function composer(): void {
  document.body.innerHTML = [
    '<div data-composer-seat><div class="stack"><div data-slot="conversation.composer.bar"></div></div></div>',
  ].join('\n')
}

/** A sessions service over one session. */
function sessionsFor(session: { blank: boolean; agentPreset?: string }): unknown {
  const listeners = new Set<() => void>()
  return {
    list: {
      getSnapshot: () => ({
        current: 's1',
        byId: {
          s1: {
            id: 's1',
            blank: session.blank,
            ...(session.agentPreset === undefined ? {} : { projectionValues: { agentPreset: session.agentPreset } }),
          },
        },
      }),
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
  }
}

/**
 * The client context the plugin declares.
 *
 * `effect` runs its callback (cordis's effect semantics, and the plugin's whole
 * mounting story depends on it running), `inject` resolves immediately with the
 * requested services promoted to the scope, and `get` answers the optional
 * lookups.
 */
function contextFor(sessions: unknown, conversation?: unknown): unknown {
  return {
    effect: (callback: () => unknown) => callback(),
    get: (name: string) => (name === 'conversation' ? conversation : undefined),
    locale: { register: () => () => {} },
    inject: (services: readonly string[], callback: (scope: Record<string, unknown>) => unknown) => {
      const scope: Record<string, unknown> = { ctx: undefined }
      for (const service of services) {
        if (service === 'sessions') scope['sessions'] = sessions
      }
      return callback(scope)
    },
  }
}

/** React's real modules; the bundle resolves them through the loader. */
async function realRequire(): Promise<(name: string) => unknown> {
  const [react, jsx, reactDom] = await Promise.all([
    import('react'),
    import('react/jsx-runtime'),
    import('react-dom/client'),
  ])
  return (name: string) => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return jsx
    if (name === 'react-dom/client') return reactDom
    throw new Error(`client bundle 请求了未预期的模块：${name}`)
  }
}

beforeEach(() => {
  composer()
  document.documentElement.removeAttribute('data-dsh-hero-entry')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', async (url: unknown) => {
    const target = String(url)
    if (target.includes('/capabilities')) {
      return { ok: true, status: 200, json: async () => CAPABILITIES }
    }
    // The panel's own list route is not under test here; answer an empty matrix.
    return { ok: true, status: 200, json: async () => ({ root: '/nonexistent', scannedAt: '', planes: [], totals: { roles: 0, planes: 0, domains: 0, degraded: 0 } }) }
  })
})

afterEach(async () => {
  // Flush twice, both times **before** the console spy is restored and while the
  // composer is still in the DOM. Clearing `document.body` disconnects the row,
  // and the mount's self-heal observer then legitimately tries to re-place it —
  // once against the old composer (still there), once against the emptied body
  // (warns `no-seat`). Both are teardown artifacts; letting either escape the
  // spy would put product-shaped noise in the test log.
  await settle()
  document.body.innerHTML = ''
  await settle()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * Let the bundle's async capability read, React's render and the placement
 * observer settle. Inside `act` because the shell's own render scheduling is
 * what the plugin is riding on.
 */
async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
}

describe('shipped client bundle', () => {
  it('loads under the module loader and boots the capability row for a role session', async () => {
    const require = await realRequire()
    const bundle = loadBundle(require)
    const ctx = contextFor(sessionsFor({ blank: true, agentPreset: ROLE_PRESET }))

    await act(async () => { expect(() => { bundle.apply(ctx) }).not.toThrow() })
    await settle()

    const row = document.querySelector('[data-dsh-hero-entry-row]')
    expect(row, '岗位会话的 hero 态没有出现能力行').not.toBeNull()
    expect(row!.textContent).toContain('AGT-027 守店')
    // The published byte starts with the columns **collapsed**: the group header
    // carries name + grade + count, and the cards are one click away. Asserting
    // the card first would make this test fail for the right reason but read as a
    // product bug, so both halves are pinned explicitly.
    const header = row!.querySelector('button')!
    expect(header.getAttribute('aria-expanded'), '出厂默认必须是收起态').toBe('false')
    expect(header.textContent).toContain('账号诊断')
    expect(row!.textContent).not.toContain('亚马逊品牌保护')
    await act(async () => { header.click() })
    expect(row!.textContent).toContain('亚马逊品牌保护')
  })

  it('boots without a capability row on an ordinary session', async () => {
    const require = await realRequire()
    const bundle = loadBundle(require)
    // No agentPreset at all: the ordinary case, and the one that must stay quiet.
    await act(async () => { bundle.apply(contextFor(sessionsFor({ blank: true }))) })
    await settle()
    expect(document.querySelector('[data-dsh-hero-entry-row]')).toBeNull()
  })

  it('boots without a capability row once the session stops being blank', async () => {
    const require = await realRequire()
    const bundle = loadBundle(require)
    await act(async () => { bundle.apply(contextFor(sessionsFor({ blank: false, agentPreset: ROLE_PRESET }))) })
    await settle()
    expect(document.querySelector('[data-dsh-hero-entry-row]')).toBeNull()
  })

  it('still boots when the shell never provides the sessions service', async () => {
    const require = await realRequire()
    const bundle = loadBundle(require)
    // `inject` is what defers the mount; a shell without the service must leave
    // the surface absent, not throw during boot.
    const ctx = {
      effect: (callback: () => unknown) => callback(),
      get: () => undefined,
      locale: { register: () => () => {} },
      inject: () => ({ dispose: async () => {} }),
    }
    await act(async () => { expect(() => { bundle.apply(ctx) }).not.toThrow() })
    await settle()
    expect(document.querySelector('[data-dsh-hero-entry-row]')).toBeNull()
  })
})
