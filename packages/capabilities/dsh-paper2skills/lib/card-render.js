/**
 * lib/card-render.js — 卡页八段 → SKILL.md 正文的渲染判据（**纯函数，无 I/O**）。
 *
 * 拆出来是因为这里出过一次全库级事故：`isPlaceholder()` 里多了一条
 * `if (t.length < 40) return true`。真实占位串本身只有 16 字，长度规则并不能
 * 区分「占位」与「真实内容」，却把 **1,440 处真内容**判成了占位 —— 其中 1,041 处
 * 是论文出处（arXiv ID 通常 10–30 字）。判据从这里可测，见 `test/card-render.spec.mjs`。
 */

/**
 * 卡页占位段落判定。**判据只有「拼法」一条，不含长度。**
 *
 * 实测：playbook 站点里 1324/1338 张卡的「④ 输入数据要求」、1318/1338 的「⑤ 输出结果」
 * 正文都是占位串（`请查看原始代码模板获取输入规格。`，16 字），另有少量段落写「未自动抽取」。
 * 这类段落不进正文——否则每张卡都夹一段无信息噪音；改由合成字段的
 * `## 输入 / 输出契约` 承载。真实内容照常保留。
 *
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isPlaceholder(text) {
  const t = (text || '').trim()
  if (!t) return true
  return /请查看原始代码模板|请查看原始\s*Skill\s*卡片|未自动抽取|未抽取/.test(t)
}

/**
 * 真占位段落替换成的话，**按段落各说各的**。
 *
 * 这里曾经对所有段落一律写「实际输入/输出规格见下方「输入 / 输出契约」」——
 * 但论文出处、ROI、算法逻辑跟输入输出契约毫无关系，那句话在 432 处是错的。
 * 只有 ④⑤ 两段确实由合成的「输入 / 输出契约」承载。
 */
export const PLACEHOLDER_NOTES = {
  '3. 业务应用场景':
    '（卡页此段是占位串，未承载业务场景；可读的落地口径见下方「执行步骤」与「输入 / 输出契约」。）',
  '4. 输入数据要求': '（卡页此段是占位串，实际输入规格见下方「输入 / 输出契约」。）',
  '5. 输出结果': '（卡页此段是占位串，实际输出规格见下方「输入 / 输出契约」。）',
  '6. 业务价值 / ROI': '（卡页此段是占位串，本卡未记录 ROI。）',
  '7. 代码模板': '（卡页此段是占位串，本卡未附代码实现。）',
  '8. 论文来源': '（卡页此段未自动抽取，本卡未记录论文出处。）',
}
export const PLACEHOLDER_NOTE_FALLBACK = '（卡页此段是占位串，本卡未承载该节内容。）'

/** ⑦ 段的卡页元数据占前几行（`代码块数量：N · 路径：…` / 空行 / `PythonN 行 · 可运行复制`）。 */
export const CODE_META_LINES = 3

/**
 * 把代码正文包进 ``` 围栏。**不改代码一个字节**（源站是 `<pre><code>`，抽文本时围栏
 * 信息丢了 —— 实测 1,338 张卡代码段一个反引号都没有，于是 markdown 按普通段落渲染、
 * 缩进被视觉吃掉）。lang 取自源站标签：非 Python 一律退化成 `text`，不假装是 Python。
 *
 * @param {string} code
 * @param {string} lang
 * @returns {string}
 */
export function fenceCode(code, lang) {
  const l = /^python$/i.test(lang || '') ? 'python' : 'text'
  return '```' + l + '\n' + code + '\n```'
}

/** 源站对代码预览设的硬上限（自述行数）。实测 1,338 张卡最大 60、1,150 张正是 60。 */
export const CODE_SOURCE_CAP_LINES = 60

