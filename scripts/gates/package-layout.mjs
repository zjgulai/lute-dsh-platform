/**
 * 包布局发现（ADR-0011）。
 * 唯一合法布局是归组后的 `packages/<group>/<pkg>/`。
 *
 * 历史：迁移期曾有一个兼容分支把根层 `<pkg>/`（含 package.json）也当作受管包，
 * 并配 `TOP_LEVEL_SKIP` 名单跳过若干目录。2026-09-11 二期迁移完成后该分支已无对象
 * （实测非 `packages/` 布局的包为 0），故连同名单一起退役——把边界写成「只有一种布局」，
 * 而不是「靠名单碰巧跳过根层目录」。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 能力组目录名（也用于判定 packages/ 下的合法层级）。 */
export const GROUP_DIRS = ['capabilities', 'surfaces', 'platform', 'contract', 'infra']

/**
 * 发现仓库内的受管包。
 * @param {string} repoRoot 仓库根绝对路径
 * @returns {Array<{relPath: string, dirName: string, dir: string}>} 按相对路径排序的包列表
 */
export function discoverPackages(repoRoot) {
  const found = []
  const packagesRoot = join(repoRoot, 'packages')
  if (!existsSync(packagesRoot)) return found
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
