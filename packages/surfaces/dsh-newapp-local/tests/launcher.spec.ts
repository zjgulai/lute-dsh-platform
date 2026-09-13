/**
 * The launcher's two actions, against fake registries.
 *
 * What this file is really testing is **the reporting**, not the plumbing: a
 * launch that silently does nothing is indistinguishable from a dead button, so
 * every path that cannot complete must come back with a sentence naming what was
 * missing. Each case below asserts that sentence exists, not merely that the
 * call returned.
 *
 * The one behaviour that is not a detail: level 2 runs the **same order the
 * worktable client runs in production on this machine** — `create({cwd})` →
 * `agentPresets.select` → `sessions.open`. Selecting a preset on a session that
 * was never created is the bug this order avoids, and `open` last is what makes
 * the new session actually visible.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLauncher } from '../src/client/launcher.ts'
import type { ProductView } from '../src/client/product-cards.ts'

/** A product whose entry panel is published under `svc`. */
const PRODUCT: ProductView = {
  id: 'kol-hunter',
  name: '深链星探 KOL Hunter',
  summary: '',
  version: '0.1.0',
  status: 'draft',
  statusReason: '',
  preset: 'agt-033',
  service: 'kol-hunter-workbench',
  action: 'open',
  features: [],
  declaration: { id: 'kol-hunter', preset: 'agt-033', features: [{ id: 'f', inputs: [{ key: 'a' }] }] },
} as unknown as ProductView

/** The directory a session opens in — all the launcher reads off a card. */
const DIR = '/Users/lute/project/KOL-Hunter'

/** A roster payload shaped like /api/dsh-role-matrix/list. */
const ROSTER = { planes: [{ name: 'P', domains: [{ name: 'D', roles: [{ id: 'agt-033' }, { id: 'agt-001' }] }] }] }

afterEach(() => { vi.unstubAllGlobals() })

/** Stub the roster route; `payload` of `undefined` makes the fetch fail. */
function stubRoster(payload: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => (payload === undefined
    ? { ok: false, status: 401 }
    : { ok: true, status: 200, json: async () => payload })))
}

describe('createLauncher — probes', () => {
  it('answers isRegistered from the live registry, not from a captured list', () => {
    const services: Record<string, unknown> = {}
    const launcher = createLauncher({ get: (name: string) => services[name] })
    expect(launcher.isRegistered('kol-hunter-workbench')).toBe(false)
    services['kol-hunter-workbench'] = { open: () => {} }
    expect(launcher.isRegistered('kol-hunter-workbench')).toBe(true)
    expect(launcher.isRegistered('')).toBe(false)
  })

  it('survives a context that does not implement get() at all', () => {
    const launcher = createLauncher({})
    expect(launcher.isRegistered('anything')).toBe(false)
  })

  it('treats an unknown roster as permissive, so another plugin\u2019s absence cannot disable a card', async () => {
    stubRoster(undefined)
    const launcher = createLauncher({ get: () => undefined })
    await launcher.prime()
    expect(launcher.hasPreset('agt-033')).toBe(true)
  })

  it('refuses a preset the roster does not carry once the roster is known', async () => {
    stubRoster(ROSTER)
    const launcher = createLauncher({ get: () => undefined })
    expect(launcher.hasPreset('agt-999')).toBe(true) // not primed yet: unknown
    await launcher.prime()
    expect(launcher.hasPreset('agt-033')).toBe(true)
    expect(launcher.hasPreset('agt-999')).toBe(false)
  })
})

