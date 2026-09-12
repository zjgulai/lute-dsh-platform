/**
 * 「输入框下方 · 分身能力导引」的**挂载契约**与**列几何**实况探针。
 *
 * ## 它回答的问题（单测答不了的那些）
 *
 * 这个功能是 DOM 挂载 —— 它插进官方 composer 的一个子树里。真正的风险不是逻辑写错，
 * 而是**几何**与**生命周期**：插进去的那一行是否与输入框同轴同宽？三列在真实样式表下
 * 是否真的成立？官方 React 重渲染 / hero→active 相位切换之后，它是否还在、且只有一行？
 * 这些问题的答案全在浏览器布局引擎里，`getBoundingClientRect()` 在 jsdom 里恒为 0，
 * 单测**结构上**答不了。
 *
 * 所以本探针回答：
 *
 *  ① **挂载点**：在 hero 态（空会话）把一行插进输入框下方，插在哪里才既不与输入框
 *     错轴、又能在 React 重渲染/相位切换后自愈？
 *  ② **列几何**：R8 要求的「横向 3 列 → 2 列 → 1 列」在真实样式表下**真的**成立吗？
 *
 * ## 三件事让它没法自欺
 *
 *  1. **样式表从实时安装包里提取**，逐字注入，绝不手抄。手抄副本会与官方悄悄漂移，
 *     把探针变成对我自己假设的验证。
 *  2. **核心是真的**：本探针转译**产品文件** `packages/surfaces/dsh-role-matrix-local/
 *     src/client/hero-entry-core.ts` 并调用它，而不是在夹具里重写一遍插入逻辑——
 *     否则测的是替身，产品代码照样可能坏。样式表同样逐字读产品文件
 *     `hero-entry.module.css`。
 *  3. **带反向对照（NC）**：每条「应当成立」的断言，都配一条**必须失败**的对照。
 *     没有对照，绿色只能证明夹具或断言有一个没在工作。
 *
 * ## 它**不**回答什么（诚实边界）
 *
 *  - 夹具里的输入框卡片本体是**定高替身**（真卡片是另一个模块的复杂组件）。本探针证的
 *    几何是「本行相对输入框与栈的位置、轴宽、列数」，不依赖卡片内部结构。
 *  - 夹具的行内容也是替身：真实 React 组件渲染出的**文案与交互**由
 *    `tests/hero-entry.spec.tsx`（jsdom，结构）与真实 GUI 回归负责。两半合起来才覆盖
 *    整条链：这里证几何与挂载，那里证内容与行为。
 *  - 样式表以 CSS Module **源码**为准：列号与轴宽的契约在源码里成立即成立
 *    （模块化只改类名，不改级联关系）。
 *
 * jsdom 跑不了这个：它不做布局，列数、轴心、兄弟位置这些恰恰都是浏览器布局引擎的事实。
 *
 * 用法：`node scripts/acceptance/role-hero-entry-live.mjs`
 * 退出码：0 = 全部通过；1 = 有断言未通过；2 = 前置条件（官方 bundle / playwright / 产品文件）不可用。
 * @module scripts/acceptance/role-hero-entry-live
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
/** 被验证的产品文件：共享挂载核心与它所在包的样式表。 */
const CORE_TS = join(REPO_ROOT, 'packages', 'surfaces', 'dsh-role-matrix-local', 'src', 'client', 'hero-entry-core.ts')
const ENTRY_CSS = join(REPO_ROOT, 'packages', 'surfaces', 'dsh-role-matrix-local', 'src', 'client', 'hero-entry.module.css')
const PKG_ROOT = join(REPO_ROOT, 'packages', 'surfaces', 'dsh-role-matrix-local')
const CONVERSATION_BUNDLE = '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'
const ARCHIVED_BUNDLE = join(REPO_ROOT, 'dsh-patches', 'archive', 'chatui-orig-bundles', 'dsh-client-ui-conversation-client.js.orig')

