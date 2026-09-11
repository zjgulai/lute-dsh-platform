/**
 * DSH 类型来源供给（ADR-0017）。
 *
 * 背景：应用内打包的 `@deepseek-ai/*` 不携带 `.d.ts`（其 `exports` 仍声明 types 指向
 * 不存在的文件），因此 `tsc` 对该 API 只能得到 any。内建运行时
 * `vendor/dsh-desktop/vendor/dsh-runtime/<版本>/*.tgz` 含完整类型声明与运行时产物。
 *
 * 本模块从这些 tgz 解出统一视图，并按包建立 node_modules 符号链接，
 * 使每个包的 typecheck 与 test 都能解析到与交付运行时同版本的 API 契约。
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'

/** 受管包中 DSH 依赖的命名空间。 */
const DSH_SCOPE = '@deepseek-ai'

/** 从源码文件中提取的 import 说明符。 */
const IMPORT_PATTERN = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g

/**
 * 从 package.json 的三类依赖中收集 DSH 包名。
 * @param {string} packageRoot 包目录绝对路径
 * @returns {string[]} 去重排序后的 DSH 包名
 */
export function dshPackagesInManifest(packageRoot) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const names = new Set()
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(manifest[key] ?? {})) {
      if (name.startsWith(`${DSH_SCOPE}/`)) names.add(name)
    }
  }
  return [...names].sort()
}

/**
 * 递归扫描源码目录中的 import 说明符，收集 DSH 包名。
 * @param {string} packageRoot 包目录绝对路径
 * @returns {string[]} 去重排序后的 DSH 包名
 */
export function dshPackagesInSource(packageRoot) {
  const names = new Set()
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'lib') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(ts|tsx|mts|js|mjs|jsx)$/.test(entry.name)) {
        const text = readFileSync(path, 'utf8')
        for (const match of text.matchAll(IMPORT_PATTERN)) {
          const spec = match[1]
          if (!spec.startsWith(`${DSH_SCOPE}/`)) continue
          // 子路径导入归一到包名：@deepseek-ai/dsh-x/client → @deepseek-ai/dsh-x
          const segments = spec.split('/')
          names.add(`${segments[0]}/${segments[1]}`)
        }
      }
    }
  }
  for (const dir of ['src', 'test', 'tests']) walk(join(packageRoot, dir))
  return [...names].sort()
}

/**
 * 计算需要建立的类型链接。
 * @param {{needed: string[], available: string[]}} input 需要的包名与已有 tgz 的包名
 * @returns {{links: string[], missing: string[]}} 可建立链接的包与缺 tgz 的包
 */
export function planTypeLinks({ needed, available }) {
  const have = new Set(available)
  return {
    links: needed.filter((name) => have.has(name)),
    missing: needed.filter((name) => !have.has(name)),
  }
}

/**
 * 在目标包内建立指向类型来源的符号链接；已存在实体目录时不覆盖（包自装依赖优先）。
 * @param {{root: string, source: string, links: string[]}} input 目标包、类型来源目录与待链接包名
 * @returns {number} 实际建立的链接数
 */
export function applyTypeLinks({ root, source, links }) {
  let written = 0
  for (const name of links) {
    const pkgName = name.split('/')[1]
    const sourceDir = join(source, pkgName)
    // 类型来源里没有对应目录就跳过；否则会留下断链（门禁 dependency-links 会拒绝）
    if (!existsSync(sourceDir)) continue
    const scopeDir = join(root, 'node_modules', DSH_SCOPE)
    mkdirSync(scopeDir, { recursive: true })
    const linkPath = join(scopeDir, pkgName)
    if (isSymlink(linkPath)) {
      // 已是符号链接则重建：可能是因包目录层级变化而失效的相对链接
      rmSync(linkPath, { force: true })
    } else if (existsSync(linkPath)) {
      // 实体目录（包自装依赖）优先，不覆盖
      continue
    }
    symlinkSync(sourceDir, linkPath)
    written += 1
  }
  return written
}

/** 路径是否为符号链接（lstat 不跟随目标，断链也能识别）。 */
function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * 把内建运行时的 tgz 解出为类型来源目录。
 * @param {{runtimeDir: string, outDir: string}} input 运行时 tgz 目录与输出目录
 * @returns {{extracted: number, available: string[]}} 解出的包数与包名
 */
