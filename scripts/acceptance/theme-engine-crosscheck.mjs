#!/usr/bin/env node
/**
 * 跨引擎对照：把 `theme-palette-audit.mjs` 的引擎结论拿到**产品自己那个 Chromium** 上复算。
 *
 * ## 为什么需要它
 *
 * ADR-0115 的 §6/§7 是「用真实 CSS 引擎求值」得出的（`color-mix(in oklch, …)` 的 `none` 色相
 * 行为）。但那个引擎是 Google Chrome（探针跑 `channel: 'chrome'`），而**产品跑在 Electron
 * 自带的 Chromium 上**——两者不是同一个东西。于是有一条尾债：结论可能只对测过的那个浏览器成立。
 *
 * 实测（2026-09-17）：Chrome **153.0.8010.48** vs Electron 43.3.0 的 Chromium **150.0.7871.212**，
 * 差三个大版本。所以这不是杞人忧天，是必须量的一个变量。
 *
 * 本脚本把那条尾债变成可复跑的断言：
 *
 *   1. 取探针报告里**同一批表达式串**（不重新推导——两边比的必须是同一个串）；
 *   2. 交给产品同版 Electron 的 Chromium 求值，求值内核与探针的 `evaluateEntries()` 同形
 *      （表达式落在真实属性上 → canvas `fillStyle`/`getImageData` 取回 sRGB 字节）；
 *   3. 逐字节比对两边的 sRGB，任何一条不同即 **exit 2**。
 *
 * ## 仪器自检（同探针的理由：没有它这片输出不可信）
 *
 *   - **表达式必须非空**。踩过一次：报告里 `hueIntegrity` 行**不存表达式串**，照着它取的
 *     提取器拿到 `undefined`，写进 `fillStyle` 后**静默保留上一帧**，取回 `[0,0,0]`——
 *     8 条「引擎差异」全是假的，真相是那 8 条根本没求值。所以提取后先查空，空即响亮失败。
 *   - **引擎必须是产品那个**。对照的前提是「Electron 自带的 Chromium」；vendor 里的 Electron
 *     版本与应用包 `Electron Framework.framework` 的 `CFBundleVersion` 不一致时，本项判红，
 *     并把两个版本都打出来——版本悄悄变了而对照照跑，正是「把平台行为当常量」那个坑。
 *
 * ## 边界
 *
 * - 本脚本证明的是「两个 Chromium 对这批表达式给出同一结果」，**不是**「界面长什么样」。
 * - 它依赖 vendor 里的 Electron（`packages` 的 `file:` 依赖同款 pin），不联网、不改任何仓库文件；
 *   Electron 的用户数据目录落在系统临时目录里，不碰 `~/.dsh`。
 *
 * 用法：
 *   node scripts/acceptance/theme-engine-crosscheck.mjs                 # 先跑探针再对照
 *   node scripts/acceptance/theme-engine-crosscheck.mjs --report <json> # 复用既有报告，跳过探针
 * 退出码：0 = 两条一致；2 = 前置条件缺失、仪器自检不成立，或存在真实差异。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_APP_DIR } from '../lib/app-resources.mjs'
import { assertNodeUsable, nodeCommand } from '../lib/real-node.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const REPORT_ARG = argValue('--report', null)

/** 前置条件缺失或仪器不成立时响亮退出，绝不降级成「跳过 = 通过」。 */
function require_(condition, message) {
  if (!condition) {
    console.error(`[engine-crosscheck] 前置条件缺失：${message}`)
    process.exit(2)
  }
}
const line = (s = '') => console.log(s)

