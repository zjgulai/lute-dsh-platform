/**
 * 门禁 `package-files-coverage`：**交付白名单**（`package.json` 的 `files`）相对
 * **运行时模块图**的完整性。
 *
 * ── 为什么需要这一项（P-24 的复发与本项的方向）────────────────────────────
 *
 * 现有两项都从**装载点**侧量：
 *   · `profile-files-sync`  判副本里 `files` 声明的文件**在不在**；
 *   · `profile-bundle-sync` 判装载点上 `lib/` 顶层 bundle 的**字节一不一样**。
 *
 * 2026-09-16 实测（`dsh-wanzh-hulian`）：`lib/index.js` 正在 import 的
 * `lib/atomic-store.js` 与 `lib/oauth-flow.js` **不在 `files` 里**，而上面两项当时**全绿**——
 * 因为装载点上有这两个文件（上一批手工 `--apply --loadpoint` 补过）。
 * 两项都只问「装载点上现在有什么」，没有一个问「按清单物化之后还会有什么」。
 *
 * 这一侧不是发布面专属：**`pnpm` 对 `file:` 依赖遵守 `files` 白名单**。
 * 实测（`package-files-coverage.test.mjs` 里有同一条实验的回归钉）：
 * 一个 `files:["lib/a.js"]` 的包，`file:` 安装后 `node_modules/<pkg>/lib/` 里**只有 `a.js`**，
 * 未声明的 `lib/b.js` 与 `undeclared.txt` 都不出现；`npm pack --dry-run --json`
 * 对同一 fixture 给出同一集合。也就是说，受影响的不是「发布出去少一个文件」，
 * 而是**本机装载点的全新安装**——而全新安装路径上没有任何同步步骤可以补救。
 *
 * ── 判据面：为什么是「运行时模块图」而不是「lib/ 下所有 bundle」─────────────
 *
 * 第一版判据面照搬了 `loadPointFiles()` 的「lib/ 顶层所有 bundle」规则，
 * 第一次跑就在 `dsh-paper2skills` 上报了 5 个文件（`lib/axis.js` 等）。核实后是**仪器假红**：
 * 那 5 个是包内 `scripts/`、`test/` 用的开发期模块，包**没有 `main`、没有 `dsh` 字段、
 * 也不是任何 profile 的 `file:` 依赖**，它们的缺失对任何消费者都不构成失效。
 * `loadPointFiles()` 那条规则在 `profile-bundle-sync` 里是对的（它要的是「装载点上
 * 哪些文件必须字节一致」，宁可过宽），但搬到「交付白名单是否漏件」上就过宽了——
 * 同一份规则在两个目的下不是同一个判据。
 *
 * 现在的判据面 = **从声明入口出发的静态可达闭包**：
 *   · 种子：`main`、`exports` 的每个字符串叶子、`bin` 的每个目标、`dsh.bundle.patch`；
 *   · 扩展：静态相对 import / re-export / `require('./x')` / 字面量 `import('./x')`，
 *     以及字面量 `new URL('./x', import.meta.url)`（`dsh-preset-lint-local` 就是这么
 *     定位它那个 `lib/lint-preset.mjs` 的——**正是 P-24 最初丢掉的那个文件**）。
 *
 * 这条规则覆盖了 P-24 的两次真实复发，且在全部 25 个受管包上零假红。
 * 判据面之外、`lib/` 顶层的 bundle 会在 `note` 里作为**读数**列出（是开发期模块还是
 * 约定装载的运行时模块，机器分不出来，所以只报不判——不做成 violation 是因为
 * 假红会把真信号一起拖下水，也不做成 skip 是因为那会把 `gate:strict` 永久拖红）。
 *
 * ── 已知的**未建模**残留（写在这里以免被读成已覆盖）────────────────────────
 *
 * 用变量拼路径去读的包内数据文件（如 `join(PKG_ROOT, 'data')`）本项**看不见**。
 * 这类引用无法可靠静态解析；当前仓库里此类文件都在 `files` 里有声明，
 * 因此不影响结论，但这是本项的边界，不是它的保证。
 *
 * ── 不做的事 ──────────────────────────────────────────────────────────────
 *
 * · 不判「声明了但没人用」的反向冗余（陈旧清单由 `profile-files-sync` 管）。
 * · 不读 profile、不读 `$HOME`、不联网、不写任何文件：判定器是纯函数，
 *   文件内容通过注入的 `readSource` 取得（QG-006A 的隔离契约）。
 *
 * @typedef {object} PackageTree
 * @property {string} relPath    仓库根相对路径（报告用；根包不参与本项）
 * @property {Record<string, unknown>} manifest 该包 package.json 的解析结果
 * @property {Set<string>|string[]} files 包内全部文件的包根相对路径（POSIX 分隔）
 * @property {Set<string>|string[]} dirs  包内全部目录的包根相对路径（POSIX 分隔）
 * @property {(relPath: string) => string|null} [readSource] 读取包内文件文本；只对被闭包访问到的文件调用
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'

/** npm 无论 `files` 怎么写都会打包的文件（2026-09-16 用真实 `npm pack` 实测）。 */
const ALWAYS_INCLUDED = [
  /^package\.json$/,
  /^readme(?:\.[^/]*)?$/i,
  /^licen[cs]e(?:\.[^/]*)?$/i,
]

