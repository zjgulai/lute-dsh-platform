/**
 * Hero-entry contract: placement, idempotency, self-healing, and the two rules
 * that decide whether the row exists at all (R6 phase/preset, R4 empty state).
 *
 * What jsdom can and cannot answer here, stated so this file is not mistaken for
 * more than it is: jsdom does no layout, so **every geometric claim** — the row
 * sitting under the input, sharing its width axis, three columns at 992px — is
 * `getBoundingClientRect() === 0` and cannot be asserted here. Those live in the
 * real-Chrome probe (`scripts/acceptance/role-hero-entry-live.mjs`). What jsdom
 * *can* pin is everything structural: which node is where, how many rows exist,
 * which text appears, and which callbacks fire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { CapabilitiesResult, MatrixApi, PresetCapabilities } from '../src/client/api.ts'
import { mountHeroEntry } from '../src/client/hero-entry.tsx'
import { HERO_ENTRY_ROW_ATTR } from '../src/client/hero-entry-core.ts'

/** Build the shipped composer shape: seat → stack → input outlet. */
function composer(): void {
  document.body.innerHTML = [
    '<div data-composer-seat>',
    '  <div class="stack">',
    '    <div data-slot="conversation.composer.bar"></div>',
    '  </div>',
    '</div>',
  ].join('\n')
}

/** The row host, or undefined. */
function row(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(`[${HERO_ENTRY_ROW_ATTR}]`) ?? undefined
}

/** The shipped input outlet. */
function bar(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="conversation.composer.bar"]')!
}

/**
 * Expand the first group column.
 *
 * Columns start **collapsed**, so any test about a card, a boundary note or an
 * empty-state sentence has to open the column first — and that is the point: the
 * body is not in the DOM until a reader asks for it.
 */
async function expandFirstGroup(): Promise<void> {
  const header = row()!.querySelector('button')!
  await act(async () => { header.click() })
}

/** A minimal projection; individual tests override what they exercise. */
function projection(over: Partial<PresetCapabilities> = {}): PresetCapabilities {
  return {
    preset: 'agt-027',
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
    ...over,
  }
}

/** A MatrixApi stub that answers one preset and records calls. */
function apiFor(result: CapabilitiesResult): { api: MatrixApi; calls: string[] } {
  const calls: string[] = []
  const api = {
    capabilities: async (preset: string): Promise<CapabilitiesResult> => {
      calls.push(preset)
      return result
    },
  } as unknown as MatrixApi
  return { api, calls }
}

/** Signals over mutable state, with a manual notify. */
function signalsFor(initial: { preset?: string; hero: boolean }): {
  signals: { preset: () => string | undefined; hero: () => boolean; subscribe: (l: () => void) => () => void }
  set: (next: { preset?: string; hero: boolean }) => void
} {
  let state = { ...initial }
  const listeners = new Set<() => void>()
  return {
    signals: {
      preset: () => state.preset,
      hero: () => state.hero,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    set: (next) => {
      state = { ...next }
      for (const listener of listeners) listener()
    },
  }
}

/**
 * Let the mount's async fetch, React's render and the observer callbacks settle.
 *
 * A macrotask, not a microtask: the capability read resolves through a promise
 * chain *and* the placement observer fires off the DOM mutation React just made,
 * so a single `await Promise.resolve()` returns while a render is still queued —
 * which React reports as an unwrapped update.
 */
async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
}

/**
 * Mount inside `act`, and remember the handle so teardown is also wrapped.
 *
 * `mountHeroEntry` subscribes and converges synchronously, and its React root is
 * created on the first successful read — both of which must happen inside an
 * `act` scope or React reports the resulting update as unwrapped.
 */
let live: { dispose(): void } | undefined
async function mountRow(
  api: MatrixApi,
  signals: Parameters<typeof mountHeroEntry>[1],
  onPick: Parameters<typeof mountHeroEntry>[2] = () => {},
): Promise<ReturnType<typeof mountHeroEntry>> {
  let created!: ReturnType<typeof mountHeroEntry>
  await act(async () => { created = mountHeroEntry(api, signals, onPick) })
  live = created
  return created
}

beforeEach(() => {
  composer()
  document.documentElement.removeAttribute('data-dsh-hero-entry')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(async () => {
  // `dispose()` defers its React unmount by one microtask (unmounting during a
  // render pass throws), so the flush has to happen inside `act` — otherwise the
  // teardown of every test lands as an unwrapped update.
  await act(async () => {
    live?.dispose()
    live = undefined
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  })
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('placement', () => {
  it('places the row immediately after the input outlet', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    expect(row()).toBeDefined()
    expect(row()!.previousElementSibling).toBe(bar())
  })

  it('is idempotent: a second sync adds no second row', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    const mount = await mountRow(api, signals)
    await settle()
    await act(async () => { mount.sync(); mount.sync() })
    await settle()
    expect(document.querySelectorAll(`[${HERO_ENTRY_ROW_ATTR}]`)).toHaveLength(1)
  })

  it('re-places the same node when a re-render moves it, instead of adding one', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    const placed = row()!
    // What the shipped composer subtree does to an injected node: relocate it.
    document.body.appendChild(placed)
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
    expect(document.querySelectorAll(`[${HERO_ENTRY_ROW_ATTR}]`)).toHaveLength(1)
    expect(row()).toBe(placed)
    expect(placed.previousElementSibling).toBe(bar())
  })

  it('re-places the row when the shell drops it', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    row()!.remove()
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
    expect(row()).toBeDefined()
    expect(row()!.previousElementSibling).toBe(bar())
  })

  it('reports the missing anchor instead of failing silently', async () => {
    document.body.innerHTML = '<div>no composer here</div>'
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    expect(row()).toBeUndefined()
    expect(document.documentElement.dataset['dshHeroEntry']).toBe('no-seat')
  })
})

