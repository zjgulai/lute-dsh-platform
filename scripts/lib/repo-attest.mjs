/**
 * Side-effect attestation harness (QG-006B).
 *
 * Why a harness and not just an assertion: "the gate changed nothing" is a
 * claim about a *run*, not about a function. The only way to earn it is to
 * snapshot, actually run the thing, snapshot again, and compare — on every
 * ending path, including the ones that are supposed to be endings (failure,
 * signal). A helper that asserted this for a simulated run would be measuring
 * its own double.
 *
 * What this harness deliberately does **not** do:
 *
 * - It never writes evidence into the attested checkout. Evidence lives under
 *   the caller's own temp root and is returned as data; a harness that dumps
 *   reports into the repository would be the very side effect it measures.
 * - It never retries silently. If the before/after delta is non-empty the
 *   verdict carries the typed diff, which is the only thing that makes
 *   "someone else was writing" distinguishable from "we were writing".
 * - It never runs the child inside its own process group by accident:
 *   `detached: true` puts the child in a fresh group so the whole tree can be
 *   signalled, which is how a SIGTERM path is tested without leaving the
 *   grandchildren running (observed: a plain `kill` on the gate left a child
 *   `node scripts/gate.mjs` reparented to init).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { createMutationFixture } from './mutation-fixture.mjs'
import { identical, snapshotRepo } from './repo-snapshot.mjs'

export class AttestError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'AttestError'
    this.code = code
    this.details = details
  }
}

function fail(code, message, details) {
  throw new AttestError(code, message, details)
}

const TERMINAL = new Set(['exited', 'signalled', 'timeout', 'spawn-error'])

/**
 * 只在 `unexplained` 上重试的次数。并发 git 的瞬时锁在快照里与「真有未归因变化」
 * 同形（见 repo-snapshot.mjs 的 readTransientMarkers），重试是唯一能把两者分开的
 * 手段；具名差异一次都不重试。
 */
const SNAPSHOT_RETRIES = 3
const RETRY_DELAY_MS = 150

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/**
 * Spawn a command inside a fresh process group and resolve when it ends.
 *
 * `signals` lets a test drive the interruption path: the signal is delivered
 * to the whole group after `afterMs`, exactly as a terminal would deliver it to
 * a foreground job, so any descendant that survives is a real leak rather than
 * an artifact of signalling only the direct child.
 */
function spawnInGroup(command, args, { cwd, env, timeoutMs, signals = [] }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let outcome = null
    let signalError = null

    const timers = []
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })

    const finish = (kind, code, signal) => {
      if (outcome !== null) return
      outcome = { kind, code, signal }
      for (const timer of timers) clearTimeout(timer)
      resolve({ ...outcome, stdout, stderr, signalError })
    }

    child.on('error', (error) => {
      signalError = `${error.code ?? 'ERROR'}: ${error.message}`
      finish('spawn-error', null, null)
    })
    child.on('exit', (code, signal) => {
      if (signal !== null && signal !== undefined) finish('signalled', code, signal)
      else finish('exited', code, null)
    })

    for (const { signal, afterMs } of signals) {
      timers.push(setTimeout(() => {
        try {
          process.kill(-child.pid, signal)
        } catch (error) {
          signalError = `${signalError === null ? '' : `${signalError}; `}group-kill ${signal}: ${error.code ?? error.message}`
        }
      }, afterMs))
    }
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timers.push(setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch { /* already gone */ }
        finish('timeout', null, 'SIGKILL')
      }, timeoutMs))
    }
  })
}

/**
 * Run one command and attest that it left the attested checkout unchanged.
 *
 * @param {object} options
 * @param {string} options.repoRoot checkout to attest (never written by this module)
 * @param {string} options.command executable
 * @param {string[]} [options.args]
 * @param {NodeJS.ProcessEnv} [options.env] extra environment for the child
 * @param {string} [options.tmpRoot] caller-owned dir for TMPDIR/HOME isolation
 * @param {string[]} [options.signals] `{signal, afterMs}` entries
 * @param {number} [options.timeoutMs]
 * @returns {Promise<object>} verdict with before/after digests, spawned PIDs and the delta
 */
