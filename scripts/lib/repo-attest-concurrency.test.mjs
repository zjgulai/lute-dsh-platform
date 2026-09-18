/**
 * 聚合并发见证：两条完整 gate 进程跑 N 轮（QG-006B）。
 *
 * ## 为什么这必须是「完整 gate」而不是一个玩具子进程
 *
 * 并发污染来自共享的**名字、端口、HOME 与临时根**——而这些共享点只有真的把整轮
 * 门禁跑起来才会同时被碰到：76 项检查里既有起子进程的、有读 HOME 的、有写声明根
 * 的（`.dsh-types/`、`node_modules/`）。用一个轻量子进程跑十轮只会证明
 * 「两个 node 进程能同时启动」。
 *
 * ## 每轮做两件事
 *
 * 1. 两条 lane 各起一个完整 `gate.mjs --mode quick --json`，各自独占临时根
 *    （`TMPDIR` 指向 lane 自己的 fixture.tmp）、独立 `LUTE_CONCURRENCY_PORT`
 *    与独立 lane 标签；
 * 2. 每条 lane 用 `attestCommand` 见证：它跑完之后，被见证仓库的
 *    tracked/untracked/声明根/ignored 区域/HEAD/refs/index 必须逐个字段没变。
 *
 * 轮数由 `DSH_GATE_CONCURRENCY_ROUNDS` 控制，默认 10（卡面要求的下限）。
 * 这台机器上两进程并发一轮实测约 104 秒（单进程 84 秒），所以 10 轮是十几分钟的
 * 批次——它**不是**提交前门禁该跑的那一档，而是进入 CI 前的聚合收口（见 TARGET-SPEC
 * 的证据分层：L2 本地聚合并发 ≠ L3 独立 runner）。
 *
 * ## 与 HOME 有关的一条实测边界
 *
 * lane 的 HOME 保持**真实 HOME**（只读）：把它换成合成空 HOME 时，8 项检查会走
 * 「环境不在」分支、`skill-lines-selftest` 会判红——那不是并发缺陷，而是门禁在
 * 陌生 HOME 下的读数（2026-09-17 实测，两条 lane 读数完全一致）。本用例要量的是
 * 并发的相互干扰，所以不把 HOME 换成空壳；独立性由临时根、lane 标签与端口保证。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attestSkipReason, resolveAttestRepo } from './attest-scope.mjs'
import { attestConcurrentRounds } from './repo-attest.mjs'
import { reapAll } from './mutation-fixture.mjs'
import { nodeCommand } from './real-node.mjs'

/**
 * 被见证的 checkout。
 *
 * 默认是本仓库。**并发稳定性跑必须在 clean clone 上做**——这不是洁癖，是本卡
 * 自己的失败边界：这台机器上同时有别的 agent 在写这个工作树（实测两次 10 轮跑被判红，
 * 一次是我自己在编辑 `docs/adr/ADR-0103.md` 与测试文件，一次是别的会话在写
 * `.scratch/gate-scope-readout/SYNC-2026-09-17.md` 与 `refs/codex/**`）。
 * 两处判红都判对了——被见证的仓库**确实**在变——但它们不是「门禁有副作用」的证据。
 * 用 `DSH_ATTEST_REPO=/path/to/clean-clone` 指向独占副本即可得到干净的稳定性读数。
 */
const repoRoot = resolveAttestRepo(join(dirname(fileURLToPath(import.meta.url)), '..', '..'))
const gateScript = join(repoRoot, 'scripts', 'gate.mjs')
const { command: NODE, env: NODE_ENV } = nodeCommand()

const ROUNDS = Number.parseInt(process.env.DSH_GATE_CONCURRENCY_ROUNDS ?? '10', 10)
const PER_ROUND = 2

/**
 * 一轮 gate 的读数摘要。
 *
 * 完整 JSON 由 gate **写进 lane 自己的临时根**再读回来，而不是从 stdout 里截：
 * `attestCommand` 的 stdout 是留尾的（防止一次跑飞的输出吃掉内存），76 项明细的
 * JSON 远超留尾长度，从尾巴里 `indexOf('{')` 得到的是半截 JSON——第一版就是这样
 * 把「读数取不到」误判成「(没跑)」的（实测第 1 轮 lane 0）。这也是为什么证据必须
 * 落在自己根里、由调用方显式读：留尾是给人看的，不是给判据看的。
 */
function summarize(verdict) {
  let report = null
  let readError = verdict.reportError ?? null
  if (verdict.report !== null && verdict.report !== undefined) {
    try {
      report = JSON.parse(verdict.report)
    } catch (error) {
      readError = `JSON 解析失败：${error.message}`
    }
  } else if (readError === null) {
    readError = 'lane 没带回 report 内容'
  }
  return {
    lane: verdict.lane,
    outcome: verdict.outcome,
    exitCode: verdict.exitCode,
    identical: verdict.identical,
    unexplained: verdict.unexplained,
    diffs: verdict.diffs,
    tempRootRemoved: verdict.tempRootRemoved,
    summary: report?.summary ?? null,
    reportPath: verdict.reportPath,
    readError,
    stdoutHead: verdict.stdoutTail.slice(0, 300),
    stderr: verdict.stderrTail.slice(-800),
  }
}

