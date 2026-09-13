import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AXIS, VENUE_TIERS, VENUE_UNLABELED, VENUE_LEGACY_PENDING, QUALITY_TIERS, TECH_DOMAIN_RE,
  parseFrontmatter, techDomainOf, normalizeVenueTier, buildAxisIndex, validateAxis,
  venueLegacyAudit, resolveChain, byBusiness, byFacet, axisAgree,
} from '../lib/axis.js'
import { loadTaxonomy } from '../lib/taxonomy.js'

/**
 * 构造夹具：**不用真 vault**（跨仓路径不该进单测）。
 * 骨架取自真 taxonomy（L3 名必须真），格子/卡自己造。
 */
const tax = loadTaxonomy()
/** 取一个 L3 名；取不到就当场炸（不给默认值）。 */
function l3Of(roleId) {
  const e = tax.l3.find((x) => x.role_id === roleId)
  assert.ok(e, `${roleId} 应有 L3`)
  return e.name
}
const L3_A = l3Of('AGT-001')
const L3_B = l3Of('AGT-002')
const L3_C = l3Of('AGT-023')

const STAGES = ['STG-01', 'STG-02', 'STG-03', 'STG-04', 'STG-05', 'STG-06', 'STG-07', 'STG-08']
const KIND = { 'STG-04': 'M', 'STG-05': 'M', 'STG-08': 'M' }

function cellsOf(flow) {
  return STAGES.map((s) => ({
    cell_id: `${flow}/${s}`, flow_id: flow, stage_id: s,
    cell_kind: KIND[s] ?? (s === 'STG-02' || s === 'STG-06' ? 'R' : 'D'),
  }))
}

function fixture() {
  const graph = {
    roles: [
      { id: 'AGT-001', title: '经营目标与资源统筹', flows: ['FLOW-08'] },
      { id: 'AGT-002', title: '场景自主编排与异常协调', flows: ['FLOW-01'] },
      { id: 'AGT-023', title: '独立站经营与转化', flows: ['FLOW-01'] },
    ],
    l3: tax.l3.filter((e) => ['AGT-001', 'AGT-002', 'AGT-023'].includes(e.role_id))
      .map((e) => ({ name: e.name, role_id: e.role_id, plane_id: e.plane_id, domain_id: e.domain_id })),
    cells: [...cellsOf('FLOW-01'), ...cellsOf('FLOW-08')],
    solutions: [],
    cards: [
      { name: 'Skill-A', path: 'paper2skills-vault/07-NLP-VOC/Skill-A.md', l3: [L3_A] },
      { name: 'Skill-B', path: 'paper2skills-vault/10-MAS/00-知识库-Skill卡片/Skill-B.md', l3: [L3_B] },
      { name: 'Skill-C', path: 'paper2skills-vault/13-广告分析/Skill-C.md', l3: [L3_C, L3_B] },
    ],
  }
  const l3ByCard = { 'Skill-A': [L3_A], 'Skill-B': [L3_B], 'Skill-C': [L3_C, L3_B] }
  const frontmatters = Object.fromEntries(graph.cards.map((c) => [c.name, { fields: {}, unparsed: [], has: true }]))
  return { graph, l3ByCard, frontmatters }
}

const KNOWN = ['07-NLP-VOC', '10-MAS', '13-广告分析']
const mk = (mut = (x) => x) => {
  const f = fixture()
  mut(f)
  return buildAxisIndex(f.graph, { l3ByCard: f.l3ByCard, notes: {}, frontmatters: f.frontmatters })
}

test('F4 轴：五层链就是任务书的五层', () => {
  assert.equal(AXIS.length, 5)
  assert.deepEqual(AXIS.map((a) => a.name), ['岗位', '责任', '场景格', '方案与契约', '算法卡'])
})

test('F4 facet 词表：venue 7 档 + unlabeled；quality 2 档', () => {
  assert.deepEqual(VENUE_TIERS, ['UTD24', 'FT50', 'CCF-A', 'CCF-B', 'field-top', 'preprint', 'non-paper'])
  assert.deepEqual(QUALITY_TIERS, ['curated', 'preview'])
  assert.equal(VENUE_UNLABELED, 'unlabeled')
})

test('F4 venue 归一：canonical / legacy / unlabeled / unknown 四态可分', () => {
  assert.deepEqual(normalizeVenueTier('CCF-A'), { tier: 'CCF-A', status: 'canonical' })
  assert.deepEqual(normalizeVenueTier(''), { tier: 'unlabeled', status: 'unlabeled' })
  assert.deepEqual(normalizeVenueTier(undefined), { tier: 'unlabeled', status: 'unlabeled' })
  // 登记在册的遗留值：不报红，但**不等于**归到了某一档（映射是 S10 的决策）
  assert.equal(normalizeVenueTier('workshop').status, 'legacy')
  assert.equal(normalizeVenueTier('workshop').tier, 'workshop')
  // 表外取值：必须报红
  assert.equal(normalizeVenueTier('second').status, 'unknown')
  assert.equal(normalizeVenueTier('顶刊').status, 'unknown')
})

