#!/usr/bin/env node
/**
 * 50 岗位 preset 的**全量保真校验器**（「信息不要少了」的机器契约）
 *
 * 它回答的不是「文件在不在」，而是：材料里关于某个岗位的**每一条信息**，
 * 是否都逐字进了该岗位的 preset。校验分 10 层，任一层失败即非零退出：
 *
 *   L1 覆盖   材料里的 50 个岗位与产物目录一一对应，不多不少
 *   L2 全文   岗位卡全文（逐字）出现在 agent.cordis.yml 的 persona 字面块里
 *   L3 小节   岗位卡 7 个 ## 小节逐个逐字出现（合计 350 节，0 缺失）
 *   L4 字段   role-catalog 的 20 个字段逐个 deepEqual，且**反向**无丢字段
 *   L5 归集   org / mgmt / lifecycle / collab / flow-catalog / playbooks / roster 七项来源
 *            逐条 deepEqual（含该岗位涉及的边）
 *   L6 哈希   记录在 manifest 里的 sha256 与源文件当前实际哈希一致（证明快照可追溯）
 *   L7 官方   产物通过平台自己的 preset lint（组合词汇合法）
 *   L8 技能   skill-subset 引用的每一个技能都真实存在（0 悬空）
 *   L9 编队   squad 契约与材料选路规则逐条一致，且零/多匹配一律 WAIT
 *   L10 头像  preset.yml 的 icon 存在、与图标库同一字符串、50 枚互不重样
 *
 * 用法：
 *   node scripts/role-presets/verify-lossless.mjs                 # 校验默认输出根
 *   ROLE_PRESET_OUT=/tmp/... node scripts/role-presets/verify-lossless.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { nodeCommand } from '../lib/real-node.mjs'

// 起 lint 子进程用的解释器。**不能**用 process.execPath：在 pnpm 生命周期脚本下它是宿主
// Electron 可执行文件，子进程「退出码 0 且没有任何输出」→ L7 会报「lint 未返回 [ok]」，
// 读起来像 50 个 preset 全部不合法，真因是执行器不是 node。判据见 scripts/gates/node-interpreter.mjs。
// `env` 与 `command` 是同一件事的两半：只取 command 就等于把 bug 装回去。
const { command: NODE, env: NODE_ENV } = nodeCommand()

const MATERIAL_ROOT = process.env.ROLE_MATERIAL_ROOT || '/Users/lute/project/AI组织变革'
const DOCS = join(MATERIAL_ROOT, 'docs')
const OUT_ROOT = process.env.ROLE_PRESET_OUT || join(homedir(), '.dsh', '.agent-presets')
const SKILLS_ROOT = process.env.ROLE_SKILLS_ROOT || join(homedir(), '.dsh', 'skills')

const raw = (rel) => readFileSync(join(DOCS, rel), 'utf8')
const sha256 = (t) => createHash('sha256').update(t, 'utf8').digest('hex')
const SOURCE_FILES = {
  roleCatalog: '05-agents/role-catalog.json',
  organizationGraph: '04-organization/organization-graph.json',
  managementGraph: '05-agents/agent-management-graph.json',
  lifecycle: '05-agents/agent-lifecycle.json',
  collaborationGraph: '07-orchestration/collaboration-graph.json',
  flowCatalog: '03-scenarios/FLOW-CATALOG.md',
  playbooks: '06-playbooks/PLAYBOOKS.md',
  roster: '05-agents/ROSTER.md',
}

const failures = []
const fail = (layer, msg) => failures.push(`[${layer}] ${msg}`)
let checks = 0
const ok = () => { checks++ }

/** 把 agent.cordis.yml 里 persona 行的字面块标量体还原成原文（去掉统一缩进）。 */
function extractPersonaText(composition) {
  const lines = composition.split('\n')
  const start = lines.findIndex((l) => l === '    text: |-')
  if (start < 0) return null
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.length === 0) { out.push(''); continue }
    if (!line.startsWith('      ')) break
    out.push(line.slice(6))
  }
  return out.join('\n').replace(/\s+$/, '')
}

