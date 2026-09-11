#!/usr/bin/env node
/**
 * 把材料《AI组织变革》的 8 份 Playbook 装成**共享技能**（`~/.dsh/skills/pb-00X/`）。
 *
 * 为什么共享而不是塞进每个 preset：
 *   PB-002 被 26 个岗位参与、PB-001 被 19 个、PB-008 被 20 个 ——
 *   逐 preset 复制会产生 100+ 份同一内容的副本（且违反 ADR-0009「一份事实只有一个家」）。
 *   装成全局技能后，每个岗位 preset 的 skill-subset 只引用自己参与的那几份。
 *
 * 内容取自 `docs/06-playbooks/PLAYBOOKS.md` 的 `## PB-00X` 章节，**逐字**，
 * 仅前置 YAML frontmatter（技能契约要求 name 为英文 kebab）。
 *
 * 用法：
 *   node scripts/role-presets/install-playbook-skills.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const MATERIAL_ROOT = process.env.ROLE_MATERIAL_ROOT || '/Users/lute/project/AI组织变革'
const SKILLS_ROOT = process.env.ROLE_SKILLS_ROOT || join(homedir(), '.dsh', 'skills')
const DRY_RUN = process.argv.includes('--dry-run')

/** 技能名必须英文 kebab（加载与运行时双重校验）。 */
const SKILL_ID = /^[a-z0-9][a-z0-9-]*$/

/** 按 `## PB-00X` 切章，正文逐字保留（含标题行）。 */
function playbookSections(markdown) {
  const lines = markdown.split('\n')
  const out = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith('## PB-')) {
      if (cur) out.push(cur)
      cur = { heading: line, body: [line] }
    } else if (cur) cur.body.push(line)
  }
  if (cur) out.push(cur)
  return out.map((s) => ({ heading: s.heading, body: s.body.join('\n').replace(/\s+$/, '') }))
}

/** description 必须是单行：取标题里的中文名 + 触发条件首句。 */
function describe(section) {
  const title = section.heading.replace(/^##\s*/, '').trim()
  const trigger = section.body.split('\n').find((l) => l.startsWith('**触发与责任'))
  let extra = trigger ? trigger.replace(/\*\*/g, '').trim() : ''
  extra = extra.replace(/\s+/g, ' ')
  if (extra.length > 180) extra = extra.slice(0, 177) + '…'
  return `${title}（材料《AI组织变革》手册原文，逐字）${extra ? '。' + extra : ''}`
}

function main() {
  const src = join(MATERIAL_ROOT, 'docs', '06-playbooks', 'PLAYBOOKS.md')
  if (!existsSync(src)) {
    console.error(`✗ 找不到手册源：${src}`)
    process.exit(1)
  }
  const sections = playbookSections(readFileSync(src, 'utf8'))
  console.log(`手册源：${src}`)
  console.log(`技能根：${SKILLS_ROOT}${DRY_RUN ? '  （--dry-run，未写盘）' : ''}`)
  console.log(`解析到 ${sections.length} 份手册\n`)

  let written = 0
  for (const s of sections) {
    const id = s.heading.replace(/^##\s*/, '').split(/\s+/)[0].toLowerCase() // PB-001 → pb-001
    if (!SKILL_ID.test(id)) {
      console.error(`✗ 非法技能名（须英文 kebab）：${id}`)
      process.exit(1)
    }
    const desc = describe(s).replace(/\n/g, ' ')
    const content = `---\nname: ${id}\ndescription: ${desc}\n---\n\n${s.body}\n`
    const dir = join(SKILLS_ROOT, id)
    console.log(`  ${id}  ${String(s.body.length).padStart(6)} 字符  → ${dir}`)
    if (DRY_RUN) continue
    mkdirSync(dir, { recursive: true })
    const target = join(dir, 'SKILL.md')
    if (existsSync(target)) rmSync(target)
    writeFileSync(target, content, 'utf8')
    written++
  }
  console.log(`\n${DRY_RUN ? '（未写盘）' : `已写入 ${written} 份共享技能`}`)
  console.log(`每个岗位 preset 的 skill-subset 引用自己参与的 pb-00X；未参与的不会被加载。`)
}

main()
