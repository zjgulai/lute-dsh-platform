/**
 * 侧效应见证：六条结束路径（QG-006B）。
 *
 * ## 为什么要起真子进程，而不是断言函数返回值
 *
 * 「跑完没改动仓库」是一句关于**一次运行**的话。在测试进程里模拟运行，量到的是
 * 自己的替身：`process.on('exit')` 只有进程真的结束才成立，SIGTERM 只有真的被
 * 信号杀死才成立，`finally` 更是覆盖不到任何一条。所以六条路径全部起真子进程。
 *
 * ## 六条路径与各自的故意形状
 *
 * | 路径 | 故意形状 | 期望 |
 * |---|---|---|
 * | 正常 | 退出 0 | 仓库逐字段不变 |
 * | assertion failure | 断言抛错 | 同上，且退出码非零 |
 * | checker non-zero | 显式非零退出 | 同上 |
 * | fixture setup failure | 在**真实仓库内**建 fixture | 拒绝创建，仓库不变 |
 * | cleanup failure | 根被换 inode | 拒绝删除替换根，仓库不变 |
 * | SIGTERM | 跑起来后被信号杀死 | 仓库不变，自有根已被回收 |
 *
 * 「仓库不变」在每一条里都由 `attestCommand` 的 before/after digest 判定，不是
 * 由子进程自己声明的——子进程是被见证的对象，它说自己干净不算证据。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attestSkipReason, resolveAttestRepo } from './attest-scope.mjs'
import { createMutationFixture, liveFixtureRoots, mutationRoot, reapAll } from './mutation-fixture.mjs'
import { attestCommand } from './repo-attest.mjs'
import { identical, snapshotRepo } from './repo-snapshot.mjs'
import { nodeCommand } from './real-node.mjs'

const repoRoot = resolveAttestRepo(join(dirname(fileURLToPath(import.meta.url)), '..', '..'))
const LIB = fileURLToPath(new URL('.', import.meta.url))

/**
 * 这份用例集量的是「一次运行有没有改动被见证的仓库」，所以在**别的进程正在写**这个
 * checkout 时它没有读数可言（ADR-0103 的失败边界）。安静度探测把它分成三种结果：
 * 跑（安静）、跑（`DSH_ATTEST_REPO` 指定了独占副本）、跳过（有人在写）。
 * 跳过时**不**把邻居的写入说成门禁的副作用，也不谎报通过。
 */
const scopeSkip = attestSkipReason(repoRoot)
if (scopeSkip !== null) {
  test('见证用例集：本仓库当前被外部写入，跳过（不给读数，也不判红）', { skip: scopeSkip }, () => {})
}
const { command: NODE, env: NODE_ENV } = nodeCommand()

/** 故意写进真实仓库的那个文件名；用例结束时必须删掉。 */
const LEAK_NAME = 'attest-deliberate-leak.txt'

/** 每条用例一个见证者根：证据写在这里，**不写回被见证的仓库**。 */
function witnessRoot() {
  return mutationRoot('gate-witness-')
}

/** 让子进程执行一段模块化脚本；返回值只用于断言「它确实跑过」。 */
async function runProbe(script, { tmpRoot, signals = [], timeoutMs = 120000 } = {}) {
  return attestCommand({
    repoRoot,
    command: NODE,
    args: ['--input-type=module', '-e', script],
    env: { ...NODE_ENV, WITNESS_LIB: LIB },
    tmpRoot,
    signals,
    timeoutMs,
  })
}

test('路径 1/6 正常退出：仓库逐字段不变，且见证读数说明自己看过多大射程', async () => {
  const root = witnessRoot()
  const verdict = await runProbe('process.stdout.write("probe-ok\\n")', { tmpRoot: root })

  assert.equal(verdict.outcome, 'exited')
  assert.equal(verdict.exitCode, 0)
  assert.equal(verdict.identical, true, `正常路径必须零差异，实际 ${JSON.stringify(verdict.diffs)}`)
  assert.equal(verdict.beforeDigest, verdict.afterDigest)
  // 射程非空：空射程与「没有变化」在 digest 上同形，只有一条是真的
  assert.ok(verdict.plan.before.tracked > 100, `见证射程必须是真仓库，实际 tracked=${verdict.plan.before.tracked}`)
  assert.equal(existsSync(root), true, '见证者根是证据，必须留着供人复查')
})

test('路径 2/6 assertion failure：断言抛错后仓库仍逐字段不变', async () => {
  const root = witnessRoot()
  const verdict = await runProbe(
    'process.stdout.write("before-assert\\n")\nthrow new Error("deliberate assertion failure")',
    { tmpRoot: root },
  )

  assert.equal(verdict.outcome, 'exited')
  assert.notEqual(verdict.exitCode, 0, '故意抛错必须非零退出，否则这条路径没被真的走到')
  assert.equal(verdict.identical, true, `断言失败路径必须零差异，实际 ${JSON.stringify(verdict.diffs)}`)
})

