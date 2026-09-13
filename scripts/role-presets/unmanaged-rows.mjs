/**
 * unmanaged-rows.mjs —「生成器不拥有的行，不许删」的纯函数。
 *
 * 从 generate.mjs 抽出来只有一个理由：**这个修复必须有一份能打红的测试**。
 * 起因是实测事故（2026-09-13）：`agt-033` 里按 ADR-0061 手插的 `product-kol-hunter`
 * 行被整文件重写的生成器静默删掉 —— 页面上表现为「产品卡点了打不开」，
 * 与 AGENTS.md 记的已知症状同形。删除**别人拥有的数据**不是生成器的职责。
 *
 * 两个函数都是纯的（入字符串、出结构/字符串），故可直接用 node:test 锁定。
 */

/**
 * 从既有的 agent.cordis.yml 里挑出**本生成器不认识的行块**（手插的本机装配行等）。
 *
 * 起因是一次实测事故：`agt-033` 里有人按 ADR-0061 手插了 `product-kol-hunter` 行
 * （文件里那句注释也预告了「重写本文件时需重新插入本行」），而本脚本**整文件重写**，
 * 于是那一行被静默删掉 —— 页面上表现成「产品卡点了打不开」，与 AGENTS.md 记的
 * 那条已知症状同形。删除**别人拥有的数据**不是本脚本的职责
 * ⇒ 现在：生成器只认自己产出的行，其余**逐块原样带过**并大声报出来。
 *
 * @param {string} existing 既有文件全文（不存在传空串）
 * @param {Set<string>} managedIds 本次生成会产出的行 id
 * @returns {Array<{id:string, afterId:string|null, lines:string[]}>}
 *          需要原样带过的行块（含其上方紧邻的注释/空行）+ **它在原文件里的前驱行 id**。
 *          `afterId` 是必需的：行在 Cordis 组合里是**顺序敏感**的（挂载次序），
 *          简单追加到文件尾会改变某个产品行的装载次序 —— 那又是一处静默行为变化。
 */
export function unmanagedRowBlocks(existing, managedIds) {
  if (!existing) return []
  const lines = existing.split('\n')
  const starts = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^- id: (\S+)\s*$/.exec(lines[i])
    if (m) starts.push({ i, id: m[1] })
  }
  const out = []
  for (let k = 0; k < starts.length; k++) {
    const { i, id } = starts[k]
    if (managedIds.has(id)) continue
    // 行块 = 本行到下一行块之前；再向上吸收紧邻的注释/空行（人类就是这么标注的）
    const end = k + 1 < starts.length ? starts[k + 1].i : lines.length
    let begin = i
    while (begin > 0 && (lines[begin - 1].startsWith('#') || lines[begin - 1].trim() === '')) begin--
    out.push({ id, afterId: k > 0 ? starts[k - 1].id : null, lines: lines.slice(begin, end) })
  }
  return out
}

/**
 * 把带过的行块插回**原位**（紧跟前驱行块之后）。前驱行在本轮生成里不存在时退化为追加到末尾，
 * 并把这件事报出来 —— 位置丢了也必须是可见的。
 *
 * @param {string} text 本轮生成的组合全文
 * @param {Array<{id:string, afterId:string|null, lines:string[]}>} carried
 * @returns {{text:string, repositioned:string[], appended:string[]}}
 */
export function reinstateRows(text, carried) {
  const lines = text.split('\n')
  const rowStart = (id) => lines.findIndex((l) => new RegExp(`^- id: ${id}\\s*$`).test(l))
  const rowEnd = (start) => {
    for (let i = start + 1; i < lines.length; i++) if (/^- id: \S+\s*$/.test(lines[i])) return i
    return lines.length
  }
  const repositioned = []
  const appended = []
  // 按前驱行在**新文本里**的位置从后往前插，避免前面的插入让后面的下标失效
  const ordered = [...carried].sort((a, b) => (b.afterId ? rowStart(b.afterId) : -1) - (a.afterId ? rowStart(a.afterId) : -1))
  for (const block of ordered) {
    const at = block.afterId ? rowStart(block.afterId) : -1
    // 块首若已有空行、插入点前面也已经是空行，就去掉块首那个空行 —— 否则每次重生成都
    // 会多长一个空行出来（实测：`diff` 报 `164a165 >` 只差一个空行，看着无害但会累积）。
    const blockLines = [...block.lines]
    if (at >= 0) {
      const insertAt = rowEnd(at)
      while (blockLines.length > 1 && blockLines[0].trim() === '' && (lines[insertAt - 1] ?? '').trim() === '') blockLines.shift()
      lines.splice(insertAt, 0, ...blockLines)
      repositioned.push(block.id)
    } else {
      while (blockLines.length > 1 && blockLines[0].trim() === '' && (lines[lines.length - 1] ?? '').trim() === '') blockLines.shift()
      lines.push(...blockLines)
      appended.push(block.id)
    }
  }
  return { text: lines.join('\n'), repositioned, appended }
}
