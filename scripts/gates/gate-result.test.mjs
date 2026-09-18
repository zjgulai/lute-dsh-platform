import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assertRemediationDeclared,
  computeNotCovered,
  normalizeGateResult,
  runGateChecks,
  summarizeGateResults,
  validateGateResult,
} from './gate-result.mjs'

const PASS = {
  status: 'pass',
  expected: 2,
  discovered: 2,
  checked: 2,
  skipped: 0,
  failed: 0,
  typedSkips: [],
  reason: '全部对象均已核对',
  note: 'fixture pass',
  violations: [],
}

test('canonical pass 保留统一 schema', () => {
  const result = normalizeGateResult(PASS, { name: 'pass-fixture' })

  assert.deepEqual(result, PASS)
  assert.deepEqual(validateGateResult(result), { valid: true, errors: [] })
})

test('canonical skip 要求 typed skip 守恒', () => {
  const result = normalizeGateResult({
    status: 'skip',
    expected: 3,
    discovered: 1,
    checked: 1,
    skipped: 2,
    failed: 0,
    typedSkips: [
      { type: 'optional-environment-missing', count: 2, reason: 'fixture runtime 未安装' },
    ],
    reason: '部分可选环境不存在',
    note: '已核对 1，跳过 2',
    violations: [],
  }, { name: 'skip-fixture' })

  assert.equal(result.status, 'skip')
  assert.equal(result.skipped, 2)
  assert.equal(result.typedSkips[0].type, 'optional-environment-missing')
})

test('legacy pass 一次性映射为一个已核对 gate 单元', () => {
  const result = normalizeGateResult({ passed: true, violations: [], note: 'legacy ok' }, { name: 'legacy-pass' })

  assert.deepEqual(result, {
    status: 'pass',
    expected: 1,
    discovered: 1,
    checked: 1,
    skipped: 0,
    failed: 0,
    typedSkips: [],
    reason: 'legacy checker passed',
    note: 'legacy ok',
    violations: [],
  })
})

test('legacy passed+skipped 映射为 typed skip，不计作 pass', () => {
  const result = normalizeGateResult({
    passed: true,
    skipped: true,
    violations: [],
    note: '可选 app 未安装',
  }, { name: 'legacy-skip' })

  assert.equal(result.status, 'skip')
  assert.equal(result.checked, 0)
  assert.equal(result.skipped, 1)
  assert.deepEqual(result.typedSkips, [
    { type: 'legacy-skip', count: 1, reason: '可选 app 未安装' },
  ])
})

test('legacy fail 保留违规并映射为一个失败单元', () => {
  const result = normalizeGateResult({ passed: false, violations: ['缺少治理文件'] }, { name: 'legacy-fail' })

  assert.equal(result.status, 'fail')
  assert.equal(result.failed, 1)
  assert.equal(result.reason, 'legacy checker failed')
  assert.deepEqual(result.violations, ['缺少治理文件'])
})

test('legacy skip 缺 reason/note 时 fail-closed', () => {
  const result = normalizeGateResult({ passed: true, skipped: true, violations: [] }, { name: 'silent-skip' })

  assert.equal(result.status, 'fail')
  assert.match(result.reason, /result schema invalid/)
  assert.match(result.violations.join('\n'), /skip.*reason|note/i)
})

test('守恒不成立时 fail-closed', () => {
  const result = normalizeGateResult({ ...PASS, expected: 3 }, { name: 'bad-accounting' })

  assert.equal(result.status, 'fail')
  assert.equal(result.expected, 1)
  assert.equal(result.failed, 1)
  assert.match(result.violations.join('\n'), /expected.*checked.*skipped.*failed/)
})

test('typed skip 总数与 skipped 不一致时 fail-closed', () => {
  const result = normalizeGateResult({
    status: 'skip',
    expected: 2,
    discovered: 0,
    checked: 0,
    skipped: 2,
    failed: 0,
    typedSkips: [{ type: 'optional-environment-missing', count: 1, reason: '只解释了一个' }],
    reason: '跳过',
    violations: [],
  }, { name: 'bad-typed-skip' })

  assert.equal(result.status, 'fail')
  assert.match(result.violations.join('\n'), /typedSkips.*skipped/)
})

test('canonical pass checked=0 与混用 legacy 字段都 fail-closed', () => {
  const vacuous = normalizeGateResult({ ...PASS, expected: 0, discovered: 0, checked: 0 }, { name: 'vacuous' })
  const mixed = normalizeGateResult({ ...PASS, passed: true }, { name: 'mixed' })

  assert.equal(vacuous.status, 'fail')
  assert.match(vacuous.violations.join('\n'), /pass.*checked/i)
  assert.equal(mixed.status, 'fail')
  assert.match(mixed.violations.join('\n'), /legacy/i)
})

