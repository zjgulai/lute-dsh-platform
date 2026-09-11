#!/usr/bin/env node
/**
 * Preset 恢复工具：把归档里的 preset 目录保真放回用户 preset 根。
 *
 * 存在理由：删除 preset 会**打断引用它的既有会话恢复**（见 scan-session-refs.mjs 头部）。
 * 修复办法是零代码改动地把目录放回去——`AgentPresets.list()/resolve()` 每次调用都重读 root
 * （源码原文 “Discovery is unmemoized…”），所以**恢复后无需重启**宿主。
 *
 * 用法：
 *   node scripts/role-presets/restore-presets.mjs --from <归档目录> --referenced
 *       恢复"被会话引用但当前缺失"的那些（推荐：范围由证据定，不靠人记）。
 *   node scripts/role-presets/restore-presets.mjs --from <归档目录> --ids a,b,c
 *       恢复指定 id。
 *   加 --dry-run 只看计划；加 --skip-existing 容忍已存在的（默认拒绝覆盖）。
 *
 * 门禁（缺一不执行）：
 *   ① 归档目录存在且每个 id 在其中
 *   ② 目标不存在（默认拒绝覆盖，避免用旧归档盖掉新内容）
 *   ③ 恢复后逐项核验 文件数 + 总字节数 与归档一致
 *
 * 纪律：一律用 `ditto` 逐目录复制。实测教训——`cp -R "$d/" "$dst/"` 在 BSD 上复制的是
 * **内容而非目录**（$d 带尾斜杠时），会把多个 preset 拍平合并成一个脏目录。归档时正是
 * 这个 bug 被完整性校验拦住，才没丢掉 15 个 preset。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  DEFAULT_SESSIONS_ROOT, DEFAULT_SHIPPED_ROOT, DEFAULT_USER_PRESET_ROOT,
  resolveRoster, scanSessions,
} from './session-refs.mjs'

/** 解析命令行参数。 */
function parseArgs(argv) {
  const out = {
    from: null, ids: null, referenced: false, dryRun: false, skipExisting: false,
    userRoot: DEFAULT_USER_PRESET_ROOT, sessionsRoot: DEFAULT_SESSIONS_ROOT,
    shippedRoot: process.env['ROLE_SHIPPED_PRESET_ROOT'] ?? DEFAULT_SHIPPED_ROOT, json: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') out.from = argv[++i]
    else if (a === '--ids') out.ids = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--referenced') out.referenced = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--skip-existing') out.skipExisting = true
    else if (a === '--user-root') out.userRoot = argv[++i]
    else if (a === '--sessions') out.sessionsRoot = argv[++i]
    else if (a === '--shipped-root') out.shippedRoot = argv[++i]
    else if (a === '--json') out.json = true
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0) }
    else { console.error(`未知参数：${a}`); printUsage(); process.exit(2) }
  }
  return out
}

/** 打印用法。 */
function printUsage() {
  console.error(`用法：
  node scripts/role-presets/restore-presets.mjs --from <归档目录> (--referenced | --ids a,b,c) [选项]

选项：
  --referenced        恢复"被会话引用但当前缺失"的那些（范围由证据定）
  --ids a,b,c         恢复指定 id
  --dry-run           只打印计划，不写盘
  --skip-existing     已存在的跳过（默认拒绝覆盖）
  --user-root <dir>   目标 preset 根（默认 ${DEFAULT_USER_PRESET_ROOT}）
  --sessions <dir>    会话根，--referenced 用（默认 ${DEFAULT_SESSIONS_ROOT}）
  --json              机器可读输出`)
}

/** 统计一个目录的文件数与总字节数。 */
function measure(dir) {
  let files = 0, bytes = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) { files++; bytes += statSync(p).size }
    }
  }
  walk(dir)
  return { files, bytes }
}

