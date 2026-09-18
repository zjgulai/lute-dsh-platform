import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { nodeCommand } from './lib/real-node.mjs'
import { withMutationFixture } from './lib/mutation-fixture.mjs'
import { checkPackageIdentity } from './gates/checks.mjs'
import { collectManagedManifests } from './gates/package-collect.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const gate = join(repoRoot, 'scripts', 'gate.mjs')
const require = createRequire(import.meta.url)

// 本文件原先自带一份 `resolveNode()`（看 basename 是不是 node，不是就 `which node`）。
// 那份兜底能用，但它是**同一事实的第二个家**——2026-09-12 提为
// scripts/lib/real-node.mjs，判据与取证随之搬过去（ADR-0009）；本文件只引用。
//
// **两半都要拿。** 第一版这里只写了 `nodeCommand().command`，于是下面 `spawnSync` 起的是
// Electron 二进制而**没有** `ELECTRON_RUN_AS_NODE`——四条 CLI 测试立刻全红（`spawnSync`
// 不报错，只是子进程不说话）。`nodeCommand()` 返回 `{command, env}` 就是防这个，
// 只取一半等于把刚拆掉的那个 bug 又装回去。判据见 scripts/gates/node-interpreter.mjs 的规则二。
const { command: NODE, env: NODE_ENV } = nodeCommand()

