/**
 * The launcher inside a **real Cordis context** — the one bug a plain test
 * double cannot see.
 *
 * ## What went wrong (measured live, 2026-09-12)
 *
 * Pressing a product card reported `打开失败：cannot get property "sessions"
 * without inject`. The launcher read `ctx.sessions` directly — a bare property
 * read on the context proxy — and this plugin declares only
 * `inject = ['slots', 'locale']`. When cordis cannot resolve an undeclared
 * service it **throws** before any existence check can run, so the sibling
 * fallback (`?? lookup(context, 'sessions')`) never got its turn: the throw
 * happened while *evaluating its left operand*. The session was never created.
 *
 * ## Why `launcher.spec.ts` was green throughout
 *
 * Every case in that file passes a **plain object** as the context. A plain
 * object has no proxy, so `context.sessions` is simply `undefined` and the
 * fallback runs — the suite was asserting the behaviour of a context shape the
 * shell never supplies. The one line that could not work in production was the
 * one line no test could execute.
 *
 * So this file builds the proxy instead: the real `Context` from
 * `@deepseek-ai/cordis`, loaded as a plugin so `fiber.runtime` is set (the
 * condition under which the read throws). The first case asserts the throw
 * itself, so that the file fails for the right reason if the fixture ever
 * stops reproducing production; the second asserts the launcher still drives
 * create → select → open.
 *
 * `ctx.get(name)` is cordis's documented escape hatch — "read a service from
 * the store without the inject requirement". Reading it is exactly what keeps
 * the plugin optional: it never refuses to load on a shell that lacks the
 * service, and it never throws when one is absent.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLauncher } from '../src/client/launcher.ts'
import type { ProductView } from '../src/client/product-cards.ts'

/** A product whose card carries the level-2 plan (no entry panel registered). */
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

/** The directory a session opens in. */
const DIR = '/Users/lute/project/KOL-Hunter'

/** The roster this machine publishes, so `hasPreset` answers from a real read. */
const ROSTER_URL = '/api/dsh-role-matrix/list'
const ROSTER = { planes: [{ name: 'P', domains: [{ name: 'D', roles: [{ id: 'agt-033' }] }] }] }

/** The inject list `src/client/index.ts` ships — the launcher's real declaration. */
const INJECT = ['slots', 'locale']

afterEach(() => { vi.unstubAllGlobals() })

/** A fake host built on a real cordis root, with the call log level 2 produces. */
interface Shell {
  /** The root context the plugin loads under. */
  root: Context
  /** Session calls in order (`create:<opts>` / `open:<id>`). */
  calls: string[]
  /** The preset channel's `select` spy. */
  select: ReturnType<typeof vi.fn>
}

/**
 * Build the shell; `withSessions` decides whether the sessions service exists.
 *
 * `connection` is provided on the root and the plugin is loaded underneath it
 * with exactly the inject list the plugin declares, so an undeclared service
 * read behaves as it does in the GUI.
 * @param withSessions - whether to provide the sessions service at all.
 * @returns the shell fixture.
 */
function shell(withSessions: boolean): Shell {
  const root = new Context()
  const calls: string[] = []
  const select = vi.fn(async () => ({ result: { ok: true } }))
  if (withSessions) {
    root.provide('sessions', {
      create: async (options: unknown) => { calls.push(`create:${JSON.stringify(options)}`); return 'session-live-1' },
      open: (id: string) => { calls.push(`open:${id}`) },
    })
  }
  root.provide('connection', { api: { agentPresets: { select } } })
  root.provide('slots', {})
  root.provide('locale', {})
  return { root, calls, select }
}

describe('the launcher in a real cordis context', () => {
  it('an undeclared service read throws — while ctx.get() answers it honestly with undefined', async () => {
    // The fixture must reproduce production or the rest of the file proves
    // nothing. The two readings differ on the *same* context and the *same*
    // absent service: that difference is the entire bug.
    const { root } = shell(false)
    const { bare, viaGet } = await inPlugin(root, async (ctx) => {
      let caught: unknown
      try {
        void ctx.sessions
      } catch (error) {
        caught = error
      }
      return { bare: caught, viaGet: ctx.get('sessions') }
    })

    expect(viaGet).toBeUndefined()
    expect(bare).toBeInstanceOf(Error)
    expect((bare as Error).message).toBe('cannot get property "sessions" without inject')
  })

  it('reports a missing sessions service instead of throwing out of the click handler', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ROSTER })))
    const { root } = shell(false)
    const outcome = await inPlugin(root, (ctx) => run(ctx, DIR))
    // The old code threw out of `run()`; a reportable outcome is the fix.
    expect(outcome.ok).toBe(false)
    expect(outcome.note).toContain('sessions')
  })

  it('drives create → select → open through that same context', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ROSTER })))
    const { root, calls, select } = shell(true)
    const outcome = await inPlugin(root, (ctx) => run(ctx, DIR))

    expect(outcome.ok).toBe(true)
    expect(outcome.note).toContain('已新建会话')
    expect(calls).toEqual([`create:{"cwd":"${DIR}"}`, 'open:session-live-1'])
    // Positional, per the generated remote contract.
    expect(select.mock.calls[0]).toEqual(['session-live-1', 'agt-033'])
  })
})

/**
 * Run a callback inside a plugin fiber of `root` and return what it produced.
 *
 * The fiber is what makes the context read through cordis's proxy with
 * `fiber.runtime` set — the condition the live shell supplies and a bare
 * `new Context()` does not.
 * @param root - the root context.
 * @param body - the callback, receiving the plugin's own context.
 * @returns what the callback returned.
 */
function inPlugin<T>(root: Context, body: (ctx: Context) => Promise<T>): Promise<T> {
  // A one-shot promise, because `apply` is synchronous in cordis and a
  // floating promise would make the assertion race the plugin body.
  let settle: (value: T) => void = () => {}
  const done = new Promise<T>((resolve) => { settle = resolve })
  const fiber = root.plugin({
    inject: INJECT,
    apply(ctx: Context): void { void body(ctx).then(settle) },
  })
  return fiber.await().then(() => done)
}

/**
 * Build the launcher inside the plugin fiber and run the level-2 plan once.
 *
 * This is the production call shape: `src/client/index.ts` builds the launcher
 * with the plugin's own `ctx` during `apply`.
 * @param ctx - the plugin's context (the real proxy).
 * @param dir - the working directory the card carries.
 * @returns the outcome the drawer would print.
 */
async function run(ctx: Context, dir: string): Promise<{ ok: boolean; note: string }> {
  const launcher = createLauncher(ctx, ROSTER_URL)
  await launcher.prime()
  return launcher.run({
    plan: { level: 2, kind: 'session', preset: 'agt-033' },
    dir,
    product: PRODUCT,
  })
}
