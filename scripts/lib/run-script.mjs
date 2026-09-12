/**
 * 包脚本执行器：按**分流**保留 stdout / stderr 尾部，且不伪造退出码（ADR-0043）。
 *
 * 为什么独立成模块：这段逻辑的正确性只能被**真实子进程**证伪——「分流是否真的分流」
 * 「超限是否真的报超限」，用假数据喂函数是证不出来的（假数据本身就带上了我想要的形状）。
 * 而 `gate.mjs` 是带顶层副作用的脚本，import 即执行整轮门禁，测不了。抽到 `scripts/lib/`
 * 后由 `run-script.test.mjs` 起真子进程当场验证，与 `real-node.mjs`、`strip-comments.mjs`
 * 同处一层。
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * 保留的输出尾部长度。实测校准（2026-09-11）：patch-anchors 依赖的
 * verify-patches-v2.sh 会打印 35 行锚点结果（约 1 KB），而 FAIL/MISSING 明细
 * 出现在输出**开头**——原先的 500 字符只留到 OK 行与汇总，导致门禁只能报
 * 「退出码 1」而指不出漂移项。4000 足以容纳该脚本全部输出，仍远小于异常堆栈。
 */
export const SCRIPT_OUTPUT_TAIL = 4000

/**
 * 子进程单流输出上限。默认 1 MiB 对测试运行器太紧，且一旦超限，
 * `execFileSync` 抛出的错误没有 `status`——旧代码把它折算成「退出码 1」，
 * 「输出超限」从此被读成「测试失败」（ADR-0043）。
 */
export const SCRIPT_MAX_BUFFER = 16 * 1024 * 1024

/**
 * 运行一个包脚本并返回退出码与**分流**输出尾部。
 *
 * 为什么分流（ADR-0043）：原先把 `error.stdout` 与 `error.stderr` 拼成一个 blob
 * 再取尾，等于假设「后拼的那个流更有信息」。实测 dsh-skill-center-local 跑一轮
 * vitest：stdout 只有 784 字节（`Test Files / Tests` 汇总全在此），stderr 有 5821
 * 字节的 React `act()` 警告。拼接后取最后 4000 字符，汇总被整段挤出——门禁报
 * 「退出码 1」，附上的却全是警告噪声，读过报告的人无从知道哪个测试挂了。
 * 分流保留后由调用方按流取证，谁的体量大都不再挤掉另一个。
 * @param {string} cwd 包目录
 * @param {string} script 脚本命令
 * @param {number} timeoutMs 超时毫秒
 * @param {Record<string, string>} [extraEnv] 追加的环境变量
 * @returns {{code: number|null, stdout: string, stderr: string, note?: string}}
 *   超时按 124 记（与 coreutils timeout 一致）；被信号终止或输出超限时 `code` 为
 *   `null` 并在 `note` 里说明原因——**不折算成 1**，否则「没有退出码」会被读成
 *   「退出码 1」，与真正的测试失败混为一谈。
 */
export function runScript(cwd, script, timeoutMs, extraEnv = {}) {
  const binDir = join(cwd, 'node_modules', '.bin')
  const env = { ...process.env, ...extraEnv, PATH: `${binDir}:${process.env.PATH ?? ''}` }
  try {
    const stdout = execFileSync('sh', ['-c', script], {
      cwd,
      env,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: SCRIPT_MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, stdout: String(stdout).slice(-SCRIPT_OUTPUT_TAIL), stderr: '' }
  } catch (error) {
    const stdout = String(error.stdout ?? '').slice(-SCRIPT_OUTPUT_TAIL)
    const stderr = String(error.stderr ?? '').slice(-SCRIPT_OUTPUT_TAIL)
    // 超时按 124 记（与 coreutils timeout 一致）。**两个字段都要查**：Node v26 实测
    // `execFileSync` 超时时 `error.killed` 是 `undefined`，判别字段是
    // `error.code === 'ETIMEDOUT'`（signal 为 SIGTERM、status 为 null）。旧代码只查
    // `error.killed`，超时于是掉进下面的 `?? 1` 被报成「退出码 1」——文档声明的 124
    // 从未生效，超时与测试失败在报告里长得一模一样（ADR-0043）。
    if (error.killed === true || error.code === 'ETIMEDOUT') {
      return { code: 124, stdout, stderr, note: `超时 ${timeoutMs}ms` }
    }
    const note =
      error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
        ? `输出超过 maxBuffer ${SCRIPT_MAX_BUFFER} 字节`
        : error.signal
          ? `被信号 ${error.signal} 终止`
          : undefined
    return {
      code: typeof error.status === 'number' ? error.status : null,
      stdout,
      stderr,
      ...(note ? { note } : {}),
    }
  }
}
