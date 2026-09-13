#!/usr/bin/env node
/**
 * 出货技能面选择器（引用集现算 + 产品级白名单）。
 *
 * ## 为什么需要它
 *
 * `assemble.sh` 原本把整个 `~/.dsh/skills`（实测 **1611** 个目录、66M）拷进
 * `skills-presets.tar.gz` 发给客户。其中：
 *   · `p2s-*` 语料 1338 个，**989 个未被任何 preset 或仓库映射引用**；
 *   · 另有 78 个非 p2s 技能同样未被引用；
 *   · 并含**许可受限**技能（`lieflat-charts` = PolyForm Noncommercial 1.0.0，禁商用）。
 * 客户看到的是 1600+ 张技能卡，其中大部分是评估语料；而把非商用许可的技能发给客户
 * 是明确的合规风险。决策：**只发「被引用集 ∪ 产品级白名单」，再减受限许可**（K5/K6）。
 *
 * ## 为什么不存「全量清单」，却存一份「产品级白名单」（ADR-0074）
 *
 * 全量清单 = 第二份事实（ADR-0009）：preset 一改、技能一加，清单就漂移，而漂移是静默的。
 * 所以引用集**每次打包现算**，不作为可编辑的输入。
 *
 * 但**引用集只回答「谁引用了它」，回答不了「产品要不要发它」**。2026-09-13 实测：
 * 本机自有的机器人助理智能体预设 `bobo-cto` 被排除出出货面（ADR-0073）后，它引用的
 * **15 个工程技能一并掉出（349 → 334）**——它们从来没有被产品显式要过，只是被顺带引用。
 * 而同族的工程工艺技能（`tdd` / `to-spec` / `to-tickets` / `write-spec` / `prototype` /
 * `research`，挂在 agt-009/012/013/048）本来就在出货面里，于是产品拿到的是**一半工艺层**。
 * 那不是任何人决定的结果，只是引用图恰好长成那样。
 *
 * 所以增量地存一份**产品意图**（`packaging/shipped-skills.json`）：它不是引用图的副本
 * （那会漂移），而是引用图之外的一次可评审表态。它自己的防腐烂判据：
 *   · 登记的名字在本机候选集里不存在 → 中止（登记与实际不符的名单会腐烂成谎话）；
 *   · 登记的名字同时命中受限许可名单 → 中止（「要发」与「禁发」是两个相反结论）；
 *   · 每次装配都打印「本名单救回了几个（未被引用）/ 其中几个是冗余（已被引用）」——
 *     冗余是正常状态（产品要发 + 岗位也在用），但它必须可见，否则名单会烂在原地。
 *
 * ## 用法
 *
 *   node packaging/scripts/select-skills.mjs --report                     # 只打印统计
 *   node packaging/scripts/select-skills.mjs --copy <dst-root>            # 按选择结果拷贝
 *   node packaging/scripts/select-skills.mjs --check <dir>                # 校验某树 ≡ 选择结果、且无受限技能
 *   --config <path>  产品级白名单（默认 packaging/shipped-skills.json；缺文件即失败）
 *   DSH_HOME=<dir> PRESET_ROOT=<dir> SKILLS_ROOT=<dir> AGENTS_SKILLS=<dir> 可覆盖默认根
 *
 * 退出码：0 = 通过；1 = 判据判否（见上面的 problems）；2 = 参数/配置本身是坏输入。
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const SKILLS_ROOT = process.env.SKILLS_ROOT ?? join(DSH_HOME, 'skills')
const AGENTS_SKILLS = process.env.AGENTS_SKILLS ?? join(homedir(), '.agents', 'skills')
const PRESET_ROOT = process.env.PRESET_ROOT ?? join(DSH_HOME, '.agent-presets')
const DENYLIST_PATH = join(REPO, 'packaging', 'skills-denylist.json')
const ALLOWLIST_PATH = join(REPO, 'packaging', 'shipped-skills.json')

/** 仓库侧的映射文件（技能被谁引用的第二类证据：岗位接线表与出海技能目录）。 */
const REPO_MAPS = [
  'scripts/role-presets/skill-map.json',
  'packages/capabilities/dsh-overseas-skills/manifest/skills.json',
]

