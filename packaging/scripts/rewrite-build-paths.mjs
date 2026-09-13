#!/usr/bin/env node
/**
 * 出货面「构建机路径」改写器——与 `scan-machine-paths.mjs` 配对（ADR-0073）。
 *
 * ## 分工：一个改，一个守
 *
 * - 本脚本**改**：把暂存的出货副本里出现的构建机绝对路径换成占位符。它只改
 *   `$STAGE/.sp`（skills + presets 的暂存副本），**不动**本机的 `~/.dsh/.agent-presets`
 *   与 `~/.dsh/skills`——本机上那些路径是有用的（材料就在这台机器上）。
 * - `scan-machine-paths.mjs` **守**：出货树里含构建机路径的文件集合只减不增。
 *   它原先只扫 app 内嵌 profile，看不见 payload 里的 tarball；实测把出货 presets 解开再扫，
 *   是 103 个文件（100 个 `agt-*` 的材料出处 + `bobo-cto` + `lute-cordis`）。
 *
 * ## 语义
 *
 * - 只处理 `grep -rlFI` 认得的**文本**文件（二进制跳过，与守卫同一把尺）；
 * - 用**字面前缀替换**（不是正则匹配「一条路径」）：路径里可能含空格
 *   （`/Library/Application Support/DSH Desktop`），按分隔符切字的正则会在空格处断开，
 *   把可改的路径误判成「没覆盖的形态」；
 * - 表里没覆盖到的构建机路径 → **响亮失败**：新形态该由人来决定它是什么意思
 *   （补一条占位符，还是登记进基线），不由脚本猜；
 * - 幂等：占位符里不含构建机 home，重复运行不会二次改写。
 *
 * 用法：
 *   node packaging/scripts/rewrite-build-paths.mjs --root <dir> [--root <dir>…] [--dry-run]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 构建机 home **之后**的前缀 → 占位符。长前缀优先（改写时按长度降序）。
 *
 * 每条都写清「对客户意味着什么」，因为改写后客户看到的就是这个占位符：
 * - `__LUTE_MATERIAL_ROOT__`：岗位卡原文所在的材料仓库根（客户机上不存在，属出处信息）；
 * - `__LUTE_REPO__`：本仓库根（技能文档里的做法示例）；
 * - `__DSH_HOME__`：DSH 用户目录（客户机上是 `~/.dsh`）；
 * - `__DSH_APP_SUPPORT__`：桌面应用的支持目录（含 `runtime-commands/pnpm`）；
 * - `__BUILD_DESKTOP__`：构建机的桌面目录（技能自测报告里的样例文件路径）。
 */
const MAP = [
  ['/Library/Application Support/DSH Desktop', '__DSH_APP_SUPPORT__'],
  ['/project/Magpie-Horch', '__LUTE_REPO__'],
  ['/project/AI组织变革', '__LUTE_MATERIAL_ROOT__'],
  ['/Desktop', '__BUILD_DESKTOP__'],
  ['/.dsh', '__DSH_HOME__'],
]

/** 解析命令行（未知选项即失败）。 */
function parseArgs(argv) {
  const out = { roots: [], dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') out.roots.push(argv[++i])
    else if (a === '--dry-run') out.dryRun = true
    else throw new Error(`未知参数: ${a}`)
  }
  if (out.roots.length === 0) throw new Error('至少需要一个 --root <dir>')
  return out
}

/**
 * 把一个字符串里的构建机路径换成占位符。
 * 抽成纯函数是为了让自测能直接喂字符串，不必搭一整套假装配环境。
 * @param {string} text
 * @param {string} home 构建机 home（如 /Users/lute）
 * @returns {{text: string, hits: number}} hits = 实际改写处数
 */
export function rewriteText(text, home) {
  const table = MAP.map(([suffix, placeholder]) => [home + suffix, placeholder]).sort(
    (a, b) => b[0].length - a[0].length,
  )
  let out = text
  let hits = 0
  for (const [prefix, placeholder] of table) {
    const parts = out.split(prefix)
    if (parts.length > 1) {
      hits += parts.length - 1
      out = parts.join(placeholder)
    }
  }
  return { text: out, hits }
}

/** 列出 root 下含 needle 的文本文件（相对 root）。 */
function listHits(root, needle) {
  try {
    const stdout = execFileSync('grep', ['-rlFI', '--', needle, '.'], {
      cwd: root,
      maxBuffer: 1 << 28,
      encoding: 'utf8',
    })
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((p) => p.replace(/^\.\//, ''))
      .sort()
  } catch (err) {
    if (err.status === 1) return []
    throw new Error(`grep 扫描失败（${root}）：${err.message}`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const home = process.env.BUILD_HOME ?? homedir()
  if (!home || home === '/') throw new Error('构建机 home 解析为空——拒绝用一个空/根路径做替换')

  let files = 0
  let occurrences = 0
  for (const rawRoot of args.roots) {
    const root = resolve(rawRoot)
    if (!existsSync(root)) throw new Error(`扫描根不存在: ${root}`)
    for (const rel of listHits(root, home)) {
      const abs = join(root, rel)
      if (!statSync(abs).isFile()) continue
      const result = rewriteText(readFileSync(abs, 'utf8'), home)
      if (result.hits === 0) continue
      files += 1
      occurrences += result.hits
      if (args.dryRun) continue
      const tmp = `${abs}.rewrite-tmp`
      writeFileSync(tmp, result.text, 'utf8')
      renameSync(tmp, abs)
    }
  }
  console.log(
    `[rewrite-paths] ${args.dryRun ? '（dry-run）' : ''}改写 ${files} 个文件 / ${occurrences} 处构建机路径（${home}）`,
  )

  // 复查：表里没覆盖到的形态必须响亮失败，不能靠「大概改完了」放行
  const leftover = []
  for (const rawRoot of args.roots) {
    const root = resolve(rawRoot)
    for (const rel of listHits(root, home)) leftover.push(`${root}/${rel}`)
  }
  if (leftover.length > 0) {
    console.error(`[rewrite-paths] ✗ 仍有 ${leftover.length} 个（文本）文件含未登记的构建机路径形态：`)
    for (const p of leftover.slice(0, 20)) console.error(`    · ${p}`)
    console.error('  两种处置：① 在 rewrite-build-paths.mjs 的 MAP 里补一条前缀（写清占位符含义）；')
    console.error('            ② 确属无法改的第三方产物 → 在 packaging/machine-path-baseline.json 里登记并写明理由。')
    return 1
  }
  console.log(`[rewrite-paths] ✓ 出货副本已不含构建机路径（${home}）`)
  return 0
}

/**
 * 判断「本文件是不是被当作脚本执行的」。
 *
 * 不能只比字符串：Node 的 ESM 加载器解析符号链接后，`import.meta.url` 拿到的是 realpath，
 * 而 `process.argv[1]` 保留传入时的形式。macOS 上 `$TMPDIR` 走 `/var → /private/var`，
 * 于是 `node /var/folders/…/mutant.mjs` 会比不相等 → 判成「被 import」→ **main 不执行、
 * 进程静默退出 0**。这正是本项目最忌讳的形态：脚本什么都没做，装配却报成功。
 * 所以两侧都取 realpath；真判不出来时按「跑」处理（宁可跑，也不要静默不跑）。
 */
function isEntryPoint() {
  if (process.argv[1] === undefined) return true
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return true
  }
}

if (isEntryPoint()) {
  try {
    process.exit(main())
  } catch (error) {
    console.error(`[rewrite-paths] ✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}
