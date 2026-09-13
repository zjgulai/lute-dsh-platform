/**
 * 「复发故障总账」校验项（`docs/pitfalls-playbook.md`）。
 *
 * ## 为什么需要它
 *
 * 2026-09-13 一天里修掉的缺陷，按**根因**归并只剩不到十类，而其中三类在当天各复发了
 * 两次以上：未验证的事实被写进出货面、「知道」没有变成「拦住」、一条事实多个家却只改了
 * 一处。这些教训当天都写进了 ADR 与 Note——**而这恰恰是问题**：它们散落在几十篇文档里，
 * 下一次开工的人读不到，于是同一个根因换个外壳再犯一遍。
 *
 * 所以需要一处「按根因组织」的总账。但总账有一个固有死法：它靠自觉维护，条目里点名的
 * 机制被重命名、被删除、被写成从来没存在过的名字，而**没有任何东西会因此停下来**——
 * 于是它变成一份看起来很权威、实际上在说谎的清单。那正是 P-03 本身。
 *
 * 本项就是给总账装的那副牙。它校验四件事：
 *
 * 1. **结构**：每条必须有「症状 / 根因类 / 已落地机制 / 下一版默认动作」四段且非空。
 *    缺哪段就报哪段——四段的顺序即读者的三个问题（怎么认出来、为什么、谁拦着、我该做什么）。
 * 2. **机制真实性**：「已落地机制」里点名的每个 `gate:<名字>` 必须真实出现在门禁注册表里
 *    （由 `gate.mjs` 把实时的 `CHECKS.map(c => c.name)` 传进来）。
 *    写一个不存在的门禁名字 = 自我安慰，而自我安慰的清单比没有清单更坏。
 * 3. **编号**：`P-NN` 自 `P-01` 起连续、不重复。编号是引用凭据（别处会写「见 P-02」），
 *    重编号会让所有引用悄悄指错人。
 * 4. **可达性**：全文相对链接必须存在；且本账必须被 `AGENTS.md` 与 `docs/README.md`
 *    链接——**没入口的总账等于不存在**，这一条防的正是本文件存在的理由。
 *
 * ## 本项**不**检查什么（诚实写清楚，免得被当成全覆盖）
 *
 * 总账头部写着一条约定：「不复述 ADR/Note 里的数字与读数」。**这条本项管不了**——
 * 判断「这句话是不是另一个家」需要语义理解，静态文本判不出。它在文档里被显式标为
 * 「约定，无强制」，而不是伪装成一条受保护的红线（这正是 P-03 要求的诚实读法）。
 *
 * @module
 */
import { resolveDocLink } from './checks.mjs'

/** 总账的仓库根相对路径（也是它唯一的家）。 */
export const PLAYBOOK_REL_PATH = 'docs/pitfalls-playbook.md'

/** 常驻规则与人工索引：总账必须从这两处可达，否则等于没人会读到它。 */
const REQUIRED_BACKLINKS = [
  {
    path: 'AGENTS.md',
    why: '常驻规则里没有入口——每个新会话都读不到它，总账等于不存在',
  },
  {
    path: 'docs/README.md',
    why: '人工索引入口里没有它——找文档的人不会知道有这页',
  },
]

/** 条目标题：`## P-01 · 症状式短标题`。 */
const ENTRY_RE = /^## (P-[0-9]{2}) · (.+)$/gm

/**
 * 必须回引总账的文件（导出给 `gate.mjs` 读取正文用）。
 *
 * 导出而不是让调用方抄一份：这份清单若有第二个家，加一处入口时就得记得改两处——
 * 那正是本账 P-07 记录的故障本身。
 */
export const PLAYBOOK_BACKLINK_PATHS = REQUIRED_BACKLINKS.map((entry) => entry.path)

/** 任何二级标题：用来切出条目正文的结束位置。 */
const H2_RE = /^## /m

/** 四段必备章节，按文档中应当出现的顺序无关，但缺一即红。 */
const REQUIRED_SECTIONS = [
  { label: '症状', hint: '怎么把它认出来（现象，不是原因）' },
  { label: '根因类', hint: '为什么会发生（可与别的实例共用的那层）' },
  { label: '已落地机制', hint: '谁拦着它（必须点名 gate: 或 script:）' },
  { label: '下一版默认动作', hint: '下一个人该先做什么（可执行）' },
]

/** 章节标签的行内形式：`- **症状**：正文`。 */
function sectionLabelRe(label) {
  return new RegExp(`^- \\*\\*${label}\\*\\*：`, 'm')
}

