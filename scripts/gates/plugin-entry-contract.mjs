/**
 * plugin-entry-contract：宿主插件**入口契约**校验（QG-003）。
 *
 * ## 为什么需要它（2026-09-15 实测事故）
 *
 * 一个新增的宿主插件 `lib/index.js` 写了 `const inject = [...]` 却**忘了导出**，
 * 模块末尾只有 `export { Config }`。Cordis loader 只认导出的 `inject`，于是插件 `apply`
 * 里访问 `ctx.credentials` 时抛 `cannot get property "credentials" without inject`，
 * 宿主启动进恢复模式。
 *
 * ## 旧判据为什么不够（QG-003 的 Red，2026-09-17 实测）
 *
 * 旧实现把入口**硬编码**成 `<dir>/lib/index.js`，读到就查、读不到就 `continue`，
 * 不导出 `apply` 也 `continue`，最后只报一句「核对 21 个 Cordis 入口（23 个带
 * dsh.bundle.patch 的包）」——两个候选**从分母里消失了**，而门禁退出 0。
 *
 * 实测这三条都真的发生过或正在发生：
 *
 *   1. `dsh-task-board-local` 的清单入口是 `./index.js`（`export * from './lib/index.js'`
 *      的转出口壳），旧实现读的是 `lib/index.js`。**读对了纯属巧合**——换个包名就错。
 *   2. `dsh-deepresearch-local` 与 `dsh-agent-team-gui-local` 的入口默认导出是
 *      Cordis `Service` 子类（类体内 `static inject = [...]`），旧实现把它们当成
 *      「库形态」跳过。它们其实是插件，只是不长的 `apply` 的样子。
 *   3. 上面两条都没有任何读数能看出来——`checked=21/23` 与 `checked=21/21` 在报告里
 *      长得一样（P-02：仪器假绿）。
 *
 * ## 现在的判据
 *
 * 候选 = 清单里带 `dsh.bundle.patch`（字符串）的包。对每个候选：
 *
 *   1. **按清单解析入口**：`exports['.']`（`import`/`default`/`require`/`node` 依次）
 *      → `main`；都不给就是 `unresolved`，判红。
 *   2. **跟随转出口**：`export * from './x'` / `export { a } from './x'` 递归展开
 *      （深度上限、环检测）。
 *   3. **分类**：`plugin-apply`（导出 `apply`）、`plugin-service`（默认导出是带
 *      `super(ctx, "名字")` 的 Cordis Service 子类，含 `var X = class extends …`
 *      这种打包形态与跨文件的 extends 链）、`library`（都不是）、`unresolved`
 *      （入口缺失/不可解析/剥离后括号不平衡）。
 *   4. **`plugin-apply` 核对 inject**：`inject` 不是必须导出——只有正文里存在
 *      **未加 try 防护**的 `ctx.<服务>` **属性访问**（其后不跟 `(`）才需要它。
 *      导出 `inject` 时还要核对**名单成员**：访问了 `ctx.x` 而 `x` 不在名单里同样判红。
 *   5. **`plugin-service` 核对 inject 的字段形态**：`inject` 必须是 `static` 类字段。
 *      Service 型的候选**会被核对**（不是「跳过」），只是核对的规则不同。
 *
 * `library` 与 `unresolved` **都判红**：一个包既然随包携带 cordis.patch.yml，它的入口
 * 就会被宿主按插件加载，而本判据无法区分「纯库带了 patch」与「插件丢了 apply」。判红
 * 的文案把这两种可能都写出来，让人去决定，而不是由判据替人猜一个然后静默放行。
 *
 * ## 已建模的边界（写在这里，不留给人推断）
 *
 *   - 注释与字符串会被**剥离后再扫**，所以注释里写 `ctx.credentials` 不算命中。
 *   - 模板字面量的 `${…}` 插值按字符串处理：写在插值里的 `ctx.x` 看不见（漏报，
 *     不是误报）。
 *   - 正则字面量按「上一个有效字符」启发式识别；识别失败的文本会被括号平衡自检
 *     拦下，归入 `unresolved` 判红，而不是猜。
 *   - `plugin-service` 核对的是「默认导出确实是 Cordis Service 子类」+「inject 是
 *     **static** 字段」，**不核对**它到底要哪些服务（那要求知道宿主全部服务名）。
 *     这是**一条被写明的边界**，不是「都合规」。
 *
 * @module
 */
import { dirname, join } from 'node:path'

/** 候选的四种分类，报告里必须分别计数。 */
export const CANDIDATE_KINDS = Object.freeze(['plugin-apply', 'plugin-service', 'library', 'unresolved'])

