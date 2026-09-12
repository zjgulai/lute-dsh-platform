/**
 * Real-runtime mount: the settings row through the SHIPPED slot registry.
 *
 * How this differs from ./client-mount.spec.ts, and why both exist.
 *
 * client-mount.spec.ts runs the plugin against a hand-written double of the
 * slots service. That double encodes two beliefs — `register` throws on an
 * undeclared key, `inject` defers until the declaration commits — and a double
 * cannot be wrong in a way its own test notices. If the shipped registry ever
 * changed either semantic, every test in that file would still pass while the
 * row vanished from the real app: the exact failure that file was written for.
 *
 * So this file drives the real thing:
 *
 *  - Client halves are scripts, not ES modules. Each one calls
 *    `window.__ModuleLoader__.load({ id, factory })` and receives its `require`
 *    from the host. The harness below hosts them the way the browser does, so
 *    a build that loses that wrapper is a failure here rather than a blank
 *    settings page.
 *  - `@deepseek-ai/dsh-client-runtime`'s `SlotRegistry` is the registry the app
 *    ships, driven through a real cordis `Context` — not a re-description of it.
 *  - The plugin half is the BUILT bundle (`../lib/client.js`): the file the
 *    desktop profile loads, hard-linked from this package. Type-only imports
 *    vanish at build time, so this also pins that the bundle needs nothing at
 *    runtime beyond `react` and `react/jsx-runtime`.
 *
 * One deliberate double: the `locale` service. Constructing the shipped one
 * needs `ctx.settingsScope` and `ctx.slots.installLocale` from the shell — the
 * whole application. {@link TestLocale} implements the two methods this plugin
 * calls, with the shipped signatures (`register(ns, dicts) -> disposer`,
 * `bind(ns) -> t`). The locale seam does not decide whether the row appears;
 * the slots seam does.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Cordis from '@deepseek-ai/cordis'
import * as UiSlots from '@deepseek-ai/dsh-client-ui-slots'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Bundle under test — the built client the desktop profile loads.
 *
 * Overridable so the suite can be pointed at a deliberately corrupted copy and
 * shown to fail; a green suite that cannot be made red proves nothing.
 */
const BUILT_CLIENT = process.env['ALGO_BUILT_CLIENT'] ?? join(PACKAGE_ROOT, 'lib/client.js')

/** The shipped runtime's own client half, straight out of the installed package. */
const RUNTIME_CLIENT = join(
  PACKAGE_ROOT, 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js',
)

/** One client bundle factory, as `window.__ModuleLoader__.load` receives it. */
type BundleFactory = (require: (id: string) => unknown) => unknown

/** One fallback dictionary, shaped like the shipped `register(ns, { zh, en })`. */
type Dicts = Record<string, Record<string, string>>

/** One registration as the real ledger hands it back. */
interface LedgerEntry {
  component: unknown
  options: {
    id?: string
    order?: number
    label?: string | (() => string)
    priority?: number
  }
  /** Declared locale namespace; the core spreads this onto the entry, not options. */
  locale?: string
}

/** The `SlotsService` members this file drives. */
interface ShippedSlots {
  inject(key: string, callback: () => unknown): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
  entries(key: string): LedgerEntry[]
  spec(key: string): unknown
}

/**
 * Host the client bundles the way the browser module loader does.
 *
 * `window` is a bare object: the bundles touch nothing on it but
 * `__ModuleLoader__`, and passing a substitute keeps the harness from
 * depending on jsdom's own globals for the loader contract.
 * @param externals - module ids resolved outside the bundle set (react, cordis…).
 * @returns the file evaluator, the module `require`, and the ids seen.
 */
function createModuleHost(externals: Record<string, unknown>): {
  evaluate(file: string): void
  require(id: string): unknown
  ids(): string[]
} {
  const factories = new Map<string, BundleFactory>()
  const cache = new Map<string, unknown>()
  const scope = {
    __ModuleLoader__: {
      load(spec: { id: string; factory: BundleFactory }): void {
        factories.set(spec.id, spec.factory)
      },
    },
  }

  const require_ = (id: string): unknown => {
    if (Object.hasOwn(externals, id)) return externals[id]
    const cached = cache.get(id)
    if (cached !== undefined) return cached
    const factory = factories.get(id)
    if (factory === undefined) throw new Error(`module host: nothing registered for "${id}"`)
    // One factory run per id, exports cached — the loader's own module semantics.
    const exports = factory(require_)
    cache.set(id, exports)
    return exports
  }

  return {
    evaluate(file) {
      // eslint-disable-next-line no-new-func -- client bundles are scripts, not modules
      new Function('window', readFileSync(file, 'utf8'))(scope)
    },
    require: require_,
    ids: () => [...factories.keys()],
  }
}

