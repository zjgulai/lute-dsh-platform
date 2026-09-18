import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const sourceId = (row) => row?.sourceName ?? row?.name

function duplicateValues(values) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value).sort()
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function auditThirdPartyClassification({ inventory, imported = [], skipped = [], mappingSkills = [] }) {
  const problems = []
  const invalidKeys = new Set()
  const repoAudits = []

  const inventories = Array.isArray(inventory?.repos) ? inventory.repos : []
  if (!Array.isArray(inventory?.repos)) problems.push('third-party-source-inventory.json 缺 repos 数组')
  if (!Array.isArray(imported)) problems.push('fullstack-extra.json 缺 skills 数组')
  if (!Array.isArray(skipped)) problems.push('third-party-skip.json 缺 skips 数组')
  if (!Array.isArray(mappingSkills)) problems.push('fullstack-mapping.json 缺 skills 数组')

  const repoIds = inventories.map((repo) => repo?.id)
  for (const id of duplicateValues(repoIds)) problems.push(`source inventory: 重复 repo id「${id}」`)
  const knownRepos = new Set(repoIds.filter(isNonEmptyString))
  for (const row of [...imported, ...skipped]) {
    if (!knownRepos.has(row?.repo)) problems.push(`分类条目 ${row?.repo ?? '<missing>'}:${sourceId(row) ?? '<missing>'} 指向未知 repo`)
  }

  const mappingNames = mappingSkills.map((row) => row?.name)
  for (const id of duplicateValues(mappingNames)) problems.push(`fullstack-mapping: 重复 name「${id}」`)

  let expectedSourceCount = 0
  let validSourceCount = 0

  for (const repo of inventories) {
    if (!isNonEmptyString(repo?.id) || !isNonEmptyString(repo?.repo)) {
      problems.push('source inventory: repo 必须有非空 id/repo')
      continue
    }
    const id = repo.id
    const key = (source) => `${id}:${source}`
    const upstreamRaw = Array.isArray(repo.upstreamIds) ? repo.upstreamIds : []
    if (!Array.isArray(repo.upstreamIds)) problems.push(`${id}: upstreamIds 必须是数组`)
    const upstreamDuplicates = duplicateValues(upstreamRaw)
    for (const source of upstreamDuplicates) {
      problems.push(`${id}: upstreamIds 重复 source ID「${source}」`)
      invalidKeys.add(key(source))
    }
    const upstream = new Set(upstreamRaw.filter(isNonEmptyString))
    if (upstream.size === 0) problems.push(`${id}: upstreamIds 为空，不能以空射程通过`)
    expectedSourceCount += upstream.size

    const imports = imported.filter((row) => row?.repo === id)
    const skips = skipped.filter((row) => row?.repo === id)
    const already = Array.isArray(repo?.alreadyInstalled?.ids) ? repo.alreadyInstalled.ids : []
    if (!Array.isArray(repo?.alreadyInstalled?.ids)) problems.push(`${id}: alreadyInstalled.ids 必须是数组`)
    if (!isNonEmptyString(repo?.alreadyInstalled?.reason) || repo.alreadyInstalled.reason.length < 20) {
      problems.push(`${id}: alreadyInstalled.reason 缺失或不足 20 字`)
    }

    const importedIds = imports.map(sourceId)
    const skippedIds = skips.map(sourceId)
    for (const [label, values] of [
      ['imported', importedIds],
      ['skipped', skippedIds],
      ['alreadyInstalled', already],
    ]) {
      for (const source of duplicateValues(values)) {
        problems.push(`${id}: ${label} 重复 source ID「${source}」`)
        invalidKeys.add(key(source))
      }
    }

    for (const row of imports) {
      const source = sourceId(row)
      if (!isNonEmptyString(source) || !isNonEmptyString(row?.dir)) {
        problems.push(`${id}: imported 条目缺 name/sourceName/dir`)
        if (isNonEmptyString(source)) invalidKeys.add(key(source))
      }
      if (!isNonEmptyString(row?.cat) || !/^M(0\d|1[0-3])$/.test(row.cat)) {
        problems.push(`${id}:${source ?? '<missing>'}: cat 不在 M00–M13`)
        if (isNonEmptyString(source)) invalidKeys.add(key(source))
      }
      if (!isNonEmptyString(row?.titleZh) || !isNonEmptyString(row?.summaryZh)) {
        problems.push(`${id}:${source ?? '<missing>'}: 缺 titleZh/summaryZh`)
        if (isNonEmptyString(source)) invalidKeys.add(key(source))
      }
    }
    for (const row of skips) {
      const source = sourceId(row)
      if (!isNonEmptyString(source) || !isNonEmptyString(row?.dir)) {
        problems.push(`${id}: skipped 条目缺 name/sourceName/dir`)
        if (isNonEmptyString(source)) invalidKeys.add(key(source))
      }
      if (!isNonEmptyString(row?.reason) || row.reason.length < 20) {
        problems.push(`${id}:${source ?? '<missing>'}: skipped reason 缺失或不足 20 字`)
        if (isNonEmptyString(source)) invalidKeys.add(key(source))
      }
    }
    const terminals = {
      imported: new Set(importedIds.filter(isNonEmptyString)),
      skipped: new Set(skippedIds.filter(isNonEmptyString)),
      alreadyInstalled: new Set(already.filter(isNonEmptyString)),
    }
    const allTerminalIds = new Set(Object.values(terminals).flatMap((set) => [...set]))
    const unexpected = [...allTerminalIds].filter((source) => !upstream.has(source)).sort()
    const missing = [...upstream].filter((source) => !allTerminalIds.has(source)).sort()
    for (const source of unexpected) {
      problems.push(`${id}: 未知 source ID「${source}」不在 upstreamIds`)
      invalidKeys.add(key(source))
    }
    for (const source of missing) {
      problems.push(`${id}: upstream source ID「${source}」没有终态`)
      invalidKeys.add(key(source))
    }

    const overlaps = []
    for (const source of allTerminalIds) {
      const categories = Object.entries(terminals).filter(([, set]) => set.has(source)).map(([label]) => label)
      if (categories.length > 1) {
        overlaps.push({ source, categories })
        problems.push(`${id}: source ID「${source}」同时属于 ${categories.join(' + ')}`)
        invalidKeys.add(key(source))
      }
    }

    for (const source of upstream) {
      const categoryCount = Object.values(terminals).filter((set) => set.has(source)).length
      if (categoryCount === 1 && !invalidKeys.has(key(source))) validSourceCount++
    }

    repoAudits.push({
      id,
      repo: repo.repo,
      commit: repo.commit,
      note: repo.note,
      upstream: upstream.size,
      imported: terminals.imported.size,
      skipped: terminals.skipped.size,
      alreadyInstalled: terminals.alreadyInstalled.size,
      missing,
      unexpected,
      overlaps,
      imports,
      skips,
      alreadyIds: [...terminals.alreadyInstalled].sort(),
      alreadyReason: repo.alreadyInstalled?.reason,
    })
  }

  return { problems, repoAudits, expectedSourceCount, validSourceCount }
}

