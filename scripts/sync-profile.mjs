#!/usr/bin/env node
/**
 * 同步 live profile 副本与仓库源（架构红线 4：一律 tmp+mv 原子替换）。
 *
 * 用法：
 *   node scripts/sync-profile.mjs --check                 # 只报告漂移，不写盘（默认）
 *   node scripts/sync-profile.mjs --apply                 # 同步全部内容不同的文件
 *   node scripts/sync-profile.mjs --apply --only-metadata # 只同步 package.json（构建产物由各自构建脚本产出）
 *   node scripts/sync-profile.mjs --check --profile <目录> # 指定其他 profile
 *
 * 语义：只替换副本中已存在的文件；副本独有文件（构建产物、备份）一律不追加、不删除。
 * 退出码：0 = 已一致或同步成功；1 = 存在漂移（--check 模式）；2 = 用法错误。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySync, cleanTemps, planSync } from './gates/sync-profile.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 仓库内受管插件目录（顶层 dsh-* 且含 package.json）。 */
function managedPackages() {
  return readdirSync(repoRoot)
    .filter((name) => name.startsWith('dsh-') && existsSync(join(repoRoot, name, 'package.json')))
    .sort()
}

/** 递归收集相对文件路径，跳过 node_modules 与构建产物目录。 */
function listFiles(root, rel = '', out = []) {
  const dir = join(root, rel)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const child = rel === '' ? entry.name : `${rel}/${entry.name}`
    if (entry.isDirectory()) listFiles(root, child, out)
    else out.push(child)
  }
  return out
}

function parseArgs(argv) {
  let mode = 'check'
  let onlyMetadata = false
  let profile = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') mode = 'check'
    else if (argv[i] === '--apply') mode = 'apply'
    else if (argv[i] === '--only-metadata') onlyMetadata = true
    else if (argv[i] === '--profile') {
      profile = argv[i + 1]
      i += 1
    } else return { error: `未知参数：${argv[i]}` }
  }
  return { mode, onlyMetadata, profile }
}

function main() {
  const { mode, onlyMetadata, profile, error } = parseArgs(process.argv.slice(2))
  if (error) {
    process.stderr.write(`${error}\n`)
    process.exitCode = 2
    return
  }
  const vendorDir = join(profile, 'vendor')
  if (!existsSync(vendorDir)) {
    process.stdout.write(`skip 未找到 profile 副本目录：${vendorDir}\n`)
    return
  }

  let driftCount = 0
  for (const pkg of managedPackages()) {
    const target = join(vendorDir, pkg)
    if (!existsSync(target)) continue

    const files = listFiles(join(repoRoot, pkg))
    const { diverged, absentInTarget } = planSync(join(repoRoot, pkg), target, files)
    const selected = onlyMetadata ? diverged.filter((file) => file === 'package.json') : diverged
    if (selected.length === 0) {
      if (absentInTarget.length > 0) {
        process.stdout.write(`note ${pkg}: 副本未包含 ${absentInTarget.length} 个仓库文件（不追加，副本可能含运行所需产物）\n`)
      }
      continue
    }

    driftCount += 1
    process.stdout.write(
      `drift ${pkg}: ${selected.slice(0, 5).map((f) => `~${f}`).join(' ')}${selected.length > 5 ? ` … (+${selected.length - 5})` : ''}\n`,
    )

    if (mode === 'apply') {
      applySync(join(repoRoot, pkg), target, selected)
      cleanTemps(target, selected)
      process.stdout.write(`sync  ${pkg}: 已按 tmp+mv 原子替换 ${selected.length} 个文件\n`)
    }
  }

  if (driftCount === 0) {
    process.stdout.write('ok 全部 profile 副本与仓库源一致\n')
    process.exitCode = 0
    return
  }
  if (mode === 'check') {
    process.stdout.write(`fail ${driftCount} 个包存在漂移（运行 --apply 同步）\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`ok 已同步 ${driftCount} 个包\n`)
    process.exitCode = 0
  }
}

main()
