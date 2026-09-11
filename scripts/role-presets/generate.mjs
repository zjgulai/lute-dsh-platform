#!/usr/bin/env node
/**
 * 50 岗位 AI 分身 Preset 生成器（全量保真 / lossless）
 *
 * 目标：把《AI组织变革》材料里散落在 9 个来源的**每一个岗位**的全部信息，
 * 逐字落成一个可挂载的 DSH preset，不摘要、不改名、不丢字段。
 *
 * 每个岗位信息的 9 个来源：
 *   1. docs/05-agents/roles/AGT-NNN.md          岗位卡全文（7 个 ## 小节）
 *   2. docs/05-agents/role-catalog.json         该岗位 20 字段结构化记录
 *   3. docs/04-organization/organization-graph.json   平面/责任域归属 + 组织边
 *   4. docs/05-agents/agent-management-graph.json     五契约绑定 + 治理边
 *   5. docs/05-agents/agent-lifecycle.json            Role Release Bundle 状态
 *   6. docs/07-orchestration/collaboration-graph.json 角色贡献 + 流程/场景 + 涉及该岗位的边
 *   7. docs/03-scenarios/FLOW-CATALOG.md              该岗位作为能力贡献者的流程条目
 *   8. docs/06-playbooks/PLAYBOOKS.md                 该岗位参与的手册全文
 *   9. docs/05-agents/ROSTER.md                       总表行
 *
 * 落点（DSH preset 目录）：
 *   ~/.dsh/.agent-presets/agt-001/
 *     preset.yml        官方显示字段 name/description/order + icon（官方卡片把它渲染成头像）
 *     manifest.json     material 命名空间逐字归档 9 个来源 + x_lute 命名空间放平台扩展
 *     agent.cordis.yml  以 shipped standard 行集为基座，persona 换成岗位卡全文
 *
 * 用法：
 *   node scripts/role-presets/generate.mjs                # 生成到 ~/.dsh/.agent-presets
 *   node scripts/role-presets/generate.mjs --dry-run      # 只打印，不写盘
 *   ROLE_MATERIAL_ROOT=... ROLE_PRESET_OUT=... node ...   # 覆盖源/目标
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MATERIAL_ROOT = process.env.ROLE_MATERIAL_ROOT || '/Users/lute/project/AI组织变革'
const DOCS = join(MATERIAL_ROOT, 'docs')
const OUT_ROOT = process.env.ROLE_PRESET_OUT || join(homedir(), '.dsh', '.agent-presets')
const SKILLS_ROOT = process.env.ROLE_SKILLS_ROOT || join(homedir(), '.dsh', 'skills')
const SKILL_MAP_PATH = join(HERE, 'skill-map.json')
/**
 * 图标索引（lute-brand-icons 的产物）。
 *
 * 岗位 ↔ 头像的对应关系**不需要第二张映射表**：catalog 里的条目 id 与 preset id
 * 同名（agt-001..agt-050），图标库自己就是这条事实之家（ADR-0009）。
 * 少了它就直接失败——静默写 null 正是「50 张卡片没头像」这个缺陷本身。
 */
const ICON_MANIFEST =
  process.env.ROLE_ICON_MANIFEST ||
  join(SKILLS_ROOT, 'lute-brand-icons', 'assets', 'manifest.json')
const STANDARD_COMPOSITION =
  process.env.ROLE_STANDARD_COMPOSITION ||
  '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets/standard/agent.cordis.yml'
const SNAPSHOT_DATE = '2026-09-11'
const SOURCE_DSH_VERSION = '2.0.5'
const DRY_RUN = process.argv.includes('--dry-run')

/** 平面 → order 千位基座。平面内再按「首次出现的责任域」分百位段，故扁平列表里平面与责任域都成块。 */
const PLANE_BASE = { 'PLN-MGT': 1000, 'PLN-OPS': 2000, 'PLN-CTL': 3000, 'PLN-PLT': 4000 }