test('非法返回值 fail-closed 且不回显原始对象', () => {
  const result = normalizeGateResult(null, { name: 'null-result' })

  assert.equal(result.status, 'fail')
  assert.equal(result.failed, 1)
  assert.match(result.reason, /null-result.*result schema invalid/)
  assert.deepEqual(result.typedSkips, [])
})

test('runGateChecks 捕获 checker throw 并返回可追溯 fail', () => {
  const run = runGateChecks([
    {
      name: 'throwing-check',
      run() {
        throw new Error('fixture exploded')
      },
    },
  ])

  assert.equal(run.results[0].status, 'fail')
  assert.equal(run.results[0].name, 'throwing-check')
  assert.match(run.results[0].reason, /checker threw/)
  assert.match(run.results[0].violations.join('\n'), /fixture exploded/)
  assert.equal(run.summary.failed, 1)
  assert.equal(run.exitCode, 1)
})

test('runGateChecks 汇总 pass/fail/skip，skip 不计入 pass', () => {
  const checks = [
    { name: 'pass', run: () => PASS },
    { name: 'skip', run: () => ({ passed: true, skipped: true, violations: [], note: '可选环境不存在' }) },
    { name: 'fail', run: () => ({ passed: false, violations: ['fixture failure'] }) },
  ]
  const run = runGateChecks(checks)

  assert.deepEqual(
    {
      total: run.summary.total,
      passed: run.summary.passed,
      skipped: run.summary.skipped,
      failed: run.summary.failed,
    },
    { total: 3, passed: 1, skipped: 1, failed: 1 },
  )
  assert.equal(run.summary.expected, 4)
  assert.equal(run.summary.checked, 2)
  assert.equal(run.summary.skippedObjects, 1)
  assert.equal(run.summary.failedObjects, 1)
  assert.equal(run.exitCode, 1)
})

test('requireNoSkip 令纯 skip 汇总非零退出', () => {
  const checks = [
    { name: 'pass', run: () => PASS },
    { name: 'skip', run: () => ({ passed: true, skipped: true, violations: [], note: '可选环境不存在' }) },
  ]
  const normal = runGateChecks(checks)
  const strict = runGateChecks(checks, { requireNoSkip: true })

  assert.equal(normal.summary.status, 'skip')
  assert.equal(normal.exitCode, 0)
  assert.equal(strict.summary.status, 'fail')
  assert.equal(strict.exitCode, 1)
})

test('summarizeGateResults 可独立汇总 canonical results', () => {
  const summary = summarizeGateResults([
    PASS,
    normalizeGateResult({ passed: true, skipped: true, violations: [], note: 'optional fixture absent' }),
  ])

  assert.equal(summary.total, 2)
  assert.equal(summary.passed, 1)
  assert.equal(summary.skipped, 1)
  assert.equal(summary.failed, 0)
  assert.equal(summary.status, 'skip')
  assert.equal(summary.exitCode, 0)
})

// ── 射程必须出现在读数里 ────────────────────────────────────────────────────
//
// 守的是**摘要的分母**：`quick` 只跑一部分校验项。若摘要只报「75/76 项通过」，
// 读的人会以为 76 就是全部，而 full-only 的那 7 条压根没被碰过——2026-09-16 的
// typecheck 回归（10 处 TS2339 + 6 处测试类型错）正是这样对提交前门禁隐形的：
// 它由 `scripts-runnable` 守着，而那条是 full-only（P-04 的变体）。
// `gate.test.mjs` 里还有一条端到端用例，守「接线没被摘掉」。

test('summarizeGateResults 记录未覆盖的射程，且不因此改变退出码', () => {
  const covered = summarizeGateResults([PASS], { notCovered: ['scripts-runnable'] })
  const bare = summarizeGateResults([PASS])

  assert.deepEqual(covered.notCovered, ['scripts-runnable'])
  assert.deepEqual(bare.notCovered, [], '没传就是空，而不是 undefined——读数要有稳定的形状')
  // 「这次没跑它」与「它失败了」是两件事：前者不得把门禁判红。
  assert.equal(covered.exitCode, bare.exitCode)
  assert.equal(covered.exitCode, 0)
  assert.equal(covered.status, 'pass')
})

test('runGateChecks 把 notCovered 透传进摘要', () => {
  const report = runGateChecks(
    [{ name: 'fixture-check', run: () => PASS }],
    { notCovered: ['release-published', 'theme-tokens'] },
  )

  assert.deepEqual(report.summary.notCovered, ['release-published', 'theme-tokens'])
  assert.equal(report.exitCode, 0)
})

test('notCovered 里的非字符串与空白项被丢弃，不产生假的未覆盖项', () => {
  const summary = summarizeGateResults([PASS], { notCovered: ['theme-tokens', '', '   ', 42, null] })

  assert.deepEqual(summary.notCovered, ['theme-tokens'])
})

// ── 未覆盖射程的计算本身 ────────────────────────────────────────────────────
//
// 这条逻辑刻意住在 `gate-result.mjs` 而不是 `gate.mjs`：后者导入即执行 `main()`，
// 而 `scripts/gate.test.mjs` 那一族 CLI 测试**不在 `pnpm run gate` 的射程内**
// （2026-09-17 实测：83 个注册项里没有一条跑它）。写在那里的逻辑没有任何门禁测得到。