/**
 * npm 决定「打不打包」时从不考虑、因而本项也不该出现在判据面里的目录。
 * 与 npm 自己的默认排除集同义；`node_modules` 与 `.git` 是其中唯一在本仓库会遇到的。
 */
const NEVER_INCLUDED = new Set(['.git', 'node_modules', 'CVS', '.svn', '.hg'])

/** 装载点不执行、因而不进判据面的产物（与 `loadPointFiles` 的口径一致）。 */
function isRuntimeArtifact(relPath) {
  if (relPath.endsWith('.d.ts') || relPath.endsWith('.map') || relPath.endsWith('.tsbuildinfo')) return false
  return true
}

/**
 * 静态相对说明符：`import` / `export … from` / `require()` / 字面量 `import()`。
 * 只取 `.` 开头的说明符——裸包名不是包内文件。
 */
const RELATIVE_SPECIFIER =
  /(?:^|[\s;{(=])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"](\.[^'"]+)['"]|require\(\s*['"](\.[^'"]+)['"]\s*\)|import\(\s*['"](\.[^'"]+)['"]\s*\)/g

/** 字面量 `new URL('./x', import.meta.url)`：按路径定位的运行时文件引用。 */
const META_URL_SPECIFIER = /new\s+URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g

/**
 * 把 `files` 里的一条 glob 编译成正则。
 *
 * 只实现本仓库**实际出现**的形态（双星号、双星号后接斜杠的目录递归形式、单星号、问号），
 * 并以真实 `npm pack` 对全部受管包逐文件校准（`package-files-coverage.test.mjs`）。
 * 不用现成 glob 库的理由：多一个依赖就多一处「库的语义与 npm 的语义不一致」的空白，
 * 而这里要的恰恰是**与 npm 全等**。
 * @param {string} pattern `files` 里的一条声明
 * @returns {RegExp} 相对路径匹配器（包根相对、POSIX 分隔）
 */
export function globToRegExp(pattern) {
  let out = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern.startsWith('**/', index)) {
        out += '(?:[^/]+/)*'
        index += 2
      } else if (pattern.startsWith('**', index)) {
        out += '.*'
        index += 1
      } else {
        out += '[^/]*'
      }
    } else if (char === '?') {
      out += '[^/]'
    } else {
      out += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`)
}

/**
 * 枚举包内全部文件与目录（包根相对、POSIX 分隔、已排序）。
 * 跳过 npm 从不打包的目录，因此这里给出的集合就是「npm 眼里的候选集合」。
 * @param {string} packageDir 包目录绝对路径
 * @returns {{files: string[], dirs: string[]}}
 */
export function listPackageTree(packageDir) {
  const files = []
  const dirs = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (NEVER_INCLUDED.has(entry.name)) continue
      const full = join(dir, entry.name)
      const rel = relative(packageDir, full).split(sep).join('/')
      if (entry.isDirectory()) {
        dirs.push(rel)
        walk(full)
      } else if (entry.isFile()) {
        files.push(rel)
      }
    }
  }
  walk(packageDir)
  return { files: files.sort(), dirs: dirs.sort() }
}

/**
 * 编译交付白名单。
 *
 * 无通配的条目按**磁盘上它是不是目录**决定语义——`lib` 是目录即收整棵子树，
 * `LICENSE` 是文件即只收它自己。这不是猜测：npm 就是这么定的，且本仓库两种形态都在用
 * （`files: ["lib", …]` 与 `files: ["LICENSE", …]`）。
 * @param {unknown} declared `files` 字段
 * @param {Set<string>} dirs 磁盘上的目录集合
 * @returns {Array<{pattern: string, regex: RegExp}>}
 */
export function compileDeliveryAllowlist(declared, dirs) {
  if (!Array.isArray(declared)) return []
  const compiled = []
  for (const raw of declared) {
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const trimmed = raw.trim().replace(/^\.\//, '')
    if (trimmed.endsWith('/')) {
      compiled.push({ pattern: raw, regex: globToRegExp(`${trimmed}**`) })
      continue
    }
    if (/[*?]/.test(trimmed)) {
      compiled.push({ pattern: raw, regex: globToRegExp(trimmed) })
      continue
    }
    const isDirectory = dirs.has(trimmed)
    compiled.push({ pattern: raw, regex: globToRegExp(isDirectory ? `${trimmed}/**` : trimmed) })
  }
  return compiled
}

/**
 * 一条相对路径是否会被交付。
 *
 * `main` 永远被打包（npm 的 always-included 规则，实测确认），所以它即使不在 `files`
 * 里也不算漏项——这是**避免假红**，不是放宽判据：假红会把真信号拖下水（P-02 的另一面）。
 * @param {string} relPath 包根相对路径
 * @param {Array<{pattern: string, regex: RegExp}>} allowlist 编译后的白名单
 * @param {string|null} mainResolved `main` 解析到的包根相对路径
 * @returns {boolean}
 */
export function isDelivered(relPath, allowlist, mainResolved = null) {
  if (relPath === mainResolved) return true
  if (ALWAYS_INCLUDED.some((pattern) => pattern.test(relPath))) return true
  return allowlist.some((entry) => entry.regex.test(relPath))
}

/**
 * 解析一份 ignore 文件的**窄子集**，用于回答「它能不能把运行时文件挡在交付之外」。
 *
 * 为什么只做窄子集而不是完整 gitignore：完整语义（锚定、`**`、取反、目录态、
 * 嵌套作用域、`!` 的先后顺序）是一整块需要独立校准的规则面，本项的目标不是重建它。
 * 因而这里**只认本仓库实际出现的形态**，遇到子集之外的形态一律 fail-closed
 * （返回 `unknown`，由调用方降级为类型化 skip）——「没建模」必须与「建模了且没命中」不同形。
 *
 * 过宽判定的方向是刻意的：本函数只用来**高估** ignore 的射程（多算 = 更保守 = 更容易 skip），
 * 因此丢掉锚定语义（`/foo` 当作「任意层级都命中」）是安全的，反过来才是危险的。
 * @param {string} text ignore 文件全文
 * @returns {{patterns: Array<{regex: RegExp, directoryOnly: boolean}>}|{unknown: string}}
 */
export function parseIgnorePatterns(text) {
  const patterns = []
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    if (line.startsWith('!')) return { unknown: line }
    const body = line.startsWith('/') ? line.slice(1) : line
    if (body === '') return { unknown: line }
    const directoryOnly = body.endsWith('/')
    const name = directoryOnly ? body.slice(0, -1) : body
    // 含斜杠 = 锚定到某个路径前缀；整块语义不建模。
    if (name.includes('/') || name.includes('\\')) return { unknown: line }
    if (name === '') return { unknown: line }
    patterns.push({ regex: globToRegExp(name), directoryOnly })
  }
  return { patterns }
}