const SOURCE_FILES = {
  roleCard: (id) => `05-agents/roles/${id}.md`,
  roleCatalog: '05-agents/role-catalog.json',
  organizationGraph: '04-organization/organization-graph.json',
  managementGraph: '05-agents/agent-management-graph.json',
  lifecycle: '05-agents/agent-lifecycle.json',
  collaborationGraph: '07-orchestration/collaboration-graph.json',
  flowCatalog: '03-scenarios/FLOW-CATALOG.md',
  playbooks: '06-playbooks/PLAYBOOKS.md',
  roster: '05-agents/ROSTER.md',
}

const raw = (rel) => readFileSync(join(DOCS, rel), 'utf8')
const json = (rel) => JSON.parse(raw(rel))
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

/** 把一段 Markdown 按 `## <prefix>` 标题切成 { heading, body } 列表（body 含标题行本身，逐字）。 */
function splitSections(markdown, startsWith) {
  const lines = markdown.split('\n')
  const out = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith('## ') && line.slice(3).startsWith(startsWith)) {
      if (cur) out.push(cur)
      cur = { heading: line, body: [line] }
    } else if (cur) {
      cur.body.push(line)
    }
  }
  if (cur) out.push(cur)
  return out.map((s) => ({ heading: s.heading, body: s.body.join('\n').replace(/\s+$/, '') }))
}

/** 岗位卡全文（逐字）。 */
const cardOf = (id) => raw(SOURCE_FILES.roleCard(id))

/** 岗位卡的 7 个 ## 小节（逐字，含标题行）。 */
function cardSections(cardText) {
  const lines = cardText.split('\n')
  const out = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (cur) out.push(cur)
      cur = { heading: line.slice(3).trim(), body: [line] }
    } else if (cur) {
      cur.body.push(line)
    }
  }
  if (cur) out.push(cur)
  return out.map((s) => ({ heading: s.heading, body: s.body.join('\n').replace(/\s+$/, '') }))
}

/**
 * 渲染「技能供给实况」段：把材料声明的业务技能名逐条对照到平台实际装配的技能。
 *
 * 为什么必须有这一段（2026-09-11 验收实测）：岗位卡原文列了「业务技能：需求分诊、能力匹配、
 * 依赖协调、异常冻结与恢复」，但其中两项在平台技能库里**零供给**（`x_lute.skills.gaps`）。
 * persona 只承载卡原文、skill-subset 只承载实际装配，**模型看不到两者的差**——实测中
 * AGT-002 因此在自我介绍里把「异常冻结与恢复」宣称为自己能接的活。
 *
 * 卡原文已经写过「这些名称不代表现有工具接口」，但那是**泛化的免责声明**；本段把它落实为
 * 逐条可核对的清单，并明确「优先于上文材料声明的能力名」，让缺口从"模型不知道"变成"模型会主动说"。
 * @param {Array<{name: string, kind: string, supply: string[]}>} skillMapping - 材料技能名 → 平台供给。
 * @param {string[]} playbookIds - 本岗位参与的共享手册技能 id（如 PB-002）。
 * @returns {string} 供给实况段落。
 */
