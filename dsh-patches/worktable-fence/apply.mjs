#!/usr/bin/env node
/**
 * 给 vendor/dsh-worktable 的 lib/index.js 打信任栅栏补丁。
 *
 * 用法：
 *   node dsh-patches/worktable-fence/apply.mjs            # 打补丁（幂等）
 *   node dsh-patches/worktable-fence/apply.mjs --check    # 只校验是否已打且与 pin/fence 源一致
 *
 * 退出码：0 = 成功/已一致；1 = 校验失败（拒绝写入）；2 = 用法错误。
 *
 * 自我校验的设计（为什么不是「无脑字符串替换」）：
 *   ① 先按 vendor/dsh-worktable.pin 的 upstream-sha 比对 vendor 仓库 HEAD——
 *      栅栏锚在 bundle 的路由注册文本上，上游一改就可能落空，所以 pin 未 bump 前拒绝执行。
 *   ② 以 `git show HEAD:<file>` 取得**权威原始文本**，不依赖任何本地 .orig 备份。
 *   ③ 三态判定：工作副本 == 原始 → 打补丁；== 预期的补丁结果 → 已打过，退出 0；
 *      **两者都不是 → 拒绝**（有人在 vendor 里手改了 bundle，或 fence 源变过）。
 *      这一条是防「静默漂移」的关键：补丁工具最危险的失败模式是把一个已经被人改过的
 *      文件当成原始文件再打一遍，产出一个谁也没审过的混合体。
 *   ④ 写完用 `node --check` 做语法门禁；不通过就回滚并退出 1。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
const VENDOR = join(REPO_ROOT, 'vendor', 'dsh-worktable')
const PIN_PATH = join(REPO_ROOT, 'vendor', 'dsh-worktable.pin')
const FENCE_PATH = join(HERE, 'fence.js')
const TARGET_REL = '01_content/lib/index.js'
const TARGET = join(VENDOR, TARGET_REL)

/** 注入块标记：既是人读的边界，也是「是否已打」的机器判据。 */
const MARK_BEGIN = '/* ─── LUTE worktable fence BEGIN (dsh-patches/worktable-fence/apply.mjs) ─── */'
const MARK_END = '/* ─── LUTE worktable fence END ─── */'

/** apply() 里唯一的那一行——把整个 webServer 交给栅栏包住。 */
const ANCHOR = 'const webServer = ctx.webServer;'
const ANCHOR_PATCHED = 'const webServer = __wtFence(ctx.webServer, ctx);'

const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--apply') || process.argv.length === 2 ? 'apply' : null
if (mode === null) {
  console.error('用法：node dsh-patches/worktable-fence/apply.mjs [--check|--apply]')
  process.exit(2)
}

function git(args) {
  return execFileSync('git', ['-C', VENDOR, ...args], { encoding: 'utf8' })
}

function fail(message) {
  console.error('[worktable-fence] 拒绝：' + message)
  process.exit(1)
}

/** 计算补丁后的文本；anchor 必须**恰好出现一次**（多了说明锚点不再唯一）。 */
function patch(pristine) {
  const hits = pristine.split(ANCHOR).length - 1
  if (hits !== 1) {
    fail(`锚点 "${ANCHOR}" 在 ${TARGET_REL} 中出现 ${hits} 次（期望恰好 1 次）。上游结构已变，需人工重锚后再跑。`)
  }
  const fence = readFileSync(FENCE_PATH, 'utf8')
  const block = `${MARK_BEGIN}\n${fence}\n${MARK_END}\n`
  return block + pristine.replace(ANCHOR, ANCHOR_PATCHED)
}

/**
 * 剥掉本补丁注入的块，还原出打补丁前的文本。
 * 返回 null = 这个文件不像「原始文本 + 我们的块」（有头无尾、或块外还有别的改动），
 * 调用方应据此拒绝而不是继续。
 *
 * 这条判据是防静默漂移的关键：只有当**唯一的差异就是我们自己那块**时，重打才是安全的。
 * 否则（有人在 vendor 里手改过 bundle）盲打会产出一个谁也没审过的混合体。
 */
