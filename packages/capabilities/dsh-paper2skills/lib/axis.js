/**
 * dsh-paper2skills · 五层分类轴 + facet 层（PHASE6 F4）
 *
 * 分类骨架仍是 `lib/taxonomy.js` 的三层（4 面 / 8 责任域 / 151 细分业务），**本模块不重造判据**：
 * `validateClassification` / `resolveFacets` / `auditGapClaims` 直接复用，本模块只加两样东西：
 *
 *   ① **五层链**（PHASE6 任务书原文的五层，不是另一套编号）：
 *        ①50 岗位 → ②151 责任 → ③64 场景格 → ④8 方案域 + 139 契约 → ⑤N 算法卡
 *      链的**唯一事实源**是 `capability-graph.json`（F2 产物）；本模块只做 join，不产出任何新事实。
 *      ⚠️ 方案文档 §7 把它写成 L0–L5（6 行，契约单列）；任务书是 5 层（方案域与契约同层）。
 *      两者节点相同、只是切分不同，本模块按**任务书的 5 层**建模，并在 AXIS 里注明。
 *
 *   ② **三个 facet**（筛选面，不参与主分类、不参与任何门禁判定）：
 *        `tech_domain`  旧 16 技术域，取自卡在 vault 里的**顶层数字目录**
 *        `venue_tier`   venue 白名单 7 档 + `unlabeled`（缺失即 unlabeled，如实计数）
 *        `quality_tier` `curated`（精选线前台）/ `preview`（legacy 宽底）
 *
 * 三条纪律（都是本仓库踩出来的）：
 *   · **facet 不进主分类** —— 技术域错位（例：定价卡放在 `04-供应链/`）只登记，不改 L3。
 *   · **拿不到就炸，不给默认值** —— 认不出的 frontmatter / 缺 L3 / 不在词表内的取值，一律报出来。
 *   · **R/D 格零算法模型**（风险 N4）—— 卡只能挂 `cell_kind === 'M'` 的格。
 */

import { readFileSync } from 'node:fs'
import {
  loadTaxonomy, l3Index, validateClassification, resolveFacets, auditGapClaims,
  EXPECTED_GAPS, ADDITIONAL_GAPS, L3_MIN, L3_MAX,
} from './taxonomy.js'

export { L3_MIN, L3_MAX }

/** 五层（任务书口径）。`graph_path` 是它在 capability-graph.json 里的节点数组。 */
export const AXIS = [
  { level: 1, key: 'role', name: '岗位', graph_path: 'roles', docs: 'GPT 组织拓扑的 50 个岗位（4 面 / 8 域）' },
  { level: 2, key: 'responsibility', name: '责任', graph_path: 'l3', docs: '151 条细分业务（逐岗位责任名，MECE 划分）' },
  { level: 3, key: 'scene', name: '场景格', graph_path: 'cells', docs: '8 FLOW × 8 STG = 64 格，逐格 M/R/D 分型' },
  { level: 4, key: 'solution', name: '方案与契约', graph_path: 'solutions', docs: '8 份方案域（=8 FLOW）+ 139 份标定契约（A73 + B66）' },
  { level: 5, key: 'card', name: '算法卡', graph_path: 'cards', docs: '精选线 146 张（挂载点 = 契约）' },
]

/** venue 白名单 7 档（事实源：`07-资源库/venue-whitelist.md` §2 表）。 */
export const VENUE_TIERS = ['UTD24', 'FT50', 'CCF-A', 'CCF-B', 'field-top', 'preprint', 'non-paper']
/** venue_tier 缺失时的取值。**不是**一个 tier，统计时单独列。 */
export const VENUE_UNLABELED = 'unlabeled'

