/**
 * Client mount contract: the settings row must survive a slot that is not
 * declared yet.
 *
 * This file exists because of one real defect. The core slot registry throws
 * when a registration targets a key no entry has declared:
 *
 *     slot "settings.section" is not declared (a parent entry's children table
 *     must declare it)
 *
 * An external plugin's `apply` runs before the settings shell declares
 * `settings.section`, so a bare `ctx.slots.register(...)` threw on every boot,
 * the plugin's own catch swallowed it into a console warning, and the row
 * silently never appeared — while the host half looked perfectly healthy over
 * HTTP. Nothing in the host test surface could see that, which is exactly why
 * the assertion belongs here.
 *
 * The fake models the two semantics that matter rather than mocking the calls
 * away: `register` throws on an undeclared key, and `inject` defers until the
 * declaration commits. A regression to direct registration reds
 * "registers only after the declaration lands".
 */
import { describe, expect, it } from 'vitest'
import { apply, NS } from '../src/client/index.ts'
import { AlgoSkillsPage } from '../src/client/AlgoSkillsPage.tsx'

/** One recorded registration. */
interface Entry {
  options: Record<string, unknown>
  component: unknown
}

/**
 * Slot service double matching @deepseek-ai/dsh-client-runtime's
 * `SlotRegistry`: register throws before declaration, inject defers.
 */
class FakeSlots {
  readonly declared = new Set<string>()
  readonly entries: Entry[] = []
  readonly injected: string[] = []
  private readonly waiters = new Map<string, (() => unknown)[]>()

  /** Callbacks still parked on an undeclared key. */
  get pending(): number {
    let total = 0
    for (const list of this.waiters.values()) total += list.length
    return total
  }

  register(options: Record<string, unknown>, component: unknown): () => void {
    const name = String(options['name'])
    if (!this.declared.has(name)) {
      throw new Error(`slot "${name}" is not declared (a parent entry's children table must declare it)`)
    }
    this.entries.push({ options, component })
    return () => {
      this.entries.splice(this.entries.findIndex((e) => e.options === options), 1)
    }
  }

  inject(key: string, callback: () => unknown): () => void {
    this.injected.push(key)
    if (this.declared.has(key)) {
      callback()
      return () => {}
    }
    const pending = this.waiters.get(key) ?? []
    pending.push(callback)
    this.waiters.set(key, pending)
    return () => {}
  }

  /** Commit a declaration and run everything that was waiting on it. */
  declare(key: string): void {
    this.declared.add(key)
    for (const callback of this.waiters.get(key) ?? []) callback()
    this.waiters.delete(key)
  }
}

/** Minimal client context: the four members `apply` touches. */
function fakeCtx(): { ctx: never; slots: FakeSlots; dictionaries: Record<string, unknown> } {
  const slots = new FakeSlots()
  const dictionaries: Record<string, unknown> = {}
  const effects: string[] = []
  const ctx = {
    effect: (fn: () => unknown, name?: string) => {
      effects.push(name ?? '')
      return fn()
    },
    locale: {
      register: (ns: string, dict: unknown) => {
        dictionaries[ns] = dict
        return () => {}
      },
      bind: (ns: string) => (key: string) => {
        const dict = dictionaries[ns] as Record<string, Record<string, string>> | undefined
        return dict?.['zh']?.[key] ?? key
      },
    },
    slots,
  }
  return { ctx: ctx as never, slots, dictionaries }
}

describe('client mount', () => {
  it('defer the row instead of throwing when the settings shell has not declared the slot', () => {
    const { ctx, slots } = fakeCtx()

    expect(() => { apply(ctx) }).not.toThrow()

    // The point: nothing was registered yet, and nothing blew up.
    expect(slots.entries).toHaveLength(0)
    expect(slots.injected).toEqual(['settings.section'])
  })

  it('registers only after the declaration lands, under the skill catalogs', () => {
    const { ctx, slots } = fakeCtx()
    apply(ctx)

    slots.declare('settings.section')

    expect(slots.entries).toHaveLength(1)
    const { options, component } = slots.entries[0]!
    expect(options['name']).toBe('settings.section')
    expect(options['id']).toBe('algo-skills')
    expect(options['locale']).toBe(NS)
    // 出海技能 is 26, AI全栈技能 is 27, 万物互联 is 28
    // (packages/capabilities/dsh-overseas-skills, packages/capabilities/dsh-wanzh-hulian);
    // this page is the fourth catalog in that run. 28 is taken — equal orders
    // are left in mount order, so sharing one makes the row's position depend on
    // which plugin was hot-mounted last.
    expect(options['order']).toBe(29)
    expect(component).toBe(AlgoSkillsPage)
  })

  it('labels the row through this plugin namespace, not the shell default', () => {
    const { ctx, slots, dictionaries } = fakeCtx()
    apply(ctx)
    slots.declare('settings.section')

    const label = slots.entries[0]!.options['label'] as () => string
    expect(typeof label).toBe('function')
    expect(label()).toBe('算法技能')
    // The dictionary must be registered for that label to resolve at all.
    expect(Object.keys(dictionaries)).toContain(NS)
  })

  it('registers synchronously when the slot is already declared', () => {
    const { ctx, slots } = fakeCtx()
    slots.declare('settings.section')

    apply(ctx)

    expect(slots.entries).toHaveLength(1)
    expect(slots.pending).toBe(0) // no wait left parked behind the row
  })

  it('documents the failure this deferral avoids', () => {
    const slots = new FakeSlots()
    // Registering a never-declared slot is a hard throw in the real registry;
    // if this stops being true the inject indirection can be revisited.
    expect(() => slots.register({ name: 'settings.section', id: 'x' }, null)).toThrow(
      /is not declared/,
    )
  })
})
