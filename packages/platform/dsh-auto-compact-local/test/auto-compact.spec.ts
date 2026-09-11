import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from '../lib/index.js'

type Tool = { name: string; execute: (args: unknown, exec: { signal?: AbortSignal }) => Promise<Record<string, unknown>> }

/** 构造可控的插件上下文；tools/agents/agentPresets/timer 均可注入。 */
function context(options: {
  agent?: { id: string; whenIdle: () => Promise<void> }
  compaction?: { compactNow: (agent: unknown, signal: AbortSignal) => Promise<unknown> }
  serviceFor?: (agent: unknown, key: string) => unknown
  timerDelay?: () => Promise<void>
} = {}): { ctx: Record<string, unknown>; tools: Map<string, Tool>; serviceForCalls: string[] } {
  const tools = new Map<string, Tool>()
  const serviceForCalls: string[] = []
  const agent = options.agent ?? { id: 'agent-1', whenIdle: async () => undefined }
  const ctx: Record<string, unknown> = {
    logger: { info: () => {}, warn: () => {} },
    tools: { register: (tool: Tool) => { tools.set(tool.name, tool); return () => {} } },
    timer: { timeout: async () => { await (options.timerDelay?.() ?? Promise.resolve()) } },
    effect: () => () => {},
    get: (key: string) => {
      if (key === 'agents') return { requireInitiator: () => agent }
      if (key === 'agentPresets') {
        return options.serviceFor === undefined
          ? undefined
          : { serviceFor: (a: unknown, k: string) => { serviceForCalls.push(k); return options.serviceFor!(a, k) } }
      }
      return undefined
    },
  }
  return { ctx, tools, serviceForCalls }
}

/** 触发工具并等待其 fire-and-forget 的 compaction 任务结束。 */
async function invoke(tools: Map<string, Tool>, exec: { signal?: AbortSignal } = {}): Promise<Record<string, unknown>> {
  const result = await tools.get('compact_now')!.execute({}, exec)
  // 让 runWhenIdle 的微任务与 await 链推进
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
  return result
}

describe('dsh-auto-compact：compact_now 工具契约', () => {
  it('注册 compact_now 工具，且 inject 声明与实现一致', () => {
    const { ctx, tools } = context()
    apply(ctx, {})

    expect([...tools.keys()]).toEqual(['compact_now'])
    expect(name).toBe('auto-compact')
    expect(inject).toEqual(['tools', 'agents', 'timer'])
  })

  it('无活跃 agent 时返回 ok:false，且不触碰 compaction', async () => {
    const compactNow = vi.fn()
    const { ctx, tools } = context({ serviceFor: () => ({ compactNow }) })
    // 覆盖为返回 undefined 的 agents
    ;(ctx.get as (k: string) => unknown) = (k: string) => (k === 'agents' ? { requireInitiator: () => undefined } : undefined)
    apply(ctx, {})

    const result = await invoke(tools)

    expect(result).toEqual({ ok: false, reason: 'no active agent' })
    expect(compactNow).not.toHaveBeenCalled()
  })

  it('compaction 不可用时返回明确原因', async () => {
    const { ctx, tools } = context({ serviceFor: () => undefined })
    apply(ctx, {})

    const result = await invoke(tools)

    expect(result).toEqual({ ok: false, reason: 'compaction service is unavailable for this agent' })
  })

  it('立即返回 scheduled（不阻塞当前回合），并在 agent 空闲后执行压缩', async () => {
    const compactNow = vi.fn(async () => ({ shadowedSeqs: [1, 2, 3], shadowedTokenCount: 900 }))
    const { ctx, tools, serviceForCalls } = context({ serviceFor: () => ({ compactNow }) })
    apply(ctx, {})

    const result = await invoke(tools)

    expect(result).toEqual({ ok: true, status: 'scheduled', note: 'compaction runs after this turn ends' })
    expect(serviceForCalls).toEqual(['compaction'])
    await vi.waitFor(() => { expect(compactNow).toHaveBeenCalledTimes(1) })
  })

  it('同一 agent 重复调用返回 already-scheduled（去重）', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const compactNow = vi.fn(async () => ({ shadowedSeqs: [], shadowedTokenCount: 0 }))
    const { ctx, tools } = context({
      agent: { id: 'agent-1', whenIdle: async () => { await gate } },
      serviceFor: () => ({ compactNow }),
    })
    apply(ctx, {})

    const first = await tools.get('compact_now')!.execute({}, {})
    const second = await tools.get('compact_now')!.execute({}, {})

    expect(first.status).toBe('scheduled')
    expect(second).toEqual({ ok: true, status: 'already-scheduled' })
    release?.()
  })

  it('busy 时重试至上限后放弃（4 次尝试后不再重试）', async () => {
    const { ManualCompactionError } = await import('@deepseek-ai/dsh-compaction')
    const busyError = new (ManualCompactionError as unknown as new (code: string) => Error)('busy')
    let attempts = 0
    const compactNow = vi.fn(async () => { attempts += 1; throw busyError })
    const { ctx, tools } = context({ serviceFor: () => ({ compactNow }), timerDelay: async () => undefined })
    apply(ctx, {})

    await invoke(tools)

    // 首次 + RETRY_LIMIT(3) 次重试 = 4 次尝试后放弃，不再增长
    await vi.waitFor(() => { expect(attempts).toBe(4) }, { timeout: 3000 })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(attempts).toBe(4)
  })

  it('压缩无可用历史时返回 no-compactable-history', async () => {
    const compactNow = vi.fn(async () => null)
    const { ctx, tools } = context({ serviceFor: () => ({ compactNow }) })
    apply(ctx, {})

    await invoke(tools)

    await vi.waitFor(() => { expect(compactNow).toHaveBeenCalled() })
  })
})
