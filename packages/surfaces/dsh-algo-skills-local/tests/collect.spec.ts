/**
 * Tree-collector contract tests.
 *
 * The collector is exercised through a fake `TreeSource`, so every case here is
 * about a decision the real data forced and would silently get wrong:
 *
 *  - a card is placed by its `l3_business`, NOT by which preset wires it, so a
 *    card wired into a different role must still land on its own role;
 *  - a card whose L1/L2 disagree with its role's plane/domain must produce an
 *    issue rather than being drawn in the wrong branch;
 *  - an unreadable manifest costs one role, not the page;
 *  - the same responsibility owned by two roles is reported, not resolved
 *    silently.
 */
import { describe, expect, it } from 'vitest'
import { collectTree, parseRoleManifest, parseSkill, type TreeSource } from '../src/collect.ts'

/** Build a preset manifest for the fake source. */
function roleManifest(options: {
  id: string
  agt: string
  plane: [string, string]
  domain: [string, string]
  order: number
  names: string[]
  subset?: string[]
  roleName?: string
}): string {
  const [pid, pname] = options.plane
  const [did, dname] = options.domain
  return JSON.stringify({
    format: 'dsh-preset',
    id: options.id,
    name: options.roleName ?? `${options.agt} · 测试岗位`,
    description: `【${pname}·${dname}】测试`,
    icon: `data:image/svg+xml;base64,${Buffer.from(`<svg data-role="${options.agt}"/>`).toString('base64')}`,
    x_lute: {
      plane: { id: pid, name: pname, purpose: `${pname}的存在理由` },
      domain: { id: did, name: dname },
      order: options.order,
      squad: { artifact: '测试产物', metrics: '测试口径' },
      skills: { material_skill_names: options.names, subset: options.subset ?? [] },
    },
  })
}

/** Build a card's SKILL.md. */
function skillFile(options: {
  name: string
  l3: string
  plane?: string
  domain?: string
  summary?: string
  modelEnabled?: boolean
  also?: string
}): string {
  return [
    '---',
    `name: "${options.name}"`,
    `title: "${options.name} 的标题"`,
    `l1_plane: "${options.plane ?? '业务运营'}"`,
    `l2_domain: "${options.domain ?? '供应与履约'}"`,
    `l3_business: "${options.l3}"`,
    `l3_all: "${options.also ?? options.l3}"`,
    `user_summary: "${options.summary ?? '一句话说明。'}"`,
    `p2s_src_domain: "18-物流履约"`,
    `disable-model-invocation: "${options.modelEnabled === true ? 'false' : 'true'}"`,
    '---',
    '',
    '# body',
    '',
  ].join('\n')
}

/** Assemble a fake source from literal manifests and cards. */
function source(options: {
  roles: Array<{ id: string; manifest?: string }>
  skills: Array<{ dir: string; text: string }>
}): TreeSource {
  const manifests = new Map(options.roles.filter((r) => r.manifest !== undefined).map((r) => [r.id, r.manifest as string]))
  const skills = new Map(options.skills.map((s) => [s.dir, s.text]))
  return {
    skillsRoot: '/fake/skills',
    presetRoot: '/fake/presets',
    listSkillDirs: () => [...skills.keys()].sort(),
    readSkillFile: (dir) => skills.get(dir) ?? '',
    listRoleDirs: () => [...manifests.keys(), ...options.roles.filter((r) => r.manifest === undefined).map((r) => r.id)].sort(),
    readRoleManifest: (dir) => manifests.get(dir),
  }
}

const TWO_ROLES = {
  roles: [
    {
      id: 'agt-019',
      manifest: roleManifest({
        id: 'agt-019', agt: 'AGT-019', plane: ['PLN-OPS', '业务运营'], domain: ['DOM-03', '供应与履约'],
        order: 2206, names: ['物流方案'], subset: ['p2s-keep'],
      }),
    },
    {
      id: 'agt-020',
      manifest: roleManifest({
        id: 'agt-020', agt: 'AGT-020', plane: ['PLN-OPS', '业务运营'], domain: ['DOM-03', '供应与履约'],
        order: 2207, names: ['仓储协作'], subset: ['p2s-drift'],
      }),
    },
  ],
}

