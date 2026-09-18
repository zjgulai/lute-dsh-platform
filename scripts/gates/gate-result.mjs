/** @typedef {'pass' | 'fail' | 'skip'} GateStatus */

/**
 * @typedef {object} TypedSkip
 * @property {string} type 稳定、可聚合的跳过类型。
 * @property {number} count 该类型覆盖的对象数。
 * @property {string} reason 人可读原因。
 * @property {string[]} [objects] 可选的对象标识。
 */

/**
 * @typedef {object} GateResult
 * @property {GateStatus} status
 * @property {number} expected
 * @property {number} discovered
 * @property {number} checked
 * @property {number} skipped
 * @property {number} failed
 * @property {TypedSkip[]} typedSkips
 * @property {string} reason
 * @property {string} [note]
 * @property {string[]} violations
 */

export const GATE_STATUSES = Object.freeze(['pass', 'fail', 'skip'])

/**
 * Validate one canonical gate result without mutating it.
 *
 * `expected` is the accounting denominator. Every expected object must end in
 * exactly one of checked, typed skipped, or failed. `discovered` is reported
 * separately because discovery drift is evidence of its own.
 *
 * @param {unknown} value
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateGateResult(value) {
  const errors = []
  if (!isRecord(value)) {
    return { valid: false, errors: ['result must be a non-array object'] }
  }

  if ('passed' in value) {
    errors.push('canonical result must not contain legacy field passed')
  }
  if (!GATE_STATUSES.includes(/** @type {GateStatus} */ (value.status))) {
    errors.push('status must be one of pass, fail, skip')
  }

  for (const field of ['expected', 'discovered', 'checked', 'skipped', 'failed']) {
    const count = value[field]
    if (!Number.isInteger(count) || /** @type {number} */ (count) < 0) {
      errors.push(`${field} must be a non-negative integer`)
    }
  }

  if (typeof value.reason !== 'string' || value.reason.trim() === '') {
    errors.push('reason must be a non-empty string')
  }
  if ('note' in value && typeof value.note !== 'string') {
    errors.push('note must be a string when present')
  }
  if (!Array.isArray(value.violations) || value.violations.some((item) => typeof item !== 'string')) {
    errors.push('violations must be an array of strings')
  }

  let typedSkipTotal = 0
  if (!Array.isArray(value.typedSkips)) {
    errors.push('typedSkips must be an array')
  } else {
    for (const [index, entry] of value.typedSkips.entries()) {
      if (!isRecord(entry)) {
        errors.push(`typedSkips[${index}] must be an object`)
        continue
      }
      if (typeof entry.type !== 'string' || entry.type.trim() === '') {
        errors.push(`typedSkips[${index}].type must be a non-empty string`)
      }
      if (!Number.isInteger(entry.count) || /** @type {number} */ (entry.count) <= 0) {
        errors.push(`typedSkips[${index}].count must be a positive integer`)
      } else {
        typedSkipTotal += /** @type {number} */ (entry.count)
      }
      if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
        errors.push(`typedSkips[${index}].reason must be a non-empty string`)
      }
      if ('objects' in entry && (!Array.isArray(entry.objects) || entry.objects.some((item) => typeof item !== 'string'))) {
        errors.push(`typedSkips[${index}].objects must be an array of strings when present`)
      }
    }
  }

  const expected = integerOrNull(value.expected)
  const discovered = integerOrNull(value.discovered)
  const checked = integerOrNull(value.checked)
  const skipped = integerOrNull(value.skipped)
  const failed = integerOrNull(value.failed)

  if (expected !== null && checked !== null && skipped !== null && failed !== null) {
    if (expected !== checked + skipped + failed) {
      errors.push('expected must equal checked + skipped + failed')
    }
  }
  if (skipped !== null && Array.isArray(value.typedSkips) && typedSkipTotal !== skipped) {
    errors.push('typedSkips count must equal skipped')
  }
  if (checked !== null && discovered !== null && checked > discovered) {
    errors.push('checked must not exceed discovered')
  }
  if (value.status !== 'fail' && discovered !== null && expected !== null && discovered > expected) {
    errors.push('non-failing result must not discover more objects than expected')
  }

  const violations = Array.isArray(value.violations) ? value.violations : []
  if (value.status === 'pass') {
    if (checked === 0) errors.push('pass requires checked > 0; empty scope cannot pass')
    if (skipped !== 0 || failed !== 0) errors.push('pass requires skipped = 0 and failed = 0')
    if (violations.length > 0) errors.push('pass must not contain violations')
  } else if (value.status === 'skip') {
    if (skipped === 0) errors.push('skip requires skipped > 0')
    if (failed !== 0) errors.push('skip requires failed = 0')
    if (violations.length > 0) errors.push('skip must not contain violations')
  } else if (value.status === 'fail') {
    if (failed === 0) errors.push('fail requires failed > 0')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Normalize a canonical or legacy checker result. Invalid or contradictory
 * inputs become a valid fail result; this function never lets malformed data
 * turn green.
 *
 * Legacy input is deliberately gate-level: one legacy checker maps to one
 * expected unit. Object-level denominators require migration to the canonical
 * schema rather than inference here.
 *
 * @param {unknown} raw
 * @param {{name?: string}} [options]
 * @returns {GateResult}
 */
export function normalizeGateResult(raw, { name = 'unnamed-check' } = {}) {
  if (!isRecord(raw)) {
    return invalidResult(name, ['result must be a non-array object'])
  }

  if ('status' in raw) {
    // 混用两份合同的对象必须先被点名，而不是被 `pickCanonicalResult` 悄悄丢掉字段。
    //
    // 实测（2026-09-17）：一份同时带 `status` 与 `passed` 的读数，`pickCanonicalResult`
    // 只挑 canonical 字段 → 挑出来的 `skipped` 等字段在源对象里可能是 legacy 的布尔值
    // 或干脆缺失 → 报「result schema invalid」，**完全不提 `passed` 这个真正的原因**。
    // 读的人会去查 schema，而问题其实是他混用了两份合同。
    const legacyFields = ['passed', 'ok', 'skipped_reason'].filter((field) => field in raw)
    if (legacyFields.length > 0) {
      return invalidResult(name, [
        `canonical result must not mix legacy fields: ${legacyFields.join(', ')}`
          + '（一份读数只能属于一份合同：要么 canonical(status/expected/checked/skipped/failed/typedSkips/reason)，要么 legacy(passed/skipped 布尔)）',
      ])
    }
    const canonical = pickCanonicalResult(raw)
    const validation = validateGateResult(canonical)
    return validation.valid ? canonical : invalidResult(name, validation.errors)
  }

  return normalizeLegacyResult(raw, name)
}

/**
 * Run synchronous checker functions and return normalized results plus a
 * summary. No filesystem or process state is touched here.
 *
 * `notCovered` 由调用方传入（只有 `gate.mjs` 知道完整的 `CHECKS` 注册表）：它是
 * **本次模式没有跑到的校验项**。它不参与判据、不改变退出码，只进摘要的读数——
 * 「分母 = 这个模式看得见的全部校验项」而不是「这次恰好跑了哪些」（ADR-0102）。
 *
 * @param {Array<{name: string, run: () => unknown, remediation?: string}>} checks
 * @param {{requireNoSkip?: boolean, notCovered?: string[]}} [options]
 * @returns {{results: Array<GateResult & {name: string, remediation?: string}>, summary: ReturnType<typeof summarizeGateResults>, exitCode: number}}
 */
export function runGateChecks(checks, { requireNoSkip = false, notCovered = [] } = {}) {
  const safeChecks = Array.isArray(checks) ? checks : []
  const results = safeChecks.map((check, index) => {
    const name = typeof check?.name === 'string' && check.name.trim() !== '' ? check.name : `unnamed-check-${index + 1}`
    let result
    if (typeof check?.run !== 'function') {
      result = invalidResult(name, ['checker run must be a function'])
    } else {
      try {
        result = normalizeGateResult(check.run(), { name })
      } catch (error) {
        result = thrownResult(name, error)
      }
    }

    return {
      name,
      ...result,
      ...(typeof check?.remediation === 'string' ? { remediation: check.remediation } : {}),
    }
  })
  const summary = summarizeGateResults(results, { requireNoSkip, notCovered })
  return { results, summary, exitCode: summary.exitCode }
}

/**
 * Summarize canonical results. Inputs are normalized again so this standalone
 * function is also fail-closed when called outside runGateChecks().
 *
 * @param {unknown[]} results
 * @param {{requireNoSkip?: boolean, notCovered?: string[]}} [options]
 */
export function summarizeGateResults(results, { requireNoSkip = false, notCovered = [] } = {}) {
  const normalized = (Array.isArray(results) ? results : []).map((result, index) => {
    const name = isRecord(result) && typeof result.name === 'string' ? result.name : `summary-result-${index + 1}`
    return normalizeGateResult(result, { name })
  })
  const passed = normalized.filter((result) => result.status === 'pass').length
  const skipped = normalized.filter((result) => result.status === 'skip').length
  const failed = normalized.filter((result) => result.status === 'fail').length
  const empty = normalized.length === 0
  const strictSkipFailure = requireNoSkip && skipped > 0
  const exitCode = failed > 0 || strictSkipFailure || empty ? 1 : 0
  const status = exitCode !== 0 ? 'fail' : skipped > 0 ? 'skip' : 'pass'

  // 未被本模式覆盖的校验项。它只是读数、**不参与 exitCode**：「这次没跑它」与
  // 「它失败了」是两件事，把两者压进同一个退出码，正是 QG-001 收掉的那种坍缩。
  const uncovered = (Array.isArray(notCovered) ? notCovered : [])
    .filter((name) => typeof name === 'string' && name.trim() !== '')

  return {
    status,
    total: normalized.length,
    passed,
    skipped,
    failed,
    expected: sum(normalized, 'expected'),
    discovered: sum(normalized, 'discovered'),
    checked: sum(normalized, 'checked'),
    skippedObjects: sum(normalized, 'skipped'),
    failedObjects: sum(normalized, 'failed'),
    requireNoSkip,
    exitCode,
    notCovered: uncovered,
    ...(empty ? { reason: 'no gate checks were supplied' } : {}),
    ...(strictSkipFailure ? { reason: 'requireNoSkip rejected one or more skipped checks' } : {}),
  }
}

/**
 * 某个校验项在本次模式下**是否会被执行**。
 *
 * 未声明 `modes` = 所有模式都跑（`gate.mjs` 原来的 `!check.modes` 语义，原样保留）。
 *
 * @param {{modes?: string[]}} check
 * @param {string} mode
 * @returns {boolean}
 */
export function isCheckActive(check, mode) {
  return !check?.modes || check.modes.includes(mode)
}

/**
 * 本次模式**没有跑到**的校验项名字——激活谓词的**严格补集**。
 *
 * 为什么一定要写成补集、而不是重写一遍判断条件：两者一旦各写各的，就会出现
 * 「既没跑、也没报未覆盖」或「跑了、又被报成未覆盖」的项，而**分母的守恒
 * （`跑到的 + 未覆盖的 = 注册表全量`）恰恰是这条读数唯一的判据**（ADR-0102）。
 * 补集由构造保证守恒，重复一遍判断条件则要靠两份代码永远同步——那是纪律，不是机制。
 *
 * 为什么这条逻辑住在这里、而不是写在 `gate.mjs` 里：`scripts/gate.mjs` 导入即执行
 * `main()`，因此**住在里面的逻辑没有任何门禁测得到**——`scripts/gate.test.mjs` 那一族
 * CLI 测试只挂在 `pnpm run test:gate` 上，不在 `pnpm run gate` 的射程内
 * （2026-09-17 实测：83 个注册项里没有一条跑它）。挪到这里，才由 `gate-result-selftest` 守着。
 *
 * @param {Array<{name?: string, modes?: string[]}>} checks 注册表全量
 * @param {string} mode 本次模式
 * @returns {string[]} 未覆盖的校验项名（保持注册顺序）
 */
export function computeNotCovered(checks, mode) {
  return (Array.isArray(checks) ? checks : [])
    .filter((check) => !isCheckActive(check, mode))
    .map((check) => check?.name)
    .filter((name) => typeof name === 'string' && name.trim() !== '')
}

/**
 * 注册表级自检：每个注册项都必须声明**非空** `remediation`，否则判红并点名。
 *
 * 为什么这条逻辑存在：判红文案点名「怎么修」是 quick/full 摘要的一部分
 * （`gate.mjs` 打印 `→ remediation`），但没有任何机制要求新判据声明它——
 * 第 87 条可以悄悄不写，摘要里静默少一行「怎么修」（P-08：用纪律守只有
 * 机制能守住的东西）。`gate.mjs` 在 `CHECKS` 构造后、`main()` 之前调用本函数，
 * 违规即启动失败，不依赖任何测试去跑它。
 *
 * 返回 `{ valid, errors }` 与 `validateGateResult` 同形：纯函数、不抛，
 * 垃圾输入也判红（fail-closed），而不是静默通过。
 *
 * @param {unknown} checks 注册表全量
 * @returns {{valid: boolean, errors: string[]}}
 */
export function assertRemediationDeclared(checks) {
  if (!Array.isArray(checks)) {
    return { valid: false, errors: ['checks must be an array'] }
  }
  const errors = []
  checks.forEach((check, index) => {
    const name = typeof check?.name === 'string' && check.name.trim() !== '' ? check.name : `unnamed-check-${index + 1}`
    if (typeof check?.remediation !== 'string' || check.remediation.trim() === '') {
      errors.push(`${name}: remediation must be a non-empty string`)
    }
  })
  return { valid: errors.length === 0, errors }
}

/** @param {Record<string, unknown>} raw @returns {GateResult} */
function pickCanonicalResult(raw) {
  return {
    status: /** @type {GateStatus} */ (raw.status),
    expected: /** @type {number} */ (raw.expected),
    discovered: /** @type {number} */ (raw.discovered),
    checked: /** @type {number} */ (raw.checked),
    skipped: /** @type {number} */ (raw.skipped),
    failed: /** @type {number} */ (raw.failed),
    typedSkips: /** @type {TypedSkip[]} */ (raw.typedSkips),
    reason: /** @type {string} */ (raw.reason),
    ...('note' in raw ? { note: /** @type {string} */ (raw.note) } : {}),
    violations: /** @type {string[]} */ (raw.violations),
    ...('passed' in raw ? { passed: raw.passed } : {}),
  }
}

/** @param {Record<string, unknown>} raw @param {string} name @returns {GateResult} */
function normalizeLegacyResult(raw, name) {
  const violations = raw.violations
  if (!Array.isArray(violations) || violations.some((item) => typeof item !== 'string')) {
    return invalidResult(name, ['legacy violations must be an array of strings'])
  }
  if ('note' in raw && typeof raw.note !== 'string') {
    return invalidResult(name, ['legacy note must be a string when present'])
  }
  if ('skipped' in raw && typeof raw.skipped !== 'boolean') {
    return invalidResult(name, ['legacy skipped must be boolean when present'])
  }

  if (raw.skipped === true) {
    if (raw.passed === false) {
      return invalidResult(name, ['legacy result cannot be both failed and skipped'])
    }
    if (raw.passed !== undefined && raw.passed !== true) {
      return invalidResult(name, ['legacy passed must be boolean when present'])
    }
    const note = typeof raw.note === 'string' ? raw.note.trim() : ''
    if (note === '') {
      return invalidResult(name, ['legacy skip requires a non-empty reason or note'])
    }
    if (violations.length > 0) {
      return invalidResult(name, ['legacy skip must not contain violations'])
    }
    return {
      status: 'skip',
      expected: 1,
      discovered: 0,
      checked: 0,
      skipped: 1,
      failed: 0,
      typedSkips: [{ type: 'legacy-skip', count: 1, reason: note }],
      reason: note,
      note: /** @type {string} */ (raw.note),
      violations: [],
    }
  }

  if (typeof raw.passed !== 'boolean') {
    return invalidResult(name, ['legacy result requires boolean passed or skipped=true'])
  }
  if (raw.passed) {
    if (violations.length > 0) {
      return invalidResult(name, ['legacy pass must not contain violations'])
    }
    return {
      status: 'pass',
      expected: 1,
      discovered: 1,
      checked: 1,
      skipped: 0,
      failed: 0,
      typedSkips: [],
      reason: 'legacy checker passed',
      ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
      violations: [],
    }
  }

  const failureViolations = violations.length > 0 ? violations : ['legacy checker reported failure without violations']
  return {
    status: 'fail',
    expected: 1,
    discovered: 1,
    checked: 0,
    skipped: 0,
    failed: 1,
    typedSkips: [],
    reason: 'legacy checker failed',
    ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
    violations: failureViolations,
  }
}

/** @param {string} name @param {string[]} errors @returns {GateResult} */
function invalidResult(name, errors) {
  return {
    status: 'fail',
    expected: 1,
    discovered: 0,
    checked: 0,
    skipped: 0,
    failed: 1,
    typedSkips: [],
    reason: `${name}: result schema invalid`,
    violations: errors.map((error) => `${name}: ${error}`),
  }
}

/** @param {string} name @param {unknown} error @returns {GateResult} */
function thrownResult(name, error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return {
    status: 'fail',
    expected: 1,
    discovered: 0,
    checked: 0,
    skipped: 0,
    failed: 1,
    typedSkips: [],
    reason: `${name}: checker threw`,
    violations: [`${name}: checker threw ${detail}`],
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {unknown} value @returns {number | null} */
function integerOrNull(value) {
  return Number.isInteger(value) && /** @type {number} */ (value) >= 0 ? /** @type {number} */ (value) : null
}

/** @param {GateResult[]} results @param {'expected'|'discovered'|'checked'|'skipped'|'failed'} field */
function sum(results, field) {
  return results.reduce((total, result) => total + result[field], 0)
}
