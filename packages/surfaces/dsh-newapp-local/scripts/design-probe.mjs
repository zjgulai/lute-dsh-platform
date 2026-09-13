#!/usr/bin/env node
/**
 * The design probe: open the preview pages from `tests/design-preview.spec.tsx`
 * in **real Chrome** and take a picture of them.
 *
 * ## What this instrument is, and what it is not
 *
 * It is a **camera**, not a judge. It asserts almost nothing — it renders the two
 * pages (light and dark), records a handful of box measurements that a broken
 * layout would move, and writes PNGs for a human to look at. 「卡片必须精美」 is
 * not a property a test can decide, so the honest instrument is one that puts the
 * real pixels in front of the person who asked for them.
 *
 * Why geometry is measured at all, given the above: jsdom performs no layout, so
 * every other test in this package is blind to collapse. Three numbers catch the
 * failures that matter and are cheap to read — the card grid's real column count
 * (a `minmax` typo silently gives one), the icon tile's box (a `grid` + no size
 * silently gives zero), and the spread of card heights in one row (a footer that
 * stops being pinned).
 *
 * ## Usage
 *
 *   node scripts/design-probe.mjs [--out <dir>]
 *
 * Run `npx vitest run tests/design-preview.spec.tsx` first: this script reads the
 * pages that test writes and refuses to run without them.
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PREVIEW_DIR = join(tmpdir(), 'dsh-newapp-design')
const outIndex = process.argv.indexOf('--out')
const OUT = outIndex >= 0 ? resolve(process.argv[outIndex + 1]) : join(PKG, 'node_modules/.cache/design-probe')

/** Fail loudly rather than produce output nobody can trust. */
function require_(condition, message) {
  if (!condition) {
    process.stderr.write(`[design-probe] FAILED — ${message}\n`)
    process.exit(2)
  }
}

/** Locate a Playwright install (npx cache) without adding it as a dependency. */
async function loadPlaywright() {
  const stdout = await new Promise((resolve_, reject) =>
    execFile('bash', ['-lc', 'ls -d ~/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -5'],
      (error, out) => (error ? reject(error) : resolve_(out))),
  )
  const candidates = String(stdout).split('\n').map((line) => line.trim()).filter((line) => line !== '')
  require_(candidates.length > 0, '找不到 playwright（本探针只借用 npx 缓存里的安装，不作为依赖）')
  for (const dir of candidates) {
    try {
      return await import(join(dir, 'index.mjs'))
    } catch { /* next candidate */ }
  }
  require_(false, `playwright 存在于 ${candidates.join('、')} 但都导入失败`)
}

/*
 * Instrument self-check: the pages must be newer than the things they are made
 * of. Without it this probe happily screenshots a **stale** preview and reports
 * a green board — the most expensive kind of green, because it is green about a
 * stylesheet nobody rendered. (Measured once, the hard way: the preview spec
 * failed to compile, and this probe still produced a full set of numbers from
 * the previous run's files.)
 */
const sources = ['src/client/newapp.module.css', 'src/client/SystemsSection.tsx', 'src/client/SystemIcon.tsx']
const newestSource = Math.max(...sources.map((rel) => statSync(join(PKG, rel)).mtimeMs))
for (const name of ['light.html', 'dark.html']) {
  const preview = join(PREVIEW_DIR, name)
  require_(
    existsSync(preview),
    `${preview} 不存在——先跑 npx vitest run tests/design-preview.spec.tsx`,
  )
  require_(
    statSync(preview).mtimeMs >= newestSource,
    `${preview} 比它引用的源文件旧——先重跑 npx vitest run tests/design-preview.spec.tsx（否则这里量的是上一轮的页面）`,
  )
}

mkdirSync(OUT, { recursive: true })
const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })

/** Read the boxes a collapsed layout would move. */
const MEASURE = `() => {
  const cards = [...document.querySelectorAll('[data-dsh-part="system-card"]')]
  const groups = [...document.querySelectorAll('[data-dsh-part="role-group"]')]
  const tiles = [...document.querySelectorAll('[class*="sysIcon"]')]
  const icons = tiles.map((t) => t.querySelector('svg'))
  // Column count, measured rather than declared: count distinct left edges.
  const lefts = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left)))
  const rows = new Map()
  for (const card of cards) {
    const r = card.getBoundingClientRect()
    const key = Math.round(r.top)
    rows.set(key, [...(rows.get(key) ?? []), Math.round(r.height)])
  }
  const spreads = [...rows.values()].filter((hs) => hs.length > 1).map((hs) => Math.max(...hs) - Math.min(...hs))

  /* Contrast, measured rather than eyeballed.
   *
   * This is the substitute for a glance, and a better one: a caption that is
   * unreadable in the dark theme is invisible to whoever wrote it in the light
   * theme, and 「精美」 includes being legible. The ratio is WCAG's, computed
   * from the **resolved** colours (the same values the paint uses), and the
   * ratio is reported for every text role so a marginal one is visible as a
   * number instead of as an opinion. */
  const parse = (color) => {
    const m = color.match(/rgba?\\(([^)]+)\\)/)
    if (m === null) return null
    const parts = m[1].split(',').map((p) => parseFloat(p))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  const over = (fg, bg) => (fg.a >= 1 ? fg : {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const opaqueBackground = (el) => {
    let node = el
    while (node !== null) {
      const bg = parse(getComputedStyle(node).backgroundColor)
      if (bg !== null && bg.a >= 1) return bg
      node = node.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }
  const ratio = (selector) => {
    const el = document.querySelector(selector)
    if (el === null) return null
    const fg = parse(getComputedStyle(el).color)
    if (fg === null) return null
    const bg = opaqueBackground(el)
    const l1 = lum(over(fg, bg))
    const l2 = lum(bg)
    const hi = Math.max(l1, l2)
    const lo = Math.min(l1, l2)
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
  }

  return {
    cards: cards.length,
    groups: groups.length,
    columns: lefts.size,
    tileWidth: tiles.length === 0 ? 0 : Math.round(tiles[0].getBoundingClientRect().width),
    iconsWithBox: icons.filter((s) => s !== null && s.getBoundingClientRect().width > 0).length,
    // A hover style is the thing most likely to be written and never reach the
    // page; reading the resolved value proves the cascade arrived.
    cardRadius: cards.length === 0 ? '' : getComputedStyle(cards[0]).borderRadius,
    cardBackground: cards.length === 0 ? '' : getComputedStyle(cards[0]).backgroundColor,
    roleChipColor: (() => {
      const chip = document.querySelector('[class*="sysRole"]')
      return chip === null ? '' : getComputedStyle(chip).color
    })(),
    maxRowHeightSpread: spreads.length === 0 ? 0 : Math.max(...spreads),
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    contrast: {
      name: ratio('[class~="sysName"]'),
      nameEn: ratio('[class~="sysNameEn"]'),
      desc: ratio('[class~="sysDesc"]'),
      tag: ratio('[class~="sysTag"]'),
      role: ratio('[class~="sysRole"]'),
      roleMore: ratio('[class~="sysRoleMore"]'),
      flag: ratio('[class~="sysFlag"]'),
      action: ratio('[class~="sysAction"]'),
      groupTitle: ratio('[class~="roleTitle"]'),
      groupPath: ratio('[class~="rolePath"]'),
    },
  }
}`

const readings = {}
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 980, height: 1400 }, deviceScaleFactor: 2 })
  await page.setContent(readFileSync(join(PREVIEW_DIR, `${theme}.html`), 'utf8'), { waitUntil: 'load' })
  readings[theme] = await page.evaluate(new Function(`return (${MEASURE})()`))
  // Full page, so the picture shows the whole section and not just the fold.
  await page.screenshot({ path: join(OUT, `${theme}.png`), fullPage: true })
  // One card at 3x, so the detail a full-page shot loses is inspectable.
  const card = page.locator('[data-dsh-part="system-card"]').first()
  if (await card.count() > 0) {
    await card.screenshot({ path: join(OUT, `${theme}-card.png`), scale: 'css' })
  }
  await page.close()
}
await browser.close()

