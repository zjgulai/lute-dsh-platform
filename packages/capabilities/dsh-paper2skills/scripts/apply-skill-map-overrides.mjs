#!/usr/bin/env node
/**
 * apply-skill-map-overrides.mjs — 孪生对处理表落地脚本（覆盖层，深度解耦）。
 *
 * 处理表：scripts/role-presets/skill-map.overrides.json
 * 作用对象（全部在 Magpie-Horch 仓库或 DSH 安装态，**不碰** paper_to_skills 原项目材料）：
 *   1. merge  → scripts/role-presets/skill-map.json 的 entry.supply：移除 absorb、确保 keep 在。
 *   2. quota  → 同一 skill-map.json：试点岗 L3 entry 的 supply 裁剪为 keep 名单。
 *   3. distinguish patch + absorbed_capabilities → ~/.dsh/skills/<slug>/SKILL.md 的
 *      whenToUse 行末尾追加合并句（幂等锚点「〔孪生处理 v1〕」；不存在/已含锚点则跳过）。
 *
 * 管线顺序（写死在报告里，防止下轮 wire 只追加把被并卡复活）：
 *   wire-skill-map.mjs（只追加）→ 本脚本（去重+配额+文本覆盖）→ role-presets/generate.mjs（同步 manifest）
 *
 * 用法：
 *   node scripts/apply-skill-map-overrides.mjs            # 应用（先备份）
 *   node scripts/apply-skill-map-overrides.mjs --dry      # 只打印差异，不写盘
 *   node scripts/apply-skill-map-overrides.mjs --revert   # 从最近一次备份恢复
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..', '..', '..')
const OVERRIDES = join(REPO, 'scripts', 'role-presets', 'skill-map.overrides.json')
const SKILL_MAP = join(REPO, 'scripts', 'role-presets', 'skill-map.json')
const BACKUP_ROOT = join(__dirname, '..', 'staging', 'backup', 'overrides')
const SKILLS_ROOT = process.env.ROLE_SKILLS_ROOT || join(homedir(), '.dsh', 'skills')
const ANCHOR = '〔孪生处理 v1〕'
const DRY = process.argv.includes('--dry')
const REVERT = process.argv.includes('--revert')

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

if (!existsSync(OVERRIDES)) {
  console.error(`✗ 缺少处理表 ${OVERRIDES}`)
  process.exit(1)
}
if (!existsSync(SKILL_MAP)) {
  console.error(`✗ 缺少 ${SKILL_MAP}`)
  process.exit(1)
}
const overrides = read(OVERRIDES)
const mapFile = read(SKILL_MAP)
const skills = mapFile.skills

/** ---------- revert ---------- */
if (REVERT) {
  const dirs = readdirSync(BACKUP_ROOT).filter((d) => /^\d{8}-\d{6}$/.test(d)).sort()
  if (dirs.length === 0) {
    console.error('✗ 无备份可恢复')
    process.exit(1)
  }
  const latest = join(BACKUP_ROOT, dirs[dirs.length - 1])
  const manifest = read(join(latest, 'manifest.json'))
  let n = 0
  for (const f of manifest.files) {
    if (existsSync(join(latest, f.backup))) {
      copyFileSync(join(latest, f.backup), f.src)
      n += 1
      console.log(`↩  恢复 ${f.src}`)
    }
  }
  console.log(`✓ 已从 ${dirs[dirs.length - 1]} 恢复 ${n} 个文件`)
  process.exit(0)
}

