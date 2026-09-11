/**
 * profile 副本同步工具。源与副本语义见 docs/architecture.md 第 2 节红线 4：
 * 编辑工具会打破 `file:` 硬链接 inode，因此副本同步一律 tmp+mv 原子替换，
 * 绝不用 `cat >` 直接覆盖（会同时破坏源与副本两个文件）。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 计算待同步清单：只比较副本中已存在的文件内容，不追加副本缺失的文件
 * （副本可能含构建产物、备份等仓库内不收录的文件，全量复制会覆盖运行所需内容）。
 * @param {string} sourceDir 源目录绝对路径
 * @param {string} targetDir 副本目录绝对路径
 * @param {string[]} files 相对路径列表
 * @returns {{diverged: string[], absentInTarget: string[]}}
 */
export function planSync(sourceDir, targetDir, files) {
  const diverged = []
  const absentInTarget = []
  for (const file of files) {
    const target = join(targetDir, file)
    if (!existsSync(target)) {
      absentInTarget.push(file)
      continue
    }
    if (readFileSync(join(sourceDir, file), 'utf8') !== readFileSync(target, 'utf8')) diverged.push(file)
  }
  return { diverged, absentInTarget }
}

/**
 * 执行同步。每个文件写临时文件后 rename 覆盖，保证副本要么是旧内容要么是新内容。
 * @param {string} sourceDir 源目录绝对路径
 * @param {string} targetDir 副本目录绝对路径
 * @param {string[]} files 相对路径列表
 * @returns {number} 实际写入的文件数
 */
export function applySync(sourceDir, targetDir, files) {
  let written = 0
  for (const file of files) {
    const source = join(sourceDir, file)
    const target = join(targetDir, file)
    mkdirSync(dirname(target), { recursive: true })
    const tmp = `${target}.tmp-${process.pid}`
    copyFileSync(source, tmp)
    renameSync(tmp, target)
    written += 1
  }
  return written
}

/** 删除同步过程中可能残留的临时文件。 */
export function cleanTemps(targetDir, files) {
  for (const file of files) rmSync(join(targetDir, `${file}.tmp-${process.pid}`), { force: true })
}

/**
 * 校验 live profile 副本的 package.json 与仓库源一致（只校验元数据，不管构建产物）。
 * 副本不存在该包时视为「未安装」，不报错。
 * @param {Array<{name: string, sourceDir: string, targetDir: string}>} pairs 待校验包
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkProfileMetadata(pairs) {
  const violations = []
  const file = 'package.json'
  for (const { name, sourceDir, targetDir } of pairs) {
    if (!existsSync(join(targetDir, file))) continue
    const { diverged } = planSync(sourceDir, targetDir, [file])
    if (diverged.length > 0) {
      violations.push(`${name}: live profile 副本的 package.json 与仓库源不一致（运行 scripts/sync-profile.mjs --apply --only-metadata）`)
    }
  }
  return { passed: violations.length === 0, violations }
}
