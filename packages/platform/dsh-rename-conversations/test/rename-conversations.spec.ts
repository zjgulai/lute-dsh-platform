import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../lib/index.js'

interface RegisteredTool {
  name: string
  execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

/** 录制 ctx.tools.register 的调用，并注入可控的 sessionController。 */
function context(controller: Record<string, unknown>): { ctx: Record<string, unknown>; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>()
  const ctx = {
    sessionController: controller,
    tools: { register: (tool: RegisteredTool) => { tools.set(tool.name, tool); return () => {} } },
  }
  return { ctx, tools }
}

const SESSION_A = {
  id: 'session-1',
  createdAt: Date.UTC(2026, 8, 11, 2, 0, 0) - 8 * 3600 * 1000 + 8 * 3600 * 1000, // 2026-09-11 10:00 上海
  title: '旧标题',
  events: [{ type: 'user/message', data: { message: { content: [{ text: '  第一条   用户消息  ' }] } } }],
}

describe('dsh-rename-conversations：工具注册与契约', () => {
  it('挂载后注册三个工具，且 inject 声明与实现一致', () => {
    const { ctx, tools } = context({})
    apply(ctx)

    expect([...tools.keys()].sort()).toEqual(['rc_batch_rename', 'rc_probe', 'rc_rename'])
    expect(name).toBe('dsh-rename-conversations')
    expect(inject).toEqual(['sessionController', 'tools'])
  })

  it('rc_probe 输出上海日期（MMDD）与瘦身后的用户文本，且只调用只读方法', async () => {
    const calls: string[] = []
    const { ctx, tools } = context({
      list: async () => {
        calls.push('list')
        return { items: [{ sessionId: 'session-1', cwd: '/tmp/p', updatedAt: 1, blank: false, running: false, projections: { title: '旧标题' } }] }
      },
      inspect: async () => {
        calls.push('inspect')
        // 2026-09-11 10:00（Asia/Shanghai）→ MMDD = 0911
        return {
          meta: { createdAt: Date.UTC(2026, 8, 11, 2, 0, 0), cwd: '/tmp/p', agentPreset: 'standard' },
          events: [
            { type: 'session/title', data: { title: '旧标题' } },
            { type: 'user/message', data: { message: { content: [{ text: '  第一条   用户消息  ' }] } } },
          ],
        }
      },
      rename: async () => {
        calls.push('rename')
        throw new Error('只读工具不得调用 rename')
      },
    })
    apply(ctx)

    const result = await tools.get('rc_probe')!.execute({ sessionIds: ['session-1'] })

    expect(calls).toEqual(['list', 'inspect'])
    const rows = result.rows as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sessionId: 'session-1', title: '旧标题', cwd: '/tmp/p' })

    const details = result.details as Record<string, Record<string, unknown>>
    expect(details['session-1'].createdShanghai).toBe('0911')
    expect(details['session-1'].currentTitle).toBe('旧标题')
    expect(details['session-1'].userTexts).toEqual(['第一条 用户消息'])
    expect(details['session-1'].userMessageCount).toBe(1)
  })

  it('rc_rename 走官方 rename 契约并回传标题与序号', async () => {
    const seen: Array<Record<string, unknown>> = []
    const { ctx, tools } = context({ rename: async (input: Record<string, unknown>) => { seen.push(input); return { title: '新标题', seq: 7 } } })
    apply(ctx)

    const result = await tools.get('rc_rename')!.execute({ sessionId: 'session-1', title: '新标题' })

    expect(seen).toEqual([{ sessionId: 'session-1', title: '新标题' }])
    expect(result).toEqual({ ok: true, title: '新标题', seq: 7 })
  })

  it('rc_rename 的失败以 ok:false 呈现，不抛给模型', async () => {
    const { ctx, tools } = context({ rename: async () => { throw new Error('冷会话恢复失败') } })
    apply(ctx)

    const result = await tools.get('rc_rename')!.execute({ sessionId: 's', title: 't' })

    expect(result).toEqual({ ok: false, error: '冷会话恢复失败' })
  })

  it('rc_batch_rename 对空 sessionId/title 记失败并继续处理其余条目', async () => {
    const renamed: string[] = []
    const { ctx, tools } = context({
      rename: async ({ sessionId, title }: { sessionId: string; title: string }) => { renamed.push(`${sessionId}=${title}`); return { title, seq: 1 } },
    })
    apply(ctx)

    const result = await tools.get('rc_batch_rename')!.execute({
      renames: [
        { sessionId: 'a', title: '甲' },
        { sessionId: '', title: '乙' },
        { sessionId: 'c', title: '丙' },
      ],
    })

    expect(renamed).toEqual(['a=甲', 'c=丙'])
    expect(result.success).toBe(2)
    expect(result.failed).toBe(1)
    const results = result.results as Array<Record<string, unknown>>
    expect(results[1]).toMatchObject({ sessionId: '', ok: false })
  })
})