describe('createLauncher — level 1 (the product\u2019s own panel)', () => {
  it('hands over the declaration verbatim plus the working directory', async () => {
    const open = vi.fn()
    const launcher = createLauncher({ get: () => ({ open }) })
    const outcome = await launcher.run({
      plan: { level: 1, kind: 'panel', service: 'kol-hunter-workbench', action: 'open' },
      dir: DIR,
      product: PRODUCT,
    })
    expect(outcome.ok).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
    const arg = open.mock.calls[0]![0] as { product: unknown; feature: unknown; dir: string }
    // By reference-equal content: the panel renders its form from `inputs[]`,
    // so anything short of the whole declaration is a panel with no fields.
    expect(arg.product).toEqual(PRODUCT.declaration)
    expect(arg.feature).toEqual((PRODUCT.declaration.features as unknown[])[0])
    expect(arg.dir).toBe('/Users/lute/project/KOL-Hunter')
  })

  it('peels a double-wrapped view down to the declaration the panel renders from', async () => {
    // Regression (2026-09-13): the drawer's view and the host's view both
    // carry a `.declaration`; peeling one layer landed on the host view, whose
    // `features[]` are summaries without `inputs`, and the panel opened with
    // no fields (probe `dsh-kolhunter-probe`: hasDeclaration:true,
    // inputCount:-1).
    const raw = {
      id: 'kol-hunter',
      preset: 'agt-033',
      workflow: { entry: 'f' },
      features: [{ id: 'f', inputs: [{ key: 'a' }] }],
    }
    const summary = [{ id: 'f', label: 'F', kind: 'model', steps: 1 }]
    const double: ProductView = {
      ...PRODUCT,
      features: [],
      declaration: { features: summary, declaration: raw },
    } as unknown as ProductView
    const open = vi.fn()
    const launcher = createLauncher({ get: () => ({ open }) })
    const outcome = await launcher.run({
      plan: { level: 1, kind: 'panel', service: 'kol-hunter-workbench', action: 'open' },
      dir: DIR,
      product: double,
    })
    expect(outcome.ok).toBe(true)
    const arg = open.mock.calls[0]![0] as { product: unknown; feature: { id?: string; inputs?: unknown[] } }
    // The innermost raw declaration is the only layer whose features carry
    // `inputs` — anything above it is a card/summary view.
    expect(arg.product).toBe(raw)
    expect(arg.feature.id).toBe('f')
    expect(arg.feature.inputs).toHaveLength(1)
  })

  it('reports an entry panel that throws instead of leaving a button that did nothing', async () => {
    const launcher = createLauncher({ get: () => ({ open: () => { throw new Error('声明不完整') } }) })
    const outcome = await launcher.run({
      plan: { level: 1, kind: 'panel', service: 'svc', action: 'open' },
      dir: DIR,
      product: PRODUCT,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.note).toContain('声明不完整')
  })

  it('reports a service that is registered but has no such method', async () => {
    const launcher = createLauncher({ get: () => ({}) })
    const outcome = await launcher.run({
      plan: { level: 1, kind: 'panel', service: 'svc', action: 'open' },
      dir: DIR,
      product: PRODUCT,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.note).toContain('open()')
  })

  it('reports a service that vanished between planning and pressing', async () => {
    const launcher = createLauncher({ get: () => undefined })
    const outcome = await launcher.run({
      plan: { level: 1, kind: 'panel', service: 'svc', action: 'open' },
      dir: DIR,
      product: PRODUCT,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.note).toContain('未注册')
  })
})

describe('createLauncher — level 2 (session fallback)', () => {
  /**
   * A fake shell with the services level 2 drives, in call order.
   *
   * Every fake service is reachable **only through `get`**, which is the read
   * the launcher is allowed to use. A double that also exposes `sessions` as a
   * property would silently accept a bare read — the shape of the bug that made
   * every card fail in the running GUI. `tests/launcher-context.spec.ts` covers
   * the other half: what a *real* cordis context does with an undeclared read.
   */
  function shell(): { ctx: unknown; calls: string[]; select: ReturnType<typeof vi.fn> } {
    const calls: string[] = []
    const select = vi.fn(async () => { calls.push('select'); return { result: { ok: true } } })
    const services: Record<string, unknown> = {
      sessions: {
        create: async (options: unknown) => { calls.push(`create:${JSON.stringify(options)}`); return { id: 'session-1' } },
        open: async (id: string) => { calls.push(`open:${id}`) },
      },
      connection: { api: { agentPresets: { select } } },
    }
    return { ctx: { get: (name: string) => services[name] }, calls, select }
  }

  /** A context whose only provided service is `sessions`. */
  function sessionsOnly(sessions: unknown): unknown {
    return { get: (name: string) => (name === 'sessions' ? sessions : undefined) }
  }

  it('runs create → select → open, in that order, on the declared directory and preset', async () => {
    const { ctx, calls, select } = shell()
    const launcher = createLauncher(ctx)
    const outcome = await launcher.run({
      plan: { level: 2, kind: 'session', preset: 'agt-033' },
      dir: DIR,
      product: PRODUCT,
    })
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['create:{"cwd":"/Users/lute/project/KOL-Hunter"}', 'select', 'open:session-1'])
    // Positional, matching the generated contract
    // `select(agentId: SessionId, agentPreset: string)`: the transport binds
    // arguments by index, so a single object argument is rejected for arity.
    expect(select.mock.calls[0]).toEqual(['session-1', 'agt-033'])
    expect(outcome.note).toContain('agt-033')
  })

  it('reports a select that RETURNED ok:false — a RemoteResult failure is not a throw', async () => {
    // The remote layer answers business failures as values. Awaiting without
    // reading the verdict reported "已新建会话（岗位 agt-033）" while the session
    // silently kept its default preset.
    const select = vi.fn(async () => ({ ok: false, reason: 'preset 不存在' }))
    const launcher = createLauncher({
      get: (name: string) => (name === 'sessions'
        ? { create: async () => 's4', open: async () => {} }
        : { api: { agentPresets: { select } } }),
    })
    const outcome = await launcher.run({ plan: { level: 2, kind: 'session', preset: 'agt-033' }, dir: DIR, product: PRODUCT })
    expect(outcome.ok).toBe(true)
    expect(outcome.note).toContain('preset 不存在')
  })

  it('treats an ok:false nested under result as a failure too', async () => {
    const launcher = createLauncher({
      get: (name: string) => (name === 'sessions'
        ? { create: async () => 's5', open: async () => {} }
        : { api: { agentPresets: { select: async () => ({ result: { ok: false, error: { message: '岗位未安装' } } }) } } }),
    })
    const outcome = await launcher.run({ plan: { level: 2, kind: 'session', preset: 'agt-033' }, dir: DIR, product: PRODUCT })
    expect(outcome.note).toContain('岗位未安装')
  })

  it('reports a missing sessions service rather than appearing to have started one', async () => {
    const launcher = createLauncher({ get: () => undefined })
    const outcome = await launcher.run({ plan: { level: 2, kind: 'session', preset: 'agt-033' }, dir: DIR, product: PRODUCT })
    expect(outcome.ok).toBe(false)
    expect(outcome.note).toContain('sessions')
  })

  it('reports a create that returned no session id', async () => {
    const launcher = createLauncher(sessionsOnly({ create: async () => ({}) }))
    const outcome = await launcher.run({ plan: { level: 2, kind: 'session', preset: 'agt-033' }, dir: DIR, product: PRODUCT })
    expect(outcome.ok).toBe(false)
    expect(outcome.note).toContain('会话 id')
  })

  it('passes agentPreset directly to sessions.create when there is no preset channel', async () => {
    // Current DSH base does not expose agentPresets to this plugin, but
    // sessions.create accepts the preset at creation time. No separate select
    // call should be attempted.
    const create = vi.fn(async () => 's2')
    const launcher = createLauncher(sessionsOnly({ create, open: async () => {} }))
    const outcome = await launcher.run({ plan: { level: 2, kind: 'session', preset: 'agt-033' }, dir: DIR, product: PRODUCT })
    expect(outcome.ok).toBe(true)
    expect(create).toHaveBeenCalledWith({ cwd: DIR, agentPreset: 'agt-033' })
    expect(outcome.note).toContain('agt-033')
  })

  it('reports a select that threw without losing the fact that the session exists', async () => {
    const launcher = createLauncher({
      get: (name: string) => {
        if (name === 'sessions') return { create: async () => 's3' }
        return { api: { agentPresets: { select: () => { throw new Error('preset not installed') } } } }
      },
    })
    const outcome = await launcher.run({ plan: { level: 2, kind: 'session', preset: 'agt-033' }, dir: DIR, product: PRODUCT })
    expect(outcome.ok).toBe(true)
    expect(outcome.note).toContain('preset not installed')
  })

  it('refuses to run a plan the card already called disabled', async () => {
    const launcher = createLauncher({ get: () => undefined })
    const outcome = await launcher.run({
      plan: { level: 3, kind: 'disabled', reason: 'no-preset-installed' },
      dir: DIR,
      product: PRODUCT,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.note).toBe('disabled:no-preset-installed')
  })
})
