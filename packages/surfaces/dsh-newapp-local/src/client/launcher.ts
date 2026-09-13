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

/**
 * Read a value as a plain record, or reject it.
 *
 * Used on the payload the drawer hands `run`: the panel branch peels through
 * unknown shapes, and an array or a string masquerading as `.declaration` must
 * fail the probe rather than the click.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
 * The roster route, and the browser half's only copy of this literal.
 *
 * `launcher.ts` reads the roster — for the preset check, for the systems
 * section's role labels, and for nothing else. Keeping the literal here is what
 * makes "one reader per published route" checkable by grepping, rather than a
 * convention two modules have to remember.
 */
export const ROSTER_ROUTE = '/api/dsh-role-matrix/list'

/** One role, as `dsh-role-matrix-local` publishes it. */
export interface RoleLabel {
  /** The preset id as the roster spells it (`agt-031`). */
  id: string
  name: string
  plane: string
  domain: string
}

/**
 * Read the roster this machine publishes.
 *
 * The roster is `dsh-role-matrix-local`'s route, and **this module is its one
 * reader** — a declared route literal for it appears here and nowhere else in
 * the browser half, because two readers of one owner's route is the drift
 * ADR-0009 forbids. The launcher wants it for one question (does the preset a
 * product declares exist here?); the systems section wants the labels, to say
 * which role owns which system. Both read this function's answer.
 *
 * The keys are the ids exactly as published (`agt-031`). Callers that join
 * against data spelled differently normalise on their side, where the reason for
 * the difference is visible.
 * @param agentsRoute - the roster route.
 * @returns role id → label, or `undefined` when the roster could not be read.
 */
export async function readRoster(agentsRoute: string): Promise<Map<string, RoleLabel> | undefined> {
  try {
    const response = await fetch(agentsRoute, { headers: { accept: 'application/json' } })
    if (!response.ok) return undefined
    const payload = (await response.json()) as unknown
    const planes = (payload as { planes?: unknown }).planes
    if (!Array.isArray(planes)) return undefined
    const labels = new Map<string, RoleLabel>()
    for (const planeRaw of planes) {
      const plane = planeRaw as { name?: unknown; domains?: unknown }
      const planeName = typeof plane.name === 'string' ? plane.name : ''
      if (!Array.isArray(plane.domains)) continue
      for (const domainRaw of plane.domains) {
        const domain = domainRaw as { name?: unknown; roles?: unknown }
        const domainName = typeof domain.name === 'string' ? domain.name : ''
        if (!Array.isArray(domain.roles)) continue
        for (const roleRaw of domain.roles) {
          const role = roleRaw as { id?: unknown; name?: unknown }
          if (typeof role.id !== 'string' || role.id === '') continue
          labels.set(role.id, {
            id: role.id,
            name: typeof role.name === 'string' ? role.name : role.id,
            plane: planeName,
            domain: domainName,
          })
        }
      }
    }
    return labels
  } catch {
    return undefined
  }
}

/**
 * The preset ids, for the launcher's one question.
 * @param agentsRoute - the roster route.
 * @returns the ids, or `undefined` when the roster could not be read.
 */
