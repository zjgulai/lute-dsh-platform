#!/usr/bin/env node
/**
 * 共享层同步 CLI。
 *
 * 用法：
 *   node scripts/sync-shared.mjs          校验（默认；有漂移则退出码 1）
 *   node scripts/sync-shared.mjs --write  把 shared/ 的真实内容写回各副本
 *   node scripts/sync-shared.mjs --list   只列出消费方与其状态
 *
 * 退出码即契约：0 = 一致；1 = 存在漂移或共享源缺失；2 = 用法错误。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectSharedConsumers, expectedCopy } from './gates/sync-shared.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const known = new Set(['--write', '--list'])
const unknown = args.filter((a) => !known.has(a))
if (unknown.length > 0) {
  console.error(`sync-shared: 未知参数 ${unknown.join(' ')}`)
  process.exit(2)
}
const write = args.includes('--write')
const listOnly = args.includes('--list')

const { consumers, violations } = collectSharedConsumers(repoRoot)

if (listOnly) {
  for (const c of consumers) console.log(`${c.status.padEnd(14)} ${c.copyPath}  <-  ${c.sharedPath}`)
  console.log(`\n共 ${consumers.length} 个消费方，${violations.length} 处不一致。`)
  process.exit(violations.length === 0 ? 0 : 1)
}

if (write) {
  let repaired = 0
  for (const c of consumers) {
    if (c.status === 'ok') continue
    if (c.status === 'missing-source') {
      console.error(`sync-shared: 跳过 ${c.copyPath} —— ${c.sharedPath} 不存在`)
      continue
    }
    const abs = join(repoRoot, c.copyPath)
    writeFileSync(abs, expectedCopy(c.sharedPath, readFileSync(join(repoRoot, c.sharedPath), 'utf8')))
    console.log(`[written] ${c.copyPath}  <-  ${c.sharedPath}`)
    repaired += 1
  }
  const after = collectSharedConsumers(repoRoot)
  if (after.violations.length > 0) {
    for (const v of after.violations) console.error(`[FAIL] ${v}`)
    process.exit(1)
  }
  console.log(`sync-shared: 已写回 ${repaired} 个副本；${after.consumers.length} 个消费方全部一致。`)
  process.exit(0)
}

if (violations.length > 0) {
  for (const v of violations) console.error(`[DRIFT] ${v}`)
  console.error(`\nsync-shared: ${violations.length} 处不一致。跑 node scripts/sync-shared.mjs --write 写回。`)
  process.exit(1)
}
console.log(`sync-shared: ${consumers.length} 个生成副本与 shared/ 一致。`)