test('路径 3/6 checker 非零：判红路径同样不得留下副作用', async () => {
  const root = witnessRoot()
  const verdict = await runProbe(
    'process.stdout.write("checker says no\\n")\nprocess.exitCode = 3',
    { tmpRoot: root },
  )

  assert.equal(verdict.outcome, 'exited')
  assert.equal(verdict.exitCode, 3)
  assert.equal(verdict.identical, true, `非零退出路径必须零差异，实际 ${JSON.stringify(verdict.diffs)}`)
})

test('路径 4/6 fixture setup failure：在真实仓库里建 fixture 必须被拒绝，仓库不变', async () => {
  const root = witnessRoot()
  // 故意把 tempParent 指向被见证的仓库：这是 mutation fixture 的失败边界，
  // 而失败边界本身也必须零副作用（拒绝创建，而不是创建后清理）。
  const verdict = await runProbe(
    [
      'const { createMutationFixture } = await import(`${process.env.WITNESS_LIB}mutation-fixture.mjs`)',
      'try {',
      '  createMutationFixture({ prefix: "must-be-refused", tempParent: process.cwd() })',
      '  process.stdout.write("NOT-REFUSED\\n")',
      '  process.exitCode = 9',
      '} catch (error) {',
      '  process.stdout.write(`refused:${error.code}\\n`)',
      '}',
    ].join('\n'),
    { tmpRoot: root },
  )

  assert.equal(verdict.outcome, 'exited')
  assert.match(verdict.stdoutTail, /refused:FIXTURE_PARENT/, '在受保护目录里建 fixture 必须被拒绝')
  assert.equal(verdict.identical, true, `拒绝路径必须零差异，实际 ${JSON.stringify(verdict.diffs)}`)
})

test('路径 5/6 cleanup failure：根被换 inode 时拒绝删除，且不恢复他人状态', async () => {
  const root = witnessRoot()
  const verdict = await runProbe(
    [
      'const { existsSync, rmSync, mkdirSync, writeFileSync } = await import("node:fs")',
      'const { join } = await import("node:path")',
      'const { createMutationFixture } = await import(`${process.env.WITNESS_LIB}mutation-fixture.mjs`)',
      // 先把 fixture 建在**仓库内**是不可能的（上面的失败边界会拒绝），
      // 所以这里从仓库外建、再把它自己删除后重建同名目录，制造 ownership 变化。
      'const fixture = createMutationFixture({ prefix: "cleanup-refusal" })',
      'rmSync(fixture.root, { recursive: true, force: true })',
      'mkdirSync(fixture.root)',
      'writeFileSync(join(fixture.root, "replacement.txt"), "not owned\\n")',
      'try {',
      '  fixture.cleanup()',
      '  process.stdout.write("NOT-REFUSED\\n")',
      '  process.exitCode = 9',
      '} catch (error) {',
      '  process.stdout.write(`cleanup-refused:${error.code}\\n`)',
      '  process.stdout.write(`survives:${existsSync(join(fixture.root, "replacement.txt"))}\\n`)',
      '}',
    ].join('\n'),
    { tmpRoot: root },
  )

  assert.equal(verdict.outcome, 'exited')
  assert.match(verdict.stdoutTail, /cleanup-refused:FIXTURE_OWNERSHIP_CHANGED/, '换过 inode 的根必须拒绝删除')
  assert.match(verdict.stdoutTail, /survives:true/, '替换根的内容不得被删掉')
  assert.equal(verdict.identical, true, `cleanup 失败路径必须零差异，实际 ${JSON.stringify(verdict.diffs)}`)
})

test('路径 6/6 SIGTERM：信号杀死进程后仓库不变，且自有根被回收', async () => {
  const root = witnessRoot()
  // 探针先建一个自有根并挂住，然后由见证者发信号——这正是实测里留下 8 个
  // 临时根、并把一个 node 进程变成 init 子进程的那条路径。
  const verdict = await runProbe(
    [
      'const { mkdirSync, writeFileSync, existsSync } = await import("node:fs")',
      'const { join } = await import("node:path")',
      'const { mutationRoot } = await import(`${process.env.WITNESS_LIB}mutation-fixture.mjs`)',
      'const own = mutationRoot("sigterm-probe-")',
      'mkdirSync(join(own, "payload"), { recursive: true })',
      'writeFileSync(join(own, "payload", "x.txt"), "x\\n")',
      'process.stdout.write(`OWN=${own}\\n`)',
      'setInterval(() => {}, 1000)',
    ].join('\n'),
    { tmpRoot: root, signals: [{ signal: 'SIGTERM', afterMs: 1500 }] },
  )

  assert.equal(verdict.outcome, 'signalled', `必须真的死于信号，实际 ${verdict.outcome}/${verdict.exitCode}`)
  assert.equal(verdict.exitSignal, 'SIGTERM')
  const own = /OWN=(.+)/.exec(verdict.stdoutTail)?.[1]?.trim()
  assert.ok(own !== undefined && own.length > 0, `探针必须报出自有根，实际输出：${verdict.stdoutTail}`)
  assert.equal(existsSync(own), false, 'SIGTERM 之后自有根必须已被回收')
  assert.equal(verdict.identical, true, `SIGTERM 路径必须零差异，实际 ${JSON.stringify(verdict.diffs)}`)
})

