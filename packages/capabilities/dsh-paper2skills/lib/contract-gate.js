/**
 * dsh-paper2skills · 契约闸门（PHASE6 S12 / Q5）
 *
 * 一句话：**一张卡只有被某份供给契约引用，才允许进入模型目录。**
 *
 * 为什么闸门在这里：−0.95 那次参数移植发生在卡**被模型调用**的那一刻，不在卡**入库**的那一刻
 * （入卡取弱门槛是 Q4 的既定决定）。而消费口本来就有闸门 —— 实测 1338 张 p2s 卡全部
 * `disable-model-invocation: true`，只经**岗位 preset 的 skill-subset 白名单**逐岗露出。
 * 所以 S12 不是新增一道门，是**给一道已存在的门补上一个判据**。
 *
 * ## 三个命名空间（这是本模块存在的主要理由）
 *
 * 同一张卡在链路里有三种写法，闸门必须能对上，否则会得到**假绿**：
 *
 * | 写法 | 例 | 出自 | 消费口认不认 |
 * |---|---|---|---|
 * | slug | `p2s-ad-attribution-modeling` | `classification.json[].slug`，也是技能目录名 | ✅ 认（白名单里就是它） |
 * | 卡 id | `Skill-Ad-Attribution-Modeling` | `classification.json[].id` | ⚠️ 只能经 slug 换算 |
 * | 精选线 id | `Skill-CrossLingual-Semantic-Alignment` | `card-classification.json`（146 张） | ❌ 尚未装线（S5 换底前不存在） |
 *
 * 一份契约的 `cards` 字段里**三种都可能出现**（S1 实测：116 条 slug + 5 条精选线 id）。
 * 判定必须逐条落到「绑定 / 待装线 / 无法解析」三态之一，**任何一条都不许被静默丢弃** ——
 * 「查不到」与「没问题」是两件事，这是本仓库 scan_secrets 退出码 2 的同一条纪律。
 *
 * ## 本模块只给判据，不写盘、不改白名单
 *
 * 调用方：
 *   - `scripts/check-contract-gate.mjs` —— 消费口闸门的独立核对器（读**已生成**的 preset，不是读生成器的意图）
 *   - `scripts/role-presets/generate.mjs` —— 白名单生成器（消费同一份判据）
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(HERE, '..')

/** vault 跨仓路径：与 `check-axis.mjs` 同一条推导，推不到由调用方 exit 2，绝不静默当空数据。 */
export const DEFAULT_VAULT = process.env.P2S_VAULT
  ?? resolve(PKG_ROOT, '../../../../paper_to_skills/paper2skills-vault')

/** 相对 vault 根的两份输入。 */
export const CONTRACTS_REL = '07-资源库/contracts'
export const CARD_CLASSIFICATION_REL = '07-资源库/card-classification.json'

/** 白名单条目的「契约状态」——这是 S12 新增的那一个维度。 */
export const CARD_STATE = {
  /** 白名单里，且被某份契约引用 ⇒ 允许进模型目录。 */
  BOUND: '已挂契约',
  /** 白名单里，但没有任何契约引用它 ⇒ 过渡期只计数，不硬拦；硬拦时从这里移除。 */
  PENDING: '待挂契约',
  /** 压根没进任何岗位白名单 ⇒ 与 S12 无关（归 S13 / Q4 的账）。 */
  UNWIRED: '未接线',
}

/** 契约 `cards` 条目解析后的落点。 */
export const REF_KIND = {
  /** 解析成一张已装线的卡（slug 或可换算的 id）。 */
  BOUND: 'bound',
  /** 指向精选线里的一张卡，但 S5 换底前它还没进技能目录。 */
  PENDING_INSTALL: 'pending-install',
  /** 三个命名空间里都找不到 —— 这是**缺陷**，必须报红，不许静默丢弃。 */
  UNRESOLVABLE: 'unresolvable',
}