/**
 * ⑦ 段可得性记录，即 `data/code-availability.json` 的 `cards[<card id>]`。
 * 调用方（含单测）可以只给关心的字段，故各处按 `Partial` 收。
 * @typedef {object} CodeAvailability
 * @property {number|null} declared_lines 源站自述的预览行数（上限判据用这个）
 * @property {number} lines 节选实际内容行数
 * @property {boolean} capped 是否顶到源站上限
 * @property {boolean|null} parses `ast.parse` 是否通过；非 Python 为 null
 * @property {string|null} syntax_error 不可解析时的错处
 * @property {number|null} declared_blocks 卡页声明的代码块数量
 * @property {string|null} path 卡页记录的代码位置
 * @property {boolean} path_claimed 卡页是否声明了具体位置（「未检测到」记为否）
 * @property {string|null} lang 源站标签里的语言
 */

/**
 * 完整实现的可得性记录，即 `data/code-recovery.json` 的 `cards[<card id>]`。
 * @typedef {object} CodeRecovery
 * @property {'oracle'|'unverified'|'unrecovered'} tier
 *   `oracle` = 卡面节选已校验为完整代码的开头（唯一强断言）；
 *   `unverified` = 卡面无节选，无 oracle 可校验，取的是最长的 Python 成对块；
 *   `unrecovered` = 未取到。
 * @property {number} [lines] 完整实现行数
 * @property {string} [cross_check] `prefix@1` / `none`
 * @property {string} [vault_path] 出处卡在 vault 里的路径
 * @property {string} [reason] `unrecovered` 的原因码
 * @property {boolean} [parses] 完整实现是否能 `ast.parse`
 */

/**
 * ⑦ 段：按实测口径如实渲染，**不转发源站的自述**。
 *
 * 源站管这一段叫「代码模板」、标签写「N 行 · 可运行复制」、并附一个 `路径：paper2skills-code/…`。
 * 三处都能证伪（实测见 `data/code-availability.json`）：
 *
 *  · 它是**节选**不是模板 —— 源站对预览设了 60 行上限，1,150/1,338 张卡正压在上限上，
 *    无一超过。卡上转发这段文本却不加说明，读者会把节选当成完整实现。
 *  · 它**未必能跑** —— `ast.parse` 在 457/1,279 张卡上失败（断点切在语句中间）。
 *    带上「可运行复制」这个标签，读者复制即 SyntaxError。
 *  · `路径：` 指向的代码树**不在本包内**。即便取到（作者机器上在 iCloud），实测
 *    838/838 能解析到目录，但其中 90.7% 是通用脚手架，与本卡节选**不是同一份** ——
 *    同一个技能名下放着另一份代码，比悬空指针更危险：悬空会响亮报错，同名会静默给错。
 *
 * **订正（第六轮）**：上一轮据此写下「完整实现已丢失」——**那是错的**。完整实现一直在
 * 语料 vault 的卡里，只是 iCloud 工作区的 1,353 个 `.md` 自 2026-07 起被改写成了二进制
 * 容器，只看工作区就什么都看不到；经 `git cat-file` 从历史取明文即得（1,277 张有强断言）。
 * 因此现在有了 `recovery`：有它时，本节不再说「完整实现不在本包内」，
 * 而是指向同目录的 `references/implementation.py`。
 *
 * 源站原文不丢：它留在 `data/code-availability.json` 的 `raw_meta` 里，审计随时可回看。
 *
 * @param {Partial<CodeAvailability>|undefined} avail
 * @param {string} body ⑦ 段原文
 * @param {number} [capLines]
 * @param {Partial<CodeRecovery>|undefined} [recovery]
 * @returns {string}
 */
