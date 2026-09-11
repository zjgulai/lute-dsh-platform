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

/**
 * 校验 profile 副本与包 `files` 清单一致（交付形态，两个方向都查）。
 *
 * 动机（2026-09-11 实测）：`file:` 依赖在 profile 里是**硬链接实体副本**而非符号链接，
 * 安装之后新增的文件不会进副本。dsh-preset-lint-local 的 lib/lint-preset.mjs 就这么丢了，
 * 症状是「preset 校验整体静默失效 + 日志里一句 warn」，排查成本极高。
 * 反向的不一致同样存在：清单声明了但源码里根本没有（陈旧清单）。
 *
 * 语义：`files` 清单即契约。
 *   - 清单条目在源码中不存在（通配条目按其静态前缀目录判定）→ 违规；
 *   - 条目在源码中存在、但 profile 副本中不存在 → 违规。
 * 副本不存在该包时视为「未安装」，跳过（与 checkProfileMetadata 同语义）。
 * @param {Array<{name: string, sourceDir: string, targetDir: string, files?: string[]}>} pairs 待校验包
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkProfileFilesSync(pairs) {
  const violations = []
  for (const { name, sourceDir, targetDir, files } of pairs) {
    if (!existsSync(join(targetDir, 'package.json'))) continue
    for (const entry of files ?? []) {
      // 通配条目（如 lib/types/**/*.d.ts）取其静态前缀目录判定存在性。
      const relative = entry.includes('*')
        ? entry.slice(0, entry.search(/[*?]/)).replace(/\/$/, '')
        : entry
      if (!existsSync(join(sourceDir, relative))) {
        violations.push(`${name}: files 声明的 "${entry}" 在源码中不存在（陈旧清单，请从 package.json 的 files 中删除）`)
        continue
      }
      if (!existsSync(join(targetDir, relative))) {
        violations.push(`${name}: files 声明的 "${entry}" 在 profile 副本中缺失（用 tmp+mv 语义补齐，勿直接覆盖）`)
      }
    }
  }
  return { passed: violations.length === 0, violations }
}
