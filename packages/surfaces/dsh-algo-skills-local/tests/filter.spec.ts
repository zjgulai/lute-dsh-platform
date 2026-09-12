/**
 * Client narrowing tests.
 *
 * These cover the failures a person would not notice: a branch kept with zero
 * matches renders an empty expansion, and a matching card dropped from a
 * non-matching branch makes the hit count lie. Both are silent in a browser.
 */
import { describe, expect, it } from 'vitest'
import { expansionFor, narrowTree } from '../src/client/filter.ts'
import type { PlaneNode, TreePayload } from '../src/wire.ts'

/** One card. */
function card(name: string, title: string, summary = '', srcDomain = '18-物流履约', alsoServes: string[] = []) {
  return {
    name, title, summary, srcDomain, alsoServes,
    modelEnabled: false, cardId: `Skill-${name}`, wired: false, wiredElsewhere: [],
  }
}

/** A two-plane tree with three roles. */
function tree(): TreePayload {
  const planes: PlaneNode[] = [
    {
      id: 'PLN-OPS', name: '业务运营', purpose: '产品、供应、渠道、增长、服务和GMV事实闭环', icon: '',
      domains: [
        {
          id: 'DOM-03', name: '供应与履约', icon: '',
          roles: [
            {
              id: 'agt-019', agt: 'AGT-019', alias: '通途', title: '跨境物流与关务', name: '通途 · 跨境物流与关务',
              description: '', icon: '', order: 2206, artifact: '运输方案与异常处置建议', metrics: '到货偏差',
              responsibilities: ['物流方案'], wired: 1,
              skills: [
                card('p2s-3d-bin-packing-optimization', '3D 装箱优化', '把箱子排进集装箱，少用一个柜。'),
                card('p2s-tariff-classification', '关税归类', '按 HTS 归类并算税。'),
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'PLN-PLT', name: '数据与Agent平台', purpose: '数据口径、质量、集成工具、Skills', icon: '',
      domains: [
        {
          id: 'DOM-08', name: '数据与AI运行', icon: '',
          roles: [
            {
              id: 'agt-047', agt: 'AGT-047', alias: '接桥', title: '系统集成与业务工具', name: '接桥 · 系统集成与业务工具',
              description: '', icon: '', order: 4103, artifact: '工具契约', metrics: '集成可用率',
              responsibilities: ['工具集成'], wired: 0,
              skills: [card('p2s-agent-memory-system', 'Agent 记忆系统', '给 Agent 一套可检索的长期记忆。', '16-智能体工程')],
            },
          ],
        },
      ],
    },
  ]
  return {
    ok: true, root: '/home/u/.dsh/skills', presetRoot: '/home/u/.dsh/.agent-presets',
    totals: {
      planes: 2, domainSlices: 2, distinctDomains: 2, roles: 2, skills: 3, placed: 3, unplaced: 0,
      wired: 1, wiredAnywhere: 1, emptyRoles: 0,
    },
    planes,
    unplaced: [],
    issues: [],
  }
}

describe('narrowTree', () => {
  it('returns the tree unchanged for a blank query', () => {
    const narrowed = narrowTree(tree(), '   ')
    expect(narrowed.searching).toBe(false)
    expect(narrowed.planes).toHaveLength(2)
    expect(narrowed.cards).toBe(3)
  })

  it('keeps a role whole when the query matches the role itself', () => {
    // 「物流」命中岗位标题，因此该岗位的两张卡全部保留 —— 只藏卡片会让人以为岗位只有一张卡
    const narrowed = narrowTree(tree(), '物流')
    expect(narrowed.planes.map((p) => p.id)).toEqual(['PLN-OPS'])
    expect(narrowed.planes[0]?.domains[0]?.roles[0]?.skills.map((s) => s.name))
      .toEqual(['p2s-3d-bin-packing-optimization', 'p2s-tariff-classification'])
  })

  it('drops the non-matching branch entirely rather than leaving an empty expansion', () => {
    const narrowed = narrowTree(tree(), '装箱')
    expect(narrowed.cards).toBe(1)
    expect(narrowed.planes).toHaveLength(1)
    expect(narrowed.planes[0]?.domains).toHaveLength(1)
    expect(narrowed.planes[0]?.domains[0]?.roles).toHaveLength(1)
  })

  it('matches through the summary and the source technology family', () => {
    expect(narrowTree(tree(), '长期记忆').cards).toBe(1)
    expect(narrowTree(tree(), '智能体工程').cards).toBe(1)
  })

  it('matches a plane name, keeping every role under it', () => {
    const narrowed = narrowTree(tree(), '数据与Agent平台')
    expect(narrowed.planes.map((p) => p.id)).toEqual(['PLN-PLT'])
    expect(narrowed.cards).toBe(1)
  })

  it('returns nothing when nothing matches', () => {
    const narrowed = narrowTree(tree(), 'zzz-nothing')
    expect(narrowed.planes).toEqual([])
    expect(narrowed.cards).toBe(0)
    expect(narrowed.searching).toBe(true)
  })

  it('searches the unplaced group like any other branch', () => {
    const withOrphan: TreePayload = {
      ...tree(),
      unplaced: [card('p2s-ai-ethics', 'AI 伦理卡', '讨论模型伦理边界。', '11-AI人文')],
    }
    const narrowed = narrowTree(withOrphan, '伦理')
    expect(narrowed.unplaced.map((s) => s.name)).toEqual(['p2s-ai-ethics'])
    expect(narrowed.cards).toBe(1)
  })
})

describe('expansionFor', () => {
  it('opens nothing when no query is active', () => {
    expect(expansionFor(narrowTree(tree(), '')).size).toBe(0)
  })

  it('opens every surviving branch so a reported hit is actually visible', () => {
    const open = expansionFor(narrowTree(tree(), '装箱'))
    expect(open.has('PLN-OPS')).toBe(true)
    expect(open.has('PLN-OPS/DOM-03')).toBe(true)
    expect(open.has('agt-019')).toBe(true)
    expect(open.has('PLN-PLT')).toBe(false)
  })
})