/** 主流程。 */
async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.from === null) { console.error('✗ 必须给 --from <归档目录>'); printUsage(); process.exit(2) }
  if (!opts.referenced && opts.ids === null) { console.error('✗ 必须给 --referenced 或 --ids'); printUsage(); process.exit(2) }

  const archive = resolve(opts.from)
  if (!existsSync(archive)) { console.error(`✗ 归档目录不存在：${archive}`); process.exit(2) }

  // ── 目标清单：--referenced 时由会话引用面推导（源真相是会话本身，不是人的记忆）──
  let ids = opts.ids ?? []
  if (opts.referenced) {
    const roster = resolveRoster({ shippedRoot: opts.shippedRoot, userRoot: opts.userRoot })
    const { byPreset, scanned } = await scanSessions({ sessionsRoot: opts.sessionsRoot })
    if (scanned === 0) { console.error(`✗ 在 ${opts.sessionsRoot} 下没找到会话——--referenced 无法推导`); process.exit(2) }
    ids = [...byPreset.keys()].filter((id) => !roster.available.has(id)).sort()
    if (ids.length === 0) {
      console.log(`✓ 无需恢复：扫描 ${scanned} 个会话，全部引用的 preset 都已 present`)
      process.exit(0)
    }
  }

  // ── 门禁 ①：归档里必须有 ──
  const plan = []
  let blocked = false
  for (const id of ids) {
    const source = join(archive, id)
    const target = join(opts.userRoot, id)
    if (!existsSync(source)) { console.error(`  ✗ 归档缺 ${id}（${source}）`); blocked = true; continue }
    if (existsSync(target)) {
      if (opts.skipExisting) { plan.push({ id, source, target, action: 'skip' }); continue }
      console.error(`  ✗ 目标已存在，拒绝覆盖：${target}（如需容忍请加 --skip-existing）`); blocked = true; continue
    }
    plan.push({ id, source, target, action: 'restore' })
  }
  if (blocked) { console.error('✗ 门禁未过，未做任何写入'); process.exit(1) }

  const toRestore = plan.filter((p) => p.action === 'restore')
  if (!opts.json) {
    console.log(`归档：${archive}`)
    console.log(`目标：${opts.userRoot}`)
    console.log(`计划：恢复 ${toRestore.length} 个${plan.length - toRestore.length > 0 ? `，跳过 ${plan.length - toRestore.length} 个` : ''}${opts.dryRun ? '（--dry-run，不写盘）' : ''}`)
    console.log('')
  }
  if (opts.dryRun) {
    for (const p of plan) console.log(`  ${p.action === 'restore' ? '将恢复' : '将跳过'} ${p.id}`)
    process.exit(0)
  }

  // ── 执行：ditto 逐目录保真（勿用 cp -R，见文件头纪律）──
  for (const p of toRestore) {
    execFileSync('ditto', [p.source, p.target], { stdio: 'inherit' })
    if (!opts.json) console.log(`  已恢复 ${p.id}`)
  }

  // ── 门禁 ③：逐项核验 文件数 + 总字节数 ──
  const results = []
  let mismatch = false
  for (const p of toRestore) {
    const a = measure(p.source)
    const b = measure(p.target)
    const ok = a.files === b.files && a.bytes === b.bytes
    if (!ok) mismatch = true
    results.push({ id: p.id, archive: a, restored: b, ok })
  }

  if (opts.json) {
    console.log(JSON.stringify({ archive, target: opts.userRoot, restored: results }, null, 2))
  } else {
    console.log('')
    console.log('逐项核验（文件数 + 总字节数）')
    for (const r of results) {
      console.log(`  ${r.ok ? 'OK      ' : '✗MISMATCH'} ${r.id.padEnd(28)} ${String(r.archive.files).padStart(3)} 文件 / ${String(r.archive.bytes).padStart(8)} B`)
    }
    console.log('')
    console.log(mismatch ? '✗ 存在不一致' : `★ 恢复完整：${results.length}/${results.length} 逐项字节级一致`)
    if (!mismatch) console.log('  无需重启宿主：list()/resolve() 每次调用都重读 preset 根。')
  }
  process.exit(mismatch ? 1 : 0)
}

main().catch((error) => { console.error('✗ 恢复失败：', error instanceof Error ? error.message : String(error)); process.exit(2) })