/** 契约文件本身的形态问题（与「卡」无关，是契约数据的缺陷）。 */
export const CONTRACT_DIR = ['A', 'B']

/**
 * 取 YAML frontmatter 块（第一个 `---` 对之间）。取不到返回 null —— 不返回空串，
 * 空串会让下游把「没有 frontmatter」当成「frontmatter 里没有这个字段」。
 */
export function frontmatterBlock(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  return m ? m[1] : null
}

/** 取顶层标量字段（`key: value`），只认行首无缩进的形态。 */
export function scalarField(block, key) {
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(block)
  return m ? m[1].trim() : null
}

/**
 * 取顶层内联列表字段（`key: [a, b]`）。
 *
 * ⚠️ **刻意严格**：只接受**同一行闭合**的内联列表。多行 YAML 列表（`key:\n  - a`）在这里
 * 会返回 `{ok:false}` 而不是「空列表」—— 静默把多行列表读成 0 条，会让一份明明引用了几张卡的
 * 契约被判成「没引用任何卡」，这正是漏洞 #11「判据只认一种形态」的复发点。
 */
export function listField(block, key) {
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(block)
  if (!m) return { ok: false, reason: 'MISSING', items: [] }
  const raw = m[1].trim()
  if (raw === '[]') return { ok: true, items: [] }
  if (raw === '') return { ok: false, reason: 'MULTILINE_OR_EMPTY', items: [] }
  if (!raw.startsWith('[') || !raw.endsWith(']')) return { ok: false, reason: 'NOT_INLINE_LIST', items: [] }
  const items = raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
  return { ok: true, items }
}

/**
 * 读全部契约，抽出 frontmatter 与 `cards` 引用。
 *
 * @param {string} contractsDir 契约目录（其下 A/ B/ 两个子目录）
 * @returns {{contracts:Array, problems:Array}}
 */
export function readContracts(contractsDir) {
  const contracts = []
  const problems = []

  const dirs = CONTRACT_DIR.map((sub) => ({ sub, dir: join(contractsDir, sub) })).filter((d) => existsSync(d.dir))
  if (dirs.length === 0) {
    // 目录不存在不是「零引用」，是**输入没拿到** —— 由调用方转成退出码 2。
    return { contracts, problems, missing: true }
  }

  for (const { sub, dir } of dirs) {
    const files = readdirSync(dir).filter((n) => /^CTR-.*\.md$/.test(n)).sort()
    for (const file of files) {
      const path = join(dir, file)
      const text = readFileSync(path, 'utf8')
      const block = frontmatterBlock(text)
      const id = file.replace(/\.md$/, '').replace(/-(.+)$/, '')
      if (block === null) {
        problems.push({ kind: 'NO_FRONTMATTER', sub, file, detail: '整份文件没有 frontmatter，cards 无从判定' })
        continue
      }
      const lf = listField(block, 'cards')
      if (!lf.ok) {
        problems.push({ kind: 'CARDS_UNREADABLE', sub, file, detail: `cards 不是同一行闭合的内联列表（${lf.reason}）` })
      }
      contracts.push({
        sub,
        file,
        id: scalarField(block, 'contract_id') ?? id,
        responsibility: scalarField(block, 'responsibility') ?? '',
        roleId: scalarField(block, 'role_id') ?? '',
        template: scalarField(block, 'template') ?? sub,
        status: scalarField(block, 'status') ?? '',
        cards: lf.ok ? lf.items : null,
      })
    }
  }
  return { contracts, problems, missing: false }
}

/**
 * 建「卡 → 契约」反向索引，并把每条引用解析到三态。
 *
 * @param {object} a
 * @param {Array} a.contracts        readContracts 的产出
 * @param {Map<string,string>} a.slugById       classification.json：id → slug（1338 张已装线）
 * @param {Set<string>} a.installedSlugs        classification.json：全部 slug（已装线）
 * @param {Set<string>} a.selIds               card-classification.json：精选线 146 张 id（含尚未装线的）
 * @returns {{bySlug:Map, refs:Array, counts:object}}
 */
