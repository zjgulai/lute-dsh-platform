/**
 * `skill-lines.mjs` 的反向自测（ADR-0085）。
 *
 * ## 为什么这些用例必须是「能说不」的
 *
 * 本项自己就是为「判据从来没有跑到」而建的（P-03/P-04）：SOP §4 与 `pipeline.sh` 一直
 * 写着要跑 `verify_static.mjs`，而 `pnpm run gate` 里没有任何一项跑过它。一个自己
 * 只会判绿的聚合器，比没有聚合器更坏——它会让「三条线都验过了」变成一句谁也没核过的话。
 *
 * 所以这里每条用例都对着一个**具体的「不」**：
 *
 * - 环境前提不在 → 必须是**跳过**（`passed: true` + note），**不是**静默通过（note 必须说清跳过了什么）；
 * - 某个验证器判红 → 必须红，且把它的原文输出带出来（否则人只看到「skill-lines 红了」，
 *   还得自己去猜是哪条线、坏在哪）；
 * - 验证器**文件不存在** → 必须红（声称在守某件事却没有消费者 = P-02 的形态）；
 * - 第三个验证器红而前两个绿 → 仍必须红（聚合逻辑不能只看第一个）；
 * - 包内一条 `*.spec.mjs` 都没有 → 必须红（空射程不得长得像通过，P-11）；
 * - 恒真桩突变**：把 `passed` 换成常量 `true`，上面这些红必须消失——所以下面用
 *   `assert.equal(r.passed, false)` 逐条钉住，而不是只看 violations 字符串。
 *
 * **S2–S7 六条**一律通过 `withSelftestHome()` 注入合成 HOME（S2/S3 是 2026-09-17 用干净 HOME
 * 跑门禁时补上的：它们同样默认读 `homedir()`，于是在没有 `~/.dsh/skills` 的机器上走早返回
 * 分支而红——而那台机器上「三条技能线还不存在」恰恰是**正常事实**）。这六条测的是**有前提时**的行为，
 * 读真实 `homedir()` 会让它们在没有 `~/.dsh/skills` 的机器上走早返回分支而红，
 * 那不是被测代码坏了，是判据读了不该读的环境（QG-006B 实测发现，见该函数注释）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withMutationFixture } from '../lib/mutation-fixture.mjs'
import { checkSkillLines, environmentPresent, VERIFIERS } from './skill-lines.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * 一个**只存在前提**的合成 HOME。
 *
 * 为什么 S4–S7 必须注入它：这几条原先调 `checkSkillLines({ repoRoot, runOne })`，
 * `home` 走了默认值 `homedir()`——于是在真机上跑到的是「环境前提不在」的早返回分支，
 * 桩一次都没被调用，四条用例以 `assertAllHit` 的名义**红着**（2026-09-17 由 QG-006B
 * 的隔离 HOME 并发跑暴露，此前只在真有 `~/.dsh/skills` 的机器上绿）。
 * 这就是 QG-006A 契约的形状：判据的输入必须由用例给出，不能读真实环境。
 */
function withSelftestHome(callback) {
  return withMutationFixture({
    prefix: 'skill-lines-selftest-home',
    prepare(fixture) {
      mkdirSync(join(fixture.home, '.dsh', 'skills'), { recursive: true })
    },
  }, (fixture) => callback(fixture.home))
}

/**
 * 让所有验证器都判绿；`red` 里列出要判红的相对路径。
 *
 * `red` 的每个 key **必须被真的匹配到一次**，否则抛错。这条守卫不是洁癖：
 * 第一版把 `verify_static.mjs` 写成了 `verify-static.mjs`（连字符 vs 下划线），
 * 于是那个「本该红」的桩一次也没生效，用例**绿着通过**——一个打错字的反向用例，
 * 比没有反向用例更坏，因为它看起来验过了。写成断言，打字错误就会响。
 */
function stubRun(red = {}, { emptyStdout = false } = {}) {
  const hit = new Set()
  const run = (rel) => {
    const key = Object.keys(red).find((k) => rel.endsWith(k) || rel === k)
    if (key) {
      hit.add(key)
      return { status: 1, stdout: red[key], stderr: '' }
    }
    if (emptyStdout) return { status: 0, stdout: '', stderr: '' }
    return { status: 0, stdout: '★ 通过\n', stderr: '' }
  }
  run.assertAllHit = () => {
    const missed = Object.keys(red).filter((k) => !hit.has(k))
    assert.equal(missed.length, 0, `这些红桩一次都没被匹配到（key 打错了？）：${missed.join(', ')}`)
  }
  return run
}

