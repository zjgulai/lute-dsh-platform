/**
 * Capability projection contract: frontmatter parsing, label fallback order,
 * and the totality rules.
 *
 * The projection sits between three facts that all belong to someone else — the
 * preset manifest, `preset.yml`, and each skill's own `SKILL.md`. Its failure
 * mode is therefore never "wrong value" but "silently thinner surface": a
 * mapping whose supplies lose their names, a manual that vanishes because a
 * heading moved, a role whose row is quietly empty. These tests pin the
 * fallback order and the degrade-reporting rather than the happy path alone.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  parseFrontmatter,
  readCapabilities,
  readSkillLabel,
  scalar,
  summarize,
} from '../src/capabilities.ts'

const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/** A scratch root removed after the suite. */
function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'role-capabilities-'))
  roots.push(root)
  return root
}

/** Write one preset directory carrying exactly the manifest given. */
function preset(root: string, id: string, manifest: unknown, display?: string): void {
  const dir = join(root, id)
  mkdirSync(dir, { recursive: true })
  if (display !== undefined) writeFileSync(join(dir, 'preset.yml'), display, 'utf8')
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8')
}

/** Write one installed skill body. */
function skill(root: string, id: string, body: string): void {
  mkdirSync(join(root, id), { recursive: true })
  writeFileSync(join(root, id, 'SKILL.md'), body, 'utf8')
}

describe('scalar', () => {
  it('unwraps both quote styles and rejects block scalars', () => {
    expect(scalar('"a b"')).toBe('a b')
    expect(scalar("'a b'")).toBe('a b')
    expect(scalar('plain')).toBe('plain')
    // A block-scalar marker is not a value: returning "|" would put punctuation
    // on screen where a name belongs.
    expect(scalar('|')).toBeUndefined()
    expect(scalar('>-')).toBeUndefined()
    expect(scalar('  ')).toBeUndefined()
  })
})

describe('parseFrontmatter', () => {
  it('reads only the leading block, stopping at the closing fence', () => {
    const meta = parseFrontmatter(['---', 'title: "名字"', 'nested: x', '---', 'title: not-this'].join('\n'))
    expect(meta['title']).toBe('名字')
    expect(meta['nested']).toBe('x')
  })

  it('returns nothing when the file does not open with a fence', () => {
    expect(parseFrontmatter('# no frontmatter\ntitle: x')).toEqual({})
  })

  it('ignores indented lines so nested keys cannot masquerade as top level', () => {
    const meta = parseFrontmatter(['---', 'workflow:', '  title: nested', '---'].join('\n'))
    expect(meta['title']).toBeUndefined()
  })
})

describe('summarize', () => {
  it('cuts at the first sentence, then the first clause', () => {
    expect(summarize('扫描目标品类。附带说明')).toBe('扫描目标品类')
    expect(summarize('电商多账户关联风险检测，覆盖全站')).toBe('电商多账户关联风险检测')
  })

  it('bounds the result so a syllabus cannot become a card subtitle', () => {
    const long = '词'.repeat(400)
    expect(summarize(long)).toHaveLength(120)
    expect(summarize(long).endsWith('…')).toBe(true)
  })

  it('is empty for empty input', () => {
    expect(summarize('   ')).toBe('')
  })
})

describe('readSkillLabel', () => {
  it('prefers the skill\'s own title, then its user_summary', () => {
    const root = scratch()
    skill(root, 'a', ['---', 'title: "甲"', 'description: 描述句子，细节', 'user_summary: 一句话', '---'].join('\n'))
    expect(readSkillLabel(root, 'a', new Map())).toEqual({ label: '甲', summary: '一句话' })
  })

  it('falls back to the description when there is no title', () => {
    const root = scratch()
    skill(root, 'b', ['---', 'description: 只有描述，也够用', '---'].join('\n'))
    expect(readSkillLabel(root, 'b', new Map())).toEqual({ label: '只有描述', summary: '只有描述' })
  })

  it('answers with the id when the skill has no body at all', () => {
    const root = scratch()
    mkdirSync(join(root, 'c'), { recursive: true })
    expect(readSkillLabel(root, 'c', new Map())).toEqual({ label: 'c', summary: '' })
    expect(readSkillLabel(root, 'never-installed', new Map())).toEqual({ label: 'never-installed', summary: '' })
  })
})

