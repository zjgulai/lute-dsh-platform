/**
 * Copy-resolution tests.
 *
 * The property that matters is the one the previous design got wrong: reading
 * the dictionary must never depend on props reaching the component. A slot
 * component registered behind a wrapper arrow receives no props, and a
 * prop-based translator then echoes dictionary KEYS ("title", "stat.skills")
 * with no error anywhere.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { dictionary, fill, tt } from '../src/client/i18n.ts'

const original = document.documentElement.lang

afterEach(() => {
  document.documentElement.lang = original
})

describe('dictionary', () => {
  it('picks zh by default and en for an en-* document', () => {
    document.documentElement.lang = 'zh-CN'
    expect(dictionary()['nav']).toBe('算法技能')
    document.documentElement.lang = 'en-US'
    expect(dictionary()['nav']).toBe('Algorithm Skills')
  })

  it('serves real copy with no props, no service and no context', () => {
    document.documentElement.lang = 'zh'
    // 这就是页面实际的调用形态：模块级函数，不接任何注入
    expect(tt('title')).toBe('算法技能库')
    expect(tt('stat.placed')).toBe('已归位')
  })
})

describe('tt', () => {
  it('interpolates template params', () => {
    document.documentElement.lang = 'zh'
    expect(tt('chip.drift', { role: 'AGT-021' })).toBe('接线到 AGT-021')
    expect(tt('role.skills', { count: 26 })).toBe('26 张')
  })

  it('returns the key itself for an unknown entry rather than an empty string', () => {
    // 未知键必须可见（回显键名），不能静默变成空白
    expect(tt('does.not.exist' as never)).toBe('does.not.exist')
  })

  it('keeps both dictionaries complete', () => {
    document.documentElement.lang = 'zh'
    const zh = dictionary()
    document.documentElement.lang = 'en'
    const en = dictionary()
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    for (const value of Object.values(en)) expect(value).not.toBe('')
  })
})

describe('fill', () => {
  it('leaves unknown placeholders untouched so the gap is visible', () => {
    expect(fill('a {known} b {unknown}', { known: 'X' })).toBe('a X b {unknown}')
  })

  it('replaces every occurrence', () => {
    expect(fill('{n}-{n}', { n: '1' })).toBe('1-1')
  })
})