// ── 1. 拿报告 ──────────────────────────────────────────────────────────────
let report
if (REPORT_ARG) {
  const path = resolve(REPORT_ARG)
  require_(existsSync(path), `--report 指向的文件不存在：${path}`)
  report = JSON.parse(readFileSync(path, 'utf8'))
  line(`[engine-crosscheck] 复用报告 ${path}`)
} else {
  const outDir = mkdtempSync(join(tmpdir(), 'theme-crosscheck-'))
  // 仪器自检③：探针是**子进程**跑的，所以「解释器能不能说话」必须先证明。
  // 判据选「子进程有没有输出」而不是「退出码是不是 0」——本项要防的正是
  // 「退出码 0 却没有输出」，而那与「探针正常跑完什么都没说」在读数上完全同形（ADR-0040）。
  const usable = assertNodeUsable()
  require_(usable.ok, `起探针用的解释器不可用：${usable.detail}`)
  line(`[engine-crosscheck] 先跑探针（报告落在 ${outDir}）…`)
  // 起子进程必须走 nodeCommand()：pnpm 生命周期脚本下 process.execPath 是宿主 Electron，
  // 拿它执行子脚本会「退出码 0 且没有任何输出」（ADR-0040）。
  const { command, env } = nodeCommand()
  const probe = spawnSync(command, [join(REPO_ROOT, 'scripts/acceptance/theme-palette-audit.mjs'), '--out', outDir], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    env,
  })
  require_(probe.status === 0, `探针未成功（exit ${probe.status}）——对照的前提是探针本身成立。\n${probe.stdout ?? ''}${probe.stderr ?? ''}`)
  require_(
    typeof probe.stdout === 'string' && probe.stdout.length > 0,
    '探针退出码 0 但**没有任何输出**——这与「探针正常跑完」在读数上同形，不能当成通过（ADR-0040）',
  )
  report = JSON.parse(readFileSync(join(outDir, 'theme-palette-audit.json'), 'utf8'))
}
require_(report.layerEngine?.available === true, '报告里 §6 真实引擎求值不可用（探针是 --no-browser 跑的？）')

// ── 2. 取同一批表达式 ──────────────────────────────────────────────────────
// layer：token×mode 网格。hue：§7 的 ref / oklch / srgb 三元组。
// 关键点：§7 的表达式在报告里**没有单存**——`hueIntegrity` 行只存渲染结果。所以这里从
// `layerEngine.expressions` 按同一个 token×mode 取回，而不是去猜一个。
const entries = []
for (const [token, pair] of Object.entries(report.layerEngine.expressions ?? {})) {
  for (const mode of ['light', 'dark']) {
    if (pair[mode] && !pair[mode].includes('__MISSING_')) {
      entries.push({ key: `${mode}:${token}`, expr: pair[mode], group: 'layer' })
    }
  }
}
for (const row of report.hueIntegrity ?? []) {
  const base = `${row.mode}|${row.token}`
  const oklch = report.layerEngine.expressions?.[row.token]?.[row.mode]
  require_(
    typeof oklch === 'string' && oklch.includes('in oklch'),
    `§7 行 ${base} 取不到 oklch 表达式（拿到 ${JSON.stringify(oklch)}）——报告与提取器的口径已分叉`,
  )
  entries.push({ key: `${base}|ref`, expr: row.reference, group: 'hue' })
  entries.push({ key: `${base}|oklch`, expr: oklch, group: 'hue' })
  entries.push({ key: `${base}|srgb`, expr: oklch.replace('in oklch', 'in srgb'), group: 'hue' })
}

// 仪器自检①：空表达式会让 fillStyle 静默保留上一帧，取回 [0,0,0]，看起来像「引擎差异」。
const empty = entries.filter((e) => typeof e.expr !== 'string' || e.expr.length === 0)
require_(empty.length === 0, `有 ${empty.length} 条表达式为空/缺失：${empty.map((e) => e.key).join(', ')}`)
require_(entries.length > 0, '报告里一条表达式都没有——对照没有对象')

// ── 3. 定位产品同版 Electron ───────────────────────────────────────────────
const ELECTRON_DIST = join(REPO_ROOT, 'vendor/dsh-desktop/dsh-plugin-desktop/node_modules/electron/dist')
const ELECTRON_BIN = join(ELECTRON_DIST, 'Electron.app/Contents/MacOS/Electron')
const FRAMEWORK_PLIST = join(DSH_APP_DIR, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist')
require_(existsSync(ELECTRON_BIN), `vendor 里没有 Electron 可执行文件：${ELECTRON_BIN}`)
require_(existsSync(FRAMEWORK_PLIST), `读不到应用包的 Electron Framework：${FRAMEWORK_PLIST}`)

const vendorVersion = readFileSync(join(ELECTRON_DIST, 'version'), 'utf8').trim()
const appVersion = (readFileSync(FRAMEWORK_PLIST, 'utf8').match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/) ?? [])[1]
// 仪器自检②：对照的前提是「产品那个 Chromium」。版本分叉了就必须有人知道。
require_(
  appVersion !== undefined && vendorVersion === appVersion,
  `vendor 里的 Electron（${vendorVersion}）与应用包（${appVersion ?? '<读不到>'}）不是同一版——`
    + '本项的前提是「拿产品自己那个 Chromium 复算」，版本不一致时结论不可迁移',
)