describe('when the row exists (R6)', () => {
  it('renders for a role preset while the session is blank', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    expect(row()!.textContent).toContain('AGT-027 守店')
    expect(row()!.textContent).toContain('账号诊断')
    expect(row()!.textContent).toContain('存量GMV联合经营')
    await expandFirstGroup()
    expect(row()!.textContent).toContain('亚马逊品牌保护')
  })

  it('leaves the first message (hero → active) with no row', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals, set } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    expect(row()).toBeDefined()
    set({ preset: 'agt-027', hero: false })
    await settle()
    expect(row()).toBeUndefined()
  })

  it('renders nothing for a session with no role preset', async () => {
    const { api, calls } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ hero: true })
    await mountRow(api, signals)
    await settle()
    expect(row()).toBeUndefined()
    expect(calls).toEqual([])
  })

  it('renders nothing when the preset is missing, and says nothing alarming', async () => {
    const { api } = apiFor({ ok: false, missing: true, reason: '未安装' })
    const { signals } = signalsFor({ preset: 'agt-050', hero: true })
    await mountRow(api, signals)
    await settle()
    expect(row()).toBeUndefined()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('reports a real read failure to the console', async () => {
    const { api } = apiFor({ ok: false, missing: false, reason: 'HTTP 500' })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    expect(row()).toBeUndefined()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 500'))
  })

  it('memoises per preset so re-syncing costs no second request', async () => {
    const { api, calls } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    const mount = await mountRow(api, signals)
    await settle()
    await act(async () => { mount.sync() })
    await settle()
    expect(calls).toEqual(['agt-027'])
  })
})

describe('content rules', () => {
  it('collapsed by default: the header alone carries name, grade and count', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    const header = row()!.querySelector('button')!
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(header.textContent).toContain('账号诊断')
    expect(header.textContent).toContain('partial')
    expect(header.textContent).toContain('1')
    // The body — note text and cards — must not be in the DOM until asked for.
    expect(row()!.textContent).not.toContain('亚马逊品牌保护')
    expect(row()!.textContent).not.toContain('有品牌保护与合规监测，无店铺账号健康度诊断')
  })

  it('the header opens the column, and closes it again', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    const header = row()!.querySelector('button')!
    await act(async () => { header.click() })
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(row()!.textContent).toContain('亚马逊品牌保护')
    await act(async () => { header.click() })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(row()!.textContent).not.toContain('亚马逊品牌保护')
  })

  it('gives an uncovered business skill words, never a placeholder card (R4)', async () => {
    const gap = projection({
      groups: [{ name: '需求分诊', kind: 'gap', note: '', supplies: [] }],
    })
    const { api } = apiFor({ ok: true, value: gap })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    await expandFirstGroup()
    expect(row()!.textContent).toContain('没有任何对应供给')
    expect(row()!.querySelectorAll('button')).toHaveLength(1) // the column header only
  })

  it('shows the boundary note verbatim', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    await expandFirstGroup()
    expect(row()!.textContent).toContain('有品牌保护与合规监测，无店铺账号健康度诊断')
  })

  it('hands the pick back with both levels: the platform skill and its business skill', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    const picked: Array<[string, string]> = []
    await mountRow(api, signals, (supply, groupName) => { picked.push([supply.label, groupName]) })
    await settle()
    await expandFirstGroup()
    const card = [...row()!.querySelectorAll('button')].find((b) => b.textContent?.includes('亚马逊品牌保护'))
    expect(card).toBeDefined()
    await act(async () => { card!.click() })
    expect(picked).toEqual([['亚马逊品牌保护', '账号诊断']])
  })

  it('reports a thin projection on the surface itself', async () => {
    const { api } = apiFor({ ok: true, value: projection({ groups: [], manuals: [], degraded: 'manifest 里没有业务技能映射' }) })
    const { signals } = signalsFor({ preset: 'agt-027', hero: true })
    await mountRow(api, signals)
    await settle()
    expect(row()!.textContent).toContain('manifest 里没有业务技能映射')
  })
})

describe('dispose', () => {
  it('removes the row and stops reacting to later changes', async () => {
    const { api } = apiFor({ ok: true, value: projection() })
    const { signals, set } = signalsFor({ preset: 'agt-027', hero: true })
    const mount = await mountRow(api, signals)
    await settle()
    await act(async () => { mount.dispose() })
    expect(row()).toBeUndefined()
    set({ preset: 'agt-027', hero: true })
    await settle()
    expect(row()).toBeUndefined()
  })
})
