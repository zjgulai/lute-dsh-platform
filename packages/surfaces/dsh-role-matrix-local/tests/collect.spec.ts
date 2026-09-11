/**
 * Collector contract: preset.yml display metadata + LUTE manifest → the
 * two-level (plane → domain) card matrix.
 *
 * The assertions target the properties the panel depends on — grouping, the
 * material's own plane/domain order, roster-order sorting inside a domain, and
 * the degraded path — not internal call shapes.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { collectRoleMatrix, parseDisplayScalars } from '../src/collect.ts'

const roots: string[] = []

/** Create a preset root under a temp dir; the caller fills subdirectories. */
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'role-matrix-'))
  roots.push(root)
  return root
}

/** Write one role preset directory (official display file + LUTE manifest). */
function writeRole(
  root: string,
  dir: string,
  display: { name: string; description: string; order: number; icon?: string },
  manifest: Record<string, unknown> | undefined,
): void {
  const target = join(root, dir)
  mkdirSync(target, { recursive: true })
  const iconLine = display.icon === undefined ? '' : `icon: '${display.icon}'\n`
  writeFileSync(
    join(target, 'preset.yml'),
    `name: '${display.name}'\ndescription: '${display.description}'\norder: ${display.order}\n${iconLine}`,
    'utf8',
  )
  if (manifest !== undefined) {
    writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  }
}

