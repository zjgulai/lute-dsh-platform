import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTaxonomy, l3Index, slugFor, validateClassification, resolveFacets, EXPECTED_GAPS, L3_MAX } from '../lib/taxonomy.js'

const tax = loadTaxonomy()
const index = l3Index(tax)

/** 取一个确定存在的 L3 名（避免 `Map.values().next().value` 的 undefined 类型）。 */
function anyL3Name() {
  const first = tax.l3[0]
  assert.ok(first, 'taxonomy 至少有一条 L3')
  return first.name
}

test('分类底座：4 面 / 8 责任域 / 151 细分业务', () => {
  assert.equal(tax.planes.length, 4)
  assert.equal(tax.domains.length, 8)
  assert.equal(tax.l3.length, 151)
  assert.equal(new Set(tax.l3.map((e) => e.name)).size, 151, 'L3 名必须唯一')
})

test('L1 编码与 order 基座对齐材料 D-021', () => {
  assert.deepEqual(
    tax.planes.map((p) => [p.id, p.name, p.order_base]),
    [
      ['PLN-MGT', '经营管理', 1000],
      ['PLN-OPS', '业务运营', 2000],
      ['PLN-CTL', '独立控制', 3000],
      ['PLN-PLT', '数据与Agent平台', 4000],
    ],
  )
})

test('每个 L3 都能导出唯一的 L1/L2', () => {
  const planes = new Set(tax.planes.map((p) => p.name))
  const domains = new Set(tax.domains.map((d) => d.name))
  for (const e of tax.l3) {
    assert.ok(planes.has(e.plane), `${e.name} 的 plane 不在四面内`)
    assert.ok(domains.has(e.domain), `${e.name} 的 domain 不在八域内`)
    assert.match(e.role_id, /^AGT-\d{3}$/)
  }
})

test('slugFor：1338 张卡的目录名全部合法且稳定', () => {
  assert.equal(slugFor('Skill-Customer-Complaint-Supply-Root-Cause-KPI'), 'p2s-customer-complaint-supply-root-cause-kpi')
  assert.equal(slugFor('Skill-BERT-MoE高效方面情感分析'), 'p2s-bert-moe')
  assert.match(slugFor('Skill-A-Plus-Content-Template-Engine'), /^[a-z0-9]+(-[a-z0-9]+)*$/)
})

test('validateClassification：L3 必须逐字来自 taxonomy', () => {
  const good = anyL3Name()
  const ok = validateClassification([{ id: 'Skill-A', l3: [good], confidence: 'high' }], tax)
  assert.equal(ok.problems.length, 0)

  const invented = validateClassification([{ id: 'Skill-B', l3: ['不存在的细分业务'], confidence: 'high' }], tax)
  assert.equal(invented.problems.length, 1)
  assert.match(invented.problems[0], /不在 taxonomy/)

  const tooMany = validateClassification([{ id: 'Skill-C', l3: tax.l3.slice(0, L3_MAX + 1).map((e) => e.name) }], tax)
  assert.ok(tooMany.problems.some((p) => /超出/.test(p)))
})

test('validateClassification：跨面多挂只计数，不算错误（树的归属由首个 L3 决定）', () => {
  const mgt = tax.l3.find((e) => e.plane_id === 'PLN-MGT')
  const ops = tax.l3.find((e) => e.plane_id === 'PLN-OPS')
  assert.ok(mgt && ops)
  const r = validateClassification([{ id: 'Skill-D', l3: [mgt.name, ops.name] }], tax)
  assert.equal(r.problems.length, 0)
  assert.equal(r.crossPlane, 1)
  const same = validateClassification([{ id: 'Skill-D2', l3: [mgt.name] }], tax)
  assert.equal(same.crossPlane, 0)
})

test('validateClassification：空 l3 必须写明理由', () => {
  const noNote = validateClassification([{ id: 'Skill-E', l3: [] }], tax)
  assert.ok(noNote.problems.some((p) => /note/.test(p)))
  assert.equal(noNote.blank, 1)
  const withNote = validateClassification([{ id: 'Skill-F', l3: [], note: '矩阵无对应细分业务' }], tax)
  assert.equal(withNote.problems.length, 0)
})

test('validateClassification：fills_gap 白名单', () => {
  const l3 = anyL3Name()
  const bad = validateClassification([{ id: 'Skill-G', l3: [l3], fills_gap: ['编造的缺口'] }], tax, { allowedGaps: EXPECTED_GAPS })
  assert.equal(bad.problems.length, 1)
  const ok = validateClassification([{ id: 'Skill-H', l3: [l3], fills_gap: [EXPECTED_GAPS[0]] }], tax, { allowedGaps: EXPECTED_GAPS })
  assert.equal(ok.problems.length, 0)
})

test('resolveFacets：把 L3 展开为可写进 frontmatter 的分类字段', () => {
  const e = tax.l3.find((x) => x.name === '需求预测')
  assert.ok(e, '需求预测 应存在于 151 条内')
  const f = resolveFacets({ l3: [e.name] }, tax)
  assert.ok(f)
  assert.equal(f.l2_domain, '供应与履约')
  assert.equal(f.l1_plane, '业务运营')
  assert.match(f.l3_id, /^DOM-03-\d{3}$/)
  assert.equal(f.l1_l2_l3, '业务运营/供应与履约/需求预测')
})

test('9 个已知缺口名互不重复', () => {
  assert.equal(EXPECTED_GAPS.length, 9)
  assert.equal(new Set(EXPECTED_GAPS).size, 9)
})
