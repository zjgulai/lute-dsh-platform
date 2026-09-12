/**
 * Real-layout geometry probe for the split sidebar entry.
 *
 * ## Why this file exists
 *
 * The package's vitest suite runs in jsdom, which **performs no layout**: every
 * `getBoundingClientRect()` returns zeros, so those tests have to *supply* the
 * official button's box and can only check the core's arithmetic. The claim
 * that actually matters to the user — 「新会话」 and 「新应用」 end up on one line,
 * same height, with nothing below them moving — is a claim about the browser's
 * layout engine, and only a browser can settle it.
 *
 * So this probe drives **real Google Chrome** over the DevTools protocol and
 * measures real boxes. Two things keep it honest:
 *
 *  1. **The shell's CSS is extracted from the shipped bundle, never retyped.**
 *     A hand-written replica of the stylesheet would drift from the shell
 *     silently and turn this probe into a test of my own assumptions.
 *  2. **Missing preconditions fail loudly.** No Chrome, or no DSH app to read
 *     the stylesheet from, exits non-zero with the reason — it never skips to a
 *     green result (the failure mode A5 was opened for).
 *
 * It is deliberately NOT part of `pnpm test`: it needs a real browser and the
 * installed app, so it runs on demand as the acceptance artifact for the
 * sidebar-geometry contract.
 *
 * Usage: `node scripts/geometry-probe.mjs`
 * @module dsh-newapp-local/scripts/geometry-probe
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP_DIR = '/Applications/DSH Desktop.app'
const SIDEBAR_BUNDLE = join(
  APP_DIR, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules',
  '@deepseek-ai', 'dsh-client-ui-sidebar', 'lib', 'client.js',
)

/** Fail with a reason instead of reporting a green result on a missing precondition. */
function require_(condition, message) {
  if (!condition) {
    console.error(`geometry-probe: ${message}`)
    process.exit(2)
  }
}

require_(existsSync(SIDEBAR_BUNDLE), `找不到官方侧边栏 bundle：${SIDEBAR_BUNDLE}（DSH Desktop 未安装？）`)

