/**
 * Page render contract: the settings page, mounted and drilled.
 *
 * The host routes were already covered, and that was not enough — a page whose
 * host half answers 200 and whose section never appears looks identical from the
 * outside to a page that works. So this file mounts the real component, drives
 * it through 面 → 责任域 → 岗位 → 卡, and asserts what a person would see.
 *
 * What it pins, in order of how easy each is to break:
 *
 *  - Every level opens *collapsed*. The first impression must be the shape of
 *    the organization, not 1338 cards; a default-open regression reads as a
 *    performance bug and a design bug at once.
 *  - Placement is stated honestly: 未归类 cards render in their own trailing
 *    group, and a card's wiring tag distinguishes 「本岗已接线」 from
 *    「接线到 X」 from 「未接线」. These three are different facts about a card
 *    and collapsing them would overstate how many cards the model can reach.
 *  - An empty role says so, rather than rendering as an absent row.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TreePayload } from '../src/wire.ts'
import { AlgoSkillsPage } from '../src/client/AlgoSkillsPage.tsx'

/** One card of each wiring shape, so every chip branch is exercised. */
const payload: TreePayload = {
  ok: true,
  root: '/Users/lute/.dsh/skills',
  presetRoot: '/Users/lute/.dsh/.agent-presets',
  totals: {
    planes: 2,
    domainSlices: 2,
    distinctDomains: 2,
    roles: 3,
    skills: 4,
    placed: 3,
    unplaced: 1,
    wired: 1,
    wiredAnywhere: 2,
    emptyRoles: 1,
  },
  planes: [
    {
      id: 'PLN-MGT',
      name: '经营管理',
      purpose: '目标、优先级、资源约束',
      icon: 'data:image/svg+xml;base64,AA==',
      domains: [
        {
          id: 'DOM-01',
          name: '经营与组织',
          icon: 'data:image/svg+xml;base64,AA==',
          roles: [
            {
              id: 'agt-001',
              agt: 'AGT-001',
              alias: '衡远',
              title: '经营目标与资源统筹',
              name: '衡远 · 经营目标与资源统筹',
              description: '【经营管理·经营与组织】把GMV目标转为可执行优先级',
              icon: 'data:image/svg+xml;base64,AA==',
              order: 1101,
              artifact: '目标与资源决策包',
              metrics: '目标执行偏差',
              responsibilities: ['经营目标拆解与优先级排序'],
              wired: 1,
              skills: [
                {
                  name: 'p2s-wired-here',
                  title: '本岗接线的卡',
                  summary: '已接线的一张',
                  modelEnabled: true,
                  srcDomain: '04-供应链',
                  cardId: 'Skill-Wired',
                  alsoServes: ['经营目标拆解与优先级排序'],
                  wired: true,
                  wiredElsewhere: [],
                },
                {
                  name: 'p2s-drift',
                  title: '接线到别处的卡',
                  summary: '',
                  modelEnabled: false,
                  srcDomain: '18-物流履约',
                  cardId: 'Skill-Drift',
                  alsoServes: [],
                  wired: false,
                  wiredElsewhere: ['AGT-019'],
                },
                {
                  name: 'p2s-nowhere',
                  title: '没接线的卡',
                  summary: '谁也没装它',
                  modelEnabled: false,
                  srcDomain: '',
                  cardId: 'Skill-Nowhere',
                  alsoServes: [],
                  wired: false,
                  wiredElsewhere: [],
                },
              ],
            },
            {
              id: 'agt-011',
              agt: 'AGT-011',
              alias: '砺器',
              title: '硬件结构与材料工程',
              name: '砺器 · 硬件结构与材料工程',
              description: '【经营管理·经营与组织】硬件结构',
              icon: '',
              order: 1102,
              artifact: '',
              metrics: '',
              responsibilities: [],
              wired: 0,
              skills: [],
            },
          ],
        },
      ],
    },
    {
      id: 'PLN-OPS',
      name: '业务运营',
      purpose: '把经营决策落成日常动作',
      icon: '',
      domains: [
        {
          id: 'DOM-03',
          name: '供应与履约',
          icon: '',
          roles: [
            {
              id: 'agt-019',
              agt: 'AGT-019',
              alias: '通途',
              title: '跨境物流与关务',
              name: '通途 · 跨境物流与关务',
              description: '【业务运营·供应与履约】履约',
              icon: '',
              order: 2101,
              artifact: '',
              metrics: '',
              responsibilities: ['跨境物流方案与关务合规'],
              wired: 1,
              skills: [
                {
                  name: 'p2s-drifted-in',
                  title: '从别岗接过来的卡',
                  summary: '',
                  modelEnabled: false,
                  srcDomain: '',
                  cardId: 'Skill-DriftsIn',
                  alsoServes: [],
                  wired: true,
                  wiredElsewhere: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  unplaced: [
    {
      name: 'p2s-ai-ethics',
      title: 'AI 伦理审查',
      summary: '跨域主题',
      modelEnabled: false,
      srcDomain: '22-人文',
      cardId: 'Skill-Ethics',
      alsoServes: [],
      wired: false,
      wiredElsewhere: [],
    },
  ],
  issues: [
    'AGT-011 砺器 · 硬件结构与材料工程：本岗 0 张卡（矩阵空白岗位）',
    '未归类 1 张（矩阵空白）',
  ],
}

/** Mounted roots awaiting teardown. */
const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

/** Shape knobs for {@link makePayload}, so a test can scale the tree. */
interface PayloadShape {
  planes: number
  domainsPerPlane: number
  rolesPerDomain: number
  cardsPerRole: number
}

/**
 * Build a synthetic tree of a chosen size.
 *
 * Used by the truncation guard, which needs a payload far larger than the real
 * one; every other test uses the hand-written {@link payload} above, where each
 * row is deliberate.
 * @param shape - how wide and deep to build the tree.
 * @returns a payload whose card total is planes × domains × roles × cards.
 */
function makePayload(shape: PayloadShape): TreePayload {
  const { planes, domainsPerPlane, rolesPerDomain, cardsPerRole } = shape
  const icon = 'data:image/svg+xml;base64,AA=='
  let placed = 0
  const tree: TreePayload['planes'] = []
  for (let p = 0; p < planes; p += 1) {
    const domains: TreePayload['planes'][number]['domains'] = []
    for (let d = 0; d < domainsPerPlane; d += 1) {
      const roles: TreePayload['planes'][number]['domains'][number]['roles'] = []
      for (let r = 0; r < rolesPerDomain; r += 1) {
        const skills: TreePayload['planes'][number]['domains'][number]['roles'][number]['skills'] = []
        for (let c = 0; c < cardsPerRole; c += 1) {
          const name = `p2s-p${p}-d${d}-r${r}-c${c}`
          skills.push({
            name,
            title: `卡 ${name}`,
            summary: '压测用卡',
            modelEnabled: false,
            srcDomain: '04-供应链',
            cardId: `Skill-${name}`,
            alsoServes: [],
            wired: false,
            wiredElsewhere: [],
          })
          placed += 1
        }
        roles.push({
          id: `agt-${p}${d}${r}`,
          agt: `AGT-${p}${d}${r}`,
          alias: '压测',
          title: '压测岗位',
          name: `压测岗位 ${p}-${d}-${r}`,
          description: '压测',
          icon,
          order: p * 1000 + d * 100 + r,
          artifact: '压测产物',
          metrics: '压测指标',
          responsibilities: ['压测职责'],
          wired: 0,
          skills,
        })
      }
      domains.push({ id: `DOM-${p}${d}`, name: `压测责任域 ${p}-${d}`, icon, roles })
    }
    tree.push({ id: `PLN-${p}`, name: `压测面 ${p}`, purpose: '压测', icon, domains })
  }
  return {
    ok: true,
    root: '/Users/lute/.dsh/skills',
    presetRoot: '/Users/lute/.dsh/.agent-presets',
    totals: {
      planes,
      domainSlices: planes * domainsPerPlane,
      distinctDomains: planes * domainsPerPlane,
      roles: planes * domainsPerPlane * rolesPerDomain,
      skills: placed,
      placed,
      unplaced: 0,
      wired: 0,
      wiredAnywhere: 0,
      emptyRoles: 0,
    },
    planes: tree,
    unplaced: [],
    issues: [],
  }
}

/** Mount the page with `fetch` stubbed to answer the tree route. */
async function mount(tree: TreePayload = payload): Promise<HTMLDivElement> {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => tree,
  }))
  vi.stubGlobal('fetch', fetchMock)

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(<AlgoSkillsPage />) })
  // The tree arrives on a promise; draining it inside act keeps the update
  // from landing after the test and warning.
  await act(async () => { await Promise.resolve() })
  mounted.push({ root, container })
  return container
}

/** Click one element inside act. */
function click(el: Element | null): void {
  if (el === null) throw new Error('nothing to click')
  act(() => { (el as HTMLElement).click() })
}

/** All elements carrying one page part marker. */
function parts(container: HTMLElement, part: string): Element[] {
  return [...container.querySelectorAll(`[data-dsh-part="${part}"]`)]
}

/** The clickable head for one part, matched by its data attribute. */
function headOf(container: HTMLElement, part: string, attr: string, value: string): Element | null {
  const scope = container.querySelector(`[data-dsh-part="${part}"][data-${attr}="${value}"]`)
  return scope?.querySelector('button') ?? null
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => { root.unmount() })
    container.remove()
  }
  vi.unstubAllGlobals()
})