/**
 * 一条包内相对路径是否可能被这些 ignore 规则挡掉。
 * 目录态规则只判整段目录名；其余规则对**每一段**都判（gitignore 的非目录规则
 * 对任何层级的同名文件或目录都生效）。
 * @param {string} relPath 包根相对路径
 * @param {Array<{regex: RegExp, directoryOnly: boolean}>} patterns 解析结果
 * @returns {boolean}
 */
export function matchesIgnorePatterns(relPath, patterns) {
  const segments = relPath.split('/')
  return patterns.some(({ regex, directoryOnly }) => (directoryOnly
    ? segments.slice(0, -1).some((segment) => regex.test(segment))
    : segments.some((segment) => regex.test(segment))))
}

/**
 * 把一个入口声明解析成包内相对路径（补 `.js`/`.mjs`/`.cjs`/`index.js` 后缀）。
 * @param {unknown} spec 入口声明（如 `./lib/index.js`、`lib/index.js`、`index.js`）
 * @param {Set<string>} files 磁盘上的文件集合
 * @returns {string|null} 解析结果；文件不存在时返回 null
 */
export function resolveEntry(spec, files) {
  if (typeof spec !== 'string' || spec.trim() === '') return null
  const normalized = spec.trim().replace(/^\.\//, '')
  if (normalized === '' || normalized.includes('*')) return null
  const candidates = [
    normalized,
    `${normalized}.js`,
    `${normalized}.mjs`,
    `${normalized}.cjs`,
    posix.join(normalized, 'index.js'),
  ]
  return candidates.find((candidate) => files.has(candidate)) ?? null
}

/**
 * 收集 `exports` 里每一个字符串叶子（含条件对象形式；`types` 目标会被
 * `isRuntimeArtifact` 滤掉，不需要在这里特判）。
 * @param {unknown} value `package.json` 的 `exports` 字段
 * @param {string[]} [out] 累加器
 * @returns {string[]}
 */
function collectExportTargets(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) collectExportTargets(item, out)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectExportTargets(item, out)
  return out
}