/** Pull the shell's own CSS-module text and class map out of the shipped bundle. */
function readShellStyles() {
  const source = readFileSync(SIDEBAR_BUNDLE, 'utf8')
  // The bundle embeds the compiled CSS module as `{ "hash_local": "hash_local", … }`
  // next to the stylesheet string. The stylesheet is the long string containing
  // the `_root{` rule; find it rather than guessing an offset.
  const match = /"(\.x-[A-Za-z0-9_-]+_root\{[^"]*)"/.exec(source)
  require_(match !== null, '在官方 bundle 里定位不到侧边栏样式表（提取方式已失效）')
  const css = match[1].replace(/\\"/g, '"')
  const prefixMatch = /(x-[A-Za-z0-9_-]+)_root\s*\{/.exec(css)
  require_(prefixMatch !== null, '解析不出类名前缀（样式表形状已变，提取方式需更新）')
  const prefix = prefixMatch[1]
  return { css, prefix }
}

/**
 * Transpile the shared entry core to a plain browser script exposing `__entryCore`.
 *
 * Compiled with the package's own declared `typescript` rather than a bundler:
 * the core is a single dependency-free module, so `transpileModule` is the whole
 * job, and reaching for esbuild would have added a devDependency that exists in
 * the tree only transitively (a phantom dependency, which is its own bug class).
 * @returns {string} script text assigning `window.__entryCore`
 */
function buildCore() {
  const tsPath = join(PACKAGE_ROOT, 'node_modules', 'typescript')
  require_(existsSync(tsPath), '找不到 typescript（先在该包内跑 pnpm install）')
  const ts = createRequire(import.meta.url)(tsPath)
  const source = readFileSync(join(PACKAGE_ROOT, 'src', 'client', 'sidebar-entry-core.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: 'sidebar-entry-core.ts',
  })
  return `window.__entryCore = (function(){ const exports = {};\n${outputText}\nreturn exports })();`
}

const { css: shellCss, prefix: P } = readShellStyles()
const coreScript = buildCore()
// The package's own module CSS: used verbatim (local class names intact) so no
// CSS-modules transform is needed for the probe.
const entryCss = readFileSync(join(PACKAGE_ROOT, 'src', 'client', 'newapp.module.css'), 'utf8')

/**
 * The fixture reproduces the shell's sidebar skeleton from the real bundle's
 * class names: column > root > [logoRow, newSession, regionArea].
 * @returns {string} the fixture HTML
 */
function fixture() {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%}
  body{display:flex;height:100vh;--dsw-alias-label-primary:#111;--dsw-alias-label-secondary:#666;
       --dsw-alias-border-l3:rgba(0,0,0,.14);--dsw-alias-button-elevated-fill:rgba(0,0,0,.03);
       --dsw-alias-button-floating-hover:rgba(0,0,0,.06);--dsw-alias-interactive-bg-hover:rgba(0,0,0,.05);
       --dsw-alias-state-business-primary:#3e9b33;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f4f4f4;
       --dsw-alias-bg-base:#fff;--dsw-alias-label-caption:#8a8a8a;--dsw-alias-border-l1:rgba(0,0,0,.07);
       --dsw-alias-border-l2:rgba(0,0,0,.12);--dsw-alias-state-error-primary:#c0392b}
  /* ── the shell's own stylesheet, extracted verbatim from the shipped bundle ── */
  ${shellCss}
  /* ── this package's entry styles ── */
  ${entryCss}
  #column{width:280px;display:flex;flex-direction:column}
</style></head>
<body>
  <div id="column" data-pane="sidebar">
    <div class="${P}_root">
      <div class="${P}_logoRow"></div>
      <button type="button" class="${P}_newSession">
        <span class="${P}_newSessionLabel">新会话</span>
      </button>
      <div class="${P}_regionArea"><div style="height:400px">工作区</div></div>
      <div class="${P}_footArea"></div>
    </div>
  </div>
  <script>${coreScript}</script>
</body></html>`
}

/** Locate a Playwright install (npx cache) without adding it as a dependency. */
async function loadPlaywright() {
  const { stdout } = await import('node:child_process').then((m) => new Promise((resolve, reject) => {
    m.execFile('bash', ['-lc', 'ls -d ~/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -5'],
      (error, out) => (error ? reject(error) : resolve({ stdout: out })))
  }))
  const candidates = stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  require_(candidates.length > 0, '找不到 playwright（本探针只借用 npx 缓存里的安装，不作为依赖）')
  for (const dir of candidates) {
    try {
      return await import(join(dir, 'index.mjs'))
    } catch { /* try the next candidate */ }
  }
  require_(false, `playwright 存在于 ${candidates.join('、')} 但都导入失败`)
}

/** Measure one element's box in the page. */
const BOX = `(sel) => { const el = document.querySelector(sel); if (!el) return null;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom,
           radius:cs.borderRadius, fontSize:cs.fontSize, marginBottom:cs.marginBottom } }`

const results = []
/** Record one assertion. */
function check(name, ok, detail) {
  results.push({ name, ok, detail })
}

const pw = await loadPlaywright()
const browser = await pw.chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
await page.setContent(fixture(), { waitUntil: 'load' })

const OFFICIAL = `button[class*="newSession"]`
const ENTRY = `[data-dsh-newapp-entry]`

// ── Baseline: the shell before we touch it ────────────────────────────────────
const before = await page.evaluate(({ box, official }) => {
  const root = document.querySelector('[class*="_root"]')
  const region = document.querySelector('[class*="_regionArea"]')
  return { rootH: root.getBoundingClientRect().height, regionTop: region.getBoundingClientRect().top,
           official: eval(box)(official) }
}, { box: BOX, official: OFFICIAL })

// ── Mount through the real core ───────────────────────────────────────────────
const mounted = await page.evaluate(({ official, entry }) => {
  const dispose = window.__entryCore.mountSidebarEntry({
    rowAttribute: 'data-dsh-newapp-entry',
    rowSelector: '[data-dsh-newapp-entry]',
    plugin: 'newapp-local',
    icon: '<svg viewBox="0 0 16 16" width="18" height="18"><rect x="2" y="2" width="12" height="12" fill="currentColor"/></svg>',
    css: { entry: 'entry', entryIcon: 'entryIcon', entryLabel: 'entryLabel' },
    label: () => '新应用',
    onToggle: () => {},
    position: 'split',
    familySelectors: ['[data-dsh-newapp-entry]'],
  })
  window.__dispose = dispose
  return document.querySelector(entry) !== null
}, { official: OFFICIAL, entry: ENTRY })

check('入口已挂载', mounted, mounted ? '' : '核心未插入入口行')

const after = await page.evaluate(({ box, official, entry }) => {
  const root = document.querySelector('[class*="_root"]')
  const region = document.querySelector('[class*="_regionArea"]')
  const entryEl = document.querySelector(entry)
  const rootCs = getComputedStyle(root)
  return {
    rootH: root.getBoundingClientRect().height,
    rootContentW: root.getBoundingClientRect().width
      - parseFloat(rootCs.paddingLeft) - parseFloat(rootCs.paddingRight),
    regionTop: region.getBoundingClientRect().top,
    official: eval(box)(official),
    entry: eval(box)(entry),
    prevIsOfficial: entryEl.previousElementSibling === document.querySelector(official),
    split: entryEl.dataset.split,
    plugin: entryEl.getAttribute('data-dsh-plugin'),
    text: entryEl.textContent,
  }
}, { box: BOX, official: OFFICIAL, entry: ENTRY })

// ── The contract the user actually asked for ──────────────────────────────────
const sameRow = Math.abs(after.official.y - after.entry.y) < 0.6
check('两键在同一行（top 相同）', sameRow,
  `官方 top=${after.official.y} 自建 top=${after.entry.y}（差 ${(after.entry.y - after.official.y).toFixed(2)}px）`)

const sameHeight = Math.abs(after.official.height - after.entry.height) < 0.6
check('两键等高（38px）', sameHeight && Math.abs(after.entry.height - 38) < 0.6,
  `官方 ${after.official.height}px 自建 ${after.entry.height}px`)

const halfEach = Math.abs(after.official.width - after.entry.width) < 0.6
check('两键等宽（各占一半）', halfEach,
  `官方 ${after.official.width.toFixed(2)}px 自建 ${after.entry.width.toFixed(2)}px`)

// Column geometry: each button carries 2px side margins, and 2 + W + 2 | 2 + W + 2
// must fill the root's content box exactly. Measured against the root's real
// content box, not against a re-derivation of W (which is how the first draft of
// this assertion managed to compare a width against two widths and fail).
const gap = after.entry.x - after.official.right
check('两键之间恰好是各自 2px 外边距（4px）', Math.abs(gap - 4) < 0.6, `实测间距 ${gap.toFixed(2)}px`)
const span = (after.entry.right + 2) - (after.official.x - 2)
check('半宽公式 W = 50% - 4px 成立（两键连同外边距正好填满 root 内容宽）',
  Math.abs(span - after.rootContentW) < 1,
  `2+W+2+2+W+2 = ${span.toFixed(2)}px vs root 内容宽 ${after.rootContentW.toFixed(2)}px`)

const noShift = Math.abs(after.regionTop - before.regionTop) < 0.6
check('下方工作区零位移', noShift,
  `regionArea top ${before.regionTop} → ${after.regionTop}`)

const sameRootH = Math.abs(after.rootH - before.rootH) < 0.6
check('容器总高不变', sameRootH, `root 高 ${before.rootH} → ${after.rootH}`)

check('入口是官方按钮的紧邻下一兄弟', after.prevIsOfficial, after.prevIsOfficial ? '' : '中间夹了别的节点')

// ── Visual parity: the pair must look like one control, not two ───────────────
check('圆角与官方一致（12px）', after.entry.radius === after.official.radius,
  `官方 ${after.official.radius} vs 自建 ${after.entry.radius}`)
check('字号与官方一致', after.entry.fontSize === after.official.fontSize,
  `官方 ${after.official.fontSize} vs 自建 ${after.entry.fontSize}`)

// ── Collapsed rail: must stack, and must not clip the icon ────────────────────
const collapsed = await page.evaluate(({ box, official, entry, rootCls, collapsedCls }) => {
  const root = document.querySelector('.' + rootCls)
  if (root === null) throw new Error('找不到侧边栏 root：' + rootCls)
  // A real collapse narrows the sidebar column; that width change is exactly
  // what the core's ResizeObserver keys on. Toggling the class alone changes no
  // box, so it would never fire — which is what the first draft of this probe
  // did, and it reported a false failure for every collapsed assertion.
  document.getElementById('column').style.width = '60px'
  root.classList.add(collapsedCls)
  // Two frames: one for the ResizeObserver callback, one for the resulting layout.
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const entryEl = document.querySelector(entry)
    const icon = entryEl.querySelector('[class*="entryIcon"]')
    resolve({
      official: eval(box)(official), entry: eval(box)(entry),
      icon: icon === null ? null : eval(box)('[data-dsh-newapp-entry] [class*="entryIcon"]'),
      split: entryEl.dataset.split,
      labelVisible: getComputedStyle(entryEl.querySelector('[class*="entryLabel"]')).display !== 'none',
    })
  })))
}, { box: BOX, official: OFFICIAL, entry: ENTRY, rootCls: `${P}_root`, collapsedCls: `${P}_collapsed` })

check('收起态转 data-split="collapsed"', collapsed.split === 'collapsed', `dataset.split=${collapsed.split}`)
check('收起态堆叠而非硬分（自建键在官方键下方）', collapsed.entry.y > collapsed.official.y + 1,
  `官方 top=${collapsed.official.y} 自建 top=${collapsed.entry.y}`)
check('收起态自建键为 36×36（沿用官方 rail 度量）',
  Math.abs(collapsed.entry.width - 36) < 0.6 && Math.abs(collapsed.entry.height - 36) < 0.6,
  `${collapsed.entry.width}×${collapsed.entry.height}`)
const iconFits = collapsed.icon === null ? false
  : collapsed.icon.width <= collapsed.entry.width + 0.6 && collapsed.icon.height <= collapsed.entry.height + 0.6
check('收起态图标不被切（这是不硬分的理由）', iconFits,
  collapsed.icon === null ? '找不到图标' : `图标 ${collapsed.icon.width}×${collapsed.icon.height} ⊂ 键 ${collapsed.entry.width}×${collapsed.entry.height}`)
check('收起态隐藏文案（36px 放不下「新应用」）', !collapsed.labelVisible, '')

// ── Unmount restores the shell exactly ────────────────────────────────────────
const restored = await page.evaluate(({ box, official, rootCls, collapsedCls }) => {
  // Return the shell to its expanded layout first: measuring the disposer while
  // the shell is still collapsed would report the collapsed width as a failure
  // of unmounting.
  document.getElementById('column').style.width = '280px'
  document.querySelector('.' + rootCls).classList.remove(collapsedCls)
  window.__dispose()
  return { official: eval(box)(official), entry: document.querySelector('[data-dsh-newapp-entry]') }
}, { box: BOX, official: OFFICIAL, rootCls: `${P}_root`, collapsedCls: `${P}_collapsed` })
check('卸载后官方按钮宽度还原', Math.abs(restored.official.width - before.official.width) < 0.6,
  `${before.official.width} → ${restored.official.width}`)
check('卸载后入口行已移除', restored.entry === null, '')


/* ── The product matrix: the grid's real column count (M3) ────────────────────
 *
 * Why this is measured here and not in `pnpm test`: the claim is 「大卡片的矩阵
 * 形式」, which is a statement about how many cards fit on a line. jsdom performs no
 * layout, so a unit test there would compare zero against zero and pass forever.
 *
 * Why a **synthetic fixture** rather than the real page: this machine declares
 * exactly one product, so the live page can only ever show one column. A grid
 * assertion against real data would be unfalsifiable — it would hold for a flex
 * column too. So the fixture declares four, and NC3 below declares one and
 * requires the same assertion to FAIL.
 *
 * The stylesheet is extracted verbatim from the built bundle, exactly as the
 * sidebar section does: retyping it here would turn this probe into a test of my
 * own transcription.
 */

const CLIENT_BUNDLE = join(PACKAGE_ROOT, 'lib', 'client.js')
require_(existsSync(CLIENT_BUNDLE), `找不到构建产物 ${CLIENT_BUNDLE}——先跑 pnpm run build`)

const clientSource = readFileSync(CLIENT_BUNDLE, 'utf8')
const gridPrefixMatch = /\.([A-Za-z0-9_]+)_grid\{/.exec(clientSource)
require_(gridPrefixMatch !== null, '在 lib/client.js 里定位不到 .grid 规则（样式表已不再内联？提取方式失效）')
const M = gridPrefixMatch[1]

/**
 * The compiled stylesheet, decoded out of the bundle's JS string literal.
 *
 * **Do not "simplify" this to `indexOf('"')`.** The first draft did, and it
 * silently truncated the sheet at 1.4 KB — because the CSS contains
 * `content:\"\"` for the header's decorative rule, i.e. an *escaped* quote inside
 * the literal. The truncated sheet then failed to parse as CSS, so **every** rule
 * was dropped, the grid fell back to `display:block`, and the probe reported
 * "1 column". That is a green-looking number produced by a broken instrument.
 *
 * So: scan for the first *unescaped* `"`, decode the literal with `JSON.parse`
 * (JS string escaping is JSON-compatible for everything a CSS sheet contains),
 * and then assert the two things that prove the sheet arrived whole.
 * @param source - the bundle text.
 * @param prefix - the CSS-module class prefix.
 * @returns the decoded stylesheet.
 */
function embeddedStylesheet(source, prefix) {
  const firstClass = `.${prefix}_root`
  const at = source.indexOf(firstClass)
  require_(at >= 0, `bundle 里找不到 ${firstClass}`)
  const start = source.lastIndexOf('"', at) + 1
  require_(start > 0, '定位不到样式表字符串的起点（提取方式失效）')
  let end = -1
  for (let i = at; i < source.length; i += 1) {
    if (source[i] === '\\') { i += 1; continue }
    if (source[i] === '"') { end = i; break }
  }
  require_(end > start, '定位不到样式表字符串的终点（提取方式失效）')
  try {
    return JSON.parse(`"${source.slice(start, end)}"`)
  } catch (error) {
    require_(false, `样式表字符串解码失败：${String(error)}`)
  }
}

const matrixCss = embeddedStylesheet(clientSource, M)

// 完整性自检：截断的样式表会被浏览器整块丢弃，于是**每条规则都不生效**，
// 而量出来的列数还是 1 —— 一个由坏仪器产出的、看起来合理的数字。
require_(matrixCss.includes(`.${M}_grid{`), '提取到的样式表里没有 .grid 规则——截断了')
require_(matrixCss.includes('display:grid') || matrixCss.includes('display: grid'),
  '提取到的样式表里没有 display:grid——截断了，M3 会量出一个假的 1 列')
require_(matrixCss.length > 8000, `提取到的样式表只有 ${matrixCss.length} 字符，明显不完整`)

/** One card's markup, mirroring what the component emits. */
function card(i) {
  return `<li class="${M}_card" data-dsh-part="product-card">
    <div class="${M}_cardHead"><h4 class="${M}_cardLabel">产品 ${i}</h4><span class="${M}_cardDir">/Users/lute/project/P${i}</span></div>
    <p class="${M}_cardSummary">第 ${i} 个产品的说明</p>
    <div class="${M}_cardMeta"><span class="${M}_chipMuted">草案</span><span class="${M}_chip">岗位 agt-00${i}</span></div>
    <div class="${M}_action"><button class="${M}_primary">打开</button></div>
  </li>`
}

/** A panel body of a given width holding `n` cards. */
function matrixFixture(n) {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%}
  body{--dsw-alias-label-primary:#0f1115;--dsw-alias-label-secondary:#61666b;--dsw-alias-label-caption:#adb2b8;
       --dsw-alias-border-l1:rgba(0,0,0,.04);--dsw-alias-border-l2:rgba(0,0,0,.1);--dsw-alias-bg-base:#fff;
       --dsw-alias-bg-module-platform:#f5f6f7;--dsw-alias-button-primary-fill:#0f1115;
       --dsw-alias-label-primary-foreground:#fff;--dsw-alias-state-success-primary:#22c55e;
       --dsw-alias-state-success-tertiary:#e6faed;--dsw-font-xxxs-11:400 11px/14px system-ui;
       --dsw-font-xxs-12:400 12px/16px system-ui;--dsw-font-base-strong-16:600 16px/24px system-ui}
  ${matrixCss}
  #matrixBody{box-sizing:border-box;padding:20px;width:100%}
  </style></head><body>
  <div id="matrixBody"><ul class="${M}_grid" data-dsh-part="product-cards">${Array.from({ length: n }, (_, i) => card(i + 1)).join('')}</ul></div>
  </body></html>`
}

/*
 * What gets measured, and why it is **cards per row** rather than track count.
 *
 * The first draft of NC3 compared `grid-template-columns` track counts and
 * demanded that a one-card fixture report a single track. It reported four — and
 * it was right to. `repeat(auto-fill, minmax(280px, 1fr))` creates as many tracks
 * as *fit*, empty ones included, so the track count is a property of the
 * **viewport**, not of the card count. The assertion was measuring the wrong
 * thing and would have been satisfied by any grid at any card count.
 *
 * "How many cards share the first row" is the property the user actually asked
 * for (「矩阵形式」), it varies with the card count, and it is therefore
 * falsifiable in both directions.
 */
const MEASURE = `() => {
  const grid = document.querySelector('[data-dsh-part="product-cards"]')
  const tracks = getComputedStyle(grid).gridTemplateColumns.split(' ').filter((t) => t !== '').length
  const cards = [...grid.querySelectorAll('[data-dsh-part="product-card"]')]
  const boxes = cards.map((el) => el.getBoundingClientRect())
  const firstTop = boxes[0].top
  const perRow = boxes.filter((b) => Math.abs(b.top - firstTop) < 0.6).length
  const rows = new Set(boxes.map((b) => Math.round(b.top))).size
  const g = grid.getBoundingClientRect()
  return { tracks, perRow, rows, cardCount: cards.length,
           gridW: g.width, cardW: boxes[0].width, cardH: boxes[0].height }
}`

async function measureMatrix(n, viewportWidth) {
  const page2 = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } })
  await page2.setContent(matrixFixture(n), { waitUntil: 'load' })
  const m = await page2.evaluate(eval(`(${MEASURE})`))
  await page2.close()
  return m
}

const four = await measureMatrix(4, 1280)
check('M3 宽屏（1280px）每行排 ≥ 2 张卡', four.perRow >= 2,
  `实测每行 ${four.perRow} 张（共 ${four.cardCount} 张 / ${four.rows} 行；grid 宽 ${four.gridW.toFixed(0)}px，卡宽 ${four.cardW.toFixed(0)}px）`)
check('M3 卡片是网格项而不是整行（卡宽 < 网格宽）', four.cardW < four.gridW - 1,
  `卡 ${four.cardW.toFixed(0)}px < 网格 ${four.gridW.toFixed(0)}px`)
check('M3 卡片确实「大」：单卡高度 ≥ 180px', four.cardH >= 180,
  `实测卡高 ${four.cardH.toFixed(0)}px（min-height 184px 生效）`)
check('M3 样式表确实装的是网格（auto-fill 铺满可用轨道）', four.tracks >= 2,
  `实测 ${four.tracks} 条轨道 @1280px`)

// NC3 — 反向对照，且它必须是**会失败的那一半**。
// 「每行 ≥ 2 张」若恒真（比如写成了 `>= 1`，或夹具根本没起作用），下面这条就会绿，
// 那上面那条也就什么都没证明。一张卡的夹具必须让同一条断言不成立。
const one = await measureMatrix(1, 1280)
check('NC3 一张卡时「每行 ≥ 2 张」必须不成立（证明上面那条不是恒真）', one.perRow < 2,
  `实测每行 ${one.perRow} 张——若这里也 ≥ 2，说明夹具或断言有一个没在工作`)

// 窄屏时每行张数必须收缩：这才是 auto-fill 而不是固定列数的证据。
const narrow = await measureMatrix(4, 640)
check('M3 窄屏（640px）每行张数随之收缩', narrow.perRow < four.perRow,
  `1280px → 每行 ${four.perRow} 张，640px → 每行 ${narrow.perRow} 张`)

await browser.close()

// ── Report ────────────────────────────────────────────────────────────────────
const width = Math.max(...results.map((r) => r.name.length))
for (const r of results) {
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(width)}  ${r.detail}`)
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过（真实 Chrome 布局，官方样式表提取自 shipped bundle：类名前缀 ${P}）`)
process.exit(failed.length === 0 ? 0 : 1)