describe('AlgoSkillsPage', () => {
  it('states the organization shape in the header and the coverage in the stats', async () => {
    const container = await mount()

    expect(container.textContent).toContain('算法技能库')
    expect(container.textContent).toContain('2 面 · 2 责任域 · 3 岗位')
    expect(container.textContent).toContain('/Users/lute/.dsh/skills')

    const stats = parts(container, 'algo-stat').map((el) => el.textContent)
    expect(stats).toEqual([
      '4技能卡总数',
      '3已分到岗位',
      '1没分到岗位',
      '1已设为岗位自带',
      '1还没配卡的岗位',
    ])
  })

  it('explains the tile vocabulary on the page, and again on each tile', async () => {
    const container = await mount()

    // 使用方读不懂「已归位 / 未归类 / 本岗已接线 / 空白岗位」——所以解释必须在
    // 页面上（悬停 tooltip 不算，没人会去悬停一个自己还没打算在意的数字）。
    const legend = parts(container, 'algo-legend')
    expect(legend).toHaveLength(1)
    expect(legend[0]!.textContent).toContain('这些数字怎么看')
    expect(legend[0]!.textContent).toContain('模型能不能自动调用')

    // 每个数字自己也带一句短解释（tooltip）。
    const hints = parts(container, 'algo-stat').map((el) => el.getAttribute('title'))
    expect(hints).toEqual([
      '本机装好的技能卡总数',
      '已归到某个岗位名下的卡；其余卡没有岗位收',
      '没有哪条岗位责任装得下它们，不参与岗位装配',
      '岗位预设一开就自带的卡；其余卡要在设置里打开，模型才会自动调用',
      '岗位已经建好，但库里还没有对得上的卡',
    ])
  })

  it('opens with every level collapsed, so the first screen is the organization', async () => {
    const container = await mount()

    expect(parts(container, 'algo-plane')).toHaveLength(2)
    expect(parts(container, 'algo-domain')).toHaveLength(0)
    expect(parts(container, 'algo-role')).toHaveLength(0)
    expect(parts(container, 'algo-skill-card')).toHaveLength(0)

    const planeHead = parts(container, 'algo-plane')[0]!.querySelector('button')
    expect(planeHead?.getAttribute('aria-expanded')).toBe('false')
    // The plane row carries its own counts while closed.
    expect(planeHead?.textContent).toContain('2 岗 · 3 张')
  })

  it('drills 面 → 责任域 → 岗位 → 卡 in three clicks', async () => {
    const container = await mount()

    click(headOf(container, 'algo-plane', 'plane', 'PLN-MGT'))
    expect(parts(container, 'algo-domain')).toHaveLength(1)

    click(headOf(container, 'algo-domain', 'domain', 'DOM-01'))
    expect(parts(container, 'algo-role')).toHaveLength(2)

    click(headOf(container, 'algo-role', 'role', 'AGT-001'))
    expect(parts(container, 'algo-skill-card')).toHaveLength(3)
    expect(container.textContent).toContain('本岗接线的卡')
  })

  it('distinguishes the three wiring states on a card instead of merging them', async () => {
    const container = await mount()
    click(headOf(container, 'algo-plane', 'plane', 'PLN-MGT'))
    click(headOf(container, 'algo-domain', 'domain', 'DOM-01'))
    click(headOf(container, 'algo-role', 'role', 'AGT-001'))

    const chips = (name: string): string => {
      const card = container.querySelector(`[data-skill="${name}"]`)
      if (card === null) throw new Error(`card ${name} not rendered`)
      return card.textContent ?? ''
    }

    expect(chips('p2s-wired-here')).toContain('本岗会带上')
    expect(chips('p2s-drift')).toContain('在 AGT-019 会带上')
    expect(chips('p2s-nowhere')).toContain('暂无岗位会带')
    // A card that also serves another responsibility says so.
    expect(chips('p2s-wired-here')).toContain('兼 经营目标拆解与优先级排序')
  })

  it('states the scope of the switch on a carried-but-file-off card', async () => {
    const container = await mount()
    click(headOf(container, 'algo-plane', 'plane', 'PLN-MGT'))
    click(headOf(container, 'algo-domain', 'domain', 'DOM-01'))
    click(headOf(container, 'algo-role', 'role', 'AGT-001'))

    const chipFor = (name: string): Element | null =>
      container.querySelector(`[data-skill="${name}"] [data-dsh-part="algo-chip-model-off"]`)

    // The card that is carried and switched on says nothing extra: the chip
    // marks a scope, not a state, so it must not fire on every card.
    expect(chipFor('p2s-wired-here')).toBeNull()

    // p2s-drifted-in is carried by its own role AND file-off. Since the role's
    // preset no longer lets the file flag veto its grant, that card IS invoked
    // inside this role's session — the chip must say so and scope the switch to
    // everything outside it, instead of claiming the role cannot reach it.
    click(headOf(container, 'algo-plane', 'plane', 'PLN-OPS'))
    click(headOf(container, 'algo-domain', 'domain', 'DOM-03'))
    click(headOf(container, 'algo-role', 'role', 'AGT-019'))
    const off = chipFor('p2s-drifted-in')
    expect(off).not.toBeNull()
    expect(off?.textContent).toBe('本岗之外不自动调用')
    expect(off?.getAttribute('title')).toContain('本岗会话里照常自动调用')
    expect(off?.getAttribute('title')).toContain('点开关可以打开')
  })

  it('reflects model availability on the card switch', async () => {
    const container = await mount()
    click(headOf(container, 'algo-plane', 'plane', 'PLN-MGT'))
    click(headOf(container, 'algo-domain', 'domain', 'DOM-01'))
    click(headOf(container, 'algo-role', 'role', 'AGT-001'))

    const on = container.querySelector('[data-skill="p2s-wired-here"] [role="switch"]')
    const off = container.querySelector('[data-skill="p2s-nowhere"] [role="switch"]')
    expect(on?.getAttribute('aria-checked')).toBe('true')
    expect(off?.getAttribute('aria-checked')).toBe('false')
    // The switch says what it governs and which way it will move — 「冻结」的观感
    // 有一半来自这里：开关只画了位置，从没说过它是干什么的。
    expect(on?.getAttribute('title')).toBe('模型可以自动调用它；点一下关掉')
    expect(off?.getAttribute('title')).toBe('模型不会自动调用它；点一下打开')
  })

  it('says an empty role is empty rather than rendering it as absent', async () => {
    const container = await mount()
    click(headOf(container, 'algo-plane', 'plane', 'PLN-MGT'))
    click(headOf(container, 'algo-domain', 'domain', 'DOM-01'))

    const emptyRole = parts(container, 'algo-role').find((el) => el.getAttribute('data-role') === 'AGT-011')
    expect(emptyRole?.textContent).toContain('本岗暂无卡')
  })

  it('keeps unclassified cards visible in their own trailing group', async () => {
    const container = await mount()

    const unplaced = parts(container, 'algo-unplaced')
    expect(unplaced).toHaveLength(1)
    expect(unplaced[0]!.textContent).toContain('没分到岗位的卡（矩阵空白）')
    expect(unplaced[0]!.textContent).toContain('1 张')

    click(unplaced[0]!.querySelector('button'))
    expect(parts(container, 'algo-skill-card')).toHaveLength(1)
    expect(container.textContent).toContain('AI 伦理审查')
  })

  it('shows the drift diagnostics collapsed, with a count', async () => {
    const container = await mount()

    expect(container.textContent).toContain('一致性诊断')
    expect(container.textContent).toContain('2 条')
    // Collapsed by default: the lines themselves are not in the first render.
    expect(container.textContent).not.toContain('矩阵空白岗位')
  })

  it('renders every card it is given — 全部展开 is not silently truncated', async () => {
    // The page's whole promise is that it carries the library: 1338 real cards.
    // A cap, a `slice()`, or a virtualization window would each still pass every
    // other test in this file (they all use tiny fixtures) while quietly hiding
    // most of the library. So this one builds a payload far larger than the real
    // one and counts what actually reaches the DOM.
    const CARDS_PER_ROLE = 60
    const ROLES_PER_DOMAIN = 5
    const DOMAINS_PER_PLANE = 2
    const PLANES = 4
    const total = CARDS_PER_ROLE * ROLES_PER_DOMAIN * DOMAINS_PER_PLANE * PLANES
    const huge = makePayload({
      planes: PLANES,
      domainsPerPlane: DOMAINS_PER_PLANE,
      rolesPerDomain: ROLES_PER_DOMAIN,
      cardsPerRole: CARDS_PER_ROLE,
    })

    const container = await mount(huge)
    const expand = [...container.querySelectorAll('button')].find((b) => b.textContent === '全部展开')
    expect(expand, '全部展开 button must exist').toBeTruthy()
    click(expand ?? null)

    expect(parts(container, 'algo-plane')).toHaveLength(PLANES)
    expect(parts(container, 'algo-role')).toHaveLength(ROLES_PER_DOMAIN * DOMAINS_PER_PLANE * PLANES)
    expect(parts(container, 'algo-skill-card')).toHaveLength(total)

    // Every card distinct: a `key` collision that dropped rows would still
    // leave the count high if duplicates padded it.
    const names = parts(container, 'algo-skill-card').map((el) => el.getAttribute('data-skill'))
    expect(new Set(names).size).toBe(total)
  })

  it('renders the failure as a line, not a crash, when the route fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => { root.render(<AlgoSkillsPage />) })
    await act(async () => { await Promise.resolve() })
    mounted.push({ root, container })

    expect(container.textContent).toContain('HTTP 500')
    expect(parts(container, 'algo-plane')).toHaveLength(0)
  })
})
