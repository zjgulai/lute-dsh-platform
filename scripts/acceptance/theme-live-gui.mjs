#!/usr/bin/env node
/**
 * C4 · **实况 GUI** 的主题 token 取值（经 Chrome DevTools Protocol）。
 *
 * ## 与 `theme-tokens-live.mjs` 的分工（两者不可互替）
 *
 * `theme-tokens-live.mjs` 测的是「**产物里的样式表**在真实 CSS 引擎下如何解析」：它把
 * 逐字提取的 CSS 注进一个空白页，再人为切两态。它能回答「这个 token 在引擎里解析成什么」，
 * 但它**看不到**真实页面此刻的状态——外壳注入了哪些内联变量、插件 CSS 的层叠顺序、运行时
 * 计算出的覆盖值，它一概看不见。
 *
 * 本脚本补的正是这一段：连**正在运行的 DSH 渲染进程**，在它自己的执行上下文里，用同样的
 * 探针技术读出**此刻真正生效**的值。这是 C2 验收里那条「浅色深色双主题回归」的最后一块，
 * 也是 `theme-tokens-live.mjs` 头部「边界」一节里写明的「重启后的 C4 环节」。
 *
 * ## 为什么不走 `http://127.0.0.1:43120`
 *
 * 那条路实测 401：浏览器的**设备配对信任栅栏**挡在前面（见 `theme-tokens-live.mjs`
 * 第 37–42 行的边界声明）。CDP 直连渲染进程**绕过**那道栅栏，因此不需要配对、不需要
 * 任何凭证——代价是它要求宿主以 `--remote-debugging-port` 启动（见下）。
 *
 * ## 前置条件（缺一即 exit 2，绝不降级成「跳过 = 通过」）
 *
 * DSH Desktop 必须以调试端口启动。macOS 上先退出应用，再：
 *
 *     open -a "DSH Desktop" --args --remote-debugging-port=9333
 *
 * 注意 `open --args` **只在应用尚未运行时生效**；若 DSH 已在运行，该命令只会把现有窗口
 * 带到前台，端口不会开。端口必须是 127.0.0.1 上的 loopback——本脚本只连 loopback，
 * 不接受远程主机（CDP 是无鉴权的完整控制通道，暴露到网络上等于把整台浏览器交出去）。
 *
 * ## 只读纪律
 *
 * 本脚本**不切主题、不写任何变量、不改 DOM 的可见状态**。它只做两件事：挂一个
 * `visibility:hidden` 的探针元素读 `var()` 解析结果，读一次 `data-ds-dark-theme` 标记。
 * 主题由**你当前的实际状态**决定——想看另一态，请自己在外壳里切一次再重跑，
 * 因为替你切主题会改变你屏幕上的界面。
 *
 * 用法：
 *   node scripts/acceptance/theme-live-gui.mjs [--port 9333] [--out <dir>] [--target <id>] [--list]
 *   --list 只列出 CDP 可见的 targets 然后退出（排查「连上了但选错窗口」用这个）
 * ## 退出码
 *
 * - `0` = 读到了、仪器自检通过，且没有**全局**未解析 token。
 *   仅「局部作用域取不到值」**不**判失败——那是预期行为，不是缺陷。
 * - `1` = 读到但存在**全局**未解析 token（声明在根选择器上却取不到：层叠断裂或运行时覆盖），
 *   或存在跨域读不到的样式表（覆盖不全，结论不可信）。
 * - `2` = 前置条件或仪器不可用。
 *
 * 2026-09-18 收紧语义：旧版把「局部作用域取不到值」也计入未解析，于是 `--dsw-hovercard-bg`
 * （只声明在 CSS Modules 类 `._card_1b2ny_13` 上、页面无元素挂载该类）让整轮判 1——**假红**。
 * 判据与实测样本见 PROBE 里 `collectDeclarations` / `isGlobalSelector` 两处的注释。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const PORT = Number(argValue('--port', '9333'))
const OUT_DIR = resolve(argValue('--out', join(REPO_ROOT, '.scratch/dsh-worktable-fusion/acceptance')))
const WANT_TARGET = argValue('--target', null)
const LIST_ONLY = args.includes('--list')

/** 前置条件缺失时响亮退出，绝不降级（与 theme-tokens-live.mjs 同一条纪律）。 */
function require_(condition, message) {
  if (!condition) {
    console.error(`[theme-gui] 前置条件缺失：${message}`)
    process.exit(2)
  }
}

