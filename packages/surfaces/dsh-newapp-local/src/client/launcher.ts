/**
 * The launcher's two actions: hand a declaration to a product's own panel, or
 * fall back to starting a session on the declared preset.
 *
 * ## Why this is a thin adapter and not a service
 *
 * Both actions belong to the shell, not to this plugin. Level 1 calls a service
 * the **product** publishes (`ctx.get(entry.service).open(declaration)` — the
 * same `provide`/`get` API the base platform uses for `sessions`, `connection`,
 * `locale`…). Level 2 calls `sessions.create` → `agentPresets.select` →
 * `sessions.open`, which is the exact triple the worktable client already runs
 * in production on this machine. Nothing here invents a mechanism; the value is
 * in *probing* each step and reporting which one was missing, because a launch
 * that silently does nothing is indistinguishable from a dead button.
 *
 * ## Why every lookup is guarded twice
 *
 * The client half and the shell generation are separate release trains, and this
 * plugin must never take the GUI down: an external plugin whose `apply` throws
 * fails the whole shell boot. So every optional service is probed for existence
 * **and** for the method's shape, and every failure comes back as a value
 * (`{ ok: false, note }`) that the drawer can print — never as a rejection the
 * caller has to remember to catch.
 *
 * ## Why the probe is `ctx.get(name)` and never `ctx[name]`
 *
 * A cordis context is a proxy, and reading an **undeclared** service off it is
 * not a lookup — it throws `cannot get property "x" without inject`. The
 * difference is invisible until it matters: `ctx.sessions ?? fallback` reads as
 * a probe and is actually a throw, because the failure happens while evaluating
 * the left operand. This plugin declares only `slots` and `locale`, so any
 * other service it wants must be read with `ctx.get`, which returns undefined
 * instead of refusing. (See `ProbeableContext` below: the shape deliberately
 * has no service properties, so a bare read is not even expressible.)
 *
 * @module dsh-newapp-local/client/launcher
 */
import type { ProductView, OpenPlan } from './product-cards.ts'

/** The outcome of an open attempt, always reportable to a human. */
export interface OpenOutcome {
  ok: boolean
  /** What happened, or what was missing — never empty. */
  note: string
}

/** Which of the two actions to take. */
export interface OpenRequest {
  plan: OpenPlan
  /**
   * The working directory the product is declared in.
   *
   * Carried as the directory itself rather than as the card it came from: the
   * directory is the only thing the launcher reads off a card (it becomes the
   * session's `cwd`), and taking the whole view would make this module depend on
   * a shape that exists for rendering.
   */
  dir: string
  product: ProductView
}

/** The launcher surface the drawer uses. */
export interface AppLauncher {
  /**
   * Load whatever the sync probes below depend on (today: the roster).
   *
   * Split from the probes deliberately. Planning runs inside render and must be
   * synchronous and total; a fetch inside it would make the same card plan
   * differently on two renders. So the drawer awaits `prime()` once per load and
   * the probes then answer from what it resolved.
   * @returns a promise that settles once the roster is known (or known to be unreadable).
   */
  prime(): Promise<void>
  /** Whether a client service is registered right now. */
  isRegistered(service: string): boolean
  /** Whether the machine's roster contains a preset id (`true` when the roster is unknown). */
  hasPreset(preset: string): boolean
  /** Perform the plan. */
  run(request: OpenRequest): Promise<OpenOutcome>
}

/**
 * The subset of the client context this module touches.
 *
 * `get` is the only read that may appear here. A service property would type
 * as an ordinary field and compile into a bare read — the exact mistake that
 * made every level-2 card fail in the running GUI while this module's tests
 * stayed green on plain-object contexts.
 */
interface ProbeableContext {
  get?: (name: string) => unknown
  logger?: { warn?: (message: unknown) => void }
}

/**
 * Resolve a client service without letting a probe become a failure.
 *
 * `ctx.get` is the shell's own registry read. It is wrapped because a context
 * that does not implement it (an older shell, a bare test double) must degrade
 * to "not registered" rather than throw inside a click handler.
 * @param ctx - the client context.
 * @param name - the service name.
 * @returns the service, or `undefined`.
 */
