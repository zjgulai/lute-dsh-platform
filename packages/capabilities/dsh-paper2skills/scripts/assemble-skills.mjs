#!/usr/bin/env node
/**
 * assemble-skills.mjs — S2b：把「卡页八段 + S2a 合成字段 + 分类落点」组装成 SKILL.md。
 *
 * 入：generated/cards.json（卡页八段）
 *     data/classification.json（L1/L2/L3 落点，权威）
 *     generated/adapt/S2-NN.json（S2a 子任务产出：description / 步骤 / 边界 / 契约）
 * 出：staging/<L2 责任域>/<slug>/SKILL.md
 *     generated/assemble-report.json
 *
 * 组装器负责所有机械判据，子任务不碰：
 *  - frontmatter 逐值 JSON 引号化；name 与目录名一致；disable-model-invocation 固定 true
 *  - description ≤500；SKILL.md ≤12KB（超限则把第⑦段代码节选移入 references/code.md）
 *  - 章节顺序固定；分类字段照抄 classification.json（不信子任务）
 *  - 缺失合成字段 → 计入 problems 并 exit 1（响亮失败，不产出半成品）
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, GENERATED_DIR, PKG_ROOT, MAX_DESC, MAX_SKILL_BYTES } from '../lib/taxonomy.js'
import {
  isPlaceholder,
  renderCodeSection,
  renderNoCodeNote,
  renderPaperSource,
  PLACEHOLDER_NOTES,
  PLACEHOLDER_NOTE_FALLBACK,
} from '../lib/card-render.js'
import { redactSecrets as scrub } from '../lib/secret-scrub.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STAGING = process.env.P2S_STAGING || join(PKG_ROOT, 'staging')
const ADAPT = join(GENERATED_DIR, 'adapt')
const CARDS = join(GENERATED_DIR, 'cards.json')
const CLASSIFICATION = join(DATA_DIR, 'classification.json')
/** 出处分档表（入库）；缺它时不阻断装配，⑧ 段退回原正文。 */
const PROVENANCE = join(DATA_DIR, 'provenance.json')
/** @type {Record<string, any>} */
const provById = existsSync(PROVENANCE)
  ? (JSON.parse(readFileSync(PROVENANCE, 'utf8')).items ?? {})
  : {}

/**
 * 完整实现的**索引**（入库，小）与**正文**（`generated/source-code.json`，派生，大）。
 *
 * 分两份的用意：正文 7.7 MB、含未脱敏原文，按包内既有约定 `generated/` 不入库；
 * 而装配器要判「这张卡有没有完整实现、几行、校验方式是什么」，只需要那个小索引。
 * 正文缺失时**不阻断**：索引还在就能如实渲染 ⑦ 段，只是不落 `implementation.py`。
 */
const CODE_RECOVERY = join(DATA_DIR, 'code-recovery.json')
const SOURCE_CODE = join(GENERATED_DIR, 'source-code.json')
const recoveryDoc = existsSync(CODE_RECOVERY)
  ? JSON.parse(readFileSync(CODE_RECOVERY, 'utf8'))
  : { generated_from: {}, cards: {} }
/** @type {Record<string, any>} */
const recoveryById = recoveryDoc.cards ?? {}
/** 恢复时的 vault 修订号，写进每个 implementation.py 的抬头以便回溯。 */
const vaultRev = String(recoveryDoc.generated_from?.rev ?? 'unknown').slice(0, 12)
/** @type {Record<string, any>} */
const sourceById = existsSync(SOURCE_CODE)
  ? (JSON.parse(readFileSync(SOURCE_CODE, 'utf8')).cards ?? {})
  : {}

/**
 * 代码节选可得性表（入库）。**⑦ 段没有它就装配不了**：⑦ 段的卡面文字完全取决于
 * 「这张卡的节选是否顶到源站 60 行上限、能不能 `ast.parse`、卡页声明的路径是什么」，
 * 拿不到这张表就只能转发源站自述（把节选说成模板），那正是本轮要修的缺陷。
 */