/** 不需要 inject 声明的内置属性（logger 为 Cordis 内建，dsh-preset-lint-local 实测无需声明）。 */
const BUILTIN_CTX_PROPERTIES = new Set(['root', 'scope', 'parent', 'logger'])

/** 转出口跟随深度上限：链更长说明入口是层层套壳，那本身就是需要人看的事实。 */
const MAX_REEXPORT_DEPTH = 4

/**
 * 剥离注释与字符串字面量，**保持长度不变**（非换行字符替换为空格）。
 *
 * 为什么要按位保留长度：`inject` 数组的成员要从字面量表里按下标区间取回来，
 * 剥完再拼接会让两套下标对不上。
 *
 * 返回**两份**渲染，用在不同的问题上（混用会产生假命中）：
 *   - `code`：注释与字符串都抹掉。用来扫 `ctx.<服务>`、做括号平衡自检、
 *     定位 `inject` 数组的字面量区间——这些地方**必须**看不见字符串内容，
 *     否则 `'ctx.credentials'` 这样一个字符串就会假命中。
 *   - `codeWithStrings`：只抹注释、保留字符串。用来读 `from './x'` 里的模块
 *     说明符——它在 `code` 里已经变成空白，读不到。
 *
 * @param {string} source
 * @returns {{
 *   code: string,
 *   codeWithStrings: string,
 *   literals: Array<{value: string, start: number, end: number}>,
 *   problems: string[],
 * }}
 */
export function stripCommentsAndStrings(source) {
  const text = String(source ?? '')
  const chars = text.split('')
  const withStrings = text.split('')
  const literals = []
  const problems = []

  const blank = (from, to, onlyInCode = false) => {
    for (let index = from; index < to && index < chars.length; index += 1) {
      if (chars[index] === '\n') continue
      chars[index] = ' '
      if (!onlyInCode) withStrings[index] = ' '
    }
  }

  // 正则字面量与除法的判别只看一个字符：`/` 前面若不是「值」的结尾，
  // 它就是正则的起点。这是启发式，不是语法分析——所以下面有括号平衡自检兜底。
  const regexAllowedAfter = new Set(['', '=', '(', ',', '[', '{', ';', ':', '!', '&', '|', '?', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'instanceof', 'new', 'do', 'else', 'yield', 'await'])
  const isRegexStart = (index) => {
    let cursor = index - 1
    while (cursor >= 0 && /\s/.test(text[cursor])) cursor -= 1
    if (cursor < 0) return true
    const previous = text[cursor]
    if (/[\w$)\]]/.test(previous)) {
      // 标识符要区分关键字（`return /x/` 是正则，`a / b` 是除法）。
      if (/[\w$]/.test(previous)) {
        let start = cursor
        while (start >= 0 && /[\w$]/.test(text[start])) start -= 1
        return regexAllowedAfter.has(text.slice(start + 1, cursor + 1))
      }
      return false
    }
    return regexAllowedAfter.has(previous)
  }

  let index = 0
  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '/' && next === '/') {
      let end = text.indexOf('\n', index)
      if (end === -1) end = text.length
      blank(index, end)
      index = end
      continue
    }
    if (char === '/' && next === '*') {
      const found = text.indexOf('*/', index + 2)
      const end = found === -1 ? text.length : found + 2
      blank(index, end)
      index = end
      continue
    }
    if (char === '/' && isRegexStart(index)) {
      let cursor = index + 1
      let inClass = false
      let closed = false
      while (cursor < text.length) {
        const ch = text[cursor]
        if (ch === '\\') {
          cursor += 2
          continue
        }
        if (ch === '\n') break
        if (ch === '[') inClass = true
        else if (ch === ']') inClass = false
        else if (ch === '/' && !inClass) {
          closed = true
          break
        }
        cursor += 1
      }
      if (closed) {
        // 正则不是字符串，不进 literals；整体抹掉后它既不会假命中也不会破坏括号。
        blank(index, cursor + 1)
        index = cursor + 1
        continue
      }
      problems.push(`第 ${index} 字节附近有一个未闭合的正则字面量`)
      index += 1
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char
      let cursor = index + 1
      let value = ''
      let closed = false
      while (cursor < text.length) {
        const ch = text[cursor]
        if (ch === '\\') {
          value += text[cursor + 1] ?? ''
          cursor += 2
          continue
        }
        if (ch === quote) {
          closed = true
          break
        }
        value += ch
        cursor += 1
      }
      const end = closed ? cursor + 1 : text.length
      literals.push({ value, start: index, end })
      // 只在 `code` 里抹掉引号与内容；`codeWithStrings` 保留原样（含定界符）。
      blank(index, end)
      for (let k = index; k < end; k += 1) {
        if (withStrings[k] !== '\n') withStrings[k] = text[k]
      }
      index = end
      continue
    }
    index += 1
  }

  return { code: chars.join(''), codeWithStrings: withStrings.join(''), literals, problems }
}

