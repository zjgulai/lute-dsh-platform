#!/usr/bin/env node
/**
 * 出货技能面选择器（现算，不存清单）。
 *
 * ## 为什么需要它
 *
 * `assemble.sh` 原本把整个 `~/.dsh/skills`（实测 **1611** 个目录、66M）拷进
 * `skills-presets.tar.gz` 发给客户。其中：
 *   · `p2s-*` 语料 1338 个，**989 个未被任何 preset 或仓库映射引用**；
 *   · 另有 78 个非 p2s 技能同样未被引用；
 *   · 并含**许可受限**技能（`lieflat-charts` = PolyForm Noncommercial 1.0.0，禁商用）。
 * 客户看到的是 1600+ 张技能卡，其中大部分是评估语料；而把非商用许可的技能发给客户
 * 是明确的合规风险。决策：**只发「被引用集 + 产品必需白名单」，剔除受限许可**（K5/K6）。
 *
 * ## 为什么不存一份白名单文件
 *
 * 存清单 = 第二份事实（ADR-0009）：preset 一改、技能一加，清单就漂移，而漂移是静默的。
 * 所以这里**每次打包现算**：从 preset 组合 + 仓库映射里取「被引用」，再减去受限许可。
 * 结果只打印与写进 completeness.json，不作为可编辑的输入。
 *
 * ## 用法
 *
 *   node packaging/scripts/select-skills.mjs --report                      # 只打印统计
 *   node packaging/scripts/select-skills.mjs --copy <src> <dst>            # 按选择结果拷贝
 *   node packaging/scripts/select-skills.mjs --check <dir>                 # 校验某树里不该有受限技能
 *   DSH_HOME=<dir> PRESET_ROOT=<dir> SKILLS_ROOT=<dir> 可覆盖默认根
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
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

/** 仓库侧的映射文件（技能被谁引用的第二类证据：岗位接线表与出海技能目录）。 */
const REPO_MAPS = [
  'scripts/role-presets/skill-map.json',
  'packages/capabilities/dsh-overseas-skills/manifest/skills.json',
]

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

/** 计算出货集合。 */
function computeSelection() {
  const own = listSkills(SKILLS_ROOT)
  const agents = listSkills(AGENTS_SKILLS)
  const all = [...new Set([...own, ...agents])].sort()
  const refs = referencedSet(all)
  const dl = denylist()
  const denied = new Map((dl.entries ?? []).map((e) => [e.name, e.reason]))
  const selected = all.filter((s) => refs.has(s) && !denied.has(s))
  const droppedUnreferenced = all.filter((s) => !refs.has(s))
  const droppedDenied = all.filter((s) => denied.has(s))
  return { own, agents, all, refs, selected, droppedUnreferenced, droppedDenied, denylist: dl }
}

function main() {
  const argv = process.argv.slice(2)
  const mode = argv[0]
  const sel = computeSelection()

  if (mode === '--check') {
    // 校验一棵已落位的技能树里没有受限技能（打包后自检 / 客户机排查都能用）
    const dir = resolve(argv[1] ?? '.')
    const present = listSkills(dir)
    const bad = present.filter((s) => sel.denylist.entries?.some((e) => e.name === s))
    if (bad.length > 0) {
      console.error(`[skills] ✗ 该树含受限许可技能：${bad.map((b) => `${b}（${sel.denylist.entries.find((e) => e.name === b).reason}）`).join('; ')}`)
      return 1
    }
    console.log(`[skills] ✓ 无受限许可技能（共 ${present.length} 个）`)
    return 0
  }

  if (mode === '--copy') {
    // 两个根（本机 + 官方）都按同一份选择结果拷贝：选择集是并集算出来的，
    // 所以这里逐根找源、同落一个目标目录（不 wipe 两次）。
    const dst = resolve(argv[1] ?? '')
    if (!argv[1]) {
      console.error('[skills] 用法: --copy <dst-root>（源根用 SKILLS_ROOT / AGENTS_SKILLS 覆盖）')
      return 2
    }
    rmSync(dst, { recursive: true, force: true })
    mkdirSync(dst, { recursive: true })
    let copied = 0
    for (const name of sel.selected) {
      const from = [join(SKILLS_ROOT, name), join(AGENTS_SKILLS, name)].find((p) => existsSync(p))
      if (!from) continue
      cpSync(from, join(dst, name), { recursive: true })
      copied += 1
    }
    console.log(
      `[skills] 已拷贝 ${copied} 个到 ${dst}（源 ${sel.all.length} = 本机 ${sel.own.length} + 官方 ${sel.agents.length}；` +
        `剔除未引用 ${sel.droppedUnreferenced.length}、受限许可 ${sel.droppedDenied.length}）`,
    )
    return 0
  }

  console.log('[skills] 出货技能面（现算，非清单）：')
  console.log(`  候选合计 ${sel.all.length}（本机 ~/.dsh/skills ${sel.own.length} + 官方 ~/.agents/skills ${sel.agents.length}）`)
  console.log(`  被引用   ${sel.refs.size}`)
  console.log(`  受限许可 ${sel.droppedDenied.length}${sel.droppedDenied.length ? `：${sel.droppedDenied.join(', ')}` : ''}`)
  console.log(`  未引用剔除 ${sel.droppedUnreferenced.length}（其中 p2s-* ${sel.droppedUnreferenced.filter((s) => s.startsWith('p2s-')).length}）`)
  console.log(`  ★ 实际出货 ${sel.selected.length}`)
  if (sel.denylist.missing) console.warn(`  ⚠ 受限许可名单缺失：${sel.denylist.missing}（按“无受限技能”处理——请补上）`)
  return 0
}

process.exit(main())