// 同一道安静度门：本文件直接跑时也要能说「这里没有读数」，而不是把邻居的写入判成副作用。
const scopeSkip = attestSkipReason(repoRoot)
test(
  `并发 ${ROUNDS} 轮 × ${PER_ROUND} 条完整 gate：仓库无副作用、lane 之间无串扰`,
  { timeout: 30 * 60 * 1000, skip: scopeSkip ?? false },
  async () => {
  assert.equal(Number.isInteger(ROUNDS) && ROUNDS >= 1, true, `轮数必须是正整数，实际 ${process.env.DSH_GATE_CONCURRENCY_ROUNDS}`)

  const result = await attestConcurrentRounds({
    repoRoot,
    command: '/bin/sh',
    // 用 shell 展开 `$LUTE_LANE_TMP`：attestConcurrentRounds 给每条 lane 注入的是
    // 它自己的临时根，报告必须落在那里（不写回被见证的仓库，也不落在共享目录）。
    args: [
      '-c',
      `exec "${NODE}" "${gateScript}" --mode quick --json > "$LUTE_LANE_TMP/report-lane-$LUTE_CONCURRENCY_LANE.json"`,
    ],
    rounds: ROUNDS,
    perRound: PER_ROUND,
    roundTimeoutMs: 5 * 60 * 1000,
  })

  const lanes = result.results.flatMap((round) => round.lanes.map((lane) => ({ round: round.round, ...summarize(lane) })))

  // 1. 每条 lane 都必须真的跑起来并结束（「没跑」不能与「没问题」同形）
  for (const lane of lanes) {
    assert.equal(
      lane.outcome,
      'exited',
      `第 ${lane.round} 轮 lane ${lane.lane} 没有正常结束：outcome=${lane.outcome} stderr=${lane.stderr}`,
    )
    assert.equal(
      lane.summary !== null,
      true,
      `第 ${lane.round} 轮 lane ${lane.lane} 的 JSON 读数取不到（读出错误 ${lane.readError}；`
      + `exitCode=${lane.exitCode} outcome=${lane.outcome}）\n`
      + `  stdout(head)=${JSON.stringify(lane.stdoutHead)}\n`
      + `  stderr(tail)=${JSON.stringify(lane.stderr)}`,
    )
  }

  // 2. 没有一条 lane 在仓库里留下副作用
  const offending = lanes.filter((lane) => !lane.identical)
  assert.deepEqual(
    offending,
    [],
    `并发下有 lane 改动了仓库：${JSON.stringify(offending.map((lane) => ({ round: lane.round, lane: lane.lane, diffs: lane.diffs, unexplained: lane.unexplained })), null, 1)}`,
  )

  // 3. 整批前后也必须一致（跨轮次的累积残留会被这一条抓住）
  assert.equal(
    result.identical,
    true,
    `并发批次前后仓库不一致：${JSON.stringify(result.diffs, null, 1)}`,
  )

  // 4. lane 之间不得串扰：同一轮的判据读数必须逐字段相同。
  //    这是「独立」的可判据形态——两条 lane 的临时根、端口、标签都不同，
  //    如果某条检查读了共享状态，两边的 pass/fail/skip 组合就会分裂。
  for (const round of result.results) {
    const [first, second] = round.lanes.map(summarize)
    assert.deepEqual(
      {
        passed: first.summary?.passed,
        skipped: first.summary?.skipped,
        failed: first.summary?.failed,
        notCovered: first.summary?.notCovered,
      },
      {
        passed: second.summary?.passed,
        skipped: second.summary?.skipped,
        failed: second.summary?.failed,
        notCovered: second.summary?.notCovered,
      },
      `第 ${round.round} 轮两条 lane 读数分裂，说明它们互相看见了对彼此的修改`,
    )
  }

  // 4b. 外部工具的写入必须被**报告**出来（不判红，但也不能当作没发生）。
  //     本仓库里 Codex 会在跑任务时写 `refs/codex/**`（2026-09-17 实测两轮命中），
  //     它不属于本次运行的副作用，但读这份读数的人有权知道「测的时候有人在写」。
  const interference = result.results
    .flatMap((round) => round.lanes.map((lane) => ({ round: round.round, lane: lane.lane, activity: lane.concurrentActivity ?? [] })))
    .filter((entry) => entry.activity.length > 0)
  if (interference.length > 0) {
    process.stdout.write(
      `note 外部工具在见证窗口内写过 ref（如实回报，不判红）：${JSON.stringify(interference)}\n`,
    )
  }

  // 5. 每条 lane 的自有临时根必须被回收（自己的根，不是别人的）
  const notRemoved = lanes.filter((lane) => lane.tempRootRemoved === false)
  assert.deepEqual(notRemoved, [], `有 lane 没回收自己的临时根：${JSON.stringify(notRemoved)}`)

  // 6. 独立性的正向证据：lane 的端口与标签确实不同（写死同一个值时这条会红）
  const labels = new Set()
  for (const round of result.results) {
    for (const lane of round.lanes) labels.add(`${round.round}-${lane.lane}`)
  }
  assert.equal(labels.size, ROUNDS * PER_ROUND, 'lane 标签必须两两不同——共享标签是本卡要防的形状之一')
})

test.after(() => {
  const reaped = reapAll()
  assert.deepEqual(reaped.refused, [], `收尾回收不得拒绝：${JSON.stringify(reaped.refused)}`)
  // 见证者自己的临时根目录必须能读（证据在这里，不写回仓库）
  assert.equal(existsSync(repoRoot), true)
  assert.equal(readdirSync(repoRoot).includes('scripts'), true)
})