// ── 4. 在 Electron 里求值 ──────────────────────────────────────────────────
const workDir = mkdtempSync(join(tmpdir(), 'theme-crosscheck-run-'))
writeFileSync(join(workDir, 'package.json'), `${JSON.stringify({ name: 'theme-engine-crosscheck', version: '1.0.0', main: 'main.js' }, null, 2)}\n`)
writeFileSync(join(workDir, 'expressions.json'), `${JSON.stringify(entries, null, 1)}\n`)
// 求值内核刻意与探针的 evaluateEntries() 同形，只是把 playwright 换成 Electron 的 BrowserWindow。
writeFileSync(join(workDir, 'main.js'), `const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const entries = JSON.parse(readFileSync(join(__dirname, 'expressions.json'), 'utf8'))
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-color-profile', 'srgb')
app.whenReady().then(async () => {
  if (app.dock) app.dock.hide()
  const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { backgroundThrottling: false } })
  const html = '<!doctype html><html><body>' + entries.map((p, k) => '<div id="p' + k + '" style="background-color:' + p.expr + '"></div>').join('') + '</body></html>'
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  const measured = await win.webContents.executeJavaScript(\`(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    return \${JSON.stringify(entries)}.map((p, k) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000000'
      ctx.fillStyle = p.expr
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return { cssComputed: getComputedStyle(document.getElementById('p' + k)).backgroundColor, rgb: [d[0], d[1], d[2]], alpha: d[3] }
    })
  })()\`, true)
  const out = { engine: { electron: process.versions.electron, chrome: process.versions.chrome }, entries: entries.map((e, k) => ({ ...e, ...measured[k] })) }
  writeFileSync(join(__dirname, 'electron-values.json'), JSON.stringify(out, null, 1))
  console.log('ENGINE ' + JSON.stringify(out.engine))
  app.exit(0)
}).catch((error) => { console.error('FAILED ' + (error && error.stack ? error.stack : error)); app.exit(1) })
`)

line(`[engine-crosscheck] 在 Electron ${vendorVersion} 里求值 ${entries.length} 条…`)
const run = spawnSync(ELECTRON_BIN, [workDir, `--user-data-dir=${join(workDir, 'userdata')}`], {
  encoding: 'utf8',
  timeout: 180_000,
})
require_(run.status === 0, `Electron 求值失败（exit ${run.status}）\n${run.stdout ?? ''}${run.stderr ?? ''}`)
const electronOut = JSON.parse(readFileSync(join(workDir, 'electron-values.json'), 'utf8'))

// ── 5. 逐字节比对 ──────────────────────────────────────────────────────────
const probeValues = {}
for (const [token, pair] of Object.entries(report.layerEngine.expressions ?? {})) {
  for (const mode of ['light', 'dark']) {
    if (pair[mode] && !pair[mode].includes('__MISSING_')) probeValues[`${mode}:${token}`] = report.layerEngine.values[`${mode}:${token}`]?.rgb ?? null
  }
}
for (const row of report.hueIntegrity ?? []) {
  const base = `${row.mode}|${row.token}`
  probeValues[`${base}|ref`] = row.referenceRgb
  probeValues[`${base}|oklch`] = row.oklchRgb
  probeValues[`${base}|srgb`] = row.srgbRgb
}

const diffs = []
for (const e of electronOut.entries) {
  const a = probeValues[e.key]
  const b = e.rgb
  if (!a || !b) { diffs.push(`${e.key}: 一边没有值（探针 ${JSON.stringify(a)} / Electron ${JSON.stringify(b)}）`); continue }
  const delta = Math.max(...a.map((v, k) => Math.abs(v - b[k])))
  if (delta !== 0) diffs.push(`${e.key}: 探针 rgb(${a.join(', ')}) ≠ Electron rgb(${b.join(', ')})，最大通道差 ${delta}`)
}

line('')
line('=== 跨引擎对照 ===')
line(`探针引擎（§6）  ${report.layerEngine.engine ?? '<未记录>'}`)
line(`探针引擎（§7）  ${report.hueIntegrityEngine ?? '<未记录>'}`)
line(`Electron 引擎    electron ${electronOut.engine.electron} · chromium ${electronOut.engine.chrome}`)
line(`表达式 ${electronOut.entries.length} 条 · 一致 ${electronOut.entries.length - diffs.length} 条 · 不一致 ${diffs.length} 条`)
for (const d of diffs) line(`  ✗ ${d}`)

if (diffs.length > 0) {
  console.error(`\n[engine-crosscheck] ${diffs.length} 条表达式在两个 Chromium 上结果不同——§6/§7 的结论不能直接迁移到产品引擎。`)
  process.exit(2)
}
line('')
line('[engine-crosscheck] 两个 Chromium 对本批表达式给出**逐字节相同**的 sRGB——§6/§7 的引擎结论可迁移到产品引擎')
process.exit(0)
