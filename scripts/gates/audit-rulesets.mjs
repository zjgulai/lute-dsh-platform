#!/usr/bin/env node
/**
 * `main` / `v*` 保护的只读审计入口（QG-008）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/gates/audit-rulesets.mjs            # 人读
 * node scripts/gates/audit-rulesets.mjs --json     # 机读
 * ```
 *
 * ## 退出码是契约（三态，与 ADR-0094 一致）
 *
 * | 码 | 含义 |
 * |---|---|
 * | 0 | API 读数与声明**全等** |
 * | 1 | 读数拿得到，但与声明**不符**（缺规则、多规则、check 名不等、bypass 不等…） |
 * | 2 | **读数拿不到**（未认证 / 权限不足 / 网络故障 / API 形状变了） |
 *
 * 2 与 1 分开，是卡面负例的直接要求：「API 权限不足…权限不足不得解释成『未配置所以通过』」。
 * 合并成一个非零码会让读的人以为「已经比对过、只是不一致」——而实际上什么都没比。
 *
 * ## 为什么用 `gh api` 而不是 fetch + token
 *
 * 凭证只进 DSH 凭据服务与 `gh` 自己的 keyring（用户级 AGENTS.md 的红线），
 * 本脚本**不读任何环境变量里的 token**，也不把 token 写进任何输出。
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUDIT_AUTHORITY,
  AUDIT_FAILURE_KINDS,
  DECLARATION_REL_PATH,
  compareRulesetsToDeclaration,
  readDeclaration,
  workflowJobNames,
} from './ruleset-audit.mjs'
import { parseWorkflowYaml, readWorkflow, WORKFLOW_REL_PATH } from './ci-workflow.mjs'

const EXIT = Object.freeze({ MATCH: 0, MISMATCH: 1, NO_READING: 2 })

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 用 gh 做一次 GET。失败时**不**吞掉原因，交给上层判成 NO_READING。 */
function ghApiJson(path) {
  try {
    const raw = execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { value: JSON.parse(raw), error: null }
  } catch (error) {
    const stderr = (error.stderr ?? '').toString().trim()
    const message = stderr !== '' ? stderr.split('\n')[0] : (error.message ?? '未知错误')
    return { value: null, error: new Error(message) }
  }
}

function main() {
  const json = process.argv.includes('--json')

  /** @type {{passed: boolean, failureKind: string|null, violations: string[], facts: object}} */
  let verdict
  try {
    const declaration = readDeclaration(repoRoot)
    const workflowText = readWorkflow(repoRoot)
    const jobNames = workflowText === null ? [] : workflowJobNames(parseWorkflowYaml(workflowText))
    const repository = declaration.repository

    // **两级读取**不是多此一举：`GET /rulesets`（列表）刻意只返回摘要
    // （`_links/created_at/enforcement/id/name/node_id/source/source_type/target/updated_at`），
    // **不带 `conditions` 也不带 `rules`**。拿列表去比对，逐条规则永远是「不存在」——
    // 实测第一版就报出了「API 里没有任何 ruleset 覆盖这个 ref」，而此刻保护其实已经生效。
    // 判据读错端点，会把"保护在"判成"保护不在"，与它该防的那个方向正好相反。
    const listing = ghApiJson(`repos/${repository}/rulesets`)
    let details = listing.value
    let detailError = listing.error
    if (detailError === null && Array.isArray(listing.value)) {
      details = []
      for (const summary of listing.value) {
        const one = ghApiJson(`repos/${repository}/rulesets/${summary.id}`)
        if (one.error !== null) { detailError = one.error; break }
        details.push(one.value)
      }
    }
    verdict = compareRulesetsToDeclaration({
      declaration,
      rulesets: details,
      rulesetsError: detailError,
      workflowJobNames: jobNames,
    })
    verdict.facts.workflowJobNames = jobNames
    verdict.facts.repository = repository
    verdict.facts.declarationPath = DECLARATION_REL_PATH
    verdict.facts.workflowPath = WORKFLOW_REL_PATH
    verdict.facts.sourceEndpoints = [
      `GET /repos/${repository}/rulesets`,
      `GET /repos/${repository}/rulesets/{id}`,
    ]
  } catch (error) {
    // 声明读不到 / 解析不了：同样属于「拿不到读数」，不是「不符」。
    verdict = {
      passed: false,
      failureKind: AUDIT_FAILURE_KINDS.DECLARATION_INVALID,
      violations: [error.message],
      facts: { authority: AUDIT_AUTHORITY },
    }
  }

  const exitCode = verdict.passed
    ? EXIT.MATCH
    : verdict.failureKind === AUDIT_FAILURE_KINDS.MISMATCH
      ? EXIT.MISMATCH
      : EXIT.NO_READING

  if (json) {
    process.stdout.write(`${JSON.stringify({ ...verdict, exitCode, authority: AUDIT_AUTHORITY }, null, 2)}\n`)
  } else {
    const label = verdict.passed ? 'ok' : verdict.failureKind === AUDIT_FAILURE_KINDS.MISMATCH ? '不符' : '无读数'
    process.stdout.write(`${verdict.passed ? 'ok' : 'fail'} 保护面审计（${label}，证据层级 ${AUDIT_AUTHORITY}）\n`)
    process.stdout.write(`     声明：${DECLARATION_REL_PATH}\n`)
    if (verdict.facts.rulesets !== undefined) {
      process.stdout.write(`     API 返回 ${verdict.facts.rulesetCount} 条 ruleset：`
        + `${(verdict.facts.rulesets ?? []).map((entry) => `${entry.name}#${entry.id}`).join('、') || '（无）'}\n`)
    }
    for (const violation of verdict.violations) process.stdout.write(`     - ${violation}\n`)
    if (verdict.passed) {
      process.stdout.write(`     required check：${(verdict.facts['main-protection']?.statusChecks ?? []).join('、')}\n`)
    } else if (exitCode === EXIT.NO_READING) {
      process.stdout.write('     读数拿不到 ≠ 没有配置保护：本项在拿到读数之前不给结论\n')
    }
  }
  process.exitCode = exitCode
}

main()