require_(Number.isInteger(PORT) && PORT > 0 && PORT < 65536, `--port 不是合法端口：${argValue('--port', '9333')}`)

// ── CDP 客户端（零依赖：Node 26 自带全局 fetch 与 WebSocket）─────────────────────
/** 一条 CDP 会话：按 id 匹配响应，把 CDP 的 error 提升成异常而不是静默的 undefined。 */
class CdpSession {
  #socket
  #seq = 0
  #waiting = new Map()

  constructor(socket) {
    this.#socket = socket
    socket.addEventListener('message', (event) => {
      let frame
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return // CDP 也会推非 JSON 的横幅；忽略而不是崩掉
      }
      if (frame.id === undefined) return // 事件帧（无 id）本脚本用不到
      const pending = this.#waiting.get(frame.id)
      if (pending === undefined) return
      this.#waiting.delete(frame.id)
      if (frame.error !== undefined) pending.reject(new Error(String(frame.error.message)))
      else pending.resolve(frame.result)
    })
  }

  static async open(wsUrl) {
    const socket = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      const fail = () => reject(new Error('CDP websocket 未能建立'))
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', fail, { once: true })
      socket.addEventListener('close', fail, { once: true })
    })
    return new CdpSession(socket)
  }

  send(method, params = {}) {
    const id = ++this.#seq
    return new Promise((resolve, reject) => {
      this.#waiting.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.#socket.close()
  }
}

// ── 目标发现 ─────────────────────────────────────────────────────────────────
const LIST_URL = `http://127.0.0.1:${PORT}/json/list`

async function fetchTargets() {
  let response
  try {
    response = await fetch(LIST_URL)
  } catch (error) {
    require_(false,
      `连不上 CDP（${LIST_URL}）：${error.message}\n`
      + `        DSH Desktop 必须以调试端口启动且尚未运行过：\n`
      + `          open -a "DSH Desktop" --args --remote-debugging-port=${PORT}`)
  }
  require_(response.ok, `CDP 列出 targets 失败：HTTP ${response.status}（端口上不是调试端点？）`)
  const list = await response.json()
  require_(Array.isArray(list), 'CDP /json/list 未返回数组')
  return list
}

const targets = await fetchTargets()
const pages = targets.filter((t) => t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string')

console.log(`[theme-gui] CDP 127.0.0.1:${PORT} 可见 ${targets.length} 个 target，其中 page 类 ${pages.length} 个：`)
for (const t of targets) {
  const mark = t.type === 'page' ? ' ' : '·'
  console.log(`  ${mark} [${t.type}] ${String(t.title ?? '').slice(0, 48)} | ${String(t.url ?? '').slice(0, 80)}`)
}

if (LIST_ONLY) {
  process.exit(0)
}

require_(pages.length > 0, 'CDP 里没有任何 page 类 target——DSH 窗口可能还没创建，或调试端口属于别的进程')

/**
 * 挑出 DSH 自己的窗口。
 *
 * 不硬编码标题：DSH 的窗口标题随会话变化。按「URL 指向本地服务」优先，其次标题里出现
 * DSH 的，最后退回第一个 page——**并且把选择结果连同候选清单一起打印**，这样选错了
 * 一眼能看出来，而不是拿到一份来自错误页面的「绿色」报告。
 */
function pickTarget() {
  if (WANT_TARGET !== null) {
    const hit = pages.find((t) => t.id === WANT_TARGET)
    require_(hit !== undefined, `--target ${WANT_TARGET} 不在候选里`)
    return { target: hit, reason: '--target 显式指定' }
  }
  const local = pages.find((t) => /127\.0\.0\.1:\d+/.test(String(t.url ?? '')))
  if (local !== undefined) return { target: local, reason: 'URL 指向本地服务' }
  const named = pages.find((t) => /dsh/i.test(String(t.title ?? '')))
  if (named !== undefined) return { target: named, reason: '标题含 DSH' }
  return { target: pages[0], reason: '退回第一个 page（未识别出 DSH 窗口，请核对上面的清单）' }
}

const { target, reason } = pickTarget()
console.log(`[theme-gui] 选中 target：${target.id}（${reason}）`)
console.log(`[theme-gui] ${String(target.title ?? '').slice(0, 60)} | ${String(target.url ?? '').slice(0, 90)}`)

// ── 取值 ─────────────────────────────────────────────────────────────────────
const session = await CdpSession.open(target.webSocketDebuggerUrl)
await session.send('Runtime.enable')

/**
 * 在页面里跑的探针。
 *
 * 与 `theme-tokens-live.mjs` 的 `measure()` **同一套技术、同样的正负控**：把名字挂到一个
 * 探针元素的 `var()` 上，读 `getComputedStyle` 的解析结果。这样区分得开两件事——
 * 「这个 token 在实况里解析不出东西」与「我的测量方法本身不成立」。
 *
 * 这里的差别是**不切主题**：只读当前态。`declared` 是从页面样式表里枚举出来的
 * `--dsw-*` 名字，作为「页面到底声明了哪些」的独立一路，防止我只对着自己的清单自证。
 */
const PROBE = `(() => {
  const root = document.documentElement
  const host = document.getElementById('host') ?? document.body
  const probe = document.createElement('div')
  probe.setAttribute('data-theme-live-probe', '')
  probe.style.cssText = 'position:absolute;left:-99999px;top:0;width:0;height:0;visibility:hidden;pointer-events:none'
  host.appendChild(probe)
  const read = (token) => {
    probe.style.setProperty('--tlg', 'var(' + token + ')')
    const value = getComputedStyle(probe).getPropertyValue('--tlg').trim()
    probe.style.removeProperty('--tlg')
    return value
  }
  const readColor = (token) => {
    probe.style.setProperty('background-color', 'var(' + token + ')')
    const value = getComputedStyle(probe).backgroundColor
    probe.style.removeProperty('background-color')
    return value
  }

  // 页面自己声明了哪些 --dsw-*：不依赖仓库的静态提取，是独立的一路证据。
  //
  // 记的是 name → **声明它的选择器集合**，而不是光记名字。因为「取不到值」有两种成因，
  // 不区分就会把预期行为报成缺陷：
  //   · 声明在 :root / html / body 这类**全局根选择器**上却取不到 → 层叠断裂或运行时覆盖（真问题）
  //   · 只声明在 .card_x 这类**局部作用域**选择器上，而探针挂在 body → 本就不在继承链上（预期）
  // 实测样本（2026-09-18）：--dsw-hovercard-bg 只声明在 CSS Modules 类 ._card_1b2ny_13 上，
  // 页面上没有任何元素挂载该类，于是取不到值——旧版本把它记成「层叠失效的指纹」，是错误归因。
  const declared = new Map()
  let sheetErrors = 0
  // 容器规则（@media / @supports / @layer，以及 CSS 嵌套）内部的声明也要收，
  // 否则「只在它内部声明过」的 token 会从 declared 里整条消失——那是不出声的漏测。
  const collectDeclarations = (rules) => {
    for (const rule of Array.from(rules ?? [])) {
      if (rule.style !== undefined && rule.style !== null) {
        const selector = typeof rule.selectorText === 'string'
          ? rule.selectorText
          : '(' + rule.constructor.name + ')'
        for (const name of Array.from(rule.style)) {
          if (!name.startsWith('--dsw-')) continue
          const seen = declared.get(name)
          if (seen === undefined) declared.set(name, new Set([selector]))
          else seen.add(selector)
        }
      }
      if (rule.cssRules !== undefined && rule.cssRules !== null) collectDeclarations(rule.cssRules)
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      sheetErrors += 1   // 跨域样式表读不到，如实计数而不是假装没有
      continue
    }
    collectDeclarations(rules)
  }

  // 「全局根声明」判据：选择器组里**任一项**剥掉属性/伪类装饰后，不含组合符、且以根选择器开头。
  // 这里**刻意不用正则**：本段整体处于一个 JS 模板字符串内（反引号在本段内一律不许出现，
  // 出现即提前终止字符串）。模板字符串会先吃掉一层反斜杠，正则转义很容易被吞成别的东西，
  // 是这个文件最容易踩的静默坑。手写扫描没有这个风险。
  const stripSelectorDecorations = (one) => {
    let out = ''
    let inBracket = 0
    let inParen = 0
    for (const ch of one) {
      if (ch === '[') { inBracket += 1; continue }
      if (ch === ']') { inBracket = Math.max(0, inBracket - 1); continue }
      if (ch === '(') { inParen += 1; continue }
      if (ch === ')') { inParen = Math.max(0, inParen - 1); continue }
      if (inBracket === 0 && inParen === 0) out += ch
    }
    return out.trim()
  }
  const hasCombinator = (text) => {
    for (const ch of text) {
      if (ch === '>' || ch === '+' || ch === '~') return true
      if (ch.charCodeAt(0) === 32) return true   // 空格：后代选择器
    }
    return false
  }
  const startsAtRoot = (text) => {
    const lower = text.toLowerCase()
    return lower.indexOf(':root') === 0 || lower.indexOf('html') === 0
      || lower.indexOf('body') === 0 || lower.indexOf('*') === 0
  }
  const isGlobalSelector = (selectorText) => String(selectorText)
    .split(',')
    .some((one) => {
      const stripped = stripSelectorDecorations(one)
      if (stripped === '') return false
      if (hasCombinator(stripped)) return false   // 后代/子代/兄弟组合 → 不是根声明
      return startsAtRoot(stripped)
    })
  const scopeOfToken = (name) => {
    const seen = declared.get(name)
    if (seen === undefined) return 'unknown'
    for (const selector of seen) if (isGlobalSelector(selector)) return 'global'
    return 'local'
  }

  const control = { exists: read('--dsw-alias-bg-layer-1'), color: readColor('--dsw-alias-bg-layer-1') }
  const absent = { exists: read('--dsw-alias-zzz-not-a-real-token'), color: readColor('--dsw-alias-zzz-not-a-real-token') }

  // 逐条读声明的 token 的实况值。上限只是防御性的，正常页面远低于此。
  const names = Array.from(declared.keys()).sort().slice(0, 4000)
  const out = {}
  for (const token of names) {
    out[token] = {
      exists: read(token),
      color: readColor(token),
      scope: scopeOfToken(token),
      declaredIn: Array.from(declared.get(token) ?? []).slice(0, 4),
    }
  }

  const bodyStyle = getComputedStyle(document.body)
  const snap = {
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    probeHost: host === document.body ? 'body' : '#' + (host.id || '(anonymous)'),
    colorScheme: getComputedStyle(root).colorScheme,
    bodyBackground: bodyStyle.backgroundColor,
    bodyColor: bodyStyle.color,
    rootFontSize: getComputedStyle(root).fontSize,
    title: document.title,
    href: location.href,
    declaredCount: declared.size,
    sheetErrors,
    control,
    absent,
    out,
  }
  probe.remove()
  return snap
})()`

let evaluation
try {
  evaluation = await session.send('Runtime.evaluate', {
    expression: PROBE,
    returnByValue: true,
    awaitPromise: false,
  })
} finally {
  session.close()
}

require_(evaluation?.exceptionDetails === undefined,
  `页面内探针抛错：${evaluation?.exceptionDetails?.exception?.description ?? evaluation?.exceptionDetails?.text ?? '未知名'}`)
const snap = evaluation.result?.value
require_(snap !== undefined && typeof snap === 'object', '探针没有返回可用的对象（returnByValue 失败？）')

// ── 仪器自检：对照不成立就绝不出结论 ────────────────────────────────────────────
const instrument = []
const instrumentOk = (name, ok, detail) => instrument.push({ name, ok, detail })
const names = Object.keys(snap.out)

instrumentOk('页面枚举到 token', snap.declaredCount > 0,
  `从样式表读到 ${snap.declaredCount} 个 --dsw-* 名字（跨域读不到的样式表 ${snap.sheetErrors} 张）`)
instrumentOk('正控解析成功', snap.control.exists !== '',
  `--dsw-alias-bg-layer-1 → ${JSON.stringify(snap.control.exists)}`)
instrumentOk('正控颜色可用', snap.control.color !== 'rgba(0, 0, 0, 0)',
  `--dsw-alias-bg-layer-1 背景 → ${snap.control.color}`)
instrumentOk('负控解析为空', snap.absent.exists === '',
  `不存在的名字 → ${JSON.stringify(snap.absent.exists)}`)
instrumentOk('负控颜色回落初值', snap.absent.color === 'rgba(0, 0, 0, 0)',
  `不存在的名字背景 → ${snap.absent.color}`)
instrumentOk('探针未污染可见 DOM', true, '探针元素已移除，全程 visibility:hidden')

const broken = instrument.filter((row) => !row.ok)
if (broken.length > 0) {
  console.error('[theme-gui] 仪器自检未通过，本次测量结果不可信，不出结论：')
  for (const row of broken) console.error(`  ✗ ${row.name}：${row.detail}`)
  process.exit(2)
}

// ── 报告 ─────────────────────────────────────────────────────────────────────
const theme = snap.dark ? 'dark' : 'light'
const unresolvedAll = names.filter((t) => snap.out[t].exists === '')
const resolved = names.filter((t) => snap.out[t].exists !== '')
// 「解析出值」与「解析成颜色」是两件事：间距/圆角类 token 本来就不是颜色。
const colored = resolved.filter((t) => snap.out[t].color !== 'rgba(0, 0, 0, 0)')

// ── 未解析分两类：只有「全局声明却取不到」才是缺陷 ────────────────────────────
// 局部作用域的 token 本就不在探针挂载点（body）的继承链上，取不到值是预期结果。
// 把预期算成失败，等于让仪器对正确行为报红——2026-09-18 实测到的假红。
// 判据缺失（scope 既非 local 也非 global）归入「需要解释」，不静默放行。
const unresolvedGlobal = unresolvedAll.filter((t) => snap.out[t].scope !== 'local')
const unresolvedLocalScoped = unresolvedAll.filter((t) => snap.out[t].scope === 'local')

console.log(`[theme-gui] 页面：${String(snap.title).slice(0, 60)}`)
console.log(`[theme-gui] 当前主题：**${theme}**（data-ds-dark-theme=${snap.dark}），color-scheme=${snap.colorScheme}`)
console.log(`[theme-gui] body 底色 ${snap.bodyBackground} / 前景 ${snap.bodyColor} / 根字号 ${snap.rootFontSize}`)
console.log(`[theme-gui] 探针挂载点：${snap.probeHost}`)
console.log('[theme-gui] 仪器自检：')
for (const row of instrument) console.log(`  ✓ ${row.name}：${row.detail}`)
console.log(`[theme-gui] 页面声明 ${snap.declaredCount} 个 token：解析成功 ${resolved.length}（其中解析成颜色 ${colored.length}）、取不到值 ${unresolvedAll.length}`)
console.log(`[theme-gui]   · 全局声明却取不到（层叠断裂或运行时覆盖——真问题）：${unresolvedGlobal.length}`)
console.log(`[theme-gui]   · 仅局部作用域声明（不在探针挂载点 ${snap.probeHost} 的继承链上——预期，非缺陷）：${unresolvedLocalScoped.length}`)
if (unresolvedGlobal.length > 0) {
  console.log('[theme-gui] 全局未解析：')
  for (const token of unresolvedGlobal.slice(0, 40)) {
    console.log(`      ✗ ${token}  ← 声明于 ${snap.out[token].declaredIn.join(' | ')}`)
  }
  if (unresolvedGlobal.length > 40) console.log(`      … 另有 ${unresolvedGlobal.length - 40} 个`)
}
if (unresolvedLocalScoped.length > 0) {
  console.log('[theme-gui] 局部作用域（预期；列出来是为了让判据本身可核对）：')
  for (const token of unresolvedLocalScoped.slice(0, 40)) {
    console.log(`      · ${token}  ← 声明于 ${snap.out[token].declaredIn.join(' | ')}`)
  }
  if (unresolvedLocalScoped.length > 40) console.log(`      … 另有 ${unresolvedLocalScoped.length - 40} 个`)
}

mkdirSync(OUT_DIR, { recursive: true })
const reportPath = join(OUT_DIR, `theme-live-gui-${theme}.json`)
writeFileSync(reportPath, `${JSON.stringify({
  checkedAt: new Date().toISOString(),
  cdpPort: PORT,
  target: { id: target.id, title: target.title, url: target.url, pickReason: reason },
  theme,
  page: {
    title: snap.title, href: snap.href, colorScheme: snap.colorScheme,
    bodyBackground: snap.bodyBackground, bodyColor: snap.bodyColor,
    rootFontSize: snap.rootFontSize, probeHost: snap.probeHost,
  },
  instrument,
  summary: {
    declared: snap.declaredCount,
    resolved: resolved.length,
    colored: colored.length,
    unresolved: unresolvedAll.length,                    // 全部取不到值的（含预期内的局部作用域）
    unresolvedGlobal: unresolvedGlobal.length,           // 真问题：全局声明却取不到
    unresolvedLocalScoped: unresolvedLocalScoped.length, // 预期：局部作用域，不在挂载点继承链上
    sheetErrors: snap.sheetErrors,
  },
  tokens: snap.out,
  unresolved: unresolvedAll,
  unresolvedGlobal,
  unresolvedLocalScoped,
}, null, 2)}\n`)
console.log(`[theme-gui] 报告：${reportPath}`)

if (unresolvedGlobal.length > 0 || snap.sheetErrors > 0) {
  console.error(
    `[theme-gui] 存在需要解释的分叉：全局未解析 token ${unresolvedGlobal.length} 个、`
    + `读不到的样式表 ${snap.sheetErrors} 张`,
  )
  process.exit(1)
}