describe('parseRoleManifest', () => {
  it('reads plane/domain/order and falls back to mapping[].name when material names are absent', () => {
    const raw = JSON.stringify({
      name: '望野 · 市场竞争与机会研究',
      icon: 'data:image/svg+xml;base64,AA==',
      x_lute: {
        plane: { id: 'PLN-OPS', name: '业务运营', purpose: 'p' },
        domain: { id: 'DOM-02', name: '产品与创新' },
        order: 2102,
        skills: { mapping: [{ name: '机会研究' }, { name: '市场扫描' }] },
      },
    })
    const parsed = parseRoleManifest('agt-007', raw)
    expect(parsed?.plane.id).toBe('PLN-OPS')
    expect(parsed?.domain.name).toBe('产品与创新')
    expect(parsed?.agt).toBe('AGT-007')
    expect(parsed?.wire.responsibilities).toEqual(['机会研究', '市场扫描'])
  })

  it('returns undefined on malformed JSON instead of throwing', () => {
    expect(parseRoleManifest('agt-001', '{ not json')).toBeUndefined()
  })

  it('returns undefined when the plane/domain ids are missing', () => {
    expect(parseRoleManifest('agt-001', JSON.stringify({ x_lute: { plane: {} } }))).toBeUndefined()
  })
})

describe('parseSkill', () => {
  it('splits the primary responsibility from the secondary ones', () => {
    const parsed = parseSkill('p2s-x', skillFile({ name: 'p2s-x', l3: '物流方案', also: '物流方案 / 仓储协作' }))
    expect(parsed.l3).toBe('物流方案')
    expect(parsed.row.alsoServes).toEqual(['仓储协作'])
    expect(parsed.row.modelEnabled).toBe(false)
  })

  it('treats a missing disable-model-invocation as model-enabled', () => {
    const parsed = parseSkill('p2s-y', '---\nname: "p2s-y"\n---\n')
    expect(parsed.row.modelEnabled).toBe(true)
    expect(parsed.row.title).toBe('p2s-y')
  })
})