test('F4 技术域 facet：取顶层域目录，**不是**卡的父目录名', () => {
  assert.equal(techDomainOf('paper2skills-vault/07-NLP-VOC/Skill-A.md'), '07-NLP-VOC')
  // 嵌套卡：父目录名是 `00-知识库-Skill卡片`（形态合法但是假域），顶层才是真域
  assert.equal(
    techDomainOf('paper2skills-vault/10-MAS/00-知识库-Skill卡片/Skill-B.md'), '10-MAS')
  assert.ok(TECH_DOMAIN_RE.test('00-知识库-Skill卡片'),
    '形态判据对假域是**放行**的 —— 所以必须有「实有域目录」这一层')
  assert.equal(techDomainOf('elsewhere/Skill-A.md'), null)
})

test('F4 frontmatter：嵌套结构不静默丢，进 unparsed', () => {
  const ok = parseFrontmatter('---\ntitle: X\nvenue_tier: CCF-A\n---\n正文')
  assert.equal(ok.fields.venue_tier, 'CCF-A')
  assert.deepEqual(ok.unparsed, [])
  const nested = parseFrontmatter('---\ntitle: X\nrelated:\n  - a\n  - b\n---\n')
  assert.equal(nested.fields.title, 'X')
  assert.equal(nested.unparsed.length, 2, '缩进行必须被记下来，不能当空值')
  // 反向：`#` 注释是合法 YAML，**不得**被当成「解析不了」
  // （首版在真实 vault 上报了 12 条假阳性：`# created 未知：本卡早于…` 这类编者按）
  const commented = parseFrontmatter(
    '---\ntitle: X\n# 这是一条编者按，不是字段\n  # 缩进的注释也是注释\nvenue_tier: CCF-A\n---\n')
  assert.deepEqual(commented.unparsed, [], 'YAML 注释不算 unparsed')
  assert.equal(commented.fields.venue_tier, 'CCF-A')
  assert.equal(parseFrontmatter('没有 frontmatter').has, false)
})

test('F4 五层链：卡能答出岗位/责任/格/方案/挂载点', () => {
  const idx = mk()
  const ch = resolveChain('Skill-C', idx)
  assert.ok(ch, 'Skill-C 必须在索引里')
  assert.deepEqual(ch.level1_roles.map((r) => r.id).sort(), ['AGT-002', 'AGT-023'])
  assert.deepEqual(ch.level3_cells.filter((c) => c.kind === 'M').map((c) => c.cell_id).sort(),
    ['FLOW-01/STG-04', 'FLOW-01/STG-05', 'FLOW-01/STG-08'])
  assert.deepEqual(ch.mountable, ['FLOW-01/STG-04', 'FLOW-01/STG-05', 'FLOW-01/STG-08'])
  assert.equal(idx.cards.get('Skill-C').cells.length, 8, '两个 L3 都在 FLOW-01 ⇒ 8 格，不重复计')
  assert.equal(resolveChain('Skill-ZZZ', idx), null, '不存在的卡必须给 null，不给默认链')
})

test('F4 双向筛选：两条独立轴，穷举组合都等价', () => {
  const idx = mk()
  for (const d of KNOWN) {
    for (const dom of tax.domains) {
      const r = axisAgree(idx, { domain: dom.id }, { tech_domain: d })
      assert.ok(r.agree, `${d} × ${dom.id} 不等价：仅左 ${r.onlyA} 仅右 ${r.onlyB}`)
    }
  }
  assert.equal(byFacet(idx, {}).length, 3, '技术轴不丢卡')
  assert.equal(byBusiness(idx, {}).length, 3, '业务轴不丢卡')
  // 两条轴真的在筛（不是恒等于全集）
  assert.deepEqual(byFacet(idx, { tech_domain: '10-MAS' }), ['Skill-B'])
  assert.deepEqual(byBusiness(idx, { l3: L3_A }), ['Skill-A'])
})

// --------------------------------------------------------------------------- //
// 变异样本：每条判据都要能被打红（断言恒真 = 没断言）
// --------------------------------------------------------------------------- //
const problemsOf = (idx) => validateAxis(idx, { knownDomains: KNOWN }).problems
const has = (ps, re) => ps.some((p) => re.test(p))

test('F4 变异 1：干净夹具必须 0 问题（先证明判据不是恒红）', () => {
  assert.deepEqual(problemsOf(mk()), [])
})

