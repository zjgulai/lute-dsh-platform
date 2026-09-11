/**
 * 包布局发现（ADR-0011）。
 * 迁移期需同时支持两种布局：归组后的 `packages/<group>/<pkg>/` 与历史平铺的 `<pkg>/`。
 * 工具链一律通过本模块定位包，迁移完成后旧布局分支自然失效。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 能力组目录名（也用于判定 packages/ 下的合法层级）。 */
export const GROUP_DIRS = ['capabilities', 'surfaces', 'platform', 'contract', 'infra']

/** 顶层不参与包发现的目录。 */
const TOP_LEVEL_SKIP = new Set(['node_modules', 'vendor', '.git', 'packaging', 'docs', 'scripts', '.scratch', '81-Skills', 'dist', 'release'])

/**
 * 发现仓库内的受管包。
 * @param {string} repoRoot 仓库根绝对路径
 * @returns {Array<{relPath: string, dirName: string, dir: string}>} 按相对路径排序的包列表
 */
export function discoverPackages(repoRoot) {
  const found = []
  const packagesRoot = join(repoRoot, 'packages')
  if (existsSync(packagesRoot)) {
    for (const group of readdirSync(packagesRoot)) {
      if (!GROUP_DIRS.includes(group)) continue
      const groupDir = join(packagesRoot, group)
      if (!statSync(groupDir).isDirectory()) continue
      for (const pkg of readdirSync(groupDir)) {
        const rel = `packages/${group}/${pkg}`
        if (existsSync(join(repoRoot, rel, 'package.json'))) {
          found.push({ relPath: rel, dirName: pkg, dir: join(repoRoot, rel) })
        }
      }
    }
  }

  for (const name of readdirSync(repoRoot)) {
    if (TOP_LEVEL_SKIP.has(name) || name.startsWith('.')) continue
    const dir = join(repoRoot, name)
    if (!statSync(dir).isDirectory()) continue
    if (!existsSync(join(dir, 'package.json'))) continue
    found.push({ relPath: name, dirName: name, dir: dir })
  }
  return found.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

/**
 * 返回包相对仓库根的路径，用于 profile 的 `file:` 依赖与工具链输出。
 * @param {{relPath: string}} entry 包条目
 * @returns {string} 仓库根相对路径
 */
export function packageRelPath(entry) {
  return entry.relPath
}