/** 括号平衡自检：剥离结果不平衡说明有未建模的语法，此时应当判红而不是继续猜。 */
export function bracketsBalanced(code) {
  const pairs = { '(': ')', '[': ']', '{': '}' }
  const stack = []
  for (const char of code) {
    if (pairs[char] !== undefined) stack.push(pairs[char])
    else if (char === ')' || char === ']' || char === '}') {
      if (stack.pop() !== char) return false
    }
  }
  return stack.length === 0
}

/** 取自 `export * from '…'` 与 `export { … } from '…'` 的模块说明符（必须在保留字符串的那份上跑）。 */
const REEXPORT_SPECIFIER_RE = /\bexport\s*(?:\*|\{[^}]*\})\s*(?:as\s+[\w$]+\s*)?from\s*['"]([^'"]+)['"]/g

function findMatching(code, openIndex, open, close) {
  let depth = 0
  for (let index = openIndex; index < code.length; index += 1) {
    if (code[index] === open) depth += 1
    else if (code[index] === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/**
 * 列出一个模块**导出面**里我们真正需要的那几件事。
 *
 * 刻意不做完整的 ES 模块解析：只认仓库里实际出现的形态，并把不认识的形态记进
 * `unknownForms` 让调用方决定（当前是判红）。「不认识的语法当成没问题」正是
 * 这轮要收掉的那类假绿。
 *
 * @param {string} code 已剥离注释与字符串的源码（扫描 `export` 关键字与子句名）
 * @param {string} codeWithStrings 已剥离注释、保留字符串的源码（只用来读 `from '…'`）
 * @returns {{
 *   names: Set<string>,
 *   starFrom: string[],
 *   clauseFrom: string[],
 *   hasDefault: boolean,
 *   defaultBindingName: string|null,
 *   unknownForms: string[],
 * }}
 */
export function findExportSurface(code, codeWithStrings = code) {
  const names = new Set()
  const starFrom = []
  const clauseFrom = []
  const unknownForms = []
  let hasDefault = false
  let defaultBindingName = null

  REEXPORT_SPECIFIER_RE.lastIndex = 0
  let match
  while ((match = REEXPORT_SPECIFIER_RE.exec(codeWithStrings)) !== null) {
    // 花括号形态与星号形态都只收说明符；导出名由下面的子句循环统一收集。
    if (codeWithStrings.slice(match.index, match.index + match[0].length).includes('*')) starFrom.push(match[1])
    else clauseFrom.push(match[1])
  }

  for (const found of code.matchAll(/\bexport\b/g)) {
    const start = found.index
    // `export` 若是标识符的一部分（如 `exported`），跳过。
    if (/[\w$]/.test(code[start + 6] ?? '')) continue
    const rest = code.slice(start + 6)
    const trimmed = rest.replace(/^\s+/, '')
    // `export { … }` 与 `export * …` 由上面与下面的子句循环处理，这里不重复报。
    if (trimmed.startsWith('{') || trimmed.startsWith('*')) continue
    const head = trimmed.match(/^([A-Za-z$][\w$]*)/)
    if (head === null) {
      unknownForms.push(`export 后面接的不是可识别的形式：${JSON.stringify(trimmed.slice(0, 40))}`)
      continue
    }
    const keyword = head[1]
    const after = trimmed.slice(head[0].length)
    if (keyword === 'default') {
      hasDefault = true
      const asClass = after.match(/^\s+class\s+([A-Za-z_$][\w$]*)/)
      if (asClass !== null) defaultBindingName ??= asClass[1]
      continue
    }
    if (keyword === 'type' || keyword === 'interface') continue // type-only 导出不产生运行时绑定
    if (keyword === 'async') {
      const named = after.match(/^\s+function\s+([A-Za-z_$][\w$]*)/)
      if (named === null) unknownForms.push('export async 后面不是函数声明')
      else names.add(named[1])
      continue
    }
    if (keyword === 'function' || keyword === 'class' || keyword === 'const' || keyword === 'let' || keyword === 'var') {
      const named = after.match(/^\s+([A-Za-z_$][\w$]*)/)
      if (named === null) unknownForms.push(`export ${keyword} 后面没有绑定名`)
      else names.add(named[1])
      continue
    }
    unknownForms.push(`未建模的导出形态：export ${keyword} …`)
  }

  // `export { X }` / `export { X as Y }` / `export { X as default }`
  for (const found of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const exported of parseExportClause(found[1])) {
      if (exported === 'default') {
        hasDefault = true
        const parts = found[1].split(',').map((piece) => piece.split(/\s+as\s+/).map((item) => item.trim()))
        for (const parts2 of parts) if (parts2[1] === 'default') defaultBindingName ??= parts2[0]
        continue
      }
      names.add(exported)
    }
  }

  return { names, starFrom, clauseFrom, hasDefault, defaultBindingName, unknownForms }
}

/**
 * 解析 `export { … }` 的导出名清单：`A` 导出 A，`A as B` 导出 B。
 * @param {string} clause 花括号内侧的原文
 * @returns {string[]}
 */
export function parseExportClause(clause) {
  const exported = []
  for (const piece of String(clause ?? '').split(',')) {
    const parts = piece.split(/\s+as\s+/).map((item) => item.trim()).filter(Boolean)
    if (parts.length === 0) continue
    exported.push(parts[parts.length - 1])
  }
  return exported
}

/**
 * 按清单解析包根入口，**不硬编码** `lib/index.js`。
 *
 * 顺序与 Node 自己的解析一致：`exports['.']` 优先于 `main`；条件对象按
 * `import` → `default` → `require` → `node` 取第一个字符串。
 *
 * @param {Record<string, unknown>} manifest
 * @returns {{path: string|null, via: string, reason: string}}
 */
export function resolveManifestEntry(manifest) {
  const exportsField = manifest?.exports
  if (typeof exportsField === 'string') {
    return { path: normalizeSpecifier(exportsField), via: 'exports:string', reason: '' }
  }
  if (exportsField !== undefined && exportsField !== null && typeof exportsField === 'object' && !Array.isArray(exportsField)) {
    const dot = exportsField['.'] ?? (Object.keys(exportsField).some((key) => !key.startsWith('.')) ? exportsField : undefined)
    if (typeof dot === 'string') return { path: normalizeSpecifier(dot), via: 'exports["."]', reason: '' }
    if (dot !== undefined && dot !== null && typeof dot === 'object') {
      for (const condition of ['import', 'default', 'require', 'node']) {
        if (typeof dot[condition] === 'string') {
          return { path: normalizeSpecifier(dot[condition]), via: `exports["."].${condition}`, reason: '' }
        }
      }
      return { path: null, via: 'exports["."]', reason: 'exports["."] 是个条件对象，但没有 import/default/require/node 里的任何一个字符串目标' }
    }
    return { path: null, via: 'exports', reason: 'exports 里既没有 "." 也没有可用的条件目标（宿主 import 不到包根）' }
  }
  if (typeof manifest?.main === 'string' && manifest.main.trim() !== '') {
    return { path: normalizeSpecifier(manifest.main), via: 'main', reason: '' }
  }
  return { path: null, via: 'none', reason: '清单既没有可解析的 exports 也没有 main——宿主无法确定这个包根入口' }
}

/** 把清单里的相对入口规范成仓库相对路径（去掉开头的 `./`）。 */
function normalizeSpecifier(specifier) {
  return String(specifier).replace(/^\.\//, '').replace(/^\/+/, '')
}

/**
 * 展开入口模块：跟随 `export * from` 与 `export { … } from`，把导出名并起来。
 *
 * @param {string} entryPath 仓库相对入口路径
 * @param {(path: string) => string|null} readText
 * @returns {{
 *   ok: boolean, problem: string, path: string, chain: string[], text: string,
 *   code: string, literals: Array<{value: string, start: number, end: number}>,
 *   names: Set<string>, hasDefault: boolean, defaultBindingName: string|null,
 * }}
 */
export function expandEntry(entryPath, readText) {
  const names = new Set()
  const chain = []
  const literals = []
  let code = ''
  let hasDefault = false
  let defaultBindingName = null
  let merged = ''
  const seen = new Set()

  const walk = (path, depth) => {
    if (depth > MAX_REEXPORT_DEPTH) return `转出口链超过 ${MAX_REEXPORT_DEPTH} 层：${[...chain, path].join(' → ')}`
    if (seen.has(path)) return `转出口成环：${[...chain, path].join(' → ')}`
    seen.add(path)
    const text = readText(path)
    if (text === null) return `入口 ${path} 读不到（清单指向它，但磁盘上没有）`
    const stripped = stripCommentsAndStrings(text)
    if (stripped.problems.length > 0) return `${path}: ${stripped.problems.join('；')}`
    if (!bracketsBalanced(stripped.code)) return `${path}: 注释/字符串剥离后括号不平衡——存在未建模的语法（正则字面量等），不猜`
    const surface = findExportSurface(stripped.code, stripped.codeWithStrings)
    if (surface.unknownForms.length > 0) return `${path}: ${surface.unknownForms.join('；')}`
    chain.push(path)
    // 拼接后的下标必须跟着位移走：`injectMembers` 是用**下标区间**从字面量表里
    // 取成员的，拼接而不位移会让 `inject` 数组只取到一半成员（2026-09-17 实测：
    // dsh-overseas-skills 的 `["webServer","credentials"]` 被读成 `["credentials"]`，
    // 于是 webServer 被误判成「名单里没有」）。
    const shift = code.length === 0 ? 0 : code.length + 1
    code += `${code.length === 0 ? '' : '\n'}${stripped.code}`
    merged += `${merged.length === 0 ? '' : '\n'}${text}`
    for (const literal of stripped.literals) {
      literals.push({ value: literal.value, start: literal.start + shift, end: literal.end + shift })
    }
    for (const name of surface.names) names.add(name)
    hasDefault = hasDefault || surface.hasDefault
    defaultBindingName ??= surface.defaultBindingName
    for (const target of [...surface.starFrom, ...surface.clauseFrom]) {
      const problem = walk(join(dirname(path), target), depth + 1)
      if (problem !== null) return problem
    }
    return null
  }

  const problem = walk(entryPath, 0)
  if (problem !== null) {
    return { ok: false, problem, path: entryPath, chain, text: merged, code, literals, names, hasDefault, defaultBindingName }
  }
  return { ok: true, problem: '', path: entryPath, chain, text: merged, code, literals, names, hasDefault, defaultBindingName }
}

/**
 * 找出 `try { … }` 的花括号区间。
 *
 * 为什么这件事是判据的一部分：本项要拦的是**把宿主拖进恢复模式**的未声明服务访问。
 * `ctx.<服务>` 落在 `try` 里时，访问失败被 catch 接住，风险形态不成立。实测
 * （2026-09-17）：`dsh-skill-center-local` 的 `findPairing()` 就是刻意这样探测
 * `ctx.remoteWebUiPairing` 的，注释写着 "never a throw"——把它判红就是误伤。
 *
 * @param {string} code 已剥离注释与字符串的源码
 * @returns {Array<[number, number]>} `['{' 下标, '}' 下标]`
 */
export function tryGuardSpans(code) {
  const spans = []
  for (const found of code.matchAll(/\btry\b/g)) {
    let cursor = found.index + 3
    while (cursor < code.length && /\s/.test(code[cursor])) cursor += 1
    if (code[cursor] !== '{') continue
    const close = findMatching(code, cursor, '{', '}')
    if (close !== -1) spans.push([cursor, close])
  }
  return spans
}

/**
 * 是否存在 `ctx.<服务>` **属性访问**（方法调用不算）。
 * @param {string} code 已剥离注释与字符串的源码
 * @returns {Array<{name: string, index: number, guarded: boolean}>} 命中的属性（按出现顺序）
 */
export function ctxPropertyAccesses(code) {
  const spans = tryGuardSpans(code)
  /** @type {Map<string, {name: string, index: number, guarded: boolean}>} */
  const byName = new Map()
  const re = /\bctx\s*\.\s*([A-Za-z_$][\w$]*)/g
  let match
  while ((match = re.exec(code)) !== null) {
    const after = code.slice(match.index + match[0].length).trimStart()
    if (after.startsWith('(')) continue // `ctx.get(...)` / `ctx.inject(...)` 是方法调用
    const name = match[1]
    if (BUILTIN_CTX_PROPERTIES.has(name)) continue
    const guarded = spans.some(([from, to]) => match.index > from && match.index < to)
    const existing = byName.get(name)
    // **任一次**未防护就算未防护。只按名字去重并保留第一次出现，会让
    // `try { ctx.x } catch {}` 把后面那次裸的 `ctx.x` 顶掉——真正会崩的那次反而
    // 不报了。这个错法是本判据自己的测试先抓到的（2026-09-17）。
    if (existing === undefined) byName.set(name, { name, index: match.index, guarded })
    else existing.guarded = existing.guarded && guarded
  }
  return [...byName.values()]
}

/**
 * 取出 `inject` 数组的成员名单。
 *
 * 两种声明形态都认：`export const inject = [...]` 与 `const inject = [...]` +
 * `export { inject }`（后者是**导出**与否由 `names.has('inject')` 判定，这里只取值）。
 *
 * @param {string} code 已剥离注释与字符串的源码
 * @param {Array<{value: string, start: number, end: number}>} literals
 * @returns {string[]|null} 没有 `inject` 声明时返回 null
 */
export function injectMembers(code, literals) {
  const declaration = /\binject\s*=\s*\[/g.exec(code)
  if (declaration === null) return null
  const openIndex = declaration.index + declaration[0].length - 1
  const closeIndex = findMatching(code, openIndex, '[', ']')
  if (closeIndex === -1) return null
  return literals
    .filter((literal) => literal.start > openIndex && literal.end <= closeIndex)
    .map((literal) => literal.value)
}

/** 继承链在同一个模块内最多向上追几层。 */
const MAX_CLASS_CHAIN = 4

/**
 * 取出某个类的类体（以及它的基类名）。两种声明形态都认：
 *   - `class X extends Y { … }`
 *   - `var X = class extends Y { … }` —— 打包产物里更常见，**类名只出现在赋值左边**，
 *     所以只按 `class X extends` 找会完全找不到（2026-09-17 实测：
 *     `dsh-agent-team-gui-local` 因此被误判成 library）。
 *
 * @param {string} code 已剥离注释与字符串的源码
 * @param {string} name
 * @returns {{base: string, bodyStart: number, bodyEnd: number}|null}
 */
export function classBody(code, name) {
  const pattern = new RegExp(
    `(?:\\bclass\\s+${escapeRegExp(name)}\\s+extends\\s+([\\w$.]+)`
    + `|\\b(?:var|let|const)\\s+${escapeRegExp(name)}\\s*=\\s*class(?:\\s+[\\w$]+)?\\s+extends\\s+([\\w$.]+))`,
  )
  const found = pattern.exec(code)
  if (found === null) return null
  const base = found[1] ?? found[2]
  const bodyStart = code.indexOf('{', found.index + found[0].length)
  if (bodyStart === -1) return null
  const bodyEnd = findMatching(code, bodyStart, '{', '}')
  if (bodyEnd === -1) return null
  return { base, bodyStart, bodyEnd }
}

/**
 * 判定默认导出是不是 Cordis `Service` 子类。
 *
 * 判据是**构造函数签名** `super(ctx, …)`,而且是顺着 `extends` 链往上找的：
 * 打包产物里常见 `var AgentTeamService = class extends ExecutionApplicationService`，
 * 而 `super(ctx, "agentTeamGui")` 写在更上面的基类里。只看默认导出自己那一层
 * 会把这类插件判成「不是插件」。
 *
 * @param {{
 *   code: string, names: Set<string>, hasDefault: boolean, defaultBindingName: string|null,
 *   literals: Array<{value: string, start: number, end: number}>,
 * }} expanded
 * @returns {{isService: boolean, declaresStaticInject: boolean, serviceName: string|null, chain: string[]}}
 */
export function serviceClassShape(expanded) {
  const none = { isService: false, declaresStaticInject: false, serviceName: null, chain: [] }
  if (!expanded.hasDefault || expanded.defaultBindingName === null) return none

  const chain = []
  const seen = new Set()
  let current = expanded.defaultBindingName
  let declaresStaticInject = false
  for (let depth = 0; depth <= MAX_CLASS_CHAIN; depth += 1) {
    if (seen.has(current)) break
    seen.add(current)
    const shape = classBody(expanded.code, current)
    if (shape === null) return depth === 0 ? none : { ...none, chain }
    chain.push(current)
    const body = expanded.code.slice(shape.bodyStart, shape.bodyEnd + 1)
    if (depth === 0 && /\bstatic\s+inject\s*=/.test(body)) declaresStaticInject = true
    // 刻意**不**在末尾吞空白：字符串在 `code` 里已被抹成空白，`\s*` 会把整段
    // 空白（即原字符串）一起吃掉，于是服务名的取值位置被推过了头。
    const superCall = /\bsuper\s*\(\s*ctx\s*,/.exec(body)
    if (superCall !== null) {
      // 服务名要从**原文**里取：字符串在 `code` 里已经被抹成空白了。
      const literalStart = shape.bodyStart + superCall.index + superCall[0].length
      const raw = (expanded.text ?? '').slice(literalStart, literalStart + 48)
      const serviceName = raw.match(/^\s*(['"`])([^'"`]*)\1/)?.[2] ?? null
      // `super(ctx, config)` 这种只是把 ctx 透传给基类，不是 Service 的构造约定
      // （`Service` 的签名是 `constructor(ctx, name)`）。找不到字符串服务名就继续
      // 沿 extends 链往上找真正的声明——2026-09-17 实测 dsh-agent-team-gui-local
      // 就是这种形状：子类把自己的 config 透传上去，服务名写在更上面的基类里。
      if (serviceName !== null) return { isService: true, declaresStaticInject, serviceName, chain }
    }
    current = shape.base
  }
  return { isService: false, declaresStaticInject, serviceName: null, chain }
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 分析一个候选包。
 * @param {{dir: string, manifest: Record<string, unknown>}} entry
 * @param {(path: string) => string|null} readText
 * @returns {{
 *   dir: string, kind: string, entryPath: string|null, entryVia: string, chain: string[],
 *   problems: string[], violations: string[], ctxAccesses: string[], injectDeclared: boolean,
 *   injectMembers: string[]|null, serviceName: string|null, staticInject: boolean,
 * }}
 */
export function analyseCandidate(entry, readText) {
  const dir = entry.dir
  const resolved = resolveManifestEntry(entry.manifest)
  const base = {
    dir,
    kind: 'unresolved',
    entryPath: resolved.path,
    entryVia: resolved.via,
    chain: [],
    problems: [],
    violations: [],
    ctxAccesses: [],
    injectDeclared: false,
    injectMembers: null,
    serviceName: null,
    staticInject: false,
  }
  if (resolved.path === null) {
    return { ...base, problems: [`${dir}: 入口不可解析（清单 ${resolved.via}）——${resolved.reason}`] }
  }
  const entryPath = join(dir, resolved.path)
  const expanded = expandEntry(entryPath, readText)
  if (!expanded.ok) {
    return { ...base, entryPath, chain: expanded.chain, problems: [`${dir}: ${expanded.problem}`] }
  }

  const service = serviceClassShape(expanded)
  if (service.isService) {
    // Service 型候选核对的规则与 apply 型不同，但**不是「不核对」**：
    // Cordis 只读类上的静态字段，`inject` 漏掉 `static` 就让字段落到实例上，
    // 效果与「忘了导出」等价——宿主照样报 without inject 并进恢复模式。
    const shape = classBody(expanded.code, expanded.defaultBindingName)
    const serviceBody = shape === null ? '' : expanded.code.slice(shape.bodyStart, shape.bodyEnd + 1)
    const serviceViolations = []
    for (const found of serviceBody.matchAll(/\binject\s*=\s*\[/g)) {
      const before = serviceBody.slice(0, found.index).trimEnd()
      if (!/\bstatic$/.test(before)) {
        serviceViolations.push(
          `${dir}: 入口 ${entryPath} 的 Service 类把 inject 写成了**实例字段**（缺 static）——`
          + 'Cordis 只读类上的静态字段，这个 inject 不会生效，访问服务时同样会报 without inject',
        )
      }
    }
    return {
      ...base,
      kind: 'plugin-service',
      entryPath,
      chain: expanded.chain,
      serviceName: service.serviceName,
      staticInject: service.declaresStaticInject,
      violations: serviceViolations,
    }
  }

  if (!expanded.names.has('apply')) {
    return {
      ...base,
      kind: 'library',
      entryPath,
      chain: expanded.chain,
      problems: [
        `${dir}: 入口 ${entryPath} 既不导出 apply，默认导出也不是 Cordis Service 子类。`
        + '两种可能都必须由人来判：这个包其实是纯库（那就从 package.json 的 dsh.bundle.patch 里去掉声明），'
        + '或者它本来是个插件而 apply 丢了（那就补回来）。本项无法替人区分这两者，因此判红。',
      ],
    }
  }

  const injectDeclared = expanded.names.has('inject')
  const members = injectMembers(expanded.code, expanded.literals)
  const accesses = ctxPropertyAccesses(expanded.code)
  const violations = []

  // 只有**未加防护**的属性访问才算缺陷形状：落在 `try { … } catch {}` 里的
  // 访问失败会被接住，不会把宿主拖进恢复模式（见 tryGuardSpans 的实测理由）。
  const unguarded = accesses.filter((access) => !access.guarded)
  const guarded = accesses.filter((access) => access.guarded)

  if (injectDeclared) {
    const allowed = new Set(members ?? [])
    if (members === null) {
      violations.push(
        `${dir}: 入口 ${entryPath} 导出了 inject，但正文里取不到它的数组声明——`
        + '成员名单核不了，不能当合规（把清单写成字面量数组，或改成本判据已建模的形态）',
      )
    } else {
      for (const access of unguarded) {
        if (!allowed.has(access.name)) {
          violations.push(
            `${dir}: 入口 ${entryPath} 的 apply 访问了 ctx.${access.name}，但导出的 inject 名单里没有它`
            + `（${JSON.stringify(members)}）——Cordis 会报 cannot get property "${access.name}" without inject`,
          )
        }
      }
    }
  } else if (unguarded.length > 0) {
    violations.push(
      `${dir}: 入口 ${entryPath} 未导出 inject，但 apply 里访问了 ctx.${unguarded[0].name}` +
        `（Cordis 会报 cannot get property "${unguarded[0].name}" without inject 并进恢复模式；` +
        '补 export { name, inject } 或 export const inject = [...]）',
    )
  }

  return {
    ...base,
    kind: 'plugin-apply',
    entryPath,
    chain: expanded.chain,
    ctxAccesses: accesses.map((access) => access.name),
    guardedAccesses: guarded.map((access) => access.name),
    injectDeclared,
    injectMembers: members,
    violations,
  }
}

/**
 * 校验一组包的宿主入口契约，返回 QG-001 的**规范三态 + 对象级账目**。
 *
 * 账目恒等式（每个候选必须落在且只落在一个桶里）：
 *   `expected = checked + skipped + failed`
 * 旧实现做不到这个——它把「读不到入口」与「不导出 apply」两类候选直接从分母里
 * `continue` 掉，于是 `checked` 与 `expected` 的差没有任何读数。
 *
 * @param {Array<{dir: string, manifest: Record<string, unknown>}>} packages 受管包清单
 * @param {(path: string) => string|null} readText 读取仓库相对路径文本；读不到返回 null
 * @returns {object} 规范门禁结果
 */
export function checkPluginEntryContract(packages, readText) {
  const candidates = packages.filter((entry) => {
    const dsh = entry.manifest.dsh
    return dsh !== undefined && typeof dsh === 'object' && dsh !== null
      && dsh.bundle !== undefined && typeof dsh.bundle === 'object' && dsh.bundle !== null
      && typeof dsh.bundle.patch === 'string'
  })

  if (candidates.length === 0) {
    return {
      status: 'skip',
      expected: 1,
      discovered: 0,
      checked: 0,
      skipped: 1,
      failed: 0,
      typedSkips: [{
        type: 'no-candidates',
        count: 1,
        reason: '受管包里没有带 dsh.bundle.patch 的宿主插件——本项**未核对任何入口**（不是「都合规」）',
      }],
      reason: '没有候选包',
      violations: [],
    }
  }

  const analysed = candidates.map((entry) => analyseCandidate(entry, readText))
  const counts = Object.fromEntries(CANDIDATE_KINDS.map((kind) => [kind, analysed.filter((item) => item.kind === kind).length]))
  const violations = []
  let checked = 0
  let failed = 0

  for (const item of analysed) {
    if (item.kind === 'unresolved' || item.kind === 'library') {
      failed += 1
      violations.push(...item.problems)
      continue
    }
    if (item.violations.length > 0) {
      failed += 1
      violations.push(...item.violations)
      continue
    }
    // Service 型与 apply 型都进 `checked`：它们核对的**规则不同**，但都真的被核对了。
    // 把 Service 型记成 typed skip 会让 21/23 看起来像「有 2 个没看」——而它们恰恰
    // 是旧实现当作「库形态」静默跳过、从而制造出 QG-003 那个 Red 的那两个。
    checked += 1
  }

  const classification = CANDIDATE_KINDS.map((kind) => `${kind}=${counts[kind]}`).join(' ')
  const serviceDirs = analysed.filter((item) => item.kind === 'plugin-service').map((item) => item.dir)
  const note = `候选 ${candidates.length} 个（${classification}）；`
    + `apply 型 ${counts['plugin-apply']} 个核对了 inject 名单与未防护的 ctx 属性访问，`
    + `Service 型 ${counts['plugin-service']} 个核对了「默认导出是 Cordis Service 子类」与「inject 是 static 字段」`
    + `（逐个：${analysed.filter((item) => item.kind === 'plugin-service').map((item) => `${item.dir}→${item.serviceName ?? '未取到服务名'}`).join('、') || '无'}）`
    + `；**未核对** Service 型要哪些服务（那要求枚举宿主全部服务名）`
    + `${serviceDirs.length > 0 ? '' : ''}`

  if (failed > 0) {
    return {
      status: 'fail', expected: candidates.length, discovered: candidates.length,
      checked, skipped: 0, failed, typedSkips: [], reason: `${failed} 个候选的入口契约不成立`, violations, note,
    }
  }
  return {
    status: 'pass', expected: candidates.length, discovered: candidates.length,
    checked, skipped: 0, failed: 0, typedSkips: [], reason: `${checked} 个入口契约成立`, violations: [], note,
  }
}
