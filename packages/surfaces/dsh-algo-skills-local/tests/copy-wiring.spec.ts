/**
 * Copy-wiring contract: every key defined in `locales.ts` is either RENDERED or
 * listed below.
 *
 * This exists because of one real defect. `chip.off`（「模型不可自动调用」）was
 * defined in the zh/en dictionaries and never appeared in any JSX — a repo-wide
 * grep returned nothing. Copy that is written but never wired is worse than copy
 * that was never written: it makes the page look like it already explains
 * something, so nobody goes back to add the explanation. The state it was meant
 * to describe — a card the role carries but the model will not invoke — is
 * exactly the state the user reported as "the switch is frozen".
 *
 * Same shape as `css-keys.spec.ts`: CSS Modules return `undefined` for an
 * undefined class and render unstyled, silently; an unrendered dictionary key
 * renders immediately. Neither failure throws, logs, or shows up in a host-side
 * test — so each needs a test that would have gone red.
 *
 * The ledger below only ever shrinks (the `exemptions.json` rule): adding a new
 * unrendered key goes red, and fixing one without removing its entry goes red
 * too. Add with a reason, remove when wired.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'src', 'client')

/**
 * Dictionary keys that are deliberately not rendered by this page's JSX.
 *
 * Every entry needs a reason. An empty ledger is the goal.
 */
const NOT_RENDERED: ReadonlyMap<string, string> = new Map([
  ['stat.roles', 'role total currently renders inline in the header (「N 岗位」) instead of via this key'],
  ['issues.none', 'the diagnostics block is hidden entirely at zero issues, so the empty copy never runs'],
  ['role.responsibility', 'role detail rows print the responsibility list directly'],
  ['role.metrics', 'role detail rows print the metric column header directly'],
])

/** Keys defined in the zh dictionary (the en block mirrors them). */
function definedKeys(): Set<string> {
  const text = readFileSync(join(SRC, 'locales.ts'), 'utf8')
  const keys = [...text.matchAll(/^ {2}'?([A-Za-z][A-Za-z0-9.]*)'?:\s/gmu)].map((m) => m[1] as string)
  return new Set(keys.filter((key) => key !== 'zh' && key !== 'en'))
}

/** Keys the components actually read, through either translator call shape. */
function wiredKeys(): Set<string> {
  const out = new Set<string>()
  for (const file of ['AlgoSkillsPage.tsx', 'index.ts', 'i18n.ts']) {
    const text = readFileSync(join(SRC, file), 'utf8')
    for (const m of text.matchAll(/\b(?:tt|t)\('([^']+)'/gu)) out.add(m[1] as string)
  }
  return out
}

describe('copy wiring', () => {
  it('renders every dictionary key, or names it in the ledger with a reason', () => {
    const defined = definedKeys()
    const wired = wiredKeys()
    const unrendered = [...defined].filter((key) => !wired.has(key)).sort()

    // Set equality in both directions: a new unrendered key AND a stale ledger
    // entry (fixed but not delisted) are both failures. A ledger that only grows
    // is how a contract test turns into a rubber stamp.
    expect(unrendered).toEqual([...NOT_RENDERED.keys()].sort())
  })

  it('keeps the ledger honest — every entry carries a reason', () => {
    for (const [key, reason] of NOT_RENDERED) {
      expect(reason.length, `${key} needs a reason`).toBeGreaterThan(10)
    }
  })

  it('wires the copy that explains the card state users reported as broken', () => {
    // The specific regression this file was born from: chip.off must be rendered
    // by the page, not merely defined.
    const page = readFileSync(join(SRC, 'AlgoSkillsPage.tsx'), 'utf8')
    expect(page).toContain("tt('chip.off')")
    expect(page).toContain("tt('chip.off.fix')")
    expect(page).toContain('algo-chip-model-off')
  })
})