/**
 * 声明入口集合：应用**按名字**去加载的那些文件。
 * @param {Record<string, unknown>} manifest 包 package.json
 * @param {Set<string>} files 磁盘上的文件集合
 * @returns {string[]} 包根相对路径（已排序去重）
 */
export function declaredEntryPoints(manifest, files) {
  const specs = [manifest.main, ...collectExportTargets(manifest.exports)]
  if (typeof manifest.bin === 'string') specs.push(manifest.bin)
  else if (manifest.bin && typeof manifest.bin === 'object' && !Array.isArray(manifest.bin)) {
    specs.push(...Object.values(manifest.bin))
  }
  const dsh = manifest.dsh
  if (dsh && typeof dsh === 'object' && !Array.isArray(dsh)) {
    const bundle = /** @type {Record<string, unknown>} */ (dsh).bundle
    if (bundle && typeof bundle === 'object' && !Array.isArray(bundle)) {
      const patch = /** @type {Record<string, unknown>} */ (bundle).patch
      if (typeof patch === 'string') specs.push(patch)
    }
  }
  const resolved = new Set()
  for (const spec of specs) {
    const found = resolveEntry(spec, files)
    if (found !== null && isRuntimeArtifact(found)) resolved.add(found)
  }
  return [...resolved].sort()
}

/**
 * 解析一条相对说明符到一个包内文件。
 * @param {string} fromFile 提出该说明符的文件（包根相对）
 * @param {string} spec 相对说明符
 * @param {Set<string>} files 磁盘上的文件集合
 * @returns {string|null}
 */
function resolveRelative(fromFile, spec, files) {
  const base = posix.normalize(posix.join(posix.dirname(fromFile), spec))
  if (base.startsWith('..')) return null
  return resolveEntry(`./${base}`, files)
}

/**
 * 从声明入口出发的静态可达闭包 + 字面量 `import.meta.url` 引用。
 *
 * 文件内容一律通过 `readSource` 注入，判据面本身不碰文件系统。
 * @param {object} input
 * @param {string[]} input.entries 声明入口（包根相对）
 * @param {Set<string>} input.files 磁盘上的文件集合
 * @param {(relPath: string) => string|null} input.readSource 读取文件文本
 * @param {string[]} [input.extraSeeds] 额外种子（如包内脚本直接引用的文件）
 * @returns {{reachable: string[], unreadable: string[]}}
 */
export function collectModuleClosure({ entries, files, readSource, extraSeeds = [] }) {
  const reachable = new Set()
  const unreadable = []
  const queue = [...entries, ...extraSeeds]
  while (queue.length > 0) {
    const current = /** @type {string} */ (queue.pop())
    if (reachable.has(current) || !files.has(current) || !isRuntimeArtifact(current)) continue
    reachable.add(current)
    if (!/\.(?:js|mjs|cjs|ts|tsx)$/.test(current)) continue
    const source = readSource(current)
    if (source === null) {
      unreadable.push(current)
      continue
    }
    for (const regex of [RELATIVE_SPECIFIER, META_URL_SPECIFIER]) {
      regex.lastIndex = 0
      for (const match of source.matchAll(regex)) {
        const spec = match[1] ?? match[2] ?? match[3]
        const resolved = resolveRelative(current, spec, files)
        if (resolved !== null) queue.push(resolved)
      }
    }
  }
  return { reachable: [...reachable].sort(), unreadable }
}

