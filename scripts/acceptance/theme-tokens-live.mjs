#!/usr/bin/env node
/**
 * 主题 Token 的**真实解析**验收（C2 第二条验收：「浅色深色双主题回归」）。
 *
 * ## 为什么需要它
 *
 * `scripts/gates/theme-tokens.mjs` 能发现「引用了从没被定义过的 token」，但它的
 * 「已定义」集合是一次**静态文本提取**（对应用目录 grep 出 `--dsw-x:`）。静态提取
 * 有两个自己看不见的失败模式：
 *
 *   1. **假阳性**：提取口径比真实级联宽——某个名字在源码里出现过、但在 CSS 级联里
 *      永远不生效（被后写的规则覆盖、在未生效的媒体查询里、写在了不匹配的选择器下）。
 *      门禁会判它「已定义」，而页面里它依旧走字面兜底。
 *   2. **假阴性**：token 由运行时计算注入（本仓库的 `dsh-theme-local` 就是这种供给形态），
 *      静态提取读不到就全判成幻觉 token。
 *
 * 假阳性会训练人忽略输出（真正的违规藏进噪音），假阴性会让人去「修」根本没坏的东西。
 * 所以「已定义」这件事必须由**真正的 CSS 引擎**回答一次，再和门禁的判据对照。
 *
 * ## 这个探针做什么
 *
 * 1. 逐字取出**应用产物里**的主题样式表（`dsh-client-ui-theme/lib/client.js` 内的
 *    CSS 字符串），**一个字都不重写**——手抄一份主题就等于在测自己的假设。
 * 2. 起真实 Chromium，用**外壳自己的切主题方式**（`document.body.toggleAttribute(
 *    'data-ds-dark-theme', …)`，与 `dsh-client-ui-theme/lib/index.js:46` 逐字一致）
 *    在浅/深两态各测一遍。
 * 3. 对每个**受管包引用到**的 token 记录：`var()` 是否解析成功、解析成了什么颜色。
 * 4. 与门禁的判据逐条对照，把分歧按「门禁假阳性 / 门禁假阴性」分别点名。
 *
 * ## 仪器自检（没有它这片输出不可信）
 *
 * 「`var()` 没解析出来」必须能和「我的测量方法本身就不成立」区分开，所以每轮都带
 * 一对**对照**：正控（`--dsw-alias-bg-layer-1`，必须解析成功）与负控（一个必定不存在
 * 的名字，必须解析为空），再加一条「切到深色后主题确实变了」的检查。任何一条对照
 * 不成立就 **exit 2**，绝不在仪器坏掉的情况下产出一片绿色。
 *
 * ## 边界（诚实地写清楚）
 *
 * 本探针**不打开** `http://127.0.0.1:43120` 的实况 GUI：那条路实测返回 401（浏览器
 * 信任栅栏要求已配对设备的凭证），要打开就得先在用户正在运行的实例上完成一次配对，
 * 那是对用户环境的侵入。本探针因此测的是「**产物里的样式表在真实 CSS 引擎下如何解析**」，
 * 而不是「实况页面此刻长什么样」。后者要等重启后的 C4 环节。
 *
 * 用法：`node scripts/acceptance/theme-tokens-live.mjs [--out <dir>]`
 * 退出码：0 = 全部分歧已解释；1 = 存在无法解释的分歧；2 = 前置条件或仪器不可用。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectDefinedTokens, collectReferencedTokens, collectRepoDefinedTokens } from '../gates/theme-tokens.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APP_DIR = '/Applications/DSH Desktop.app'
const THEME_BUNDLE = join(
  APP_DIR, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules',
  '@deepseek-ai', 'dsh-client-ui-theme', 'lib', 'client.js',
)
const BASELINE = join(REPO_ROOT, 'scripts', 'gates', 'theme-tokens-baseline.json')

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const OUT_DIR = resolve(argValue('--out', join(REPO_ROOT, '.scratch/dsh-worktable-fusion/acceptance')))

/** 前置条件缺失时响亮退出，绝不降级成「跳过 = 通过」（A5 的纪律）。 */
function require_(condition, message) {
  if (!condition) {
    console.error(`[theme-live] 前置条件缺失：${message}`)
    process.exit(2)
  }
}

