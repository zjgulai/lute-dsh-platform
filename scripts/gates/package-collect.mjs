/**
 * 受管包收集（单一来源）。
 * 门禁与目录墙生成器必须用同一个收集器，否则两边的包集合会分叉，
 * 使 catalog-fresh 出现假失败（实测教训：CLI 与门禁各自的收集逻辑顺序不同即失败）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { discoverPackages } from './package-layout.mjs'

/**
 * 收集仓库根包与全部受管包。
 * @param {string} repoRoot 仓库根绝对路径
 * @returns {{rootManifest: Record<string, unknown>, packages: Array<{relPath: string, dirName: string, dir: string, group: string|undefined, manifest: Record<string, unknown>}>}}
 */
export function collectPackages(repoRoot) {
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  const packages = discoverPackages(repoRoot).map((entry) => ({
    relPath: entry.relPath,
    dirName: entry.dirName,
    dir: entry.dir,
    group: entry.relPath.startsWith('packages/') ? entry.relPath.split('/')[1] : undefined,
    manifest: JSON.parse(readFileSync(join(entry.dir, 'package.json'), 'utf8')),
  }))
  return { rootManifest, packages }
}

/**
 * 收集 package-identity 的完整判定面。根包必须显式成为 `.` 条目，不能由调用方
 * 临时拼接；否则目录墙与身份门禁仍可能在“根包算不算包”这件事上分叉。
 * @param {string} repoRoot 仓库根绝对路径
 * @returns {Array<{relPath: string, dir: string, group?: string, manifest: Record<string, unknown>}>}
 */
export function collectManagedManifests(repoRoot) {
  const { rootManifest, packages } = collectPackages(repoRoot)
  return [
    { relPath: '.', dir: '.', manifest: rootManifest },
    ...packages.map((entry) => ({
      relPath: entry.relPath,
      dir: entry.relPath,
      group: entry.group,
      manifest: entry.manifest,
    })),
  ]
}
