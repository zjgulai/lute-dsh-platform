#!/usr/bin/env node
/**
 * 会话引用面门禁：任何 preset 变更（尤其是删除）之前必须跑的那一项。
 *
 * 为什么需要它（2026-09-11 实测事故）：删除 preset 目录会**硬性阻断引用它的既有会话恢复**。
 * 会话首条记录 `{"type":"session",…,"agentPreset":"<id>"}` 是 deep-frozen 的创建事实；恢复时
 * `dsh-api-session-controller.composeAgent(presetId)` 调 `AgentPresets.resolve(id)`，对不存在的 id
 * **直接抛 RemoteError("agent-preset/not-found")、无 fallback**；且 `assertPresetUnchanged` 在
 * requested≠stored 时抛 `agent-preset/conflict`，**刻意禁止换 preset 恢复**。所以一次"清理"
 * 会让一批历史会话永久打不开，而报错最后被 gateway 包装成泛化的 `(gateway/internal)`，难以定位。
 *
 * 当时我在 P0 删除前只跑了「归档完整性」门禁，**没跑这一项**，导致 28 个会话 / 529,729 条记录
 * 一度打不开。归档救回来是运气，不是流程。正确的删除类门禁是两条：
 *   ① 归档完整（备份可回滚）  ② 无既有引用会被打断（本脚本）
 *
 * 三种用法：
 *   node scripts/role-presets/scan-session-refs.mjs
 *       报告当前引用面；存在失效引用时退出码 1。
 *   node scripts/role-presets/scan-session-refs.mjs --assert-clean
 *       同上，但"无失效引用"是硬断言（用于变更前基线）。
 *   node scripts/role-presets/scan-session-refs.mjs --would-remove a,b,c
 *       **预检**：假设删掉 a,b,c，会打断哪些会话。这是本脚本存在的主要理由。
 *
 * 可选参数：--sessions <dir>  --user-root <dir>  --shipped-root <dir>  --json  --quiet
 *
 * 解码纪律与 roster 判定见 session-refs.mjs 头部说明（用错会得出反向结论）。
 */
import {
  DEFAULT_SESSIONS_ROOT, DEFAULT_SHIPPED_ROOT, DEFAULT_USER_PRESET_ROOT,
  findZstd, resolveRoster, scanSessions, summarize,
} from './session-refs.mjs'

/** 解析命令行参数。 */
function parseArgs(argv) {
  const out = {
    sessionsRoot: DEFAULT_SESSIONS_ROOT,
    userRoot: DEFAULT_USER_PRESET_ROOT,
    shippedRoot: process.env['ROLE_SHIPPED_PRESET_ROOT'] ?? DEFAULT_SHIPPED_ROOT,
    wouldRemove: null, assertClean: false, json: false, quiet: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--sessions') out.sessionsRoot = argv[++i]
    else if (a === '--user-root') out.userRoot = argv[++i]
    else if (a === '--shipped-root') out.shippedRoot = argv[++i]
    else if (a === '--would-remove') out.wouldRemove = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--assert-clean') out.assertClean = true
    else if (a === '--json') out.json = true
    else if (a === '--quiet') out.quiet = true
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0) }
    else { console.error(`未知参数：${a}`); printUsage(); process.exit(2) }
  }
  return out
}

/** 打印用法。 */
function printUsage() {
  console.error(`用法：
  node scripts/role-presets/scan-session-refs.mjs [选项]

选项：
  --would-remove a,b,c   预检：删掉这些 preset 会打断哪些会话（会打断则退出码 1）
  --assert-clean         无失效引用才算过（有则退出码 1）
  --sessions <dir>       会话根（默认 ${DEFAULT_SESSIONS_ROOT}）
  --user-root <dir>      用户 preset 根（默认 ${DEFAULT_USER_PRESET_ROOT}）
  --shipped-root <dir>   shipped preset 根（默认随部署）
  --json                 机器可读输出
  --quiet                只打印结论`)
}

