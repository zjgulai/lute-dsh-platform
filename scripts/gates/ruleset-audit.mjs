/**
 * main / v* tag 保护的**只读**审计（QG-008）。
 *
 * ## 这个模块的两个硬约束
 *
 * **一、只读。** 它只 GET，从不写 GitHub。`--apply` 不在这里——配置变更由人执行，
 * 审计只负责说「现在的实际状态是否等于声明」。一个既能改又能验的模块，最后总会变成
 * 「先改再验」的自我确认。
 *
 * **二、权限不足 ≠ 未配置。** 卡面的负例写得非常直白：「API 权限不足…权限不足不得解释成
 * 『未配置所以通过』」。这两种情况在 API 层长得不一样（403 vs 404/空数组），所以审计把
 * 它们分成**两种 fail 原因**：`API_ERROR` 与 `MISMATCH`。把 403 读成「没有配置」会让人
 * 得出「反正在保护之外，无所谓」的结论——而那恰恰是最危险的一种误读。
 *
 * ## 声明是唯一事实之家
 *
 * 规则应当是什么，写在 `ruleset-declaration.json` 里；本模块不解释、不推断、不放宽。
 * 它对声明的每一处都要求 API 逐字相等，多出来的规则与 actor 也算违规（多出来的保护
 * 同样是「声明与事实不符」）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const DECLARATION_REL_PATH = 'scripts/gates/ruleset-declaration.json'
export const AUDIT_AUTHORITY = 'L2-readonly-api'

/** 审计失败的两类原因；分开是卡面负例的直接要求。 */
export const AUDIT_FAILURE_KINDS = Object.freeze({
  API_ERROR: 'api-error',
  MISMATCH: 'mismatch',
  DECLARATION_INVALID: 'declaration-invalid',
})

class RulesetAuditError extends Error {}

/** 声明里 rules 的类型集合（排序后比较，顺序不代表语义）。 */
function ruleTypeSet(rules) {
  return [...new Set((rules ?? []).map((rule) => rule?.type).filter(Boolean))].sort()
}

/** 取某类型规则的参数（没有则返回 null）。 */
function ruleParameters(rules, type) {
  const hit = (rules ?? []).find((rule) => rule?.type === type)
  return hit ? (hit.parameters ?? null) : null
}

/** 从 required_status_checks 规则里取出上下文名（排序）。 */
function contextNames(rules) {
  const params = ruleParameters(rules, 'required_status_checks')
  const checks = params?.required_status_checks ?? []
  return checks.map((entry) => entry?.context).filter((name) => typeof name === 'string').sort()
}

/** 从 bypass_actors 里取出可比较的标识。 */
function bypassKeys(actors) {
  return (actors ?? [])
    .map((actor) => `${actor?.actor_type ?? '?'}:${actor?.actor_id ?? '?'}:${actor?.bypass_mode ?? '?'}`)
    .sort()
}

/** 声明里一条 target 规则的期望值，统一成一个可比较的形状。 */
function expectedFromDeclaration(entry) {
  const rules = entry.rules ?? []
  return {
    id: entry.id,
    target: entry.target,
    enforcement: entry.enforcement ?? 'active',
    ruleTypes: ruleTypeSet(rules),
    requiredApprovingReviewCount: ruleParameters(rules, 'pull_request')?.required_approving_review_count ?? null,
    allowedMergeMethods: (ruleParameters(rules, 'pull_request')?.allowed_merge_methods ?? []).slice().sort(),
    statusChecks: contextNames(rules),
    hasStatusChecks: ruleTypeSet(rules).includes('required_status_checks'),
  }
}

/** API 里一条 ruleset 的实际值。 */
function actualFromApi(ruleset) {
  return {
    id: ruleset?.id,
    name: ruleset?.name,
    target: ruleset?.target,
    enforcement: ruleset?.enforcement,
    ruleTypes: ruleTypeSet(ruleset?.rules),
    requiredApprovingReviewCount: ruleParameters(ruleset?.rules, 'pull_request')?.required_approving_review_count ?? null,
    allowedMergeMethods: (ruleParameters(ruleset?.rules, 'pull_request')?.allowed_merge_methods ?? []).slice().sort(),
    statusChecks: contextNames(ruleset?.rules),
    include: ruleset?.conditions?.ref_name?.include ?? [],
    bypass: bypassKeys(ruleset?.bypass_actors),
  }
}

/** 判断一条 ruleset 是否覆盖某个 ref（GitHub 用 `~ALL` / `~DEFAULT_BRANCH` / 具体 ref / 通配）。 */
function coversRef(ruleset, target) {
  const include = ruleset?.conditions?.ref_name?.include ?? []
  if (include.includes(target)) return true
  if (target.startsWith('refs/tags/') && include.includes('~ALL')) return true
  const tagName = target.replace(/^refs\/tags\//, '')
  for (const pattern of include) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      if (target.startsWith(prefix) || tagName.startsWith(prefix) || pattern === 'refs/tags/v*' && tagName.startsWith('v')) return true
    }
  }
  return false
}