/**
 * 校验复发故障总账的结构、机制真实性与可达性。
 *
 * 纯函数：所有输入由调用方读取后传入，便于用固定文本做正反例与突变自测。
 *
 * @param {{
 *   playbookText: string,
 *   gateNames: string[],
 *   fileExists: (repoRelativePath: string) => boolean,
 *   backlinkTexts?: Record<string, string>,
 * }} input
 *   `playbookText` 读不到时传空串（会判红，不静默跳过——总账被删掉不该是绿的）；
 *   `gateNames` 是门禁注册表的实时名字列表；`backlinkTexts` 按路径给出回引文件正文。
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkPitfallsPlaybook({ playbookText, gateNames, fileExists, backlinkTexts = {} }) {
  const violations = []

  // 总账缺席：红，且说清为什么不能放行。删掉它比留着它更容易，而「容易的静默退化」
  // 是一种会被选中的路径（P-08：用纪律守只有机制能守住的东西）。
  if (playbookText.trim() === '') {
    return {
      passed: false,
      violations: [`${PLAYBOOK_REL_PATH}: 读不到总账正文——按根因组织的复发故障清单被删空或移走了`],
    }
  }

  const entries = splitEntries(playbookText)
  if (entries.length === 0) {
    violations.push(
      `${PLAYBOOK_REL_PATH}: 一条条目都没有（需「## P-NN · 标题」形式）——`
        + '空总账若判绿，删光条目就成了最省事的通过方式',
    )
  }

  for (const [index, entry] of entries.entries()) {
    const where = `${PLAYBOOK_REL_PATH} ${entry.id}`
    if (entry.title.trim() === '') violations.push(`${where}: 标题为空`)

    // ① 四段结构
    for (const { label, hint } of REQUIRED_SECTIONS) {
      const body = entry.sections.get(label)
      if (body === undefined) {
        violations.push(`${where}: 缺「${label}」段（${hint}）`)
        continue
      }
      if (body.trim() === '') violations.push(`${where}: 「${label}」段为空（${hint}）`)
    }

    // ② 机制真实性：点名的机制必须真的存在
    const mechanism = entry.sections.get('已落地机制') ?? ''
    const gates = [...mechanism.matchAll(/`gate:([A-Za-z0-9._-]+)`/g)].map((m) => m[1])
    const scripts = [...mechanism.matchAll(/`script:([^\s`]+)`/g)].map((m) => m[1])
    if (gates.length + scripts.length === 0) {
      violations.push(
        `${where}: 「已落地机制」没有点名任何机制——写成 \`gate:<门禁名>\` 或 \`script:<路径>\`；`
          + '只说「有门禁守着」而不说名字，等于没写（P-03）',
      )
    }
    for (const name of gates) {
      if (!gateNames.includes(name)) {
        violations.push(
          `${where}: 点名了不存在的门禁 \`gate:${name}\`——它不在 \`node scripts/gate.mjs --list\` 里；`
            + '写一个不存在的机制来给条目背书，比不写更坏（P-03）',
        )
      }
    }
    for (const path of scripts) {
      if (!fileExists(path)) {
        violations.push(`${where}: 点名的脚本不存在（${path}）——机制要么已经没了，要么名字写错了`)
      }
    }

    // ③ 编号：自 P-01 起连续，位置即序号
    const expected = `P-${String(index + 1).padStart(2, '0')}`
    if (entry.id !== expected) {
      violations.push(
        `${where}: 编号应为 ${expected}（第 ${index + 1} 条）——`
          + '编号是别处引用的凭据，跳号或重号会让引用悄悄指错条目',
      )
    }
  }

  // ④ 链接可达
  for (const target of collectRelativeLinks(playbookText)) {
    if (!fileExists(target)) {
      violations.push(`${PLAYBOOK_REL_PATH}: 链接不可达（${target}）——ADR-0009 要求链接可达由门禁校验`)
    }
  }

  // ⑤ 入口：没入口的总账等于不存在
  for (const { path, why } of REQUIRED_BACKLINKS) {
    const text = backlinkTexts[path] ?? ''
    if (!text.includes('pitfalls-playbook.md')) {
      violations.push(`${path}: 未链接 ${PLAYBOOK_REL_PATH}——${why}`)
    }
  }

  return { passed: violations.length === 0, violations }
}

/**
 * 把总账切成条目：每个 `## P-NN · 标题` 到下一个二级标题（或文末）为一条。
 *
 * 章节正文按「到下一个章节标签为止」截取，因此**章节可以换行续写**——四段经常需要
 * 两行才写得完，强制单行只会逼人把话删短。章节标签之外的散段（如引言、正面清单）
 * 不参与校验，但其中的相对链接仍会被 `collectRelativeLinks` 检查。
 * @param {string} text 总账正文
 * @returns {Array<{id: string, title: string, sections: Map<string, string>}>}
 */
function splitEntries(text) {
  const heads = [...text.matchAll(ENTRY_RE)]
  return heads.map((head, index) => {
    const start = head.index
    const nextHead = heads[index + 1]
    // 条目正文止于下一个条目，或下一个二级标题（如末尾的附录章节）。
    const afterHead = nextHead ? nextHead.index : text.length
    const tail = text.slice(head.index + head[0].length, afterHead)
    const nextH2 = H2_RE.exec(tail)
    const body = nextH2 ? tail.slice(0, nextH2.index) : tail
    return { id: head[1], title: head[2], sections: splitSections(body) }
  })
}

/**
 * 抽出条目正文里的四个章节。章节内容 = 标签之后到下一个标签（或正文结束）的全部文本。
 * @param {string} body 条目正文
 * @returns {Map<string, string>} 章节名 → 正文（缺失的章节不出现在表中）
 */
function splitSections(body) {
  const found = []
  for (const { label } of REQUIRED_SECTIONS) {
    const match = sectionLabelRe(label).exec(body)
    if (match) found.push({ label, at: match.index, contentAt: match.index + match[0].length })
  }
  found.sort((a, b) => a.at - b.at)
  const sections = new Map()
  for (const [index, section] of found.entries()) {
    const end = index + 1 < found.length ? found[index + 1].at : body.length
    sections.set(section.label, body.slice(section.contentAt, end))
  }
  return sections
}

/**
 * 收集文档里的相对 Markdown 链接并归一化为仓库根相对路径。
 * 跳过外链（含协议或 `#` 锚点）——它们不由仓库门禁负责。
 * @param {string} text 文档正文
 * @returns {string[]} 去重后的仓库根相对路径
 */
function collectRelativeLinks(text) {
  const out = new Set()
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const link = match[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#') || link.startsWith('/')) continue
    out.add(resolveDocLink(PLAYBOOK_REL_PATH, link.split('#')[0]))
  }
  return [...out].filter(Boolean)
}