export function toCanonicalThirdPartyIntakeResult(audit) {
  const expectedSources = audit.expectedSourceCount || 0
  const expected = Math.max(1, expectedSources + 1)
  const checked = Math.min(expected, (audit.validSourceCount || 0) + (audit.problems.length === 0 ? 1 : 0))
  const failed = expected - checked
  const accounting = audit.repoAudits
    .map((repo) => `${repo.id} ${repo.upstream}=${repo.imported}+${repo.skipped}+${repo.alreadyInstalled}`)
    .join('；')
  return {
    status: failed === 0 ? 'pass' : 'fail',
    expected,
    discovered: expected,
    checked,
    skipped: 0,
    failed,
    typedSkips: [],
    reason: failed === 0
      ? 'third-party intake 分类守恒且生成清单一致'
      : audit.problems.join('；') || 'third-party intake mandatory input unreadable',
    note: accounting || 'mandatory input unreadable',
    violations: audit.problems,
  }
}

export function atomicWriteText(target, text) {
  const dir = path.dirname(target)
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`)
  let fd
  try {
    fd = fs.openSync(tmp, 'wx', 0o644)
    fs.writeFileSync(fd, text, 'utf8')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.renameSync(tmp, target)
    const dirFd = fs.openSync(dir, 'r')
    try {
      fs.fsyncSync(dirFd)
    } finally {
      fs.closeSync(dirFd)
    }
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd) } catch {}
    }
    try { fs.unlinkSync(tmp) } catch {}
    throw error
  }
}
