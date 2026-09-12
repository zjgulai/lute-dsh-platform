#!/usr/bin/env node
/**
 * import-paper2skills.mjs — 把 staging 里的论文技能装配进 ~/.dsh/skills/。
 *
 * 数据流：
 *   staging/<L2 责任域>/<slug>/SKILL.md  （+ references/ 长代码）
 *     -> ~/.dsh/skills/<slug>/            （A/B 覆盖保留开关；C 新建默认关模型调用）
 *     -> manifest/paper2skills.json       （4面/8域/L3 三级目录 + 技能行）
 *     -> staging/import-report.json
 *
 * 用法：
 *   node scripts/import-paper2skills.mjs --dry      只生成 staging 报告，不落 ~/.dsh/skills
 *   node scripts/import-paper2skills.mjs            真装
 *   P2S_STAGING=<目录> node scripts/import-paper2skills.mjs
 *
 * 纪律（沿用 81-Skills 实战教训）：
 *  - staging 为空 → 响亮失败（exit 1），不允许「0 个技能成功结束」把问题伪装成无事发生。
 *  - 覆盖已存在技能时**保留**其 disable-model-invocation / user-invocable / workflow / whenToUse 行。
 *  - 新建技能一律 O1 默认：disable-model-invocation: true（不进全局模型目录）、user-invocable: true。
 *  - 任何 frontmatter 非法项计入 problems 并 exit 1。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTaxonomy, NAME_RE, MAX_DESC } from '../lib/taxonomy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const STAGING = process.env.P2S_STAGING || path.join(ROOT, 'staging')
const SKILLS_DIR = process.env.P2S_SKILLS_OUT || path.join(process.env.HOME || '', '.dsh', 'skills')
const MANIFEST = path.join(ROOT, 'manifest', 'paper2skills.json')
const DRY = process.argv.includes('--dry')
const KEEP_KEYS = ['disable-model-invocation', 'user-invocable', 'workflow', 'whenToUse']

/** 递归找出 staging 下所有 <slug>/SKILL.md */
function findSkillDirs(dir) {
  /** @type {string[]} */
  const out = []
  /** @param {string} d */
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const p = path.join(d, e.name)
      if (fs.existsSync(path.join(p, 'SKILL.md'))) out.push(p)
      else walk(p)
    }
  }
  walk(dir)
  return out
}

const jstr = (/** @type {string} */ v) => JSON.stringify(v)

/** 从已装文件里取要保留的开关行 */
function readCurrentKeepLines(name) {
  const p = path.join(SKILLS_DIR, name, 'SKILL.md')
  if (!fs.existsSync(p)) return { lines: /** @type {string[]} */ ([]), exists: false }
  const text = fs.readFileSync(p, 'utf8')
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return { lines: [], exists: true }
  const lines = m[1].split(/\r?\n/).filter((l) => KEEP_KEYS.some((k) => l.startsWith(`${k}:`)))
  return { lines, exists: true }
}

function validateFrontmatter(text, name, problems) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) {
    problems.push(`${name}: 无 frontmatter`)
    return {}
  }
  const fm = m[1]
  /** @type {Record<string,string>} */
  const fields = {}
  if (!NAME_RE.test(name)) problems.push(`${name}: name 非法（须匹配 ^[a-z0-9]+(-[a-z0-9]+)*$）`)
  for (const line of fm.split(/\r?\n/)) {
    if (!line.trim()) continue
    const mm = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!mm) {
      problems.push(`${name}: 非法 frontmatter 行 → ${line.slice(0, 60)}`)
      continue
    }
    const key = mm[1]
    const val = mm[2].trim()
    const isJsonStr = val.length >= 2 && val.startsWith('"') && val.endsWith('"')
    const isBool = val === 'true' || val === 'false'
    if (!isJsonStr && !isBool) problems.push(`${name}: ${key} 的值未 JSON 引号化 → ${line.slice(0, 60)}`)
    fields[key] = isJsonStr ? val.slice(1, -1) : val
  }
  if (fields['disable-model-invocation'] !== 'true') {
    problems.push(`${name}: disable-model-invocation 必须是 true（O1 默认：不进全局模型目录）`)
  }
  if (fields.name !== undefined && fields.name !== name) {
    problems.push(`${name}: frontmatter name「${fields.name}」与目录名不一致`)
  }
  if (fields.description !== undefined && fields.description.length > MAX_DESC) {
    problems.push(`${name}: description 长度 ${fields.description.length} > ${MAX_DESC}`)
  }
  return fields
}