test('F4 变异 2：卡没有 L3 归属 ⇒ A2 报红', () => {
  const idx = mk((f) => { f.l3ByCard['Skill-B'] = [] })
  assert.ok(has(problemsOf(idx), /A2 Skill-B：无 L3 归属/), '未分类必须报出来（F5 的验收就是它）')
})

test('F4 变异 3：L3 名不在 151 条内 ⇒ A1 报红', () => {
  const idx = mk((f) => { f.l3ByCard['Skill-B'] = ['不存在的责任名'] })
  assert.ok(has(problemsOf(idx), /不在 taxonomy/))
})

test('F4 变异 4：L3 超 3 个 ⇒ A1 报红', () => {
  const idx = mk((f) => { f.l3ByCard['Skill-A'] = tax.l3.slice(0, 4).map((e) => e.name) })
  assert.ok(has(problemsOf(idx), /L3 数 4 超出/))
})

test('F4 变异 5：把卡挂到 R/D 格 ⇒ A3 报红（风险 N4）', () => {
  const idx = mk()
  const rCell = idx.graph.cells.find((c) => c.cell_kind === 'R')
  const ps = validateAxis(idx, { knownDomains: KNOWN, mountForced: { 'Skill-A': rCell.cell_id } }).problems
  assert.ok(has(ps, /R\/D 格零算法模型/), `挂到 ${rCell.cell_id} 必须报红`)
  const dCell = idx.graph.cells.find((c) => c.cell_kind === 'D')
  const ps2 = validateAxis(idx, { knownDomains: KNOWN, mountForced: { 'Skill-A': dCell.cell_id } }).problems
  assert.ok(has(ps2, /R\/D 格零算法模型/))
  // 反向：挂到 M 格**不得**报错（否则这条判据会把正常挂载也拦掉）
  const mCell = idx.graph.cells.find((c) => c.cell_kind === 'M')
  const ps3 = validateAxis(idx, { knownDomains: KNOWN, mountForced: { 'Skill-A': mCell.cell_id } }).problems
  assert.ok(!has(ps3, /R\/D 格零算法模型/))
})

test('F4 变异 6：tech_domain 退化成嵌套目录名 ⇒ A4 报红', () => {
  const idx = mk((f) => {
    f.graph.cards[1].path = 'paper2skills-vault/00-知识库-Skill卡片/Skill-B.md'
  })
  assert.ok(has(problemsOf(idx), /不在 vault 顶层域目录内/),
    '形态合法的假域必须靠「实有域目录」判出来')
})

test('F4 变异 7：venue_tier 表外取值 ⇒ A4 报红；已登记遗留值**不**报红', () => {
  const idx = mk((f) => {
    f.frontmatters['Skill-A'] = { fields: { venue_tier: 'second' }, unparsed: [], has: true }
    f.frontmatters['Skill-B'] = { fields: { venue_tier: 'workshop' }, unparsed: [], has: true }
  })
  const ps = problemsOf(idx)
  assert.ok(has(ps, /venue_tier「second」不在白名单 7 档/))
  assert.ok(!has(ps, /workshop/), '已登记的遗留值是**登记不报红**，否则等于逼人删掉证据')
  const audit = venueLegacyAudit(idx)
  assert.deepEqual(audit.seen, { workshop: 1 })
})

test('F4 变异 8：frontmatter 有解析不了的行 ⇒ A5 报红（不静默取空）', () => {
  const idx = mk((f) => {
    f.frontmatters['Skill-A'] = { fields: {}, unparsed: ['venue_tier: |'], has: true }
  })
  assert.ok(has(problemsOf(idx), /A5 Skill-A：frontmatter 有没解析出来的行/))
})

test('F4 变异 9：登记表腐烂 —— 遗留值不再出现时必须报出来', () => {
  const idx = mk()   // 没有任何 legacy 取值
  const audit = venueLegacyAudit(idx)
  assert.deepEqual(audit.stale.sort(), VENUE_LEGACY_PENDING.map((x) => x.value).sort(),
    '登记了却不再出现 ⇒ 提示清理；反之若出现表外的值 ⇒ A4 报红')
})

test('F4 判据非恒真：改一个节点，下游链必须变', () => {
  const cells = (l3) => {
    const ch = resolveChain('Skill-C', mk((f) => { f.l3ByCard['Skill-C'] = l3 }))
    assert.ok(ch, 'Skill-C 必须在索引里')
    return ch.level3_cells.map((c) => c.cell_id).sort()
  }
  assert.deepEqual(cells([L3_C, L3_B]).every((c) => c.startsWith('FLOW-01/')), true)
  assert.deepEqual(cells([L3_A]).every((c) => c.startsWith('FLOW-08/')), true,
    '换了责任域（岗位）而格子仍指同一 FLOW ⇒ 链是抄来的不是 join 出来的')
  assert.notDeepEqual(cells([L3_C, L3_B]), cells([L3_A]))
})
