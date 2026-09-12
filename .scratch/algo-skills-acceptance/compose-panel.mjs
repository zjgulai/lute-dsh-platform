#!/usr/bin/env node
/**
 * Compose the acceptance render for the 算法技能 settings page.
 *
 * Why this exists: the first acceptance set placed the page in a hand-made
 * `.shell{width:880px}` wrapper. That number was invented. The real settings
 * content column is narrower — the official panel is fixed-width and keeps a
 * nav rail — so the images were taken at a width no user ever sees, and the
 * "no horizontal overflow" check they carried proved nothing about the real
 * page. This script reads the geometry out of the official stylesheet instead
 * of restating it, and fails loudly if a value it depends on disappears.
 *
 * Inputs (all read, none invented):
 *   - dump.json                       real page markup + generated page CSS
 *                                     (produced by tests/zz-dump.spec.tsx)
 *   - ../vendor/.../SettingsRoot.module.css   official panel geometry
 *   - ../vendor/.../ui-theme/src/styles/*.css official theme tokens
 *
 * Output: panel-<theme>-<state>.html — self-contained, openable in a browser.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HARNESS = join(HERE, '..', '..', 'vendor', 'dsh-desktop', 'deepseek-harness')
const SETTINGS_CSS = join(
  HARNESS, 'packages', 'client', 'ui-settings-general', 'src', 'client', 'SettingsRoot.module.css',
)
const THEME_DIR = join(HARNESS, 'packages', 'client', 'ui-theme', 'src', 'styles')

/** Pull one declaration out of a CSS block, or fail with the block's text. */
function decl(css, selector, property) {
  const block = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)
  if (block === null) throw new Error(`official CSS: no ${selector} rule`)
  const found = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+);`).exec(block[1])
  if (found === null) throw new Error(`official CSS: ${selector} has no ${property}`)
  return found[1].trim()
}

/** First pixel number in a declaration, e.g. 'min(800px, ...)' -> 800. */
function px(value, what) {
  const n = /(\d+(?:\.\d+)?)px/.exec(value)
  if (n === null) throw new Error(`official CSS: cannot read a px length from ${what} = ${value}`)
  return Number(n[1])
}

// ---- official geometry -----------------------------------------------------
const settings = readFileSync(SETTINGS_CSS, 'utf8')
const PANEL_W = px(decl(settings, '.panel', 'width'), 'panel width')
const PANEL_RADIUS = px(decl(settings, '.panel', 'border-radius'), 'panel radius')
const NAV_W = px(decl(settings, '.nav', 'width'), 'nav width')
const NAV_PAD = decl(settings, '.nav', 'padding').split(/\s+/)
const HEADER_H = px(decl(settings, '.header', 'height'), 'header height')
const OPTIONS_PAD = decl(settings, '.options', 'padding').split(/\s+/)
// padding shorthand: [top, right, bottom, left] with 3 values -> left = right
const OPTIONS_X = px(OPTIONS_PAD.length === 4 ? OPTIONS_PAD[3] : OPTIONS_PAD[1], 'options side padding')

const CONTENT_W = PANEL_W - NAV_W
const PAGE_W = CONTENT_W - OPTIONS_X * 2

// ---- inputs ----------------------------------------------------------------
const dump = JSON.parse(readFileSync(join(HERE, 'dump.json'), 'utf8'))
const tokens = ['base.css', 'corner-shape.css', 'design-platform.css', 'scrollbar.css']
  .map((f) => readFileSync(join(THEME_DIR, f), 'utf8'))
  .join('\n')

// ---- token coverage --------------------------------------------------------
const defined = new Set([...tokens.matchAll(/--(dsw|ds)-[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]))
const used = new Set([...`${dump.styles}${tokens}`.matchAll(/var\((--(?:dsw|ds)-[a-z0-9-]+)/g)].map((m) => m[1]))
const undefinedTokens = [...used].filter((t) => !defined.has(t)).sort()

// ---- chrome replica --------------------------------------------------------
// Values come from the declarations read above; nothing here is a second copy.
const CHROME_CSS = `
/* Backdrop: the settings shell is a full-viewport layer over the app. */
html,body{margin:0;padding:0;height:100%;}
body{background:var(--dsw-alias-bg-base);font-family:var(--dsw-font-family);}
.overlay{position:fixed;top:22px;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;}
.mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);}
/* Panel (official .panel): fixed ${PANEL_W}px, r${PANEL_RADIUS}. */
.panel{position:relative;z-index:1;display:flex;width:${PANEL_W}px;
  height:min(${PANEL_W}px,calc(100vh - 48px));max-width:calc(100vw - 48px);
  border-radius:${PANEL_RADIUS}px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);
  box-shadow:var(--dsw-elevation-prominent);}
/* Nav rail (official .nav): ${NAV_W}px, pad ${NAV_PAD.join(' ')}. */
.nav{flex:none;display:flex;flex-direction:column;gap:18px;width:${NAV_W}px;
  padding:${NAV_PAD.join(' ')};box-sizing:border-box;}
