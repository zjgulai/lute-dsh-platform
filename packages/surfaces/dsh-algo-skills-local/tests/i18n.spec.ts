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
    // 词表换成业务白话：原来的「已归位 / 未归类 / 本岗已接线 / 空白岗位」
    // 在使用方那里读不懂（2026-09-13 反馈），现在每个词自己说明自己。
    expect(tt('stat.placed')).toBe('已分到岗位')
    expect(tt('stat.unplaced')).toBe('没分到岗位')
    expect(tt('stat.wired')).toBe('已设为岗位自带')
    expect(tt('stat.emptyRoles')).toBe('还没配卡的岗位')
  })

  it('explains every stat it shows instead of only naming it', () => {
    document.documentElement.lang = 'zh'
    for (const key of ['stat.skills', 'stat.placed', 'stat.unplaced', 'stat.wired', 'stat.emptyRoles'] as const) {
      const hint = tt(`${key}.hint` as never)
      // 未知键会回显键名——那样这轮就等于没解释。
      expect(hint).not.toBe(`${key}.hint`)
      expect(hint.length).toBeGreaterThan(4)
    }
    expect(tt('legend.title')).toBe('这些数字怎么看')
    expect(tt('legend.body')).toContain('模型能不能自动调用')
  })
})

describe('tt', () => {
  it('interpolates template params', () => {
    document.documentElement.lang = 'zh'
    expect(tt('chip.drift', { role: 'AGT-021' })).toBe('在 AGT-021 会带上')
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
