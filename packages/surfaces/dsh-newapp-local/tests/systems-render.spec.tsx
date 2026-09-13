/**
 * The systems section, rendered — the assertions that only exist once React has run.
 *
 * The pure core is covered by `systems.spec.ts`; what this file adds is the one
 * question arithmetic cannot answer: **is it actually on the page, grouped the
 * way the role map says, and does the button do what it claims?**
 *
 * Three claims, each of which has a silent failure mode:
 *
 *  1. **Every system renders exactly once.** Duplicating a card into its
 *     secondary roles would show 31 systems as an apparent 45 — a parser cannot
 *     see that, only the committed DOM can.
 *  2. **A role the roster does not know still renders, marked.** A renamed
 *     preset must not make systems disappear from a page that looks complete.
 *  3. **A card that cannot open says so in text.** The shell denies
 *     `target="_blank"` for http(s), so the open goes through the host; when the
 *     host is not there, the card must refuse *before* the click, with the reason
 *     written next to it rather than hidden in a tooltip.
 *
 * jsdom performs no layout, so nothing here asserts geometry: the grid's real
 * column count belongs to a browser probe, not to this file.
 */
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemsApi } from '../src/client/api.ts'
import { SystemsSection } from '../src/client/SystemsSection.tsx'
import { ROSTER_ROUTE } from '../src/client/launcher.ts'

/** React 18 reads this to decide whether `act` should warn. */
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** One system, as the host route serves it. */
function system(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'video',
    name: 'AI 原生视频系统',
    nameEn: 'AI Native Video',
    desc: 'AI 视频生成 · 资产管理 · 长视频与品牌内容工作流',
    descEn: 'Native AI video creation platform',
    kind: 'Docker 应用',
    tags: ['AI Video', 'Next.js'],
    cta: '打开视频系统',
    href: 'https://video.lute-tlz-dddd.top',
    host: 'video.lute-tlz-dddd.top',
    icon: [{ tag: 'path', attrs: { d: 'M4 4h16', stroke: 'currentColor', 'stroke-width': '1.8' } }],
    primary: 'AGT-031',
    also: ['AGT-030'],
    reachable: true,
    loginRequired: false,
    ...overrides,
  }
}

/** The roster payload `dsh-role-matrix-local` publishes. */
const ROSTER = {
  planes: [
    {
      name: '业务运营',
      domains: [
        {
          name: '品牌与增长',
          roles: [
            { id: 'agt-030', name: '叙事 · 内容与创意策划' },
            { id: 'agt-031', name: '绘影 · 视觉视频与素材生产' },
          ],
        },
      ],
    },
  ],
}

/** A systems api double: no network, no opener, everything observable. */
function fakeApi(systems: unknown[], openRoute = '/api/dsh-newapp/open-system'): SystemsApi {
  return {
    systems: async () => ({
      ok: true,
      view: { systems, probedOn: '2026-09-13', openRoute, dropped: [] },
    }),
    openSystem: async () => ({ ok: true }),
  } as unknown as SystemsApi
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

/** Mount the section and let both of its reads settle. */
async function render(api: SystemsApi, roster: unknown = ROSTER): Promise<void> {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === ROSTER_ROUTE) {
      return new Response(JSON.stringify(roster), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response('{}', { status: 404 })
  })
  await act(async () => {
    root.render(<SystemsSection api={api} />)
  })
  // Two chained awaits inside the effect: one for the fetch pair, one for the
  // state update they trigger.
  await act(async () => { await Promise.resolve() })
}

/** Every system card in the DOM. */
function cards(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-dsh-part="system-card"]')]
}

/** Every role group in the DOM. */
function groups(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-dsh-part="role-group"]')]
}

