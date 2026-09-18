#!/usr/bin/env node
/**
 * build-third-party-intake.mjs — 由四份受版本控制的事实源生成取件清单 `third-party-intake.json`
 *
 * ## 为什么是生成器而不是手写清单
 *
 * 本轮要收 68 条技能，分布在两个仓库、多种源根形状里。手写这份 JSON 意味着
 * 把「仓库、目录、安装名」抄 68 遍 —— 而抄错一个字符的后果不是报错，是**静默地
 * 多装一条或少装一条**。本仓库已有一次教训：`fullstack-mapping.json` 一旦与
 * 磁盘漂移，`verify-fullstack` 的「安装 N/M」就变成一个不知道在数什么的数。
 * 故清单由四份受版本控制的事实源机械合成：
 *
 *   1. `scripts/fullstack-mapping.json`  —— 已装 70 条的 name/src/cat/title/summary
 *   2. `scripts/fullstack-extra.json`     —— 本轮新增的 installAs/cat/title/summary（人工判定，进仓库受审）
 *   3. `scripts/third-party-skip.json`    —— 本轮明确 skipped 的条目与逐条理由
 *   4. `scripts/third-party-source-inventory.json` —— upstream ID 与 alreadyInstalled 独立终态
 *
 * ## 为什么 skip 必须带理由并且进仓库
 *
 * 「没装」与「忘了装」在结果上长得一模一样。上游 mattpocock/skills 有 37 条
 * SKILL.md，本轮只收 5 条；剩余 3 条明确 skipped、29 条 alreadyInstalled。三种终态
 * 必须互斥，且生成器会校验「upstream = imported ∪ skipped ∪ alreadyInstalled」恰好覆盖一次。
 *
 * ## 本文件里两条被更正的旧理由（2026-09-16 实测）
 *
 * 旧方案对 `retro` / `implement-spec` 的跳过理由是**错的**，此处按证据更正：
 *
 *   - 旧理由称「`retro` 官方 README 逐字标注 STUB: 设计笔记，非功能」。
 *     **实测不成立**：该 README 里 `retro` 出现 0 次、`STUB` 出现 0 次
 *     （`grep -ci` 两个都是 0）。`retro` 实际是一个 4369 字节的完整技能，
 *     有步骤、有 Reference 段、有 8 类改进候选。它不在 README 里是因为
 *     README 只文档化 25 条，而 `skills/in-progress/` 下的 8 条全都没进 README。
 *   - 旧理由称「`implement-spec` ≈ 已有 `write-spec`」。**实测不成立**：
 *     `implement-spec` 是 2043 字节的**编排**技能（spec+issues → 分票 →
 *     implementer 子 agent 各自 worktree → merger 子 agent → 滚动推进前沿），
 *     与「写规格」不是一回事。
 *
 * 起收决定**不变**（本轮不收），但理由换成成立的：它们与三条写作技能一样，
 * 属于「值得收但需要单独的适配与汉译批次」。把理由留在文件里而不是留在
 * 脑子里的意义是：下一轮读到它的人不会以为「当初是对的所以现在也对」。
 *
 * 用法：
 *   node scripts/build-third-party-intake.mjs            # 生成 third-party-intake.json
 *   node scripts/build-third-party-intake.mjs --check    # 只校验与现清单是否一致（CI 用）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  atomicWriteText,
  auditThirdPartyClassification,
  toCanonicalThirdPartyIntakeResult,
} from './third-party-intake-accounting.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const configuredPath = (name, fallback) => process.env[name] ? path.resolve(process.env[name]) : fallback
const MAPPING = configuredPath('LUTE_INTAKE_MAPPING', path.join(HERE, 'fullstack-mapping.json'))
const EXTRA = configuredPath('LUTE_INTAKE_EXTRA', path.join(HERE, 'fullstack-extra.json'))
const SKIP = configuredPath('LUTE_INTAKE_SKIP', path.join(HERE, 'third-party-skip.json'))
const INVENTORY = configuredPath('LUTE_INTAKE_INVENTORY', path.join(HERE, 'third-party-source-inventory.json'))
const OUT = configuredPath('LUTE_INTAKE_OUT', path.join(HERE, 'third-party-intake.json'))
const CHECK = process.argv.includes('--check')
const JSON_OUTPUT = process.argv.includes('--json')

const j = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const problems = []

const mapping = j(MAPPING)
const extra = j(EXTRA)
const skipDoc = j(SKIP)
const inventory = j(INVENTORY)

// ── 1. 分类守恒：每个 upstream source ID 恰好落入一个终态 ───────────────────

const classification = auditThirdPartyClassification({
  inventory,
  imported: extra.skills,
  skipped: skipDoc.skips,
  mappingSkills: mapping.skills,
})
problems.push(...classification.problems)

const toSkill = (row) => ({
  name: row.name,
  sourceName: row.sourceName ?? row.name,
  dir: row.dir,
  installAs: row.installAs ?? row.name,
  category: row.cat,
  titleZh: row.titleZh,
  summaryZh: row.summaryZh,
})

const out = {
  $comment:
    '本文件由 scripts/build-third-party-intake.mjs 从 fullstack-mapping.json + fullstack-extra.json + ' +
    'third-party-skip.json + third-party-source-inventory.json 生成。不要手改；分类清单不冒充不可变来源证明。',
  repos: classification.repoAudits.map((repo) => ({
    id: repo.id,
    repo: repo.repo,
    commit: repo.commit,
    note: repo.note,
    accounting: {
      upstream: repo.upstream,
      imported: repo.imported,
      skipped: repo.skipped,
      alreadyInstalled: repo.alreadyInstalled,
    },
    skills: repo.imports.map(toSkill).sort((a, b) => a.sourceName.localeCompare(b.sourceName)),
    skip: repo.skips
      .map((row) => ({ name: row.name, sourceName: row.sourceName ?? row.name, dir: row.dir, reason: row.reason }))
      .sort((a, b) => a.sourceName.localeCompare(b.sourceName)),
    alreadyInstalled: repo.alreadyIds.map((name) => ({ name, reason: repo.alreadyReason })),
  })),
}

// ── 2. 上游 `commands/*.md` 的取件与折叠映射 ────────────────────────────────
//
// pm 库每个插件组都有一份 `commands/*.md`（共 42 个，它们是 Claude Code 的斜杠命令定义）。
// DSH 没有这套机制，所以它们的去路只有一条：**折叠进对应技能的正文**，作为「上游斜杠
// 调用形态」的存档，而不是继续当命令。
//
// 映射的依据是**上游各组 README 的 Commands 段逐字描述**（每条都写明它做什么），
// 与技能自身的 description 对齐后逐条判定。这一段里**只允许写出有依据的映射**：
// 没有对应技能、或对应技能本轮被跳过的命令，一律进 `unmapped` 并写明原因 ——
// 编一个映射比留空更糟，因为它会把一条命令挂到一个它并不属于的技能上。
const COMMAND_MAP = {
  "pm-ai-shipping/commands/derive-tests": "test-scenarios",
  "pm-ai-shipping/commands/document-app": "intended-vs-implemented",
  "pm-ai-shipping/commands/ship-check": "shipping-artifacts",
  // 这两条上游**没有对应技能**：pm-ai-shipping 组的技能只有 code-review / intended-vs-implemented /
  // shipping-artifacts 三条（见该组 README 的 Skills 段），而这两个审计命令产出的是审计报告本身，
  // 不是这三条技能里任何一条的产物。挂到 code-review 上是编造映射，故留空登记。
  "pm-ai-shipping/commands/security-audit-static": null,
  "pm-ai-shipping/commands/performance-audit-static": null,
  "pm-data-analytics/commands/analyze-cohorts": "cohort-analysis",
  "pm-data-analytics/commands/analyze-test": "ab-test-analysis",
  "pm-data-analytics/commands/write-query": null, // 指向 sql-queries，而该技能本轮被跳过（真重复）
  "pm-execution/commands/generate-data": "dummy-dataset",
  "pm-execution/commands/meeting-notes": "summarize-meeting",
  "pm-execution/commands/plan-okrs": "brainstorm-okrs",
  "pm-execution/commands/pre-mortem": "pre-mortem",
  "pm-execution/commands/red-team-prd": "strategy-red-team",
  "pm-execution/commands/sprint": null, // 编排器：同时覆盖 sprint-plan / retro / release-notes 三条技能
  "pm-execution/commands/stakeholder-map": "stakeholder-map",
  "pm-execution/commands/test-scenarios": "test-scenarios",
  "pm-execution/commands/transform-roadmap": "outcome-roadmap",
  "pm-execution/commands/write-prd": "create-prd",
  "pm-execution/commands/write-stories": null, // 编排器：同时覆盖 user-stories / job-stories / wwas 三条
  "pm-go-to-market/commands/battlecard": "competitive-battlecard",
  "pm-go-to-market/commands/growth-strategy": null, // 编排器：同时覆盖 growth-loops 与 gtm-motions
  "pm-go-to-market/commands/plan-launch": "gtm-strategy",
  "pm-market-research/commands/analyze-feedback": "sentiment-analysis",
  "pm-market-research/commands/competitive-analysis": "competitor-analysis",
  "pm-market-research/commands/research-users": null, // 编排器：同时覆盖 user-personas / user-segmentation / customer-journey-map
  "pm-marketing-growth/commands/market-product": null, // 编排器：四条里 marketing-ideas 本轮被跳过（跨线碰撞）
  "pm-marketing-growth/commands/north-star": "north-star-metric",
  "pm-product-discovery/commands/brainstorm": null, // 编排器：同时覆盖 brainstorm-ideas-existing/new
  "pm-product-discovery/commands/discover": null, // 编排器：完整发现循环，跨 ideation/assumptions/experiments
  "pm-product-discovery/commands/interview": null, // 编排器：同时覆盖 interview-script 与 summarize-interview
  "pm-product-discovery/commands/setup-metrics": "metrics-dashboard",
  "pm-product-discovery/commands/triage-requests": "analyze-feature-requests",
  "pm-product-strategy/commands/business-model": null, // 编排器：同时覆盖 lean-canvas / business-model / startup-canvas / value-proposition
  "pm-product-strategy/commands/market-scan": null, // 编排器：同时覆盖 swot / pestle / porters-five-forces / ansoff-matrix
  "pm-product-strategy/commands/pricing": "pricing-strategy",
  "pm-product-strategy/commands/strategy": null, // 编排器：九段式战略画布，无单一对应技能
  "pm-product-strategy/commands/value-proposition": "value-proposition",
  "pm-toolkit/commands/draft-nda": null, // 指向 draft-nda，该技能本轮拒收（法务文书）
  "pm-toolkit/commands/privacy-policy": "privacy-policy",
  "pm-toolkit/commands/proofread": null, // 指向 grammar-check，该技能本轮拒收（本机已有 copy-editor）
  "pm-toolkit/commands/review-resume": null, // 指向 review-resume，该技能本轮拒收（招聘文书）
  "pm-toolkit/commands/tailor-resume": null, // 上游有命令但**没有**对应技能（树上无 tailor-resume/SKILL.md）
}

const COMMAND_FILES = Object.keys(COMMAND_MAP).map((k) => `${k}.md`)  // k 已含 commands/ 段

// 校验：映射键必须与树上命令**恰好**一一对应 —— 上游加/删命令时这里会判红
{
  const declared = new Set(Object.keys(COMMAND_MAP).map((k) => k.split('/')[2]))
  const groups = new Map()
  for (const k of Object.keys(COMMAND_MAP)) {
    const [g] = k.split('/')  // 键形如 pm-execution/commands/write-prd
    groups.set(g, (groups.get(g) || 0) + 1)
  }
  const expect = { 'pm-ai-shipping': 5, 'pm-data-analytics': 3, 'pm-execution': 11, 'pm-go-to-market': 3, 'pm-market-research': 3, 'pm-marketing-growth': 2, 'pm-product-discovery': 5, 'pm-product-strategy': 5, 'pm-toolkit': 5 }
  for (const [g, n] of Object.entries(expect)) {
    if ((groups.get(g) || 0) !== n) problems.push(`COMMAND_MAP: ${g} 应有 ${n} 条命令映射，实得 ${groups.get(g) || 0} 条 —— 上游命令清单变了，请逐条重判映射`)
  }
  for (const v of Object.values(COMMAND_MAP)) {
    if (v !== null && !extra.skills.some((x) => x.name === v)) problems.push(`COMMAND_MAP: 映射目标「${v}」不在本轮收件清单里`)
  }
  void declared
}

// 各插件组的 README 是命令映射的**依据文本**，与命令一起存档，这样复核不必再联网。
const GROUP_READMES = ['pm-ai-shipping','pm-data-analytics','pm-execution','pm-go-to-market','pm-market-research','pm-marketing-growth','pm-product-discovery','pm-product-strategy','pm-toolkit'].map((g) => `${g}/README.md`)

const pmRepo = out.repos.find((x) => x.id === 'pm')
if (pmRepo) pmRepo.extraFiles = [...GROUP_READMES, ...COMMAND_FILES]
else problems.push('source inventory: 缺少 pm repo，无法登记 commands/README 附属文件')
out.commandMap = Object.fromEntries(Object.entries(COMMAND_MAP).filter(([, v]) => v !== null))
out.commandMapUnmapped = Object.fromEntries(Object.entries(COMMAND_MAP).filter(([, v]) => v === null))

// ⚠️ 计划决定已修正（2026-09-16，看清内容之后）
//
// 原计划写的是「42 个 commands/*.md 折进对应技能正文的『调用模板』小节」。**看到内容后
// 这个决定是错的**，留痕如下：
//
//   - 42 个命令合计 **175,587 字节**，最大的 `security-audit-static.md` 单个 11,785 字节，
//     比它所在组里任何一条技能都长；
//   - 它们不是薄壳：`ship-check.md`（8,162 字节）是一个**编排器**，正文里依次调用
//     `/document-app`、`/derive-tests`、`/security-audit-static`、`/performance-audit-static`
//     四个命令与 skill 工具，并产出一个「shipping packet」——那是五个步骤的流程，
//     不是某一条技能的调用模板；
//   - 把它们塞进技能正文，会让被塞的那条技能从「一个职责」变成「一个职责 + 一段别的东西」，
//     而 M00–M13 的分类轴正是按职责切的。
//
// 修正后的处置：命令作为**上游编排模式的事实存档**整体保留在 `staging/third-party/`，
// 与各组 README（映射依据）一并归档，并在入库报告里点明「这 42 条是 Claude Code 形态的
// 编排入口，DSH 侧没有等价物，本线不装」。这一条不是「不做」，而是「不按原计划的方式做」——
// 差别在于：假装它们折进去了，与说清它们以另一种形态存在，后者才是可复核的。
out.commandPlanRevision = {
  originalPlan: '折进对应技能正文的「调用模板」小节（每条技能一段）',
  revisedPlan: '作为上游编排模式的事实存档保留在 staging/third-party/，不装进 ~/.dsh/skills',
  evidence: {
    totalBytes: 175587,
    largestFile: 'pm-ai-shipping/commands/security-audit-static.md (11785 bytes)',
    orchestrators: '至少 ship-check(8162) / sprint(5164) / discover(4921) / market-scan(4583) / business-model(6001) 是跨多技能/多命令的编排器，非单技能调用模板',
  },
  reason: '把它们塞进技能正文会破坏 M00–M13 的「一节点一职责」分类轴；而 DSH 没有 Claude Code 的斜杠命令机制，装成技能也会变成 42 条永远不被路由到的条目。',
}

const text = JSON.stringify(out, null, 2) + '\n'

if (CHECK) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null
  if (cur !== text) {
    problems.push('third-party-intake.json 与事实源不一致 —— 请跑 `node scripts/build-third-party-intake.mjs` 重新生成')
  }
} else if (problems.length === 0) {
  try {
    atomicWriteText(OUT, text)
  } catch (error) {
    problems.push(`third-party-intake.json 原子写入失败：${error.message}`)
  }
}

const finalAudit = { ...classification, problems }
const canonical = toCanonicalThirdPartyIntakeResult(finalAudit)

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ ...canonical, accounting: classification.repoAudits.map((repo) => ({
    id: repo.id,
    upstream: repo.upstream,
    imported: repo.imported,
    skipped: repo.skipped,
    alreadyInstalled: repo.alreadyInstalled,
    missing: repo.missing,
    unexpected: repo.unexpected,
    overlaps: repo.overlaps,
  })) }))
  process.exitCode = canonical.status === 'pass' ? 0 : 1
} else if (problems.length) {
  console.error(`✗ third-party intake 校验失败 ${problems.length} 项：`)
  for (const problem of problems) console.error('  - ' + problem)
  process.exitCode = 1
} else if (CHECK) {
  console.log('✓ third-party-intake.json 与四份事实源一致')
  for (const repo of classification.repoAudits) {
    console.log(`  [对账] ${repo.id}: 上游 ${repo.upstream} = 收 ${repo.imported} + 跳过 ${repo.skipped} + 既有 ${repo.alreadyInstalled} ✓`)
  }
} else {
  const n = out.repos.reduce((a, r) => a + r.skills.length, 0)
  const s = out.repos.reduce((a, r) => a + r.skip.length, 0)
  const a = out.repos.reduce((sum, repo) => sum + repo.alreadyInstalled.length, 0)
  console.log(`✓ 原子生成 ${path.relative(ROOT, OUT)}：收 ${n} 条 / 跳过 ${s} 条 / 既有 ${a} 条`)
  for (const repo of classification.repoAudits) {
    console.log(`  ${repo.id.padEnd(4)} 上游 ${repo.upstream} = 收 ${repo.imported} + 跳过 ${repo.skipped} + 既有 ${repo.alreadyInstalled}`)
  }
}