/** 解析命令行（未知选项即失败，不静默吞）。 */
function parseArgs(argv) {
  let mode
  let target
  let config = ALLOWLIST_PATH
  let quiet = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--report' || a === '--copy' || a === '--check') mode = a
    else if (a === '--config') config = argv[++i]
    else if (a === '--quiet') quiet = true
    else if (a.startsWith('--')) throw new Error(`未知参数: ${a}`)
    else if (target === undefined) target = a
    else throw new Error(`多余的位置参数: ${a}（--copy/--check 只收一个目录）`)
  }
  if (mode === undefined) mode = '--report'
  if (mode !== '--report' && !target) throw new Error(`${mode} 缺少目录参数`)
  if (config === undefined) throw new Error('--config 缺少路径')
  return { mode, target, config: resolve(config), quiet }
}

/** 最小技能目录：有 SKILL.md 才算技能（与技能中心的判据一致）。 */
function isSkillDir(dir) {
  return existsSync(join(dir, 'package.json')) === false && existsSync(join(dir, 'SKILL.md'))
}

/** 列出一个根下的技能名（只取目录且含 SKILL.md）。 */
function listSkills(root) {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => {
      const p = join(root, name)
      return statSync(p).isDirectory() && isSkillDir(p)
    })
    .sort()
}

/** 现算「被引用集」：preset 组合 / manifest + 仓库映射文件里出现过的技能名。 */
function referencedSet(allSkills) {
  const haystacks = []
  if (existsSync(PRESET_ROOT)) {
    for (const preset of readdirSync(PRESET_ROOT)) {
      for (const f of ['manifest.json', 'agent.cordis.yml', 'preset.yml']) {
        const p = join(PRESET_ROOT, preset, f)
        if (existsSync(p)) haystacks.push(readFileSync(p, 'utf8'))
      }
    }
  }
  for (const rel of REPO_MAPS) {
    const p = join(REPO, rel)
    if (existsSync(p)) haystacks.push(readFileSync(p, 'utf8'))
  }
  const refs = new Set()
  const joined = haystacks.join('\n')
  for (const skill of allSkills) {
    // 词边界匹配，避免 `foo` 命中 `foo-bar`
    if (new RegExp(`(^|[^\\w-])${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`, 'm').test(joined)) {
      refs.add(skill)
    }
  }
  return refs
}

/** 读受限许可名单（人工维护，带理由；条目必须显式指向技能名）。 */
function denylist() {
  if (!existsSync(DENYLIST_PATH)) return { entries: [], missing: DENYLIST_PATH }
  return JSON.parse(readFileSync(DENYLIST_PATH, 'utf8'))
}

/**
 * 读并校验产品级白名单。
 *
 * 文件**必须存在**：缺文件时按「没有白名单」继续，会把 15 个技能静默地少发出去，
 * 而那正是这份名单存在的理由——所以缺文件 = 坏输入（rc=2），不是「等于空名单」。
 * 每条必须写 `why`：登记而不写理由的名单，过一版就没人敢删了。
 */
