#!/usr/bin/env node
/**
 * 按 `ruleset-declaration.json` 生成（并在显式 `--apply` 时创建）远端 ruleset（QG-008）。
 *
 * ## 为什么 payload 由声明**推导**而不是手写第二份
 *
 * 手写一份 payload、声明里再写一份，就等于同一条事实有两个家——它们迟早不同，
 * 而不同的那一刻「审计通过」会变成谎话（审计比的是声明，生效的是 payload）。
 * 所以唯一的事实是声明；本脚本只做形状转换（声明 → GitHub API 的字段命名）。
 *
 * ## 默认是 dry-run
 *
 * 不带 `--apply` 只打印将要发送的 payload，不碰远端。远端写操作必须显式。
 * 这不是谨慎过头：本仓库把「外部状态变更」定为需要**动作发生前**的明确授权
 * （风险分级 R3），默认安全值只能是「什么都不做」。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/gates/apply-rulesets.mjs                     # dry-run，打印 payload
 * node scripts/gates/apply-rulesets.mjs --apply             # 创建（幂等：同名已存在则拒绝）
 * node scripts/gates/apply-rulesets.mjs --apply --json
 * ```
 */
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DECLARATION_REL_PATH, readDeclaration } from './ruleset-audit.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 声明里的一条 target 规则 → GitHub create-ruleset 的 payload。 */
function toPayload(entry, target) {
  return {
    name: entry.id,
    target,
    enforcement: entry.enforcement ?? 'active',
    conditions: { ref_name: { include: [entry.target], exclude: [] } },
    // 规则逐字透传：声明里写了 parameters 就带上，没写就不带。
    // `deletion` / `non_fast_forward` 的 schema 只有 `type`，多给字段会被 422 拒。
    rules: (entry.rules ?? []).map((rule) => (rule.parameters === undefined
      ? { type: rule.type }
      : { type: rule.type, parameters: stripComment(rule.parameters) })),
    bypass_actors: (entry.bypass_actors ?? []),
  }
}

/** 声明里的 `comment` 字段是给人看的，不进 API。 */
function stripComment(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(stripComment)
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'comment') continue
    out[key] = stripComment(entry)
  }
  return out
}

function ghApiJson(args) {
  try {
    return { value: JSON.parse(execFileSync('gh', args, { encoding: 'utf8' })), error: null }
  } catch (error) {
    const stderr = (error.stderr ?? '').toString().trim()
    return { value: null, error: new Error(stderr !== '' ? stderr.split('\n')[0] : error.message) }
  }
}

function main() {
  const apply = process.argv.includes('--apply')
  const json = process.argv.includes('--json')
  const declaration = readDeclaration(repoRoot)
  const repository = declaration.repository

  const payloads = [
    ...(declaration.branchRules ?? []).map((entry) => toPayload(entry, 'branch')),
    ...(declaration.tagRules ?? []).map((entry) => toPayload(entry, 'tag')),
  ]

  const results = []
  for (const payload of payloads) {
    if (!apply) {
      results.push({ name: payload.name, target: payload.target, action: 'dry-run', payload })
      continue
    }

    // 幂等：同名 ruleset 已存在就**拒绝**，不覆盖。
    // 覆盖会让「现在生效的到底是什么」需要靠时间戳推断，而审计要的是逐字确定。
    const listing = ghApiJson(['api', `repos/${repository}/rulesets`])
    if (listing.error !== null) {
      results.push({ name: payload.name, action: 'refused', reason: `读不到现有 ruleset：${listing.error.message}` })
      continue
    }
    const existing = (listing.value ?? []).find((entry) => entry?.name === payload.name)
    if (existing !== undefined) {
      results.push({
        name: payload.name,
        action: 'already-exists',
        reason: `同名 ruleset 已存在（id=${existing.id}）——本脚本不覆盖；要改请先删或改名`,
      })
      continue
    }

    // `gh api --input <file>`：JSON body 走临时文件。把 payload 塞进命令行参数会在
    // 参数长度与转义上出问题，而 `--input -` 需要自己管 stdin（execFileSync 不给字符串 stdin）。
    let created
    const tmp = join(tmpdir(), `qg008-ruleset-${payload.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
    try {
      writeFileSync(tmp, JSON.stringify(payload), 'utf8')
      created = ghApiJson(['api', '-X', 'POST', `repos/${repository}/rulesets`, '--input', tmp])
    } finally {
      try { rmSync(tmp, { force: true }) } catch { /* 临时文件删不掉不影响判定 */ }
    }
    if (created.error !== null) {
      results.push({ name: payload.name, action: 'failed', reason: created.error.message })
      continue
    }
    results.push({ name: payload.name, action: 'created', id: created.value?.id, target: created.value?.target })
  }

  if (json) {
    process.stdout.write(`${JSON.stringify({ repository, apply, declaration: DECLARATION_REL_PATH, results }, null, 2)}\n`)
  } else {
    process.stdout.write(`${apply ? 'apply' : 'dry-run'} ruleset（声明：${DECLARATION_REL_PATH}）\n`)
    for (const result of results) {
      process.stdout.write(`  - ${result.name} [${result.target}]：${result.action}`
        + `${result.id !== undefined ? ` id=${result.id}` : ''}`
        + `${result.reason !== undefined ? ` ${result.reason}` : ''}\n`)
      if (!apply) process.stdout.write(`${JSON.stringify(result.payload, null, 2).split('\n').map((line) => `      ${line}`).join('\n')}\n`)
    }
    if (!apply) process.stdout.write('  （dry-run：未提交任何远端变更；加 --apply 才创建）\n')
  }

  const failed = results.some((result) => result.action === 'failed' || result.action === 'refused')
  process.exitCode = failed ? 1 : 0
}

main()