function renderSupplyStatus(skillMapping, playbookIds) {
  const gaps = skillMapping.filter((m) => m.kind === 'gap').map((m) => m.name)
  const lines = [
    '── 你的技能供给实况 ──────────────────────────────────────────',
    '',
    '以下为可核对的平台实况，**优先于上文材料声明的能力名**（材料原文已写明',
    '「这些名称不代表现有工具接口」，本段把这句话落实为逐条清单）。',
    '',
    '材料声明的业务技能 → 平台实际装配的技能：',
    '',
  ]
  for (const m of skillMapping) {
    const target = m.supply.length > 0 ? m.supply.join('、') : '**平台无供给**'
    const tag = m.kind === 'partial' ? '（仅部分覆盖）' : ''
    lines.push(`- ${m.name} → ${target}${tag}`)
  }
  lines.push('')
  if (gaps.length > 0) {
    lines.push(`其中 **${gaps.join('、')}** 在平台技能库里没有任何对应供给：这类任务你要靠推理与`)
    lines.push('流程承担，**不得假设有工具或 Skill 支撑**，也不得把它当成已具备的能力；')
    lines.push('遇到这类任务应明示能力缺口，而不是宣称能做到。')
  } else {
    lines.push('上面每一项都已映射到平台技能库中真实存在的技能，可直接使用。')
  }
  if (playbookIds.length > 0) {
    lines.push('')
    lines.push(`另装配了你参与手册的共享技能 ${playbookIds.length} 本：` +
      `${playbookIds.map((p) => p.toLowerCase()).join('、')}（正文即手册全文，按需读取）。`)
  }
  return lines.join('\n')
}

/**
 * 把岗位卡全文渲染进 persona：字面块标量 `|-`（不是 `>-`，折叠标量会把行粘成一段、毁掉原文结构）。
 * 头部只加身份与来源说明，文末追加供给实况；**不改写、不摘要原文任何一个字**。
 * @param {object} role - 材料 role-catalog 记录。
 * @param {string} cardText - 岗位卡全文（逐字）。
 * @param {object} provenance - 平面/责任域名与源文件溯源信息。
 * @param {string} supplyStatus - {@link renderSupplyStatus} 的产物。
 * @returns {string} persona 正文。
 */
function renderPersona(role, cardText, provenance, supplyStatus) {
  const header = [
    `你是 {{model}} 驱动的 AI 岗位分身「${role.alias}」，岗位 ${role.id} ${role.title}，` +
      `所属组织平面「${provenance.planeName}」，责任域「${provenance.domainName}」。你的工作目录是 {{cwd}}。`,
    '',
    `以下是你作为该岗位分身的完整定义，**逐字保留**自项目《AI组织变革》的岗位卡原文` +
      `（材料快照 ${SNAPSHOT_DATE}；源文件 ${provenance.roleCardPath}；sha256 ${provenance.roleCardSha}）。`,
    '',
    `材料原文保留其撰写时点的表述，其中的相对链接（如 ../../06-playbooks/PLAYBOOKS.md）指向材料仓库` +
      `（根目录 ${MATERIAL_ROOT}）。`,
    '',
    `其中「Harness 映射」一节所述「当前没有对应生产 preset、凭据或导入配置」描述的是材料撰写时点的事实；` +
      `本 preset 是该岗位定义的结构化落地方案。岗位的生产授权状态仍为 false（production_authorized=false），` +
      `这与 ADR-0005/D-023 的 Role Release Bundle 七状态门禁一致——本 preset 属设计期草案，不构成生产授权。`,
    '',
    '── 岗位卡原文（逐字）─────────────────────────────────────────────',
    '',
  ].join('\n')
  const footer = [
    '',
    '── 岗位卡原文结束 ─────────────────────────────────────────────',
    '',
    supplyStatus,
  ].join('\n')
  return `${header}${cardText.replace(/\s+$/, '')}${footer}`
}

/** 以一个缩进级别把多行文本渲染成 YAML 字面块标量体。 */
function yamlLiteralBlock(text, indent) {
  const pad = ' '.repeat(indent)
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? '' : pad + line))
    .join('\n')
}

/** 从 shipped standard 组合里取出「一个顶层行块」的起止行号（含其上方紧邻的注释与空行留给调用方）。 */
function rowBlockRange(lines, id) {
  const start = lines.findIndex((l) => l === `- id: ${id}`)
  if (start < 0) throw new Error(`standard 组合里找不到行: ${id}`)
  let end = start + 1
  while (end < lines.length && !lines[end].startsWith('- id: ')) end++
  return [start, end]
}