/** 主流程。 */
async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const zstd = findZstd()
  const roster = resolveRoster({ shippedRoot: opts.shippedRoot, userRoot: opts.userRoot })

  const { rows, byPreset, scanned, withPreset } = await scanSessions({ sessionsRoot: opts.sessionsRoot, zstd })
  if (scanned === 0) {
    console.error(`✗ 在 ${opts.sessionsRoot} 下没找到任何会话文件（session.jsonl.zstd）——路径是否正确？`)
    process.exit(2)
  }

  const unresolved = [...byPreset.entries()].filter(([id]) => !roster.available.has(id))
  const removed = opts.wouldRemove
  const wouldBreak = removed === null ? [] : [...byPreset.entries()].filter(([id]) => removed.includes(id))
  const sorted = (entries) => [...entries].sort((a, b) => b[1].length - a[1].length)

  if (opts.json) {
    console.log(JSON.stringify({
      scanned, withPreset, withoutPreset: scanned - withPreset,
      availablePresets: roster.available.size, missingRoots: roster.missingRoots,
      unresolved: sorted(unresolved).map(([id, s]) => ({ preset: id, ...summarize(s), sessionIds: s.map((x) => x.session) })),
      wouldRemove: removed,
      wouldBreak: sorted(wouldBreak).map(([id, s]) => ({ preset: id, ...summarize(s), sessionIds: s.map((x) => x.session) })),
    }, null, 2))
  } else {
    const line = (s) => { if (!opts.quiet) console.log(s) }
    const shape = (sum) => `${String(sum.sessions).padStart(3)} 会话 · ${String(sum.records).padStart(7)} 条记录 · ${sum.userMessages} 条用户消息 · ${(sum.bytes / 1048576).toFixed(1)}MB`
    line('会话引用面报告')
    line(`  会话根：${opts.sessionsRoot}`)
    line(`  preset 根：user=${roster.user.size}  shipped=${roster.shipped.size}  可用合计 ${roster.available.size}`)
    if (roster.missingRoots.length > 0) line(`  ⚠ 这些 preset 根读不到（会把其中的 preset 误判为缺失）：${roster.missingRoots.join(' · ')}`)
    const withoutPreset = rows.filter((r) => !r.preset)
    const originTally = withoutPreset.reduce((m, r) => {
      const key = r.origin ?? '未知'
      m[key] = (m[key] ?? 0) + 1
      return m
    }, {})
    const originText = Object.entries(originTally).sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `${key} ${count}`).join(' · ')
    line(`  扫描：${scanned} 个会话（全部成功解码） · 带 agentPreset ${withPreset} · 无 agentPreset ${withoutPreset.length}${originText === '' ? '' : `（${originText}）`}`)
    line('')
    line(`  引用到的 preset（${byPreset.size} 个，按会话数降序）`)
    for (const [id, s] of sorted(byPreset)) line(`    ${roster.available.has(id) ? '  ' : '★ '}${id.padEnd(28)} ${shape(summarize(s))}`)
    line('')
    if (removed !== null) {
      line(`  预检：删除 [${removed.join(', ')}] 将打断`)
      if (wouldBreak.length === 0) line('    （无）—— 没有会话引用这些 preset')
      for (const [id, s] of sorted(wouldBreak)) {
        line(`    ✗ ${id.padEnd(28)} ${shape(summarize(s))}`)
        for (const r of s.slice(0, 5)) line(`        ${r.session}`)
        if (s.length > 5) line(`        … 其余 ${s.length - 5} 个`)
      }
      line('')
    }
    if (unresolved.length === 0) {
      line(`  ★ 当前无失效引用：${withPreset} 个会话全部能解析到 present 的 preset`)
    } else {
      line(`  ✗ 失效引用：${unresolved.reduce((a, [, s]) => a + s.length, 0)} 个会话引用了不存在的 preset`)
      for (const [id, s] of sorted(unresolved)) line(`    ${id.padEnd(28)} ${shape(summarize(s))}`)
      line('')
      line('  修复：node scripts/role-presets/restore-presets.mjs --referenced --from <归档目录>')
    }
  }

  const failing = removed !== null ? wouldBreak.length > 0 : unresolved.length > 0
  if (opts.assertClean || removed !== null) {
    if (!opts.quiet && !opts.json) console.log('')
    if (failing) {
      console.error(`✗ 门禁未过：${removed !== null ? '该删除会打断既有会话' : '存在失效引用'}`)
      process.exit(1)
    }
    if (!opts.quiet && !opts.json) console.log('✓ 门禁通过：既有会话引用面完好')
    process.exit(0)
  }
  process.exit(unresolved.length > 0 ? 1 : 0)
}

main().catch((error) => { console.error('✗ 扫描失败：', error instanceof Error ? error.message : String(error)); process.exit(2) })
