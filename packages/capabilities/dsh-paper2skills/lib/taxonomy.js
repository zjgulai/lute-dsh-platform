/**
 * dsh-paper2skills · 分类底座（岗位矩阵三层）
 *
 * 分类骨架**原样**取自材料 D-021 的组织拓扑，不另造一套语言：
 *   L1 面（plane，第一视角）      4 个：经营管理 / 业务运营 / 独立控制 / 数据与Agent平台
 *   L2 责任域（domain view，第二视角） 8 个：经营与组织 … 数据与AI运行
 *   L3 细分业务                    151 个：逐字取自每个岗位 role-catalog 的 skills[]
 *
 * 一张 skill 卡可挂 1–3 个 L3（多挂 = 同时供给多个细分业务）；L1/L2 由 L3 唯一导出，
 * 不允许跨面多挂 —— 否则「技能供给」与「岗位责任」两套账就无法对账。
 *
 * 本模块只做读取与校验，不写盘；调用方（scripts/*、后续的设置页插件）共享同一份判据。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 包根目录（packages/capabilities/dsh-paper2skills）。 */
export const PKG_ROOT = join(HERE, '..')
/** 入库的分类资产目录。 */
export const DATA_DIR = join(PKG_ROOT, 'data')
/** 可重建的派生产物目录（已在 .gitignore 的 `generated/` 规则内，不入库）。 */
export const GENERATED_DIR = join(PKG_ROOT, 'generated')

/** DSH 技能目录名的合法形态。 */
export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** 技能卡 id → 技能目录名的统一前缀（保证与既有 272 技能零冲突，且来源一眼可辨）。 */
export const SLUG_PREFIX = 'p2s-'
/** SKILL.md 描述上限（沿用 81-Skills 的 validateFrontmatter 判据）。 */
export const MAX_DESC = 500
/** SKILL.md 正文上限（超出则代码模板需移入 references/）。 */
export const MAX_SKILL_BYTES = 12 * 1024
/** 单卡允许的 L3 挂载数区间。 */
export const L3_MIN = 1
export const L3_MAX = 3

/**
 * 平台当前「无供给」的 9 个细分业务（来自 50 岗位 skill-map 的 gap 判定）。
 * 分类时用它做 `fills_gap` 白名单：只有真正补上这些缺口的卡才允许命中。
 */
export const EXPECTED_GAPS = [
  '依赖协调',
  '异常冻结与恢复',
  '数据管道',
  '容量管理',
  '证据复核',
  '纠正预防措施',
  '安全事件处理',
  '抽样审计',
  '利益冲突检查',
]

/**
 * `fills_gap` 允许命名的缺口 = 9 个已知缺口，外加分类过程中新发现的矩阵空白
 * （例如 ESG 碳披露、评价管理/口碑修复）。新空白必须在此登记后才能被引用，
 * 避免「静默扩表」。
 */
export const ADDITIONAL_GAPS = ['矩阵空白-ESG碳披露', '矩阵空白-评价与口碑管理']

/**
 * @typedef {object} L3Entry
 * @property {'L3'} level
 * @property {number} no
 * @property {string} name
 * @property {string} plane_id
 * @property {string} plane
 * @property {string} domain_id
 * @property {string} domain
 * @property {string} role_id
 * @property {string} role_alias
 * @property {string} role_title
 * @property {string} l1_l2_l3
 */

/**
 * @typedef {object} Taxonomy
 * @property {string} version
 * @property {Array<{level:'L1',idx:number,id:string,name:string,purpose:string,role_count:number,order_base:number}>} planes
 * @property {Array<{level:'L2',idx:number,id:string,name:string,role_count:number}>} domains
 * @property {L3Entry[]} l3
 * @property {Array<{plane_id:string,plane:string,domain_id:string,domain:string,l1_l2:string,l3_count:number}>} cells
 */

/** 读取入库的三层分类底座。 */
export function loadTaxonomy() {
  return /** @type {Taxonomy} */ (JSON.parse(readFileSync(join(DATA_DIR, 'taxonomy.json'), 'utf8')))
}

/** L3 名 → 条目 的索引（判据的唯一来源）。 */
export function l3Index(tax) {
  /** @type {Map<string, L3Entry>} */
  const map = new Map()
  for (const e of tax.l3) map.set(e.name, e)
  return map
}