export function resolveRefs({ contracts, slugById, installedSlugs, selIds }) {
  /** @type {Map<string, Array<{contract:string, raw:string, kind:string}>>} */
  const bySlug = new Map()
  const refs = []
  const counts = { [REF_KIND.BOUND]: 0, [REF_KIND.PENDING_INSTALL]: 0, [REF_KIND.UNRESOLVABLE]: 0 }

  for (const c of contracts) {
    for (const raw of c.cards ?? []) {
      let slug = null
      let kind = REF_KIND.UNRESOLVABLE
      if (installedSlugs.has(raw)) {
        slug = raw
        kind = REF_KIND.BOUND
      } else if (slugById.has(raw)) {
        // id 形态 → 换算成白名单认的 slug（命名空间归一化，不是放宽判据）
        slug = slugById.get(raw)
        kind = REF_KIND.BOUND
      } else if (selIds.has(raw)) {
        // 精选线里确实有这张卡，但它还没进技能目录（S5 换底负责）⇒ 记「待装线」，不记引用成功
        kind = REF_KIND.PENDING_INSTALL
      }
      refs.push({ raw, kind, slug, contract: c.id, file: c.file })
      counts[kind] += 1
      if (slug && kind === REF_KIND.BOUND) {
        if (!bySlug.has(slug)) bySlug.set(slug, [])
        bySlug.get(slug).push({ contract: c.id, raw })
      }
    }
  }
  return { bySlug, refs, counts }
}

/**
 * `skills.subset` 在 manifest 里的**两个已知落点**。
 *
 * ⚠️ 实测撞出来的坑：preset manifest 的顶层键是 `format/version/id/.../material/x_lute`，
 * skill-subset 在 **`x_lute.skills.subset`**（平台扩展命名空间）里，顶层**没有** `skills`。
 * 第一版只读顶层 `m.skills.subset` ⇒ 50 个岗位全部读空，而账照样打出来
 * 「已挂契约 0 / 未接线 1338」—— **一个看起来像真结果的假绿**。
 * 故此处两个落点都试，且**两个都拿不到就报错**（见 readPresetSubsets 的 missing 语义），
 * 绝不把「字段名没对上」静默降级成「零接线」。
 */
const SUBSET_PATHS = [
  (m) => m?.x_lute?.skills?.subset,
  (m) => m?.skills?.subset,
]

/**
 * 读模型目录的**实物**：每个岗位 preset 的 skill-subset。
 *
 * 刻意读已生成的 preset 而不是生成器的意图 —— 闸门要核对的是
 * 「模型实际看得见什么」，不是「生成器以为它写了什么」。
 *
 * @param {string} presetsRoot  例如 ~/.dsh/.agent-presets
 * @returns {{byRole:Map<string,string[]>, p2sByRole:Map<string,string[]>, roles:number,
 *            missing:boolean, manifests:number, unreadable:string[]}}
 *          `missing` = **没有任何岗位可读**（目录不存在，或目录里有 manifest 但一个 subset 都取不到）。
 *          后者是字段名/形态变了，必须由调用方 exit 2 —— 「没东西可查」不等于「查过了没问题」。
 */
export function readPresetSubsets(presetsRoot) {
  const byRole = new Map()
  const p2sByRole = new Map()
  const unreadable = []
  let manifests = 0
  if (!existsSync(presetsRoot)) {
    return { byRole, p2sByRole, roles: 0, missing: true, manifests: 0, unreadable }
  }
  const dirs = readdirSync(presetsRoot).filter((n) => /^agt-\d+$/.test(n)).sort()
  for (const d of dirs) {
    const p = join(presetsRoot, d, 'manifest.json')
    if (!existsSync(p)) { unreadable.push(`${d}: 没有 manifest.json`); continue }
    manifests += 1
    const m = JSON.parse(readFileSync(p, 'utf8'))
    const subset = SUBSET_PATHS.map((f) => f(m)).find((v) => Array.isArray(v))
    if (!subset) { unreadable.push(`${d}: manifest 里两个已知落点都取不到 skills.subset`); continue }
    byRole.set(d, subset.slice().sort())
    p2sByRole.set(d, subset.filter((s) => s.startsWith('p2s-')).sort())
  }
  return { byRole, p2sByRole, roles: byRole.size, missing: byRole.size === 0, manifests, unreadable }
}

