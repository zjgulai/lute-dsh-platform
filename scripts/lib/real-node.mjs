/**
 * 「怎么起一个**真正的 node**」的唯一事实源（ADR-0009：一份事实只有一个家）。
 *
 * ## 问题
 *
 * 开发脚本经常要起一个冷进程子探针，写法是
 * `execFile(process.execPath, [script, ...])`。这个写法**只在父进程是 node 时成立**。
 *
 * 实测（2026-09-12，本仓库）：
 *
 * ```
 * $ node -e 'console.log(process.execPath)'          # /opt/homebrew/.../bin/node
 * $ pnpm exec node -e 'console.log(process.execPath)' # /Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop
 * ```
 *
 * 在 pnpm 生命周期脚本下，`process.execPath` 是**宿主 Electron 可执行文件**——
 * 因为整条进程链本身就是 Elektron 以 `ELECTRON_RUN_AS_NODE` 身份跑起来的。
 * 拿它去执行子脚本，Electron 不认为自己在当 node，而是**再开一个 app 实例**：
 * 单实例锁之下它把 argv 交给已在运行的主实例，然后**立刻以 0 退出**。
 *
 * 于是父进程看到的是：`退出码 0 + stdout 空 + stderr 空`。
 * 这与「子进程崩溃」「子进程被超时杀掉」都**长得不一样**，却与
 * 「子探针什么都没说就正常结束了」**完全一样**。这就是这个 bug 的全部危害：
 * **它不是让探针变红，而是让探针变成一句没有信息量的话。**
 *
 * ## 为什么不是「回 PATH 上找 node」
 *
 * `scripts/gate.test.mjs` 与 `dsh-agent-team-gui-local` 的 quality helper 各自
 * 写过一版「看 basename 是不是 node，不是就 `which node`」。那两版都能用，但：
 *
 * 1. 它是**两处**实现（同一事实两个家，ADR-0009）；本文件是它们该指向的那个家。
 * 2. 「PATH 上找到 node」不保证找到的是**同一个运行时**。`ELECTRON_RUN_AS_NODE=1`
 *    则不需要任何查找：它就是 `process.execPath`，只加一个环境变量把它切回 node 语义。
 *
 * `ELECTRON_RUN_AS_NODE` 对**真正的 node 是无害的**（一个它不认识的普通环境变量），
 * 所以本模块在两种父进程下返回同一形状，调用方不需要分支。
 *
 * ## 用法
 *
 * ```js
 * import { nodeCommand } from '../lib/real-node.mjs'
 * const { command, env } = nodeCommand()
 * execFile(command, [script, '--child', '{}'], { env })
 * ```
 *
 * ## 自证
 *
 * `assertNodeUsable()` 真的起一次子进程并检查它**说得出话**。放在探针的「仪器自检」
 * 阶段用：一个只会说「(无响应)」的仪器等于没有仪器。不要靠读代码来相信本模块，
 * 要让它自己证明。
 */
import { execFileSync } from 'node:child_process'

/**
 * 当前进程是不是 **Electron 以 node 身份**在跑。
 *
 * `process.versions.electron` 存在即说明运行时是 Electron；配合
 * `process.versions.node` 也存在，就能确定它是 `ELECTRON_RUN_AS_NODE` 形态
 * （两条都在 = 既是 Electron 又在提供 node API）。
 * @returns {boolean}
 */
export function isElectronNode() {
  return process.versions.electron !== undefined
}

/**
 * 「把子进程切回 node 语义」所需要的那**几个环境变量**。
 *
 * 给**自己拼 env** 的调用方用（例如 `dsh-team-hub` 的验收脚本要传一份最小环境，
 * 而不是继承 `process.env`）。不要各自写 `ELECTRON_RUN_AS_NODE: '1'`——那就是
 * 把同一个事实又抄了一个家。
 * @returns {Record<string, string>} 在真 node 下是空对象（该变量对 node 无害，但没必要加）。
 */
export function electronNodeEnv() {
  return isElectronNode() ? { ELECTRON_RUN_AS_NODE: '1' } : {}
}

/**
 * 起一个真 node 子进程所需的一切。
 *
 * 返回 `env` 而不是只返回路径，是因为「哪个可执行文件」与「它该以什么身份跑」
 * 是同一件事的两半——分开传迟早有人只传一半。
 * @returns {{command: string, env: NodeJS.ProcessEnv}}
 */
export function nodeCommand() {
  return { command: process.execPath, env: { ...process.env, ...electronNodeEnv() } }
}

/**
 * 一行人类可读的解释器描述，用于把「我到底拿什么跑的」写进报告。
 * @returns {string}
 */
export function describeNodeCommand() {
  const { command } = nodeCommand()
  const kind = isElectronNode() ? 'Electron-as-node' : 'node'
  return `${command}（${kind}，node ${process.versions.node}）`
}

/**
 * 自证：真起一次子进程，确认它**能说话**。
 *
 * 判据刻意选「子进程有没有输出」而不是「退出码是不是 0」——本模块要防的正是
 * 「退出码 0 却没有输出」。只检查退出码的自证会被同一个 bug 骗过去。
 * @returns {{ok: boolean, detail: string}}
 */
export function assertNodeUsable() {
  const { command, env } = nodeCommand()
  const marker = 'LUTE-NODE-OK'
  let stdout = ''
  try {
    stdout = execFileSync(command, ['-e', `process.stdout.write(${JSON.stringify(marker)})`], {
      encoding: 'utf8',
      timeout: 15_000,
      env,
    })
  } catch (error) {
    return { ok: false, detail: `起子进程失败：${String(error.message).slice(0, 160)}` }
  }
  if (!stdout.includes(marker)) {
    return {
      ok: false,
      detail: `子进程退出码 0 但没有输出（stdout ${JSON.stringify(stdout)}）——`
        + `解释器 ${command} 没有把脚本当 node 跑。这正是 ELECTRON_RUN_AS_NODE 缺失时的形状。`,
    }
  }
  return { ok: true, detail: `${describeNodeCommand()} → 子进程回话 ${marker}` }
}
