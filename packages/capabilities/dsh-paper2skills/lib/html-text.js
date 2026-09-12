/**
 * lib/html-text.js — 卡页 HTML → 纯文本（**纯函数，无 I/O**）。
 *
 * 从这个包里拆出来单独放，是因为这里出过一次全库级事故：`strip()` 对整段文本
 * （含 `<pre><code>`）做 `.replace(/[ \t]+/g, ' ')`，把 1338 张卡的 Python 缩进
 * 全部压成 1 个空格；实体表又只列了 `&#39;` 而源站写的是 `&#x27;`。
 * 判据从这里可测，见 `test/html-text.spec.mjs`。
 */

/**
 * 解 HTML 实体：具名 + **任意进制**的数字引用。
 *
 * `&amp;` **必须最后解**，否则 `&amp;lt;` 会被二次解码成 `<`。
 * @param {string} s
 * @returns {string}
 */
export const decodeEntities = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')

/**
 * `<pre>` 内的文本：只解实体、只去标签、只把 `<br>` 还原成换行。
 * **不压空白、不并空行** —— 缩进就是这段内容的全部价值。
 *
 * 去标签只认真像标签的 `<...>`（`</?[a-zA-Z]…`），不把 `if a < b:` 里的裸 `<`
 * 当成标签开头。本语料实测 424 个 pre 块用 `&lt;`、0 个裸 `<`；宽一点是为了
 * 万一遇到没转义的一页也不至于把代码吃掉。
 * @param {string} inner
 * @returns {string}
 */
export const preText = (inner) =>
  decodeEntities(
    inner.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-zA-Z][^>]*>/g, ''),
  ).replace(/^\n+|\n+$/g, '')

const PRE_RE = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi
const GUARD_RE = /\u0000PRE(\d+)\u0000/g

/**
 * 把一段卡页 HTML 压成纯文本。`<pre>` 块先取出、后放回，因此逐字保真。
 * @param {string} s
 * @returns {string}
 */
export const strip = (s) => {
  /** @type {string[]} */
  const kept = []
  const guarded = s.replace(PRE_RE, (_, inner) => {
    kept.push(preText(inner))
    return `\u0000PRE${kept.length - 1}\u0000`
  })
  const out = decodeEntities(
    guarded
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out.replace(GUARD_RE, (_, i) => kept[Number(i)])
}
