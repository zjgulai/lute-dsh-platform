/**
 * `node-interpreter` 门禁项的**自检**：逐条证明它的判据能红、也能不误伤。
 *
 * 判据自己也需要被证伪。本文件在临时目录里搭一棵**最小开发脚本树**，逐条注入形态，
 * 要求门禁分别给出正确的读法。不碰真实仓库——那里跑的是同一份代码。
 *
 * 七条用例，每条对应一种不同的错法（不是七条重复的测试）：
 *   ① 真违规必须抓到（否则本项是摆设）
 *   ② **注释里的例子不算代码**——第一版就逐字撞上这条：本项自己的 JSDoc 举例了
 *      `execFile(process.execPath, …)`，于是「解释禁令的文档」成了「违反禁令的代码」。
 *      同一个根因在 `theme-tokens` 上先踩过一次（见 scripts/lib/strip-comments.mjs）。
 *   ③ 跨行写法必须抓到——只匹配同一行的正则漏掉 `spawn(\n process.execPath,`，
 *      而这是本仓库的真实写法（`dsh-team-hub` 就是逐行匹配漏掉后人工发现的）。
 *   ④ 第一实参不是 execPath 的不算（别把 `spawn(NODE, …)` 判红）
 *   ⑤ 豁免只给 `scripts/lib/real-node.mjs` **一个**文件——同名的别处不算豁免
 *   ⑥ `src/`、`tests/` 不在扫描范围（本项只管开发脚本；边界要能被读出来）
 *   ⑦ 真实仓库当前是干净的（集成分，防止只在小树上成立）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkNodeInterpreter } from './node-interpreter.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 在临时目录里搭一棵树：路径 → 内容。 */
function withTree(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'node-interpreter-'))
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content)
    }
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('① 直接拿 process.execPath 起子进程必须报违规', () => {
  withTree(
    { 'scripts/probe.mjs': 'import { execFile } from "node:child_process"\nexecFile(process.execPath, ["x.mjs"])\n' },
    (root) => {
      const result = checkNodeInterpreter({ repoRoot: root })
      assert.equal(result.passed, false)
      assert.match(result.violations[0], /scripts\/probe\.mjs:2/)
    },
  )
})

test('② 注释里出现的例子不算违规（同一根因在 theme-tokens 上踩过一次）', () => {
  withTree(
    {
      'scripts/probe.mjs': [
        '/**',
        ' * 反例：**不要**这样写——`execFile(process.execPath, [script])`。',
        ' */',
        // 夹具里的**代码**必须是干净的，否则会撞上规则二，测不出本用例要测的东西。
        'import { nodeCommand } from "./lib/real-node.mjs"',
        'const { command, env } = nodeCommand()',
        'execFile(command, ["x.mjs"], { env })',
        '',
      ].join('\n'),
    },
    (root) => {
      const result = checkNodeInterpreter({ repoRoot: root })
      assert.equal(result.passed, true, `不该报违规：${JSON.stringify(result.violations)}`)
    },
  )
})

test('③ 跨行写法必须抓到（逐行匹配漏过 dsh-team-hub 的真实写法）', () => {
  withTree(
    { 'packages/x/scripts/acceptance.mjs': 'const child = spawn(\n  process.execPath,\n  [entry, "start"],\n  { stdio: "pipe" },\n)\n' },
    (root) => {
      const result = checkNodeInterpreter({ repoRoot: root })
      assert.equal(result.passed, false)
      assert.match(result.violations[0], /acceptance\.mjs:2/)
    },
  )
})

test('④ 第一实参不是 execPath 的不算违规（防误伤）', () => {
  withTree(
    {
      'scripts/probe.mjs': [
        'import { nodeCommand } from "./lib/real-node.mjs"',
        'const { command, env } = nodeCommand()',
        'execFile(command, ["x.mjs"], { env })',
        'execFile("curl", ["-sS", url])',
        '',
      ].join('\n'),
    },
    (root) => assert.equal(checkNodeInterpreter({ repoRoot: root }).passed, true),
  )
})

test('⑤ 豁免只给 scripts/lib/real-node.mjs 一个文件，同名的别处不算', () => {
  const offending = 'execFileSync(process.execPath, ["x.mjs"])\n'
  withTree({ 'scripts/lib/real-node.mjs': offending }, (root) => {
    assert.equal(checkNodeInterpreter({ repoRoot: root }).passed, true, '这个文件是判据的家，必须豁免')
  })
  // 别处同名的文件必须照报。（放在 scripts/lib/ 以外：`packages/**/lib/` 是产物目录，
  // 本就不扫——第一版用例把夹具放错地方，于是它「通过」得毫无意义。）
  withTree({ 'scripts/other/real-node.mjs': offending }, (root) => {
    const result = checkNodeInterpreter({ repoRoot: root })
    assert.equal(result.passed, false, '同名但路径不同——不能靠文件名蹭豁免')
  })
})

test('⑥ src/ 与 tests/ 不在扫描范围（本项只管开发脚本）', () => {
  const offending = 'spawn(process.execPath, [entry])\n'
  withTree(
    {
      'packages/x/src/service.mjs': offending,
      'packages/x/tests/smoke/probe.spec.ts': offending,
    },
    (root) => assert.equal(checkNodeInterpreter({ repoRoot: root }).passed, true),
  )
})

test('⑦ 真实仓库当前干净，且确实扫到了东西（不是空扫描的假绿）', () => {
  const result = checkNodeInterpreter({ repoRoot })
  assert.equal(result.passed, true, `真实仓库有违规：${result.violations.join('；')}`)
  assert.match(result.note, /已扫 \d+ 个开发脚本/)
  const scanned = Number(result.note.match(/已扫 (\d+) 个/)[1])
  assert.ok(scanned > 30, `只扫到 ${scanned} 个文件——扫描范围可能塌了，这种「通过」没有意义`)
})

test('⑧ 只拿 nodeCommand() 的一半必须报违规（gate.test.mjs 实测撞过）', () => {
  withTree(
    {
      'scripts/half.mjs': [
        'import { nodeCommand } from "./lib/real-node.mjs"',
        'const NODE = nodeCommand().command',
        'spawnSync(NODE, ["x"])',
        '',
      ].join('\n'),
    },
    (root) => {
      const result = checkNodeInterpreter({ repoRoot: root })
      assert.equal(result.passed, false, '只取 command 半必须报')
      assert.match(result.violations[0], /env 半/)
    },
  )
})

test('⑨ 两半都拿、或显式补 electronNodeEnv()，都不算违规', () => {
  withTree(
    {
      'scripts/pair.mjs': [
        'import { nodeCommand } from "./lib/real-node.mjs"',
        'const { command, env } = nodeCommand()',
        'execFileSync(command, ["x"], { env })',
        '',
      ].join('\n'),
      'scripts/merged.mjs': [
        'import { electronNodeEnv, nodeCommand } from "./lib/real-node.mjs"',
        'const NODE = nodeCommand().command',
        'spawn(NODE, ["x"], { env: { ...minimalEnv, ...electronNodeEnv() } })',
        '',
      ].join('\n'),
    },
    (root) => {
      const result = checkNodeInterpreter({ repoRoot: root })
      assert.equal(result.passed, true, `不该报违规：${JSON.stringify(result.violations)}`)
    },
  )
})