/** 缺前置条件就带原因退出，绝不「跳过」成一个绿色结果。 */
function require_(condition, message) {
	if (!condition) {
		console.error(`hero-entry-probe: ${message}`)
		process.exit(2)
	}
}

require_(existsSync(CONVERSATION_BUNDLE), `找不到官方会话 bundle：${CONVERSATION_BUNDLE}（DSH Desktop 未安装？）`)

/**
 * 从 bundle 里解析出 ConversationRoot 的样式表。
 *
 * 用**包路径锚**（tagId 里的模块路径）定位，而不是找某个哈希前缀——哈希每次上游
 * 重建都会变（下面 NC2 就是在证明这一点）。
 * @param source - bundle 源码。
 * @param label - 出错信息里的来源名。
 * @returns 样式表文本与解析出的类名前缀。
 */
function readModuleCss(source, label) {
	const tagIdx = source.indexOf('@deepseek-ai/dsh-client-ui-conversation/ConversationRoot.module.css')
	require_(tagIdx >= 0, `${label}：定位不到 ConversationRoot 模块（包路径锚已失效）`)
	const before = source.slice(0, tagIdx)
	const varIdx = before.lastIndexOf('const css')
	require_(varIdx >= 0, `${label}：模块 id 之前找不到样式表变量`)
	const start = before.indexOf('"', varIdx)
	require_(start >= 0, `${label}：样式表变量后没有字符串字面量`)
	// 手工解 JS 字符串转义：CSS 里有 \" 与 \\ 是常态，正则偷懒会在长串上翻车。
	let out = ''
	for (let i = start + 1; i < before.length; i += 1) {
		const ch = before[i]
		if (ch === '\\') { out += before[i + 1]; i += 1; continue }
		if (ch === '"') break
		out += ch
	}
	require_(out.includes('_composerSeat{'), `${label}：取到的样式表里没有 composerSeat 规则（提取偏移错了）`)
	const prefix = /([A-Za-z0-9_-]+)_composerSeat\s*\{/.exec(out)?.[1]
	require_(prefix !== undefined, `${label}：解析不出类名前缀`)
	return { css: out, prefix }
}

const live = readModuleCss(readFileSync(CONVERSATION_BUNDLE, 'utf8'), 'live bundle')
const P = live.prefix

/** 把产品挂载核心转译成暴露 `__core` 的浏览器脚本（用包内 typescript，不引打包器）。 */
function buildCore() {
	const tsPath = join(PKG_ROOT, 'node_modules', 'typescript')
	require_(existsSync(tsPath), '找不到 typescript（先在该包内跑 pnpm install）')
	const ts = createRequire(import.meta.url)(tsPath)
	require_(existsSync(CORE_TS), `找不到产品挂载核心：${CORE_TS}`)
	const source = readFileSync(CORE_TS, 'utf8')
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		fileName: 'hero-entry-core.ts',
	})
	return `window.__core = (function(){ const exports = {};\n${outputText}\nreturn exports })();`
}

const coreScript = buildCore()
/** 已发布的样式表：逐字读入，不另写副本。 */
require_(existsSync(ENTRY_CSS), `找不到产品样式表：${ENTRY_CSS}`)
const entryCss = readFileSync(ENTRY_CSS, 'utf8')

/** 加载 playwright：只借用 npx 缓存里的安装，不作为依赖。 */
async function loadPlaywright() {
	const { execFile } = await import('node:child_process')
	const stdout = await new Promise((resolve, reject) => {
		execFile('bash', ['-lc', 'ls -d ~/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -5'],
			(error, out) => (error ? reject(error) : resolve(out)))
	})
	const candidates = stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '')
	require_(candidates.length > 0, '找不到 playwright（本探针只借用 npx 缓存里的安装，不作为依赖）')
	for (const dir of candidates) {
		try { return await import(join(dir, 'index.mjs')) } catch { /* 试下一个 */ }
	}
	require_(false, `playwright 存在于 ${candidates.join('、')} 但都导入失败`)
}