/**
 * The one double in this file: the `locale` service.
 *
 * Mirrors the shipped `LocaleRuntime` for the two methods the plugin calls,
 * including the `zh`-then-`en` lookup order and the key-as-fallback rule.
 */
class TestLocale extends Cordis.Service {
  private readonly dicts = new Map<string, Dicts>()
  private readonly bound = new Map<string, (key: string) => string>()

  /**
   * Register as the `locale` service on `ctx`.
   * @param ctx - client root context.
   */
  constructor(ctx: Cordis.Context) {
    super(ctx, 'locale')
  }

  /**
   * Register one namespace's dictionaries.
   * @param ns - namespace.
   * @param dicts - locale id to entries.
   * @returns disposer dropping the namespace.
   */
  register(ns: string, dicts: Dicts): () => void {
    if (this.dicts.has(ns)) throw new Error(`locale namespace "${ns}" already registered`)
    this.dicts.set(ns, dicts)
    return () => { this.dicts.delete(ns) }
  }

  /**
   * Bind a namespace to a translate function.
   * @param ns - namespace.
   * @returns the namespace's translate function.
   */
  bind(ns: string): (key: string) => string {
    const existing = this.bound.get(ns)
    if (existing !== undefined) return existing
    const t = (key: string): string => {
      const dicts = this.dicts.get(ns)
      return dicts?.['zh']?.[key] ?? dicts?.['en']?.[key] ?? key
    }
    this.bound.set(ns, t)
    return t
  }
}

/** A mounted world: real registry, real cords, built plugin half. */
interface World {
  ctx: Cordis.Context
  slots: ShippedSlots
  plugin: { apply(ctx: Cordis.Context): void; inject: string[]; NS: string }
  host: { evaluate(file: string): void; require(id: string): unknown; ids(): string[] }
}

/**
 * Build one isolated world: fresh cordis context, fresh real registry, and the
 * plugin half loaded from the built bundle.
 * @returns the world.
 */
function createWorld(): World {
  const host = createModuleHost({
    react: React,
    'react/jsx-runtime': JsxRuntime,
    '@deepseek-ai/cordis': Cordis,
    '@deepseek-ai/dsh-client-ui-slots': UiSlots,
  })

  host.evaluate(RUNTIME_CLIENT)
  const runtime = host.require('@deepseek-ai/dsh-client-runtime') as {
    SlotRegistry: new (ctx: Cordis.Context) => unknown
  }

  host.evaluate(BUILT_CLIENT)
  const plugin = host.require('dsh-algo-skills-local') as World['plugin']

  const ctx = new Cordis.Context()
  const slots = new runtime.SlotRegistry(ctx) as unknown as ShippedSlots
  new TestLocale(ctx)
  return { ctx, slots, plugin, host }
}

/**
 * Declare `settings.section` the way the shell does: as a child in a parent
 * entry's `children` table (the registry's own error text names that as the
 * only legal declaration path).
 * @param slots - the registry under test.
 * @returns disposer collapsing the declaration again.
 */
function declareSettingsSection(slots: ShippedSlots): () => unknown {
  return slots.register(
    { name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } },
    null,
  ) as unknown as () => unknown
}

/** Resolve a slot label the way the shipped `resolveSlotLabel` does. */
function labelOf(entry: LedgerEntry): string {
  const { label } = entry.options
  return typeof label === 'function' ? label() : String(label)
}