const CODE_AVAIL = join(DATA_DIR, 'code-availability.json')
if (!existsSync(CODE_AVAIL)) {
  console.error(`✗ 缺少 ${CODE_AVAIL}，先跑 python3 scripts/build-code-availability.py`)
  process.exit(1)
}
const codeAvailDoc = JSON.parse(readFileSync(CODE_AVAIL, 'utf8'))
/** @type {Record<string, any>} */
const codeAvailById = codeAvailDoc.cards
/** 源站代码预览上限（自述行数），由可得性表带出，避免两处各写一个 60。 */
const CODE_CAP = codeAvailDoc.source_cap_lines

const SECTION_ORDER = [
  '1. 解决的问题',
  '2. 核心算法逻辑',
  '3. 业务应用场景',
  '4. 输入数据要求',
  '5. 输出结果',
  '6. 业务价值 / ROI',
  '7. 代码模板',
  '8. 论文来源',
]
const CN_ORD = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']

const jstr = (/** @type {string} */ v) => JSON.stringify(v)
const bytes = (/** @type {string} */ s) => Buffer.byteLength(s, 'utf8')

/** 该卡的 L3 是否属「规则/契约，不是执行器」那一类（需强制 ADR 边界声明） */
const CONTRACT_L3 = new Set(['依赖协调', '异常冻结与恢复', '容量管理', '失败恢复'])

/**
 * 密钥脱敏闸门（ADR / AGENTS.md 红线：凭证不落仓库）。
 *
 * 模式表与实现都在 `lib/secret-scrub.js` —— **唯一出口**。这里只留「命中记在哪」。
 * 曾经模式表内联在本文件里，但恢复出的完整实现是另一条写盘路径
 * （`references/implementation.py`），两条路径各留一份必然会漏：
 * 卡页八段里只有 1 张卡带真实 key，vault 完整代码里有 3 张。
 *
 * @type {Array<{card:string,section:string,kind:string}>}
 */
const redactions = []

/** 写出 references/implementation.py 的张数 */
let implWritten = 0

/** 就地脱敏，返回脱敏后的文本。 */
function redactSecrets(text, cardId, sectionKey) {
  return scrub(text, (hit) => {
    redactions.push({ card: cardId, section: sectionKey, kind: hit.id })
  })
}

/** 占位判定与代码围栏的实现在 `lib/card-render.js`（纯函数，有单测）。 */

/** 完整实现文件的溯源抬头行数。**固定 5 行**——与语料编号树 `model.py` 的形状一致
 * （那份也是 5 行抬头 + 第 6 行起是正文），`verify-install.mjs` 按这条断言节选的位置。 */
export const IMPL_HEADER_LINES = 5

/**
 * 组装 `references/implementation.py` 的正文。
 *
 * 抬头用 `#` 注释而非 docstring：注释不占用「第一条语句」的位置，
 * 原作若以 `from __future__ import …` 或裸 docstring 起头都不受影响。
 *
 * @param {{item:any, card:any, rec:any, body:string}} a
 * @returns {string}
 */
function implementationFile({ item, rec, body, rev }) {
  const code = redactSecrets(body, item.id, 'references/implementation.py')
  const verified = rec.tier === 'oracle'
  const head = [
    `# dsh-paper2skills · 完整实现（恢复自 paper2skills 语料 vault）`,
    `# 卡 id   : ${item.id}`,
    `# 出处    : ${rec.vault_path}`,
    verified
      ? `# 核对    : 卡面节选 = 本文件第 ${IMPL_HEADER_LINES + 1} 行起（逐行连续前缀，已校验）`
      : `# 核对    : 无（卡面未发布节选，取的是该卡最长代码围栏，未经交叉核对）`,
    `# 生成    : scripts/build-source-code.py @ ${rev}`,
  ]
  // 抬头 5 行后**紧接**正文（不插空行）：正文首行 = 第 IMPL_HEADER_LINES+1 行，
  // 与抬头里那句断言、以及语料编号树 model.py 的形状三者一致。
  return [...head, code, ''].join('\n')
}