export function renderCodeSection(avail, body, capLines = CODE_SOURCE_CAP_LINES, recovery) {
  const lines = (body || '').split('\n')
  if (lines.length <= CODE_META_LINES) return renderNoCodeNote(avail, recovery)
  const second = lines[CODE_META_LINES - 1].trim()
  if (isPlaceholder(second)) return renderNoCodeNote(avail, recovery)
  const code = lines.slice(CODE_META_LINES).join('\n').replace(/^\n+|\n+$/g, '')
  if (!code) return renderNoCodeNote(avail, recovery)

  /** @type {Partial<CodeAvailability>} */
  const a = avail || {}
  const lang = /python/i.test(second) ? 'python' : 'text'
  const notice = []
  const hasFull = !!recovery && recovery.tier !== 'unrecovered' && (recovery.lines || 0) > 0

  if (hasFull) {
    // 完整实现可得：本节降级为「正文摘要」，指向 references/implementation.py。
    notice.push(
      `> **本节的完整实现在同目录的 \`references/implementation.py\`（${recovery.lines} 行）。**` +
        `下面 ${a.lines} 行是它的**开头**，源站发布时就截在这里。`,
    )
    if (recovery.tier === 'oracle') {
      notice.push('> 已校验：卡面节选正是该文件的头部（逐行连续前缀，偏移恒为第 1 行）。')
    } else {
      notice.push('> ⚠️ 本卡卡面无节选，无法做上述校验：`implementation.py` 取的是该卡最长代码围栏，**未经交叉核对**。')
    }
  } else {
    notice.push('> **本节是源站卡页的代码预览节选，不是完整实现。**')
  }

  if (a.capped) {
    notice.push(
      `> 源站对代码预览设了 ${capLines} 行上限：本卡节选 **${a.declared_lines ?? capLines} 行，已顶到上限**` +
        (hasFull ? ' —— 其余部分见 `references/implementation.py`。' : ' —— 其余代码源站未发布。'),
    )
  } else {
    notice.push(
      `> 源站对代码预览设了 ${capLines} 行上限：本卡节选 **${a.declared_lines ?? a.lines} 行，未到上限**` +
        '（可能即为源站发布的全部）。',
    )
  }

  if (a.parses === false) {
    // 截断的是**节选**，不是那份完整实现——两者必须分开说，否则又会读成「代码是坏的」。
    notice.push(
      `> 该**节选**在断点处被截断，语法不完整，不能直接运行（\`ast.parse\` 失败：${a.syntax_error || '见 data/code-availability.json'}）。` +
        (hasFull
          ? (recovery.parses
              ? '上文那份完整实现**没有这个问题**（`ast.parse` 通过）。'
              : '上文那份完整实现同样未能通过 `ast.parse`，请以实际文件为准。')
          : ''),
    )
  } else if (a.parses === true) {
    notice.push(`> 节选语法完整（\`ast.parse\` 通过，${a.lines} 行），但仍是节选，未必可独立运行。`)
  } else {
    notice.push(`> 非 Python 片段（\`${a.lang || 'unknown'}\`），本包不对其做语法断言。`)
  }
  notice.push(renderPathNote(a, recovery))

  return [...notice, '', fenceCode(code, lang)].join('\n')
}

/** 卡页自述的代码位置怎么处理：转述 + 说明本包能校验到什么程度。
 * @param {Partial<CodeAvailability>} a
 * @param {Partial<CodeRecovery>|undefined} [recovery]
 * @returns {string} */
function renderPathNote(a, recovery) {
  const blocks = a.declared_blocks
  const verified = !!recovery && recovery.tier === 'oracle' && recovery.vault_path
  if (a.path_claimed && a.path) {
    return (
      `> 卡页另声明「代码块数量：${blocks ?? '—'}」并记录位置 \`${a.path}\` —— ` +
      (verified
        ? `**该路径仍不在本包内**；本包的 \`references/implementation.py\` 取自语料 vault 的卡本身（\`${recovery.vault_path}\`），已与卡面节选核对，不依赖上述路径。`
        : '**该代码树不在本包内**，此处仅转述源站记录，本包无法据此校验内容。')
    )
  }
  if (blocks !== null && blocks !== undefined) {
    return `> 卡页声明「代码块数量：${blocks}」，但**未记录代码位置**（源站写「未检测到」）。`
  }
  return '> 卡页未记录代码位置。'
}

/**
 * ⑦ 段没有代码时的话：仍是「本卡未附代码」，但把可得性事实一并说清。
 *
 * 注意「卡面没代码」不等于「没有代码」：实测 40 张卡卡页未发布节选，
 * 而语料 vault 的卡里有围栏（这 40 张没有 oracle 可校验，故必须点明未核对）。
 *
 * @param {Partial<CodeAvailability>|undefined} avail
 * @param {Partial<CodeRecovery>|undefined} [recovery]
 * @returns {string}
 */
