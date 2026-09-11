#!/usr/bin/env node
/**
 * 会话↔preset 引用面的共享实现（被 scan-session-refs.mjs 与 restore-presets.mjs 共用）。
 *
 * 抽成独立模块的理由是 ADR-0009「一份事实只有一个家」：解码纪律、roster 判定、
 * 引用面扫描三者如果各写一份，迟早会漂移——而这次的教训正是"用错解码器会得出反向结论"。
 *
 * 两条实现纪律（都是 2026-09-11 实测踩出来的，见 scan-session-refs.mjs 头部说明）：
 *   1. session.jsonl.zstd 是**多帧拼接**，必须走 `zstd -dc`；Node 自带的两种解码器都只解首帧。
 *   2. roster 必须同时含 shipped 根与 user 根；只查用户根会把 shipped 4 个误判为缺失。
 */
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

/** 默认 shipped preset 根（部署目录内，随应用升级而变）。 */
export const DEFAULT_SHIPPED_ROOT =
  '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets'

/** 默认会话根。 */
export const DEFAULT_SESSIONS_ROOT = join(homedir(), '.dsh', 'sessions')

/** 默认用户 preset 根。 */
export const DEFAULT_USER_PRESET_ROOT = join(homedir(), '.dsh', '.agent-presets')

/** zstd CLI 候选位置；多帧解码只有 CLI 靠得住。 */
const ZSTD_CANDIDATES = ['zstd', '/opt/homebrew/bin/zstd', '/usr/local/bin/zstd']

/**
 * 找一个可用的 zstd CLI。
 * @returns {string} 可执行名或绝对路径。
 */
export function findZstd() {
  for (const candidate of ZSTD_CANDIDATES) {
    if (candidate.includes('/')) { if (existsSync(candidate)) return candidate; continue }
    return candidate // PATH 里的裸名：交给 spawn 解析，失败会在流错误里响亮报出
  }
  return 'zstd'
}

/**
 * 列出一个 preset 根下的 preset id（目录名即 id）。
 * @param {string} root - preset 根目录。
 * @returns {Set<string>} id 集合；根不存在时为空集。
 */
export function listPresets(root) {
  const out = new Set()
  try {
    for (const e of readdirSync(root, { withFileTypes: true })) if (e.isDirectory()) out.add(e.name)
  } catch { /* 根不存在：按空集处理，调用方据此报告 */ }
  return out
}

/**
 * 解析真实 roster：shipped 根在前（同名先胜）、user 根在后，与宿主
 * `AgentPresets.resolvedRoots` 的次序语义一致。
 * @param {{shippedRoot: string, userRoot: string}} roots - 两根路径。
 * @returns {{available: Set<string>, user: Set<string>, shipped: Set<string>, missingRoots: string[]}}
 */
export function resolveRoster(roots) {
  const shipped = listPresets(roots.shippedRoot)
  const user = listPresets(roots.userRoot)
  const missingRoots = []
  if (shipped.size === 0) missingRoots.push(roots.shippedRoot)
  if (user.size === 0) missingRoots.push(roots.userRoot)
  return { available: new Set([...shipped, ...user]), user, shipped, missingRoots }
}

/**
 * 找出全部会话文件（`<root>/<project>/<session>/session.jsonl.zstd`）。
 * @param {string} root - 会话根。
 * @returns {Array<{file: string, session: string, project: string}>} 会话文件清单。
 */
export function listSessionFiles(root) {
  const files = []
  let projects
  try { projects = readdirSync(root, { withFileTypes: true }) } catch { return files }
  for (const proj of projects) {
    if (!proj.isDirectory()) continue
    const base = join(root, proj.name)
    let sessions
    try { sessions = readdirSync(base, { withFileTypes: true }) } catch { continue }
    for (const s of sessions) {
      if (!s.isDirectory()) continue
      const file = join(base, s.name, 'session.jsonl.zstd')
      try { statSync(file); files.push({ file, session: s.name, project: proj.name }) } catch { /* 无日志的会话 */ }
    }
  }
  return files
}

/**
 * 流式解码一个会话文件并抽取所需字段。
 *
 * 只统计、不把解压结果整体留在内存（单文件可解出 90MB+）。便宜预筛后再 JSON.parse，
 * 避免对 17 万行做全量解析。
 * @param {string} zstd - zstd CLI。
 * @param {string} file - 会话文件。
 * @returns {Promise<{preset: string|null, source: string|null, records: number, userMessages: number, bytes: number, createdAt: number|null}>}
 */
export async function readSession(zstd, file) {
  const bytes = statSync(file).size
  return await new Promise((resolve, reject) => {
    const child = spawn(zstd, ['-dc', file], { stdio: ['ignore', 'pipe', 'ignore'] })
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
    let header = null, selected = null, records = 0, userMessages = 0
    rl.on('line', (line) => {
      if (line === '') return
      records++
      if (!line.includes('"session"') && !line.includes('agent-preset') && !line.includes('user/message')) return
      let r
      try { r = JSON.parse(line) } catch { return }
      if (r.type === 'session') header = r
      else if (r.type === 'agent-preset/selected') selected = r.agentPreset ?? selected
      else if (r.type === 'user/message') userMessages++
    })
    child.on('error', (error) => reject(new Error(
      `无法执行 zstd（${zstd}）：${error.message}；多帧解码必须用 zstd CLI（Node 自带解码器只解首帧）`)))
    child.on('close', () => resolve({
      preset: selected ?? header?.agentPreset ?? null,
      source: selected ? 'selected' : (header?.agentPreset ? 'header' : null),
      records, userMessages, bytes, createdAt: header?.createdAt ?? null,
      // 首条 session 记录的 origin 决定这个会话是否真的会去解析默认 preset：
      // origin=subagent 的会话走父方 composeFrom 组合，压根不读 agent-presets.default。
      // 没有它，"无 agentPreset" 会被误读成"用默认"，从而高估删除默认 preset 的影响面。
      origin: header?.origin ?? null,
    }))
  })
}

/**
 * 扫描全部会话，按 preset 归并引用面。
 * @param {{sessionsRoot: string, zstd?: string}} options - 会话根与可选 zstd 路径。
 * @returns {Promise<{rows: Array<object>, byPreset: Map<string, Array<object>>, scanned: number, withPreset: number}>}
 */
export async function scanSessions(options) {
  const zstd = options.zstd ?? findZstd()
  const files = listSessionFiles(options.sessionsRoot)
  const rows = []
  for (const f of files) rows.push({ ...f, ...(await readSession(zstd, f.file)) })
  const byPreset = new Map()
  for (const r of rows) {
    if (!r.preset) continue
    if (!byPreset.has(r.preset)) byPreset.set(r.preset, [])
    byPreset.get(r.preset).push(r)
  }
  return { rows, byPreset, scanned: rows.length, withPreset: rows.filter((r) => r.preset).length }
}

/**
 * 汇总一组会话的影响面。
 * @param {Array<object>} sessions - 会话行。
 * @returns {{sessions: number, records: number, userMessages: number, bytes: number}} 汇总。
 */
export function summarize(sessions) {
  return {
    sessions: sessions.length,
    records: sessions.reduce((a, r) => a + r.records, 0),
    userMessages: sessions.reduce((a, r) => a + r.userMessages, 0),
    bytes: sessions.reduce((a, r) => a + r.bytes, 0),
  }
}