test('S1 环境前提不在：跳过并写明跳过了什么，不静默通过', () => {
  assert.equal(environmentPresent('/nonexistent-home-for-selftest'), false, '前提探测必须能说不')
  const r = checkSkillLines({ repoRoot, home: '/nonexistent-home-for-selftest' })
  assert.equal(r.passed, true, '环境不在时不该判红（不假红）')
  assert.equal(r.skipped, true, '环境不在必须显式进入 skip，不能与 pass 同形')
  assert.equal(r.violations.length, 0)
  assert.match(r.note, /没有/, 'note 必须说清「本机没有 → 本项无射程」，否则跳过与通过分不开')
  assert.match(r.note, /不假绿也不假红/)
})

test('S2 验证器判红：必须红，且把它的原文输出带出来', async () => {
  await withSelftestHome((home) => {
    const stub = stubRun({ 'verify-generic.mjs': '✗ 通用技能线未达标：T0 挂载缺口 3 个岗位' })
    const r = checkSkillLines({ repoRoot, home, runOne: stub })
    stub.assertAllHit()
    assert.equal(r.passed, false, '任一验证器非零退出必须判红')
    assert.equal(r.violations.length, 1)
    assert.match(r.violations[0], /verify-generic\.mjs/)
    assert.match(r.violations[0], /T0 挂载缺口 3 个岗位/, '必须回传原文输出，否则人不知道坏在哪')
    assert.match(r.violations[0], /修法/, '必须给出修法')
  })
})

test('S3 验证器文件不存在：声称在守某件事却没有消费者，必须红（P-02）', async () => {
  await withSelftestHome((home) => {
    // 指向一个不存在的仓库根：三个验证器与包内测试目录都读不到
    const r = checkSkillLines({ repoRoot: '/nonexistent-repo-for-selftest', home, runOne: stubRun() })
    assert.equal(r.passed, false)
    assert.ok(r.violations.length >= VERIFIERS.length, `每个缺失的验证器都要点名，实际 ${r.violations.length} 条`)
    assert.match(r.violations.join('\n'), /不存在/)
  })
})

test('S4 第三个验证器红而前两个绿：聚合不能只看第一个', async () => {
  await withSelftestHome((home) => {
    const stub = stubRun({ 'verify-fullstack.mjs': '✗ 预设副本丢失: tdd' })
    const r = checkSkillLines({ repoRoot, home, runOne: stub })
    stub.assertAllHit()
    assert.equal(r.passed, false, '只看第一个验证器的实现会在这里放过')
    assert.match(r.violations[0], /verify-fullstack\.mjs/)
  })
})

test('S5 无摘要行：判绿但读数缺失必须说出来，不许静默当成通过', async () => {
  await withSelftestHome((home) => {
    const r = checkSkillLines({ repoRoot, home, runOne: stubRun({}, { emptyStdout: true }) })
    assert.equal(r.passed, true)
    assert.match(r.note, /摘要行未能解析（读数缺失，不是通过）/, '读数死了但判据还绿 = P-02，必须显式说明')
  })
})

test('S6 恒真桩突变：把 passed 钉成常量 true，上面几条必须失效', async () => {
  // 这条例钉住「红与绿必须给出不同的 passed」。若实现把 passed 恒置 true，
  // 或上面几条用了 assert.ok(r.violations.length) 这类弱断言，这里就会失效。
  await withSelftestHome((home) => {
    const stub = stubRun({ 'verify_static.mjs': '✗ verify_static 失败: 缺 SKILLS_GN' })
    const red = checkSkillLines({ repoRoot, home, runOne: stub })
    stub.assertAllHit()
    const green = checkSkillLines({ repoRoot, home, runOne: stubRun() })
    assert.notEqual(red.passed, green.passed, '红与绿必须给出**不同**的 passed——否则判据没有牙')
    assert.equal(red.passed, false)
    assert.equal(green.passed, true)
  })
})

test('S7 包内契约测试在射程内：新增一条会红的 spec，本项必须跟着红', async () => {
  await withSelftestHome((home) => {
    const r = checkSkillLines({
      repoRoot,
      home,
      runOne: (rel) => (rel.endsWith('test') || rel === join('packages', 'capabilities', 'dsh-overseas-skills', 'test')
        ? { status: 1, stdout: '✗ /generic-list：8 个分组各有行…\nℹ tests 67\nℹ pass 65\nℹ fail 2\n', stderr: '' }
        : { status: 0, stdout: '★ 通过\n', stderr: '' }),
    })
    assert.equal(r.passed, false, '包内负载形状测试不在射程内的话，「页面拿到空组」这类缺陷就没有判据')
    assert.match(r.violations.join('\n'), /页面负载形状/)
  })
})