export function renderNoCodeNote(avail, recovery) {
  /** @type {Partial<CodeAvailability>} */
  const a = avail || {}
  if (recovery && recovery.tier !== 'unrecovered' && (recovery.lines || 0) > 0) {
    return (
      '（卡页此段未附代码。但语料 vault 的同一张卡里有代码：' +
      `本技能已附 \`references/implementation.py\`（${recovery.lines} 行）。` +
      (recovery.tier === 'unverified'
        ? '⚠️ 本卡卡面无节选可作对照，该文件取的是最长代码围栏，**未经交叉核对**。'
        : '') +
      '）'
    )
  }
  if (a.path_claimed && a.path) {
    return (
      '（卡页此段未附代码；源站声明有 ' +
      `${a.declared_blocks ?? '—'} 个代码块并记录位置 \`${a.path}\`，但**该代码树不在本包内**，本包未附带。）`
    )
  }
  return PLACEHOLDER_NOTES['7. 代码模板']
}

/**
 * ⑧ 论文来源：按 `data/provenance.json` 的分档如实渲染。
 *
 * 还原一个**指向别的论文**的 arXiv 号，比留空更危险：它看起来像一个可点开的出处。
 * 实测 `Skill-3D-Bin-Packing-Optimization` 的 `2406.12089` 是凝聚态物理论文
 * 《Many-Body Quantum Geometric Dipole》；81 张卡用的是 `2305.12345` 这类占位号，
 * 其中 `2305.12345` 被 19 张卡共用。故此处按档位分行文，**不做无差别还原**。
 *
 * @param {{grade:string, flags?:string[], arxiv?:string, paper?:string, named?:string,
 *          overlap?:number, sim?:number, n_tokens?:number}|null|undefined} e
 *   `null` / `undefined` 与 `grade:'NO_ID'` 同义：交回调用方按原正文渲染。
 * @returns {string|null} null 表示交回调用方按原正文渲染
 */
export function renderPaperSource(e) {
  if (!e || e.grade === 'NO_ID') return null
  const id = e.arxiv ? `arXiv:${e.arxiv}` : '（缺号）'
  const notes = []
  const shared = (e.flags || []).find((f) => f.startsWith('shared_by_'))
  if (shared) notes.push(`⚠️ 该号被 ${shared.split('_by_')[1]} 张卡共用，最多只有一张能对。`)
  if ((e.flags || []).includes('id_vs_named_conflict')) {
    notes.push(`⚠️ 卡页 ② 段点名的论文是《${e.named}》，与这个号指的不是同一篇。`)
  }

  switch (e.grade) {
    case 'VERIFIED':
      return [
        `**出处（已核验）**：${id} — ${e.paper}`,
        ...notes,
        '',
        '核验口径：编号在 arXiv 上存在，且论文主题与本卡一致（卡内点名标题相似度或标题词重合达标）。',
      ].join('\n')
    case 'LIKELY':
      return [
        `**出处（可能对应，未达已核验线）**：${id} — ${e.paper}`,
        ...notes,
        '',
        `核验口径：主题指向成立但强度不足（词重合 ${e.overlap ?? '—'}／点名相似 ${e.sim ?? '—'}）。引用前请自行确认。`,
      ].join('\n')
    case 'UNDECIDABLE':
      return [
        `**出处待人工判定**：卡页写的是 ${id}。`,
        ...notes,
        '',
        `本卡可用的英文标题词只有 ${e.n_tokens ?? '—'} 个，机器判据给不出可信结论，故**不做断言**。` +
          '需要引用时请人工看一眼这篇论文是否对口。',
      ].join('\n')
    case 'NOT_FOUND':
      return [
        `**卡页记录的出处查无此号**：${id} 在 arXiv 上不存在。`,
        ...notes,
        '',
        '按如实口径，**本卡视为无论文来源**。',
      ].join('\n')
    default:
      return [
        `**卡页记录的出处不可采信**：卡页写的是 ${id}` +
          (e.paper ? `，但该号在 arXiv 上是《${e.paper}》，与本卡主题无关。` : '。'),
        ...notes,
        '',
        '按「不许洗白」口径，**本卡视为无论文来源**；需要溯源时请另找一手来源，不要引用上面这个号。',
      ].join('\n')
  }
}
