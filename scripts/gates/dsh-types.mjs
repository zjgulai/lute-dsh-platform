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
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
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