function main() {
  const tax = loadTaxonomy()
  const l3ToL2 = new Map(tax.l3.map((e) => [e.name, { plane: e.plane, domain: e.domain, role: e.role_id }]))

  if (!fs.existsSync(STAGING)) {
    console.error(`[import-paper2skills] staging 不存在: ${STAGING}`)
    console.error('  先跑 S2 适配把 SKILL.md 产出到 staging/<L2 责任域>/<slug>/。')
    process.exit(1)
  }
  const dirs = findSkillDirs(STAGING).filter((d) => !d.includes(`${path.sep}backup${path.sep}`))
  if (dirs.length === 0) {
    console.error(`[import-paper2skills] staging 下没有任何 <slug>/SKILL.md: ${STAGING}`)
    process.exit(1)
  }

  /** @type {{ok:any[], created:string[], overwritten:string[], problems:string[]}} */
  const report = { ok: [], created: [], overwritten: [], blankL3: [], problems: [] }
  /** @type {Map<string, {name:string,title:string,l1:string,l2:string,l3:string,role:string,dir:string}>} */
  const manifestSkills = new Map()

  for (const dir of dirs) {
    const name = path.basename(dir)
    const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
    const fields = validateFrontmatter(text, name, report.problems)
    const l3Name = (fields.l3_business || '').split(' / ')[0]
    const l2 = l3ToL2.get(l3Name)
    // 矩阵空白卡（151 条 L3 无一可归）照常安装、可斜杠调用，但不进任何 preset 的 skill-subset；
    // 它们的 l3_business 是占位串，不算问题。
    const isBlank = !l3Name || l3Name === '（矩阵空白）'
    if (!l2 && !isBlank) report.problems.push(`${name}: l3_business「${l3Name}」不在 taxonomy 的 151 条内`)
    if (isBlank) report.blankL3.push(name)
    const bytes = Buffer.byteLength(text, 'utf8')
    if (bytes > 12 * 1024) report.problems.push(`${name}: SKILL.md ${bytes} 字节 > 12KB（长代码应移入 references/）`)

    const cur = readCurrentKeepLines(name)
    const keep = new Map(cur.lines.map((l) => [l.split(':')[0], l]))
    /** @type {string[]} */
    const flagLines = []
    for (const k of KEEP_KEYS) {
      if (k === 'workflow' || k === 'whenToUse') {
        if (keep.has(k)) flagLines.push(/** @type {string} */ (keep.get(k)))
        continue
      }
      flagLines.push(keep.get(k) ?? `${k}: true`)
    }
    // 硬约束：模型调用必须关（O1）
    if (!flagLines.some((l) => l.startsWith('disable-model-invocation'))) flagLines.unshift('disable-model-invocation: true')

    report.ok.push({
      name,
      dir,
      l1: l2?.plane || '',
      l2: l2?.domain || '',
      l3: l3Name,
      role: l2?.role || '',
      catalog_row: { name, title: fields.title || name, l1: l2?.plane || '', l2: l2?.domain || '', l3: l3Name, role: l2?.role || '', summaryZh: (fields.user_summary || '').slice(0, 80) },
    })
    if (cur.exists) report.overwritten.push(name)
    else report.created.push(name)
    manifestSkills.set(name, report.ok[report.ok.length - 1].catalog_row)
  }

  const l3Used = new Set(report.ok.map((x) => x.l3))
  const manifest = {
    version: '1.0',
    generated_from: 'staging/',
    taxonomy: { planes: tax.planes, domains: tax.domains, l3_total: tax.l3.length },
    categories: tax.planes.map((p) => ({
      key: p.id,
      title: p.name,
      purpose: p.purpose,
      domains: tax.domains
        .filter((d) => tax.cells.some((c) => c.plane_id === p.id && c.domain_id === d.id))
        .map((d) => ({ key: d.id, title: d.name, l3: tax.l3.filter((e) => e.plane_id === p.id && e.domain_id === d.id).map((e) => e.name) })),
    })),
    skills: [...manifestSkills.values()],
  }

  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true })
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(path.join(STAGING, 'import-report.json'), JSON.stringify({ ...report, ok: report.ok }, null, 2) + '\n')

  console.log(`staging 技能：${report.ok.length}  新建 ${report.created.length}  覆盖 ${report.overwritten.length}  矩阵空白（不装配）${report.blankL3.length}  问题 ${report.problems.length}`)
  console.log(`L3 覆盖：${l3Used.size}/${tax.l3.length}`)
  if (report.problems.length) {
    console.error('Problems:')
    for (const p of report.problems.slice(0, 40)) console.error(`  - ${p}`)
    if (report.problems.length > 40) console.error(`  … 另有 ${report.problems.length - 40} 项`)
    process.exit(1)
  }

  if (DRY) {
    console.log('dry-run：未写入 ~/.dsh/skills/')
    return
  }

  fs.mkdirSync(SKILLS_DIR, { recursive: true })
  let installed = 0
  for (const x of report.ok) {
    const src = path.join(path.resolve(x.dir), 'SKILL.md')
    const dstDir = path.join(SKILLS_DIR, x.name)
    fs.mkdirSync(dstDir, { recursive: true })
    fs.copyFileSync(src, path.join(dstDir, 'SKILL.md'))
    const refSrc = path.join(path.dirname(src), 'references')
    if (fs.existsSync(refSrc)) fs.cpSync(refSrc, path.join(dstDir, 'references'), { recursive: true })
    installed += 1
  }
  console.log(`Installed: ${installed} → ${SKILLS_DIR}`)
}

main()