export async function attestCommand(options) {
  const {
    repoRoot,
    command,
    args = [],
    env = {},
    tmpRoot,
    signals = [],
    timeoutMs = 0,
  } = options
  if (typeof repoRoot !== 'string' || !isAbsolute(repoRoot)) {
    fail('ATTEST_ROOT_INVALID', 'repoRoot 必须是绝对路径', { repoRoot })
  }
  if (typeof command !== 'string' || command.length === 0) {
    fail('ATTEST_COMMAND_INVALID', 'command 必须是非空字符串', { command })
  }

  const before = snapshotRepo(repoRoot)
  // 隔离的是**写入面**（TMPDIR），不是**读取面**（HOME）。
  //
  // 第一版把 HOME 也换成了 lane 自己的空壳，于是 `--mode quick` 在一个陌生 HOME 下
  // 有 8 项走「环境不在」分支、skill-lines-selftest 判红——那不是并发缺陷，是把
  // 「门禁在本机 HOME 下的读数」换成了「门禁在合成 HOME 下的读数」，而后者不覆盖
  // 真正的射程。HOME 保持真实且只读；临时根、lane 标签与端口才是独立变量。
  const childEnv = {
    ...process.env,
    ...env,
    ...(tmpRoot === undefined ? {} : { TMPDIR: tmpRoot }),
  }
  if (tmpRoot !== undefined) mkdirSync(tmpRoot, { recursive: true })

  const proc = await spawnInGroup(command, args, {
    cwd: repoRoot,
    env: childEnv,
    timeoutMs,
    signals,
  })
  let after = snapshotRepo(repoRoot)
  let comparison = identical(before, after)
  let transient = { observed: false, confirmed: false, attempts: 0 }
  // Retry policy, and why it is narrow: the *only* thing a re-check can excuse is
  // the `unexplained` flag — a digest that moved with no atttributable change —
  // which is exactly the shape a transient `.git/*.lock` produces (it is an
  // ignored area, and ignored areas can only add or change). Any named diff
  // fails immediately and is never retried. A lock that is still on disk after
  // the retries stays unexplained and therefore fatal: that is a killed writer's
  // leftover, not a concurrent read.
  for (let attempt = 1; attempt <= SNAPSHOT_RETRIES && comparison.unexplained; attempt += 1) {
    transient = { observed: true, confirmed: false, attempts: attempt }
    await sleep(RETRY_DELAY_MS)
    after = snapshotRepo(repoRoot)
    comparison = identical(before, after)
    if (!comparison.unexplained) {
      transient = { observed: true, confirmed: true, attempts: attempt }
      break
    }
  }

  return {
    command,
    args,
    outcome: TERMINAL.has(proc.kind) ? proc.kind : 'unknown',
    exitCode: proc.code,
    exitSignal: proc.signal,
    signalError: proc.signalError,
    stdoutTail: proc.stdout.slice(-4000),
    stderrTail: proc.stderr.slice(-4000),
    beforeDigest: comparison.beforeDigest,
    afterDigest: comparison.afterDigest,
    identical: comparison.identical,
    diffCount: comparison.diffCount,
    // 差异能不能解释，与有没有差异是两件事：digest 动了却指不出路径时必须
    // 显式说出来，否则读数长得像工具坏了（见 repo-snapshot.mjs 的 identical）。
    unexplained: comparison.unexplained,
    truncated: comparison.truncated,
    diffs: comparison.diffs,
    transient,
    // 外部写入者（具名 ref 命名空间）在本次见证窗口内的活动：如实回报，不参与判定。
    // 有它才分得清「门禁改了仓库」与「测的这段时间别的工具在写这个仓库」。
    concurrentActivity: comparison.concurrentActivity,
    plan: comparison.plan,
    ...(tmpRoot === undefined ? {} : { tmpRoot }),
  }
}

/**
 * Run `rounds` rounds of `perRound` concurrent commands, each with its own
 * HOME/TMPDIR/profile, and attest the checkout after every one of them.
 *
 * Independence is not "different arguments": each process gets a distinct
 * temp root, a distinct profile, and — when the caller asks for it — a distinct
 * listening port, so a shared name, port or home that only shows up under
 * concurrency is a failure rather than a scheduling accident.
 */