function stripFence(text) {
  const begin = text.indexOf(MARK_BEGIN)
  if (begin === -1) return null
  const end = text.indexOf(MARK_END, begin)
  if (end === -1) return null
  let after = end + MARK_END.length
  if (text[after] === '\n') after += 1
  const rest = text.slice(0, begin) + text.slice(after)
  if (rest.split(ANCHOR_PATCHED).length - 1 !== 1) return null
  return rest.replace(ANCHOR_PATCHED, ANCHOR)
}

// ── ① pin 与 vendor HEAD 必须一致 ──────────────────────────────────────────
const pin = readFileSync(PIN_PATH, 'utf8')
const pinnedSha = (pin.match(/^upstream-sha:\s*(\S+)$/m) ?? [])[1]
if (pinnedSha === undefined) fail(`${PIN_PATH} 缺少 upstream-sha 行`)
const head = git(['rev-parse', 'HEAD']).trim()
if (head !== pinnedSha) {
  fail(`vendor/dsh-worktable HEAD=${head}，pin upstream-sha=${pinnedSha}。上游已动，先 bump pin 并重新审阅 fence 锚点。`)
}

// ── ② 权威原始文本 ─────────────────────────────────────────────────────────
const pristine = git(['show', `HEAD:${TARGET_REL}`])
const expected = patch(pristine)
const actual = readFileSync(TARGET, 'utf8')

// ── ③ 状态判定 ─────────────────────────────────────────────────────────────
// 四种状态，只有前三种允许继续：
//   A 已是最新            actual === expected            → 退出 0
//   B 干净未打            actual === pristine            → 打
//   C 打过但 fence 源已变  stripFence(actual) === pristine → 重打（合法工作流：改 fence.js 再跑）
//   D 其他                → 拒绝（带外改动，盲打会产出未审的混合体）
if (actual === expected) {
  console.log(`[worktable-fence] 已是最新（sha ${pinnedSha.slice(0, 12)}，栅栏已在位）`)
  process.exit(0)
}
const stripped = stripFence(actual)
const clean = actual === pristine ? 'pristine' : stripped === pristine ? 'reapply' : 'foreign'
if (clean === 'foreign') {
  fail(`${TARGET_REL} 与上游原始文本的差异**不止**本补丁注入的那一块。`
    + '说明 vendor 内的 bundle 被带外改动过，或注入块被截断。'
    + `请先 \`git -C vendor/dsh-worktable checkout -- ${TARGET_REL}\` 恢复原始文本再重跑。`)
}

if (mode === 'check') {
  console.error(`[worktable-fence] 未打补丁：${TARGET_REL} 仍是上游原始文本`)
  process.exit(1)
}

// ── ④ 原子写入 + 语法门禁 ──────────────────────────────────────────────────
// tmp 必须带 .js 后缀：node --check 按扩展名选解析器，未知扩展名会直接报
// ERR_UNKNOWN_FILE_EXTENSION 而不是做语法检查（本补丁第一版就栽在这里）。
const tmp = join(dirname(TARGET), 'index.lute-tmp.js')
try {
  writeFileSync(tmp, expected, 'utf8')
  try {
    execFileSync('node', ['--check', tmp], { encoding: 'utf8', stdio: 'pipe' })
  } catch (error) {
    rmSync(tmp, { force: true })
    fail('注入后的 lib/index.js 语法检查未通过：\n' + (error.stdout ?? '') + (error.stderr ?? ''))
  }
  renameSync(tmp, TARGET)
} catch (error) {
  rmSync(tmp, { force: true })
  throw error
}

console.log(`[worktable-fence] 已注入栅栏 → ${TARGET_REL}（sha ${pinnedSha.slice(0, 12)}，+${expected.length - pristine.length} 字节）`)
console.log('[worktable-fence] 提示：lib/index.js.map 因行号位移而失效（仅影响 devtools 定位，运行时无关）。')