describe('readCapabilities', () => {
  /** A complete role manifest, parameterised only where a case varies it. */
  const complete = (mapping: unknown, sections: unknown): unknown => ({
    x_lute: {
      plane: { id: 'PLN-OPS', name: '业务运营' },
      domain: { id: 'DOM-04', name: '渠道经营' },
      skills: { mapping },
    },
    material: {
      role_catalog: { record: { id: 'AGT-027', alias: '守店', title: '店铺账号健康与规则', artifact: '账号健康报告' } },
      playbooks: { sections },
    },
  })

  it('rejects anything that is not a role preset before reading the disk', () => {
    const root = scratch()
    expect(readCapabilities(root, root, 'cordis')).toBeUndefined()
    expect(readCapabilities(root, root, 'agt-27')).toBeUndefined()
    expect(readCapabilities(root, root, '../../etc/passwd')).toBeUndefined()
    expect(readCapabilities(root, root, 'agt-027')).toBeUndefined()
  })

  it('projects identity, groups and manuals', () => {
    const root = scratch()
    const skills = join(root, 'skills')
    preset(root, 'agt-027', complete(
      [{ name: '账号诊断', kind: 'partial', note: '边界说明', supply: ['sk-one'] }],
      [{ heading: '## PB-001 存量GMV联合经营' }, { heading: '## not a playbook' }],
    ), "name: '守店 · 店铺账号健康与规则'\n")
    skill(skills, 'sk-one', ['---', 'title: "一号技能"', '---'].join('\n'))

    const payload = readCapabilities(root, skills, 'agt-027')
    expect(payload).toBeDefined()
    expect(payload!.name).toBe('守店 · 店铺账号健康与规则')
    expect(payload!.agt).toBe('AGT-027')
    expect(payload!.planeName).toBe('业务运营')
    expect(payload!.domainName).toBe('渠道经营')
    expect(payload!.artifact).toBe('账号健康报告')
    expect(payload!.groups).toEqual([{
      name: '账号诊断',
      kind: 'partial',
      note: '边界说明',
      supplies: [{ id: 'sk-one', label: '一号技能', summary: '' }],
    }])
    // Only real playbook headings become manuals; a stray heading is dropped.
    expect(payload!.manuals).toEqual([{ id: 'PB-001', label: '存量GMV联合经营' }])
    expect(payload!.degraded).toBeUndefined()
  })

  it('reports a thin manifest instead of rendering an empty surface silently', () => {
    const root = scratch()
    preset(root, 'agt-027', complete([], []))
    const payload = readCapabilities(root, root, 'agt-027')
    expect(payload!.groups).toEqual([])
    expect(payload!.manuals).toEqual([])
    expect(payload!.degraded).toContain('业务技能映射')
    expect(payload!.degraded).toContain('场景手册')
  })

  it('coerces an unknown coverage grade to gap rather than trusting it', () => {
    const root = scratch()
    preset(root, 'agt-027', complete(
      [{ name: 'x', kind: 'excellent', supply: [] }],
      [],
    ))
    expect(readCapabilities(root, root, 'agt-027')!.groups[0]!.kind).toBe('gap')
  })

  it('drops malformed mapping entries rather than emitting a nameless group', () => {
    const root = scratch()
    preset(root, 'agt-027', complete(
      [{ name: '', kind: 'direct', supply: ['a'] }, { name: 'ok', kind: 'direct', supply: [] }],
      [],
    ))
    const groups = readCapabilities(root, root, 'agt-027')!.groups
    expect(groups.map((group) => group.name)).toEqual(['ok'])
  })

  it('returns undefined when the manifest is missing or carries no x_lute', () => {
    const root = scratch()
    mkdirSync(join(root, 'agt-027'), { recursive: true })
    expect(readCapabilities(root, root, 'agt-027')).toBeUndefined()

    preset(root, 'agt-028', { material: {} })
    expect(readCapabilities(root, root, 'agt-028')).toBeUndefined()

    preset(root, 'agt-029', { x_lute: { skills: {} } })
    expect(readCapabilities(root, root, 'agt-029')).toBeUndefined()
  })

  it('falls back to the directory name when preset.yml is absent', () => {
    const root = scratch()
    preset(root, 'agt-027', complete([], []))
    expect(readCapabilities(root, root, 'agt-027')!.name).toBe('agt-027')
  })
})