/**
 * 计算一个包的运行时判据面与「无法判定的 lib 顶层 bundle」读数。
 * @param {PackageTree} tree 包树
 * @returns {{surface: string[], unjudgedLibBundles: string[], unreadable: string[]}}
 */
function runtimeSurface({ manifest, files, readSource }) {
  const fileSet = files instanceof Set ? files : new Set(files)
  const read = typeof readSource === 'function'
    ? readSource
    : () => {
        throw new Error('runtimeSurface: 必须注入 readSource（QG-006A 隔离契约：判据面不得自行读盘）')
      }
  const entries = declaredEntryPoints(manifest, fileSet)
  const { reachable, unreadable } = collectModuleClosure({ entries, files: fileSet, readSource: read })

  // 判据面之外、`lib/` 顶层的 bundle：只报读数，不判（见文件头「判据面」一节）。
  const libBundles = [...fileSet]
    .filter((rel) => /^lib\/[^/]+\.(?:js|mjs|cjs)$/.test(rel))
    .sort()
  const unjudgedLibBundles = libBundles.filter((rel) => !reachable.includes(rel))

  return { surface: reachable, unjudgedLibBundles, unreadable }
}

/**
 * 单个包的交付白名单审计。纯函数：输入是包树与注入的读取器，不自行读盘。
 * @param {PackageTree} tree 包树
 * @returns {{relPath: string, surface: string[], missing: string[], unjudgedLibBundles: string[], unreadable: string[], checked: number, decidesDelivery: boolean, skip: {type: string, reason: string}|null}}
 */
export function auditPackageDelivery(tree) {
  const { relPath, manifest } = tree
  const fileSet = tree.files instanceof Set ? tree.files : new Set(tree.files)
  const dirSet = tree.dirs instanceof Set ? tree.dirs : new Set(tree.dirs)
  const declared = manifest.files

  // 没有 `files` 白名单时，npm 打包「除 ignore 规则之外的一切」：不存在「被白名单漏掉」
  // 这一失效模式。**唯一**能把运行时文件挡在交付之外的机制是 ignore 文件，所以这里
  // 只回答那一个问题：这份 ignore 文件命中得了任何一个运行时文件吗？
  //   · 一份都没有 / 命中不了 → 交付集合不受影响，not-applicable（进 note，不进 skipped）；
  //   · 可能命中、或形态超出建模子集 → 类型化 skip（「没量到」必须与「量过且没问题」不同形）。
  // not-applicable 刻意不写成 skipped：`gate:strict` 会把它读成红灯，而永久红灯的
  // 噪声最终会让真信号一起被忽略。
  if (!Array.isArray(declared)) {
    const ignoreFiles = [...fileSet].filter((entry) => /(^|\/)(?:\.gitignore|\.npmignore)$/.test(entry)).sort()
    const surface = runtimeSurface({ relPath, manifest, files: fileSet, readSource: tree.readSource }).surface
    const notApplicable = {
      relPath,
      surface: [],
      missing: [],
      unjudgedLibBundles: [],
      unreadable: [],
      checked: 0,
      decidesDelivery: false,
      skip: null,
    }
    const skipped = (type, reason) => ({ ...notApplicable, skip: { type, reason } })
    if (ignoreFiles.length === 0) return notApplicable

    // `.npmignore` 的规则面不建模（本仓库当前一份都没有；出现即明说没量到）。
    const npmIgnore = ignoreFiles.find((entry) => entry.endsWith('.npmignore'))
    if (npmIgnore !== undefined) {
      return skipped('npmignore-decides-delivery', `${relPath}: 无 files 白名单且存在 ${npmIgnore}——交付集合由 .npmignore 决定，本项不建模该规则（未量到）`)
    }

    const patterns = []
    for (const ignoreFile of ignoreFiles) {
      const text = typeof tree.readSource === 'function' ? tree.readSource(ignoreFile) : null
      if (text === null) {
        return skipped('ignore-file-unreadable', `${relPath}: 读不到 ${ignoreFile}——交付集合无法判定（未量到）`)
      }
      const parsed = parseIgnorePatterns(text)
      if ('unknown' in parsed) {
        return skipped('ignore-pattern-not-modeled', `${relPath}: ${ignoreFile} 里的 ${JSON.stringify(parsed.unknown)} 超出本项建模的形态（未量到，请扩判定器而不是当它不存在）`)
      }
      patterns.push(...parsed.patterns)
    }

    const atRisk = surface.filter((entry) => matchesIgnorePatterns(entry, patterns))
    if (atRisk.length > 0) {
      return skipped('ignore-rules-may-drop-runtime-file', `${relPath}: ${ignoreFiles.join('/')} 的规则可能命中运行时文件（${atRisk.join(', ')}）——交付集合无法判定（未量到）`)
    }
    return { ...notApplicable, ignoreFilesChecked: ignoreFiles }
  }

  const { surface, unjudgedLibBundles, unreadable } = runtimeSurface({
    relPath,
    manifest,
    files: fileSet,
    dirs: dirSet,
    readSource: tree.readSource,
  })

  if (surface.length === 0) {
    return {
      relPath,
      surface,
      missing: [],
      unjudgedLibBundles,
      unreadable,
      checked: 0,
      decidesDelivery: true,
      skip: {
        type: 'empty-runtime-surface',
        reason: `${relPath}: 声明了 files 白名单，但按声明入口解析不出任何运行时文件（入口未构建？）——本项对该包未量到任何东西`,
      },
    }
  }

  const allowlist = compileDeliveryAllowlist(declared, dirSet)
  const main = resolveEntry(manifest.main, fileSet)
  const missing = surface.filter((entry) => !isDelivered(entry, allowlist, main))
  return { relPath, surface, missing, unjudgedLibBundles, unreadable, checked: surface.length, decidesDelivery: true, skip: null }
}