/**
 * 夹具：按官方渲染式复刻 hero 态的输入框骨架。
 *
 * 层级逐层对应实时 bundle 的渲染代码：
 *   root[data-phase=hero] > scrollBody > [session slot, composerSeat]
 *   composerSeat > div[data-chain-overlay-fallback][display:contents]   ← overlay 链未选举时的形态
 *     > composerStack.composerHero > [... , input.dock, composer.bar]
 *
 * **诚实的边界**：输入框卡片本体在这里是定高替身（真卡片是另一个模块的复杂组件）。
 * 本探针要证的几何是「本行相对输入框与栈的位置、轴宽、列数」，不依赖卡片内部结构；
 * 真卡片的复合几何由第 6 步的真实 GUI 回归覆盖。
 * @param columnWidth - 驱动卡片轴宽的会话栏宽度（px）。
 * @returns 夹具 HTML。
 */
function fixture(columnWidth) {
	return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>
  :root{--dsh-conversation-column-width:${columnWidth}px;
        --dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-label-primary:#111;
        --dsw-alias-label-tertiary:#8a8a8a;--dsw-alias-label-caption:#aaa;
        --dsw-alias-border-l1:rgba(0,0,0,.08);--dsw-alias-interactive-bg-hover:rgba(0,0,0,.05);
        --dsw-alias-state-business-primary:#3e9b33;--dsw-alias-border-l3:rgba(0,0,0,.14);
        --dsw-alias-bg-layer-2:#f4f4f4;--dsw-alias-label-secondary:#666}
  html,body{margin:0;height:100%}
  /* ── 官方 ConversationRoot 样式表，提取自实时安装包 ── */
  ${live.css}
  /* ── 本行的样式，逐字取自产品 hero-entry.module.css ── */
  ${entryCss}
  /* 夹具专用：把替身输入框画成一个可测的块 */
  #card{height:56px;display:flex;align-items:center;padding:0 12px;box-sizing:border-box;
        border:1px solid var(--dsw-alias-border-l3);border-radius:16px}
  .cap{display:inline-block;padding:2px 8px;margin-right:6px;border-radius:999px;
       background:var(--dsw-alias-interactive-bg-hover);font-size:12px}
  .ph{height:34px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover)}
</style></head>
<body>
  <div class="${P}_root" data-phase="hero">
    <div class="${P}_body">
      <div class="${P}_scrollBody" data-conversation-scroll>
        <div data-slot="conversation.session">
          <div class="${P}_viewArea"></div>
        </div>
        <div class="${P}_composerSeat" data-composer-seat>
          <div data-chain-overlay-fallback="conversation.composer" style="display:contents">
            <div class="${P}_composerStack ${P}_composerHero">
              <div class="${P}_heroWorkspaceRow">
                <button type="button" class="${P}_workspace">工作目录</button>
              </div>
              <div data-slot="conversation.input.dock">
                <span class="cap">出海技能</span><span class="cap">AI全栈技能</span>
              </div>
              <div data-slot="conversation.composer.bar"><div id="card">输入框</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>${coreScript}</script>
