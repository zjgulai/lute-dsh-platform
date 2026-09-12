#!/usr/bin/env node
/**
 * 出货树「构建机绝对路径」守卫（只减不增）。
 *
 * ## 为什么需要它
 *
 * 同一类缺陷在本项目已发生三次，每次都是「本机可解、客户机必错」且**静默**：
 *   1. profile 的 `file:` 依赖写成 `file:/Users/lute/project/KOL-Hunter`（仓库外），
 *      既不进 vendor 抽取、也不被 rewrite-file-deps 重写 → 原样出货（2026-09-12 实测）。
 *   2. `cordis.patch.yml` 的 `ui-newapp-local.productRoots` 写着 `/Users/lute/project`，
 *      assemble 只替换 `$DSH_HOME` 一个前缀 → 随包发出（同一轮实测）。
 *   3. 历史：插件脚本写死 `/Users/lute/project/Magpie-Horch/...`，客户机上失效且不报错。
 *
 * 前两次的修法是「补一条前缀」——而补前缀只治当次。本守卫把判据换成机读的集合比较：
 * 出货树里出现构建机 home 路径的文件集合，必须**只减不增**。
 *
 * ## 语义
 *
 * - 基线缺失 → **响亮失败**（不静默通过）：先 `--write-baseline`，再逐条人工审阅。
 * - 出现基线外的新命中 → 失败并逐条打印。
 * - 基线里有、本次没扫到 → 只提示「可下调」，不改文件（与 ADR-0014 的豁免只减不增同构）。
 *
 * 用法：
 *   node packaging/scripts/scan-machine-paths.mjs --root <dir> [--root <dir>…]
 *        [--baseline packaging/machine-path-baseline.json] [--write-baseline]
 *        [--quiet]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_BASELINE = join(HERE, '..', 'machine-path-baseline.json')

/** 解析命令行（只接受长选项，未知选项即失败——不静默吞）。 */
function parseArgs(argv) {
  const out = { roots: [], baseline: DEFAULT_BASELINE, write: false, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') out.roots.push(argv[++i])
    else if (a === '--baseline') out.baseline = resolve(argv[++i])
    else if (a === '--write-baseline') out.write = true
    else if (a === '--quiet') out.quiet = true
    else throw new Error(`未知参数: ${a}`)
  }
  if (out.roots.length === 0) throw new Error('至少需要一个 --root <dir>')
  return out
}

/**
 * 扫描一个根下含构建机 home 路径的文件（跳过二进制）。
 * 用 grep 而不是 Node 遍历：出货树含 10 万级文件（实测 node_modules 475M 扫 6.7s，
 * 纯 Node 逐文件读取要慢一个数量级）。grep 不可用即响亮失败，不退化。
 * @param {string} root 绝对路径
 * @param {string} needle 待查字符串（构建机 home）
 * @returns {string[]} 相对 root 的路径（已排序）
 */
function scanRoot(root, needle) {
  let stdout
  try {
    stdout = execFileSync('grep', ['-rlFI', '--', needle, '.'], {
      cwd: root,
      maxBuffer: 1 << 28,
      encoding: 'utf8',
    })
  } catch (err) {
    // grep 无命中时退出码 1；其余情况才算失败
    if (err.status === 1) return []
    throw new Error(`grep 扫描失败（${root}）：${err.message}`)
  }
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((p) => p.replace(/^\.\//, ''))
    .sort()
}

/** 主流程。 */
function main() {
  const args = parseArgs(process.argv.slice(2))
  const needle = process.env.BUILD_HOME ?? homedir()
  if (!needle || needle === '/') throw new Error('构建机 home 解析为空——拒绝用一个空/根路径做判据')

  const current = new Set()
  for (const root of args.roots) {
    const abs = resolve(root)
    if (!existsSync(abs)) throw new Error(`扫描根不存在: ${abs}`)
    for (const rel of scanRoot(abs, needle)) current.add(rel)
  }
  const currentSorted = [...current].sort()

  if (args.write) {
    const payload = {
      note: `出货树中仍含构建机 home 路径（${needle}）的文件。只减不增：新增即失败；修好一条请同步下调本文件。`,
      needle,
      recordedAt: new Date().toISOString().slice(0, 10),
      entries: currentSorted,
    }
    writeFileSync(args.baseline, JSON.stringify(payload, null, 2) + '\n')
    console.log(`[machine-paths] 基线已写入 ${relative(process.cwd(), args.baseline)}（${currentSorted.length} 条）`)
    return 0
  }

  if (!existsSync(args.baseline)) {
    console.error(`[machine-paths] 基线缺失：${relative(process.cwd(), args.baseline)}`)
    console.error('[machine-paths] 先建立基线并人工审阅：node packaging/scripts/scan-machine-paths.mjs --root <dir> --write-baseline')
    return 2
  }

  const baseline = JSON.parse(readFileSync(args.baseline, 'utf8'))
  const known = new Set(baseline.entries ?? [])
  const added = currentSorted.filter((p) => !known.has(p))
  const removed = [...known].filter((p) => !current.has(p)).sort()

  if (added.length > 0) {
    console.error(`[machine-paths] ✗ 出货树新增 ${added.length} 个含构建机路径的文件（基线只减不增）：`)
    for (const p of added) console.error(`    + ${p}`)
    console.error('[machine-paths] 修法：把路径改成占位（__DSH_HOME__ / __LUTE_PROJECT_ROOT__）或仓库相对形式；')
    console.error('[machine-paths] 确属无法改的第三方产物，需在基线里显式登记并写明理由。')
    return 1
  }

  if (!args.quiet) {
    console.log(`[machine-paths] ✓ 无新增（当前 ${currentSorted.length} 条，基线 ${known.size} 条）`)
    if (removed.length > 0) {
      console.log(`[machine-paths] 基线可下调 ${removed.length} 条（本次未扫到）：`)
      for (const p of removed.slice(0, 10)) console.log(`    - ${p}`)
      if (removed.length > 10) console.log(`    … 其余 ${removed.length - 10} 条`)
    }
  }
  return 0
}

process.exit(main())
