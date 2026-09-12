#!/usr/bin/env node
/**
 * React-reconciliation probe for the split sidebar entry.
 *
 * ## The gap this file closes
 *
 * `scripts/geometry-probe.mjs` measures real boxes in real Chrome, but its
 * fixture is **static HTML**: there is no React in the page, so a re-render can
 * never happen and the entry can never be displaced. The shipped shell, by
 * contrast, renders that exact slot with React and re-renders it constantly.
 *
 * The shared core states the premise plainly — "the row is plain DOM (no React
 * tree) so it can never disturb the shell's reconciliation" — and then leans on
 * a MutationObserver to re-insert the row whenever a re-render moves it. That
 * premise is a claim about **React's reconciler**, and a static fixture cannot
 * test it. Neither can jsdom's *layout* (it has none) — but reconciliation is
 * pure DOM ordering, which jsdom models exactly.
 *
 * So this probe puts the real core inside a real React 18 tree that reproduces
 * the shell's own children array, read from the shipped bundle rather than
 * retyped:
 *
 * ```
 * div.root > [ div.logoRow, Tooltip, div.regionArea, div.footArea ]
 * ```
 *
 * Two facts about that array drive every scenario below, and both come from the
 * bundle, not from assumption:
 *
 *  1. `Tooltip` returns `jsxs(Fragment, { children: [cloneElement(children), pos
 *     !== null && jsx("span", …)] })` — **no DOM wrapper**. That is what makes
 *     the official button a *direct* child of `root` (so the split geometry's
 *     negative-margin trick has nothing to straddle) and it is also what makes
 *     the tooltip bubble a **transient sibling wedged between the button and
 *     our entry** every time the user hovers.
 *  2. React owns `root`'s children and inserts new nodes with `insertBefore`
 *     against its *own* next host sibling — which is never our entry. Whether a
 *     React insertion lands before or after the entry is therefore a real
 *     question with a real failure mode, not a theoretical one.
 *
 * ## What it asserts, and what it deliberately does not
 *
 * Asserted here: DOM adjacency (`entry.previousElementSibling === button`),
 * containment, `dataset.split`, and survival across React operations.
 * NOT asserted here: any pixel measurement — jsdom performs no layout, so every
 * box is zero. Geometry belongs to `geometry-probe.mjs` (real Chrome). The two
 * probes are complements, and neither substitutes for the other.
 *
 * ## Instrument self-check
 *
 * Every healing assertion is paired with a synchronous look **before** the
 * observer can run, asserting the displacement actually happened. Without that,
 * a scenario where React never displaces the entry would report a green
 * "self-healed" for a hazard that does not exist — the failure mode this
 * repository has already been bitten by twice.
 *
 * Usage: `node scripts/reconcile-probe.mjs`
 * Exit code: 0 = all assertions pass; 1 = at least one failed; 2 = precondition
 * missing (missing bundle/React/jsdom) — never a silent skip to green.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP_UNPACKED = '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked'
const SIDEBAR_BUNDLE = join(
  APP_UNPACKED, 'node_modules', '@deepseek-ai', 'dsh-client-ui-sidebar', 'lib', 'client.js',
)
const PRIMITIVES_BUNDLE = join(
  APP_UNPACKED, 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js',
)

const nodeRequire = createRequire(import.meta.url)

/** Fail loudly on a missing precondition instead of degrading to a green run. */
function require_(condition, message) {
  if (!condition) {
    console.error(`reconcile-probe: ${message}`)
    process.exit(2)
  }
}

require_(existsSync(SIDEBAR_BUNDLE), `找不到官方侧边栏 bundle：${SIDEBAR_BUNDLE}（DSH Desktop 未安装？）`)

/* ── Facts read out of the shipped bundles ─────────────────────────────────── */

/**
 * Resolve the shell's CSS-module prefix from its shipped stylesheet.
 * ADR-0019: the hash is resolved at run time and never pinned in source.
 */
