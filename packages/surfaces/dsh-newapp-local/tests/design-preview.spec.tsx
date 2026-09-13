/**
 * The design preview probe — a real render of the systems section, for eyes.
 *
 * Everything else in this directory asserts *words*: which card is in which
 * group, which button is disabled, which class exists. None of it can answer
 * 「卡片必须精美」, and none of it can catch the failure that matters most here —
 * a card that is structurally perfect and visually broken (contrast that dies in
 * the dark theme, a tile that collapses, a footer that drifts to four different
 * heights across a row).
 *
 * So this file does three things no other test does:
 *
 *  1. It renders the **real component** — not a hand-copied approximation of its
 *     markup, which is the trap the repo's theme note warns about ("手抄一份就等
 *     于在测自己的假设").
 *  2. It inverts the CSS-module scoping so the preview can be paired with the
 *     stylesheet **source**, which is what makes the preview readable and the
 *     cascade identical.
 *  3. It writes two standalone pages (light + dark) carrying the shell's own
 *     theme stylesheet, extracted verbatim from the installed app.
 *
 * `scripts/design-probe.mjs` then opens both in real Chrome and screenshots
 * them. This file makes no claim about pixels; it produces the page that the
 * screenshot is a picture of.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemsApi } from '../src/client/api.ts'
import { SystemsSection } from '../src/client/SystemsSection.tsx'
import { ROSTER_ROUTE } from '../src/client/launcher.ts'
import css from '../src/client/newapp.module.css'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Where the two preview pages land. Deliberately outside the repo. */
export const PREVIEW_DIR = join(tmpdir(), 'dsh-newapp-design')

/** The installed shell's theme stylesheet, read verbatim (never re-typed). */
function shellThemeCss(): string {
  const bundle =
    '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/' +
    '@deepseek-ai/dsh-client-ui-theme/lib/client.js'
  const source = readFileSync(bundle, 'utf8')
  const marker = 'design_platform_css_default = "'
  const at = source.indexOf(marker)
  if (at < 0) throw new Error('the shell theme bundle no longer exposes design_platform_css_default')
  // Walk the JS string literal, honouring escapes, so the extraction cannot stop
  // early on a quote inside the CSS.
  let index = at + marker.length
  let out = ''
  while (index < source.length) {
    const char = source[index]!
    if (char === '\\') {
      out += source[index + 1]
      index += 2
      continue
    }
    if (char === '"') break
    out += char
    index += 1
  }
  if (out.length < 1000) throw new Error(`theme stylesheet looks truncated (${String(out.length)} chars)`)
  return out
}

