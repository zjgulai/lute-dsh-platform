/**
 * CSS-module key contract.
 *
 * A class key the stylesheet does not define is a SILENT failure: CSS Modules
 * returns `undefined`, the `?? ''` fallback turns it into an empty className,
 * nothing throws, nothing logs, and the element simply renders unstyled. Light
 * mode usually looks close enough that nobody notices. This test is the only
 * thing standing between that and a future edit.
 *
 * Checked at source level (no build required) so it runs in a fresh checkout
 * where `lib/` does not exist yet. The class extraction deliberately accepts ANY
 * `.name` token in the stylesheet, not just `.name {` definitions — a class can
 * legitimately appear only as part of a descendant selector
 * (`.statWarn .statValue { … }`), which is exactly the shape that defeated the
 * first version of this check.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'src', 'client')

/** Every class token the stylesheet mentions, in any selector position. */
function definedClasses(): Set<string> {
  const css = readFileSync(join(SRC, 'algo-skills.module.css'), 'utf8')
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return new Set([...withoutComments.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1] as string))
}

/** Every `css['key']` the components read. */
function usedClasses(): Set<string> {
  const tsx = readFileSync(join(SRC, 'AlgoSkillsPage.tsx'), 'utf8')
  return new Set([...tsx.matchAll(/css\['([A-Za-z_][A-Za-z0-9_-]*)'\]/g)].map((m) => m[1] as string))
}

describe('CSS module keys', () => {
  it('defines every class the page reads', () => {
    const defined = definedClasses()
    const missing = [...usedClasses()].filter((key) => !defined.has(key)).sort()
    expect(missing, `undefined CSS-module keys render as empty className with no error: ${missing.join(', ')}`).toEqual([])
  })

  it('reads a meaningful share of what it defines (no dead stylesheet half)', () => {
    const used = usedClasses()
    const unused = [...definedClasses()].filter((key) => !used.has(key)).sort()
    // 不是零容忍：留几个备用类可以接受，但整块死样式说明两边已经脱钩
    expect(unused.length, `unused classes: ${unused.join(', ')}`).toBeLessThan(6)
  })

  it('uses no invented theme token', () => {
    // 打错的 var() 会永远走字面兜底，元素静默地不再跟随主题（浅色看不出，深色才暴露）。
    // 本仓库的 theme-tokens 门禁管这条，这里再挡一次本包的字号/圆角幻觉。
    const css = readFileSync(join(SRC, 'algo-skills.module.css'), 'utf8')
    const tokens = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1] as string)
    expect(tokens.length).toBeGreaterThan(20)
    const RADIUS = /^--dsw-alias-radius/
    for (const token of tokens) {
      // 整个 radius token 家族在本平台不存在（见 theme-tokens 基线与 ADR-0039）
      expect(RADIUS.test(token), `${token} is a hallucinated token; use a literal radius`).toBe(false)
    }
  })
})