/** 卡片 id → 技能目录名。非 ASCII 一律折叠为 `-`，因此对中文卡名同样安全。 */
export function slugFor(cardId) {
  const base = String(cardId).replace(/^Skill-/, '').toLowerCase()
  const slug = `${SLUG_PREFIX}${base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
  return slug
}

/**
 * 校验一批分类结果。返回 problems 为空即通过。
 *
 * @param {Array<{id:string,l3:string[],confidence?:string,fills_gap?:string[],note?:string}>} items
 * @param {Taxonomy} tax
 * @param {{allowedGaps?:string[]}} [opts]
 * @returns {{ok:number, blank:number, crossPlane:number, problems:string[]}}
 */
export function validateClassification(items, tax, opts = {}) {
  const index = l3Index(tax)
  const problems = []
  const seen = new Set()
  let blank = 0
  let crossPlane = 0
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || it.id === '') {
      problems.push('存在缺少 id 的条目')
      continue
    }
    if (seen.has(it.id)) problems.push(`${it.id}: 重复出现`)
    seen.add(it.id)
    if (!Array.isArray(it.l3)) {
      problems.push(`${it.id}: l3 不是数组`)
      continue
    }
    if (it.l3.length === 0) {
      blank++
      if (!it.note) problems.push(`${it.id}: 空 l3 必须在 note 说明理由`)
      continue
    }
    if (it.l3.length < L3_MIN || it.l3.length > L3_MAX) {
      problems.push(`${it.id}: l3 数量 ${it.l3.length} 超出 ${L3_MIN}–${L3_MAX}`)
    }
    if (new Set(it.l3).size !== it.l3.length) problems.push(`${it.id}: l3 存在重复项`)
    for (const name of it.l3) {
      if (!index.has(name)) problems.push(`${it.id}: L3「${name}」不在 taxonomy 的 151 条内（禁止改写/新造/简称）`)
    }
    // 跨面多挂**不是错误**：一张卡可以同时服务多个责任域（例如合规监控卡既属独立控制的
    // 产品准入核对、又属业务运营的规则监测）。树的唯一归属由**首个 L3**决定（见 resolveFacets），
    // 其余 L3 只参与供给覆盖统计。这里只计数，供报告与人工抽检。
    const planes = new Set(it.l3.map((n) => index.get(n)?.plane_id).filter(Boolean))
    if (planes.size > 1) crossPlane++
    if (typeof it.confidence === 'string' && !['high', 'medium', 'low'].includes(it.confidence)) {
      problems.push(`${it.id}: confidence 取值非法（${it.confidence}）`)
    }
    if (it.fills_gap !== undefined) {
      if (!Array.isArray(it.fills_gap)) problems.push(`${it.id}: fills_gap 不是数组`)
      else if (opts.allowedGaps) {
        for (const g of it.fills_gap) {
          if (!opts.allowedGaps.includes(g)) problems.push(`${it.id}: fills_gap「${g}」不在允许缺口表内`)
        }
      }
    }
  }
  return { ok: items.length - problems.length, blank, crossPlane, problems }
}

/**
 * 把一条分类结果展开为写进 SKILL.md frontmatter 的分类字段。
 * L1/L2 由首个 L3 唯一导出（validateClassification 已保证不跨面）。
 *
 * @param {{l3:string[]}} item
 * @param {Taxonomy} tax
 * @returns {{l1_id:string,l1_plane:string,l2_id:string,l2_domain:string,l3_id:string,l3_business:string,l3_all:string,l1_l2_l3:string}|null}
 */
export function resolveFacets(item, tax) {
  const index = l3Index(tax)
  const first = index.get(item.l3[0])
  if (!first) return null
  const no = String(first.no).padStart(3, '0')
  return {
    l1_id: first.plane_id,
    l1_plane: first.plane,
    l2_id: first.domain_id,
    l2_domain: first.domain,
    l3_id: `${first.domain_id}-${no}`,
    l3_business: first.name,
    l3_all: item.l3.join(' / '),
    l1_l2_l3: `${first.plane}/${first.domain}/${first.name}`,
  }
}

/**
 * 缺口认领分层校准。
 *
 * 背景：9 个平台缺口**本身就是 151 条 L3 里的名字**（如 `数据管道` = AGT-046 清源的一个细分业务、
 * `容量管理` = AGT-049 稳行的细分业务）。因此「这张卡补上某缺口」必须与「这张卡被分到了哪些 L3」
 * 自洽，否则会出现这样的虚报：一张供应链产能卡认领 `容量管理` 缺口 —— 而矩阵里的 `容量管理`
 * 指的是 AI 运行容量（并发/配额/成本），不是工厂产能。
 *
 * 判据（三档，决定下游 `skill-map.json` 的 direct / partial / 仍为 gap）：
 *  - **strong（direct）**：缺口名就是本卡已挂的 L3 之一 —— 卡确实在做这件事。
 *  - **adjacent（partial）**：缺口名不是本卡 L3，但本卡至少一个 L3 与缺口同属一个 L2 责任域 ——
 *    同一责任域内的邻接供给，可算部分供给。
 *  - **dropped**：跨责任域且未挂该 L3 —— 视为虚报，丢弃（保留在 `dropped` 里供审计，不静默抹掉）。
 *
 * @param {{l3:string[], fills_gap?:string[]}} item
 * @param {Taxonomy} tax
 * @returns {{strong:string[], adjacent:string[], dropped:string[]}}
 */
export function auditGapClaims(item, tax) {
  const index = l3Index(tax)
  const myL3 = item.l3 || []
  const myDomains = new Set(myL3.map((n) => index.get(n)?.domain_id).filter(Boolean))
  /** @type {{strong:string[],adjacent:string[],dropped:string[]}} */
  const out = { strong: [], adjacent: [], dropped: [] }
  for (const g of item.fills_gap || []) {
    const ge = index.get(g)
    if (!ge) out.dropped.push(g)
    else if (myL3.includes(g)) out.strong.push(g)
    else if (myDomains.has(ge.domain_id)) out.adjacent.push(g)
    else out.dropped.push(g)
  }
  return out
}
