/**
 * 「剥掉注释」的唯一事实源（ADR-0009）。
 *
 * ## 为什么需要一个公共的家
 *
 * 静态门禁靠**文本形状**判断语义，而注释**也是文本**。于是门禁会读错两类东西：
 *
 * - **散文当代码**：注释里写一句「别再用 `--dsw-x`」，那个名字就重新变成一条必须存在
 *   的 token——按 ADR-0015 要求的「留痕」反而造出违规。
 * - **定义当引用**：`"--dsw-x": …` 是供给，不是有人引用它。
 *
 * 2026-09-12 实测（`scripts/gates/theme-tokens.mjs` 的引用收集器）：
 * `--dsw-font-mono` 的 `code: 0 / whole-file: 2`——两处**全在注释里**。
 *
 * 同一个坑当天又踩了第二次：新写的 `scripts/gates/node-interpreter.mjs` 第一版
 * 被判据自己命中——那个文件顶部的 JSDoc 里**逐字举例**了 `execFile(process.execPath, …)`，
 * 于是「解释这个禁令的文档」成了「违反这个禁令的代码」。两次都是同一个根因，
 * 所以剥注释这件事从 `theme-tokens.mjs` 里的私有函数提升为本文件。
 *
 * ## 顺序与边界
 *
 * 剥注释的顺序是**先块后行**：行注释的正则要求 `/` 前面不是 `:`——否则 `https://…`
 * 会被从中间截断，把 URL 后面的真实内容一起吃掉。
 *
 * 代价说清楚：这是文本处理，不是解析器。字符串字面量里的 `//`（例如 `"a//b"`）会被
 * 当行注释切掉尾巴。对本仓库当前的判据无影响；真出现假阴性时由跑**真实引擎**的
 * 验收探针兜（`scripts/acceptance/`），它们不依赖文本形状。
 */

/**
 * 剥掉 CSS 块注释、JS/TS 块注释与行注释（`https://` 不算行注释）。
 * @param {string} text 源文本。
 * @returns {string} 剥掉注释后的文本（行数与原文不同，**不要**用它做行号定位）。
 */
export function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * 剥注释但**保留行号**：把注释替换成等量空白（换行原样留下）。
 *
 * 判据报违规时要说清是第几行，而 `stripComments` 会改变行数——两者不能混用。
 * 需要报行号的一律用本函数。
 *
 * **它只剥注释，不剥字符串**：`theme-tokens` 的判据依赖字符串里的 token 名
 * （`"--dsw-x": …` 是**定义**，见 ADR-0039），把字符串一起剥掉会让那个判据失效。
 * 需要连字符串一起剥的（判据的模式会出现在测试夹具的字符串里）用
 * `blankStringsAndComments`。
 * @param {string} text 源文本。
 * @returns {string} 同长度的「只有空白填掉的注释」版本。
 */
export function blankComments(text) {
  const blank = (match) => match.replace(/[^\n]/g, ' ')
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_m, lead, comment) => lead + blank(comment))
}

/**
 * 剥注释**与字符串字面量**，保留行号。
 *
 * ## 为什么还需要它
 *
 * 「门禁把不是代码的东西当代码读」这件事，2026-09-12 一天之内出现了**三次**，
 * 每次形态都不同：
 *
 * | # | 门禁 | 被误读成代码的东西 | 后果 |
 * | - | --- | --- | --- |
 * | 1 | `theme-tokens` | 注释里写的 token 名 | 写「别再用 `--dsw-x`」= 让 `--dsw-x` 变成必须存在的 token |
 * | 2 | `node-interpreter` | 它**自己 JSDoc 里**举的反例 | 解释禁令的文档成了违反禁令的代码 |
 * | 3 | `node-interpreter` | 它的**测试夹具字符串** | 为了证明判据能红而写的夹具，让判据对真实仓库报红 |
 *
 * 前两次是注释（`blankComments` 解决），第三次是**字符串字面量**——测试夹具必然要把
 * 「违规长什么样」写成字符串，所以这一条对任何「用模式匹配找违规」的门禁都成立。
 *
 * ## 实现与边界
 *
 * 逐字符状态机（注释 / 单引号 / 双引号 / 反引号），不是解析器。已知边界：
 * 反引号模板里的 `${…}` 不做嵌套解析——模板串中途出现未转义反引号会提前收尾。
 * 本仓库没有这种写法；真出现时表现为**假阴性**，由跑真实产物的验收探针兜。
 * 正则字面量（`/…/`）不识别，其中的引号会被误判——同样留作已知边界。
 * @param {string} text 源文本。
 * @returns {string} 同长度的、注释与字符串都变成空白的版本。
 */
export function blankStringsAndComments(text) {
  const out = text.split('')
  const n = text.length
  /** 把 [from, to) 区间（不含换行）涂成空格。 */
  const wipe = (from, to) => {
    for (let i = from; i < to; i += 1) if (out[i] !== '\n') out[i] = ' '
  }
  let i = 0
  while (i < n) {
    const c = text[i]
    const next = text[i + 1]
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end < 0 ? n : end + 2
      wipe(i, stop)
      i = stop
      continue
    }
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i)
      const stop = end < 0 ? n : end
      wipe(i, stop)
      i = stop
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue }
        if (text[j] === c) { j += 1; break }
        // 单/双引号字符串不跨行：遇到换行说明前面那个引号是撇号之类，别吞掉整个文件。
        if (text[j] === '\n' && c !== '`') { break }
        j += 1
      }
      wipe(i, Math.min(j, n))
      i = Math.min(j, n)
      continue
    }
    i += 1
  }
  return out.join('')
}