/**
 * 已登记但**不在白名单 7 档内**的卡片取值 —— 三套词表并存的实测残留。
 *
 * 事实源：实测 146 张卡里 25 张有 `venue_tier`，取值为
 * `preprint 9 / CCF-A 5 / CCF-B 4 / top 4 / workshop 2 / demo 1`。
 * `top` / `workshop` / `demo` 三个值白名单里没有，且不是「档位」而是**状态标记**
 * （whitelist §3 的降级表把 Workshop/Demo 判为「降一级」「降为 field-top 以下」，
 * 即它们描述的是**要不要降**，而不是降完之后是哪一档）。
 *
 * ⇒ 映射到哪一档是 **S10（venue 三词表统一）** 的决策，本模块**不替它决定**（`to: null`）。
 *   本表的作用只有一个：**登记**。出现在这里 ⇒ 计数、不报红；出现表外的值 ⇒ 报红。
 */
export const VENUE_LEGACY_PENDING = [
  { value: 'top', to: null, seen: 4, note: '语义不明：可能指 field-top，也可能指「顶刊」' },
  { value: 'workshop', to: null, seen: 2, note: 'whitelist §3：Workshop 判「降一级」，是降级动作而非档位' },
  { value: 'demo', to: null, seen: 1, note: 'whitelist §3：Demo 判「降为 field-top 以下」' },
]

/** quality_tier 词表（D4：精选线前台 / legacy 宽底）。 */
export const QUALITY_TIERS = ['curated', 'preview']

/** 技术域 facet 的形态判据：vault 顶层数字目录。 */
export const TECH_DOMAIN_RE = /^\d{2}-[^\s/]+$/