describe('the systems section renders', () => {
  it('draws one card per system, exactly once', async () => {
    await render(fakeApi([
      system({ slug: 'video', name: 'AI 原生视频系统' }),
      system({ slug: 'redbook', name: 'AI 效能公式链', primary: 'AGT-030', also: [] }),
    ]))
    // The claim that matters: 2 systems, 2 cards — not 3, which is what happens
    // the moment secondary roles start rendering their own copies.
    expect(cards()).toHaveLength(2)
    expect(cards().map((card) => card.dataset['dshSlug'])).toEqual(['redbook', 'video'].sort())
  })

  it('groups by primary role and names the group from the roster', async () => {
    await render(fakeApi([
      system({ slug: 'video', primary: 'AGT-031' }),
      system({ slug: 'redbook', name: 'AI 效能公式链', primary: 'AGT-030', also: [] }),
    ]))
    expect(groups().map((group) => group.dataset['dshRole'])).toEqual(['AGT-030', 'AGT-031'])
    // The label is the roster's own words, with the id: that is what makes the
    // group identifiable against the role matrix plugin.
    expect(container.textContent).toContain('AGT-031 绘影 · 视觉视频与素材生产')
    expect(container.textContent).toContain('业务运营 · 品牌与增长')
  })

  it('keeps a system whose role the roster does not know, and marks it', async () => {
    await render(fakeApi([system({ slug: 'ghost', primary: 'AGT-099' })]))
    expect(cards()).toHaveLength(1)
    expect(groups()[0]?.dataset['dshRole']).toBe('AGT-099')
    expect(container.textContent).toContain('AGT-099')
  })

  it('puts the six facts on the card, including the portal’s own call to action', async () => {
    await render(fakeApi([system()]))
    const text = cards()[0]?.textContent ?? ''
    expect(text).toContain('AI 原生视频系统')
    expect(text).toContain('AI Native Video')
    expect(text).toContain('Docker 应用')
    expect(text).toContain('AI Video')
    expect(text).toContain('AGT-031')
    // The secondary role is a chip on the card, not a second card.
    expect(text).toContain('叙事 · 内容与创意策划')
    // The button says what the portal says, not a generic word.
    expect(text).toContain('打开视频系统')
  })

  it('reports coverage of the role matrix rather than implying it covers everything', async () => {
    await render(fakeApi([system({ primary: 'AGT-031' })]))
    expect(container.textContent).toContain('覆盖')
    expect(container.textContent).toContain('2026-09-13')
  })

  it('warns when the entry itself is the login page', async () => {
    await render(fakeApi([system({ loginRequired: true })]))
    expect(container.textContent).toContain('入口即登录页')
  })

  it('renders the icon as real SVG elements, not injected markup', async () => {
    await render(fakeApi([system()]))
    const svg = cards()[0]?.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('path')).not.toBeNull()
  })

  it('filters by a secondary role, which is the only path from that role to this card', async () => {
    await render(fakeApi([
      system({ slug: 'video', primary: 'AGT-031', also: ['AGT-030'] }),
      system({ slug: 'supply', name: '供应链治理', primary: 'AGT-045', also: [] }),
    ]))
    const input = container.querySelector<HTMLInputElement>('[data-dsh-part="systems-search"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '叙事')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(cards()).toHaveLength(1)
    expect(cards()[0]?.dataset['dshSlug']).toBe('video')
  })
})

describe('the section refuses instead of lying', () => {
  it('disables every card, with the reason in text, when the host published no open route', async () => {
    // An older host half: catalog yes, opener no. There is no browser-side
    // fallback in this shell, so the only honest card is a refused one.
    await render(fakeApi([system()], ''))
    const card = cards()[0]!
    expect(card.hasAttribute('disabled')).toBe(true)
    expect(card.dataset['dshState']).toBe('blocked')
    expect(container.textContent).toContain('宿主半边未加载')
  })

  it('leaves the card enabled when the host published its open route', async () => {
    await render(fakeApi([system()]))
    expect(cards()[0]?.hasAttribute('disabled')).toBe(false)
    expect(cards()[0]?.dataset['dshState']).toBe('ready')
  })

  it('says the catalog failed rather than showing an empty section', async () => {
    const failing = {
      systems: async () => ({ ok: false, reason: '宿主半边没加载' }),
      openSystem: async () => ({ ok: true }),
    } as unknown as SystemsApi
    await render(failing)
    expect(cards()).toHaveLength(0)
    expect(container.textContent).toContain('宿主半边没加载')
  })
})