/** Ids of the ledger's rows, in the order the registry reports them. */
function rowIds(slots: ShippedSlots): (string | undefined)[] {
  return slots.entries('settings.section').map((e) => e.options.id)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('real registry mount', () => {
  it('loads the built bundle through the module-host contract', () => {
    const { host, plugin } = createWorld()

    expect(host.ids()).toContain('dsh-algo-skills-local')
    expect(typeof plugin.apply).toBe('function')
    expect(plugin.inject).toEqual(['slots', 'locale'])
  })

  it('waits, without throwing, while the shell has not declared the slot', () => {
    const { ctx, slots, plugin } = createWorld()

    expect(() => { plugin.apply(ctx) }).not.toThrow()

    expect(slots.spec('settings.section')).toBeUndefined()
    expect(slots.entries('settings.section')).toHaveLength(0)
  })

  it('lands the row when a parent entry declares the slot', () => {
    const { ctx, slots, plugin } = createWorld()
    plugin.apply(ctx)

    declareSettingsSection(slots)

    const rows = slots.entries('settings.section')
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    // The shell's own projection (ui-settings-general's rows getSnapshot) reads
    // exactly these three: `e.options.id`, `e.options.order`,
    // `resolveSlotLabel(e.options.label)`. Asserting them here is asserting
    // what the nav rail will show.
    expect(row.options.id).toBe('algo-skills')
    expect(row.options.order).toBe(29)
    // `locale` is NOT an options field: SlotCore spreads it onto the entry
    // itself (options carries key/id/order/label/priority only). Written down
    // because this test is where that shape was found — the double's recorded
    // options object had it nested, which is a thing the double could not know.
    expect(row.locale).toBe('dsh-algo-skills-local')
    // The component the shell would mount, straight out of the built bundle.
    expect(typeof row.component).toBe('function')
    expect(labelOf(row)).toBe('算法技能')
  })

  it('sorts after the four catalog rows already sitting at 25–28', () => {
    const { ctx, slots, plugin } = createWorld()
    plugin.apply(ctx)
    declareSettingsSection(slots)

    // The shipped neighbours, by the orders they register with.
    for (const [id, order] of [['agent-teams', 25], ['overseas-skills', 26], ['fullstack-skills', 27], ['wanzh-hulian', 28]] as const) {
      slots.register({ name: 'settings.section', id, order, label: id }, null)
    }

    expect(rowIds(slots)).toEqual([
      'agent-teams', 'overseas-skills', 'fullstack-skills', 'wanzh-hulian', 'algo-skills',
    ])
  })

  it('drops the row when the declaration collapses, and restores it when it returns', () => {
    const { ctx, slots, plugin } = createWorld()
    plugin.apply(ctx)

    const collapse = declareSettingsSection(slots)
    expect(rowIds(slots)).toEqual(['algo-skills'])

    collapse()
    expect(slots.entries('settings.section')).toHaveLength(0)

    declareSettingsSection(slots)
    expect(rowIds(slots)).toEqual(['algo-skills'])
  })

  it('keeps one row when the same plugin is applied twice', () => {
    const { ctx, slots, plugin } = createWorld()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    plugin.apply(ctx)
    plugin.apply(ctx)
    declareSettingsSection(slots)

    // The ledger's duplicate-id rule refuses the second registration; the
    // plugin's no-throw policy keeps that refusal from reaching the shell.
    expect(rowIds(slots)).toEqual(['algo-skills'])
    expect(warn).toHaveBeenCalled()
  })

  it('documents, on the real registry, the failure the deferral avoids', () => {
    const { slots } = createWorld()

    expect(() => {
      slots.register({ name: 'settings.section', id: 'algo-skills', order: 29 }, null)
    }).toThrow(/is not declared/)
  })
})

describe('built component against the live payload', () => {
  /** The tree the host actually serves, or nothing when it has not been captured. */
  function readLiveTree(): Record<string, unknown> | undefined {
    const path = process.env['ALGO_LIVE_TREE']
      ?? join(PACKAGE_ROOT, '..', '..', '..', '.scratch', 'algo-skills-acceptance', 'live-tree.json')
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  const live = readLiveTree()
  const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = []

  afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
      act(() => { root.unmount() })
      container.remove()
    }
  })

  it.skipIf(live === undefined)('renders the 1338-card tree from the shipped bundle', async () => {
    const { ctx, slots, plugin } = createWorld()
    plugin.apply(ctx)
    declareSettingsSection(slots)
    const component = slots.entries('settings.section')[0]!.component as React.ComponentType

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => live })))

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => { root.render(React.createElement(component)) })
    await act(async () => { await Promise.resolve() })
    mounted.push({ root, container })

    const totals = (live as { totals: Record<string, number> }).totals
    const text = container.textContent ?? ''
    // The real numbers, on screen: the header line and every stat tile.
    expect(text).toContain(`${totals['planes']} 面 · ${totals['distinctDomains']} 责任域 · ${totals['roles']} 岗位`)
    for (const key of ['skills', 'placed', 'unplaced', 'wired', 'emptyRoles']) {
      expect(text).toContain(String(totals[key]))
    }
    expect(container.querySelectorAll('[data-dsh-part="algo-plane"]')).toHaveLength(totals['planes']!)
    expect(container.querySelectorAll('[data-dsh-part="algo-role"]')).toHaveLength(0)
  })
})
