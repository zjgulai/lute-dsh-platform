#!/usr/bin/env node
/**
 * 50 岗位 preset 的**全量保真校验器**（「信息不要少了」的机器契约）
 *
 * 它回答的不是「文件在不在」，而是：材料里关于某个岗位的**每一条信息**，
 * 是否都逐字进了该岗位的 preset。校验分 12 层，任一层失败即非零退出：
 *
 *   L1 覆盖   材料里的 50 个岗位与产物目录一一对应，不多不少
 *   L2 归档   岗位卡全文（逐字）归档在 manifest，persona 只保留身份与 Soul 摘要
 *   L3 小节   岗位卡 7 个 ## 小节逐个逐字出现在 manifest（合计 350 节，0 缺失）
 *   L4 字段   role-catalog 的 20 个字段逐个 deepEqual，且**反向**无丢字段
 *   L5 归集   org / mgmt / lifecycle / collab / flow-catalog / playbooks / roster 七项来源
 *            逐条 deepEqual（含该岗位涉及的边）
 *   L6 哈希   记录在 manifest 里的 sha256 与源文件当前实际哈希一致（证明快照可追溯）
 *   L7 官方   产物通过平台自己的 preset lint（组合词汇合法）
 *   L8 技能   skill-subset 引用的每一个技能都真实存在（0 悬空）
 *   L9 编队   squad 契约与材料选路规则逐条一致，且零/多匹配一律 WAIT
 *   L10 头像  preset.yml 的 icon 存在、与图标库同一字符串、50 枚互不重样
 *   L11 角色资产  Soul / Role Playbook / Blueprint / Skill descriptor / Bundle 引用闭合
 *   L12 快照  source revision、generator revision、索引哈希和设计期运行边界可重算
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
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}
const canonicalJson = (value) => JSON.stringify(canonicalize(value))
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
const ROLE_ASSET_FILES = {
  rolePlaybookIndex: '06-playbooks/role-playbooks/index.json',
  presetBlueprintManifest: '10-platform/deepseek-harness/preset-blueprints/manifest.json',
  soul: (id) => `05-agents/roles/souls/${id}.soul.md`,
  rolePlaybook: (id) => `06-playbooks/role-playbooks/${id}.md`,
  presetBlueprint: (id) => `10-platform/deepseek-harness/preset-blueprints/${id}.json`,
}

function soulSection(soulText, heading) {
  const lines = soulText.split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`)
  if (start < 0) return null
  const body = []
  for (let i = start; i < lines.length; i++) {
    if (i > start && lines[i].startsWith('## ')) break
    body.push(lines[i])
  }
  return body.join('\n').replace(/\s+$/, '')
}

function expectedSoulSummary(soulText, soulPath, soulSha) {
  const sections = ['我是谁', '我的灵魂原则', '我绝不做什么', '我的停止信号']
  const bodies = sections.map((heading) => soulSection(soulText, heading))
  if (bodies.some((body) => body === null)) return null
  return [
    '── Soul Contract 摘要（身份 / 灵魂 / 硬边界 / 停止信号）────────────────',
    '',
    `来源：${soulPath}；sha256 ${soulSha}`,
    '以下摘要是常驻身份约束；完整 Soul Contract 与 Role Playbook 只在 manifest 的角色资产区按需寻址。',
    '',
    ...bodies.flatMap((body) => [body, '']),
  ].join('\n').replace(/\n+$/, '')
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
  for (const rel of [ROLE_ASSET_FILES.rolePlaybookIndex, ROLE_ASSET_FILES.presetBlueprintManifest]) {
    if (!existsSync(join(DOCS, rel))) fail('L0', `角色资产索引缺失：${rel}`)
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
  const rolePlaybookIndexText = raw(ROLE_ASSET_FILES.rolePlaybookIndex)
  const presetBlueprintManifestText = raw(ROLE_ASSET_FILES.presetBlueprintManifest)
  const rolePlaybookIndex = JSON.parse(rolePlaybookIndexText)
  const presetBlueprintManifest = JSON.parse(presetBlueprintManifestText)
  const playbooksByRole = new Map((rolePlaybookIndex.roles || []).map((entry) => [entry.role_id, entry]))
  const blueprintsByRole = new Map((presetBlueprintManifest.roles || []).map((entry) => [entry.role_id, entry]))
  for (const role of roleCatalog.roles) {
    for (const rel of [ROLE_ASSET_FILES.soul(role.id), ROLE_ASSET_FILES.rolePlaybook(role.id), ROLE_ASSET_FILES.presetBlueprint(role.id)]) {
      if (!existsSync(join(DOCS, rel))) fail('L0', `${role.id}: 角色资产缺失：${rel}`)
    }
  }
  if (failures.length) return report()

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
  const assetIndexHashes = {
    rolePlaybookIndex: sha256(rolePlaybookIndexText),
    presetBlueprintManifest: sha256(presetBlueprintManifestText),
  }
  const roleAssetSource = new Map()
  for (const role of roleCatalog.roles) {
    const profileText = raw(`05-agents/roles/${role.id}.md`)
    const soulText = raw(ROLE_ASSET_FILES.soul(role.id))
    const rolePlaybookText = raw(ROLE_ASSET_FILES.rolePlaybook(role.id))
    const presetBlueprintText = raw(ROLE_ASSET_FILES.presetBlueprint(role.id))
    roleAssetSource.set(role.id, {
      profileText,
      soulText,
      rolePlaybookText,
      presetBlueprintText,
      blueprint: JSON.parse(presetBlueprintText),
      hashes: {
        roleCard: sha256(profileText),
        soul: sha256(soulText),
        rolePlaybook: sha256(rolePlaybookText),
        presetBlueprint: sha256(presetBlueprintText),
      },
    })
  }
  const sourceRevisionPayload = {
    shared: sourceHashes,
    indexes: assetIndexHashes,
    roles: [...roleAssetSource.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, assets]) => ({
      id,
      roleCard: assets.hashes.roleCard,
      soul: assets.hashes.soul,
      rolePlaybook: assets.hashes.rolePlaybook,
      presetBlueprint: assets.hashes.presetBlueprint,
    })),
  }
  const expectedSourceRevision = process.env.ROLE_SOURCE_REVISION || `source-hash:${sha256(canonicalJson(sourceRevisionPayload))}`
  const generatePath = fileURLToPath(new URL('./generate.mjs', import.meta.url))
  const expectedGeneratorRevision = process.env.ROLE_GENERATOR_REVISION || sha256(readFileSync(generatePath, 'utf8'))

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

    // ── L2 全文归档 / persona 摘要 ──
    const persona = extractPersonaText(composition)
    if (persona === null) {
      fail('L2', `${dirId}: 找不到 persona 字面块（    text: |-）`)
    } else {
      const card = cardText.replace(/\s+$/, '')
      if (persona.includes(card)) fail('L2', `${dirId}: 完整岗位卡不应常驻 persona，应归档在 manifest.material.role_card`)
      else if (!persona.includes(`岗位 ${id} ${role.title}`)) fail('L2', `${dirId}: persona 缺少岗位身份摘要`)
      else if (!manifest.material.role_card.text.includes(card)) fail('L2', `${dirId}: manifest 未逐字归档岗位卡全文`)
      else ok()
    }

    // ── L3 小节（逐节逐字）──
    const sections = cardSections(cardText)
    if (sections.length !== 7) fail('L3', `${dirId}: 岗位卡小节数为 ${sections.length}，期望 7`)
    for (const sec of sections) {
      sectionTotal++
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

    // ── L11 角色资产（Soul / Role Playbook / Blueprint / Skill / Bundle）──
    const sourceAsset = roleAssetSource.get(id)
    const assets = manifest.role_assets
    const expectedPresetId = dirId
    const playbookIndexEntry = playbooksByRole.get(id)
    const blueprintIndexEntry = blueprintsByRole.get(id)
    if (!assets || assets.role_id !== id || assets.preset_id !== expectedPresetId) {
      fail('L11', `${dirId}: manifest.role_assets 缺失或 role_id/preset_id 不一致`)
    } else ok()
    if (!playbookIndexEntry || !blueprintIndexEntry) {
      fail('L11', `${dirId}: 角色资产索引缺少该岗位引用`)
    } else ok()
    if (assets?.role_profile?.ref !== `docs/05-agents/roles/${id}.md` ||
        assets?.role_profile?.sha256 !== sourceAsset?.hashes.roleCard) {
      fail('L11', `${dirId}: role_profile 引用或哈希不一致`)
    } else ok()
    const soulPath = ROLE_ASSET_FILES.soul(id)
    const rolePlaybookPath = ROLE_ASSET_FILES.rolePlaybook(id)
    const blueprintPath = ROLE_ASSET_FILES.presetBlueprint(id)
    const soul = assets?.soul
    if (soul?.ref !== `docs/${soulPath}` || soul?.sha256 !== sourceAsset?.hashes.soul || soul?.text !== sourceAsset?.soulText) {
      fail('L11', `${dirId}: Soul Contract 资产未逐字闭合`)
    } else ok()
    const summary = expectedSoulSummary(sourceAsset?.soulText || '', `docs/${soulPath}`, sourceAsset?.hashes.soul)
    if (!summary || soul?.persona_summary_sha256 !== sha256(summary) || persona === null || !persona.includes(summary)) {
      fail('L11', `${dirId}: persona 未包含可重算的 Soul 摘要`)
    } else ok()
    const rolePlaybook = assets?.role_playbook
    const skillId = `role-playbook-${dirId}`
    if (rolePlaybook?.ref !== `docs/${rolePlaybookPath}` ||
        rolePlaybook?.sha256 !== sourceAsset?.hashes.rolePlaybook ||
        rolePlaybook?.body_sha256 !== sourceAsset?.hashes.rolePlaybook ||
        rolePlaybook?.text !== sourceAsset?.rolePlaybookText ||
        rolePlaybook?.skill_id !== skillId ||
        rolePlaybook?.user_invocable !== false ||
        rolePlaybook?.installed !== false ||
        typeof rolePlaybook?.source !== 'string' || rolePlaybook.source.length === 0 ||
        rolePlaybook?.loader !== 'target-host-to-be-verified') {
      fail('L11', `${dirId}: Role Playbook Skill descriptor 或正文不一致`)
    } else ok()
    if (persona !== null && persona.includes(sourceAsset?.rolePlaybookText?.replace(/\s+$/, ''))) {
      fail('L11', `${dirId}: 完整 Role Playbook 不得常驻 persona`)
    } else ok()
    const blueprint = assets?.preset_blueprint
    if (blueprint?.ref !== `docs/${blueprintPath}` ||
        blueprint?.sha256 !== sourceAsset?.hashes.presetBlueprint ||
        blueprint?.record === undefined ||
        !isDeepStrictEqual(blueprint.record, sourceAsset?.blueprint)) {
      fail('L11', `${dirId}: Preset Blueprint 资产未逐字闭合`)
    } else ok()
    const bundle = assets?.role_release_bundle_ref
    const bundleInput = {
      role_id: id,
      preset_id: dirId,
      version: sourceAsset?.blueprint?.version,
      role_card_sha256: sourceAsset?.hashes.roleCard,
      soul_contract_sha256: sourceAsset?.hashes.soul,
      role_playbook_sha256: sourceAsset?.hashes.rolePlaybook,
      preset_blueprint_sha256: sourceAsset?.hashes.presetBlueprint,
      production_authorized: false,
    }
    const expectedBundleHash = `sha256:${sha256(canonicalJson(bundleInput))}`
    if (bundle?.bundle_id !== `RRB-${id}` || bundle?.version !== sourceAsset?.blueprint?.version ||
        bundle?.content_hash !== expectedBundleHash || bundle?.status !== 'blueprint_only_not_importable') {
      fail('L11', `${dirId}: Role Release Bundle 引用不可重算或状态不正确`)
    } else ok()
  }

  // ── 汇总断言 ──
  if (sectionTotal !== expectedIds.length * 7) {
    fail('L3', `小节总数 ${sectionTotal}，期望 ${expectedIds.length * 7}`)
  } else ok()

  // ── L12 输入快照与设计期边界 ──
  for (const role of roleCatalog.roles) {
    const dirId = `agt-${role.id.slice(4)}`
    const manPath = join(OUT_ROOT, dirId, 'manifest.json')
    if (!existsSync(manPath)) continue
    const man = JSON.parse(readFileSync(manPath, 'utf8'))
    const snapshot = man.source_snapshot
    const sourceAsset = roleAssetSource.get(role.id)
    if (!snapshot || snapshot.source_revision !== expectedSourceRevision ||
        snapshot.generator_revision !== expectedGeneratorRevision ||
        snapshot.generator_rules_revision !== expectedGeneratorRevision ||
        !isDeepStrictEqual(snapshot.shared_source_hashes, sourceHashes) ||
        !isDeepStrictEqual(snapshot.asset_index_hashes, assetIndexHashes) ||
        !isDeepStrictEqual(snapshot.source_hashes, {
          role_card: sourceAsset.hashes.roleCard,
          soul_contract: sourceAsset.hashes.soul,
          role_playbook: sourceAsset.hashes.rolePlaybook,
          preset_blueprint: sourceAsset.hashes.presetBlueprint,
        })) {
      fail('L12', `${dirId}: source_snapshot 无法按当前输入快照重算`)
    } else ok()
    const runtime = man?.role_assets?.runtime_contract
    const bp = sourceAsset.blueprint
    if (runtime?.status !== 'blueprint_only_not_importable' ||
        runtime?.production_authorized !== false ||
        runtime?.composition_owner !== 'external_case_control' ||
        runtime?.peer_chat !== false || runtime?.re_delegation !== false ||
        runtime?.can_execute_assets !== false ||
        runtime?.action_boundary !== 'action_intent_only_to_model_external_policy_gate' ||
        bp?.assurance?.production_authorized !== false) {
      fail('L12', `${dirId}: 设计期运行边界或生产授权标记不符合契约`)
    } else ok()
  }

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
    console.log('\n★ 全量保真校验通过：L1 覆盖 / L2 归档与摘要 / L3 小节 / L4 字段 / L5 归集 / L6 哈希 / L7 官方lint / L8 技能引用 / L9 编队契约 / L10 头像 / L11 角色资产 / L12 输入快照 全部闭合')
    process.exit(0)
  }
  console.log(`\n✗ 全量保真校验失败：${failures.length} 条`)
  for (const f of failures.slice(0, 40)) console.log('  ' + f)
  if (failures.length > 40) console.log(`  … 其余 ${failures.length - 40} 条省略`)
  process.exit(1)
}

main()
