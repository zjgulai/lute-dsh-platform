#!/usr/bin/env node
/**
 * 出货预设选择器（白名单）——ADR-0073。
 *
 * ## 为什么需要它
 *
 * 2026-09-13 实测：出货 DMG 的 `skills-presets.tar.gz` 里含 `presets/bobo-cto/`（本机自有的
 * 机器人助理智能体预设，材料根 `/Users/lute/project/BoBo`），`completeness.json` 的 presets
 * 是 52 条 = 50 个 `agt-*` + `bobo-cto` + `lute-cordis`。来源不是谁的决定，而是这一行：
 *
 *     cp -R "$DSH_HOME_DIR/.agent-presets/." "$SP/presets/"
 *
 * 打包源是**开发机的运行时状态**，谁在这台机器上新建一个预设，它就会随下一版出给客户——
 * 静默、无日志、无读数。装配脚本自己早就写下过这个风险（「打包源 = 本机 live profile +
 * ~/.dsh/.agent-presets，它们是开发机的运行时状态」），但当时只防了「外部产品挂载」，
 * 没有防「多出一个 preset 目录」。**边界要用机制守，不能用纪律守。**
 *
 * ## 语义（只减不增的姊妹条款：这里用白名单 + 响亮失败）
 *
 * - `pattern` 命中的目录（岗位预设）出货，且数量必须等于 `expectPatternCount`（少了也失败：
 *   悄无声息地少发一个岗位，同样没人会发现）；
 * - `allow` 里显式登记（每条必须有非空 `why`）的目录出货；
 * - **其余任何目录** → 打印清单并 `exit 1`。出路有两条：把该目录从本机移走，或在
 *   `packaging/shipped-presets.json` 里登记并写明理由；
 * - `allow` 里登记了、但本机不存在 → 也 `exit 1`（登记与实际不符的名单会腐烂成谎话）。
 *
 * 用法：
 *   node packaging/scripts/select-presets.mjs --from <~/.dsh/.agent-presets> \
 *        --into <暂存 presets 目录> --config packaging/shipped-presets.json
 */
import { cpSync, existsSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 解析命令行（未知选项即失败，不静默吞）。 */
function parseArgs(argv) {
  const out = { from: undefined, into: undefined, config: undefined, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') out.from = argv[++i]
    else if (a === '--into') out.into = argv[++i]
    else if (a === '--config') out.config = argv[++i]
    else if (a === '--quiet') out.quiet = true
    else throw new Error(`未知参数: ${a}`)
  }
  for (const key of ['from', 'into', 'config']) {
    if (!out[key]) throw new Error(`缺少必需参数 --${key}`)
  }
  return out
}

/** 读并校验白名单配置。配置本身也要能被判否：pattern 编译不了、why 为空都算坏输入。 */
export function readConfig(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof raw.pattern !== 'string' || raw.pattern.length === 0) {
    throw new Error('配置缺少 pattern（岗位预设的目录名正则）')
  }
  const pattern = new RegExp(raw.pattern)
  if (!Number.isInteger(raw.expectPatternCount) || raw.expectPatternCount <= 0) {
    throw new Error('配置缺少 expectPatternCount（正整数）：没有它就发现不了「少发一个岗位」')
  }
  const allow = Array.isArray(raw.allow) ? raw.allow : []
  for (const entry of allow) {
    if (typeof entry?.name !== 'string' || entry.name.length === 0) {
      throw new Error('allow 条目缺少 name')
    }
    if (typeof entry?.why !== 'string' || entry.why.trim().length === 0) {
      throw new Error(`allow 条目 "${entry.name}" 缺少 why——登记而不写理由的名单会腐烂成谎话`)
    }
  }
  return { pattern, expectPatternCount: raw.expectPatternCount, allow }
}