.navTitle{padding:0 12px;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary);}
.navList{display:flex;flex-direction:column;gap:4px;}
.navCell{display:flex;align-items:center;gap:8px;height:40px;padding:9px 16px 9px 12px;
  box-sizing:border-box;border:none;border-radius:12px;background:transparent;
  font-family:inherit;font-size:14px;line-height:22px;font-weight:400;
  color:var(--dsw-alias-label-primary);text-align:left;}
.navCell.active{background:var(--dsw-specific-sidebar-nav-item-active);}
.navGlyph{flex:none;width:16px;height:16px;border-radius:4px;
  background:var(--dsw-alias-label-tertiary);opacity:.55;}
.navLabel{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.content{flex:1;min-width:0;display:flex;flex-direction:column;}
/* Header (official .header): h${HEADER_H}. */
.header{flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;
  height:${HEADER_H}px;padding:20px 14px 8px 10px;box-sizing:border-box;}
.close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
  padding:0;border:none;border-radius:28px;background:transparent;cursor:pointer;
  color:var(--dsw-alias-label-primary);font-size:14px;line-height:1;}
/* Options (official .options): pad ${OPTIONS_PAD.join(' ')} — the page's real seat.
   Sized to the panel so the image shows the viewport the user scrolls, not the
   whole document. */
.options{flex:1;min-height:0;padding:${OPTIONS_PAD.join(' ')};overflow-y:auto;}
.options.stretch{overflow:visible;height:auto;}
.panel.stretch{height:auto;}
`

/** Nav rows as the settings.section ledger projects them (order ascending). */
const NAV_ROWS = [
  ['通用设置', 'general'],
  ['模型', 'models'],
  ['插件', 'plugins'],
  ['Agent 预设', 'agent-presets'],
  ['出海技能', 'overseas-skills'],
  ['万物互联', 'wanzh-hulian'],
  ['算法技能', 'algo-skills'],
]

const nav = (active) => NAV_ROWS.map(([label, id]) => `
        <button class="navCell${id === active ? ' active' : ''}">
          <span class="navGlyph"></span><span class="navLabel">${label}</span>
        </button>`).join('')

/** One self-contained acceptance page. */
function compose({ state, theme, markup, stretch }) {
  const dark = theme === 'dark'
  const note = `算法技能页 · 真实组件 + 真机 848 KB 负载（4 面 / 12 片 / 50 岗 / 1338 卡）· `
    + `${state} 状态 · 官方 SettingsRoot.module.css 几何（${PANEL_W}px 面板 − ${NAV_W}px 导航 − `
    + `${OPTIONS_X * 2}px 内边距 = 页面实测 ${PAGE_W}px 宽）· 官方主题 token 原样注入`
  return `<!doctype html><html><head><meta charset="utf-8"><title>算法技能 · ${theme} · ${state}</title>
<style>
${tokens}
</style>
<style>
${dump.styles}
</style>
<style>
${CHROME_CSS}
/* Provenance strip. Sits above the panel rather than over it, so the panel is
   never occluded in the captured image. */
.note{position:fixed;left:0;right:0;top:0;height:22px;margin:0;z-index:5;padding:3px 10px;
  box-sizing:border-box;font-size:10.5px;line-height:16px;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary);
  background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l1);}
</style>
</head>
<body${dark ? ' data-ds-dark-theme' : ''}>
<div class="overlay">
  <div class="mask"></div>
  <div class="panel${stretch ? ' stretch' : ''}">
    <nav class="nav">
      <div class="navTitle">设置</div>
      <div class="navList">${nav('algo-skills')}
      </div>
    </nav>
    <div class="content">
      <div class="header"><div></div><button class="close">✕</button></div>
      <div class="options${stretch ? ' stretch' : ''}">${markup}</div>
    </div>
  </div>
</div>
<p class="note">${note}</p>
</body></html>
`
}

const STATES = [
  { state: 'collapsed', key: 'collapsed', stretch: false },
  { state: 'drilled', key: 'drilled', stretch: false },
  { state: 'expanded', key: 'expanded', stretch: true },
]
const written = []
for (const theme of ['light', 'dark']) {
  for (const { state, key, stretch } of STATES) {
    const file = `panel-${theme}-${state}.html`
    writeFileSync(join(HERE, file), compose({ state, theme, markup: dump[key], stretch }))
    written.push(file)
  }
}

console.log(JSON.stringify({
  officialGeometry: { PANEL_W, NAV_W, OPTIONS_X, HEADER_H, PANEL_RADIUS, CONTENT_W, PAGE_W },
  tokenCoverage: { defined: defined.size, used: used.size, undefinedTokens },
  written,
}, null, 2))
if (undefinedTokens.length > 0) {
  console.error(`\nFAIL: page or chrome references ${undefinedTokens.length} token(s) the official sheets do not define.`)
  process.exit(1)
}