</body></html>`
}

/**
 * 定高替身：**展开态**的一列（组头 + 边界说明 + 供给卡纵向排列）。
 *
 * 这是「点开之后」的形状。默认形态是收起态（见 BUILD_ROW_COLLAPSED）——
 * 两者的几何都要量，否则「默认收起」只是注释里的一句话。
 */
const BUILD_ROW = `() => {
  const wrap = document.createElement('div')
  wrap.className = 'dsh-hero-entry'
  const grid = document.createElement('div')
  grid.className = 'dsh-hero-entry__grid'
  for (let i = 0; i < 3; i += 1) {
    const col = document.createElement('section')
    col.className = 'dsh-hero-entry__col'
    col.innerHTML = '<div class="dsh-hero-entry__colHead">业务技能 ' + (i + 1)
      + '<span class="dsh-hero-entry__badge">partial</span>'
      + '<span class="dsh-hero-entry__count">4 供给</span></div>'
      + '<div class="dsh-hero-entry__note">边界说明逐字来自 skill-map</div>'
      + '<div class="dsh-hero-entry__cards"><button type="button" class="dsh-hero-entry__card">供给技能</button>'
      + '<div class="ph"></div><div class="ph"></div></div>'
    grid.appendChild(col)
  }
  wrap.appendChild(grid)
  return wrap
}`

/**
 * 定高替身：**收起态**的一列——只有组头。
 *
 * 与产品默认形态逐节点一致：React 在 `open === false` 时根本不渲染
 * `__colBody`，所以这里也不放它（而不是放一个隐藏的）。
 */
const BUILD_ROW_COLLAPSED = `() => {
  const wrap = document.createElement('div')
  wrap.className = 'dsh-hero-entry'
  const grid = document.createElement('div')
  grid.className = 'dsh-hero-entry__grid'
  for (let i = 0; i < 3; i += 1) {
    const col = document.createElement('section')
    col.className = 'dsh-hero-entry__col'
    col.innerHTML = '<button type="button" class="dsh-hero-entry__colHead" aria-expanded="false">业务技能 ' + (i + 1)
      + '<span class="dsh-hero-entry__badge">partial</span>'
      + '<span class="dsh-hero-entry__count">4 供给</span></button>'
    grid.appendChild(col)
  }
  wrap.appendChild(grid)
  return wrap
}`

const pw = await loadPlaywright()
const browser = await pw.chromium.launch({ channel: 'chrome', headless: true })
const results = []
/** 记一条断言。 */
function check(name, ok, detail) { results.push({ name, ok, detail }) }

const BOX = `(sel) => { const el = document.querySelector(sel); if (!el) return null
  const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, top:r.top } }`
const COLS = `() => { const g = document.querySelector('.dsh-hero-entry__grid')
  if (!g) return null
  const tpl = getComputedStyle(g).gridTemplateColumns.trim()
  const parts = tpl === '' || tpl === 'none' ? [] : tpl.split(/\\s+/)
  const first = document.querySelector('.dsh-hero-entry__col')
  return { count: parts.length, colWidth: first ? first.getBoundingClientRect().width : 0 } }`

/**
 * 打开一个夹具页并挂载本行。
 * @param columnWidth 驱动卡片轴宽的会话栏宽度（px）
 * @param viewportWidth 视口宽度（px）
 * @param builder 建行脚本；默认是展开态替身
 * @returns 页面与挂载结果
 */
async function mountPage(columnWidth, viewportWidth = 1400, builder = BUILD_ROW) {
	const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } })
	await page.setContent(fixture(columnWidth))
	const mounted = await page.evaluate(`(() => window.__core.ensureHeroEntry({
	  doc: document, create: ${builder}, warn: (m) => { window.__lastWarn = m }
	}))()`)
	return { page, mounted }
}

// ── NC2：哈希是会漂的（红线 #7 的实证）────────────────────────────────────────
// 同一条 composerSeat 规则，归档副本与实时安装包的前缀不同。若这条不成立，
// 后面所有「运行时解析」的论述都失去了前提。
{
	const archived = existsSync(ARCHIVED_BUNDLE)
		? readModuleCss(readFileSync(ARCHIVED_BUNDLE, 'utf8'), 'archived bundle').prefix
		: undefined
	check('NC2 同一模块的类名前缀在上游副本之间确实不同（钉哈希必失效）',
		archived !== undefined && archived !== P,
		archived === undefined
			? `归档副本不可读（${ARCHIVED_BUNDLE}）——无法证明漂移`
			: `归档 ${archived}_composerSeat  vs  实时 ${P}_composerSeat`)
}

// ── 主场景：宽窗（会话栏 1500px → 卡片轴 ≈984px）────────────────────────────
const wide = await mountPage(1500)
{
	const { page, mounted } = wide
	const bar = await page.evaluate(`(${BOX})('[data-slot="conversation.composer.bar"]')`)
	const row = await page.evaluate(`(${BOX})('[data-dsh-hero-entry-row]')`)
	const cols = await page.evaluate(`(${COLS})()`)
	const sameParent = await page.evaluate(`(() => {
	  const row = document.querySelector('[data-dsh-hero-entry-row]')
	  const bar = document.querySelector('[data-slot="conversation.composer.bar"]')
	  return row && bar ? row.parentElement === bar.parentElement : null })()`)
	const seatIsAncestor = await page.evaluate(`(() => {
	  const row = document.querySelector('[data-dsh-hero-entry-row]')
	  const seat = document.querySelector('[data-composer-seat]')
	  return row && seat ? seat.contains(row) : null })()`)
	const dupes = await page.evaluate(`document.querySelectorAll('[data-dsh-hero-entry-row]').length`)

	check('M1 核心在 hero 骨架上解析出输入框出口并挂载成功', mounted.ok === true,
		`ok=${mounted.ok}${mounted.reason ? ` reason=${mounted.reason}` : ''}`)
	check('M2 本行落在输入框**下方**（top ≥ 输入框 bottom）',
		row !== null && bar !== null && row.top >= bar.bottom - 0.5,
		row && bar ? `行 top=${row.top.toFixed(1)} vs 输入框 bottom=${bar.bottom.toFixed(1)}（间距 ${(row.top - bar.bottom).toFixed(1)}px）` : '量不到盒子')
	check('M3 本行与输入框同父（进入同一个 composerStack 宽度轴）', sameParent === true,
		`同父=${sameParent}`)
	check('M4 本行宽度与输入框对齐（同轴，误差 ≤4px）',
		row !== null && bar !== null && Math.abs(row.width - bar.width) <= 4,
		row && bar ? `行宽 ${row.width.toFixed(1)}px vs 输入框 ${bar.width.toFixed(1)}px` : '量不到盒子')
	check('M5 本行在输入框坞内（不越出 composerSeat 子树）', seatIsAncestor === true, `在 seat 内=${seatIsAncestor}`)
	check('M6 宽窗下是**三列**并排（R8）', cols !== null && cols.count === 3,
		cols ? `实测 ${cols.count} 列，列宽 ${cols.colWidth.toFixed(1)}px` : '量不到网格')
	check('M7 列宽落在 R8 目标区间（≈324px，容差 ±24）',
		cols !== null && Math.abs(cols.colWidth - 324) <= 24,
		cols ? `实测列宽 ${cols.colWidth.toFixed(1)}px（行宽 ${row ? row.width.toFixed(1) : '?'}px）` : '量不到网格')
	check('M8 挂载是幂等的：重复调用不产生第二行', dupes === 1, `DOM 里本行节点数=${dupes}`)
}

// ── M9 幂等：第二次调用不得再动 DOM ─────────────────────────────────────────
{
	const { page } = wide
	const second = await page.evaluate(`(() => window.__core.ensureHeroEntry({
	  doc: document, create: ${BUILD_ROW}, warn: () => {} }))()`)
	const dupes = await page.evaluate(`document.querySelectorAll('[data-dsh-hero-entry-row]').length`)
	check('M9 已就位时再次调用 `changed=false`（零次 DOM 写）',
		second.ok === true && second.changed === false && dupes === 1,
		`changed=${second.changed}，节点数=${dupes}`)
}

// ── M10 自愈①：React 重渲染清掉本行后，再调用即复位 ────────────────────────
{
	const { page } = wide
	const healed = await page.evaluate(`(() => {
	  // 模拟 React 重建 composerStack 子树：本行随之消失
	  const seat = document.querySelector('[data-composer-seat]')
	  const stack = seat.querySelector('[class*="composerStack"]')
	  stack.querySelectorAll('[data-dsh-hero-entry-row]').forEach((n) => n.remove())
	  const gone = document.querySelectorAll('[data-dsh-hero-entry-row]').length
	  const r = window.__core.ensureHeroEntry({ doc: document, create: ${BUILD_ROW}, warn: () => {} })
	  return { gone, ok: r.ok, changed: r.changed, now: document.querySelectorAll('[data-dsh-hero-entry-row]').length }
	})()`)
	const row = await page.evaluate(`(${BOX})('[data-dsh-hero-entry-row]')`)
	const bar = await page.evaluate(`(${BOX})('[data-slot="conversation.composer.bar"]')`)
	check('M10 自愈①：行被清掉后重新挂回原位且不重复',
		healed.gone === 0 && healed.ok === true && healed.changed === true && healed.now === 1,
		`清掉后=${healed.gone}，重挂 changed=${healed.changed}，当前=${healed.now}`)
	check('M10b 自愈后仍在输入框下方', row !== null && bar !== null && row.top >= bar.bottom - 0.5,
		row && bar ? `间距 ${(row.top - bar.bottom).toFixed(1)}px` : '量不到盒子')
}

// ── M11 自愈②：行被人挪错位置时，复位而不是再插一行 ───────────────────────
{
	const { page } = wide
	const moved = await page.evaluate(`(() => {
	  const seat = document.querySelector('[data-composer-seat]')
	  const row = document.querySelector('[data-dsh-hero-entry-row]')
	  seat.appendChild(row)                      // 挪到 seat 末尾：位置错了
	  const r = window.__core.ensureHeroEntry({ doc: document, create: ${BUILD_ROW}, warn: () => {} })
	  const bar = document.querySelector('[data-slot="conversation.composer.bar"]')
	  return { changed: r.changed, count: document.querySelectorAll('[data-dsh-hero-entry-row]').length,
	           isNext: row.previousElementSibling === bar }
	})()`)
	check('M11 自愈②：位置错时复位（changed=true）且不复制出第二行',
		moved.changed === true && moved.count === 1 && moved.isNext === true,
		`changed=${moved.changed}，节点数=${moved.count}，回到输入框紧邻后继=${moved.isNext}`)
}

// ── M12 相位切换：active 态下 seat 变成 sticky，本行仍应贴住输入框下方 ─────
{
	const { page } = wide
	const active = await page.evaluate(`(() => {
	  document.querySelector('[class*="_root"]').setAttribute('data-phase', 'active')
	  const r = window.__core.ensureHeroEntry({ doc: document, create: ${BUILD_ROW}, warn: () => {} })
	  return { ok: r.ok, changed: r.changed }
	})()`)
	const row = await page.evaluate(`(${BOX})('[data-dsh-hero-entry-row]')`)
	const bar = await page.evaluate(`(${BOX})('[data-slot="conversation.composer.bar"]')`)
	check('M12 相位切到 active 后本行仍在输入框下方（不因 sticky 而脱位）',
		active.ok === true && row !== null && bar !== null && row.top >= bar.bottom - 0.5,
		row && bar ? `行 top=${row.top.toFixed(1)}，输入框 bottom=${bar.bottom.toFixed(1)}，间距 ${(row.top - bar.bottom).toFixed(1)}px` : '量不到盒子')
}

// ── M13 摘除（离开 hero 态）────────────────────────────────────────────────
{
	const { page } = wide
	const removed = await page.evaluate(`(() => {
	  const first = window.__core.removeHeroEntry(document)
	  const second = window.__core.removeHeroEntry(document)
	  return { first, second, count: document.querySelectorAll('[data-dsh-hero-entry-row]').length }
	})()`)
	check('M13 摘除是幂等的（第一次 true，第二次 false，DOM 清零）',
		removed.first === true && removed.second === false && removed.count === 0,
		`first=${removed.first} second=${removed.second} 剩余=${removed.count}`)
}

await wide.page.close()

// ── NC1：缺锚必须自报，而不是静默什么都不做 ────────────────────────────────
{
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
	const html = fixture(1500).replace(/ data-composer-seat/, '')
	await page.setContent(html)
	const outcome = await page.evaluate(`(() => window.__core.ensureHeroEntry({
	  doc: document, create: ${BUILD_ROW}, warn: (m) => { window.__lastWarn = m } }))()`)
	const warn = await page.evaluate('window.__lastWarn ?? null')
	const diag = await page.evaluate('document.documentElement.dataset.dshHeroEntry ?? null')
	check('NC1 找不到输入框坞时返回失败并自报（warn + 诊断属性），不静默',
		outcome.ok === false && outcome.reason === 'no-seat' && typeof warn === 'string' && diag === 'no-seat',
		`reason=${outcome.reason} warn=${warn === null ? 'null' : '有'} diag=${diag}`)
	await page.close()
}

// ── M14/M15 列数降级矩阵 ───────────────────────────────────────────────────
/**
 * 量一组几何：行宽、列数、列宽。
 * @param columnWidth - 驱动卡片轴宽的会话栏宽度（px）。
 * @param viewportWidth - 视口宽度（px）；决定轴宽的 `min(..., 100%)` 上限。
 * @returns 行宽、列数与列宽。
 */
async function measureColumns(columnWidth, viewportWidth) {
	const { page } = await mountPage(columnWidth, viewportWidth)
	const row = await page.evaluate(`(${BOX})('[data-dsh-hero-entry-row]')`)
	const cols = await page.evaluate(`(${COLS})()`)
	await page.close()
	return { rowWidth: row.width, count: cols.count, colWidth: cols.colWidth }
}

// 轴宽怎么来：content = clamp(680, 会话栏×.64, 920)，轴 = min(content + 64, 100%)。
//
// **这里有个反直觉但重要的实测结论**：内容宽有 **680px 下限**，所以不管会话栏拖到
// 多窄，卡片轴宽都停在 744px。也就是说「一列」**不会**由会话栏宽度触发——只有
// **窗口本身**窄到 744px 以下（轴被 `min(..., 100%)` 压住）才会出现。第一版矩阵
// 用会话栏 300px 去测一列，量出来仍是 744px/2 列，测错了变量。
const wideM = await measureColumns(1500, 1400) // 轴 984 → 三列
const mid = await measureColumns(1300, 1400)  // 1300×.64=832 → 轴 896 → 两列
const edge = await measureColumns(1500, 700)  // 轴被压到 700 → 仍在 620 之上 → 两列
const nano = await measureColumns(1500, 560)  // 轴被压到 560 → 一列

check('M14 中等宽度（行宽 ≤900px）降为两列', mid.count === 2,
	`行宽 ${mid.rowWidth.toFixed(0)}px → ${mid.count} 列（列宽 ${mid.colWidth.toFixed(1)}px）`)
check('M15 窄窗（行宽 ≤620px）降为一列', nano.count === 1 && nano.rowWidth <= 620,
	`行宽 ${nano.rowWidth.toFixed(0)}px → ${nano.count} 列`)
check('M16 三档列数与行宽单调对应（三列 → 两列 → 一列）',
	wideM.count === 3 && mid.count === 2 && nano.count === 1,
	`${wideM.rowWidth.toFixed(0)}px→${wideM.count} 列、${mid.rowWidth.toFixed(0)}px→${mid.count} 列、${nano.rowWidth.toFixed(0)}px→${nano.count} 列`)

// NC3：反向对照——若断点形同虚设，中窄宽度会给出 3 列，上面两条就什么都没证明。
// `edge`（700px）是 620 断点的对照：它必须在 620 之上给出**两列而不是一列**，
// 否则「一列」只是恒真，M15 什么也没证明。
check('NC3 降级不是恒真：中窄宽度下**不得**仍是三列，620 之上**不得**是一列',
	mid.count < 3 && edge.count === 2 && nano.count === 1,
	`中等 ${mid.count} 列、700px 行宽 ${edge.rowWidth.toFixed(0)}px→${edge.count} 列、560px 行宽 ${nano.rowWidth.toFixed(0)}px→${nano.count} 列`)

// ── N1–N3 默认形态 = 收起态：三列组头并排，变短的只有列体 ───────────────────
// 触发（用户 2026-09-12 验收）：「对话框下方要求默认是收起来，目前是展开状态，特别长」。
// 收起态必须**仍然回答「这个岗位有哪些能力」**——所以三列必须还在、组头必须可见，
// 能变短的只有列体。这一组量的是这句话本身，而不是「高度小于某个数」。
//
// 分工写清楚，免得这一组被当成比它实际更强的东西：本探针量的是**两种形状的几何**
// （CSS 说了算）；「出厂默认是哪一种」由 `packages/surfaces/dsh-role-matrix-local/
// tests/hero-entry.spec.tsx` 断言（React 状态说了算，jsdom 里量不了布局）。
// 两边都要——只看这一组，把默认改回展开态它照样全绿。
{
	const expanded = await mountPage(1500)
	const expandedRow = await expanded.page.evaluate(`(${BOX})('[data-dsh-hero-entry-row]')`)
	await expanded.page.close()

	const collapsed = await mountPage(1500, 1400, BUILD_ROW_COLLAPSED)
	const collapsedRow = await collapsed.page.evaluate(`(${BOX})('[data-dsh-hero-entry-row]')`)
	const collapsedCol = await collapsed.page.evaluate(`(${BOX})('.dsh-hero-entry__col')`)
	const head = await collapsed.page.evaluate(`(${BOX})('.dsh-hero-entry__colHead')`)
	const cols = await collapsed.page.evaluate(`(${COLS})()`)
	const bodies = await collapsed.page.evaluate(`document.querySelectorAll('.dsh-hero-entry__colBody').length`)
	await collapsed.page.close()

	check('N1 收起态下三列仍然并排（能力层级没有被折叠掉）', cols !== null && cols.count === 3,
		cols ? `实测 ${cols.count} 列，列宽 ${cols.colWidth.toFixed(1)}px` : '量不到网格')
	// 列高 = 组头高 + 列自身的上下边框（0.5px ×2），所以容差是 2px 而不是 1px：
	// 差 0px 说明列体还在，差 2px 说明只剩边框。
	const borderOnly = collapsedCol !== null && head !== null
		&& collapsedCol.height - head.height >= 0 && collapsedCol.height - head.height <= 2
	check('N2 收起态每列只剩组头：列体不在 DOM 里，列高 = 组头高 + 列边框',
		bodies === 0 && borderOnly,
		`列体节点=${bodies}，列高 ${collapsedCol ? collapsedCol.height.toFixed(1) : '?'}px = 组头高 ${head ? head.height.toFixed(1) : '?'}px + 边框`)
	check('N3 收起确实让这一行明显变短（< 展开态的 60%）',
		expandedRow !== null && collapsedRow !== null && collapsedRow.height < expandedRow.height * 0.6,
		`展开 ${expandedRow ? expandedRow.height.toFixed(1) : '?'}px → 收起 ${collapsedRow ? collapsedRow.height.toFixed(1) : '?'}px`)
}

await browser.close()

// ── 报告 ───────────────────────────────────────────────────────────────────
const width = Math.max(...results.map((r) => r.name.length))
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(width)}  ${r.detail}`)
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过（真实 Chrome 布局；官方样式表提取自实时 bundle：类名前缀 ${P}）`)
process.exit(failed.length === 0 ? 0 : 1)
