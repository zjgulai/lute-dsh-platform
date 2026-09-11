#!/usr/bin/env node
/**
 * DSH 类型来源供给 CLI（ADR-0017）。
 *
 * 用法：
 *   node scripts/dsh-types.mjs --apply    # 解出内建运行时的类型并为受管包建立链接
 *   node scripts/dsh-types.mjs --check    # 只报告缺口，不写盘（默认）
 *
 * 说明：应用内打包的 @deepseek-ai/* 不含 .d.ts，类型必须来自内建运行时 tgz。
 * 解出目录 .dsh-types/ 与包内 node_modules 链接均为可重建产物，不入库。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverPackages } from './gates/package-layout.mjs'
import { applyTypeLinks, buildVendoredDeclarations, dshPackagesInManifest, dshPackagesInSource, extractRuntimeTypes, mergeVendoredTypes, planTypeLinks } from './gates/dsh-types.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 内建运行时目录（pin 自 vendor/dsh-desktop.pin 的 runtime 版本）。 */
function runtimeDir() {
  const base = join(repoRoot, 'vendor', 'dsh-desktop', 'vendor', 'dsh-runtime')
  if (!existsSync(base)) return undefined
  const versions = readdirSync(base).filter((name) => !name.startsWith('.'))
  if (versions.length === 0) return undefined
  return join(base, versions[0])
}

/** 查找可用于生成声明文件的 tsc（取任一已装 typescript 的受管包）。 */
function findTsc() {
  const candidates = [
    join(repoRoot, 'packages', 'surfaces', 'dsh-skill-center-local', 'node_modules', '.bin', 'tsc'),
    join(repoRoot, 'packages', 'platform', 'dsh-theme-local', 'node_modules', '.bin', 'tsc'),
    join(repoRoot, 'packages', 'contract', 'dsh-skill-subset', 'node_modules', '.bin', 'tsc'),
  ]
  return candidates.find((path) => existsSync(path))
}

/** 上游参照系的 vendor 目录（cordis 家族与 schemastery 的源码所在）。 */
function refVendorDir() {
  return join(repoRoot, 'vendor', 'dsh-desktop', 'deepseek-harness', 'vendor')
}

/** 类型来源输出目录。 */
const OUT_DIR = join(repoRoot, '.dsh-types')

function main() {
  const mode = process.argv.includes('--apply') ? 'apply' : 'check'
  const runtime = runtimeDir()
  if (!runtime) {
    process.stderr.write('未找到内建运行时目录：vendor/dsh-desktop/vendor/dsh-runtime/<版本>\n')
    process.exitCode = 2
    return
  }

  let available
  if (mode === 'apply') {
    const result = extractRuntimeTypes({ runtimeDir: runtime, outDir: OUT_DIR })
    const merged = mergeVendoredTypes({ refVendorDir: refVendorDir(), outDir: OUT_DIR })
    available = [...result.available, ...merged].sort()
    process.stdout.write(`ok 从内建运行时解出 ${result.extracted} 个 DSH 包到 .dsh-types/\n`)
    if (merged.length > 0) process.stdout.write(`ok 并入参照系 vendor 化包 ${merged.length} 个：${merged.join(', ')}\n`)
    const tsc = findTsc()
    if (tsc) {
      const { built, failed, failures } = buildVendoredDeclarations({ dir: OUT_DIR, tsc })
      process.stdout.write(`ok 生成声明文件 ${built.length} 个：${built.join(', ') || '(无)'}\n`)
      if (failed.length > 0) {
        process.stdout.write(`note 声明生成失败 ${failed.length} 个：${failed.join(', ')}\n`)
        for (const line of failures.slice(0, 3)) process.stdout.write(`     原因 ${line}\n`)
      }
    } else {
      process.stdout.write('note 未找到 tsc，跳过声明生成（cordis 家族类型将不可用）\n')
    }
  } else {
    available = existsSync(OUT_DIR)
      ? readdirSync(OUT_DIR).filter((name) => existsSync(join(OUT_DIR, name, 'package.json'))).map((name) => `@deepseek-ai/${name}`)
      : []
    if (available.length === 0) {
      process.stdout.write('skip 类型来源目录不存在（先运行 --apply）\n')
      return
    }
  }

  const packages = discoverPackages(repoRoot)
  let linked = 0
  const gaps = []
  for (const entry of packages) {
    const needed = [...new Set([...dshPackagesInManifest(entry.dir), ...dshPackagesInSource(entry.dir)])].sort()
    const plan = planTypeLinks({ needed, available })
    for (const name of plan.missing) gaps.push(`${entry.relPath}: ${name}`)

    if (mode === 'apply') {
      linked += applyTypeLinks({ root: entry.dir, source: OUT_DIR, links: plan.links })
    } else {
      const unresolved = plan.links.filter((name) => {
        const short = name.split('/')[1]
        return !existsSync(join(entry.dir, 'node_modules', '@deepseek-ai', short, 'package.json'))
      })
      for (const name of unresolved) gaps.push(`${entry.relPath}: ${name}（未链接）`)
    }
  }

  if (mode === 'apply') process.stdout.write(`ok 建立 ${linked} 条类型链接（${packages.length} 个受管包）\n`)
  if (gaps.length > 0) {
    process.stdout.write(`note ${gaps.length} 处缺口（内建运行时未提供对应 tgz）：\n`)
    for (const gap of gaps.slice(0, 20)) process.stdout.write(`  - ${gap}\n`)
  } else {
    process.stdout.write('ok 无缺口\n')
  }
}

main()