/** A manifest shaped like the ones `scripts/role-presets/generate.mjs` writes. */
function manifestFor(opts: {
  planeId: string; planeName: string; domainId: string; domainName: string
  agt: string; alias: string; title: string; artifact: string
  gaps?: string[]; subset?: string[]; materialSkills?: string[]
}): Record<string, unknown> {
  return {
    format: 'dsh-preset',
    version: 2,
    x_lute: {
      plane: { id: opts.planeId, name: opts.planeName, purpose: '' },
      domain: { id: opts.domainId, name: opts.domainName },
      lifecycle: { status: 'draft', production_authorized: false },
      squad: { eligible_flows: ['FLOW-02'], collaborates_with: ['AGT-008'] },
      skills: {
        subset: opts.subset ?? ['pb-002'],
        gaps: opts.gaps ?? [],
        material_skill_names: opts.materialSkills ?? ['竞品研究'],
      },
    },
    material: {
      role_catalog: {
        record: {
          id: opts.agt, alias: opts.alias, title: opts.title,
          artifact: opts.artifact, metrics: '信号到验证速度',
          scenarios: ['SCN-002'], collaborates_with: ['AGT-008'], playbooks: ['PB-002'],
        },
      },
    },
  }
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

describe('parseDisplayScalars', () => {
  it('reads the three official keys and unquotes them', () => {
    const scalars = parseDisplayScalars("name: '望野 · 市场竞争与机会研究'\ndescription: '【业务运营·产品与创新】发现机会'\norder: 2102\n")
    expect(scalars['name']).toBe('望野 · 市场竞争与机会研究')
    expect(scalars['description']).toBe('【业务运营·产品与创新】发现机会')
    expect(scalars['order']).toBe('2102')
  })

  it('unescapes doubled single quotes (YAML single-quote rule)', () => {
    expect(parseDisplayScalars("name: 'it''s fine'")['name']).toBe("it's fine")
  })

  it('ignores nested keys, comments and blank lines', () => {
    const scalars = parseDisplayScalars('# comment\nname: top\n  nested: ignored\n\norder: 1\n')
    expect(scalars).toEqual({ name: 'top', order: '1' })
  })
})

describe('collectRoleMatrix', () => {
  it('groups roles into plane → domain and sorts by the material order', () => {
    const root = makeRoot()
    // Written out of order on purpose: the collector must impose the order.
    writeRole(root, 'agt-021', { name: '北辰 · Amazon业务经营', description: 'd', order: 2301 },
      manifestFor({ planeId: 'PLN-OPS', planeName: '业务运营', domainId: 'DOM-05', domainName: '渠道经营', agt: 'AGT-021', alias: '北辰', title: 'Amazon业务经营', artifact: '行动包' }))
    writeRole(root, 'agt-007', { name: '望野 · 市场竞争与机会研究', description: 'd', order: 2102 },
      manifestFor({ planeId: 'PLN-OPS', planeName: '业务运营', domainId: 'DOM-02', domainName: '产品与创新', agt: 'AGT-007', alias: '望野', title: '市场竞争与机会研究', artifact: '机会证据包与反证' }))
    writeRole(root, 'agt-001', { name: '衡远 · 经营目标与资源统筹', description: 'd', order: 1101 },
      manifestFor({ planeId: 'PLN-MGT', planeName: '经营管理', domainId: 'DOM-01', domainName: '经营与组织', agt: 'AGT-001', alias: '衡远', title: '经营目标与资源统筹', artifact: '目标与资源决策包' }))
    writeRole(root, 'agt-006', { name: '听澜 · 消费者需求与VOC研究', description: 'd', order: 2101 },
      manifestFor({ planeId: 'PLN-OPS', planeName: '业务运营', domainId: 'DOM-02', domainName: '产品与创新', agt: 'AGT-006', alias: '听澜', title: '消费者需求与VOC研究', artifact: '需求证据与问题地图' }))

    const payload = collectRoleMatrix(root)

    expect(payload.totals.roles).toBe(4)
    expect(payload.totals.planes).toBe(2)
    expect(payload.totals.domains).toBe(3)
    expect(payload.totals.degraded).toBe(0)

    // Plane order follows the material (经营管理 before 业务运营), not input order.
    expect(payload.planes.map((plane) => plane.id)).toEqual(['PLN-MGT', 'PLN-OPS'])

    const ops = payload.planes[1]!
    expect(ops.roles).toBe(3)
    // Domain order follows DOM-02 before DOM-05.
    expect(ops.domains.map((domain) => domain.id)).toEqual(['DOM-02', 'DOM-05'])
    // Roles inside a domain sort by the official roster order.
    expect(ops.domains[0]!.roles.map((card) => card.id)).toEqual(['agt-006', 'agt-007'])
  })

  it('carries the classification, artifact and skill inventory onto the card', () => {
    const root = makeRoot()
    writeRole(root, 'agt-007', { name: '望野 · 市场竞争与机会研究', description: 'desc', order: 2102 },
      manifestFor({
        planeId: 'PLN-OPS', planeName: '业务运营', domainId: 'DOM-02', domainName: '产品与创新',
        agt: 'AGT-007', alias: '望野', title: '市场竞争与机会研究', artifact: '机会证据包与反证',
        subset: ['competitor-profiling', 'pb-002'], gaps: ['抽样审计'],
      }))

    const card = collectRoleMatrix(root).planes[0]!.domains[0]!.roles[0]!
    expect(card).toMatchObject({
      id: 'agt-007',
      agt: 'AGT-007',
      alias: '望野',
      name: '望野 · 市场竞争与机会研究',
      description: 'desc',
      order: 2102,
      artifact: '机会证据包与反证',
      planeId: 'PLN-OPS',
      planeName: '业务运营',
      domainId: 'DOM-02',
      domainName: '产品与创新',
      lifecycleStatus: 'draft',
      productionAuthorized: false,
      subset: ['competitor-profiling', 'pb-002'],
      gaps: ['抽样审计'],
      materialSkillNames: ['竞品研究'],
      flows: ['FLOW-02'],
      scenarios: ['SCN-002'],
      collaboratesWith: ['AGT-008'],
      playbooks: ['PB-002'],
    })
    expect(card.degraded).toBeUndefined()
  })

  it('keeps a preset with no manifest as a degraded card instead of dropping it', () => {
    const root = makeRoot()
    writeRole(root, 'agt-999', { name: '残缺 · 无清单', description: 'd', order: 9999 }, undefined)

    const payload = collectRoleMatrix(root)
    expect(payload.totals.roles).toBe(1)
    expect(payload.totals.degraded).toBe(1)
    const card = payload.planes[0]!.domains[0]!.roles[0]!
    expect(card.planeId).toBe('UNCLASSIFIED')
    expect(card.planeName).toBe('未分类')
    expect(card.degraded).toContain('manifest.json 缺失')
  })

  it('ignores directories that are not role presets', () => {
    const root = makeRoot()
    mkdirSync(join(root, 'standard'), { recursive: true })
    writeFileSync(join(root, 'standard', 'preset.yml'), "name: '标准模式'\n", 'utf8')
    mkdirSync(join(root, 'not-a-preset'), { recursive: true })
    writeRole(root, 'agt-001', { name: '衡远', description: 'd', order: 1101 },
      manifestFor({ planeId: 'PLN-MGT', planeName: '经营管理', domainId: 'DOM-01', domainName: '经营与组织', agt: 'AGT-001', alias: '衡远', title: 't', artifact: 'a' }))

    expect(collectRoleMatrix(root).totals.roles).toBe(1)
  })

  it('carries the avatar from preset.yml so a matrix card matches its official card', () => {
    const root = makeRoot()
    // The real value is a base64 SVG data URI: no single quotes inside, so the
    // scalar reader must round-trip it byte for byte — that is what makes the
    // matrix card and the official preset card show the identical face.
    const icon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='
    writeRole(root, 'agt-048', { name: '积知', description: 'd', order: 4104, icon },
      manifestFor({ planeId: 'PLN-PLT', planeName: '数据与Agent平台', domainId: 'DOM-08', domainName: '数据与AI运行', agt: 'AGT-048', alias: '积知', title: 't', artifact: 'a' }))

    expect(collectRoleMatrix(root).planes[0]!.domains[0]!.roles[0]!.icon).toBe(icon)
  })

  it('yields an empty avatar — not a degraded card — when preset.yml declares none', () => {
    const root = makeRoot()
    writeRole(root, 'agt-001', { name: '衡远', description: 'd', order: 1101 },
      manifestFor({ planeId: 'PLN-MGT', planeName: '经营管理', domainId: 'DOM-01', domainName: '经营与组织', agt: 'AGT-001', alias: '衡远', title: 't', artifact: 'a' }))

    const card = collectRoleMatrix(root).planes[0]!.domains[0]!.roles[0]!
    expect(card.icon).toBe('')
    // A missing avatar is a presentation gap, not a capability one: the row stays complete.
    expect(card.degraded).toBeUndefined()
  })

  it('counts a material domain once even when it spans two planes', () => {
    const root = makeRoot()
    // 经营与组织 is the material's own case: four roles sit in 经营管理 and 守衡
    // (independent control) sits in 独立控制. The tree legitimately holds two
    // nodes; the header must still agree with its own "八责任域" subtitle.
    writeRole(root, 'agt-001', { name: '衡远', description: 'd', order: 1101 },
      manifestFor({ planeId: 'PLN-MGT', planeName: '经营管理', domainId: 'DOM-01', domainName: '经营与组织', agt: 'AGT-001', alias: '衡远', title: 't', artifact: 'a' }))
    writeRole(root, 'agt-005', { name: '守衡', description: 'd', order: 3101 },
      manifestFor({ planeId: 'PLN-CTL', planeName: '独立控制', domainId: 'DOM-01', domainName: '经营与组织', agt: 'AGT-005', alias: '守衡', title: 't', artifact: 'a' }))

    const payload = collectRoleMatrix(root)
    expect(payload.planes.flatMap((plane) => plane.domains)).toHaveLength(2)
    expect(payload.totals.domains).toBe(1)
  })

  it('returns an empty payload for a missing root rather than throwing', () => {
    const payload = collectRoleMatrix(join(tmpdir(), 'role-matrix-does-not-exist-xyz'))
    expect(payload.totals).toEqual({ roles: 0, planes: 0, domains: 0, degraded: 0 })
    expect(payload.planes).toEqual([])
  })
})
