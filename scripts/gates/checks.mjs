/**
 * 门禁校验实现。每个 check 接收「仓库根 + 待校验条目」并返回 { passed, violations }，
 * 不自行读取全局状态、不抛异常——调用方（scripts/gate.mjs）负责收集与报告。
 *
 * 契约：violations 为人类可读的中文字符串数组，顺序与输入条目顺序一致；
 * 空数组表示通过。调用方依赖 `passed === (violations.length === 0)`。
 */

/** luteOrigin 的封闭取值集合（ADR-0012）。 */
const LUTE_ORIGINS = ['self', 'internalized', 'npm-pinned']

/**
 * 校验包身份三元组。
 * @param {string} repoRoot 仓库根绝对路径（预留给需要读取磁盘的扩展校验）
 * @param {Array<{dir: string, manifest: Record<string, unknown>}>} entries 待校验的包
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkPackageIdentity(repoRoot, entries) {
  const violations = []
  for (const { dir, manifest } of entries) {
    const { luteOrigin, luteOwner, lutePublish } = manifest
    if (luteOrigin === undefined) violations.push(`${dir}: 缺少 luteOrigin`)
    else if (!LUTE_ORIGINS.includes(luteOrigin)) {
      violations.push(`${dir}: luteOrigin 取值非法（${luteOrigin}），仅允许 ${LUTE_ORIGINS.join(' / ')}`)
    }
    if (luteOwner === undefined) violations.push(`${dir}: 缺少 luteOwner`)
    if (lutePublish === undefined) violations.push(`${dir}: 缺少 lutePublish`)
    else if (typeof lutePublish !== 'boolean') violations.push(`${dir}: lutePublish 必须是布尔值`)
  }
  return { passed: violations.length === 0, violations }
}

/** 白名单条目中不参与存在性校验的通用模式。 */
const WHITELIST_PATTERNS_TO_SKIP = new Set(['*/', '*', '.gitignore'])

/**
 * 校验 .gitignore 白名单条目都指向磁盘上真实存在的路径（ADR-0013）。
 * @param {{gitignoreText: string, exists: (path: string) => boolean}} input 文件内容与路径存在性判定
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkGitignoreWhitelist({ gitignoreText, exists }) {
  const violations = []
  for (const line of gitignoreText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('!')) continue

    const raw = trimmed.slice(1)
    if (WHITELIST_PATTERNS_TO_SKIP.has(raw)) continue

    const target = raw.replace(/^\//, '').replace(/\/\*\*$/, '').replace(/\/$/, '')
    if (target === '' || target.includes('*')) continue
    if (!exists(target)) {
      violations.push(`${target}: .gitignore 白名单条目指向不存在的路径（ADR-0013 禁止幽灵条目）`)
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验 vendor/dsh-desktop.pin 的 harness-submodule 字段与子模块实际 HEAD 一致（ADR-0008）。
 * @param {{pinText: string, submoduleSha: string}} input pin 文件内容与子模块实际 HEAD
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkPinConsistency({ pinText, submoduleSha }) {
  const violations = []
  const match = /^harness-submodule:\s*(.+)$/m.exec(pinText)
  const recorded = match ? match[1].trim() : undefined

  if (recorded === undefined) {
    violations.push('vendor/dsh-desktop.pin 缺少 harness-submodule 字段')
  } else if (recorded.startsWith('NOT-INITIALIZED')) {
    violations.push('vendor/dsh-desktop.pin 的 harness-submodule 仍为 NOT-INITIALIZED（ADR-0008 要求初始化）')
  } else if (recorded !== submoduleSha) {
    violations.push(
      `vendor/dsh-desktop.pin 记录的 harness-submodule（${recorded}）与 vendor/dsh-desktop/deepseek-harness 实际 HEAD（${submoduleSha}）不一致`,
    )
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验 ADR 索引与文件一致、编号连续（ADR-0015）。
 * @param {{adrFiles: string[], indexText: string}} input ADR 文件路径列表与索引表内容
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkAdrIndex({ adrFiles, indexText }) {
  const violations = []
  const fileNumbers = adrFiles
    .map((path) => /ADR-(\d{4})\.md$/.exec(path)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b)

  const indexedNumbers = []
  for (const line of indexText.split('\n')) {
    if (!line.startsWith('|')) continue
    const match = /^\|\s*ADR-(\d{4})\s*\|/.exec(line)
    if (!match) continue
    const number = Number(match[1])
    indexedNumbers.push(number)
    const expected = `docs/adr/ADR-${match[1]}.md`
    if (!adrFiles.includes(expected)) violations.push(`${expected}：索引已登记但文件不存在`)
  }

  const sorted = [...indexedNumbers].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      violations.push(
        `ADR 编号不连续：缺 ADR-${String(sorted[i - 1] + 1).padStart(4, '0')}（索引含 ${sorted[0]}, ${sorted[sorted.length - 1]}）`,
      )
      break
    }
  }
  if (fileNumbers.length !== indexedNumbers.length) {
    violations.push(`ADR 文件数（${fileNumbers.length}）与索引条目数（${indexedNumbers.length}）不一致`)
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验 ADR 头部的「决策记录」链接可达，且对应 Note 正文回引该 ADR 编号（ADR-0015）。
 * @param {{adrDocs: Array<{path: string, text: string}>, notePath: string, noteText: string, exists: (path: string) => boolean}} input
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkAdrNoteLinks({ adrDocs, notePath, noteText, exists }) {
  const violations = []
  const noteNumbers = []
  for (const { path, text } of adrDocs) {
    const number = /ADR-(\d{4})/.exec(path)?.[1]
    const match = /决策记录：\[Note\]\(([^)]+)\)/.exec(text)
    if (!match) continue

    const target = resolveDocLink(path, match[1])
    if (!exists(target)) {
      violations.push(`${path}：决策记录链接指向不存在的 Note（${target}）`)
      continue
    }
    if (number) noteNumbers.push(number)
  }

  for (const number of noteNumbers) {
    if (!noteText.includes(`ADR-${number}`)) {
      violations.push(`${notePath}：正文未引用 ADR-${number}`)
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 把文档内的相对链接归一化为仓库根相对路径（链接以所在文档目录为基准）。
 * @param {string} fromPath 链接所在文档的仓库根相对路径
 * @param {string} link 链接字面量
 * @returns {string} 归一化后的仓库根相对路径
 */