function buildFrontmatter(item, facets, synth) {
  /** @type {[string,string][]} */
  const rows = [
    ['name', item.slug],
    ['title', item.title],
    ['description', synth.description],
    ['l1_id', facets.l1_id],
    ['l1_plane', facets.l1_plane],
    ['l2_id', facets.l2_id],
    ['l2_domain', facets.l2_domain],
    ['l3_id', facets.l3_id],
    ['l3_business', facets.l3_business],
    ['l3_all', facets.l3_all],
    ['l1_l2_l3', facets.l1_l2_l3],
    ['p2s_card_id', item.id],
    ['p2s_src_domain', item.src_domain],
    ['user_summary', synth.user_summary],
  ]
  if (synth.user_try) rows.push(['user_try', synth.user_try])
  if (synth.whenToUse) rows.push(['whenToUse', synth.whenToUse])
  if (Array.isArray(synth.workflow) && synth.workflow.length) rows.push(['workflow', synth.workflow.join(' → ')])
  rows.push(['enabled', 'true'])
  rows.push(['disable-model-invocation', 'true'])
  rows.push(['user-invocable', 'true'])
  return ['---', ...rows.map(([k, v]) => `${k}: ${jstr(String(v))}`), '---'].join('\n')
}

function buildBody(item, card, facets, synth, codeInRefs) {
  /** @type {string[]} */
  const out = [`# ${item.title}`, '']
  SECTION_ORDER.forEach((key, i) => {
    if (codeInRefs && key.startsWith('7.')) {
      const rec = recoveryById[item.id]
      const full = rec && rec.tier !== 'unrecovered' && rec.lines > 0
      out.push(
        `## ${CN_ORD[i]} 代码节选`,
        '',
        (full
          ? `本节的完整实现（${rec.lines} 行）在同目录的 \`references/implementation.py\`。`
          : '本节是源站卡页的代码预览节选。') +
          `源站对预览设了 ${CODE_CAP} 行上限；本卡节选较长，已移出正文以保持 SKILL.md 精简。` +
          (full
            ? '正文只留指引，与卡面节选的一致性核对记录见 `data/code-recovery.json`。'
            : '**完整实现未恢复**，完整节选与口径见 `references/code.md`。'),
        '',
      )
      return
    }
    const body = redactSecrets((card.sections[key] || '').trim(), item.id, key)
    // ⑧ 段：有分档表就按档位如实渲染（还原一个指向别处的号比留空更危险）
    if (key.startsWith('8.')) {
      const rendered = renderPaperSource(provById[item.id])
      if (rendered) {
        out.push(`## ${CN_ORD[i]} 论文来源`, '', rendered, '')
        return
      }
    }
    // ⑦ 段：源站自称「代码模板」，实为顶在 60 行上限的预览节选。按实测口径渲染，
    // 不转发源站的自述 —— 否则读者会把节选当完整实现、把截断文本当可运行代码。
    if (key.startsWith('7.')) {
      const avail = codeAvailById[item.id]
      if (!avail) {
        problems.push(`${item.id}: 代码节选可得性记录缺失（data/code-availability.json）`)
        return
      }
      if (!avail.lines) skippedSections += 1
      out.push(`## ${CN_ORD[i]} 代码节选`, '', renderCodeSection(avail, body, CODE_CAP, recoveryById[item.id]), '')
      return
    }
    if (!body) return
    if (isPlaceholder(body)) {
      skippedSections += 1
      out.push(`## ${CN_ORD[i]} ${key.replace(/^\d+\.\s*/, '')}`, '',
        PLACEHOLDER_NOTES[key] || PLACEHOLDER_NOTE_FALLBACK, '')
      return
    }
    out.push(`## ${CN_ORD[i]} ${key.replace(/^\d+\.\s*/, '')}`, '', body, '')
  })

  out.push('## 输入 / 输出契约', '')
  out.push(`**输入**：${synth.contract_in}`, '')
  out.push(`**输出**：${synth.contract_out}`, '')

  out.push('## 执行步骤', '')
  synth.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`))
  out.push('')

  out.push('## 边界与不做', '')
  for (const b of synth.boundaries) out.push(`- ${b}`)
  if (item.l3.some((n) => CONTRACT_L3.has(n)) && !synth.boundaries.some((b) => /不是执行器|确定性控制层/.test(b))) {
    out.push('- 本技能承载的是**规则与契约产物**（DAG 定序规则 / 熔断阈值与退避策略 / 置信门控与判据），不是执行器；真正的编排与冻结动作由模型外的确定性控制层执行。')
  }
  out.push('')

  const rel = card.relations || {}
  const relLines = []
  if (rel['前置技能']?.length) relLines.push(`- **前置**：${rel['前置技能'].join('、')}`)
  if (rel['延伸技能']?.length) relLines.push(`- **延伸**：${rel['延伸技能'].join('、')}`)
  if (rel['可组合技能']?.length) relLines.push(`- **可组合**：${rel['可组合技能'].join('、')}`)
  if (relLines.length) {
    out.push('## 技能关联', '')
    out.push(...relLines, '')
  }
  out.push('---', '')
  out.push(`> 分类：${facets.l1_l2_l3}　·　技术族：${item.src_domain}　·　源卡：\`${item.id}\``)
  return out.join('\n')
}