/** The systems the preview shows: enough of them to make a grid, a real group count and every flag. */
const SYSTEMS = [
  {
    slug: 'video', name: 'AI 原生视频系统', nameEn: 'AI Native Video',
    desc: 'AI 视频生成 · 资产管理 · 长视频与品牌内容工作流',
    descEn: 'Native AI video creation platform for scripted generation',
    kind: 'Docker 应用', tags: ['AI Video', 'Next.js'], cta: '打开视频系统',
    href: 'https://video.lute-tlz-dddd.top', host: 'video.lute-tlz-dddd.top',
    icon: [
      { tag: 'rect', attrs: { x: '3', y: '5', width: '18', height: '14', rx: '2', stroke: 'currentColor', 'stroke-width': '1.8' } },
      { tag: 'path', attrs: { d: 'M10 9l5 3-5 3V9z', fill: 'currentColor' } },
    ],
    primary: 'AGT-031', also: ['AGT-030'], reachable: true, loginRequired: false,
  },
  {
    slug: 'redbook', name: 'AI 效能公式链', nameEn: 'AI Content Production',
    desc: '热点发现 · 智能创作 · 内容评审 · 发布闭环',
    descEn: 'Intelligent content production chain',
    kind: 'Docker 应用', tags: ['Content'], cta: '打开内容生产平台',
    href: 'https://redbook.lute-tlz-dddd.top', host: 'redbook.lute-tlz-dddd.top',
    icon: [{ tag: 'path', attrs: { d: 'M4 19V5m0 14h16M8 15l3-4 3 2 5-7', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } }],
    primary: 'AGT-030', also: ['AGT-031', 'AGT-029'], reachable: true, loginRequired: false,
  },
  {
    slug: 'voc', name: '客户声音分析平台', nameEn: 'Voice of Customer',
    desc: 'Apache Superset · 跨境电商 NLP 增量处理 · 评论/反馈/舆情挖掘',
    descEn: 'Customer voice analytics', kind: 'Docker 应用', tags: ['Superset', 'NLP'],
    cta: '打开 VOC 平台', href: 'https://voc.lute-tlz-dddd.top', host: 'voc.lute-tlz-dddd.top',
    icon: [{ tag: 'circle', attrs: { cx: '12', cy: '12', r: '9', stroke: 'currentColor', 'stroke-width': '1.8' } }, { tag: 'path', attrs: { d: 'M8 12h8M12 8v8', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' } }],
    primary: 'AGT-006', also: ['AGT-038'], reachable: true, loginRequired: false,
  },
  {
    slug: 'mkt', name: '市场洞察工作台', nameEn: 'Market Insight Platform',
    desc: 'Momcozy 母婴品牌全球市场分析 · 竞品追踪 · 用户画像 · 行业趋势',
    descEn: 'Global market insight', kind: '静态站点', tags: ['Market'],
    cta: '打开市场洞察', href: 'https://mkt.lute-tlz-dddd.top', host: 'mkt.lute-tlz-dddd.top',
    icon: [{ tag: 'path', attrs: { d: 'M12 3l9 5-9 5-9-5 9-5z', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' } }, { tag: 'path', attrs: { d: 'M3 13l9 5 9-5', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' } }],
    primary: 'AGT-007', also: ['AGT-006', 'AGT-044'], reachable: true, loginRequired: true,
  },
  {
    slug: 'shopify', name: '独立站监控', nameEn: 'Shopify Audit Report',
    desc: 'Momcozy M1 v2.0 · Top 15 病灶 · 15 条 Liquid PR 代码 · 8 站竞品对标',
    descEn: 'Storefront audit', kind: '静态报告', tags: ['Shopify'],
    cta: '打开独立站监控', href: 'https://shopify.lute-tlz-dddd.top', host: 'shopify.lute-tlz-dddd.top',
    icon: [{ tag: 'rect', attrs: { x: '3', y: '4', width: '18', height: '16', rx: '2', stroke: 'currentColor', 'stroke-width': '1.8' } }, { tag: 'path', attrs: { d: 'M7 9h10M7 13h6', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' } }],
    primary: 'AGT-023', also: ['AGT-027'], reachable: true, loginRequired: true,
  },
  {
    slug: 'business', name: '商业机会点', nameEn: 'Business Insight Hub',
    desc: '566 亿母婴 AI 市场 · 五大反直觉创新方案 · 六大洞察框架',
    descEn: 'NurtureLink: Heartbeat Cocoon, DadQuest, SafeBox and more',
    kind: '静态站点', tags: ['Insight'], cta: '打开商业机会点',
    href: 'https://business.lute-tlz-dddd.top', host: 'business.lute-tlz-dddd.top',
    icon: [{ tag: 'circle', attrs: { cx: '12', cy: '12', r: '9', stroke: 'currentColor', 'stroke-width': '1.8' } }, { tag: 'path', attrs: { d: 'M12 7v5l3 2', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } }],
    primary: 'AGT-007', also: ['AGT-008'], reachable: true, loginRequired: false,
  },
  {
    slug: 'product', name: 'AI 选品平台', nameEn: 'AI Product Selection',
    desc: '全球智能选品中心 · 店铺/商品/达人资产 · 跨境电商机会筛选',
    descEn: 'AI product selection across TikTok, Amazon and creators',
    kind: '静态站点', tags: ['Selection'], cta: '打开选品平台',
    href: 'https://product.lute-tlz-dddd.top', host: 'product.lute-tlz-dddd.top',
    icon: [{ tag: 'path', attrs: { d: 'M4 6h16l-1.5 11H5.5L4 6z', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' } }, { tag: 'path', attrs: { d: 'M9 6a3 3 0 016 0', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' } }],
    primary: 'AGT-007', also: ['AGT-008'], reachable: true, loginRequired: false,
  },
  {
    slug: 'present', name: '发布资产工厂', nameEn: 'HTML Anything',
    desc: 'HTML 资产生成 · 发布材料 · 产品表达',
    descEn: 'Chinese product release asset factory', kind: 'Docker 应用', tags: ['Release'],
    cta: '打开资产工厂', href: 'https://present.lute-tlz-dddd.top', host: 'present.lute-tlz-dddd.top',
    icon: [{ tag: 'rect', attrs: { x: '3', y: '4', width: '18', height: '14', rx: '2', stroke: 'currentColor', 'stroke-width': '1.8' } }, { tag: 'path', attrs: { d: 'M3 14l5-4 3 3 4-5 6 6', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' } }],
    primary: 'AGT-030', also: ['AGT-031'], reachable: true, loginRequired: false,
  },
  {
    slug: 'kg', name: 'AI 知识图谱', nameEn: 'AI Knowledge Garden',
    desc: '803 条精选 AI 提示词与技能 · 六维分类 · 全文搜索 · 角色筛选',
    descEn: 'Curated prompts, skills, hooks, MCP tools, agents & open-source projects — 14 professional roles',
    kind: 'Docker 应用', tags: ['193 提示词', '610 技能'], cta: '打开知识库',
    href: 'https://kg.lute-tlz-dddd.top', host: 'kg.lute-tlz-dddd.top',
    icon: [{ tag: 'path', attrs: { d: 'M12 2L2 7l10 5 10-5-10-5z', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' } }, { tag: 'path', attrs: { d: 'M2 17l10 5 10-5M2 12l10 5 10-5', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' } }],
    primary: 'AGT-048', also: [], reachable: true, loginRequired: false,
  },
  {
    slug: 'audit', name: 'AI 审计一体化协作平台', nameEn: 'Medical Audit Collaboration',
    desc: '审计协作 · 问题闭环 · 证据与整改追踪',
    descEn: 'Integrated audit collaboration', kind: 'Docker 应用', tags: ['Audit'],
    cta: '打开审计平台', href: 'https://audit.lute-tlz-dddd.top', host: 'audit.lute-tlz-dddd.top',
    icon: [{ tag: 'path', attrs: { d: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' } }],
    primary: 'AGT-005', also: ['AGT-044'], reachable: false, loginRequired: false,
  },
  {
    slug: 'scm', name: '供应链治理', nameEn: 'SCM Governance',
    desc: '数据开发 · 治理工作台 · 角色追踪',
    descEn: 'Supply-chain data governance', kind: 'Docker 应用', tags: ['SCM'],
    cta: '打开 SCM 工作台', href: 'https://scm.lute-tlz-dddd.top', host: 'scm.lute-tlz-dddd.top',
    icon: [{ tag: 'path', attrs: { d: 'M4 7h16M4 12h16M4 17h10', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' } }],
    primary: 'AGT-045', also: ['AGT-046', 'AGT-016'], reachable: true, loginRequired: false,
  },
]

const ROSTER = {
  planes: [
    { name: '业务运营', domains: [
      { name: '产品与创新', roles: [{ id: 'agt-006', name: '听澜 · 消费者需求与VOC研究' }] },
      { name: '渠道经营', roles: [{ id: 'agt-007', name: '望野 · 市场竞争与机会研究' }, { id: 'agt-023', name: '自航 · 独立站经营与转化' }, { id: 'agt-027', name: '守店 · 店铺账号健康与规则' }] },
      { name: '品牌与增长', roles: [{ id: 'agt-029', name: '立言 · 品牌战略与传播' }, { id: 'agt-030', name: '叙事 · 内容与创意策划' }, { id: 'agt-031', name: '绘影 · 视觉视频与素材生产' }] },
    ] },
    { name: '独立控制', domains: [
      { name: '经营与组织', roles: [{ id: 'agt-005', name: '守衡 · 内控审计与独立复核' }] },
      { name: '财务与合规', roles: [{ id: 'agt-044', name: '安界 · 产品合规与隐私' }] },
    ] },
    { name: '数据与Agent平台', domains: [
      { name: '数据与AI运行', roles: [{ id: 'agt-016', name: '知量 · 需求预测与补货计划' }, { id: 'agt-038', name: '回声 · 体验洞察与质量反馈' }, { id: 'agt-045', name: '同尺 · 业务口径与主数据' }, { id: 'agt-046', name: '清源 · 数据工程与质量' }, { id: 'agt-048', name: '积知 · 知识技能与Playbook治理' }] },
    ] },
  ],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

/**
 * Rewrite the CSS-module scoping back to the local names.
 *
 * The mapping is read **from the stylesheet source** rather than by enumerating
 * the imported object: vite hands CSS modules back as a Proxy whose keys are not
 * enumerable (measured — `Object.keys(css)` is `[]` while `css['sysCard']` is
 * `_sysCard_e50e7b`). Enumerating it would silently produce an empty mapping, and
 * an unstyled preview is a picture of nothing.
 * @param html - the rendered markup, carrying hashed class names.
 * @param cssSource - the stylesheet, for its local class names.
 * @returns the same markup with the stylesheet's own class names.
 */
function unscoped(html: string, cssSource: string): string {
  let out = html
  const locals = new Set(
    [...cssSource.matchAll(/^\.([A-Za-z][A-Za-z0-9_-]*)/gm)].map((match) => match[1]!),
  )
  for (const local of locals) {
    const scoped = (css as Record<string, string | undefined>)[local]
    if (typeof scoped === 'string' && scoped !== '') out = out.split(scoped).join(local)
  }
  return out
}

/** The standalone page: the shell's theme stylesheet, then this plugin's. */
function page(bodyHtml: string, dark: boolean): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>${shellThemeCss()}</style>
<style>${readFileSync(join(process.cwd(), 'src/client/newapp.module.css'), 'utf8')}</style>
<style>
  /* The drawer is a dialog the preview has no shell to open; here it is simply a
     panel on the page. Everything else is the real cascade. */
  html, body { margin: 0; background: var(--dsw-alias-bg-layer-1, #fff); }
  body { padding: 20px; }
  .preview-panel {
    width: min(880px, 100%); margin: 0 auto; padding: 16px 20px 20px;
    background: var(--dsw-alias-bg-layer-1, #fff);
    color: var(--dsw-alias-label-primary, #0f1115);
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04));
    border-radius: 16px;
  }
  /* The brand block is declared on .root and .entry, and the drawer's real DOM
     is a <dialog class="root" open>. Without this wrapper the preview renders
     with every --lute-* variable undefined - an unbranded page that looks like
     a styling bug. The geometry of the real drawer is neutralised here; the
     brand declarations are the real ones. */
  .preview-panel > .root {
    position: static; inset: auto; display: block;
    width: auto; height: auto; max-width: none; max-height: none; overflow: visible;
  }
</style>
</head>
<body${dark ? ' data-ds-dark-theme' : ''}>
<div class="preview-panel"><div class="root" open><div class="body">${bodyHtml}</div></div></div>
</body></html>`
}

describe('design preview', () => {
  it('writes light and dark pages carrying a real render of every card', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === ROSTER_ROUTE) {
        return new Response(JSON.stringify(ROSTER), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response('{}', { status: 404 })
    })
    const api = {
      systems: async () => ({
        ok: true,
        view: { systems: SYSTEMS, probedOn: '2026-09-13', openRoute: '/api/dsh-newapp/open-system', dropped: [] },
      }),
      openSystem: async () => ({ ok: true }),
    } as unknown as SystemsApi

    await act(async () => {
      root.render(<SystemsSection api={api} />)
    })
    await act(async () => { await Promise.resolve() })

    // The preview is only worth looking at if it is actually the section.
    const cards = container.querySelectorAll('[data-dsh-part="system-card"]')
    expect(cards.length).toBe(SYSTEMS.length)
    expect(container.querySelectorAll('[data-dsh-part="role-group"]').length).toBeGreaterThanOrEqual(6)

    mkdirSync(PREVIEW_DIR, { recursive: true })
    const cssSource = readFileSync(join(process.cwd(), 'src/client/newapp.module.css'), 'utf8')
    const body = unscoped(container.innerHTML, cssSource)
    writeFileSync(join(PREVIEW_DIR, 'light.html'), page(body, false))
    writeFileSync(join(PREVIEW_DIR, 'dark.html'), page(body, true))

    // Every rendered class must now be one the stylesheet actually defines.
    // Without this check the unscoping can fail silently, and the screenshot
    // would be an unstyled page that looks like a styling bug.
    const rendered = [...body.matchAll(/class="([^"]*)"/g)]
      .flatMap((match) => match[1]!.split(/\s+/))
      .filter((name) => name !== '')
    const defined = new Set([...cssSource.matchAll(/^\.([A-Za-z][A-Za-z0-9_-]*)/gm)].map((m) => m[1]!))
    const unknown = [...new Set(rendered)].filter((name) => !defined.has(name) && !name.startsWith('preview-'))
    expect(unknown, 'classes in the preview that the stylesheet does not define').toEqual([])
    expect(rendered).toContain('sysCard')
    expect(rendered).toContain('roleRule')
  })
})