function cardSections(cardText) {
  const lines = cardText.split('\n')
  const out = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (cur) out.push(cur)
      cur = [line]
    } else if (cur) cur.push(line)
  }
  if (cur) out.push(cur)
  return out.map((b) => b.join('\n').replace(/\s+$/, ''))
}

function main() {
  for (const [key, rel] of Object.entries(SOURCE_FILES)) {
    if (!existsSync(join(DOCS, rel))) fail('L0', `源文件缺失：${rel}`)
  }
  if (failures.length) return report()

  const roleCatalog = JSON.parse(raw(SOURCE_FILES.roleCatalog))
  const orgGraph = JSON.parse(raw(SOURCE_FILES.organizationGraph))
  const mgmtGraph = JSON.parse(raw(SOURCE_FILES.managementGraph))
  const lifecycle = JSON.parse(raw(SOURCE_FILES.lifecycle))
  const collab = JSON.parse(raw(SOURCE_FILES.collaborationGraph))
  const flowCatalogText = raw(SOURCE_FILES.flowCatalog)
  const playbooksText = raw(SOURCE_FILES.playbooks)
  const rosterText = raw(SOURCE_FILES.roster)

  const orgEdges = new Map()
  for (const e of orgGraph.edges) for (const s of ['from', 'to']) {
    if (!orgEdges.has(e[s])) orgEdges.set(e[s], [])
    orgEdges.get(e[s]).push(e)
  }
  const mgmtEdges = new Map()
  for (const e of mgmtGraph.edges) for (const s of ['from', 'to']) {
    if (!mgmtEdges.has(e[s])) mgmtEdges.set(e[s], [])
    mgmtEdges.get(e[s]).push(e)
  }
  const collabEdges = new Map()
  for (const e of collab.edges) for (const s of ['from', 'to']) {
    if (!collabEdges.has(e[s])) collabEdges.set(e[s], [])
    collabEdges.get(e[s]).push(e)
  }
  const byId = (arr, key) => new Map(arr.map((x) => [x[key], x]))

  const sourceHashes = Object.fromEntries(
    Object.entries(SOURCE_FILES).map(([k, rel]) => [k, sha256(raw(rel))]),
  )

  // ── L1 覆盖 ──
  const expectedIds = roleCatalog.roles.map((r) => r.id).sort()
  const presentDirs = existsSync(OUT_ROOT)
    ? readdirSync(OUT_ROOT).filter((d) => /^agt-\d{3}$/.test(d)).sort()
    : []
  const expectedDirs = expectedIds.map((id) => `agt-${id.slice(4)}`)
  if (!isDeepStrictEqual(expectedDirs, presentDirs)) {
    const missing = expectedDirs.filter((d) => !presentDirs.includes(d))
    const extra = presentDirs.filter((d) => !expectedDirs.includes(d))
    fail('L1', `岗位目录与材料不一一对应；缺失 ${JSON.stringify(missing)}，多余 ${JSON.stringify(extra)}`)
  } else ok()

  let sectionTotal = 0
  let cardBytesTotal = 0

  for (const role of roleCatalog.roles) {
    const id = role.id
    const dirId = `agt-${id.slice(4)}`
    const dir = join(OUT_ROOT, dirId)
    if (!existsSync(dir)) continue
    const compPath = join(dir, 'agent.cordis.yml')
    const manPath = join(dir, 'manifest.json')
    if (!existsSync(compPath) || !existsSync(manPath)) {
      fail('L1', `${dirId}: 缺 agent.cordis.yml 或 manifest.json`)
      continue
    }
    const composition = readFileSync(compPath, 'utf8')
    const manifest = JSON.parse(readFileSync(manPath, 'utf8'))
    const cardText = raw(`05-agents/roles/${id}.md`)
    cardBytesTotal += Buffer.byteLength(cardText, 'utf8')

    // ── L2 全文 ──
    const persona = extractPersonaText(composition)
    if (persona === null) {
      fail('L2', `${dirId}: 找不到 persona 字面块（    text: |-）`)
    } else {
      const card = cardText.replace(/\s+$/, '')
      if (!persona.includes(card)) fail('L2', `${dirId}: persona 未逐字包含岗位卡全文`)
      else ok()
    }

    // ── L3 小节（逐节逐字）──
    const sections = cardSections(cardText)
    if (sections.length !== 7) fail('L3', `${dirId}: 岗位卡小节数为 ${sections.length}，期望 7`)
    for (const sec of sections) {
      sectionTotal++
      if (persona === null || !persona.includes(sec)) {
        const h = sec.split('\n')[0]
        fail('L3', `${dirId}: 小节未逐字保真 → ${h}`)
      } else ok()
      if (!manifest.material.role_card.sections.some((s) => s.body === sec)) {
        fail('L3', `${dirId}: manifest 未收录该小节 → ${sec.split('\n')[0]}`)
      } else ok()
    }

    // ── L4 字段（正向 deepEqual + 反向无丢字段）──
    const srcRec = role
    const outRec = manifest.material.role_catalog.record
    if (!isDeepStrictEqual(srcRec, outRec)) {
      fail('L4', `${dirId}: role-catalog 记录与源不一致`)
    } else ok()
    for (const k of Object.keys(srcRec)) {
      if (!(k in outRec)) fail('L4', `${dirId}: 字段丢失 → ${k}`)
      else ok()
    }

    // ── L5 归集（七项来源逐条 deepEqual）──
    const orgRole = byId(orgGraph.roles, 'id').get(id)
    if (!isDeepStrictEqual(manifest.material.organization_graph.role_entry, orgRole)) {
      fail('L5', `${dirId}: organization-graph.role_entry 不一致`)
    } else ok()
    if (!isDeepStrictEqual(manifest.material.organization_graph.edges, orgEdges.get(id) || [])) {
      fail('L5', `${dirId}: organization-graph 该岗位的边不一致`)
    } else ok()
    if (!isDeepStrictEqual(manifest.material.agent_management_graph.role_binding, byId(mgmtGraph.role_bindings, 'role_id').get(id))) {
      fail('L5', `${dirId}: agent-management-graph.role_binding 不一致`)
    } else ok()
    if (!isDeepStrictEqual(manifest.material.agent_management_graph.edges, mgmtEdges.get(id) || [])) {
      fail('L5', `${dirId}: agent-management-graph 该岗位的边不一致`)
    } else ok()
    if (!isDeepStrictEqual(manifest.material.agent_lifecycle.role_release_status, byId(lifecycle.role_release_status, 'role_id').get(id))) {
      fail('L5', `${dirId}: agent-lifecycle.role_release_status 不一致`)
    } else ok()
    if (!isDeepStrictEqual(manifest.material.collaboration_graph.role_contribution, byId(collab.role_contributions, 'role_id').get(id))) {
      fail('L5', `${dirId}: collaboration-graph.role_contribution 不一致`)
    } else ok()
    if (!isDeepStrictEqual(manifest.material.collaboration_graph.edges, collabEdges.get(id) || [])) {
      fail('L5', `${dirId}: collaboration-graph 该岗位的边不一致`)
    } else ok()
    if (manifest.material.roster.row === null || !rosterText.includes(manifest.material.roster.row)) {
      fail('L5', `${dirId}: ROSTER 总表行缺失或不一致`)
    } else ok()
    for (const sec of manifest.material.flow_catalog.sections) {
      if (!flowCatalogText.includes(sec.body)) fail('L5', `${dirId}: FLOW-CATALOG 章节未在源中找到`)
      else ok()
    }
    for (const sec of manifest.material.playbooks.sections) {
      if (!playbooksText.includes(sec.body)) fail('L5', `${dirId}: PLAYBOOKS 章节未在源中找到`)
      else ok()
    }
    // 材料里声明参与的流程/手册，必须一条不漏地进入产物
    for (const f of role.flows || []) {
      if (!manifest.material.collaboration_graph.flows.some((x) => x.id === f)) {
        fail('L5', `${dirId}: 岗位声明的流程未收录 → ${f}`)
      } else ok()
    }
    for (const pb of role.playbooks || []) {
      if (!manifest.material.playbooks.sections.some((s) => s.heading.startsWith(`## ${pb} `))) {
        fail('L5', `${dirId}: 岗位声明的手册未收录 → ${pb}`)
      } else ok()
    }
    for (const scn of role.scenarios || []) {
      if (!manifest.material.collaboration_graph.scenarios.some((s) => s.id === scn)) {
        fail('L5', `${dirId}: 岗位声明的场景未收录 → ${scn}`)
      } else ok()
    }

    // ── L6 哈希 ──
    if (!isDeepStrictEqual(manifest.material.source_hashes, sourceHashes)) {
      fail('L6', `${dirId}: 记录的源哈希与当前源文件不一致`)
    } else ok()
    if (manifest.material.role_card.sha256 !== sha256(cardText)) {
      fail('L6', `${dirId}: 岗位卡 sha256 不符`)
    } else ok()
    if (!manifest.material.role_card.text.includes(cardText.replace(/\s+$/, ''))) {
      fail('L6', `${dirId}: manifest 内的岗位卡快照不完整`)
    } else ok()
  }

  // ── 汇总断言 ──
  if (sectionTotal !== expectedIds.length * 7) {
    fail('L3', `小节总数 ${sectionTotal}，期望 ${expectedIds.length * 7}`)
  } else ok()

  // ── L8 技能引用真实性（skill-subset 的每个 id 必须在技能库真实存在）──
  const installedSkills = new Set(
    readdirSync(SKILLS_ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name),
  )
  for (const d of presentDirs) {
    const manPath = join(OUT_ROOT, d, 'manifest.json')
    if (!existsSync(manPath)) continue
    const man = JSON.parse(readFileSync(manPath, 'utf8'))
    const subset = man?.x_lute?.skills?.subset
    if (!Array.isArray(subset)) {
      fail('L8', `${d}: manifest 缺 x_lute.skills.subset`)
      continue
    }
    // 每个引用的 id 必须真实存在（否则会话里会被静默遮蔽）
    for (const id of subset) {
      if (!installedSkills.has(id)) fail('L8', `${d}: skill-subset 引用不存在的技能 → ${id}`)
      else ok()
    }
    // 映射明细必须与 subset 自洽：所有非 gap 的 supply 都在 subset 里
    for (const m of man?.x_lute?.skills?.mapping || []) {
      for (const sid of m.supply || []) {
        if (!subset.includes(sid)) fail('L8', `${d}: 映射供给未进 subset → ${m.name} → ${sid}`)
        else ok()
      }
    }
    // agent.cordis.yml 里的 skills 数组必须与 manifest 记录一致
    const comp = readFileSync(join(OUT_ROOT, d, 'agent.cordis.yml'), 'utf8')
    const line = comp.split('\n').find((l) => l.trim().startsWith('skills: ['))
    const inComp = line
      ? [...line.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
      : []
    if (!isDeepStrictEqual(inComp, [...subset].sort())) {
      fail('L8', `${d}: 组合里的 skills 与 manifest.subset 不一致（组合 ${inComp.length} 项 / manifest ${subset.length} 项）`)
    } else ok()
  }

  // ── L9 编队契约（squad）与材料逐条一致 ──
  // 这一层专治「编队生成器拿到一份自洽但与材料不符的契约」：队长资格、可贡献流程、
  // 以及选路条件都必须能在材料里逐条找到出处。
  const selectorByRole = new Map()
  for (const flow of collab.flows) {
    const selector = flow.primary_role_selector ?? {}
    for (const rule of selector.rules ?? []) {
      if (!selectorByRole.has(rule.role_id)) selectorByRole.set(rule.role_id, [])
      selectorByRole.get(rule.role_id).push({
        flow: flow.id,
        rule: rule.selector_rule_id,
        condition: rule.condition_description,
        unconditional_default: rule.is_unconditional_default === true,
        selector_status: selector.status ?? null,
        zero_or_multiple_match_disposition: selector.zero_or_multiple_match_disposition ?? null,
      })
    }
  }
  const contributionById = new Map(collab.role_contributions.map((c) => [c.role_id, c]))

  for (const dir of presentDirs) {
    const manPath = join(OUT_ROOT, dir, 'manifest.json')
    if (!existsSync(manPath)) continue
    const man = JSON.parse(readFileSync(manPath, 'utf8'))
    const agt = man?.material?.role_catalog?.record?.id
    const squad = man?.x_lute?.squad
    if (agt === undefined || squad === undefined) {
      fail('L9', `${dir}: 缺 material.role_catalog.record.id 或 x_lute.squad`)
      continue
    }
    const contribution = contributionById.get(agt)
    const primaryFlows = contribution?.primary_eligible_flow_ids ?? []
    const eligibleFlows = contribution?.eligible_flow_ids ?? []

    // 队长资格必须是算出来的，不是常量：只有 primary_eligible_flow_ids 非空者可为队长。
    if (squad.can_be_primary !== (primaryFlows.length > 0)) {
      fail('L9', `${dir}: can_be_primary=${String(squad.can_be_primary)} 与材料不符（primary_eligible_flow_ids 有 ${primaryFlows.length} 条）`)
    } else ok()
    if (!isDeepStrictEqual(squad.primary_flows, primaryFlows)) fail('L9', `${dir}: squad.primary_flows 与材料不一致`)
    else ok()
    if (!isDeepStrictEqual(squad.eligible_flows, eligibleFlows)) fail('L9', `${dir}: squad.eligible_flows 与材料不一致`)
    else ok()

    // 选路条件必须与材料逐条对应（顺序无关、字段逐个 deepEqual）。
    const expected = [...(selectorByRole.get(agt) ?? [])].sort((a, b) => a.rule.localeCompare(b.rule))
    const actual = [...(squad.lead_rules ?? [])].sort((a, b) => a.rule.localeCompare(b.rule))
    if (!isDeepStrictEqual(actual, expected)) {
      fail('L9', `${dir}: lead_rules 与材料选路规则不一致（期望 ${expected.length} 条 / 实得 ${actual.length} 条）`)
    } else ok()

    // 每条 lead_rule 的目标流程必须是本岗位可贡献的流程。
    for (const rule of squad.lead_rules ?? []) {
      if (!eligibleFlows.includes(rule.flow) && !primaryFlows.includes(rule.flow)) {
        fail('L9', `${dir}: lead_rules 指向了本岗位并未参与的流程 ${rule.flow}`)
      } else ok()
      if (rule.zero_or_multiple_match_disposition !== 'WAIT') {
        fail('L9', `${dir}: ${rule.flow} 的零/多匹配处置不是 WAIT（材料要求一律 WAIT，不得猜队长）`)
      } else ok()
    }
  }

  // ── L7 官方 lint（组合词汇合法性；用平台自己的 lint，认 Cordis 的 !!js 方言）──
  const lintPath = fileURLToPath(new URL('../../packages/contract/dsh-preset-lint-local/lib/lint-preset.mjs', import.meta.url))
  if (!existsSync(lintPath)) {
    fail('L7', `找不到 preset lint：${lintPath}`)
  } else {
    for (const d of presentDirs) {
      try {
        const out = execFileSync(NODE, [lintPath, join(OUT_ROOT, d)], { encoding: 'utf8', env: NODE_ENV })
        if (!out.includes('[ok]')) fail('L7', `${d}: lint 未返回 [ok]：${out.trim().slice(0, 160)}`)
        else ok()
      } catch (error) {
        fail('L7', `${d}: lint 失败 → ${String(error.stdout || error.message).trim().slice(0, 200)}`)
      }
    }
  }

  // ── L10 头像（卡片的视觉身份）────────────────────────────────────────────
  // 官方 roster 把 preset.yml 的 icon 直接送到前端渲染成 <img class="cardAvatar">。
  // 这条断言守的是「50 张岗位卡片都有头像、且与图标库同一字符串、且互不重样」。
  const ICON_MANIFEST =
    process.env.ROLE_ICON_MANIFEST || join(SKILLS_ROOT, 'lute-brand-icons', 'assets', 'manifest.json')
  const iconIndexOf = new Map()
  if (!existsSync(ICON_MANIFEST)) {
    fail('L10', `找不到图标索引：${ICON_MANIFEST}（先跑 lute-brand-icons/scripts/build.js）`)
  } else {
    for (const row of JSON.parse(readFileSync(ICON_MANIFEST, 'utf8'))) iconIndexOf.set(row.id, row.icon)
    ok()
  }
  const iconOwner = new Map()
  for (const d of presentDirs) {
    const ymlText = readFileSync(join(OUT_ROOT, d, 'preset.yml'), 'utf8')
    const ymlIcon = ymlText.match(/^icon: '([^']+)'$/m)?.[1]
    const mfIcon = JSON.parse(readFileSync(join(OUT_ROOT, d, 'manifest.json'), 'utf8')).icon
    const expectedIcon = iconIndexOf.get(d)

    if (ymlIcon === undefined) {
      fail('L10', `${d}: preset.yml 缺 icon —— 官方卡片会渲染成空头像`)
    } else if (!ymlIcon.startsWith('data:image/svg+xml;base64,')) {
      fail('L10', `${d}: icon 不是内联 SVG data URI`)
    } else ok()

    if (expectedIcon === undefined) {
      fail('L10', `${d}: 图标库里没有 id 为 ${d} 的条目`)
    } else if (ymlIcon !== expectedIcon || mfIcon !== expectedIcon) {
      fail('L10', `${d}: 头像三处不一致（preset.yml / manifest.json / 图标库必须同一字符串）`)
    } else {
      ok()
      if (iconOwner.has(expectedIcon)) {
        fail('L10', `${d} 与 ${iconOwner.get(expectedIcon)} 用了同一枚头像（岗位头像必须一一对应）`)
      } else {
        iconOwner.set(expectedIcon, d)
        ok()
      }
    }
  }

  console.log(`材料根：${MATERIAL_ROOT}`)
  console.log(`产物根：${OUT_ROOT}`)
  console.log(`岗位数：${expectedIds.length} → 目录 ${presentDirs.length}`)
  console.log(`岗位卡小节：${sectionTotal}（期望 ${expectedIds.length * 7}）`)
  console.log(`岗位卡字节：${cardBytesTotal}`)
  console.log(`断言通过：${checks}`)
  return report()
}

function report() {
  if (failures.length === 0) {
    console.log('\n★ 全量保真校验通过：L1 覆盖 / L2 全文 / L3 小节 / L4 字段 / L5 归集 / L6 哈希 / L7 官方lint / L8 技能引用 / L9 编队契约 / L10 头像 全部无损')
    process.exit(0)
  }
  console.log(`\n✗ 全量保真校验失败：${failures.length} 条`)
  for (const f of failures.slice(0, 40)) console.log('  ' + f)
  if (failures.length > 40) console.log(`  … 其余 ${failures.length - 40} 条省略`)
  process.exit(1)
}

main()
