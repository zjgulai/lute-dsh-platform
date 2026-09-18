/**
 * `ruleset-audit.mjs` 的反向自测（QG-008，ADR-0106）。
 *
 * ## 基线是**真实 API 读数**，不是我写的样本
 *
 * `fixtures/rulesets-live.json` 是从 `zjgulai/lute-dsh-platform` 采下来的真实 payload
 * （只裁剪为审计读取的字段并排序，便于逐字复算）。这一点很重要：如果基线是我手写的
 * 「理想响应」，那这一整套变异只是在验证我和我自己一致。
 *
 * ## 每一条变异对应一次真实可能发生的事故
 *
 * | 变异 | 事故 |
 * |---|---|
 * | 删掉 required check | 检查没了但审计说"全等" |
 * | 改检查名 | 名字对不上 = 该 check 永不满足 = 所有 PR 永久卡死 |
 * | 加 bypass actor | 保护变成一句可以随时绕过的话 |
 * | 去掉 tag 的 update 规则 | tag 可以被移动，ADR-0058 的"字节可回溯"被毁 |
 * | 规则被降级成 evaluate | 看似有保护，实际只记录不拦截 |
 * | API 403 / 网络失败 | **不得**被解释成"未配置所以通过" |
 * | 列表端点（缺 conditions/rules） | 这一条最要紧：判据读错端点会把"保护在"判成"保护不在" |
 * | 声明里的 check 名与 workflow 不符 | 声明与 workflow 各说各话 |
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUDIT_AUTHORITY,
  AUDIT_FAILURE_KINDS,
  compareRulesetsToDeclaration,
  readDeclaration,
  validateDeclaration,
  workflowJobNames,
} from './ruleset-audit.mjs'
import { parseWorkflowYaml, readWorkflow } from './ci-workflow.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const live = JSON.parse(readFileSync(join(repoRoot, 'scripts/gates/fixtures/rulesets-live.json'), 'utf8'))
const declaration = readDeclaration(repoRoot)
const jobNames = workflowJobNames(parseWorkflowYaml(readWorkflow(repoRoot)))

/** 深拷贝一份真实读数，供变异使用。 */
const freshRulesets = () => JSON.parse(JSON.stringify(live.rulesets))

function audit(rulesets, { error = null, jobList = jobNames, decl = declaration } = {}) {
  return compareRulesetsToDeclaration({ declaration: decl, rulesets, rulesetsError: error, workflowJobNames: jobList })
}

/** 改坏一处并断言判红，且违规文本指向该处。 */
function expectRed(label, mutate, expectMatch) {
  const rulesets = freshRulesets()
  const before = JSON.stringify(rulesets)
  mutate(rulesets)
  assert.notEqual(JSON.stringify(rulesets), before, `${label}：变异没改动任何东西（变异本身失效）`)
  const result = audit(rulesets)
  assert.equal(result.passed, false, `${label}：判据放过了这个变异`)
  if (expectMatch !== undefined) assert.match(result.violations.join('\n'), expectMatch, `${label}：红了但没指向该处`)
  return result
}

const findRule = (rulesets, name, type) => rulesets
  .find((entry) => entry.name === name)
  .rules.find((rule) => rule.type === type)

test('基线：真实 API 读数必须判绿（否则下面的变异都是空射程）', () => {
  const result = audit(freshRulesets())
  assert.deepEqual(result.violations, [])
  assert.equal(result.passed, true)
  assert.equal(result.facts.authority, AUDIT_AUTHORITY)
  assert.equal(result.facts.rulesetCount, 2)
  assert.deepEqual(result.facts['main-protection'].statusChecks, ['gate (full)', 'gate (quick)'])
  assert.equal(live.capturedFrom, 'zjgulai/lute-dsh-platform')
})

test('变异 1：删掉一条 required check → 判红且点名', () => {
  expectRed('删 required check', (rulesets) => {
    const rule = findRule(rulesets, 'main-protection', 'required_status_checks')
    rule.parameters.required_status_checks = rule.parameters.required_status_checks.filter((c) => c.context !== 'gate (full)')
  }, /required check 不等/)
})

test('变异 2：改一个检查名（拼写漂移）→ 判红', () => {
  expectRed('改检查名', (rulesets) => {
    const rule = findRule(rulesets, 'main-protection', 'required_status_checks')
    rule.parameters.required_status_checks[0].context = 'gate(quick)'
  }, /required check 不等/)
})