export function extractRuntimeTypes({ runtimeDir, outDir }) {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  const available = []
  for (const file of readdirSync(runtimeDir).filter((name) => name.endsWith('.tgz'))) {
    const temp = join(outDir, `.tmp-${file}`)
    mkdirSync(temp, { recursive: true })
    execFileSync('tar', ['-xzf', join(runtimeDir, file), '-C', temp])
    const manifestPath = join(temp, 'package', 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const name = String(manifest.name ?? '')
    if (!name.startsWith(`${DSH_SCOPE}/`)) continue
    const shortName = name.split('/')[1]
    mv(join(temp, 'package'), join(outDir, shortName))
    rmSync(temp, { recursive: true, force: true })
    available.push(name)
  }
  return { extracted: available.length, available: available.sort() }
}

/** 同设备原子移动，回退到递归复制。 */
function mv(from, to) {
  rmSync(to, { recursive: true, force: true })
  execFileSync('mv', [from, to])
}

/**
 * 收集参照系中 vendor 化的 DSH 包（cordis 家族与 schemastery）。
 * 这些包不在内建运行时 tgz 中，但上游参照系的 vendor/ 含 TypeScript 源码，
 * 可直接作为类型来源（TypeScript 能解析 .ts 源）。
 * @param {string} refVendorDir 上游参照系的 vendor 目录（如 vendor/dsh-desktop/deepseek-harness/vendor）
 * @returns {string[]} 包名
 */
export function dshVendoredPackages(refVendorDir) {
  if (!existsSync(refVendorDir)) return []
  const found = []
  for (const entry of readdirSync(refVendorDir)) {
    const manifestPath = join(refVendorDir, entry, 'package.json')
    if (!existsSync(manifestPath)) continue
    const name = String(JSON.parse(readFileSync(manifestPath, 'utf8')).name ?? '')
    if (name.startsWith(`${DSH_SCOPE}/`)) found.push({ name, dirName: entry })
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 把参照系 vendor 化的 DSH 包并入类型来源目录（复制其包目录）。
 * @param {{refVendorDir: string, outDir: string}} input 参照系 vendor 目录与类型输出目录
 * @returns {string[]} 并入的包名
 */
export function mergeVendoredTypes({ refVendorDir, outDir }) {
  const merged = []
  for (const { name, dirName } of dshVendoredPackages(refVendorDir)) {
    // 类型来源目录以「包名的短名」为键（与内建运行时 tgz 的解出结果一致），
    // 但源码目录名可能与短名不同（如包名 cordis-plugin-group 位于目录 group/）。
    const short = name.split('/')[1]
    const from = join(refVendorDir, dirName)
    const to = join(outDir, short)
    if (existsSync(to)) continue
    execFileSync('cp', ['-R', from, to])
    merged.push(name)
  }
  return merged
}

/** 需要从源码生成声明文件的 vendored 包（按依赖顺序：cosmokit 先于 cordis）。 */
export const DECLARATION_BUILD_ORDER = [
  'cosmokit',
  'schemastery',
  'cordis',
  'cordis-plugin-group',
  'cordis-plugin-loader',
  'cordis-plugin-include',
  'cordis-plugin-timer',
  'cordis-plugin-hmr',
  'cordis-plugin-logger-console',
]

/**
 * 为 vendored 的 DSH 源码包生成 `lib/`（真实 JS + 类型声明），使其 exports 的
 * default 与 types 两个入口都可达。
 *
 * 为什么需要：这些包在参照系里是**未构建的 TypeScript 源码**，`package.json` 的
 * `exports.types` 指向不存在的 `lib/types/`；而应用与内建运行时都不提供它们的类型。
 * 若让消费者直接 paths 到 `.ts` 源码，tsc 会连带检查上游实现并报出源码自身的错误。
 * 因此在这里一次性编译：源码加 `@ts-nocheck` 只抑制上游内部错误，
 * 对外导出的签名仍由 tsc 按真实类型推导；同时产出运行时代码，
 * 使 node_modules 链接可以同时满足运行时与类型检查两个需求。
 *
 * @param {{dir: string, tsc: string, packages?: string[]}} input 类型来源目录、tsc 可执行文件与包名（目录名）
 * @returns {{built: string[], failed: string[]}} 成功与失败清单
 */
export function buildVendoredDeclarations({ dir, tsc, packages = DECLARATION_BUILD_ORDER }) {
  const built = []
  const failed = []
  const failures = []
  const buildRoot = join(dir, '.decl-build')
  for (const name of packages) {
    const source = join(dir, name)
    if (!existsSync(join(source, 'src'))) continue
    const work = join(buildRoot, name)
    rmSync(work, { recursive: true, force: true })
    mkdirSync(work, { recursive: true })
    execFileSync('cp', ['-R', join(source, 'src'), join(work, 'src')])
    for (const file of listTsFiles(join(work, 'src'))) {
      const text = readFileSync(file, 'utf8')
      if (!text.startsWith('// @ts-nocheck')) writeFileSync(file, `// @ts-nocheck\n${text}`)
    }
    writeFileSync(
      join(work, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            lib: ['ES2023'],
            types: ['node'],
            declaration: true,
            // 上游源码内部用 `.ts` 后缀相对导入，必须改写为 `.js`，否则产物在 Node 下无法加载
            rewriteRelativeImportExtensions: true,
            // 上游 cordis 用 `const enum`（如 FiberState）：默认会被 tsc 内联擦除，
            // 产物里没有运行时对象，import 它会报「不导出该名称」（实测测试收集失败）。
            // preserveConstEnums 保留其运行时对象，使产物与源码导出一致。
            preserveConstEnums: true,
            outDir: 'lib',
            rootDir: 'src',
            skipLibCheck: true,
            strict: false,
            noImplicitAny: false,
          },
          include: ['src/**/*.ts'],
        },
        null,
        2,
      ),
    )
    try {
      execFileSync(tsc, ['-p', join(work, 'tsconfig.json')], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      // tsc 可能因临时目录缺少 @types/node 等环境问题返回非零，但声明已产出；
      // 因此以「产物是否存在」为成功判据，而不是退出码（实测教训）。
    }
    {
      const produced = join(work, 'lib')
      if (!existsSync(produced)) {
        failed.push(name)
        failures.push(`${name}: 未产出 lib（tsc 退出非零且无产物）`)
        continue
      }
      // 同时回填真实 JS 与类型声明：运行时（host 测试）与类型检查共用同一份来源，
      // 这正是 ADR-0017 要求的「已编译 + 带类型」，避免两侧各指一处。
      rmSync(join(source, 'lib'), { recursive: true, force: true })
      execFileSync('cp', ['-R', produced, join(source, 'lib')])
      built.push(name)
    }
  }
  rmSync(buildRoot, { recursive: true, force: true })
  return { built, failed, failures }
}

/** 递归列出 .ts 文件（不含声明文件）。 */
function listTsFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) listTsFiles(path, out)
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(path)
  }
  return out
}