test('computeNotCovered 只取本模式跑不到的项，未声明 modes 的项不算未覆盖', () => {
  const registry = [
    { name: 'always', modes: ['quick', 'full'] },
    { name: 'no-modes-declared' },
    { name: 'full-only', modes: ['full'] },
    { name: 'quick-only', modes: ['quick'] },
  ]

  assert.deepEqual(computeNotCovered(registry, 'quick'), ['full-only'])
  assert.deepEqual(computeNotCovered(registry, 'full'), ['quick-only'])
})

test('computeNotCovered：modes 形态不认识时按未覆盖处理，不静默算成跑过', () => {
  const registry = [{ name: 'weird', modes: 'full' }, { name: 'ok', modes: ['quick'] }]

  assert.deepEqual(computeNotCovered(registry, 'quick'), ['weird'])
})

test('computeNotCovered 对垃圾输入返回空，不抛也不产生空名字读数', () => {
  assert.deepEqual(computeNotCovered(null, 'quick'), [])
  assert.deepEqual(computeNotCovered([{ modes: ['full'] }], 'quick'), [])
})

// ── 注册表必须声明非空 remediation（P-08 / M2 剩余） ─────────────────────────
//
// 第 84 条（现在是第 87 条）可以悄悄不写 remediation，而 gate.mjs 会静默不打印
// 「→ 怎么修」——那是纪律守机制。这里把「每个注册项都声明了非空 remediation」
// 变成可判定的纯函数，由 gate-result-selftest 守着；gate.mjs 在 CHECKS 构造后、
// main() 之前调用它，违规即启动失败（机制层证据见变异验证，不在此文件内）。

test('assertRemediationDeclared：全部声明非空 remediation 时通过', () => {
  const registry = [
    { name: 'alpha', remediation: '修正 A（ADR-0001）' },
    { name: 'beta', remediation: '修正 B（ADR-0002）' },
  ]

  assert.deepEqual(assertRemediationDeclared(registry), { valid: true, errors: [] })
})

test('assertRemediationDeclared：缺字段、空串、空白串、非字符串都判红并点名', () => {
  const registry = [
    { name: 'missing', remediation: '有' },
    { name: 'absent' },
    { name: 'empty', remediation: '' },
    { name: 'blank', remediation: '   ' },
    { name: 'number', remediation: 42 },
    { name: 'null', remediation: null },
    { name: 'object', remediation: { hint: '不是字符串' } },
  ]

  const result = assertRemediationDeclared(registry)

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, [
    'absent: remediation must be a non-empty string',
    'empty: remediation must be a non-empty string',
    'blank: remediation must be a non-empty string',
    'number: remediation must be a non-empty string',
    'null: remediation must be a non-empty string',
    'object: remediation must be a non-empty string',
  ])
})

test('assertRemediationDeclared：无 name 的项用序号点名，不静默跳过', () => {
  const registry = [{ remediation: 'ok' }, { remediation: '' }]

  const result = assertRemediationDeclared(registry)

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, ['unnamed-check-2: remediation must be a non-empty string'])
})

test('assertRemediationDeclared：垃圾输入判红但不抛', () => {
  assert.deepEqual(assertRemediationDeclared(null), {
    valid: false,
    errors: ['checks must be an array'],
  })
  assert.deepEqual(assertRemediationDeclared('not-array'), {
    valid: false,
    errors: ['checks must be an array'],
  })
})

// ── 混用两份合同的读数必须被**点名**，而不是报成 schema invalid ────────────────
//
// 立项依据是实测：`ci-workflow-contract` 第一版随手交了 `{passed, expected, …, skipped: 0}`，
// 聚合层走 legacy 分支、把 canonical 字段整片丢掉，最后报「legacy skipped must be boolean」
// ——真正的原因是**混用**，但读数里一个字都没提。判据没错，错的是报错读不出根因。

test('混用 canonical 与 legacy 字段：必须点名到字段，不许只报 schema invalid', () => {
  const mixed = normalizeGateResult({
    status: 'pass', expected: 1, discovered: 1, checked: 1, skipped: 0, failed: 0,
    typedSkips: [], reason: '看起来没问题', violations: [], passed: true,
  })
  assert.equal(mixed.status, 'fail')
  assert.match(mixed.violations.join('\n'), /must not mix legacy fields: passed/)
  assert.match(mixed.violations.join('\n'), /要么 canonical/, '报错必须说清两份合同分别是哪一份')
})

test('纯 legacy 读数仍然按 legacy 解释（上面的收紧不得误伤它）', () => {
  const legacy = normalizeGateResult({ passed: true, violations: [], note: 'ok' })
  assert.equal(legacy.status, 'pass')
  assert.equal(legacy.reason, 'legacy checker passed')
})