export async function attestConcurrentRounds({
  repoRoot,
  command,
  args = [],
  rounds = 2,
  perRound = 2,
  roundTimeoutMs = 900000,
  signalRound = null,
  onRound = null,
} = {}) {
  if (!Number.isInteger(rounds) || rounds < 1) {
    fail('ATTEST_ROUNDS_INVALID', `rounds 必须是正整数：${rounds}`, { rounds })
  }
  if (!Number.isInteger(perRound) || perRound < 2) {
    fail('ATTEST_PER_ROUND_INVALID', `perRound 至少为 2（并发才有意义）：${perRound}`, { perRound })
  }
  const signalAt = signalRound === null
    ? null
    : { round: signalRound.round ?? 1, afterMs: signalRound.afterMs ?? 30000, lane: signalRound.lane ?? 0 }
  if (signalAt !== null && (signalAt.round < 1 || signalAt.round > rounds || signalAt.lane >= perRound)) {
    fail('ATTEST_SIGNAL_ROUND_INVALID', 'signalRound 必须落在已声明的轮次与 lane 内', {
      signalRound,
      rounds,
      perRound,
    })
  }

  const results = []
  const before = snapshotRepo(repoRoot)
  for (let round = 1; round <= rounds; round += 1) {
    const fixtures = []
    for (let lane = 0; lane < perRound; lane += 1) {
      fixtures.push(createMutationFixture({ prefix: `gate-concurrent-r${round}-l${lane}` }))
    }

    const lanes = fixtures.map(async (fixture, lane) => {
      const signals = signalAt !== null && signalAt.round === round && signalAt.lane === lane
        ? [{ signal: 'SIGTERM', afterMs: signalAt.afterMs }]
        : []
      let verdict
      try {
        verdict = await attestCommand({
          repoRoot,
          command,
          args,
          env: {
            ...fixture.environment,
            LUTE_CONCURRENCY_LANE: `${round}-${lane}`,
            // 判据要读的整份 JSON 落在 lane 自己的临时根里：stdout 是留尾的，
            // 而留尾的长度不属于判据合同。调用方按 `reportPath` 读全量读数。
            LUTE_LANE_TMP: fixture.tmp,
            // Lane-specific port: a shared fixed port then fails the run
            // instead of passing by luck on a quiet machine.
            LUTE_CONCURRENCY_PORT: String(41000 + round * 10 + lane),
          },
          tmpRoot: fixture.tmp,
          signals,
          timeoutMs: roundTimeoutMs,
        })
      } catch (error) {
        // A lane whose见证 itself failed must still clean up and must not be
        // reported as "no results": an absent lane and a clean lane would
        // otherwise read the same way.
        try { fixture.cleanup() } catch { /* reported below */ }
        return {
          lane,
          laneLabel: `${round}-${lane}`,
          tempRoot: fixture.root,
          tempRootRemoved: !existsSync(fixture.root),
          attestError: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`,
          reportPath: join(fixture.tmp, `report-lane-${round}-${lane}.json`),
          report: null,
          reportError: '见证本身失败，未产出读数',
        }
      }

      // 证据必须在 cleanup **之前**读出来。
      //
      // 第一版把 cleanup 放在 `finally` 里、把读证据放在之后，于是 lane 自己的
      // 临时根（连同里面的整份 JSON 读数）先被删掉，调用方拿到 ENOENT——「证据
      // 留不住」与「没跑」在读数上同形，正是本卡要防的形状（实测第 1 轮 lane 0）。
      const reportPath = join(fixture.tmp, `report-lane-${round}-${lane}.json`)
      let report = null
      let reportError = null
      try {
        report = readFileSync(reportPath, 'utf8')
      } catch (error) {
        reportError = `${error.code ?? error.message}：${reportPath}`
      }
      try {
        fixture.cleanup()
      } catch { /* the lane verdict reports the repository side; cleanup is re-checked below */ }

      return {
        ...verdict,
        lane,
        laneLabel: `${round}-${lane}`,
        tempRoot: fixture.root,
        tempRootRemoved: !existsSync(fixture.root),
        reportPath,
        report,
        reportError,
      }
    })

    results.push({ round, lanes: await Promise.all(lanes) })
    if (typeof onRound === 'function') onRound(results[results.length - 1])
  }

  const after = snapshotRepo(repoRoot)
  const comparison = identical(before, after)
  return {
    rounds,
    perRound,
    results,
    identical: comparison.identical,
    unexplained: comparison.unexplained,
    concurrentActivity: comparison.concurrentActivity,
    beforeDigest: comparison.beforeDigest,
    afterDigest: comparison.afterDigest,
    diffs: comparison.diffs,
  }
}

/** Remove a caller-owned temp root; refuses to touch anything else. */
export function removeTempRoot(tmpRoot) {
  if (typeof tmpRoot !== 'string' || !isAbsolute(tmpRoot)) {
    fail('ATTEST_TMPROOT_INVALID', 'tempRoot 必须是绝对路径', { tmpRoot })
  }
  rmSync(tmpRoot, { recursive: true, force: true })
}