/**
 * 在类型来源目录内建立 `node_modules/@deepseek-ai` 自解析作用域。
 *
 * 为什么需要：解出的 DSH 包 `lib/index.js` 里是裸包名导入（如 `@deepseek-ai/cordis`），
 * 只有运行时（vitest/node 执行 host 测试）会真正加载它们；若 `.dsh-types` 自身没有
 * node_modules，Node 从该目录向上找不到这些包，host 测试会全部收集失败（实测 5/5）。
 * @param {{outDir: string, appNodeModules?: string}} input 类型来源目录与应用 node_modules（提供 @standard-schema 等第三方）
 * @returns {number} 建立的链接数
 */
export function linkTypeScope({ outDir, appNodeModules }) {
  if (!existsSync(outDir)) return 0
  const scopeDir = join(outDir, 'node_modules', DSH_SCOPE)
  mkdirSync(scopeDir, { recursive: true })
  let linked = 0
  for (const entry of readdirSync(outDir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const pkgDir = join(outDir, entry)
    if (!existsSync(join(pkgDir, 'package.json'))) continue
    const linkPath = join(scopeDir, entry)
    if (isSymlink(linkPath)) rmSync(linkPath, { force: true })
    else if (existsSync(linkPath)) continue
    symlinkSync(pkgDir, linkPath)
    linked += 1
  }
  if (appNodeModules && existsSync(appNodeModules)) {
    for (const scope of readdirSync(appNodeModules)) {
      if (!scope.startsWith('@')) continue
      const from = join(appNodeModules, scope)
      const to = join(outDir, 'node_modules', scope)
      if (existsSync(to)) continue
      symlinkSync(from, to)
    }
  }
  return linked
}

/**
 * 按实际产出把包 `exports` 归一化，使 default 与 types 两个入口都可达。
 *
 * 为什么需要：上游这些包用 tsdown 打包（产出 .mjs/.cjs 或多入口），而本流水线用 tsc
 * 产出 `lib/index.js` + `lib/index.d.ts`。若照搬上游 exports，消费者按 exports 解析
 * 会落空（实测：cordis 的 types 指向不存在的 lib/types/，schemastery 指向不存在的 .mjs/.cjs）。
 * @param {{outDir: string, packages: string[]}} input 类型来源目录与包名（目录名）
 * @returns {string[]} 已归一化的包名
 */
export function normalizeExportMaps({ outDir, packages }) {
  const normalized = []
  for (const name of packages) {
    const pkgDir = join(outDir, name)
    const entryJs = join(pkgDir, 'lib', 'index.js')
    const entryTypes = join(pkgDir, 'lib', 'index.d.ts')
    if (!existsSync(entryJs) || !existsSync(entryTypes)) continue
    const manifestPath = join(pkgDir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.exports = {
      '.': { types: './lib/index.d.ts', default: './lib/index.js' },
      './src/*': './src/*',
      './package.json': './package.json',
    }
    manifest.main = 'lib/index.js'
    manifest.types = 'lib/index.d.ts'
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    normalized.push(name)
  }
  return normalized
}

/**
 * 类型声明补齐（ADR-0017 的组成部分）。
 *
 * 实测：DSH 0.1.2-rc.1 的发布声明比运行时**少成员**——运行时有、`.d.ts` 里没有：
 *   `Session.events`（运行时 this.events 存在）、`SessionHeader.seedLength`（运行时存在）、
 *   `JsonValue`（运行时从 dsh-util-values 使用，但主入口未重导出）。
 * 这属于上游类型完整性缺陷；本仓库无法在上游修复，因此在**类型供给侧**以显式、
 * 可审计的方式补齐，而不是在各插件里散落 `as any` 或本地重复声明。
 * 每一条都写明依据，便于上游修复后删除。
 * @param {{outDir: string}} input 类型来源目录
 * @returns {string[]} 已补齐的条目描述
 */
export function augmentDeclarations({ outDir }) {
  const applied = []
  const sessionDir = join(outDir, 'dsh-session', 'lib', 'types')

  const typesFile = join(sessionDir, 'types.d.ts')
  if (existsSync(typesFile)) {
    let text = readFileSync(typesFile, 'utf8')
    if (!text.includes('seedLength')) {
      // 运行时 `session.header.seedLength` 存在（lib/index.js 实测 2 处），声明缺失。
      text = text.replace(
        /(export interface SessionHeader \{)/,
        '$1\n    /** 上游声明缺失：运行时存在（实测 lib/index.js），由类型供给补齐（ADR-0017）。 */\n    readonly seedLength?: number;',
      )
      writeFileSync(typesFile, text)
      applied.push('dsh-session: SessionHeader.seedLength')
    }
  }

  const indexFile = join(sessionDir, 'index.d.ts')
  if (existsSync(indexFile)) {
    let text = readFileSync(indexFile, 'utf8')
    if (!/export type \{ JsonValue \}/.test(text)) {
      // 运行时从 dsh-util-values 使用 JsonValue（实测 5 处），主入口未重导出。
      text = `${text}\n/** 上游声明缺失：运行时使用 JsonValue（实测 lib/index.js 5 处），由类型供给重导出（ADR-0017）。 */\nexport type { JsonValue } from '@deepseek-ai/dsh-util-values';\n`
      // `Session.events`：运行时实例拥有 events 数组（实测 this.events 3 处），声明未暴露。
      text = text.replace(
        /(export declare class Session\b[^{]*\{)/,
        '$1\n    /** 上游声明缺失：运行时实例拥有 events（实测 lib/index.js），由类型供给补齐（ADR-0017）。 */\n    readonly events: readonly SessionEvent[];',
      )
      writeFileSync(indexFile, text)
      applied.push('dsh-session: JsonValue 重导出、Session.events')
    }
  }
  return applied
}

/**
 * 清除类型来源中指向**不存在的 map 文件**的 sourceMappingURL 注释。
 *
 * 动机（实测）：内建运行时 tgz 解出的包带 `//# sourceMappingURL=index.js.map`，
 * 而本流水线用 tsc 只产出 .js/.d.ts、不产出 map；vitest 加载这些 js 时会尝试读 map
 * 并抛 ENOENT，导致测试套件整体收集失败（dsh-deepresearch-local 实测 3/6 套件失败）。
 * @param {string} outDir 类型来源目录
 * @returns {number} 被清理的文件数
 */
export function stripDanglingSourceMaps(outDir) {
  if (!existsSync(outDir)) return 0
  let cleaned = 0
  for (const pkg of readdirSync(outDir)) {
    const libDir = join(outDir, pkg, 'lib')
    if (!existsSync(libDir)) continue
    for (const file of listJsFiles(libDir)) {
      const text = readFileSync(file, 'utf8')
      const match = /\/\/# sourceMappingURL=(\S+)/.exec(text)
      if (match === null) continue
      const mapPath = join(dirname(file), match[1])
      if (existsSync(mapPath)) continue
      writeFileSync(file, text.split('\n').filter((line) => !line.includes('sourceMappingURL=')).join('\n'))
      cleaned += 1
    }
  }
  return cleaned
}

/** 递归列出 .js 文件。 */
function listJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) listJsFiles(path, out)
    else if (entry.name.endsWith('.js')) out.push(path)
  }
  return out
}