async function fetchPresetIds(agentsRoute: string): Promise<Set<string> | undefined> {
  const labels = await readRoster(agentsRoute)
  return labels === undefined ? undefined : new Set(labels.keys())
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
export function createLauncher(ctx: unknown, agentsRoute = ROSTER_ROUTE): AppLauncher {
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

  /**
   * The host agentPresets channel, or undefined.
   *
   * Two carriers exist. `ctx.get('agentPresets')` is the shell's own registry
   * read — the same carrier `sessions` arrives through, so it is tried first.
   * `connection.api.agentPresets` is the typert bridge shape this module was
   * written against; it stays as the fallback because a shell that mirrors host
   * services through `ctx` only partially (or an older shell) still answers on
   * the connection api table. A candidate counts as a channel only when it
   * actually carries a callable `select` — a truthy lookup without the method
   * is a wrong guess, not a channel.
   */
  const presetsChannel = (): unknown => {
    const direct = lookup(context, 'agentPresets')
    if (direct !== undefined && method(direct, 'select') !== undefined) return direct
    const connection = lookup(context, 'connection') as
      { api?: { agentPresets?: unknown }; remote?: { agentPresets?: unknown } } | undefined
    const bridged = connection?.api?.agentPresets ?? connection?.remote?.agentPresets
    if (bridged !== undefined && method(bridged, 'select') !== undefined) return bridged
    return direct ?? bridged
  }

  /**
   * One-shot channel probe: what the shell actually exposes, written to
   * localStorage so the next launch can be diagnosed from the leveldb without
   * asking for a DevTools paste. Never throws — a probe that takes the drawer
   * down would be worse than the bug it hunts.
   */
  const probeChannels = (): void => {
    try {
      if (typeof localStorage === 'undefined') return
      const connection = lookup(context, 'connection') as
        { api?: unknown; remote?: unknown } | undefined
      const api = connection?.api
      const remote = connection?.remote
      const apiIsObject = api !== null && typeof api === 'object'
      const remoteIsObject = remote !== null && typeof remote === 'object'
      localStorage.setItem('dsh-newapp-probe', JSON.stringify({
        t: Date.now(),
        connectionApiKeys: apiIsObject ? Object.keys(api as object) : null,
        connectionApiHasAgentPresets: apiIsObject && 'agentPresets' in (api as object),
        connectionRemoteKeys: remoteIsObject ? Object.keys(remote as object) : null,
        connectionRemoteHasAgentPresets: remoteIsObject && 'agentPresets' in (remote as object),
        ctxHasAgentPresets: lookup(context, 'agentPresets') !== undefined,
        ctxHasSessions: lookup(context, 'sessions') !== undefined,
      }))
    } catch {
      /* probe must never throw */
    }
  }

  return {
    prime(): Promise<void> {
      probeChannels()
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
          //
          // The entry feature is resolved from workflow.entry when present so
          // the panel never has to guess which feature is the entry point.
          //
          // The peel matters: production once delivered the drawer's view
          // wrapped around the host's view (probe `dsh-kolhunter-probe`,
          // 2026-09-13 — hasDeclaration:true, inputCount:-1), so peeling a
          // single `.declaration` landed on a layer whose `features[]` were
          // summaries without `inputs`. The raw declaration is the innermost
          // layer; peel until no layer below it carries a `.declaration`.
          let declaration: Record<string, unknown> = isRecord(product.declaration)
            ? product.declaration
            : product as unknown as Record<string, unknown>
          for (let depth = 0; isRecord(declaration['declaration']) && depth < 3; depth += 1) {
            declaration = declaration['declaration']
          }
          const features = Array.isArray(declaration['features'])
            ? declaration['features'].filter(isRecord)
            : []
          const workflow = isRecord(declaration['workflow']) ? declaration['workflow'] : {}
          const entryId = typeof workflow['entry'] === 'string' ? workflow['entry'] : ''
          // Prefer the entry feature that actually declares inputs: a summary
          // feature (an id without `inputs`) cannot drive a form, and the panel
          // reconciles by id anyway (see the KOL-Hunter client's
          // resolvePanelTarget).
          const named = features.filter((f) => f['id'] === entryId)
          const carriesInputs = (f: Record<string, unknown>): boolean =>
            Array.isArray(f['inputs']) && f['inputs'].length > 0
          const entryFeature = named.find(carriesInputs) ?? named[0] ?? features[0]
          await open.call(service, {
            product: declaration,
            feature: entryFeature,
            dir,
          })
          return { ok: true, note: `已交给 ${plan.service} 打开入口面板。` }
        } catch (error) {
          warn(error)
          return { ok: false, note: `入口面板打开失败：${message(error)}` }
        }
      }

      // Level 2 — open the product's declared preset in a new session.
      //
      // Two shell generations exist and they expect different call shapes:
      //
      //   A. Current DSH base: `agentPresets` is NOT exposed to this client
      //      plugin context, but `sessions.create({ cwd, agentPreset })` accepts
      //      the preset at creation time. The host session controller mounts the
      //      preset inside the agent factory setup, so a separate `select` call
      //      is unnecessary.
      //   B. Older typert-bridge shells: `agentPresets` IS exposed (via
      //      `connection.api.agentPresets` or `ctx.agentPresets`) and the
      //      creation call only accepts `cwd`; the preset must be selected in a
      //      second RPC.
      //
      // We branch on whether a usable `agentPresets` channel exists: if it does,
      // use the old triple (create → select → open); otherwise use the new pair
      // (create with agentPreset → open). This avoids a failed create call on
      // shells that reject unknown options.
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

      const channel = presetsChannel()
      const select = method(channel, 'select')
      let created: unknown
      let presetNote = ''

      if (select === undefined) {
        // Path A — create with preset.
        try {
          created = await create.call(sessions, { cwd: dir, agentPreset: plan.preset })
        } catch (error) {
          warn(error)
          return { ok: false, note: `新建会话失败：${message(error)}` }
        }
      } else {
        // Path B — old triple: create(cwd) → select → open.
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

        // Positional `(agentId, agentPreset)` — the generated contract binds
        // arguments by index; a single object argument fails arity validation.
        // The result is a `RemoteResult`, so `ok: false` is a returned failure,
        // not a throw.
        try {
          const selected = await select.call(channel, sessionId, plan.preset) as
            | { ok?: unknown; reason?: unknown; result?: { ok?: unknown } }
            | undefined
          const verdict = selected?.result ?? selected
          if (verdict?.ok === false) {
            presetNote = `（选中岗位 ${plan.preset} 失败：${describeFailure(verdict)}）`
          }
        } catch (error) {
          warn(error)
          presetNote = `（选中岗位 ${plan.preset} 失败：${message(error)}）`
        }
      }

      const record = created !== null && typeof created === 'object' ? created as Record<string, unknown> : {}
      const sessionId = typeof created === 'string'
        ? created
        : [record['id'], record['sessionId']].find((v): v is string => typeof v === 'string' && v !== '')
      if (sessionId === undefined) return { ok: false, note: 'sessions.create 没有回会话 id。' }

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
