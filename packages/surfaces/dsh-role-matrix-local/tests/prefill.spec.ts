/**
 * Prefill channel contract.
 *
 * The channel reaches one step inside the shipped conversation plugin's
 * documented input face (`for(ctx)` is implemented as `shell(sessionId)`), so
 * every level of it is probed rather than assumed. These tests pin that probing:
 * a missing service, a shell that throws, and a facade without `setDraft` must
 * each come back as a **reported reason**, because the alternative is a click
 * that visibly does nothing and says nothing.
 */
import { describe, expect, it, vi } from 'vitest'
import { prefillDraft, prefillPrompt } from '../src/client/prefill.ts'

describe('prefillDraft', () => {
  it('writes through the session facade\'s own setDraft', () => {
    const setDraft = vi.fn()
    const outcome = prefillDraft(
      { input: { shell: (id: string) => (id === 's1' ? { actions: { setDraft } } : undefined) } },
      's1',
      '请用「甲」完成「乙」任务：',
    )
    expect(outcome).toEqual({ ok: true })
    expect(setDraft).toHaveBeenCalledWith('请用「甲」完成「乙」任务：')
  })

  it('reports a missing conversation service instead of throwing', () => {
    expect(prefillDraft(undefined, 's1', 'x')).toEqual({ ok: false, reason: expect.stringContaining('shell') })
    expect(prefillDraft({}, 's1', 'x').ok).toBe(false)
    expect(prefillDraft({ input: {} }, 's1', 'x').ok).toBe(false)
    expect(prefillDraft({ input: { shell: 'not a function' } }, 's1', 'x').ok).toBe(false)
  })

  it('reports a shell that throws rather than letting it reach the caller', () => {
    const outcome = prefillDraft({ input: { shell: () => { throw new Error('no such session') } } }, 's1', 'x')
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('no such session') })
  })

  it('reports a facade with no draft channel', () => {
    const outcome = prefillDraft({ input: { shell: () => ({}) } }, 's1', 'x')
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('setDraft') })
  })

  it('reports a setDraft that throws', () => {
    const outcome = prefillDraft(
      { input: { shell: () => ({ actions: { setDraft: () => { throw new Error('locked') } } }) } },
      's1',
      'x',
    )
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('locked') })
  })

  it('refuses an empty session or an empty prompt before touching the service', () => {
    const shell = vi.fn()
    expect(prefillDraft({ input: { shell } }, '', 'x').ok).toBe(false)
    expect(prefillDraft({ input: { shell } }, 's1', '').ok).toBe(false)
    expect(shell).not.toHaveBeenCalled()
  })
})

describe('prefillPrompt', () => {
  it('names both levels the surface showed: platform skill and business skill', () => {
    expect(prefillPrompt('亚马逊品牌保护', '账号诊断')).toBe('请用「亚马逊品牌保护」完成「账号诊断」任务：')
  })
})