/**
 * 组装 agent.cordis.yml：以 shipped standard 为基座（D5 决策），
 * 替换 persona 行块为岗位 persona，并在 skills 段追加 dsh-skill-subset 行。
 */
function renderComposition(personaText, skills) {
  const std = readFileSync(STANDARD_COMPOSITION, 'utf8')
  const lines = std.split('\n')

  const [pStart, pEnd] = rowBlockRange(lines, 'persona')
  const personaRow = [
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    '    text: |-',
    yamlLiteralBlock(personaText, 6),
  ]
  lines.splice(pStart, pEnd - pStart, ...personaRow)

  const [, tEnd] = rowBlockRange(lines, 'tool-skill')
  const subsetRow = [
    '',
    '# 本岗位的技能子集：在 preset scope 层把这些技能重注册为模型可见（遮蔽全局 model-off 副本）。',
    '# 名单由 scripts/role-presets/generate.mjs 依据材料 role-catalog.json 的 skills 字段映射而来。',
    '- id: skill-subset',
    "  name: 'dsh-skill-subset'",
    '  config:',
    `    skills: [${skills.map((s) => `'${s}'`).join(', ')}]`,
    '    respectFileFlags: true',
    '',
  ]
  lines.splice(tEnd, 0, ...subsetRow)

  return lines.join('\n')
}

/** YAML 单行字符串安全引号。 */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function renderPresetYml(name, description, order, icon) {
  const lines = [
    `name: ${q(name)}`,
    `description: ${q(description)}`,
    `order: ${order}`,
  ]
  // icon 是官方显式消费的显示字段：roster 把它送到前端，卡片渲染成 <img class="cardAvatar">。
  // 单引号 + YAML 单引号转义：data URI 里没有单引号，但保持与 name/description 同一套转义纪律。
  if (icon) lines.push(`icon: ${q(icon)}`)
  lines.push('')
  return lines.join('\n')
}

// ── 载入全部来源 ────────────────────────────────────────────────────────────

function loadSources() {
  const files = {
    roleCatalog: SOURCE_FILES.roleCatalog,
    organizationGraph: SOURCE_FILES.organizationGraph,
    managementGraph: SOURCE_FILES.managementGraph,
    lifecycle: SOURCE_FILES.lifecycle,
    collaborationGraph: SOURCE_FILES.collaborationGraph,
    flowCatalog: SOURCE_FILES.flowCatalog,
    playbooks: SOURCE_FILES.playbooks,
    roster: SOURCE_FILES.roster,
  }
  const text = {}
  const hashes = {}
  for (const [key, rel] of Object.entries(files)) {
    text[key] = raw(rel)
    hashes[key] = sha256(text[key])
  }
  return {
    text,
    hashes,
    roleCatalog: JSON.parse(text.roleCatalog),
    organizationGraph: JSON.parse(text.organizationGraph),
    managementGraph: JSON.parse(text.managementGraph),
    lifecycle: JSON.parse(text.lifecycle),
    collaborationGraph: JSON.parse(text.collaborationGraph),
  }
}

/**
 * 载入图标索引：preset id → data URI。
 *
 * 条目 id 与 preset id 同名，所以这里是直查而不是映射；查不到就抛，
 * 让「某个岗位没头像」在生成期暴露，而不是变成一张空白卡片发到界面上。
 * @returns {Map<string, string>} catalog 条目 id 到内联 SVG 头像的映射。
 */
function loadIconIndex() {
  if (!existsSync(ICON_MANIFEST)) {
    throw new Error(
      `图标索引不存在：${ICON_MANIFEST}\n` +
        '  先生成头像库：node ~/.dsh/skills/lute-brand-icons/scripts/build.js\n' +
        '  （或用 ROLE_ICON_MANIFEST 指向别处）',
    )
  }
  const rows = JSON.parse(readFileSync(ICON_MANIFEST, 'utf8'))
  return new Map(rows.map((row) => [row.id, row.icon]))
}