function readShellPrefix() {
  const source = readFileSync(SIDEBAR_BUNDLE, 'utf8')
  const match = /"(\.x-[A-Za-z0-9_-]+_root\{[^"]*)"/.exec(source)
  require_(match !== null, '在官方 bundle 里定位不到侧边栏样式表（提取方式已失效）')
  const prefixMatch = /(x-[A-Za-z0-9_-]+)_root\s*\{/.exec(match[1].replace(/\\"/g, '"'))
  require_(prefixMatch !== null, '解析不出类名前缀（样式表形状已变，提取方式需更新）')
  return prefixMatch[1]
}

/**
 * Confirm the two bundle facts this probe's model depends on, so that a future
 * shell which adds a Tooltip wrapper (or stops cloning the anchor) fails here
 * with a pointed message instead of silently invalidating every scenario.
 */
function assertBundleShape() {
  const sidebar = readFileSync(SIDEBAR_BUNDLE, 'utf8')
  require_(
    /className:\s*SidebarRoot_module_css_default\.newSession\b/.test(sidebar),
    '官方 bundle 里找不到 newSession 按钮的渲染点（结构已变，本探针的模型需重建）',
  )
  require_(
    /className:\s*SidebarRoot_module_css_default\.regionArea\b/.test(sidebar),
    '官方 bundle 里找不到 regionArea 的渲染点（结构已变）',
  )
  const primitives = readFileSync(PRIMITIVES_BUNDLE, 'utf8')
  const tooltipReturn = /return jsxs\(Fragment, \{\s*children: \[cloneElement\(children, \{/.exec(primitives)
  require_(
    tooltipReturn !== null,
    'Tooltip 的返回式不再是「Fragment + cloneElement」——它可能已经加了 DOM 包装层，'
    + '那会改变官方按钮的父节点，split 几何的前提需重新取证',
  )
  require_(
    /pos !== null && jsx\("span"/.test(primitives),
    'Tooltip 不再把气泡渲染成锚点的**瞬态兄弟节点**——本探针的 S1 场景（气泡挤位）前提已不成立',
  )
  return { tooltipClonesAnchor: true, tooltipBubbleIsSibling: true }
}

const P = readShellPrefix()
const bundleShape = assertBundleShape()

/* ── Load the shared core under test ───────────────────────────────────────── */

/** Transpile the shared entry core to CJS and evaluate it in this process. */
function loadCore() {
  const tsPath = join(PACKAGE_ROOT, 'node_modules', 'typescript')
  require_(existsSync(tsPath), '找不到 typescript（先在该包内跑 pnpm install）')
  const ts = nodeRequire(tsPath)
  const source = readFileSync(join(PACKAGE_ROOT, 'src', 'client', 'sidebar-entry-core.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: 'sidebar-entry-core.ts',
  })
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func -- the core is a dependency-free module; this is the whole loader.
  new Function('exports', 'module', 'require', outputText)(module.exports, module, require_)
  return module.exports
}

/* ── Environment: jsdom with the shipped stylesheet ────────────────────────── */

const jsdomPath = join(PACKAGE_ROOT, 'node_modules', 'jsdom')
require_(existsSync(jsdomPath), '找不到 jsdom（先在该包内跑 pnpm install）')
const { JSDOM } = nodeRequire(jsdomPath)

const shellCss = (() => {
  const source = readFileSync(SIDEBAR_BUNDLE, 'utf8')
  const match = /"(\.x-[A-Za-z0-9_-]+_root\{[^"]*)"/.exec(source)
  return match[1].replace(/\\"/g, '"')
})()

/**
 * Collect every uncaught error jsdom reports for the lifetime of the run.
 *
 * A plugin that throws from inside a MutationObserver callback is a defect in
 * its own right, independent of whether the row ends up placed: the exception
 * escapes into the host page, abandons the rest of that observer's work, and
 * shows up as a console error the user cannot act on. Without this collector
 * such a throw terminates the probe with a stack trace instead of a named
 * failure — which is how the `sidebarRoot()` null bug first surfaced here.
 */
const uncaught = []
const virtualConsole = new (nodeRequire(join(PACKAGE_ROOT, 'node_modules', 'jsdom')).VirtualConsole)()
virtualConsole.on('jsdomError', (error) => { uncaught.push(error) })
virtualConsole.on('error', (message) => { uncaught.push(new Error(String(message))) })

const dom = new JSDOM(
  `<!doctype html><html><head><style>${shellCss}</style></head><body><div id="host" data-pane="sidebar"></div></body></html>`,
  { pretendToBeVisual: true, virtualConsole },
)
const { window } = dom

/**
 * Publish a jsdom global onto `globalThis`. Modern Node exposes several of
 * these (notably `navigator`) as getter-only accessors, so a plain assignment
 * throws — define the property instead, and tolerate a non-configurable one by
 * keeping Node's own value.
 */
function installGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
  } catch {
    /* non-configurable in this Node build; the built-in stays, which is fine
       as long as it is present (`navigator.userAgent` is all React reads). */
  }
}

installGlobal('window', window)
installGlobal('document', window.document)
installGlobal('navigator', window.navigator)
installGlobal('MutationObserver', window.MutationObserver)
installGlobal('HTMLElement', window.HTMLElement)
installGlobal('Element', window.Element)
installGlobal('Node', window.Node)
installGlobal('getComputedStyle', window.getComputedStyle.bind(window))
installGlobal('requestAnimationFrame', window.requestAnimationFrame.bind(window))
installGlobal('cancelAnimationFrame', window.cancelAnimationFrame.bind(window))
installGlobal('IS_REACT_ACT_ENVIRONMENT', false)

/**
 * jsdom performs no layout, and the core's split geometry keys on the official
 * button's rendered width. Supply the two widths the shell actually produces
 * (252px expanded — measured in real Chrome by geometry-probe — and 36px on the
 * collapsed rail) so the core takes its real branches. Only the width/height
 * the core reads is faked; DOM ordering, which is what this probe is about, is
 * jsdom's own.
 */
const COLLAPSED_MAX = 60
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  const isButton = this.tagName === 'BUTTON' && /newSession/.test(this.className ?? '')
  const root = this.ownerDocument?.querySelector(`.${P}_root`)
  const collapsed = root !== null && root !== undefined && root.classList.contains(`${P}_collapsed`)
  const width = isButton ? (collapsed ? 36 : 252) : 0
  const height = isButton ? 38 : 0
  return {
    x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height,
    toJSON: () => ({}),
  }
}

/** Minimal ResizeObserver stub: the core only needs observe/disconnect, plus a
 * hook to fire the callback so the collapse path can be driven deterministically. */
const resizeCallbacks = new Set()
class ResizeObserverStub {
  constructor(callback) { this.callback = callback }
  observe() { resizeCallbacks.add(this.callback) }
  disconnect() { resizeCallbacks.delete(this.callback) }
  unobserve() { resizeCallbacks.delete(this.callback) }
}
globalThis.ResizeObserver = ResizeObserverStub
window.ResizeObserver = ResizeObserverStub

const React = nodeRequire(join(PACKAGE_ROOT, 'node_modules', 'react'))
const ReactDOMClient = nodeRequire(join(PACKAGE_ROOT, 'node_modules', 'react-dom', 'client'))
const { flushSync } = nodeRequire(join(PACKAGE_ROOT, 'node_modules', 'react-dom'))
const core = loadCore()

/* ── The shell, reproduced from the bundle's own children array ────────────── */

/**
 * Faithful stand-in for the shipped `Tooltip`.
 *
 * Mirrors the real return: a Fragment whose first child is the **cloned anchor**
 * (same node type — React keeps the button's identity) and whose second child is
 * a `<span>` bubble rendered **only while shown**, i.e. a sibling inserted
 * directly between the button and whatever follows it.
 */
function Tooltip({ label, shown, children }) {
  return React.createElement(
    React.Fragment,
    null,
    React.cloneElement(children, { title: shown ? label : undefined }),
    shown ? React.createElement('span', { className: 'probe-tooltip-bubble' }, label) : null,
  )
}

/** `div.root > [logoRow, Tooltip>button.newSession, regionArea, footArea]`. */
function Sidebar({ collapsed, tooltipShown, buttonKey, extraSlot }) {
  return React.createElement(
    'div',
    { className: collapsed ? `${P}_root ${P}_collapsed` : `${P}_root` },
    React.createElement('div', { className: `${P}_logoRow` }),
    React.createElement(
      Tooltip,
      { label: '新会话', shown: tooltipShown },
      React.createElement(
        'button',
        { key: buttonKey, type: 'button', className: `${P}_newSession` },
        React.createElement('span', { className: `${P}_newSessionLabel` }, '新会话'),
      ),
    ),
    extraSlot ? React.createElement('div', { className: 'probe-extra-slot' }) : null,
    React.createElement('div', { className: `${P}_regionArea` }),
    React.createElement('div', { className: `${P}_footArea` }),
  )
}

const host = document.getElementById('host')
const root = ReactDOMClient.createRoot(host)

/** Latest props, so a scenario can re-render without restating the tree. */
let props = { collapsed: false, tooltipShown: false, buttonKey: 'k0', extraSlot: false }
const render = (next = {}) => {
  props = { ...props, ...next }
  flushSync(() => root.render(React.createElement(Sidebar, props)))
}

/* ── Assertion bookkeeping ─────────────────────────────────────────────────── */

const results = []
/** Record one assertion. */
function check(name, ok, detail) {
  results.push({ name, ok, detail })
}

/** Let the core's MutationObserver microtask run (and one rAF, for good measure). */
const settle = async () => {
  await Promise.resolve()
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
  await Promise.resolve()
}

const entryEl = () => document.querySelector('[data-dsh-newapp-entry]')
const buttonEl = () => document.querySelector(`.${P}_newSession`)
const adjacent = () => {
  const entry = entryEl()
  const button = buttonEl()
  return entry !== null && button !== null && entry.previousElementSibling === button
}

const ENTRY_OPTIONS = {
  rowAttribute: 'data-dsh-newapp-entry',
  rowSelector: '[data-dsh-newapp-entry]',
  plugin: 'newapp-local',
  icon: '<svg viewBox="0 0 16 16"><rect width="12" height="12"/></svg>',
  css: { entry: 'entry', entryIcon: 'entryIcon', entryLabel: 'entryLabel' },
  label: () => '新应用',
  onToggle: () => {},
  position: 'split',
  familySelectors: ['[data-dsh-newapp-entry]'],
}

/* ── Scenarios ─────────────────────────────────────────────────────────────── */

/**
 * Every scenario runs inside one guarded block. If the code under test throws
 * synchronously, the suite must still reach its report: a probe that dies with a
 * stack trace instead of naming which contract broke turns a defect into a
 * debugging session. (That is not hypothetical — the `sidebarRoot()` null bug
 * first showed up here as a bare TypeError and nothing else.) Async throws —
 * the observer callback — are caught by the virtual console and asserted in S8.
 */
try {
  /* ── S0 · mount ────────────────────────────────────────────────────────────── */

  render()
  const dispose = core.mountSidebarEntry(ENTRY_OPTIONS)
  await settle()

  /**
   * Hard precondition, not a recorded assertion. The core resolves the sidebar
   * through the shell's own pane marker (`[data-pane="sidebar"]`) and then through
   * the logo row's parent; if this environment does not reproduce that, the entry
   * never mounts at all and **every** scenario below would be measuring an empty
   * stage. The first draft of this probe shipped a host without the marker and
   * reported a vanishing entry — a fabricated defect caused entirely by a fixture
   * that failed to fail loudly. Exit 2 instead.
   */
  require_(
    entryEl() !== null,
    '入口没有挂载：本环境没有复现出 shell 的侧边栏骨架（root 由 [data-pane="sidebar"] → logoRow 父节点解析而来）',
  )

  check('S0 入口已挂载到 root 内', entryEl().parentElement === root_el(), '')
  function root_el() { return document.querySelector(`.${P}_root`) }
  check('S0 入口是官方按钮的紧邻下一兄弟', adjacent(), '')
  check('S0 展开态下 data-split="expanded"', entryEl()?.dataset.split === 'expanded',
    `dataset.split=${entryEl()?.dataset.split}`)

  /* ── S1 · a transient React sibling appears in the entry's slot ─────────────── */
  //
  // This scenario was written expecting the tooltip bubble to wedge itself
  // *between* the button and the entry, displacing the entry — and the instrument
  // check below was written to prove that displacement before trusting the heal.
  // The instrument check **falsified the premise**: React inserts a new node with
  // `insertBefore(parent, node, getHostSibling(fiber))`, and the bubble's next
  // host sibling is the Fragment's follower — `regionArea` — so the bubble lands
  // *after* the entry, leaving it adjacent. The expectation was wrong, not the
  // core. Both facts are now pinned as assertions, because the day React's
  // insertion reference starts landing ahead of a foreign node, this is the
  // assertion that will say so.

  render({ tooltipShown: true })
  const bubble = document.querySelector('.probe-tooltip-bubble')
  check('S1【仪器】气泡确实渲染进了 root（React 会往入口所在的这一槽插节点）',
    bubble !== null && bubble.parentElement === root_el(),
    bubble === null ? '气泡没渲染出来，本场景将变成空转' : `气泡父节点 = ${bubble.parentElement?.className}`)
  check('S1 气泡没有挤开入口（React 的插入参照是它自己的下一个兄弟，不是我们的入口）', adjacent(),
    `入口前一个兄弟 = ${entryEl()?.previousElementSibling?.className}`)
  check('S1 气泡落在入口**之后**（实测次序，不是设想）',
    bubble !== null && bubble.compareDocumentPosition(entryEl()) & window.Node.DOCUMENT_POSITION_PRECEDING,
    bubble === null ? '' : `气泡前一个兄弟 = ${bubble.previousElementSibling?.className}`)

  await settle()
  check('S1 自愈后入口仍紧贴官方按钮', adjacent(),
    `前一个兄弟 = ${entryEl()?.previousElementSibling?.className}`)
  check('S1 自愈没有删掉 React 的气泡节点', document.querySelector('.probe-tooltip-bubble') !== null, '')
  check('S1 入口仍在 root 内', entryEl()?.parentElement === root_el(), '')

  /* ── S2 · bubble goes away again ───────────────────────────────────────────── */

  render({ tooltipShown: false })
  await settle()
  check('S2 气泡消失后入口仍紧贴官方按钮', adjacent(), '')
  check('S2 气泡节点已被 React 收回', document.querySelector('.probe-tooltip-bubble') === null, '')

  /* ── S3 · React replaces the button node itself ────────────────────────────── */
  //
  // This is the scenario that genuinely displaces the entry: React mounts a new
  // button with `insertBefore(root, newButton, regionArea)`, which — because our
  // entry sits in that gap — lands *behind* it. Asserted synchronously, before the
  // observer's microtask can heal, so the healing is measured rather than assumed.

  const beforeButton = buttonEl()
  render({ buttonKey: 'k1' })
  const afterButton = buttonEl()
  check('S3【仪器】官方按钮节点确实被 React 换掉了', beforeButton !== afterButton,
    beforeButton === afterButton ? 'key 没换掉节点，本场景将变成空转' : '')
  check('S3【仪器】换节点确实把入口挤到了按钮**之前**（修复前必须先是坏的）', !adjacent(),
    adjacent() ? '没有发生位移——自愈断言将是空转' : `入口前一个兄弟 = ${entryEl()?.previousElementSibling?.className}`)
  await settle()
  check('S3 自愈后入口重新紧贴**新**按钮', adjacent() && entryEl().previousElementSibling === afterButton, '')
  check('S3 新按钮上的内联宽度已重新施加', afterButton.style.width !== '', `width="${afterButton.style.width}"`)

  /* ── S4 · React inserts a brand-new slot ahead of regionArea ───────────────── */

  render({ extraSlot: true })
  await settle()
  const slot = document.querySelector('.probe-extra-slot')
  check('S4 新插槽已渲染', slot !== null, '')
  check('S4 入口仍紧贴官方按钮（React 的插入没有把它挤走）', adjacent(),
    `入口前一个兄弟 = ${entryEl()?.previousElementSibling?.className}`)
  check('S4 入口仍排在 regionArea 之前',
    entryEl() !== null
    && (entryEl().compareDocumentPosition(document.querySelector(`.${P}_regionArea`))
        & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    entryEl() === null ? '入口不在文档里' : '')

  /* ── S5 · collapse the rail ────────────────────────────────────────────────── */

  render({ collapsed: true })
  for (const callback of resizeCallbacks) callback([], {})
  await settle()
  check('S5 收起态 data-split="collapsed"', entryEl()?.dataset.split === 'collapsed',
    `dataset.split=${entryEl()?.dataset.split}`)
  check('S5 收起态入口仍紧贴官方按钮', adjacent(), '')
  check('S5 收起态官方按钮的内联宽度已撤回', buttonEl().style.width === '',
    `width="${buttonEl().style.width}"`)

  render({ collapsed: false })
  for (const callback of resizeCallbacks) callback([], {})
  await settle()
  check('S5 展开回来 data-split="expanded"', entryEl()?.dataset.split === 'expanded',
    `dataset.split=${entryEl()?.dataset.split}`)

  /* ── S6 · whole-tree teardown and remount ──────────────────────────────────── */

  root.unmount()
  await settle()
  check('S6 React 卸载整棵树后入口不再留在文档里', !document.body.contains(entryEl()),
    entryEl() === null ? '' : '入口仍挂在文档上（游离节点）')

  const root2 = ReactDOMClient.createRoot(host)
  flushSync(() => root2.render(React.createElement(Sidebar, { collapsed: false, tooltipShown: false, buttonKey: 'k2', extraSlot: false })))
  await settle()
  check('S6 新树挂载后入口被重新放置', document.body.contains(entryEl()), '')
  check('S6 重新放置后仍紧贴官方按钮', adjacent(), '')

  /* ── S7 · disposer restores the shell ──────────────────────────────────────── */

  const finalButton = buttonEl()
  dispose()
  check('S7 卸载后官方按钮的内联宽度已还原', finalButton.style.width === '',
    `width="${finalButton.style.width}"`)
  check('S7 卸载后入口行已移除', entryEl() === null, '')

  await new Promise((resolve) => setTimeout(resolve, 0))
  check('S7 卸载后观察者不再重新插入入口', entryEl() === null,
    entryEl() === null ? '' : '卸载后入口又冒出来了（观察者没断开）')

  /* ── S8 · the plugin never throws into the host page ───────────────────────── */

  check('S8 全程没有未捕获异常逃进宿主页面', uncaught.length === 0,
    uncaught.length === 0 ? '' : uncaught.map((e) => String(e.message ?? e).split('\n')[0]).join(' ｜ '))

} catch (error) {
  check('场景执行期间没有同步抛出异常', false, String(error && error.message ? error.message : error))
}

/* ── Report ────────────────────────────────────────────────────────────────── */

const width = Math.max(...results.map((r) => r.name.length))
for (const r of results) {
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(width)}  ${r.detail}`)
}
const failed = results.filter((r) => !r.ok)
console.log(
  `\n${results.length - failed.length}/${results.length} 项通过`
  + `（真实 React ${React.version} 环境，侧边栏结构取自 shipped bundle：类名前缀 ${P}；`
  + `已核对 Tooltip 无 DOM 包装 = ${bundleShape.tooltipClonesAnchor}、气泡为瞬态兄弟 = ${bundleShape.tooltipBubbleIsSibling}）`,
)
process.exit(failed.length === 0 ? 0 : 1)