function lookup(ctx: ProbeableContext, name: string): unknown {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

/** Read a callable property off an unknown value. */
function method(target: unknown, name: string): ((...args: unknown[]) => unknown) | undefined {
  if (target === null || typeof target !== 'object') return undefined
  const fn = (target as Record<string, unknown>)[name]
  return typeof fn === 'function' ? (fn as (...args: unknown[]) => unknown) : undefined
}

/** Describe a thrown value without assuming it is an Error. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Describe a returned `RemoteResult` failure.
 *
 * The remote layer reports business failures as values (`{ ok: false, error }`
 * or `{ ok: false, reason }`), so the sentence has to come from whichever field
 * the transport filled — falling back to the JSON of the verdict rather than to
 * an empty pair of parentheses.
 * @param verdict - the `ok: false` result.
 * @returns a human-readable reason.
 */
function describeFailure(verdict: unknown): string {
  const record = (verdict ?? {}) as { error?: unknown; reason?: unknown; message?: unknown }
  for (const candidate of [record.error, record.reason, record.message]) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
    if (candidate !== undefined && candidate !== null && typeof candidate === 'object') {
      const nested = (candidate as { message?: unknown }).message
      if (typeof nested === 'string' && nested !== '') return nested
    }
  }
  try {
    return JSON.stringify(verdict) ?? '未知原因'
  } catch {
    return '未知原因'
  }
}

/**
 * Read the roster this machine publishes, for the preset check.
 *
 * The roster is `dsh-role-matrix-local`'s route — the same one the drawer
 * already reads for the project cards. It is consulted here for one question
 * only: does the preset a product declares actually exist on this machine?
 * Without that check level 2 would select a preset that is not installed, which
 * is a silent no-op.
 * @param ctx - the client context (unused services are simply absent).
 * @param agentsRoute - the roster route.
 * @returns the preset ids, or `undefined` when the roster could not be read.
 */
async function fetchPresetIds(agentsRoute: string): Promise<Set<string> | undefined> {
  try {
    const response = await fetch(agentsRoute, { headers: { accept: 'application/json' } })
    if (!response.ok) return undefined
    const payload = (await response.json()) as unknown
    const planes = (payload as { planes?: unknown }).planes
    if (!Array.isArray(planes)) return undefined
    const ids = new Set<string>()
    for (const planeRaw of planes) {
      const domains = (planeRaw as { domains?: unknown })?.domains
      if (!Array.isArray(domains)) continue
      for (const domainRaw of domains) {
        const roles = (domainRaw as { roles?: unknown })?.roles
        if (!Array.isArray(roles)) continue
        for (const roleRaw of roles) {
          const id = (roleRaw as { id?: unknown })?.id
          if (typeof id === 'string' && id !== '') ids.add(id)
        }
      }
    }
    return ids
  } catch {
    return undefined
  }
}

/**
 * Build the launcher over a client context.
 *
 * The roster is read **once per page load**, and its failure is cached with it:
 * a roster that could not be read leaves `hasPreset` permissive — the drawer
 * must not disable a product's card because a *different* plugin is uninstalled
 * — and re-fetching per card would turn one absent plugin into a burst of
 * requests.
 * @param ctx - the client root context.
 * @param agentsRoute - the roster route (injectable for tests).
 * @returns the launcher.
 */