require_(existsSync(THEME_BUNDLE), `读不到官方主题包：${THEME_BUNDLE}（DSH Desktop 未安装？）`)

/**
 * 逐字取出产物内的主题样式表。
 *
 * 形态：bundle 把每个 CSS 模块编译成 `var <name>_css_default = "<转义后的 CSS>"`。
 * 这里不按变量名匹配（那会随打包器改命名而静默失效），而是**解析每一个字符串字面量**、
 * 留下含 `--dsw-` 且含 `{` 的那些——只认内容，不认名字。
 * @returns {{css: string, blobCount: number, defined: Set<string>}} 样式表与其中的定义
 */
function extractThemeCss() {
  const source = readFileSync(THEME_BUNDLE, 'utf8')
  const blobs = []
  for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    let value
    try {
      value = JSON.parse(match[0])
    } catch {
      continue // 不是合法字符串字面量（或在转义边界上），跳过
    }
    if (value.includes('--dsw-') && value.includes('{')) blobs.push(value)
  }
  const css = blobs.join('\n')
  const defined = new Set([...css.matchAll(/--dsw-[a-z0-9-]*[a-z0-9]:/g)].map((m) => m[0].slice(0, -1)))
  return { css, blobCount: blobs.length, defined }
}

const { css: themeCss, blobCount, defined: cssDefined } = extractThemeCss()
require_(blobCount > 0, '产物里一段主题样式表都没提出来（打包形态已变，提取方式需更新）')
require_(cssDefined.size > 100, `只提到 ${cssDefined.size} 个 token，远少于预期——提取方式已失效`)
require_(themeCss.includes('data-ds-dark-theme'), '取出的样式表里没有 `body[data-ds-dark-theme]` 深色规则')

// ── 受管包引用到的 token：与门禁同一份收集器（不抄第二份实现，ADR-0009） ──────
const referenced = collectReferencedTokens(REPO_ROOT)
require_(referenced.size > 0, '受管包里一个 --dsw-* 引用都没扫到——收集器失效，本探针会空转')
const tokens = [...referenced.keys()].sort()

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const baselineTokens = new Set(baseline.map((row) => row.token))

// 门禁眼中的「已定义」有两个来源，必须分开验——它们的失效方式不一样：
//   ① 官方 CSS 声明   → 真实引擎解析得到吗？（下面用浏览器验）
//   ② 本仓库主题插件的 JS 供给 → 构建函数真的会把它发出来吗？（下面用真函数跑）
const officialDefined = collectDefinedTokens(APP_DIR)
const repoDefined = collectRepoDefinedTokens(REPO_ROOT)
const gateDefined = new Set([...officialDefined, ...repoDefined])
require_(officialDefined.size > 100, `门禁口径只认 ${officialDefined.size} 个官方 token——门禁侧提取已失效`)
require_(repoDefined.size > 0, '本仓库一个供给 token 都没扫到——门禁侧提取已失效')

const THEME_PKG = join(REPO_ROOT, 'packages', 'platform', 'dsh-theme-local')

/**
 * 把「本仓库主题插件会供给哪些 token」从**静态字面量**变成**真实调用结果**。
 *
 * 门禁的判据是「`"--dsw-x":` 这个字面量在 src 里出现过」。但那和「构建函数真的会把
 * `--dsw-x` 放进返回的映射里」是两件事：写在永不进入的分支里、或被后面的展开覆盖掉，
 * 正则照样命中、门禁照样判已定义，页面里却依旧走字面兜底——正是本项要抓的假阳性。
 *
 * 这里不重写实现：直接把仓库自己的 `buildThemeTokenOverrides` 拿来跑（该模块只有
 * `import type`，转译后无运行时依赖）。转译用包内自带的 typescript，不为探针引新依赖。
 * @returns {Set<string>} 真实会被供给的 token 名
 */