/**
 * 纯判定：把磁盘上的目录名分成「出货 / 未登记」两拨，并算出各种不一致。
 * 抽成纯函数是为了让自测能直接喂坏输入，不必搭一整套假装配环境。
 * @param {string[]} names 磁盘上实际存在的预设目录名
 * @param {{pattern: RegExp, expectPatternCount: number, allow: {name: string}[]}} config
 */
export function classify(names, config) {
  const dirs = [...names].sort()
  const matched = dirs.filter((n) => config.pattern.test(n))
  const allowed = new Set(config.allow.map((e) => e.name))
  const allowedFound = config.allow.map((e) => e.name).filter((n) => dirs.includes(n))
  const unregistered = dirs.filter((n) => !config.pattern.test(n) && !allowed.has(n))
  const missingAllowed = config.allow.map((e) => e.name).filter((n) => !dirs.includes(n))
  return {
    ship: dirs.filter((n) => config.pattern.test(n) || allowed.has(n)),
    unregistered,
    missingAllowed,
    patternCount: matched.length,
    patternCountOk: matched.length === config.expectPatternCount,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const from = resolve(args.from)
  const into = resolve(args.into)
  if (!existsSync(from)) throw new Error(`源目录不存在: ${from}`)
  const config = readConfig(resolve(args.config))

  const names = readdirSync(from, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(from, e.name, 'agent.cordis.yml')))
    .map((e) => e.name)
  const verdict = classify(names, config)

  const problems = []
  if (verdict.unregistered.length > 0) {
    problems.push(
      `本机有 ${verdict.unregistered.length} 个未登记的预设目录，拒绝打包（它们会静默出给客户）：\n` +
        verdict.unregistered.map((n) => `    · ${n}`).join('\n') +
        `\n  出路二选一：① 从 ${from} 移走；② 在 packaging/shipped-presets.json 的 allow 里登记并写明 why。`,
    )
  }
  if (verdict.missingAllowed.length > 0) {
    problems.push(
      `白名单登记了但本机不存在：${verdict.missingAllowed.join('、')}——登记与实际不符，先对齐（要么补回目录，要么删掉登记）。`,
    )
  }
  if (!verdict.patternCountOk) {
    problems.push(
      `岗位预设数量不符：实际 ${verdict.patternCount} 个命中 ${config.pattern}，配置期望 ${config.expectPatternCount} 个。` +
        `少发一个岗位同样是静默事故，故这里判红。`,
    )
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`[presets] ✗ ${p}`)
    return 1
  }

  rmSync(into, { recursive: true, force: true })
  for (const name of verdict.ship) {
    const src = join(from, name)
    if (!statSync(src).isDirectory()) continue
    cpSync(src, join(into, name), { recursive: true })
  }
  if (!args.quiet) {
    console.log(
      `[presets] ✓ 出货 ${verdict.ship.length} 个预设（岗位 ${verdict.patternCount} 个 + 登记 ${config.allow.length} 个：` +
        `${config.allow.map((e) => e.name).join('、') || '无'}）；本机其余 ${verdict.unregistered.length} 个目录不在出货面`,
    )
  }
  return 0
}

/**
 * 判断「本文件是不是被当作脚本执行的」。
 *
 * 不能只比字符串：Node 的 ESM 加载器解析符号链接后，`import.meta.url` 拿到的是 realpath，
 * 而 `process.argv[1]` 保留传入时的形式。macOS 上 `$TMPDIR` 走 `/var → /private/var`，
 * 于是 `node /var/folders/…/副本.mjs` 会比不相等 → 判成「被 import」→ **main 不执行、
 * 进程静默退出 0**（= 一个预设都不挑，装配却报成功）。两侧都取 realpath；
 * 真判不出来时按「跑」处理。
 */
function isEntryPoint() {
  if (process.argv[1] === undefined) return true
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return true
  }
}

// 作为脚本运行时才执行 main（被自测 import 时不执行）
if (isEntryPoint()) {
  try {
    process.exit(main())
  } catch (error) {
    console.error(`[presets] ✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}
