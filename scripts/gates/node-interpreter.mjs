/**
 * 「开发脚本起子进程时用的解释器」校验项。
 *
 * ## 为什么需要它
 *
 * 开发脚本起冷进程子探针的标准写法是
 * `execFile(process.execPath, [script, ...])`。**这个写法只在父进程是 node 时成立。**
 *
 * 实测（2026-09-12，本仓库）：
 *
 * ```
 * $ node -e 'console.log(process.execPath)'           # /opt/homebrew/.../bin/node
 * $ pnpm exec node -e 'console.log(process.execPath)'  # /Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop
 * ```
 *
 * 在 pnpm 生命周期脚本下，整条进程链是**宿主 Electron 以 `ELECTRON_RUN_AS_NODE` 身份**
 * 跑起来的，于是 `process.execPath` 是 Electron 可执行文件。拿它执行子脚本，Electron
 * 不认为自己在当 node，而是**再开一个 app 实例**：单实例锁之下它把 argv 交给已在运行的
 * 主实例，**立刻以 0 退出**。
 *
 * 父进程看到的是 `退出码 0 + stdout 空 + stderr 空`。它与「子进程崩溃」「子进程超时被杀」
 * 都长得不一样，却与「子探针什么都没说就正常结束了」**完全一样**——所以它不会让探针变红，
 * 只会让探针变成一句没有信息量的话。
 *
 * 这个根因在本仓库**已经各自被发现并就地绕过三次**（`scripts/gate.test.mjs` 的
 * `resolveNode()`、`dsh-agent-team-gui-local` 的 quality helper、`dsh-team-hub` 的 typecheck），
 * 每次都是**一处**私有的 `which node` 兜底。同一事实三个家正是 ADR-0009 要禁的形态，
 * 而第四次（`scripts/acceptance/newapp-products-live.mjs`）就没人接了——探针带着
 * 「(无响应)」跑了好几轮。故本项把判据机器化：**唯一合法的做法是走
 * `scripts/lib/real-node.mjs`**。
 *
 * ## 判据
 *
 * 在受扫描范围内，`spawn / spawnSync / execFile / execFileSync / fork` 的**第一个实参**
 * 是 `process.execPath` 即违规。唯一豁免是 `scripts/lib/real-node.mjs` 本身（它是这个
 * 事实的家）。
 *
 * ## 本项**不**检查什么（诚实写清楚，免得被当成全覆盖）
 *
 * 1. **非 spawn 用法**。`packages/infra/dsh-team-hub/src/service-{launchd,systemd}.mjs`
 *    把 `process.execPath` 当**默认参数**写进 plist/unit 文件——同一根因的另一种形态
 *    （在 pnpm 下生成的服务描述会指向 Electron 二进制），但它的修法是「调用方必须显式
 *    传 node」而不是「加环境变量」，属于另一个决定，未在本项范围内。已知未修，登记在
 *    `.scratch/dsh-worktable-fusion/spec.md` 的开放项。
 * 2. **运行时才决定的解释器**（例如从配置里读一个路径）。静态文本看不见。
 *
 * 本项只保证一件事：**「忘了这件事」不再是一个安静的选项**。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { blankStringsAndComments } from '../lib/strip-comments.mjs'

/** 这个事实唯一的家；它自己当然要用 `process.execPath`。 */
const HOME = join('scripts', 'lib', 'real-node.mjs')

/**
 * spawn 家族的调用 + 第一个实参是 `process.execPath`。
 *
 * `[^)]*?` 而不是 `\s*`：子进程调用常常跨行写（`spawn(\n  process.execPath,\n  [...]`），
 * 只匹配同一行会漏掉它们。用 `[^)]` 又保证不会越过这个调用的右括号跑进下一个调用。
 */
const SPAWN_EXECPATH_RE = /\b(spawn|spawnSync|execFile|execFileSync|fork)\s*\([^)]*?process\.execPath/g

const SCAN_ROOTS = [join('scripts'), join('packages')]
/**
 * 这些目录名的内容是**产物**，不是源码。
 *
 * 注意 `lib` **只在 `packages/` 下**跳过：`scripts/lib/` 是本仓库源码的一部分
 * （`real-node.mjs` 与 `strip-comments.mjs` 就住在那儿）。第一版把 `lib` 放进全局
 * 跳过集，后果是 `scripts/lib/` **整个不被扫描**——于是本项「豁免 real-node.mjs」
 * 那段代码成了**死代码**，而它看起来像是在正常豁免。这个假绿是本项自己的用例⑤
 * 逼出来的：那条用例要求「同名文件在别处也必须报红」，它没报——不是因为有豁免，
 * 是因为**根本没扫**。
 */
const SKIP_DIRS = new Set(['node_modules', 'build', 'dist', 'vendor', '.git', '.scratch'])
/** 只在受管包目录下跳过的产物目录名。 */
const SKIP_DIRS_UNDER_PACKAGES = new Set(['lib'])
const SCAN_EXT = ['.mjs', '.js', '.cjs', '.ts', '.mts']

/**
 * 递归收集候选文件（仓库根相对路径）。
 * @param {string} repoRoot 仓库根。
 * @returns {string[]} 相对路径列表，已排序。
 */