/**
 * 算账：每张 p2s 卡在消费口处于哪一态。
 *
 * @param {object} a
 * @param {Array<{slug:string, id:string}>} a.items   classification.json 的 items（已装线 1338 张）
 * @param {Map<string,string[]>} a.p2sByRole          岗位 → 该岗白名单里的 p2s 条目
 * @param {Map<string,Array>} a.bySlug                卡 → 引用它的契约（resolveRefs 的产出）
 */
export function computeLedger({ items, p2sByRole, bySlug }) {
  const wiredRoles = new Map()
  for (const [role, ids] of p2sByRole) {
    for (const id of ids) {
      if (!wiredRoles.has(id)) wiredRoles.set(id, [])
      wiredRoles.get(id).push(role)
    }
  }
  const cards = []
  const counts = { [CARD_STATE.BOUND]: 0, [CARD_STATE.PENDING]: 0, [CARD_STATE.UNWIRED]: 0 }
  for (const it of items) {
    const roles = wiredRoles.get(it.slug) ?? []
    const contracts = (bySlug.get(it.slug) ?? []).map((r) => r.contract)
    const wired = roles.length > 0
    const state = !wired ? CARD_STATE.UNWIRED : (contracts.length > 0 ? CARD_STATE.BOUND : CARD_STATE.PENDING)
    counts[state] += 1
    cards.push({ slug: it.slug, id: it.id, l3: it.l3 ?? [], wired, roles, contracts, state })
  }
  // 白名单里有、但不在 classification.json 的条目 —— 不能静默略过（会是白名单的第二份事实源）
  const knownSlugs = new Set(items.map((x) => x.slug))
  const ghostWired = [...wiredRoles.keys()].filter((s) => !knownSlugs.has(s)).sort()
  return {
    cards,
    counts,
    total: items.length,
    wiredSlugs: [...wiredRoles.keys()].sort(),
    ghostWired,
    pendingWired: cards.filter((c) => c.state === CARD_STATE.PENDING),
    boundWired: cards.filter((c) => c.state === CARD_STATE.BOUND),
  }
}

/**
 * 白名单过滤器（生成器与核对器共用**同一份**判据，避免两处口径分叉）。
 *
 * @param {string[]} subsetIds 一个岗位的白名单
 * @param {Map<string,string>} boundBySlug 卡 slug → '已挂契约'（只放行这里的）
 * @returns {{kept:string[], dropped:string[]}} dropped 只含 p2s-*（非 p2s 是平台原生技能，不归本闸门管）
 */
export function filterSubset(subsetIds, boundBySlug) {
  const kept = []
  const dropped = []
  for (const id of subsetIds) {
    if (!id.startsWith('p2s-')) { kept.push(id); continue }
    if (boundBySlug.has(id)) kept.push(id)
    else dropped.push(id)
  }
  return { kept, dropped }
}

/** 一份契约里 `status: 可写` 却没有任何可绑定的卡 —— 与 check_contracts.py 的 J12 同口径，这里只做**独立复述**。 */
export function contractsWithoutBinding(contracts, refs) {
  const boundContracts = new Set(refs.filter((r) => r.kind === REF_KIND.BOUND).map((r) => r.contract))
  return contracts
    .filter((c) => c.status === '可写' && !boundContracts.has(c.id))
    .map((c) => ({ id: c.id, file: c.file, cards: c.cards ?? [] }))
}