// —— 读数 ——
if (!existsSync(CLASSIFICATION)) {
  console.error(`✗ 缺少 ${CLASSIFICATION}，先跑 scripts/merge-classification.mjs`)
  process.exit(1)
}
if (!existsSync(ADAPT)) {
  console.error(`✗ 缺少合成字段目录 ${ADAPT}，先跑 S2a 批次子任务`)
  process.exit(1)
}
const cls = JSON.parse(readFileSync(CLASSIFICATION, 'utf8'))
/** @type {Map<string, any>} */
const cardById = new Map(/** @type {any[]} */ (JSON.parse(readFileSync(CARDS, 'utf8')).cards).map((c) => [c.id, c]))

/** @type {string[]} */
const problems = []
/** 合并所有合成产物（含子任务自行分片写出的 `_*.json`）：按 id 去重，先到先得。 */
/** @type {Map<string, any>} */
const synthById = new Map()
let synthFiles = 0
for (const f of readdirSync(ADAPT).filter((x) => x.endsWith('.json'))) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(join(ADAPT, f), 'utf8'))
  } catch (e) {
    problems.push(`合成文件 ${f} 解析失败：${e instanceof Error ? e.message : String(e)}`)
    continue
  }
  synthFiles += 1
  for (const it of parsed.items || []) if (!synthById.has(it.id)) synthById.set(it.id, it)
}

let written = 0
let codeRefs = 0
let skippedSections = 0
rmSync(STAGING, { recursive: true, force: true })
mkdirSync(STAGING, { recursive: true })

/** 矩阵空白卡（151 条 L3 无一可归）的占位分类：照常安装、可斜杠调用，但不进任何 preset 的 skill-subset。 */
const BLANK_FACETS = {
  l1_id: '',
  l1_plane: '未归类（矩阵空白）',
  l2_id: '',
  l2_domain: '未归类（矩阵空白）',
  l3_id: '',
  l3_business: '（矩阵空白）',
  l3_all: '',
  l1_l2_l3: '未归类（矩阵空白）',
}