function collectFiles(repoRoot) {
  const out = []
  const walk = (absDir, relDir, underPackages) => {
    let entries
    try {
      entries = readdirSync(absDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = join(absDir, entry.name)
      const rel = relDir === '' ? entry.name : join(relDir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (underPackages && SKIP_DIRS_UNDER_PACKAGES.has(entry.name)) continue
        walk(abs, rel, underPackages || entry.name === 'packages')
        continue
      }
      if (!entry.isFile()) continue
      if (!SCAN_EXT.some((ext) => entry.name.endsWith(ext))) continue
      // 只扫「开发脚本」：scripts/ 与各包的 scripts/ 子目录。包的 src/ 与 tests/ 不在内
      // （它们不承担起冷进程探针的职责；真需要时那条规则要另立一个家）。
      const inScriptsDir = rel.startsWith(`scripts${sep}`)
        || /(^|[\\/])scripts[\\/]/.test(rel)
      if (!inScriptsDir) continue
      out.push(rel)
    }
  }
  for (const root of SCAN_ROOTS) {
    const abs = join(repoRoot, root)
    try {
      if (statSync(abs).isDirectory()) walk(abs, root, root === join('packages'))
    } catch {
      // 目录不存在就跳过——这不是「通过」，根目录缺失由别的校验项负责。
    }
  }
  return out.sort()
}

/**
 * 找出「第一个实参是 process.execPath」的 spawn。
 *
 * **先剥注释与字符串再匹配**，用保留行号的 `blankStringsAndComments`。不剥的话，
 * 判据会把三样**不是代码**的东西读成代码，本项自己就各撞过一遍：
 * 顶部 JSDoc 里举的反例（注释）、以及测试夹具里写着「违规长什么样」的字符串。
 * 详见 scripts/lib/strip-comments.mjs 的三次撞墙表。
 *
 * 匹配跑在**整段文本**上而不是逐行：`spawn(\n  process.execPath,` 这种跨行写法是本仓库
 * 的真实形态（`dsh-team-hub` 就是被逐行匹配漏掉之后人工发现的）。行号由匹配下标反算。
 * @param {string} rawText 文件原文。
 * @returns {Array<{line: number, snippet: string}>} 命中列表。
 */
function findViolations(rawText) {
  const text = blankStringsAndComments(rawText)
  const original = rawText.split('\n')
  const hits = []
  SPAWN_EXECPATH_RE.lastIndex = 0
  for (let m = SPAWN_EXECPATH_RE.exec(text); m !== null; m = SPAWN_EXECPATH_RE.exec(text)) {
    // 行号取**匹配末尾**（即 `process.execPath` 自己）所在的行，不是 `spawn(` 那一行：
    // 跨行写法下两者差好几行，而读者要改的是 `process.execPath` 出现的地方。
    const line = text.slice(0, m.index + m[0].length).split('\n').length
    hits.push({ line, snippet: (original[line - 1] ?? '').trim().slice(0, 140) })
  }
  return hits
}

/**
 * 规则二：`nodeCommand()` 的**两半不能只拿一半**。
 *
 * `nodeCommand()` 返回 `{ command, env }`——「哪个可执行文件」与「它该以什么身份跑」
 * 是同一件事的两半，分开传迟早有人只传一半。实测就发生了：把 `gate.test.mjs` 里那份
 * 私有的 `resolveNode()` 收编到本模块时，只写了 `nodeCommand().command`，
 * 于是 `spawnSync` 起了 Electron 二进制而**没有** `ELECTRON_RUN_AS_NODE`——
 * 四条 CLI 测试立刻全红，而 `spawnSync` 不抛错，只是子进程不说话。
 *
 * 所以：写了 `nodeCommand().command` 的文件，必须同时出现 `nodeCommand().env`
 * 或显式的 `electronNodeEnv()`。后者是给「自己要拼 env」的调用方的正当出口。
 * @param {string} text 已剥注释与字符串的源文本。
 * @returns {boolean} 是否只拿了一半。
 */
function takesOnlyCommandHalf(text) {
  const takesCommand = /nodeCommand\(\)\s*\.\s*command/.test(text)
  if (!takesCommand) return false
  return !/electronNodeEnv|nodeCommand\(\)\s*\.\s*env/.test(text)
}

/**
 * 校验项实现。
 * @param {{repoRoot: string}} options
 * @returns {{passed: boolean, violations: string[], note?: string}} 校验结果。
 */
export function checkNodeInterpreter({ repoRoot }) {
  const files = collectFiles(repoRoot)
  const violations = []
  let scanned = 0

  for (const rel of files) {
    if (rel === HOME) continue
    let text
    try {
      text = readFileSync(join(repoRoot, rel), 'utf8')
    } catch {
      continue
    }
    scanned += 1
    for (const hit of findViolations(text)) {
      violations.push(
        `${rel}:${hit.line} 直接拿 process.execPath 当解释器起子进程（${hit.snippet}）`
        + '——在 pnpm 下它是宿主 Electron，子进程会「退出码 0 且没有任何输出」',
      )
    }
    if (takesOnlyCommandHalf(blankStringsAndComments(text))) {
      violations.push(
        `${rel} 用了 nodeCommand().command 却没有任何 env 半——子进程拿不到 `
        + 'ELECTRON_RUN_AS_NODE，等于把已经修掉的 bug 装回去。整对拿走（`const { command, env } = nodeCommand()`）'
        + '或显式补 `electronNodeEnv()`',
      )
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    ...(violations.length === 0
      ? { note: `已扫 ${scanned} 个开发脚本，起子进程一律走 scripts/lib/real-node.mjs` }
      : {}),
  }
}

export { collectFiles, findViolations }