export function createLauncher(ctx: unknown, agentsRoute = '/api/dsh-role-matrix/list'): AppLauncher {
  const context = (ctx ?? {}) as ProbeableContext
  let presetIds: Set<string> | undefined
  let primed: Promise<void> | undefined

  const warn = (error: unknown): void => {
    try {
      context.logger?.warn?.(`[newapp-local] ${message(error)}`)
    } catch {
      /* logging must never be the thing that throws */
    }
  }

  /** The host connection's agentPresets channel, or undefined. */
  const presetsChannel = (): unknown => {
    const connection = lookup(context, 'connection') as { api?: { agentPresets?: unknown } } | undefined
    return connection?.api?.agentPresets
  }

  return {
    prime(): Promise<void> {
      primed ??= fetchPresetIds(agentsRoute).then(
        (ids) => { presetIds = ids },
        () => { presetIds = undefined },
      )
      return primed
    },

    isRegistered(service: string): boolean {
      if (service === '') return false
      return lookup(context, service) !== undefined
    },

    hasPreset(preset: string): boolean {
      if (preset === '' || presetIds === undefined) return true
      return presetIds.has(preset)
    },

    async run({ plan, dir, product }: OpenRequest): Promise<OpenOutcome> {
      if (plan.kind === 'disabled') return { ok: false, note: `disabled:${plan.reason}` }

      if (plan.kind === 'panel') {
        const service = lookup(context, plan.service)
        if (service === undefined) {
          return { ok: false, note: `未注册的入口服务 ${plan.service}` }
        }
        const open = method(service, plan.action)
        if (open === undefined) {
          return { ok: false, note: `入口服务 ${plan.service} 没有 ${plan.action}() 方法` }
        }
        try {
          // The declaration goes over **verbatim** (the product owns its schema);
          // the directory travels beside it so a panel that wants to show or
          // reuse the working directory does not have to guess.
          await open.call(service, { product: product.declaration, dir })
          return { ok: true, note: `已交给 ${plan.service} 打开入口面板。` }
        } catch (error) {
          warn(error)
          return { ok: false, note: `入口面板打开失败：${message(error)}` }
        }
      }

      // Level 2 — the worktable's own verified triple, in its own order:
      // create(cwd) → agentPresets.select → sessions.open.
      //
      // Read through `lookup`, never as `context.sessions`: a bare read of an
      // undeclared service **throws** (`cannot get property "sessions" without
      // inject`) rather than answering undefined, so `ctx.sessions ?? fallback`
      // dies while evaluating its left operand — before the fallback can run.
      // Measured live on 2026-09-12: pressing this card reported exactly that
      // error and no session was ever created. `ctx.get` is cordis's documented
      // read-without-inject, which is what keeps this plugin optional.
      // Regression guard: tests/launcher-context.spec.ts (real cordis context).
      const sessions = lookup(context, 'sessions')
      const create = method(sessions, 'create')
      if (create === undefined) return { ok: false, note: '没有 sessions 服务，无法新建会话。' }

      let created: unknown
      try {
        created = await create.call(sessions, { cwd: dir })
      } catch (error) {
        warn(error)
        return { ok: false, note: `新建会话失败：${message(error)}` }
      }
      const record = created !== null && typeof created === 'object' ? created as Record<string, unknown> : {}
      const sessionId = typeof created === 'string'
        ? created
        : [record['id'], record['sessionId']].find((v): v is string => typeof v === 'string' && v !== '')
      if (sessionId === undefined) return { ok: false, note: 'sessions.create 没有回会话 id。' }

      const channel = presetsChannel()
      const select = method(channel, 'select')
      let presetNote = ''
      if (select === undefined) {
        presetNote = '（没有 agentPresets.select 通道，会话按默认岗位开）'
      } else {
        // Two calls, both measured against the shipped implementation:
        //
        // (1) **positional** `(agentId, agentPreset)`. The generated contract is
        //     `select: (agentId: SessionId, agentPreset: string)`; all arguments
        //     are passed positionally and the transport binds them by index. A
        //     single object argument fails arity validation in the gateway
        //     ("expected 2 arguments, got 1") before the host sees it.
        //
        // (2) the result is a `RemoteResult`, so `ok: false` is a *returned*
        //     failure, not a throw. Awaiting without reading it reported
        //     "已新建会话（岗位 agt-033）" while the session kept its default
        //     preset — a silent lie about the one thing the user checked.
        try {
          const selected = await select.call(channel, sessionId, plan.preset) as
            | { ok?: unknown; reason?: unknown; result?: { ok?: unknown } }
            | undefined
          // Both shapes occur in the wild (`{ ok }` and `{ result: { ok } }`);
          // `undefined` means the channel answered nothing, which is not a
          // failure either — the note simply stays empty.
          const verdict = selected?.result ?? selected
          if (verdict?.ok === false) {
            presetNote = `（选中岗位 ${plan.preset} 失败：${describeFailure(verdict)}）`
          }
        } catch (error) {
          warn(error)
          presetNote = `（选中岗位 ${plan.preset} 失败：${message(error)}）`
        }
      }

      const open = method(sessions, 'open')
      if (open !== undefined) {
        try {
          await open.call(sessions, sessionId)
        } catch (error) {
          warn(error)
        }
      }
      return { ok: true, note: `已新建会话（目录 ${dir}，岗位 ${plan.preset}）。${presetNote}` }
    },
  }
}