for (const item of cls.items) {
  const facets = item.facets || BLANK_FACETS
  const card = cardById.get(item.id)
  const synth = synthById.get(item.id)
  if (!card) {
    problems.push(`${item.id}: 卡页数据缺失`)
    continue
  }
  if (!synth) {
    problems.push(`${item.id}: 合成字段缺失（S2a 未覆盖）`)
    continue
  }
  if (!synth.description || synth.description.length > MAX_DESC) {
    problems.push(`${item.id}: description 缺失或超长（${(synth.description || '').length}）`)
    continue
  }
  if (/\n/.test(synth.description)) {
    problems.push(`${item.id}: description 含换行`)
    continue
  }
  if (!Array.isArray(synth.steps) || synth.steps.length < 3 || synth.steps.length > 7) {
    problems.push(`${item.id}: steps 必须是 3–7 条（当前 ${(synth.steps || []).length}）`)
    continue
  }
  if (!Array.isArray(synth.boundaries) || synth.boundaries.length < 2) {
    problems.push(`${item.id}: boundaries 至少 2 条（当前 ${(synth.boundaries || []).length}）`)
    continue
  }
  if (!synth.contract_in || !synth.contract_out || !synth.user_summary) {
    problems.push(`${item.id}: contract_in / contract_out / user_summary 缺失`)
    continue
  }

  const fm = buildFrontmatter(item, facets, synth)
  let text = `${fm}\n\n${buildBody(item, card, facets, synth, false)}`
  if (bytes(text) > MAX_SKILL_BYTES) {
    text = `${fm}\n\n${buildBody(item, card, facets, synth, true)}`
    codeRefs += 1
  }
  if (bytes(text) > MAX_SKILL_BYTES) {
    problems.push(`${item.id}: 移出代码后仍 ${bytes(text)} 字节 > ${MAX_SKILL_BYTES}`)
    continue
  }

  const dir = join(STAGING, facets.l2_domain, item.slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), text)

  // ── 完整实现落伴生文件 ────────────────────────────────────────
  // 为什么不内联进 SKILL.md：全库 253,648 行 ≈ 2.0M tokens，而 SKILL.md 有 12KB 硬上限。
  // `references/` 是包内既有形态（长代码节选本来就落 `references/code.md`），
  // 且安装器会递归拷整个 references/，因此这里落盘即等于装进技能库，安装器零改动。
  const rec = recoveryById[item.id]
  if (rec && rec.tier !== 'unrecovered' && rec.lines > 0) {
    const body = sourceById[item.id]?.code
    if (typeof body === 'string' && body) {
      const refDir = join(dir, 'references')
      mkdirSync(refDir, { recursive: true })
      writeFileSync(
        join(refDir, 'implementation.py'),
        implementationFile({ item, rec, body, rev: vaultRev }),
      )
      implWritten += 1
    } else {
      // 索引说有、正文却不在了：这是两份产物不同步，必须响亮，不能静默少装一个文件。
      problems.push(
        `${item.id}: code-recovery 标 ${rec.tier}/${rec.lines} 行，但 generated/source-code.json 里没有正文` +
          '（先跑 scripts/build-source-code.py）',
      )
    }
  }

  if (text.includes('references/code.md')) {
    const refDir = join(dir, 'references')
    mkdirSync(refDir, { recursive: true })
    // 与正文同一套口径（曾经这里直接拼原段，会把源站自述「代码模板 / 可运行复制」原样搬进
    // 参考文件，正文与附件两处说法不一致）。
    const sec = redactSecrets((card.sections['7. 代码模板'] || '').trim(), item.id, '7. 代码模板')
    writeFileSync(
      join(refDir, 'code.md'),
      `# ${item.title} · 代码节选\n\n${renderCodeSection(codeAvailById[item.id], sec, CODE_CAP, recoveryById[item.id])}\n`,
    )
  }
  written += 1
}

writeFileSync(
  join(GENERATED_DIR, 'assemble-report.json'),
  JSON.stringify({ written, code_moved_to_refs: codeRefs, implementation_written: implWritten, synth_files: synthFiles, placeholder_sections: skippedSections, secrets_redacted: redactions.length, redactions, synth_covered: synthById.size, problems }, null, 2) + '\n',
)

console.log(`组装：${written} 个 SKILL.md → ${STAGING}`)
console.log(`合成字段覆盖：${synthById.size} / ${cls.items.filter((/** @type {any} */ i) => i.l3.length).length}（应有）`)
console.log(`代码移入 references/：${codeRefs}　·　完整实现 implementation.py：${implWritten}　·　跳过的占位段落：${skippedSections}　·　脱敏：${redactions.length}`)
if (problems.length) {
  console.error(`✗ ${problems.length} 项问题：`)
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`)
  if (problems.length > 40) console.error(`  … 另有 ${problems.length - 40} 项`)
  process.exit(1)
}
console.log('✓ 组装通过')
