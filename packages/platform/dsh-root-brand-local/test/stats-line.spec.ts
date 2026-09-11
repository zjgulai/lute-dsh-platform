/**
 * 纵切 3：统计条（StatsLine）折叠必须恢复 —— 这是本轮第三个被哈希漂移打掉的锚。
 *
 * seam：同 `live-anchors.spec.ts`（真实产物 lib/client.js + happy-dom）。
 * 真值：2.0.5 现场与本机 / 已入库 2.0.4 归档里的 StatsLine 根类名，
 * 由 `official-artifacts` 从真实产物解析，测试不写死哈希。
 */
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import '../lib/client.js'

import { installOfficialStyle, installPlugin } from './helpers/hero-fixture'
import {
  ARCHIVE_CHAT_CLIENT,
  CHAT_CLIENT_CANDIDATES,
  STATS_LINE_MODULE_ID,
  extractModuleCss,
  firstExisting,
  repoRoot,
  resolveClassName,
} from './official-artifacts'

/** 统计条属于 chat 包，真值必须从 chat 产物里取。 */
const chatClient = firstExisting(CHAT_CLIENT_CANDIDATES)

interface StatsFixture {
  node: HTMLElement
}

/** 用给定的官方 CSS 文本与根类名复刻统计条，并装载插件。 */
function installStats(css: string, rootClass: string): StatsFixture {
  installOfficialStyle(STATS_LINE_MODULE_ID, css)
  const node = document.createElement('div')
  node.className = rootClass
  document.body.appendChild(node)
  installPlugin()
  return { node }
}

describe.skipIf(chatClient === undefined)('统计条折叠（真实产物 seam）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('本轮基座：折叠规则落到官方统计条根节点', () => {
    const css = extractModuleCss(chatClient as string, STATS_LINE_MODULE_ID)
    const { node } = installStats(css, resolveClassName(css, 'root'))

    const style = getComputedStyle(node)
    expect(style.maxHeight).toBe('6px')
    expect(style.opacity).toBe('0.45')
  })

  it('上一代基座（2.0.4 归档）：同一份实现同样命中', () => {
    const css = extractModuleCss(resolve(repoRoot(), ARCHIVE_CHAT_CLIENT), STATS_LINE_MODULE_ID)
    const { node } = installStats(css, resolveClassName(css, 'root'))

    expect(getComputedStyle(node).maxHeight).toBe('6px')
  })
})