test('证据不写回被见证仓库：见证者根与仓库内都没有 witness 产物', async () => {
  const root = witnessRoot()
  const before = snapshotRepo(repoRoot)
  await runProbe('process.stdout.write("evidence-check\\n")', { tmpRoot: root })
  const verdict = identical(before, snapshotRepo(repoRoot))

  assert.equal(verdict.identical, true, `见证不得给仓库新增任何文件，实际 ${JSON.stringify(verdict.diffs)}`)
  assert.equal(existsSync(root), true, '证据留在见证者根里')
  // 反向：仓库里不得出现任何以见证者根命名的目录
  assert.equal(existsSync(join(repoRoot, root.split('/').pop())), false)
})

test('并发轮的首轮探针：两个 lane 各自独立，互不覆盖', async () => {
  const first = createMutationFixture({ prefix: 'attest-lane-a' })
  const second = createMutationFixture({ prefix: 'attest-lane-b' })
  try {
    assert.notEqual(first.root, second.root)
    assert.notEqual(first.tmp, second.tmp)
    writeFileSync(join(first.tmp, 'lane.txt'), 'a\n')
    writeFileSync(join(second.tmp, 'lane.txt'), 'b\n')
    assert.equal(existsSync(join(first.tmp, 'lane.txt')), true)
  } finally {
    first.cleanup()
    second.cleanup()
  }
  const leftover = liveFixtureRoots()
  for (const root of [first.root, second.root]) {
    assert.equal(leftover.includes(root), false, `${root} 不该留在回收表里`)
  }
  const reaped = reapAll()
  assert.deepEqual(reaped.refused, [], `回收不得拒绝任何自有根：${JSON.stringify(reaped.refused)}`)
  // tmpdir 必须可用：见证者根建在系统临时目录里，不是仓库里
  assert.equal(existsSync(tmpdir()), true)
})

test('契约：见证判定把「有差异」与「差异说不清」分开报告', async () => {
  const root = witnessRoot()
  // 故意写进真实仓库的那一个文件，用完必须删掉：**见证者自己不能变成副作用源**。
  // 这条不是洁癖——第一版没有清理，于是下一次跑同一条用例时「写进去的文件」已经
  // 存在，判据看到的是「没有变化」，用例假红，而假红的解释看起来像工具坏了。
  //
  // 清理放在本条用例体内，不放 `t.after`：`after` 在**下一条用例之后**才跑，
  // 中间有一整个窗口期让残留文件毒害别人的 before 快照（实测就是如此）。
  const verdict = await runProbe(
    [
      'const { writeFileSync } = await import("node:fs")',
      `writeFileSync(${JSON.stringify(LEAK_NAME)}, "x\\n")`,
    ].join('\n'),
    { tmpRoot: root },
  )
  rmSync(join(repoRoot, LEAK_NAME), { force: true })
  assert.equal(
    verdict.identical,
    false,
    `写进仓库的文件必须被判红——否则这条见证没有牙。`
    + `探针 stdout=${JSON.stringify(verdict.stdoutTail)} stderr=${JSON.stringify(verdict.stderrTail.slice(-400))}`,
  )
  assert.equal(verdict.unexplained, false, '差异必须能解释到具体路径')
  assert.ok(
    verdict.diffs.some((diff) => diff.path === LEAK_NAME),
    `差异必须点名到那个文件，实际 ${JSON.stringify(verdict.diffs)}`,
  )
})

test.after(() => {
  // 用里留下的自有根由 reaper 回收；这里只断言它确实收干净了
  const reaped = reapAll()
  const stillThere = liveFixtureRoots()
  assert.deepEqual(reaped.refused, [], `收尾回收不得拒绝：${JSON.stringify(reaped.refused)}`)
  assert.deepEqual(stillThere, [], `收尾时不得还有自有根：${stillThere.join('、')}`)
})