function runGate(args) {
  const result = spawnSync(NODE, [gate, ...args], { cwd: repoRoot, encoding: 'utf8', env: NODE_ENV })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

test('门禁 CLI：quick 模式打印校验摘要并返回退出码', () => {
  const { stdout, code } = runGate(['--mode', 'quick'])

  assert.match(stdout, /(^|\n)(ok|fail) \d+\/\d+ 项通过/)
  assert.match(stdout, /contract/)
  assert.equal(typeof code, 'number')
})

test('门禁 CLI：未知模式必须被拒绝', () => {
  const { code, stderr } = runGate(['--mode', 'bogus'])

  assert.equal(code, 2)
  assert.match(stderr, /未知模式/)
})

test('门禁 CLI：--list 暴露全部校验项名称', () => {
  const { stdout, code } = runGate(['--list'])

  assert.equal(code, 0)
  for (const name of ['package-identity', 'pin-consistency', 'gitignore-whitelist']) {
    assert.match(stdout, new RegExp(name))
  }
})

test('门禁 CLI：JSON 输出可解析且逐项携带统一三态与守恒读数', () => {
  const { stdout, code } = runGate(['--mode', 'quick', '--json'])
  const report = JSON.parse(stdout)

  assert.equal(report.schemaVersion, 1)
  assert.equal(report.kind, 'gate-report')
  assert.equal(report.mode, 'quick')
  assert.equal(code, report.summary.exitCode)
  assert.ok(report.results.length > 0)
  for (const result of report.results) {
    assert.ok(['pass', 'fail', 'skip'].includes(result.status))
    assert.equal(result.expected, result.checked + result.skipped + result.failed)
    assert.equal(typeof result.reason, 'string')
  }
})

test('门禁 CLI：strict 遇到 skip 必须非零（结果模型负例）', () => {
  const fixture = runGate(['--mode', 'quick', '--json'])
  const report = JSON.parse(fixture.stdout)
  if (report.summary.skipped === 0) return

  const strict = runGate(['--mode', 'quick', '--json', '--require-no-skip'])
  const strictReport = JSON.parse(strict.stdout)
  assert.equal(strict.code, 1)
  assert.equal(strictReport.summary.requireNoSkip, true)
  assert.match(strictReport.summary.reason, /requireNoSkip/)
})

test('门禁：根包自身也受身份契约约束（隔离 repo 负向用例）', async () => {
  await withMutationFixture({
    prefix: 'gate-root-package-identity',
    prepare(fixture) {
      const { writeFileSync } = require('node:fs')
      writeFileSync(fixture.path('repo', 'package.json'), JSON.stringify({
        name: 'broken-root-fixture',
        luteOwner: 'lute',
        lutePublish: false,
      }, null, 2) + '\n')
    },
  }, async (fixture) => {
    const manifests = collectManagedManifests(fixture.repo)
    assert.deepEqual(manifests.map((entry) => entry.dir), ['.'], '根包必须进入 package-identity 判定面')
    const result = checkPackageIdentity(fixture.repo, manifests)
    assert.equal(result.passed, false)
    assert.deepEqual(result.violations, ['.: 缺少 luteOrigin'])
  })
})

// ── theme-tokens 收集器：注释不是引用，定义不是引用 ──────────────────────────
//
// 这两个用例守的是**仪器本身**：旧口径把「文本里出现过」当成「被引用」，于是
// ①一句话「不要再用 --dsw-x」会让 --dsw-x 重新变成一个必须存在的 token（写文档造违规）；
// ②主题插件自己的映射键 "--dsw-x": … 被算成「有人引用 --dsw-x」。
// 两种都让门禁答错，且都是假红——假红会训练人忽略输出。

test('theme-tokens 收集器：注释与定义不算引用，var() 才算', async () => {
  const { writeFileSync, mkdirSync } = require('node:fs')
  const { collectReferencedTokens } = require('./gates/theme-tokens.mjs')
  await withMutationFixture({
    prefix: 'theme-token-collector',
    prepare(fixture) {
      const src = join(fixture.repo, 'packages', 'surfaces', 'fixture-pkg', 'src')
      mkdirSync(src, { recursive: true })
      writeFileSync(
        join(src, 'panel.module.css'),
        [
          '/* 弃用说明：这里不要再用 var(--dsw-alias-retired-thing)，见 ADR-0000。 */',
          '.a { color: var(--dsw-alias-label-primary, #0f1115); }',
          '.b { background: var(--dsw-alias-bg-layer-2, #fff); }',
        ].join('\n'),
      )
      writeFileSync(
        join(src, 'tokens.ts'),
        [
          '// 记录：--dsw-font-mono 已弃用，别再引用。',
          'export const map = { "--dsw-alias-defined-here": "value" }',
          '// https://example.com/docs?token=--dsw-alias-in-a-url',
          "export const used = 'var(--dsw-alias-really-used)'",
        ].join('\n'),
      )
    },
  }, async (fixture) => {
    const refs = collectReferencedTokens(fixture.repo)
    const names = [...refs.keys()].sort()

    // 真引用被收下
    assert.deepEqual(names, ['--dsw-alias-bg-layer-2', '--dsw-alias-label-primary', '--dsw-alias-really-used'])
    // 注释里的名字不产生义务（含块注释、行注释、以及 URL 里的那一个）
    assert.equal(refs.has('--dsw-alias-retired-thing'), false)
    assert.equal(refs.has('--dsw-font-mono'), false)
    assert.equal(refs.has('--dsw-alias-in-a-url'), false)
    // 自己的定义不是自己的引用
    assert.equal(refs.has('--dsw-alias-defined-here'), false)
  })
})

test('theme-tokens 收集器：真引用仍然会被抓（防收紧过度）', async () => {
  const { writeFileSync, mkdirSync } = require('node:fs')
  const { collectReferencedTokens } = require('./gates/theme-tokens.mjs')
  await withMutationFixture({
    prefix: 'theme-token-single-reference',
    prepare(fixture) {
      const src = join(fixture.repo, 'packages', 'surfaces', 'fixture-pkg', 'src')
      mkdirSync(src, { recursive: true })
      // 基线上那 8 条违规的形状：var() 里一个没人定义的名字，必须仍然被抓到。
      writeFileSync(join(src, 'bad.css'), '.x { background: var(--dsw-alias-fill-tsp-secondary, rgba(0,0,0,.06)); }\n')
    },
  }, async (fixture) => {
    const refs = collectReferencedTokens(fixture.repo)
    assert.equal(refs.has('--dsw-alias-fill-tsp-secondary'), true)
  })
})

// ── 射程必须出现在读数里（端到端守接线）──────────────────────────────────────
//
// `gate-result.test.mjs` 守的是汇总函数本身；这一条守的是**接线**：`gate.mjs`
// 必须把「本模式没跑到的校验项」算出来、传下去、并说出来。把那三处摘掉，
// 汇总单测仍然全绿，而 quick 的摘要会退回「75/76 项通过」——读的人会以为
// 76 就是全部，而 full-only 的那些压根没被碰过。
//
// 这不是假想的风险：2026-09-16 的 typecheck 回归（10 处 TS2339 + 6 处测试类型错）
// 就是由 full-only 的 `scripts-runnable` 守着的，那一轮只跑了 quick 就声称通过
// （P-04 的变体：用的是没有覆盖该分支的那档命令）。

test('门禁 CLI：quick 摘要必须说出本模式未覆盖的射程', () => {
  // 期望值从**注册表**独立推出（`--list --json` 不跑任何判据，几乎不耗时），
  // 而不是从被测的那行摘要里反推——否则断言会跟着被测对象一起错。
  const registry = JSON.parse(runGate(['--list', '--json']).stdout).checks
  const expectedUncovered = registry
    .filter((check) => !check.modes.includes('quick'))
    .map((check) => check.name)
  const { stdout, code } = runGate(['--mode', 'quick'])
  const line = /本次未覆盖 (\d+) 条（仅 (\S+)）：(.+)$/m.exec(stdout)

  assert.equal(code, 0)
  assert.ok(
    expectedUncovered.length > 0,
    'quick 下一条未覆盖项都没有，说明模式划分变了——本用例要跟着改，不能当成通过',
  )
  assert.ok(line, '摘要里缺少「本次未覆盖」行：射程又从读数里消失了')
  assert.equal(Number(line[1]), expectedUncovered.length, '报的条数与注册表推出来的不一致')
  assert.equal(line[2], 'full', '「仅 X」里的 X 必须由 MODES 的反集算出，不是写死的')
  // 逐条点名，而不是只报一个数字
  assert.deepEqual(line[3].split('、').sort(), expectedUncovered.sort())
})