/** ---------- plan（只读差异计算） ---------- */
const plan = { mapEdits: [], mdEdits: [], warnings: [] }
const stamp = () => {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// 1. merge
for (const m of overrides.merge) {
  const entry = skills[m.l3]
  if (!entry) {
    plan.warnings.push(`merge: skill-map 无「${m.l3}」条目（岗位 ${m.role}），跳过`)
    continue
  }
  const supply = entry.supply ?? []
  const absorbed = m.absorb.filter((a) => supply.includes(a))
  const keepMissing = !supply.includes(m.keep)
  if (absorbed.length > 0 || keepMissing) {
    plan.mapEdits.push({ l3: m.l3, absorb: absorbed, keepMissing, role: m.role })
  }
}

// 2. quota
for (const q of overrides.quota) {
  for (const e of q.entries) {
    const entry = skills[e.l3]
    if (!entry) {
      plan.warnings.push(`quota: skill-map 无「${e.l3}」条目（岗位 ${q.role}），跳过`)
      continue
    }
    const supply = entry.supply ?? []
    const dropped = supply.filter((s) => !e.keep.includes(s))
    if (dropped.length > 0) {
      plan.mapEdits.push({ l3: e.l3, quotaDrop: dropped, role: q.role })
    }
  }
}

// 3. whenToUse 覆盖（区分互斥点名 + 能力吸收）
const mdPatches = []
for (const d of overrides.distinguish) {
  if (d.status !== 'patch-needed') continue
  for (const p of d.patches ?? []) mdPatches.push(p)
}
for (const a of overrides.absorbed_capabilities ?? []) mdPatches.push(a)

for (const p of mdPatches) {
  const file = join(SKILLS_ROOT, p.skill, 'SKILL.md')
  if (!existsSync(file)) {
    plan.warnings.push(`whenToUse: 未安装 ${p.skill}（${file} 不存在），跳过文本覆盖`)
    continue
  }
  const base = plan.mdEdits.find((e) => e.file === file)?.fullText ?? readFileSync(file, 'utf8')
  if (base.includes(ANCHOR + p.append)) continue // 幂等：本句已写过
  const lines = base.split('\n')
  const idx = lines.findIndex((l) => l.startsWith('whenToUse:'))
  if (idx === -1) {
    plan.warnings.push(`whenToUse: ${p.skill} 无 whenToUse 字段，跳过`)
    continue
  }
  const line = lines[idx]
  const closeQuote = line.lastIndexOf('"')
  if (closeQuote === -1) {
    plan.warnings.push(`whenToUse: ${p.skill} 的 whenToUse 行不是引号包裹，跳过`)
    continue
  }
  const before = line.slice(0, closeQuote)
  const after = line.slice(closeQuote)
  const endsWithPunct = ['。', '」', '！', '？', '.', '!', '?'].some((c) => before.trimEnd().endsWith(c))
  lines[idx] = endsWithPunct
    ? before + ` ${ANCHOR}${p.append}` + after
    : before + `。 ${ANCHOR}${p.append}` + after
  const prior = plan.mdEdits.find((e) => e.file === file)
  if (prior) {
    prior.fullText = lines.join('\n')
    prior.appendCount += 1
  } else {
    plan.mdEdits.push({ file, skill: p.skill, oldLine: line, fullText: lines.join('\n'), appendCount: 1 })
  }
}

/** ---------- 报告 + 落地 ---------- */
console.log(`处理表: ${OVERRIDES}`)
console.log(`skill-map 条目改动: ${plan.mapEdits.length}`)
for (const e of plan.mapEdits) {
  if (e.absorb) console.log(`  ⊖ ${e.l3}（${e.role}）移除 ${e.absorb.length} 张被并卡: ${e.absorb.join(', ')}${e.keepMissing ? `；⊞ 补入 keep` : ''}`)
  if (e.quotaDrop) console.log(`  ✂ ${e.l3}（${e.role}）配额裁剪 ${e.quotaDrop.length} 张: ${e.quotaDrop.join(', ')}`)
}
console.log(`whenToUse 覆盖: ${plan.mdEdits.length} 个文件（${plan.mdEdits.reduce((s, e) => s + e.appendCount, 0)} 个追加句）`)
for (const e of plan.mdEdits) {
  console.log(`  ✎ ${e.skill}: +${e.appendCount} 句 …${ANCHOR}`)
}
for (const w of plan.warnings) console.log(`  ⚠ ${w}`)

if (DRY) {
  console.log('--dry：未写任何文件')
  process.exit(0)
}

// 落地（map + SKILL.md 一并备份，revert 可整体恢复）
if (plan.mapEdits.length > 0 || plan.mdEdits.length > 0) {
  const backupDir = join(BACKUP_ROOT, stamp())
  mkdirSync(backupDir, { recursive: true })
  const files = []
  if (plan.mapEdits.length > 0) {
    copyFileSync(SKILL_MAP, join(backupDir, 'skill-map.json'))
    files.push({ src: SKILL_MAP, backup: 'skill-map.json' })
  }
  for (const e of plan.mdEdits) {
    const name = `skills-${e.skill}.md`
    copyFileSync(e.file, join(backupDir, name))
    files.push({ src: e.file, backup: name })
    writeFileSync(e.file, e.fullText, 'utf8')
  }
  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify({ files }, null, 2))
  if (plan.mapEdits.length > 0) {
    for (const m of overrides.merge) {
      const entry = skills[m.l3]
      if (!entry) continue
      entry.supply = (entry.supply ?? []).filter((s) => !m.absorb.includes(s))
      if (!entry.supply.includes(m.keep)) entry.supply.push(m.keep)
    }
    for (const q of overrides.quota) {
      for (const e of q.entries) {
        const entry = skills[e.l3]
        if (!entry) continue
        entry.supply = e.keep.slice()
      }
    }
    writeFileSync(SKILL_MAP, JSON.stringify(mapFile, null, 2) + '\n', 'utf8')
  }
  console.log(`✓ 已落地（备份 ${backupDir}，revert 用 --revert）`)
} else {
  console.log('✓ 无任何改动需要落地')
}

// 校验：absorb 不得残留在任何 supply 中
const allAbsorb = new Set(overrides.merge.flatMap((m) => m.absorb))
const residue = []
for (const [name, entry] of Object.entries(skills)) {
  for (const s of entry.supply ?? []) if (allAbsorb.has(s)) residue.push(`${name} → ${s}`)
}
if (residue.length > 0) {
  console.error(`✗ 被并卡仍残留在 supply：\n  ${residue.join('\n  ')}`)
  process.exit(1)
}
console.log('✓ 校验通过：9 张被并卡已从全部 supply 移除')