function repoSuppliedTokens() {
  const tsPath = join(THEME_PKG, 'node_modules', 'typescript')
  require_(existsSync(tsPath), `找不到 typescript：${tsPath}（先在 dsh-theme-local 内 pnpm install）`)
  const ts = createRequire(import.meta.url)(tsPath)
  const load = (file) => {
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: file,
    })
    const module = { exports: {} }
    const deny = () => { throw new Error(`${file} 在运行时 require 了别的模块（本应只有 import type）`) }
    new Function('exports', 'require', 'module', outputText)(module.exports, deny, module)
    return module.exports
  }
  const settings = load(join(THEME_PKG, 'src', 'theme-settings.ts'))
  const tokens = load(join(THEME_PKG, 'src', 'client', 'theme-tokens.ts'))
  require_(typeof tokens.buildThemeTokenOverrides === 'function', 'theme-tokens.ts 里没有 buildThemeTokenOverrides（实现已改名）')
  require_(settings.DEFAULT_THEME_STUDIO_SETTINGS !== undefined, 'theme-settings.ts 里没有 DEFAULT_THEME_STUDIO_SETTINGS（实现已改名）')
  const overrides = tokens.buildThemeTokenOverrides(settings.DEFAULT_THEME_STUDIO_SETTINGS)
  const emitted = new Set(Object.keys(overrides))
  require_(emitted.size > 0, 'buildThemeTokenOverrides 用默认设置返回了空映射——供给方已失效')
  return emitted
}

const repoSupplied = repoSuppliedTokens()

// ── 真实浏览器 ────────────────────────────────────────────────────────────────
const requireFromBrowserPkg = createRequire(
  join(REPO_ROOT, 'packages/capabilities/dsh-browser-local/package.json'),
)
let chromium
try {
  ({ chromium } = requireFromBrowserPkg('playwright-core'))
} catch (error) {
  require_(false, `导入 playwright-core 失败：${error.message}（先在该包内 pnpm install）`)
}

