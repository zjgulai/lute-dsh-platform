/**
 * Frontmatter contract tests.
 *
 * `rebuildFrontmatter` rewrites files in the user's real `~/.dsh/skills`, so the
 * properties asserted here are the ones that would corrupt a card rather than
 * merely annoy: idempotence (a double-click on the switch must not accumulate
 * keys), byte-preservation of the body (the card's whole content lives there),
 * and the refusal path (no frontmatter ⇒ no write, not a silent append).
 */
import { describe, expect, it } from 'vitest'
import {
  decodeScalar,
  errorMessage,
  isValidSkillName,
  parseFields,
  rebuildFrontmatter,
  splitFrontmatter,
} from '../src/frontmatter.ts'

const CARD = [
  '---',
  'name: "p2s-demo"',
  'title: "A — B：C 与 D"',
  'description: "触发词：x、y。何时不用：z"',
  'l1_plane: "业务运营"',
  'user_summary: "把 1000 条评论半小时汇总完。"',
  'disable-model-invocation: "true"',
  'user-invocable: "true"',
  '---',
  '',
  '# A — B：C 与 D',
  '',
  '## ① 解决的问题',
  '',
  '正文里的 --- 分隔符也必须原样保留。',
  '',
].join('\n')

describe('parseFields', () => {
  it('decodes quoted scalars without mangling colons inside them', () => {
    const fields = parseFields(CARD)
    expect(fields.get('title')).toBe('A — B：C 与 D')
    expect(fields.get('description')).toBe('触发词：x、y。何时不用：z')
    expect(fields.get('user_summary')).toBe('把 1000 条评论半小时汇总完。')
  })

  it('returns an empty map for a file without frontmatter', () => {
    expect(parseFields('# no frontmatter\n').size).toBe(0)
  })

  it('lets the last duplicate key win, matching the loader', () => {
    const fields = parseFields('---\nk: "a"\nk: "b"\n---\n')
    expect(fields.get('k')).toBe('b')
  })
})

describe('decodeScalar', () => {
  it('falls back to the raw text rather than throwing on malformed quoting', () => {
    expect(decodeScalar('"unterminated')).toBe('"unterminated')
    expect(decodeScalar('"back\\slash"')).toBe('back\\slash')
  })

  it('leaves unquoted values trimmed', () => {
    expect(decodeScalar('  plain  ')).toBe('plain')
  })
})

describe('splitFrontmatter', () => {
  it('keeps the body intact', () => {
    const split = splitFrontmatter(CARD)
    expect(split?.body.startsWith('\n\n# A — B：C 与 D')).toBe(true)
    expect(split?.body).toContain('正文里的 --- 分隔符也必须原样保留。')
  })
})

describe('rebuildFrontmatter', () => {
  it('flips only the two invocation keys and preserves every other byte', () => {
    // enabled=true ⇒ 模型可自动调用 ⇒ disable-model-invocation: false
    const on = rebuildFrontmatter(CARD, true)
    expect(on).not.toBeNull()
    const text = on as string
    // 值变了，但**拼法与原文一致**：这份卡是流水线写的，两个键都带引号。
    expect(text).toContain('disable-model-invocation: "false"')
    expect(text).not.toContain('disable-model-invocation: "true"')
    expect(text).toContain('user-invocable: "true"')
    // 未受控字段与正文逐字保留
    expect(text).toContain('title: "A — B：C 与 D"')
    expect(text).toContain('user_summary: "把 1000 条评论半小时汇总完。"')
    expect(text.endsWith(splitFrontmatter(CARD)?.body ?? '')).toBe(true)
  })

  it('writes a bare value when the file had no such key', () => {
    const bare = '---\nname: "demo"\n---\n\nbody\n'
    const out = rebuildFrontmatter(bare, true) as string
    expect(out).toContain('disable-model-invocation: false')
    expect(out).toContain('user-invocable: true')
    expect(out).not.toContain('"false"')
  })

  it('is a no-op on the bytes when the card is already in the requested state', () => {
    // 页面开局每张卡都是「关」。用户点开再点回去，磁盘上必须什么都没发生——
    // 「什么都没发生」包括字节。流水线写的是带引号的值，作者写的是裸值，
    // 两种拼法都要原样留住。
    expect(rebuildFrontmatter(CARD, false)).toBe(CARD)
    const bare = '---\nname: "demo"\ndisable-model-invocation: true\nuser-invocable: true\n---\n\nbody\n'
    expect(rebuildFrontmatter(bare, false)).toBe(bare)
  })

  it('is idempotent — a second call changes nothing', () => {
    const once = rebuildFrontmatter(CARD, true) as string
    const twice = rebuildFrontmatter(once, true) as string
    expect(twice).toBe(once)
    expect(once.match(/disable-model-invocation:/g)?.length).toBe(1)
    expect(once.match(/user-invocable:/g)?.length).toBe(1)
  })

  it('converges from either state', () => {
    const on = rebuildFrontmatter(CARD, true) as string
    const off = rebuildFrontmatter(on, false) as string
    const back = rebuildFrontmatter(off, true) as string
    expect(back).toBe(on)
    expect(off).toContain('disable-model-invocation: "true"')
  })

  it('round-trips to the original bytes: on, then off again', () => {
    const on = rebuildFrontmatter(CARD, true) as string
    expect(rebuildFrontmatter(on, false)).toBe(CARD)
  })

  it('handles CRLF input', () => {
    const crlf = CARD.replace(/\n/g, '\r\n')
    const out = rebuildFrontmatter(crlf, true)
    expect(out).not.toBeNull()
    expect(out as string).toContain('disable-model-invocation: "false"')
    expect(out as string).toContain('user-invocable: "true"')
  })

  it('leaves a CRLF card CRLF — the rewrite does not silently re-encode it', () => {
    const crlf = CARD.replace(/\n/g, '\r\n')
    const on = rebuildFrontmatter(crlf, true) as string
    expect(on.startsWith('---\r\n')).toBe(true)
    expect(on).not.toMatch(/(^|[^\r])\n/)
    expect(rebuildFrontmatter(on, false)).toBe(crlf)
  })

  it('refuses (null) instead of appending keys when there is no frontmatter', () => {
    expect(rebuildFrontmatter('# just a heading\n', true)).toBeNull()
  })
})

describe('isValidSkillName', () => {
  it('accepts kebab-case and rejects every path escape', () => {
    expect(isValidSkillName('p2s-3d-bin-packing-optimization')).toBe(true)
    for (const bad of ['..', '../evil', 'a/b', '/abs', '', 'A-B', 'x_', null, 42, {}]) {
      expect(isValidSkillName(bad)).toBe(false)
    }
  })
})

describe('errorMessage', () => {
  it('never produces the literal string "undefined"', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('plain')).toBe('plain')
    expect(errorMessage(undefined)).toBe('')
    expect(errorMessage(null)).toBe('')
    expect(errorMessage({ a: 1 })).toBe('[object Object]')
  })
})