describe('collectTree', () => {
  it('places a card on its classified role, and flags drift when the preset wires it elsewhere', () => {
    const tree = collectTree(source({
      ...TWO_ROLES,
      skills: [
        { dir: 'p2s-keep', text: skillFile({ name: 'p2s-keep', l3: '物流方案' }) },
        { dir: 'p2s-drift', text: skillFile({ name: 'p2s-drift', l3: '物流方案' }) },
      ],
    }))
    const roles = tree.planes.flatMap((p) => p.domains).flatMap((d) => d.roles)
    const logistics = roles.find((r) => r.agt === 'AGT-019')
    expect(logistics?.skills.map((s) => s.name)).toEqual(['p2s-drift', 'p2s-keep'])
    expect(logistics?.skills.find((s) => s.name === 'p2s-keep')?.wired).toBe(true)
    expect(logistics?.skills.find((s) => s.name === 'p2s-drift')?.wired).toBe(false)
    expect(logistics?.skills.find((s) => s.name === 'p2s-drift')?.wiredElsewhere).toEqual(['agt-020'])
    // 接线到别岗不改变归位：两张卡仍都算「已归位」
    expect(tree.totals.placed).toBe(2)
    expect(tree.totals.wired).toBe(1)
    expect(tree.totals.wiredAnywhere).toBe(2)
  })

  it('reports an unclassified card instead of dropping it', () => {
    const tree = collectTree(source({
      ...TWO_ROLES,
      skills: [{ dir: 'p2s-orphan', text: skillFile({ name: 'p2s-orphan', l3: '（矩阵空白）' }) }],
    }))
    expect(tree.totals.skills).toBe(1)
    expect(tree.totals.placed).toBe(0)
    expect(tree.totals.unplaced).toBe(1)
    expect(tree.unplaced[0]?.name).toBe('p2s-orphan')
  })

  it('flags a card whose L1/L2 disagree with the role it landed on', () => {
    const tree = collectTree(source({
      ...TWO_ROLES,
      skills: [{
        dir: 'p2s-mismatch',
        text: skillFile({ name: 'p2s-mismatch', l3: '物流方案', plane: '数据与Agent平台', domain: '数据与AI运行' }),
      }],
    }))
    expect(tree.issues.some((issue) => issue.includes('p2s-mismatch') && issue.includes('L1'))).toBe(true)
    expect(tree.issues.some((issue) => issue.includes('p2s-mismatch') && issue.includes('L2'))).toBe(true)
  })

  it('costs one role, not the page, when a manifest is unreadable', () => {
    const tree = collectTree(source({
      roles: [...TWO_ROLES.roles, { id: 'agt-099' }],
      skills: [{ dir: 'p2s-keep', text: skillFile({ name: 'p2s-keep', l3: '物流方案' }) }],
    }))
    expect(tree.totals.roles).toBe(2)
    expect(tree.issues.some((issue) => issue.startsWith('agt-099'))).toBe(true)
    expect(tree.totals.placed).toBe(1)
  })

  it('counts an empty role and says so', () => {
    const tree = collectTree(source({ ...TWO_ROLES, skills: [] }))
    expect(tree.totals.emptyRoles).toBe(2)
    expect(tree.issues.filter((issue) => issue.includes('本岗 0 张卡')).length).toBe(2)
  })

  it('reports a responsibility claimed by two roles instead of silently reassigning cards', () => {
    const tree = collectTree(source({
      roles: [
        { id: 'agt-001', manifest: roleManifest({ id: 'agt-001', agt: 'AGT-001', plane: ['PLN-MGT', '经营管理'], domain: ['DOM-01', '经营与组织'], order: 1101, names: ['共享责任'] }) },
        { id: 'agt-002', manifest: roleManifest({ id: 'agt-002', agt: 'AGT-002', plane: ['PLN-MGT', '经营管理'], domain: ['DOM-01', '经营与组织'], order: 1102, names: ['共享责任'] }) },
      ],
      skills: [],
    }))
    expect(tree.issues.some((issue) => issue.includes('共享责任'))).toBe(true)
  })

  it('orders planes and domains by the roster order, and slices a domain per plane', () => {
    const tree = collectTree(source({
      roles: [
        { id: 'agt-005', manifest: roleManifest({ id: 'agt-005', agt: 'AGT-005', plane: ['PLN-CTL', '独立控制'], domain: ['DOM-07', '财务与合规'], order: 3101, names: ['内控'] }) },
        { id: 'agt-001', manifest: roleManifest({ id: 'agt-001', agt: 'AGT-001', plane: ['PLN-MGT', '经营管理'], domain: ['DOM-01', '经营与组织'], order: 1101, names: ['目标'] }) },
        { id: 'agt-041', manifest: roleManifest({ id: 'agt-041', agt: 'AGT-041', plane: ['PLN-OPS', '业务运营'], domain: ['DOM-07', '财务与合规'], order: 2701, names: ['经营财务'] }) },
      ],
      skills: [],
    }))
    expect(tree.planes.map((p) => p.id)).toEqual(['PLN-MGT', 'PLN-OPS', 'PLN-CTL'])
    // DOM-07 同时挂在 PLN-OPS 与 PLN-CTL 下：是两个切片，但仍是一个责任域
    expect(tree.totals.domainSlices).toBe(3)
    expect(tree.totals.distinctDomains).toBe(2)
    const ctl = tree.planes.find((p) => p.id === 'PLN-CTL')
    expect(ctl?.domains.map((d) => d.id)).toEqual(['DOM-07'])
  })

  it('attaches the layer avatar to planes and domains', () => {
    const tree = collectTree(source({ ...TWO_ROLES, skills: [] }))
    expect(tree.planes[0]?.icon.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(tree.planes[0]?.domains[0]?.icon.startsWith('data:image/svg+xml;base64,')).toBe(true)
  })
})