function readAllowlist(path) {
  if (!existsSync(path)) {
    throw new Error(`产品级技能白名单不存在: ${path}（缺了它，白名单里的技能会被静默少发）`)
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const allow = Array.isArray(raw.allow) ? raw.allow : []
  const seen = new Set()
  for (const entry of allow) {
    if (typeof entry?.name !== 'string' || entry.name.length === 0) {
      throw new Error('allow 条目缺少 name')
    }
    if (typeof entry?.why !== 'string' || entry.why.trim().length === 0) {
      throw new Error(`allow 条目 "${entry.name}" 缺少 why——登记而不写理由的名单会腐烂成谎话`)
    }
    if (seen.has(entry.name)) throw new Error(`allow 里 "${entry.name}" 重复登记`)
    seen.add(entry.name)
  }
  return { allow }
}

/**
 * 计算出货集合。
 *
 * 语义：`selected = (被引用 ∪ 白名单) − 受限许可`。
 * 引用集**读的是调用方给的 PRESET_ROOT**——装配时传入的是**剥离后的出货 preset 副本**
 * （`$SP/presets`），不是本机 `~/.dsh/.agent-presets`：本机预设可能挂着外部产品行，
 * 读本机会让「被引用」把客户机上根本不存在的技能算进来。
 */
function computeSelection(allowCfg) {
  const own = listSkills(SKILLS_ROOT)
  const agents = listSkills(AGENTS_SKILLS)
  const all = [...new Set([...own, ...agents])].sort()
  const allSet = new Set(all)
  const refs = referencedSet(all)
  const dl = denylist()
  const denied = new Map((dl.entries ?? []).map((e) => [e.name, e.reason]))

  const allowNames = allowCfg.allow.map((e) => e.name)
  const selected = all.filter((s) => (refs.has(s) || allowNames.includes(s)) && !denied.has(s))

  return {
    own,
    agents,
    all,
    refs,
    selected,
    denied,
    denylist: dl,
    allowCfg,
    // 白名单实际救回来的（未被任何 preset / 仓库映射引用，只因产品表态而出货）
    orphanAllowed: allowNames.filter((n) => allSet.has(n) && !refs.has(n)),
    // 冗余条目：已被引用图覆盖。不是错误（产品要发 + 岗位也在用），但必须可见。
    redundantAllowed: allowNames.filter((n) => allSet.has(n) && refs.has(n)),
    // 登记了但本机没有 = 名单在说谎
    missingAllowed: allowNames.filter((n) => !allSet.has(n)),
    // 同时被要求「发」与「禁发」
    conflictDenied: allowNames.filter((n) => denied.has(n)),
    droppedUnreferenced: all.filter((s) => !refs.has(s) && !allowNames.includes(s)),
    droppedDenied: all.filter((s) => denied.has(s)),
  }
}

/** 判否项（rc=1）：都是「选择结果与登记不符」，必须让人看见并表态。 */
function selectionProblems(sel) {
  const problems = []
  if (sel.missingAllowed.length > 0) {
    problems.push(
      `白名单登记了但本机候选集里不存在：${sel.missingAllowed.join('、')}——` +
        `登记与实际不符，先对齐（要么把技能装回来，要么删掉登记）。`,
    )
  }
  if (sel.conflictDenied.length > 0) {
    problems.push(
      `白名单要求出货、受限许可名单禁止出货，同名冲突：` +
        sel.conflictDenied.map((n) => `${n}（${sel.denied.get(n)}）`).join('；') +
        `——同一件事两个相反结论，先删一个。`,
    )
  }
  return problems
}

/**
 * 白名单的两条读数——**装配时（--copy）与盘点时（--report）都要打印**。
 * 「救回了几条」是这份名单存在的全部意义；「几条已是冗余」是它的腐烂信号
 * （岗位接线改过之后，条目可能已经不再做任何事，该复核甚至删掉）。
 * 只在 --report 里打印过一次的读数，装配时没人看得见，等于没有。
 */
function reportAllowlist(sel) {
  console.log(
    `[skills] · 产品级白名单 ${sel.allowCfg.allow.length} 条，其中救回未被引用 ${sel.orphanAllowed.length} 条：` +
      `${sel.orphanAllowed.join('、') || '无'}`,
  )
  if (sel.redundantAllowed.length > 0) {
    console.log(
      `[skills] · 其中 ${sel.redundantAllowed.length} 条已被引用图覆盖（冗余但合法，提示复核）：${sel.redundantAllowed.join('、')}`,
    )
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const sel = computeSelection(readAllowlist(args.config))
  const problems = selectionProblems(sel)

  if (args.mode === '--check') {
    // 校验一棵已落位的技能树：① 不含受限技能；② **逐名等于**本次选择结果。
    // ② 是 2026-09-13 加的：选择说发 N 个、树里只有 N-1 个，原先没有任何判据会发现
    // ——而「静默少发」和「静默多发」是同一类事故。
    const dir = resolve(args.target)
    const present = listSkills(dir)
    const bad = present.filter((s) => sel.denied.has(s))
    if (bad.length > 0) {
      problems.push(
        `该树含受限许可技能：${bad.map((b) => `${b}（${sel.denied.get(b)}）`).join('; ')}`,
      )
    }
    const presentSet = new Set(present)
    const selectedSet = new Set(sel.selected)
    const extra = present.filter((s) => !selectedSet.has(s))
    const missing = sel.selected.filter((s) => !presentSet.has(s))
    if (missing.length > 0) {
      problems.push(
        `选择结果里有 ${missing.length} 个技能没有落位（选择说发、树里没有 = 静默少发）：` +
          `${missing.slice(0, 12).join('、')}${missing.length > 12 ? ' …' : ''}`,
      )
    }
    if (extra.length > 0) {
      problems.push(
        `该树里有 ${extra.length} 个技能不在本次选择结果里（多出来的东西没有任何判据要它）：` +
          `${extra.slice(0, 12).join('、')}${extra.length > 12 ? ' …' : ''}`,
      )
    }
    if (problems.length > 0) {
      for (const p of problems) console.error(`[skills] ✗ ${p}`)
      return 1
    }
    if (!args.quiet) {
      console.log(`[skills] ✓ 落位技能树 ≡ 选择结果（${present.length} 个），且无受限许可技能`)
    }
    return 0
  }

  if (args.mode === '--copy') {
    if (problems.length > 0) {
      for (const p of problems) console.error(`[skills] ✗ ${p}`)
      return 1
    }
    // 两个根（本机 + 官方）都按同一份选择结果拷贝：选择集是并集算出来的，
    // 所以这里逐根找源、同落一个目标目录（不 wipe 两次）。
    // 源找不到就中止，不 `continue`——选择结果里的每个名字都必然来自这两个根，
    // 找不到只可能意味着打包期间源被改动；静默跳过等于少发给客户而无人得知。
    const dst = resolve(args.target)
    const sources = new Map()
    const vanished = []
    for (const name of sel.selected) {
      const from = [join(SKILLS_ROOT, name), join(AGENTS_SKILLS, name)].find((p) => existsSync(p))
      if (!from) vanished.push(name)
      else sources.set(name, from)
    }
    if (vanished.length > 0) {
      console.error(
        `[skills] ✗ 选择结果里的 ${vanished.length} 个技能在源根里找不到了（打包期间源被改动？）：` +
          `${vanished.join('、')}——中止，不静默少发。`,
      )
      return 1
    }
    rmSync(dst, { recursive: true, force: true })
    mkdirSync(dst, { recursive: true })
    for (const [name, from] of sources) cpSync(from, join(dst, name), { recursive: true })
    if (!args.quiet) {
      console.log(
        `[skills] 已拷贝 ${sources.size} 个到 ${dst}（源 ${sel.all.length} = 本机 ${sel.own.length} + 官方 ${sel.agents.length}；` +
          `剔除未引用 ${sel.droppedUnreferenced.length}、受限许可 ${sel.droppedDenied.length}）`,
      )
      reportAllowlist(sel)
    }
    return 0
  }

  console.log('[skills] 出货技能面（引用集现算 + 产品级白名单）：')
  console.log(`  候选合计 ${sel.all.length}（本机 ${SKILLS_ROOT} ${sel.own.length} + 官方 ${AGENTS_SKILLS} ${sel.agents.length}）`)
  console.log(`  被引用   ${sel.refs.size}（读 ${PRESET_ROOT} + ${REPO_MAPS.length} 份仓库映射）`)
  reportAllowlist(sel)
  console.log(`  受限许可 ${sel.droppedDenied.length}${sel.droppedDenied.length ? `：${[...sel.denied.keys()].join(', ')}` : ''}`)
  console.log(`  未引用剔除 ${sel.droppedUnreferenced.length}（其中 p2s-* ${sel.droppedUnreferenced.filter((s) => s.startsWith('p2s-')).length}）`)
  console.log(`  ★ 实际出货 ${sel.selected.length}`)
  if (sel.denylist.missing) console.warn(`  ⚠ 受限许可名单缺失：${sel.denylist.missing}（按“无受限技能”处理——请补上）`)
  if (problems.length > 0) {
    for (const p of problems) console.error(`[skills] ✗ ${p}`)
    return 1
  }
  return 0
}

/**
 * 判断「本文件是不是被当作脚本执行的」。
 *
 * 不能只比字符串：Node 的 ESM 加载器解析符号链接后，`import.meta.url` 拿到的是 realpath，
 * 而 `process.argv[1]` 保留传入时的形式。macOS 上 `$TMPDIR` 走 `/var → /private/var`，
 * 于是 `node /var/folders/…/副本.mjs` 会比不相等 → 判成「被 import」→ **main 不执行、
 * 进程静默退出 0**（= 一个技能都不挑，装配却报成功）。两侧都取 realpath；
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

if (isEntryPoint()) {
  try {
    process.exit(main())
  } catch (error) {
    console.error(`[skills] ✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}
