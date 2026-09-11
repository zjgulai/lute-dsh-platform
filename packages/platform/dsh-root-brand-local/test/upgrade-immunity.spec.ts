/**
 * 纵切 4：升级免疫与可观测性。
 *
 * - 免疫：上游换任意新哈希前缀时，**不改一行代码**也必须命中（这是本轮的根治目标）。
 * - 可观测：锚点缺失时必须自报（诊断属性 + 警告），不得静默退化。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../lib/client.js'

import { brandMarkHtml, installOfficialStyle, installPlugin, renderHeroFixture, visibleTexts } from './helpers/hero-fixture'
import { BRAND_PHRASE } from './helpers/hero-fixture'
import { HERO_SHELL_MODULE_ID, STATS_LINE_MODULE_ID } from './official-artifacts'

/** 上游未来版的假前缀（与两代真实前缀都不同）。 */
const FUTURE_PREFIX = 'k7Qw2Z'

/** 假上游 hero 模块 CSS：结构与官方一致，只有前缀不同。 */
const FUTURE_HERO_CSS =
  `.${FUTURE_PREFIX}_root{display:flex}` +
  `.${FUTURE_PREFIX}_headline{display:grid;grid-template-columns:34px auto auto}` +
  `.${FUTURE_PREFIX}_headlineText{grid-area:1/2}` +
  `.${FUTURE_PREFIX}_previewBadge{font-size:12px}`

/** 假上游统计条 CSS。 */
const FUTURE_STATS_CSS = `.${FUTURE_PREFIX}_root{text-align:center}.${FUTURE_PREFIX}_sep{margin:0 10px}`

describe('升级免疫与可观测性（真实产物 seam）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('上游换成任意新前缀：同一份实现仍然命中，且状态为 resolved', () => {
    installOfficialStyle(HERO_SHELL_MODULE_ID, FUTURE_HERO_CSS)
    installOfficialStyle(STATS_LINE_MODULE_ID, FUTURE_STATS_CSS)

    const fixture = renderHeroFixture(
      {
        headline: `${FUTURE_PREFIX}_headline`,
        headlineText: `${FUTURE_PREFIX}_headlineText`,
        previewBadge: `${FUTURE_PREFIX}_previewBadge`,
      },
      brandMarkHtml(),
    )
    const stats = document.createElement('div')
    stats.className = `${FUTURE_PREFIX}_root`
    document.body.appendChild(stats)

    installPlugin()

    expect(getComputedStyle(fixture.headlineText).display).toBe('none')
    expect(visibleTexts(fixture.hero, BRAND_PHRASE)).toEqual([BRAND_PHRASE])
    expect(fixture.previewBadge.textContent).toBe('Preview')
    expect(getComputedStyle(stats).maxHeight).toBe('6px')
    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('resolved')
  })

  it('官方样式缺席时：状态变为 degraded 且给出警告（不静默退化）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    installPlugin()

    const state = document.documentElement.dataset.dshRootBrandAnchors ?? ''
    expect(state.startsWith('degraded:')).toBe(true)
    expect(state).toContain('heroHeadlineText')
    expect(state).toContain('statsLineRoot')
    expect(warn.mock.calls.some((call) => String(call[0]).includes('anchor drift'))).toBe(true)
  })
})
