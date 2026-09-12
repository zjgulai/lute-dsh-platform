#!/usr/bin/env node
/**
 * build-taxonomy.mjs — 从岗位矩阵材料生成三层分类底座。
 *
 * 源（只读）：$ROLE_MATERIAL_ROOT/docs/04-organization/organization-graph.json（D-021 拓扑）
 *             $ROLE_MATERIAL_ROOT/docs/05-agents/role-catalog.json（每岗 skills[] = L3 事实来源）
 * 出：data/taxonomy.json（入库；4 面 / 8 责任域 / 151 细分业务 / 12 个非空 (面,域) 单元）
 *
 * 纪律：L3 只从材料逐字取，不改写、不新造、不合并同义词；数量不符则 exit 1。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from '../lib/taxonomy.js'

const MATERIAL_ROOT = process.env.ROLE_MATERIAL_ROOT || '/Users/lute/project/AI组织变革'
const ORG = join(MATERIAL_ROOT, 'docs/04-organization/organization-graph.json')
const CATALOG = join(MATERIAL_ROOT, 'docs/05-agents/role-catalog.json')
const EXPECT_PLANES = Number(process.env.P2S_EXPECT_PLANES || 4)
const EXPECT_DOMAINS = Number(process.env.P2S_EXPECT_DOMAINS || 8)

const org = JSON.parse(readFileSync(ORG, 'utf8'))
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'))

/** @type {Map<string, any>} */
const planes = new Map(org.planes.map((/** @type {any} */ p) => [p.id, p]))
/** @type {Map<string, any>} */
const domains = new Map(org.domain_views.map((/** @type {any} */ d) => [d.id, d]))
/** @type {Map<string, any>} */
const roleOrg = new Map(org.roles.map((/** @type {any} */ r) => [r.id, r]))

const PLANE_ORDER = org.planes.map((/** @type {any} */ p) => p.id)
const DOMAIN_ORDER = org.domain_views.map((/** @type {any} */ d) => d.id)

if (PLANE_ORDER.length !== EXPECT_PLANES) {
  console.error(`✗ 平面数 ${PLANE_ORDER.length} != ${EXPECT_PLANES}`)
  process.exit(1)
}
if (DOMAIN_ORDER.length !== EXPECT_DOMAINS) {
  console.error(`✗ 责任域数 ${DOMAIN_ORDER.length} != ${EXPECT_DOMAINS}`)
  process.exit(1)
}

/** @type {Map<string, Array<{l3:string,role_id:string,role_alias:string,role_title:string}>>} */
const byCell = new Map()
for (const role of catalog.roles) {
  const o = roleOrg.get(role.id)
  if (!o) {
    console.error(`✗ role-catalog 的 ${role.id} 在 organization-graph 里找不到归属`)
    process.exit(1)
  }
  const key = `${o.plane_id}|${o.domain_view_id}`
  if (!byCell.has(key)) byCell.set(key, [])
  for (const s of role.skills || []) {
    byCell.get(key).push({ l3: s, role_id: role.id, role_alias: role.alias, role_title: role.title })
  }
}

const out = {
  version: '1.0',
  source: { organization_graph: ORG, role_catalog: CATALOG, decision_id: org.decision_id },
  planes: PLANE_ORDER.map((id, i) => {
    const p = planes.get(id)
    return { level: 'L1', idx: i + 1, id: p.id, name: p.name, purpose: p.purpose, role_count: p.role_count, order_base: (i + 1) * 1000 }
  }),
  domains: DOMAIN_ORDER.map((id, i) => {
    const d = domains.get(id)
    return { level: 'L2', idx: i + 1, id: d.id, name: d.name, role_count: d.role_count }
  }),
  l3: /** @type {any[]} */ ([]),
  cells: /** @type {any[]} */ ([]),
}

let n = 0
for (const pid of PLANE_ORDER) {
  for (const did of DOMAIN_ORDER) {
    const items = byCell.get(`${pid}|${did}`)
    if (!items || items.length === 0) continue
    const plane = planes.get(pid)
    const domain = domains.get(did)
    out.cells.push({
      plane_id: pid,
      plane: plane.name,
      domain_id: did,
      domain: domain.name,
      l1_l2: `${plane.name}/${domain.name}`,
      l3_count: items.length,
    })
    for (const it of items) {
      n += 1
      out.l3.push({
        level: 'L3',
        no: n,
        name: it.l3,
        plane_id: pid,
        plane: plane.name,
        domain_id: did,
        domain: domain.name,
        role_id: it.role_id,
        role_alias: it.role_alias,
        role_title: it.role_title,
        l1_l2_l3: `${plane.name}/${domain.name}/${it.l3}`,
      })
    }
  }
}

const uniqueNames = new Set(out.l3.map((x) => x.name))
mkdirSync(DATA_DIR, { recursive: true })
writeFileSync(join(DATA_DIR, 'taxonomy.json'), JSON.stringify(out, null, 1) + '\n')

console.log(`L1 面：${out.planes.length}  L2 域：${out.domains.length}  L3：${out.l3.length}（唯一 ${uniqueNames.size}）  (面,域) 单元：${out.cells.length}`)
if (uniqueNames.size !== out.l3.length) {
  console.error(`✗ L3 存在重名：${out.l3.length} 条 / 唯一 ${uniqueNames.size} 条`)
  process.exit(1)
}