/**
 * Canonical 门禁结果：判定面是**运行时模块图上的每一个文件**。
 *
 * 分母（`expected`）只数「可能被白名单漏掉」的对象：
 *   · 有 `files` 白名单的包 → 它可达闭包里的文件数；
 *   · 无 `files` 白名单、且其 ignore 文件核对后命中不了任何运行时文件的包 → **零**，
 *     只在 `note` 里列名。not-applicable 不是 skipped：混进来会把 `gate:strict` 永久拖红，
 *     而噪声最终会让真信号一起被忽略（本仓库既有教训）。
 * @param {PackageTree[]} packages 受管包（不含仓库根包）
 * @returns {Record<string, unknown>} canonical gate result
 */
export function checkPackageFilesCoverage(packages) {
  const audits = (Array.isArray(packages) ? packages : []).map(auditPackageDelivery)

  // 一个受管包都没发现 = 发现逻辑坏了，不是「都没问题」。这条与
  // `profile-metadata-sync` 的「比了 0 个包必须与都比过不同形」是同一条教训（P-02）。
  if (audits.length === 0) {
    return {
      status: 'fail',
      expected: 1,
      discovered: 1,
      checked: 0,
      skipped: 0,
      failed: 1,
      typedSkips: [],
      reason: '没有发现任何受管包——空射程不是通过',
      note: 'package-collect 返回 0 个包：目录布局可能又变了，这不是「都合格」',
      violations: ['受管包集合为 0：package-collect 一个包都没发现（路径布局或发现规则已变，本项无法判定任何东西）'],
    }
  }

  const decisions = audits.filter((audit) => audit.decidesDelivery)
  const notApplicable = audits.filter((audit) => !audit.decidesDelivery && audit.skip === null)
  const skippedAudits = audits.filter((audit) => !audit.decidesDelivery && audit.skip !== null)

  let checked = 0
  let skipped = 0
  const typedSkips = []
  const violations = []
  const unjudged = []

  for (const audit of decisions) {
    if (audit.skip !== null) {
      skipped += 1
      typedSkips.push({ type: audit.skip.type, count: 1, reason: audit.skip.reason, objects: [audit.relPath] })
      continue
    }
    // 对象守恒：判据面上的**每个文件**恰好落在 checked 或 failed 之一，
    // 不能先把整个 surface 记成 checked 再把缺件另记成 failed（那样 expected 会多算）。
    const failedHere = audit.missing.length + audit.unreadable.length
    checked += audit.checked - failedHere
    // 读不到源码 = 闭包不完整 = 射程悄悄变小。必须判红，不能当成「这个文件没有 import」。
    for (const file of audit.unreadable) {
      violations.push(`${audit.relPath}: 判据面要读 ${file} 的源码却读不到——闭包不完整，本项无法判定该包（不得当作通过）`)
    }
    for (const file of audit.missing) {
      violations.push(
        `${audit.relPath}: 运行时模块图上的 ${file} 不在 package.json 的 files 白名单里——`
          + '全新 `file:` 安装时 pnpm 按 files 物化（实测），装载点不会有这个文件，'
          + '宿主会以 ERR_MODULE_NOT_FOUND 进恢复模式。把它加进该包 files，'
          + '或改用能覆盖它的目录/通配条目（**不要**靠同步装载点补救：全新安装路径上没有同步步骤）',
      )
    }
    for (const file of audit.unjudgedLibBundles) {
      unjudged.push(`${audit.relPath}:${file}`)
    }
  }

  for (const audit of skippedAudits) {
    skipped += 1
    typedSkips.push({ type: audit.skip.type, count: 1, reason: audit.skip.reason, objects: [audit.relPath] })
  }

  const failed = violations.length
  const expected = checked + skipped + failed

  // note 先算：空射程那条早返回同样要把「读到了什么」讲清楚（尤其 ignore 文件已核对的读数），
  // 否则最需要解释的那一次反而什么都不说。
  const note = [
    `受管包 ${audits.length} 个：判定面 ${decisions.length} 个（有 files 白名单），`
      + `不适用 ${notApplicable.length} 个（无 files 白名单：npm 全量打包，不存在漏项）`,
    ...(notApplicable.length > 0
      ? [`不适用包：${notApplicable.map((audit) => `${audit.relPath}${audit.ignoreFilesChecked ? `（已核对 ${audit.ignoreFilesChecked.join('/')}，不命中任何运行时文件）` : ''}`).join(', ')}`]
      : []),
    ...(unjudged.length > 0
      ? [`未判定（可达闭包外的 lib 顶层 bundle，机器分不出开发期模块还是约定装载的运行时模块）：${unjudged.join(', ')}`]
      : []),
    ...(checked === 0 && failed === 0 ? ['本条没有量到任何运行时文件——这不是通过'] : []),
  ].join('；')

  // 有包、但一个对象都没量到（全是不适用）：必须显式 skip，不能落到 checked=0 的
  // 「通过」上——canonical schema 本身也拒绝 `checked=0` 的 pass，但那条报错是
  // 「结果格式非法」，与「本条没量到东西」不是同一句话。
  if (expected === 0) {
    return {
      status: 'skip',
      expected: 1,
      discovered: 0,
      checked: 0,
      skipped: 1,
      failed: 0,
      typedSkips: [{
        type: 'no-checkable-package',
        count: 1,
        reason: `${audits.length} 个受管包全部不适用（无 files 白名单）——本项没有量到任何运行时文件`,
      }],
      reason: '本项没有量到任何运行时文件（全部受管包都不适用）',
      note,
      violations: [],
    }
  }
  const status = failed > 0 ? 'fail' : skipped > 0 ? 'skip' : 'pass'

  return {
    status,
    expected,
    discovered: expected,
    checked,
    skipped,
    failed,
    typedSkips,
    reason:
      status === 'fail'
        ? '交付白名单漏掉了运行时模块图上的文件（全新安装会缺件）'
        : status === 'skip'
          ? '部分包的运行时判据面未被量到（见 typedSkips）'
          : checked > 0
            ? '全部受管包的运行时模块图都在各自 files 白名单射程内'
            : '没有可判定的受管包——空射程不是通过',
    note,
    violations,
  }
}

/**
 * 真实文件系统支持的默认读取器。**只有门禁装配处**才该调用它；
 * 测试与判定器本身一律走注入（QG-006A 的隔离契约）。
 * @param {string} packageDir 包目录绝对路径
 * @returns {(relPath: string) => string|null}
 */
export function createFileSource(packageDir) {
  return (relPath) => {
    try {
      return readFileSync(join(packageDir, ...relPath.split('/')), 'utf8')
    } catch {
      return null
    }
  }
}