// --------------------------------------------------------------------------- //
// 读取
// --------------------------------------------------------------------------- //
export function loadGraph(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

/**
 * 平铺 YAML frontmatter 解析（只认 `key: value` 单行）。
 *
 * ⚠️ **不猜**：遇到缩进续行 / `- ` 列表项等嵌套结构，记进 `unparsed` 并在门禁里报出来，
 * 而不是静默当成空值 —— 「拿不到就炸，不要给默认值」。
 *
 * ⚠️ **`#` 注释行不是「没解析出来」**：首版把注释也算成 unparsed，在真实 vault 上报了
 * **12 条假阳性**（`# created 未知：本卡早于…`、`# 不填一个猜的日期` 这类编者按）。
 * 注释是合法的 YAML，跳过即可；而**缩进/列表项仍然是真信号**（那才是嵌套结构）。
 */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return { fields: {}, unparsed: ['（整卡无 frontmatter）'], has: false }
  const fields = {}
  const unparsed = []
  for (const raw of m[1].split(/\r?\n/)) {
    if (raw.trim() === '') continue
    if (/^\s*#/.test(raw)) continue          // YAML 注释：合法，不是「解析不了」
    if (/^\s/.test(raw) || /^\s*-\s/.test(raw)) {
      unparsed.push(raw.trim().slice(0, 60))
      continue
    }
    const i = raw.indexOf(':')
    if (i < 0) {
      unparsed.push(raw.trim().slice(0, 60))
      continue
    }
    fields[raw.slice(0, i).trim()] = raw.slice(i + 1).trim()
  }
  return { fields, unparsed, has: true }
}

/** 技术域 facet：`paper2skills-vault/<域>/…` 的第一段。 */
export function techDomainOf(vaultRelPath) {
  const parts = String(vaultRelPath).split('/')
  if (parts[0] !== 'paper2skills-vault' || parts.length < 3) return null
  return parts[1]
}

/**
 * venue_tier facet 归一。返回 `{tier, status}`，status ∈ `canonical | legacy | unlabeled | unknown`。
 * `unknown`（表外取值）由门禁报红。
 */
export function normalizeVenueTier(value) {
  const v = (value ?? '').trim()
  if (v === '') return { tier: VENUE_UNLABELED, status: 'unlabeled' }
  if (VENUE_TIERS.includes(v)) return { tier: v, status: 'canonical' }
  const legacy = VENUE_LEGACY_PENDING.find((x) => x.value === v)
  if (legacy) return { tier: legacy.to ?? v, status: 'legacy' }
  return { tier: v, status: 'unknown' }
}

// --------------------------------------------------------------------------- //
// 索引与链
// --------------------------------------------------------------------------- //
/**
 * 建索引。**三条轴各自独立建**（业务轴从 l3/cells 建、技术轴从路径建、venue 轴从 frontmatter 建），
 * 这样「双向筛选等价」才是一条真断言而不是同义反复 —— 见 `axisAgree()`。
 *
 * @param {object} graph capability-graph.json
 * @param {object} [opts]
 * @param {Record<string,{fields:Record<string,string>,unparsed:string[],has?:boolean}>} [opts.frontmatters] 卡 id → 解析出的 frontmatter
 * @param {Record<string,string[]>} [opts.l3ByCard] 卡 id → L3（默认取 graph.cards[].l3）
 * @param {Record<string,string>} [opts.notes] 卡 id → L3 空挂时的理由
 * @param {object} [opts.taxonomy] 覆盖分类底座（单测注入用）
 */
export function buildAxisIndex(graph, opts = {}) {
  const tax = opts.taxonomy ?? loadTaxonomy()
  const l3idx = l3Index(tax)
  const roles = new Map(graph.roles.map((r) => [r.id, r]))
  const cellsByFlow = new Map()
  for (const c of graph.cells) {
    if (!cellsByFlow.has(c.flow_id)) cellsByFlow.set(c.flow_id, [])
    cellsByFlow.get(c.flow_id).push(c)
  }
  const l3Role = new Map(graph.l3.map((x) => [x.name, x.role_id]))

  const cards = new Map()
  for (const c of graph.cards) {
    const id = c.name
    const l3 = (opts.l3ByCard?.[id] ?? c.l3 ?? []) || []
    const roleIds = [...new Set(l3.map((n) => l3Role.get(n)).filter(Boolean))]
    const flows = [...new Set(roleIds.flatMap((r) => roles.get(r)?.flows ?? []))].sort()
    const cells = flows.flatMap((f) => cellsByFlow.get(f) ?? [])
    const fm = opts.frontmatters?.[id]
    const tech = techDomainOf(c.path)
    cards.set(id, {
      id,
      path: c.path,
      l3,
      role_ids: roleIds,
      flows,
      cells,
      cells_mountable: cells.filter((x) => x.cell_kind === 'M').map((x) => x.cell_id),
      cells_frozen: cells.filter((x) => x.cell_kind !== 'M').map((x) => x.cell_id),
      tech_domain: tech,
      note: opts.notes?.[id] ?? '',
      venue_tier: normalizeVenueTier(fm?.fields?.venue_tier),
      quality_tier: 'curated',
      fm_unparsed: fm?.unparsed ?? [],
      facets: l3.length ? resolveFacets({ l3 }, tax) : null,
      gap_tiers: l3.length
        ? auditGapClaims({ l3, fills_gap: fm?.fields?.fills_gap ? [fm.fields.fills_gap] : [] }, tax)
        : null,
      _l3idx: l3idx,
    })
  }
  return { graph, tax, l3idx, roles, cellsByFlow, cards }
}

/** 一条卡的五层链（任一层取不到即 `null`，不补默认值）。 */
export function resolveChain(cardId, index) {
  const c = index.cards.get(cardId)
  if (!c) return null
  const solutionByFlow = new Map((index.graph.solutions ?? []).map((s) => [s.flow_id, s]))
  return {
    card: c.id,
    level1_roles: c.role_ids.map((r) => ({ id: r, title: index.roles.get(r)?.title ?? null })),
    level2_l3: c.l3,
    level3_cells: c.flows.flatMap((f) => (index.cellsByFlow.get(f) ?? []).map((x) => ({
      cell_id: x.cell_id, kind: x.cell_kind,
    }))),
    level4_solutions: c.flows.map((f) => ({ flow_id: f, solution: solutionByFlow.get(f)?.solution_id ?? null })),
    level5_card: c.id,
    mountable: c.cells_mountable,
  }
}

// --------------------------------------------------------------------------- //
// 两条独立的筛选轴（验收：技术域与业务轴可双向筛选）
// --------------------------------------------------------------------------- //
/** 业务轴筛选：按 L3 / 面 / 域 / FLOW / 格号 / cell_kind。 */
export function byBusiness(index, sel = {}) {
  const out = []
  for (const c of index.cards.values()) {
    if (sel.l3 && !c.l3.includes(sel.l3)) continue
    if (sel.plane && !c.l3.some((n) => index.l3idx.get(n)?.plane_id === sel.plane)) continue
    if (sel.domain && !c.l3.some((n) => index.l3idx.get(n)?.domain_id === sel.domain)) continue
    if (sel.flow && !c.flows.includes(sel.flow)) continue
    if (sel.cell && !c.cells.some((x) => x.cell_id === sel.cell)) continue
    if (sel.cell_kind && !c.cells.some((x) => x.cell_kind === sel.cell_kind)) continue
    if (sel.role && !c.role_ids.includes(sel.role)) continue
    out.push(c.id)
  }
  return out
}

/** 技术/质量轴筛选：按 tech_domain / venue_tier / quality_tier。三者都**不碰**业务字段。 */
export function byFacet(index, sel = {}) {
  const out = []
  for (const c of index.cards.values()) {
    if (sel.tech_domain && c.tech_domain !== sel.tech_domain) continue
    if (sel.venue_tier && c.venue_tier.tier !== sel.venue_tier) continue
    if (sel.quality_tier && c.quality_tier !== sel.quality_tier) continue
    out.push(c.id)
  }
  return out
}

/** 两条轴在同一次查询里是否给出同一集合（顺序无关）。两侧各自独立建索引，故这是真断言。 */
export function axisAgree(index, businessSel, facetSel) {
  const a = new Set(byFacet(index, facetSel).filter((id) => byBusiness(index, businessSel).includes(id)))
  const b = new Set(byBusiness(index, businessSel).filter((id) => byFacet(index, facetSel).includes(id)))
  const onlyA = [...a].filter((x) => !b.has(x))
  const onlyB = [...b].filter((x) => !a.has(x))
  return { agree: onlyA.length === 0 && onlyB.length === 0, onlyA, onlyB }
}

// --------------------------------------------------------------------------- //
// 门禁
// --------------------------------------------------------------------------- //
/**
 * 判据（每条都能失败；selftest 里每条配一份篡改样本）：
 *  A1 每张卡 1–3 个 L3，逐字命中 151 条（复用 taxonomy.validateClassification）
 *  A2 空 l3 必须带 note（登记为「无对应责任」而不是静默漏分）
 *  A3 卡只能挂 M 格 —— 强制挂 R/D 格即报错（风险 N4）
 *  A4 facet 词表封闭：tech_domain 形态合法；venue_tier 表外取值报红；quality_tier ∈ 词表
 *  A5 frontmatter 有没解析出来的行 ⇒ 报出来（不静默取空）
 *  A6 双向筛选等价 + 两条轴都不丢卡（覆盖面 = 全卡）
 */
export function validateAxis(index, opts = {}) {
  const problems = []
  const allowedGaps = [...EXPECTED_GAPS, ...ADDITIONAL_GAPS]
  const techDomains = new Set()
  let unlabeled = 0
  let legacy = 0
  const blank = []

  const known = opts.knownDomains ? new Set(opts.knownDomains) : null
  for (const c of index.cards.values()) {
    if (c.l3.length === 0) {
      // 空 l3 是**合法结论**（产品侧已有 11 条先例），但必须登记理由 —— 否则就是静默漏分
      blank.push(c.id)
      problems.push(`A2 ${c.id}：无 L3 归属${(c.note || '').trim() ? '' : '（且没有 note 说明理由）'}`)
    } else {
      const r = validateClassification([{ id: c.id, l3: c.l3 }], index.tax, { allowedGaps })
      for (const p of r.problems) problems.push(`A1 ${p}`)
      if (c.l3.length < L3_MIN || c.l3.length > L3_MAX) {
        problems.push(`A1 ${c.id}：L3 数 ${c.l3.length} 超出 ${L3_MIN}–${L3_MAX}`)
      }
    }
    if (opts.mountForced?.[c.id]) {
      const forced = opts.mountForced[c.id]
      const cell = index.graph.cells.find((x) => x.cell_id === forced)
      if (cell && cell.cell_kind !== 'M') {
        problems.push(`A3 ${c.id}：被挂到 ${forced}（cell_kind=${cell.cell_kind}）—— R/D 格零算法模型（N4）`)
      }
    }
    if (!c.tech_domain) {
      problems.push(`A4 ${c.id}：取不到技术域（路径 ${c.path} 不在 paper2skills-vault/<域>/ 下）`)
    } else if (!TECH_DOMAIN_RE.test(c.tech_domain)) {
      problems.push(`A4 ${c.id}：tech_domain「${c.tech_domain}」不是顶层数字域目录`)
    } else if (known && !known.has(c.tech_domain)) {
      // 形态合法但**不在 vault 顶层实有的域目录里** —— 嵌套卡取 `p.parent.name` 就是这个下场：
      // `00-知识库-Skill卡片` 形态合法，却会把 07-NLP-VOC 与 10-MAS 的卡混成一个假域。
      problems.push(`A4 ${c.id}：tech_domain「${c.tech_domain}」不在 vault 顶层域目录内`
        + `（实有 ${known.size} 个：${[...known].join(' ')}）`)
    }
    techDomains.add(c.tech_domain)
    if (c.venue_tier.status === 'unknown') {
      problems.push(`A4 ${c.id}：venue_tier「${c.venue_tier.tier}」不在白名单 7 档、也不在已登记的遗留表里`)
    }
    if (c.venue_tier.status === 'unlabeled') unlabeled++
    if (c.venue_tier.status === 'legacy') legacy++
    if (!QUALITY_TIERS.includes(c.quality_tier)) {
      problems.push(`A4 ${c.id}：quality_tier「${c.quality_tier}」不在 ${QUALITY_TIERS}`)
    }
    for (const u of c.fm_unparsed) {
      problems.push(`A5 ${c.id}：frontmatter 有没解析出来的行「${u}」`)
    }
  }

  // A6 两条轴：不丢卡 + 双向等价
  const all = [...index.cards.keys()]
  const viaBiz = byBusiness(index, {})
  const viaFacet = byFacet(index, {})
  if (viaBiz.length !== all.length) problems.push(`A6 业务轴丢卡：${all.length} → ${viaBiz.length}`)
  if (viaFacet.length !== all.length) problems.push(`A6 facet 轴丢卡：${all.length} → ${viaFacet.length}`)
  // 每个技术域 × 每个责任域都要双向等价（穷举，不是抽一个样本）
  for (const d of techDomains) {
    for (const dom of index.tax.domains) {
      const agree = axisAgree(index, { domain: dom.id }, { tech_domain: d })
      if (!agree.agree) {
        problems.push(`A6 双向筛选不等价（tech_domain=${d} × ${dom.id}）：`
          + `仅左 ${agree.onlyA} / 仅右 ${agree.onlyB}`)
      }
    }
  }

  return {
    problems,
    blank,
    stats: {
      cards: all.length,
      classified: all.length - blank.length,
      tech_domains: [...techDomains].filter(Boolean).sort(),
      venue_unlabeled: unlabeled,
      venue_legacy: legacy,
      cells_mountable: [...new Set([...index.cards.values()].flatMap((c) => c.cells_mountable))].length,
      mountable_cards: [...index.cards.values()].filter((c) => c.cells_mountable.length).length,
    },
  }
}

/** 已登记的遗留 venue 取值 vs 实测：出现表外的值报红；登记了却不再出现 ⇒ 提示清理。 */
export function venueLegacyAudit(index) {
  const seen = new Map()
  for (const c of index.cards.values()) {
    if (c.venue_tier.status === 'legacy') {
      seen.set(c.venue_tier.tier, (seen.get(c.venue_tier.tier) ?? 0) + 1)
    }
  }
  const stale = VENUE_LEGACY_PENDING.filter((x) => !seen.has(x.value)).map((x) => x.value)
  const drift = VENUE_LEGACY_PENDING
    .filter((x) => seen.has(x.value) && seen.get(x.value) !== x.seen)
    .map((x) => `${x.value}: 登记 ${x.seen} 实测 ${seen.get(x.value)}`)
  return { seen: Object.fromEntries([...seen].sort()), stale, drift }
}