/** 两个数组是否逐字相等（不解释顺序）。 */
function sameSet(left, right) {
  const a = [...left].sort()
  const b = [...right].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * 校验声明文件本身的形状。声明坏掉时要报 `DECLARATION_INVALID`，
 * 而不是拿一份残声明去和 API 比对——那样得到的「全等」毫无意义。
 */
export function validateDeclaration(declaration, { workflowJobNames = [] } = {}) {
  const problems = []
  if (!declaration || typeof declaration !== 'object') return ['声明不是一个对象']
  if (declaration.schemaVersion !== 'qg008-ruleset-declaration/v1') problems.push(`schemaVersion 不是已知值：${declaration.schemaVersion}`)
  if (typeof declaration.repository !== 'string' || declaration.repository === '') problems.push('缺少 repository')

  const branchTargets = (declaration.branchRules ?? []).map((entry) => entry.target)
  if (!branchTargets.includes('refs/heads/main')) problems.push('branchRules 必须覆盖 refs/heads/main')
  const tagTargets = (declaration.tagRules ?? []).map((entry) => entry.target)
  if (!tagTargets.includes('refs/tags/v*')) problems.push('tagRules 必须覆盖 refs/tags/v*')

  for (const entry of [...(declaration.branchRules ?? []), ...(declaration.tagRules ?? [])]) {
    if (typeof entry.id !== 'string' || entry.id === '') problems.push('每条 target 规则必须有非空 id')
    if (!Array.isArray(entry.rules) || entry.rules.length === 0) problems.push(`${entry.id}: rules 不能为空`)
    for (const rule of entry.rules ?? []) {
      if (typeof rule?.type !== 'string') problems.push(`${entry.id}: 规则缺少 type`)
    }
  }

  // 声明里的 required check 名必须与 workflow 里 job 的显示名逐字一致。
  // 不一致的后果不是"少了一道检查"，而是**所有 PR 被永久卡死**（那个 check 永远不会出现）。
  const declaredChecks = declaration.requiredChecks?.names ?? []
  if (declaredChecks.length === 0) problems.push('requiredChecks.names 不能为空')
  if (workflowJobNames.length > 0) {
    for (const name of declaredChecks) {
      if (!workflowJobNames.includes(name)) {
        problems.push(`requiredChecks 里的「${name}」在 workflow 的 job 显示名里不存在（现有：${workflowJobNames.join('、')}）——这会让该 check 永不满足`)
      }
    }
  }

  // bypass：本仓库的立场是「空 = 有意声明」，所以非空必须是显式登记过的形状。
  const actors = declaration.bypassActors?.actors
  if (!Array.isArray(actors)) problems.push('bypassActors.actors 必须是数组（空数组是声明，不是遗漏）')

  return problems
}

/**
 * 比对声明与 API 读数。
 *
 * @param {object} input
 * @param {object} input.declaration 已解析的声明
 * @param {Array<object>|null} input.rulesets GET /repos/{r}/rulesets 的结果（null 表示调用失败）
 * @param {Error|null} [input.rulesetsError] 调用失败时的错误（403/404/网络）
 * @param {string[]} [input.workflowJobNames]
 * @returns {{passed: boolean, failureKind: string|null, violations: string[], facts: object}}
 */
export function compareRulesetsToDeclaration({ declaration, rulesets, rulesetsError = null, workflowJobNames = [] }) {
  const facts = { authority: AUDIT_AUTHORITY, declaredRepository: declaration?.repository ?? null }

  const declarationProblems = validateDeclaration(declaration, { workflowJobNames })
  if (declarationProblems.length > 0) {
    return { passed: false, failureKind: AUDIT_FAILURE_KINDS.DECLARATION_INVALID, violations: declarationProblems, facts }
  }

  // 权限不足 / 调用失败：先于任何比对判定，且**不得**降级成「未配置」。
  if (rulesetsError !== null && rulesetsError !== undefined) {
    return {
      passed: false,
      failureKind: AUDIT_FAILURE_KINDS.API_ERROR,
      violations: [
        `读取 ruleset 失败：${rulesetsError.message}`
          + ' —— 权限不足或 API 故障**不是**「没有配置保护」，两者必须分开；'
          + '本项在拿到读数之前不给结论（卡面负例：权限不足不得解释成「未配置所以通过」）',
      ],
      facts,
    }
  }
  if (!Array.isArray(rulesets)) {
    return {
      passed: false,
      failureKind: AUDIT_FAILURE_KINDS.API_ERROR,
      violations: ['ruleset 读数不是一个数组（API 形状变了或返回了错误体）'],
      facts,
    }
  }

  const violations = []
  facts.rulesetCount = rulesets.length
  facts.rulesets = rulesets.map((entry) => ({ id: entry?.id, name: entry?.name, target: entry?.target, enforcement: entry?.enforcement }))

  const declaredTargets = [...(declaration.branchRules ?? []), ...(declaration.tagRules ?? [])]
  const matchedIds = new Set()

  for (const entry of declaredTargets) {
    const expected = expectedFromDeclaration(entry)
    const candidates = rulesets.filter((ruleset) => coversRef(ruleset, expected.target))
    if (candidates.length === 0) {
      violations.push(
        `${expected.id}（${expected.target}）：API 里没有任何 ruleset 覆盖这个 ref —— 声明中的保护不存在`,
      )
      continue
    }
    if (candidates.length > 1) {
      violations.push(`${expected.id}（${expected.target}）：有 ${candidates.length} 条 ruleset 同时覆盖（${candidates.map((c) => c?.name).join('、')}），实际生效的是并集，声明无法逐条比对`)
    }
    const actual = actualFromApi(candidates[0])
    matchedIds.add(candidates[0]?.id)
    facts[expected.id] = actual

    if (actual.enforcement !== expected.enforcement) {
      violations.push(`${expected.id}：enforcement 期望 ${expected.enforcement}，实际 ${actual.enforcement}`)
    }
    if (!sameSet(actual.ruleTypes, expected.ruleTypes)) {
      const missing = expected.ruleTypes.filter((type) => !actual.ruleTypes.includes(type))
      const extra = actual.ruleTypes.filter((type) => !expected.ruleTypes.includes(type))
      violations.push(
        `${expected.id}：规则集合不等 —— 缺 ${missing.join('、') || '无'}；多 ${extra.join('、') || '无'}`,
      )
    }
    if (expected.hasStatusChecks) {
      if (!sameSet(actual.statusChecks, expected.statusChecks)) {
        violations.push(
          `${expected.id}：required check 不等 —— 期望 ${expected.statusChecks.join('、')}，`
            + `实际 ${actual.statusChecks.join('、') || '（无）'}`,
        )
      }
    }
    if (expected.ruleTypes.includes('pull_request')) {
      if (actual.requiredApprovingReviewCount !== expected.requiredApprovingReviewCount) {
        violations.push(`${expected.id}：required_approving_review_count 期望 ${expected.requiredApprovingReviewCount}，实际 ${actual.requiredApprovingReviewCount}`)
      }
      if (!sameSet(actual.allowedMergeMethods, expected.allowedMergeMethods)) {
        violations.push(`${expected.id}：allowed_merge_methods 期望 ${expected.allowedMergeMethods.join('/')}，实际 ${actual.allowedMergeMethods.join('/') || '（未设）'}`)
      }
    }
    if (!sameSet(actual.bypass, bypassKeys(declaration.bypassActors?.actors ?? []))) {
      violations.push(
        `${expected.id}：bypass actor 不等 —— 期望 ${bypassKeys(declaration.bypassActors?.actors ?? []).join('、') || '（无）'}，`
          + `实际 ${actual.bypass.join('、') || '（无）'}（多出来的 bypass 会让保护变成一句可以绕过的话）`,
      )
    }
  }

  // 没有被任何声明覆盖的 ruleset：同样是「声明与事实不符」。
  for (const ruleset of rulesets) {
    if (!matchedIds.has(ruleset?.id)) {
      violations.push(`API 里存在声明未登记的 ruleset：${ruleset?.name}（id=${ruleset?.id}，target=${ruleset?.target}）—— 保护面必须与声明逐条对应`)
    }
  }

  return {
    passed: violations.length === 0,
    failureKind: violations.length === 0 ? null : AUDIT_FAILURE_KINDS.MISMATCH,
    violations,
    facts,
  }
}

/** 读声明文件。读不到抛错——「没有声明」与「声明全等」必须分得开。 */
export function readDeclaration(repoRoot) {
  const path = join(repoRoot, DECLARATION_REL_PATH)
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new RulesetAuditError(`读不到声明 ${DECLARATION_REL_PATH}：${error.message}`)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new RulesetAuditError(`声明不是合法 JSON：${error.message}`)
  }
}

/** workflow 里各 job 的**显示名**——required check 匹配的就是这个字符串。 */
export function workflowJobNames(workflowDocument) {
  const jobs = workflowDocument?.jobs ?? {}
  return Object.values(jobs)
    .map((job) => job?.name)
    .filter((name) => typeof name === 'string' && name !== '')
}

export { RulesetAuditError }