/** 计算 order：平面基座 + 平面内责任域段 + 域内序号（域段按 AGT 升序首次出现顺序分配）。 */
function computeOrders(orgGraph) {
  const byPlane = new Map()
  for (const r of orgGraph.roles) {
    if (!byPlane.has(r.plane_id)) byPlane.set(r.plane_id, [])
    byPlane.get(r.plane_id).push(r)
  }
  const orders = new Map()
  for (const [planeId, roles] of byPlane) {
    const base = PLANE_BASE[planeId]
    if (base === undefined) throw new Error(`未知平面 ${planeId}`)
    const sorted = [...roles].sort((a, b) => a.id.localeCompare(b.id))
    const domainSlot = new Map()
    const seqInDomain = new Map()
    for (const r of sorted) {
      if (!domainSlot.has(r.domain_view_id)) domainSlot.set(r.domain_view_id, domainSlot.size + 1)
      const slot = domainSlot.get(r.domain_view_id)
      const seq = (seqInDomain.get(r.domain_view_id) || 0) + 1
      seqInDomain.set(r.domain_view_id, seq)
      orders.set(r.id, base + slot * 100 + seq)
    }
  }
  return orders
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

function main() {
  const src = loadSources()
  const orgRoles = new Map(src.organizationGraph.roles.map((r) => [r.id, r]))
  const planes = new Map(src.organizationGraph.planes.map((p) => [p.id, p]))
  const domains = new Map(src.organizationGraph.domain_views.map((d) => [d.id, d]))
  const orgEdges = new Map()
  for (const e of src.organizationGraph.edges) {
    for (const side of ['from', 'to']) {
      const k = e[side]
      if (!orgEdges.has(k)) orgEdges.set(k, [])
      orgEdges.get(k).push(e)
    }
  }
  const mgmtBindings = new Map(src.managementGraph.role_bindings.map((b) => [b.role_id, b]))
  const mgmtEdges = new Map()
  for (const e of src.managementGraph.edges) {
    for (const side of ['from', 'to']) {
      const k = e[side]
      if (!mgmtEdges.has(k)) mgmtEdges.set(k, [])
      mgmtEdges.get(k).push(e)
    }
  }
  const lifeStatus = new Map(src.lifecycle.role_release_status.map((s) => [s.role_id, s]))
  const contributions = new Map(src.collaborationGraph.role_contributions.map((c) => [c.role_id, c]))
  const flowsById = new Map(src.collaborationGraph.flows.map((f) => [f.id, f]))
  const scenariosById = new Map(src.collaborationGraph.scenarios.map((s) => [s.id, s]))
  const collabEdges = new Map()
  for (const e of src.collaborationGraph.edges) {
    for (const side of ['from', 'to']) {
      const k = e[side]
      if (!collabEdges.has(k)) collabEdges.set(k, [])
      collabEdges.get(k).push(e)
    }
  }
  const orders = computeOrders(src.organizationGraph)
  const iconIndex = loadIconIndex()
  const flowCatalogSections = splitSections(src.text.flowCatalog, 'FLOW-')
  const playbookSections = splitSections(src.text.playbooks, 'PB-')
  const rosterLines = src.text.roster.split('\n')

  // 技能供给：材料的中文业务技能名 → 现有技能库英文 id（skill-map.json，人工语义映射），
  // 外加该岗位参与的**共享** Playbook 技能 pb-00X（8 份手册装成全局技能，不逐 preset 复制）。
  const skillMap = JSON.parse(readFileSync(SKILL_MAP_PATH, 'utf8')).skills
  const installedSkills = new Set(
    readdirSync(SKILLS_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  )
  const danglingRefs = new Set()

  /** 解析一个岗位的 skill-subset：映射供给并集 + 参与的 Playbook 技能；返回映射明细供 manifest 存档。 */
  function resolveSkills(role, playbookIds) {
    const mapping = (role.skills || []).map((name) => {
      const entry = skillMap[name]
      if (!entry) throw new Error(`${role.id}: 业务技能名未入映射表 → ${name}`)
      return { name, kind: entry.kind, supply: entry.supply, ...(entry.note ? { note: entry.note } : {}) }
    })
    const ids = new Set()
    for (const d of mapping) for (const s of d.supply) ids.add(s)
    for (const pb of playbookIds) ids.add(pb.toLowerCase())
    for (const id of ids) if (!installedSkills.has(id)) danglingRefs.add(`${role.id} → ${id}`)
    return { ids: [...ids].sort(), mapping }
  }

  const rows = []
  let written = 0
  let skipped = 0

  for (const role of src.roleCatalog.roles) {
    const id = role.id
    const org = orgRoles.get(id)
    const plane = planes.get(org.plane_id)
    const domain = domains.get(org.domain_view_id)
    const cardText = cardOf(id)
    const cardSha = sha256(cardText)
    const cardPath = SOURCE_FILES.roleCard(id)
    const sections = cardSections(cardText)

    const contribution = contributions.get(id)
    const flowIds = [...new Set([...(contribution?.eligible_flow_ids || []), ...(role.flows || [])])].sort()
    const flowRecords = flowIds.map((f) => flowsById.get(f)).filter(Boolean)
    const scenarioIdsFromFlows = [...new Set(flowRecords.flatMap((f) => f.scenario_ids || []))].sort()
    const scenarioRecords = [...new Set([...(role.scenarios || []), ...scenarioIdsFromFlows])]
      .sort()
      .map((s) => scenariosById.get(s))
      .filter(Boolean)
    const playbookIds = [...new Set([...(role.playbooks || []), ...flowRecords.map((f) => f.playbook_id)])]
      .filter(Boolean)
      .sort()
    const playbookRecords = playbookIds
      .map((pb) => playbookSections.find((s) => s.heading.startsWith(`## ${pb} `)))
      .filter(Boolean)
    const flowCatalogRecords = flowCatalogSections.filter((s) =>
      flowIds.some((f) => s.heading.startsWith(`## ${f} `)),
    )
    const rosterRow = rosterLines.find((l) => l.includes(`[${id}](roles/${id}.md)`)) || null

    const { ids: skillIds, mapping: skillMapping } = resolveSkills(role, playbookIds)

    // 本岗位作为**队长**时的选路条件，逐条取自各流程的 primary_role_selector。
    // 材料对零匹配/多匹配一律定 WAIT —— 编队生成器不得在此猜测队长。
    const leadRules = flowRecords.flatMap((flow) => {
      const selector = flow.primary_role_selector ?? {}
      return (selector.rules ?? [])
        .filter((rule) => rule.role_id === id)
        .map((rule) => ({
          flow: flow.id,
          rule: rule.selector_rule_id,
          condition: rule.condition_description,
          unconditional_default: rule.is_unconditional_default === true,
          selector_status: selector.status ?? null,
          zero_or_multiple_match_disposition: selector.zero_or_multiple_match_disposition ?? null,
        }))
    })

    const persona = renderPersona(role, cardText, {
      planeName: plane.name,
      domainName: domain.name,
      roleCardPath: join(MATERIAL_ROOT, cardPath),
      roleCardSha: cardSha,
    }, renderSupplyStatus(skillMapping, playbookIds))

    const composition = renderComposition(persona, skillIds)

    const order = orders.get(id)
    const presetId = `agt-${id.slice(4)}`
    const name = `${role.alias} · ${role.title}`
    const description =
      `【${plane.name}·${domain.name}】${role.mission}（标准产物：${role.artifact}）`
    const icon = iconIndex.get(presetId)
    if (!icon) {
      throw new Error(
        `岗位 ${presetId}（${name}）在图标库里没有对应头像。\n` +
          `  期望 ${ICON_MANIFEST} 里存在 id="${presetId}" 的条目。\n` +
          '  先生成头像库：node ~/.dsh/skills/lute-brand-icons/scripts/build.js',
      )
    }
    const presetYml = renderPresetYml(name, description, order, icon)

    const manifest = {
      format: 'dsh-preset',
      version: 2,
      id: presetId,
      name,
      description,
      sourceDshVersion: SOURCE_DSH_VERSION,
      // 与 preset.yml 里那一份**同一个字符串**：官方卡片与自建矩阵面板读到的头像必然一致。
      icon,
      material: {
        snapshot_date: SNAPSHOT_DATE,
        source_root: MATERIAL_ROOT,
        source_hashes: src.hashes,
        role_card: { path: cardPath, sha256: cardSha, text: cardText, sections },
        role_catalog: {
          path: SOURCE_FILES.roleCatalog,
          sha256: src.hashes.roleCatalog,
          record: role,
        },
        organization_graph: {
          path: SOURCE_FILES.organizationGraph,
          sha256: src.hashes.organizationGraph,
          role_entry: org,
          plane,
          domain_view: domain,
          edges: orgEdges.get(id) || [],
        },
        agent_management_graph: {
          path: SOURCE_FILES.managementGraph,
          sha256: src.hashes.managementGraph,
          role_binding: mgmtBindings.get(id) || null,
          contract_types: src.managementGraph.contract_types,
          release_rules: src.managementGraph.release_rules,
          edges: mgmtEdges.get(id) || [],
        },
        agent_lifecycle: {
          path: SOURCE_FILES.lifecycle,
          sha256: src.hashes.lifecycle,
          role_release_status: lifeStatus.get(id) || null,
          states: src.lifecycle.states,
          transitions: src.lifecycle.transitions,
        },
        collaboration_graph: {
          path: SOURCE_FILES.collaborationGraph,
          sha256: src.hashes.collaborationGraph,
          role_contribution: contribution || null,
          flows: flowRecords,
          scenarios: scenarioRecords,
          edges: collabEdges.get(id) || [],
        },
        flow_catalog: {
          path: SOURCE_FILES.flowCatalog,
          sha256: src.hashes.flowCatalog,
          sections: flowCatalogRecords,
        },
        playbooks: {
          path: SOURCE_FILES.playbooks,
          sha256: src.hashes.playbooks,
          sections: playbookRecords,
        },
        roster: { path: SOURCE_FILES.roster, sha256: src.hashes.roster, row: rosterRow },
      },
      x_lute: {
        plane: { id: plane.id, name: plane.name, purpose: plane.purpose },
        domain: { id: domain.id, name: domain.name },
        order,
        lifecycle: {
          status: 'draft',
          production_authorized: false,
          note: '设计期草案：与材料 ADR-0005/D-023 的 Role Release Bundle 七状态门禁一致，不构成生产授权。',
        },
        squad: {
          // 队长资格由材料决定，不是常量：只有 primary_eligible_flow_ids 非空的岗位
          // 才可能担任某条工单的主岗位人格（材料 50 个岗位中仅 12 个具备）。
          // 硬编码 true 会让编队生成器选出一个永远当不了队长的岗位。
          can_be_primary: (contribution?.primary_eligible_flow_ids || []).length > 0,
          primary_flows: contribution?.primary_eligible_flow_ids || [],
          eligible_flows: contribution?.eligible_flow_ids || [],
          lead_rules: leadRules,
          contribution_modes: contribution?.contribution_modes || [],
          collaborates_with: role.collaborates_with || [],
          artifact: role.artifact,
          metrics: role.metrics,
          skills: role.skills || [],
        },
        skills: {
          mapping_source: 'scripts/role-presets/skill-map.json',
          subset: skillIds,
          material_skill_names: role.skills || [],
          mapping: skillMapping,
          gaps: skillMapping.filter((d) => d.kind === 'gap').map((d) => d.name),
          shared_playbook_skills: playbookIds.map((p) => p.toLowerCase()),
        },
      },
    }

    const dirId = `agt-${id.slice(4)}`
    const dir = join(OUT_ROOT, dirId)
    rows.push({
      id,
      dirId,
      order,
      plane: plane.name,
      domain: domain.name,
      name,
      sections: sections.length,
      cardBytes: cardText.length,
      flows: flowIds.length,
      playbooks: playbookIds.length,
      scenarios: scenarioRecords.length,
      squadSkills: (role.skills || []).length,
      subsetSkills: skillIds.length,
      gaps: skillMapping.filter((d) => d.kind === 'gap').length,
      collab: (role.collaborates_with || []).length,
    })

    if (DRY_RUN) continue
    mkdirSync(dir, { recursive: true })
    for (const stale of ['preset.yml', 'manifest.json', 'agent.cordis.yml']) {
      const p = join(dir, stale)
      if (existsSync(p)) rmSync(p)
    }
    writeFileSync(join(dir, 'preset.yml'), presetYml, 'utf8')
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    writeFileSync(join(dir, 'agent.cordis.yml'), composition, 'utf8')
    written++
  }

  // ── 汇总 ──
  console.log(`材料根：${MATERIAL_ROOT}`)
  console.log(`输出根：${OUT_ROOT}${DRY_RUN ? '  （--dry-run，未写盘）' : ''}`)
  console.log(`基座：shipped standard 行集（D5）+ persona 替换 + skill-subset 追加`)
  console.log()
  console.log(
    ['AGT', 'dir', 'order', '平面', '责任域', '节', '卡字符', 'FLOW', 'PB', 'SCN', '映射', 'subset', '缺口', '协作'].join('\t'),
  )
  for (const r of rows) {
    console.log(
      [
        r.id,
        r.dirId,
        r.order,
        r.plane,
        r.domain,
        r.sections,
        r.cardBytes,
        r.flows,
        r.playbooks,
        r.scenarios,
        r.squadSkills,
        r.subsetSkills,
        r.gaps,
        r.collab,
      ].join('\t'),
    )
  }
  console.log()
  const totalSections = rows.reduce((a, r) => a + r.sections, 0)
  const totalCardBytes = rows.reduce((a, r) => a + r.cardBytes, 0)
  console.log(`岗位数：${rows.length}（期望 50）`)
  console.log(`岗位卡小节总数：${totalSections}（期望 50 × 7 = 350）`)
  console.log(`岗位卡字节总数：${totalCardBytes}`)
  const byPlane = {}
  for (const r of rows) byPlane[r.plane] = (byPlane[r.plane] || 0) + 1
  console.log(`平面分布：${JSON.stringify(byPlane)}（期望 经营管理 5 / 业务运营 35 / 独立控制 5 / 数据与Agent平台 5）`)
  const totalSubset = rows.reduce((a, r) => a + r.subsetSkills, 0)
  const totalGaps = rows.reduce((a, r) => a + r.gaps, 0)
  console.log(`skill-subset 引用总条目：${totalSubset}（跨岗位去重后 ${new Set(rows.map((r) => r.subsetSkills)).size} 种规模）`)
  console.log(`未获供给的材料业务技能名（gap）条目数：${totalGaps}`)
  console.log(`技能库实际规模：${installedSkills.size} 项（含 8 份 pb-00X 共享手册技能）`)
  if (danglingRefs.size > 0) {
    console.error(`\n✗ skill-subset 存在悬空引用（${danglingRefs.size} 条）—— 会静默遮蔽，必须修：`)
    for (const d of [...danglingRefs].slice(0, 20)) console.error('  ' + d)
    process.exit(1)
  }
  console.log('★ skill-subset 全部引用真实存在的技能（0 悬空）')
  if (!DRY_RUN) console.log(`已写入：${written} 个 preset 目录，跳过 ${skipped}`)
}

main()