const light = readings['light']
const dark = readings['dark']
const results = []
const check = (name, ok, detail) => results.push({ name, ok, detail })

check('两张预览页都在', light.cards > 0 && dark.cards > 0, `light=${light.cards} dark=${dark.cards} 张卡`)
check('按岗位分成了多组，不是一列', light.groups >= 6, `${light.groups} 组`)
check('网格真的多列（不是退化成单列）', light.columns >= 2, `${light.columns} 列`)
check('图标有真实尺寸（不是塌成 0）', light.tileWidth >= 30 && light.iconsWithBox === light.cards,
  `tile=${light.tileWidth}px, 有尺寸的图标 ${light.iconsWithBox}/${light.cards}`)
check('同一行的卡底对齐（页脚被钉住）', light.maxRowHeightSpread <= 4, `最大行内高差 ${light.maxRowHeightSpread}px`)
check('深浅两态的卡底色不同（主题真的切了）', light.cardBackground !== dark.cardBackground,
  `${light.cardBackground} vs ${dark.cardBackground}`)
check('岗位 chip 在两态都取到颜色', light.roleChipColor !== '' && dark.roleChipColor !== '',
  `${light.roleChipColor} / ${dark.roleChipColor}`)
check('卡圆角生效（样式表确实级联到了）', light.cardRadius !== '0px' && light.cardRadius !== '',
  `${light.cardRadius}`)

for (const row of results) {
  process.stdout.write(`${row.ok ? 'ok  ' : 'FAIL'} ${row.name} — ${row.detail}\n`)
}

/* Contrast, reported rather than judged.
 *
 * Two floors are asserted and they are the two that a stylesheet change can
 * actually break: the card's name (the primary text) and its action label (the
 * brand green, which is the one colour here that is not a theme token and so the
 * one that cannot follow the theme when it needs to). Everything else is printed
 * as a number, because the shell's own caption grey sits well below 4.5:1 by
 * design and 「与外壳一致」 is the requirement that applies there, not WCAG AA. */
process.stdout.write('\n对比度（WCAG，实测解析后的颜色）：\n')
for (const theme of ['light', 'dark']) {
  const entries = Object.entries(readings[theme].contrast)
  process.stdout.write(`  ${theme.padEnd(6)} ${entries.map(([k, v]) => `${k} ${v ?? '—'}`).join(' · ')}\n`)
}
/* Every text role, not a sample of three. The first version of this probe
 * asserted only the name, the action and the group title — and would have passed
 * a board on which the login warning was 1.99:1 and the English name 1.97:1,
 * because neither was on the list. A legibility floor that covers some text is a
 * floor that certifies the page it did not look at. */
const floors = [
  ['卡名', 'name', 4.5],
  ['英文名', 'nameEn', 4.5],
  ['简介', 'desc', 4.5],
  ['技术标签', 'tag', 4.5],
  ['主岗位 chip（品牌色）', 'role', 4.5],
  ['兼属岗位 chip', 'roleMore', 4.5],
  ['状态警示（需登录/不可达）', 'flag', 4.5],
  ['动作标签（品牌色）', 'action', 4.5],
  ['分组标题', 'groupTitle', 4.5],
  ['分组路径', 'groupPath', 4.5],
]
for (const [label, key, floor] of floors) {
  for (const theme of ['light', 'dark']) {
    const value = readings[theme].contrast[key]
    check(`${theme} · ${label} ≥ ${floor}:1`, typeof value === 'number' && value >= floor, `${value ?? '—'}:1`)
  }
}

for (const row of results.filter((row) => row.name.includes('≥'))) {
  process.stdout.write(`${row.ok ? 'ok  ' : 'FAIL'} ${row.name} — ${row.detail}\n`)
}

process.stdout.write(`\n截图：${OUT}/light.png · dark.png · light-card.png · dark-card.png\n`)
const failed = results.filter((row) => !row.ok)
process.exit(failed.length === 0 ? 0 : 1)