test('变异 3：加一个 bypass actor → 判红（保护变成可以绕过的话）', () => {
  expectRed('加 bypass', (rulesets) => {
    rulesets.find((entry) => entry.name === 'main-protection').bypass_actors = [
      { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' },
    ]
  }, /bypass actor 不等/)
})

test('变异 4：去掉 tag 的 update 规则 → 判红（tag 可以被移动）', () => {
  expectRed('去掉 update', (rulesets) => {
    const entry = rulesets.find((r) => r.name === 'release-tag-protection')
    entry.rules = entry.rules.filter((rule) => rule.type !== 'update')
  }, /规则集合不等/)
})

test('变异 5：tag ruleset 被降级成 evaluate → 判红（只记录不拦截）', () => {
  expectRed('降级 evaluate', (rulesets) => {
    rulesets.find((entry) => entry.name === 'release-tag-protection').enforcement = 'evaluate'
  }, /enforcement/)
})

test('变异 6：pull_request 的 review 数被改成 1（单人会变成自我审批）→ 判红', () => {
  expectRed('改 review 数', (rulesets) => {
    findRule(rulesets, 'main-protection', 'pull_request').parameters.required_approving_review_count = 1
  }, /required_approving_review_count/)
})

test('变异 7：多出一条声明未登记的 ruleset → 判红（保护面必须与声明逐条对应）', () => {
  expectRed('多一条 ruleset', (rulesets) => {
    rulesets.push({
      id: 9999,
      name: 'someone-else-rule',
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
      rules: [{ type: 'deletion' }],
      bypass_actors: [],
    })
  }, /未登记的 ruleset/)
})

test('变异 8：删掉整条 tag ruleset → 判红', () => {
  expectRed('删 tag ruleset', (rulesets) => {
    rulesets.splice(rulesets.findIndex((entry) => entry.name === 'release-tag-protection'), 1)
  }, /没有任何 ruleset 覆盖/)
})

test('负例（卡面明写）：API 403/权限不足 → 判红且**不得**解释成「未配置所以通过」', () => {
  const result = audit(null, { error: new Error('gh: Resource not accessible by integration (HTTP 403)') })
  assert.equal(result.passed, false)
  assert.equal(result.failureKind, AUDIT_FAILURE_KINDS.API_ERROR)
  assert.match(result.violations.join('\n'), /权限不足或 API 故障\*\*不是\*\*「没有配置保护」/)
  assert.notEqual(result.failureKind, AUDIT_FAILURE_KINDS.MISMATCH, '权限不足不是"不符"，两者必须分开')
})

test('负例：列表端点的形状（缺 conditions/rules）必须判红，而不是判成「保护不在」', () => {
  // 这是实施中真实踩到的：`GET /rulesets` 只返回摘要，拿它比对会逐条报「没有 ruleset 覆盖」，
  // 而此刻保护其实生效。判据读错端点 = 把"保护在"判成"保护不在"，方向正好相反。
  const summaries = freshRulesets().map((entry) => ({
    id: entry.id, name: entry.name, target: entry.target, enforcement: entry.enforcement,
  }))
  const result = audit(summaries)
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((line) => /没有任何 ruleset 覆盖/.test(line)), '摘要形状会被误读，必须判红')
  // 反向：带上 conditions 与 rules 之后必须判绿，证明差别只在字段齐不齐。
  assert.equal(audit(freshRulesets()).passed, true)
})

test('负例：读数不是数组（API 返回了错误体）→ 判红为「无读数」', () => {
  const result = audit({ message: 'Not Found' })
  assert.equal(result.passed, false)
  assert.equal(result.failureKind, AUDIT_FAILURE_KINDS.API_ERROR)
})

test('声明的 required check 名必须与 workflow 的 job 显示名逐字一致', () => {
  // 正向：仓库当前声明与 workflow 对得上。
  assert.deepEqual(validateDeclaration(declaration, { workflowJobNames: jobNames }), [])
  // 反向：声明里出现一个 workflow 没有的名字，必须被判为声明无效（那会让 PR 永久卡死）。
  const broken = JSON.parse(JSON.stringify(declaration))
  broken.requiredChecks.names = ['gate (quick)', 'gate (fast)']
  const problems = validateDeclaration(broken, { workflowJobNames: jobNames })
  assert.ok(problems.some((line) => /永不满足/.test(line)), `实际：${problems.join('；')}`)
  const result = audit(freshRulesets(), { decl: broken })
  assert.equal(result.passed, false)
  assert.equal(result.failureKind, AUDIT_FAILURE_KINDS.DECLARATION_INVALID)
})

test('声明自身的形状：缺 main / 缺 v* tag / rules 为空都必须判红', () => {
  const variants = [
    { mutate: (d) => { d.branchRules = [] }, match: /refs\/heads\/main/ },
    { mutate: (d) => { d.tagRules = [] }, match: /refs\/tags\/v\*/ },
    { mutate: (d) => { d.branchRules[0].rules = [] }, match: /rules 不能为空/ },
    { mutate: (d) => { d.bypassActors = {} }, match: /bypassActors\.actors 必须是数组/ },
    { mutate: (d) => { d.schemaVersion = 'v0' }, match: /schemaVersion/ },
  ]
  for (const { mutate, match } of variants) {
    const d = JSON.parse(JSON.stringify(declaration))
    mutate(d)
    const problems = validateDeclaration(d, { workflowJobNames: jobNames })
    assert.ok(problems.some((line) => match.test(line)), `${match} 未被报出：${problems.join('；')}`)
  }
})

test('fixture 是真实读数：必须带来源与采集时间，且不含任何凭证', () => {
  assert.match(live.capturedFrom, /^[\w.-]+\/[\w.-]+$/)
  assert.match(live.capturedAt, /^\d{4}-\d{2}-\d{2}T/)
  const text = JSON.stringify(live)
  assert.equal(/gho_|ghp_|github_pat_|Bearer /.test(text), false, 'fixture 里不得出现任何 token 形状的字符串')
})
