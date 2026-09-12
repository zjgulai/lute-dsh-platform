/**
 * eval · 共享装载与判据
 *
 * L6/L7 实验只读真实产物：安装好的 ~/.dsh/skills 下 p2s- 前缀技能的 SKILL.md、
 * 50 个岗位 preset 的 skill-subset 名单、data/classification.json、
 * generated/coverage.json。不重新推导任何事实——读到的就是线上跑的。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PKG = join(HERE, '..', '..')
export const REPO = join(PKG, '..', '..', '..')
export const EVAL_OUT = join(PKG, 'eval', 'out')
export const SKILLS_ROOT = process.env.P2S_SKILLS_ROOT || join(homedir(), '.dsh', 'skills')
export const PRESET_ROOT = process.env.ROLE_PRESET_OUT || join(homedir(), '.dsh', '.agent-presets')

/** 宽容的 frontmatter 解析：值一律 JSON 引号化或裸串。 */
export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!m) return { fm: {}, body: text }
  const fm = {}
  for (const line of m[1].split('\n')) {
    const mm = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line)
    if (!mm) continue
    const raw = mm[2]
    if (raw.startsWith('"')) {
      try { fm[mm[1]] = JSON.parse(raw); continue } catch { /* 裸串兜底 */ }
    }
    fm[mm[1]] = raw
  }
  return { fm, body: text.slice(m[0].length) }
}

/** 取正文里的一个 `## <name>` 小节（到下一个 `## ` 为止）。 */
export function section(body, name) {
  const re = new RegExp(`^##\\s+${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'm')
  const m = re.exec(body)
  if (!m) return ''
  const rest = body.slice(m.index + m[0].length)
  const next = rest.search(/^##\s+/m)
  return (next === -1 ? rest : rest.slice(0, next)).trim()
}

/** 全部已安装的 p2s-* 技能 → { slug: {…frontmatter, body, sections} } */
export function loadInstalledSkills() {
  const out = new Map()
  for (const name of readdirSync(SKILLS_ROOT)) {
    if (!name.startsWith('p2s-')) continue
    const p = join(SKILLS_ROOT, name, 'SKILL.md')
    if (!existsSync(p)) continue
    const { fm, body } = parseFrontmatter(readFileSync(p, 'utf8'))
    out.set(name, {
      slug: name,
      fm,
      body,
      sec: {
        problem: section(body, '① 解决的问题'),
        algo: section(body, '② 核心算法逻辑'),
        scenario: section(body, '③ 业务应用场景'),
        roi: section(body, '⑥ 业务价值 / ROI'),
        contract: section(body, '输入 / 输出契约'),
        steps: section(body, '执行步骤'),
        bounds: section(body, '边界与不做'),
      },
    })
  }
  return out
}

/** 50 个岗位 preset → { agt-00X: { skills: string[], p2s: string[], others: string[] } } */
export function loadPresets() {
  const out = new Map()
  if (!existsSync(PRESET_ROOT)) return out
  for (const dir of readdirSync(PRESET_ROOT)) {
    if (!/^agt-\d{3}$/.test(dir)) continue
    const p = join(PRESET_ROOT, dir, 'agent.cordis.yml')
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    const m = /id:\s*skill-subset[\s\S]*?skills:\s*\[([\s\S]*?)\]/.exec(text)
    if (!m) { out.set(dir, { skills: [], p2s: [], others: [] }); continue }
    const skills = [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2])
    out.set(dir, {
      skills,
      p2s: skills.filter((s) => s.startsWith('p2s-')),
      others: skills.filter((s) => !s.startsWith('p2s-')),
    })
  }
  return out
}

export function loadJson(rel) {
  return JSON.parse(readFileSync(join(PKG, rel), 'utf8'))
}

/** "AGT-047 接桥" → "agt-047" */
export function roleToPreset(role) {
  const m = /^(AGT-\d{3})/.exec(String(role || ''))
  return m ? m[1].toLowerCase() : null
}

/**
 * 触发词抽取：description 的 `触发词：A、B、C。` 段。
 * 返回小写化的词条数组（去空白）。
 */
export function triggersOf(description) {
  const m = /触发词[：:]\s*([^。]*)/.exec(description || '')
  if (!m) return []
  return m[1]
    .split(/[、,，/／|]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2)
}

/** `何时不用：… 用「Y」…` 里点名的兄弟技能中文名 */
export function negationTargetsOf(description) {
  const m = /何时不用[：:]\s*([^。]*)/.exec(description || '')
  if (!m) return []
  return [...m[1].matchAll(/[「『]([^」』]+)[」』]/g)].map((x) => x[1].trim()).filter(Boolean)
}

/** 确定性 PRNG（mulberry32）：抽样可复现。 */
export function rng(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}