const pageHtml = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>${themeCss}</style>
</head><body><div id="host" style="position:absolute;left:-9999px;top:0"></div></body></html>`

let usedChannel = 'chrome'
const browser = await chromium.launch({ channel: 'chrome' }).catch(async (error) => {
  usedChannel = 'bundled'
  console.warn(`[theme-live] channel=chrome 起不来（${error.message.split('\n')[0]}），退回 playwright 自带 chromium`)
  return chromium.launch()
})
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
const consoleLines = []
page.on('pageerror', (error) => consoleLines.push(`pageerror: ${error.message}`))
await page.setContent(pageHtml, { waitUntil: 'load' })

/**
 * 在同一页里测一遍全部 token。
 *
 * `exists` 与 `color` 是**两个不同的问题**，分开测：
 *   - exists：`--probe: var(--tok)` —— 问「这个名字在级联里有没有值」。
 *   - color：`background-color: var(--tok)` —— 问「拿它当颜色用，解析成什么」。
 *     未定义时该声明在计算值阶段失效，背景回落到初值 `rgba(0, 0, 0, 0)`。
 * @param dark 是否切到深色（用外壳自己的 toggleAttribute 方式）
 * @returns 每个 token 的两项测量
 */
async function measure(dark) {
  return page.evaluate(({ dark, tokens }) => {
    // 与 dsh-client-ui-theme/lib/index.js:46 逐字一致：外壳就是这么切的。
    document.body.toggleAttribute('data-ds-dark-theme', dark)
    const host = document.getElementById('host')
    const probe = document.createElement('div')
    host.appendChild(probe)
    const read = (token) => {
      probe.style.setProperty('--tll', `var(${token})`)
      const value = getComputedStyle(probe).getPropertyValue('--tll').trim()
      probe.style.removeProperty('--tll')
      return value
    }
    const readColor = (token) => {
      probe.style.setProperty('background-color', `var(${token})`)
      const value = getComputedStyle(probe).backgroundColor
      probe.style.removeProperty('background-color')
      return value
    }
    const control = { exists: read('--dsw-alias-bg-layer-1'), color: readColor('--dsw-alias-bg-layer-1') }
    const absent = { exists: read('--dsw-alias-zzz-not-a-real-token'), color: readColor('--dsw-alias-zzz-not-a-real-token') }
    const out = {}
    for (const token of tokens) out[token] = { exists: read(token), color: readColor(token) }
    return { control, absent, out }
  }, { dark, tokens })
}

const light = await measure(false)
const dark = await measure(true)

// ── 仪器自检：对照不成立就绝不出结果 ──────────────────────────────────────────
const instrument = []
const instrumentOk = (name, ok, detail) => instrument.push({ name, ok, detail })
instrumentOk('正控解析成功', light.control.exists !== '', `--dsw-alias-bg-layer-1 → ${JSON.stringify(light.control.exists)}`)
instrumentOk('正控颜色可用', light.control.color === 'rgb(255, 255, 255)' || light.control.color !== 'rgba(0, 0, 0, 0)',
  `--dsw-alias-bg-layer-1 背景 → ${light.control.color}`)
instrumentOk('负控解析为空', light.absent.exists === '', `不存在的名字 → ${JSON.stringify(light.absent.exists)}`)
instrumentOk('负控颜色回落初值', light.absent.color === 'rgba(0, 0, 0, 0)', `不存在的名字背景 → ${light.absent.color}`)
instrumentOk('切主题确实生效', light.out['--dsw-alias-bg-base']?.color !== dark.out['--dsw-alias-bg-base']?.color,
  `--dsw-alias-bg-base 浅 ${light.out['--dsw-alias-bg-base']?.color} / 深 ${dark.out['--dsw-alias-bg-base']?.color}`)

const brokenInstrument = instrument.filter((row) => !row.ok)
if (brokenInstrument.length > 0) {
  console.error('[theme-live] 仪器自检未通过，本探针的测量结果不可信，不出结论：')
  for (const row of brokenInstrument) console.error(`  ✗ ${row.name}：${row.detail}`)
  await browser.close()
  process.exit(2)
}

// ── 逐条对照 ──────────────────────────────────────────────────────────────────
/**
 * 门禁对某个 token 的判据，以及这个判据该由哪一路来证伪。
 *
 * 关键点：**「门禁说已定义」有两种理由，要用两种不同的方法验**。官方 CSS 声明的
 * 用浏览器解析验；本仓库 JS 供给的用真函数跑一遍验。混成一条会把「自家供给」全判成
 * 门禁假阳性——那正是**假阳性**：它训练人忽略输出，真正的违规就藏进噪音里。
 */
function classify(token) {
  const official = officialDefined.has(token)
  const repo = repoDefined.has(token)
  const live = light.out[token].exists !== '' || dark.out[token].exists !== ''
  const supplied = repoSupplied.has(token)

  if (official) {
    return live ? 'agree-official' : 'gate-false-positive-official'
  }
  if (repo) {
    return supplied ? 'agree-repo' : 'gate-false-positive-repo'
  }
  return live || supplied ? 'gate-false-negative' : 'agree-absent'
}

const rows = []
for (const token of tokens) {
  const liveLight = light.out[token].exists !== ''
  const liveDark = dark.out[token].exists !== ''
  // 「解析成功」和「在这一态里真的产生了一个面」是两件事：浅色主题的 bg-base / layer-1 /
  // layer-2 / layer-3 全部解析成同一个白（官方静态色阶如此），所以一个只靠底色定义的
  // 药丸在浅色下**与抽屉底色完全同色**——token 没写错，但这一态里它什么都没表达。
  // 这正是「幻觉 token」那一类静默失败的同族问题，必须让它出现在报告里而不是靠肉眼。
  const surfaceLight = light.control.color
  const surfaceDark = dark.control.color
  rows.push({
    token,
    verdict: classify(token),
    official: officialDefined.has(token),
    repo: repoDefined.has(token),
    baselined: baselineTokens.has(token),
    live: liveLight || liveDark,
    supplied: repoSupplied.has(token),
    followTheme: light.out[token].color !== dark.out[token].color
      && light.out[token].color !== 'rgba(0, 0, 0, 0)',
    colorLight: light.out[token].color,
    colorDark: dark.out[token].color,
    sameAsSurfaceLight: light.out[token].color !== 'rgba(0, 0, 0, 0)' && light.out[token].color === surfaceLight,
    sameAsSurfaceDark: dark.out[token].color !== 'rgba(0, 0, 0, 0)' && dark.out[token].color === surfaceDark,
    files: referenced.get(token),
  })
}

const pick = (verdict) => rows.filter((r) => r.verdict === verdict)
const agreeOfficial = pick('agree-official')
const agreeRepo = pick('agree-repo')
const agreeAbsent = pick('agree-absent')
const falsePositiveOfficial = pick('gate-false-positive-official')
const falsePositiveRepo = pick('gate-false-positive-repo')
const falseNegative = pick('gate-false-negative')
const falsePositive = [...falsePositiveOfficial, ...falsePositiveRepo]

// 双主题跟随：只对「真实解析成颜色」的 token 有意义
const follow = rows.filter((r) => r.followTheme)

// ── 报告 ──────────────────────────────────────────────────────────────────────
const say = (line) => console.log(line)
const channelNote = usedChannel === 'chrome' ? '（channel=chrome：真实 Google Chrome）' : '（chrome channel 起不来，退回自带 chromium）'
say(`[theme-live] 主题产物：${THEME_BUNDLE}`)
say(`[theme-live] 逐字提取 ${blobCount} 段样式表 / ${cssDefined.size} 个官方已定义 token（无重写）`)
say(`[theme-live] 本仓库主题插件真实供给 ${repoSupplied.size} 个 token（跑 buildThemeTokenOverrides 得出，非字面量）`)
say(`[theme-live] 浏览器：${browser.version()} ${channelNote}`)
say('[theme-live] 仪器自检：')
for (const row of instrument) say(`  ✓ ${row.name}：${row.detail}`)
say(`[theme-live] 受管包引用 ${tokens.length} 个 token，逐条对照：`)
say(`  ✓ 官方 CSS 已定义 ∧ 真实引擎解析成功：${agreeOfficial.length}`)
say(`  ✓ 自家供给已发 ∧ 跑出来的映射里确有：${agreeRepo.length}`)
say(`  ✓ 两路都没有 ∧ 门禁亦判未定义/在基线：${agreeAbsent.length}`)
say(`  ✗ 门禁假阳性·官方声明：${falsePositiveOfficial.length}`)
for (const row of falsePositiveOfficial) say(`      ${row.token} ← ${row.files.join('、')}`)
say(`  ✗ 门禁假阳性·自家供给：${falsePositiveRepo.length}`)
for (const row of falsePositiveRepo) say(`      ${row.token} ← ${row.files.join('、')}`)
say(`  ✗ 门禁假阴性（门禁说不存在，真实引擎或供给方却给了）：${falseNegative.length}`)
for (const row of falseNegative) say(`      ${row.token} ← ${row.files.join('、')}`)
say(`[theme-live] 随主题变化的 token：${follow.length} 个（浅深两态解析成不同颜色）`)

const NEWAPP = 'dsh-newapp-local'
/** 对照基准：抽屉自身的底色。与它同色的 token 在这一态里不产生「面」。 */
const SURFACE_REFERENCE = '--dsw-alias-bg-layer-1'
const newappTokens = rows.filter((r) => r.files.some((file) => file.includes(NEWAPP)))
say(`[theme-live] 本包（${NEWAPP}）引用 ${newappTokens.length} 个 token，逐条解析值：`)
say(`      （对照基准：抽屉自身底色 --dsw-alias-bg-layer-1 = 浅 ${light.control.color} / 深 ${dark.control.color}）`)
for (const row of newappTokens) {
  const sameBoth = row.sameAsSurfaceLight && row.sameAsSurfaceDark
  const sameOne = row.sameAsSurfaceLight || row.sameAsSurfaceDark
  const isReference = row.token === SURFACE_REFERENCE
  const mark = !row.live ? '✗ 未解析（走字面兜底）'
    : isReference ? '· 抽屉底色（基准自身）'
      : sameBoth ? '⚠ 两态与底色同色'
        : sameOne ? `⚠ ${row.sameAsSurfaceLight ? '浅' : '深'}色下与底色同色`
          : row.followTheme ? '✓ 跟随主题' : '· 两态同值'
  say(`      ${mark.padEnd(20)} ${row.token.padEnd(38)} 浅 ${row.colorLight} / 深 ${row.colorDark}`)
}

// 这一条是本包真正的契约：**不允许再出现「未解析」**（那是幻觉 token 的指纹）。
const newappUnresolved = newappTokens.filter((r) => !r.live)
// 同色不算失败（官方 .pill 自己就用 bg-layer-2，浅色下也不产生面），但必须被看见。
// 排除对照基准自身：它与自己同色是恒真的，列出来只是噪音。
const newappFlat = newappTokens.filter(
  (r) => r.live && r.token !== SURFACE_REFERENCE && (r.sameAsSurfaceLight || r.sameAsSurfaceDark),
)

// ── 落盘 ──────────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true })
const reportPath = join(OUT_DIR, 'theme-tokens-live.json')
writeFileSync(reportPath, `${JSON.stringify({
  checkedAt: new Date().toISOString(),
  themeBundle: THEME_BUNDLE,
  browser: `${browser.browserType().name()} ${browser.version()}`,
  cssBlobs: blobCount,
  cssDefinedTokens: cssDefined.size,
  officialDefinedTokens: officialDefined.size,
  repoSuppliedTokens: repoSupplied.size,
  referenced: tokens.length,
  instrument,
  summary: {
    agreeOfficial: agreeOfficial.length,
    agreeRepo: agreeRepo.length,
    agreeAbsent: agreeAbsent.length,
    gateFalsePositiveOfficial: falsePositiveOfficial.length,
    gateFalsePositiveRepo: falsePositiveRepo.length,
    gateFalseNegative: falseNegative.length,
    followTheme: follow.length,
    newappUnresolved: newappUnresolved.length,
    newappFlatWithSurface: newappFlat.length,
  },
  newappTokens: newappTokens.map((r) => ({
    token: r.token, resolves: r.live, followTheme: r.followTheme,
    light: r.colorLight, dark: r.colorDark,
    sameAsSurfaceLight: r.sameAsSurfaceLight, sameAsSurfaceDark: r.sameAsSurfaceDark,
  })),
  newappFlatWithSurface: newappFlat.map((r) => ({
    token: r.token, sameAsSurfaceLight: r.sameAsSurfaceLight, sameAsSurfaceDark: r.sameAsSurfaceDark,
  })),
  gateFalsePositive: falsePositive.map((r) => ({
    token: r.token, route: r.official ? 'official' : 'repo-supply', files: r.files,
  })),
  gateFalseNegative: falseNegative.map((r) => ({ token: r.token, files: r.files })),
  consoleLines,
}, null, 2)}\n`)
say(`[theme-live] 报告：${reportPath}`)

await browser.close()

if (falsePositive.length > 0 || falseNegative.length > 0 || newappUnresolved.length > 0) {
  console.error(
    `[theme-live] 存在无法解释的分歧：门禁假阳性 ${falsePositiveOfficial.length}+${falsePositiveRepo.length}、`
    + `假阴性 ${falseNegative.length}、本包未解析 ${newappUnresolved.length}`,
  )
  process.exit(1)
}
console.log(`[theme-live] 全部一致：${tokens.length} 个引用 token 的门禁判据在两条供给路径上零分歧`)