function resolveDocLink(fromPath, link) {
  const segments = fromPath.split('/').slice(0, -1)
  for (const part of link.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }
  return segments.join('/')
}

/**
 * 校验豁免登记只减不增、期限不延后、到期即失败（ADR-0014）。
 * @param {{exemptions: Array<Record<string, unknown>>, baseline: Array<Record<string, unknown>>, today: string}} input
 *   当前豁免条目、基线条目（上次提交状态）与今日日期（YYYY-MM-DD）
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkExemptions({ exemptions, baseline, today }) {
  const violations = []
  const baselineByName = new Map(baseline.map((entry) => [entry.package, entry]))

  for (const entry of exemptions) {
    const name = entry.package
    const previous = baselineByName.get(name)

    if (!previous) {
      violations.push(`${name}: 新增豁免条目被拒绝（ADR-0014 只减不增，请在基线中登记或先补齐）`)
      continue
    }
    if (entry.deadline === undefined) {
      violations.push(`${name}: 豁免条目缺少 deadline 字段（ADR-0014）`)
    } else if (previous.deadline !== undefined && entry.deadline > previous.deadline) {
      violations.push(`${name}: 豁免期限不得延后（基线 ${previous.deadline} → 当前 ${entry.deadline}，ADR-0014）`)
    } else if (entry.deadline < today) {
      violations.push(`${name}: 豁免已过期（deadline ${entry.deadline}，今天 ${today}）——到期即为最高优先级，不得继续豁免`)
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验没有「已跟踪文件同时命中忽略规则」的漂移（ADR-0013）。
 * 该状态会让仓库对同一文件给出两种相反回答：git 跟踪它，忽略规则又声称它不该存在。
 * @param {{trackedIgnored: string[]}} input `git ls-files --cached --ignored --exclude-standard` 的输出
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkTrackedIgnored({ trackedIgnored }) {
  return {
    passed: trackedIgnored.length === 0,
    violations: trackedIgnored.map(
      (file) => `${file}: 已跟踪文件同时命中忽略规则（tracked+ignored 漂移，ADR-0013）`,
    ),
  }
}
