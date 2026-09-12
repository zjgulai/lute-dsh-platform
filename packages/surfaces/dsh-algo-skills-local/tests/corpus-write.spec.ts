/**
 * The write path, exercised against the real installed corpus.
 *
 * `rebuildFrontmatter` is the only function in this plugin that writes, and the
 * switch on the page is the only control that reaches it. Every other test in
 * this package feeds it a fixture — which proves the function is correct for
 * the shapes the author imagined, not for the 1338 files actually on disk.
 *
 * So this file reads the real `~/.dsh/skills/p2s-<name>/SKILL.md` and asserts,
 * per file and without writing anything:
 *
 *   - the rewrite is lossless: same key set, same decoded values everywhere
 *     except the two invocation keys, body byte-identical;
 *   - it is idempotent: a second application changes nothing;
 *   - it round-trips through the page's own reader — for each of the two
 *     states, `parseSkill(rebuild(text, state))` reports back that state.
 *
 * That last one is the failure this exists to catch: a switch that writes a
 * spelling its own reader does not recognise looks correct until the page is
 * reloaded, and then silently reverts. Reading a fixture cannot catch it,
 * because a fixture is written by the same hand as the writer.
 *
 * Environment: skips when the corpus is absent (a fresh checkout, CI). That is
 * a real gap in coverage, and it is stated here rather than hidden: this test
 * is worth nothing on a machine with no cards, and everything on the machine
 * where the switch is actually clicked.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSkill } from '../src/collect.ts'
import { parseFields, rebuildFrontmatter, splitFrontmatter } from '../src/frontmatter.ts'

/** The two keys the switch owns; every other key must survive untouched. */
const SWITCH_KEYS = new Set(['disable-model-invocation', 'user-invocable'])

/** Skills root honoring DSH_HOME the way the host does. */
const SKILLS_ROOT = join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'skills')

/** Every installed p2s- card, as `{ name, path }`; empty when the root is absent. */
function installedCards(): { name: string; path: string }[] {
  let entries: string[]
  try {
    entries = readdirSync(SKILLS_ROOT)
  } catch {
    return []
  }
  const cards: { name: string; path: string }[] = []
  for (const name of entries.sort()) {
    if (!name.startsWith('p2s-')) continue
    const dir = join(SKILLS_ROOT, name)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    cards.push({ name, path: join(dir, 'SKILL.md') })
  }
  return cards
}

/** The raw on-disk spelling of one switch key, for failure messages that show the drift. */
function switchLine(text: string, key: string): string {
  const split = splitFrontmatter(text)
  if (split === undefined) return '<no frontmatter>'
  return split.block.split('\n').find((line) => line.startsWith(`${key}:`)) ?? '<absent>'
}

const CARDS = installedCards()

describe.skipIf(CARDS.length === 0)('rewrite of the installed corpus', () => {
  it('reads every card as having frontmatter (so the toggle can never 400 on a real card)', () => {
    const withoutFrontmatter = CARDS
      .filter(({ path }) => {
        try {
          return splitFrontmatter(readFileSync(path, 'utf8')) === undefined
        } catch {
          return true
        }
      })
      .map(({ name }) => name)
    expect(withoutFrontmatter).toEqual([])
  })

  it('flips the switch losslessly and idempotently on every card', () => {
    const broken: string[] = []
    for (const { name, path } of CARDS) {
      const before = readFileSync(path, 'utf8')
      for (const enabled of [true, false]) {
        const after = rebuildFrontmatter(before, enabled)
        if (after === null) { broken.push(`${name}: no frontmatter for enabled=${String(enabled)}`); continue }
        const once = after
        const twice = rebuildFrontmatter(once, enabled)
        if (twice !== once) broken.push(`${name}: not idempotent at enabled=${String(enabled)}`)
        const bodyBefore = splitFrontmatter(before)?.body
        if (splitFrontmatter(once)?.body !== bodyBefore) broken.push(`${name}: body changed at enabled=${String(enabled)}`)

        const keysBefore = [...parseFields(before).keys()]
        const keysAfter = [...parseFields(once).keys()]
        if (keysBefore.length !== keysAfter.length || keysBefore.some((key) => !keysAfter.includes(key))) {
          broken.push(`${name}: key set changed at enabled=${String(enabled)}`)
        }
        for (const [key, value] of parseFields(before)) {
          if (SWITCH_KEYS.has(key)) continue
          if (parseFields(once).get(key) !== value) broken.push(`${name}: value of ${key} changed at enabled=${String(enabled)}`)
        }
      }
    }
    expect(broken).toEqual([])
  })

  it('writes a state its own reader reads back — the switch cannot silently revert', () => {
    const disagree: string[] = []
    for (const { name, path } of CARDS) {
      const before = readFileSync(path, 'utf8')
      for (const enabled of [true, false]) {
        const after = rebuildFrontmatter(before, enabled)
        if (after === null) continue
        const readBack = parseSkill(name, after).row.modelEnabled
        if (readBack !== enabled) disagree.push(`${name}: wrote ${String(enabled)}, page reads ${String(readBack)}`)
      }
    }
    expect(disagree).toEqual([])
  })

  it('re-writes a card that is already in the requested state byte-for-byte', () => {
    // The page opens with every card off, so the very first thing a user can do
    // is click a card ON and then click it OFF again. The promise of that
    // gesture is *nothing happened* — and "nothing" has to include the bytes.
    // The pipeline serializes these two keys JSON-quoted; a writer that emits
    // them bare would make every touched card drift out of the format the
    // installer produced, invisibly and permanently.
    const drifted: { name: string; was: string; now: string }[] = []
    for (const { name, path } of CARDS) {
      const before = readFileSync(path, 'utf8')
      const rewritten = rebuildFrontmatter(before, false)
      if (rewritten !== before) {
        drifted.push({ name, was: switchLine(before, 'disable-model-invocation'), now: switchLine(rewritten ?? '', 'disable-model-invocation') })
      }
    }
    expect(drifted).toEqual([])
  })

  it('survives a full round trip: on, then off again, is the original file', () => {
    const roundTripped: string[] = []
    for (const { name, path } of CARDS) {
      const before = readFileSync(path, 'utf8')
      const on = rebuildFrontmatter(before, true)
      if (on === null) { roundTripped.push(`${name}: no frontmatter`); continue }
      if (rebuildFrontmatter(on, false) !== before) roundTripped.push(name)
    }
    expect(roundTripped).toEqual([])
  })

  it('reports the corpus it actually checked, so a green run cannot hide an empty one', () => {
    // Guards the skip above: on a machine that HAS cards, the count is real.
    expect(CARDS.length).toBeGreaterThan(0)
    expect(CARDS.every(({ name }) => name.startsWith('p2s-'))).toBe(true)
  })
})
