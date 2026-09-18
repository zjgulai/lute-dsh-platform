/**
 * `ci-workflow.mjs` 的反向自测（QG-007，ADR-0104）。
 *
 * ## 每一条都是一次「把判据该拦的东西塞进去」
 *
 * 静态审计最容易变成恒真的东西：文件在那儿、字段名对得上，于是永远判绿。所以这里
 * 的写法是**从一个合格 workflow 出发，逐条把它改坏**，每条都必须让判据判红，并且
 * 违规文本要指向被改坏的那一处。
 *
 * 变异清单（与卡面「负例」以及失败边界一一对应）：
 *
 * | 变异 | 它代表的事故 |
 * |---|---|
 * | 删掉 full job | PR 上跑了 quick 就以为门禁全绿（full-only 的 8 项从不存在） |
 * | full job 不再排除 PR | PR 上跑两档，反馈变慢后被人为放宽 |
 * | 删掉 timeout-minutes | 卡死的 job 占满 runner |
 * | 删掉 attest 见证 | 「门禁没改动仓库」退回成一句声明（ADR-0103 的回归） |
 * | 删掉 evidence 上传 | 失败时日志随 runner 消失 |
 * | 上传缺 `if: always()` | 恰好失败时没有证据 |
 * | 顶层删掉 permissions | 默认权限写仓库 |
 * | 删掉 concurrency | 旧运行排队，掩盖当前提交的真实状态 |
 * | 加 `continue-on-error` | 失败被吞（卡面明令禁止） |
 * | 命令加 `\|\| true` | 同上，换个写法 |
 * | 引用 `secrets.*` | 门禁不该有 secret |
 * | 写死机器路径 | 换台机器就假红 |
 * | 版本不钉 / 钉成浮动 | 平台行为被当常量（P-06） |
 * | quick job 跑 full | 模式与 job 语义不符 |
 * | 未登记的 action | 供应链面被悄悄扩大 |
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WORKFLOW_CHECK_AUTHORITY,
  WORKFLOW_REL_PATH,
  checkCiWorkflow,
  listWorkflows,
  parseWorkflowYaml,
  readWorkflow,
} from './ci-workflow.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const allowed = ['actions/checkout@', 'actions/setup-node@', 'actions/upload-artifact@', 'pnpm/action-setup@']

/** 合格基线：就是仓库里真实的那一份。判据先要在基线上判绿，否则变异没有意义。 */
const baseline = readWorkflow(repoRoot)

function verdictFor(text, options = {}) {
  return checkCiWorkflow({ workflowText: text, gateNames: [], allowedActionRefs: allowed, ...options })
}

/** 改坏一处，返回判据结果；并断言「确实判红了」。 */
function expectRed(label, mutate, expectMatch) {
  assert.ok(typeof baseline === 'string' && baseline.length > 0, '基线 workflow 读不到，变异无从谈起')
  const mutated = mutate(baseline)
  assert.notEqual(mutated, baseline, `${label}：这次变异根本没改动文本（变异本身失效了）`)
  const result = verdictFor(mutated)
  assert.equal(result.passed, false, `${label}：判据放过了这个变异`)
  if (expectMatch !== undefined) {
    assert.match(result.violations.join('\n'), expectMatch, `${label}：判红了但违规文本没指向该处`)
  }
  return result
}

test('基线：仓库里真实的 workflow 必须判绿（否则下面的变异都是空射程）', () => {
  const result = verdictFor(baseline)
  assert.deepEqual(result.violations, [])
  assert.equal(result.passed, true)
  assert.equal(result.facts.authority, WORKFLOW_CHECK_AUTHORITY, '读数必须自带证据层级 L1-static')
  assert.deepEqual(result.facts.jobs, ['quick', 'full'])
  assert.equal(result.facts.pinnedVersions.node.length > 0, true)
  assert.equal(result.facts.pinnedVersions.pnpm.length > 0, true)
})

test('变异 1：删掉 full job → 判红（full-only 的 8 项不能在 CI 里不存在）', () => {
  expectRed('删掉 full job', (text) => text.replace(/^  full:$[\s\S]*$/m, ''), /缺少 job `full`/)
})

test('变异 2：full job 不再排除 PR → 判红', () => {
  expectRed(
    'full 不再排除 PR',
    (text) => text.replace("if: github.event_name != 'pull_request'", 'if: true'),
    /必须在 `if` 里排除 pull_request/,
  )
})

test('变异 3：删掉 timeout-minutes → 判红', () => {
  expectRed('删掉 quick 的 timeout', (text) => text.replace(/^\s*timeout-minutes: 30$/m, ''), /timeout-minutes/)
})

test('变异 4：删掉 attest 见证步骤 → 判红（ADR-0103 的回归）', () => {
  expectRed(
    '删掉见证步骤',
    (text) => text.replace(/^ {6}- name: 见证[^\n]*\n(?: {8}[^\n]*\n)+/gm, ''),
    /--attest/,
  )
})

test('变异 5：见证排在门禁之前 → 判红（顺序即语义）', () => {
  // 按**行块**交换两个 step，而不是凭正则拼一份新 YAML：拼出来的东西一旦结构不合法，
  // 判据会因为「解析失败」而红，那条红与本用例要守的事（顺序）无关——变异就失效了。
  const lines = baseline.split('\n')
  const stepRange = (name) => {
    const start = lines.findIndex((line) => line.trim() === `- name: ${name}`)
    assert.notEqual(start, -1, `基线里找不到步骤：${name}`)
    let end = start + 1
    while (end < lines.length && (lines[end].trim() === '' || /^ {8}\S/.test(lines[end]) || /^ {10}\S/.test(lines[end]))) end += 1
    return [start, end]
  }
  const [gateStart, gateEnd] = stepRange('门禁 quick')
  const [attestStart, attestEnd] = stepRange('见证：门禁没有改动被见证的仓库')
  assert.ok(gateStart < attestStart, '基线里门禁必须排在见证之前')
  const gateBlock = lines.slice(gateStart, gateEnd)
  const attestBlock = lines.slice(attestStart, attestEnd)
  const swapped = [
    ...lines.slice(0, gateStart),
    ...attestBlock,
    ...lines.slice(gateEnd, attestStart),
    ...gateBlock,
    ...lines.slice(attestEnd),
  ].join('\n')
  const result = verdictFor(swapped)
  assert.equal(result.passed, false, '见证排在门禁之前必须判红')
  assert.match(result.violations.join('\n'), /见证步骤排在门禁之前/)
})

test('变异 6：删掉 evidence 上传 → 判红', () => {
  expectRed(
    '删掉上传',
    (text) => text.replace(/^ {6}- name: 失败也留证据[\s\S]*?retention-days: \d+\n/gm, ''),
    /没有上传证据/,
  )
})

test('变异 7：上传缺 `if: always()` → 判红', () => {
  expectRed(
    '上传缺 always',
    (text) => text.replace(/^ {8}if: always\(\)$/gm, '        if: success()'),
    /if: always\(\)/,
  )
})

test('变异 8：删掉顶层 permissions → 判红', () => {
  expectRed('删掉 permissions', (text) => text.replace(/^permissions:\n {2}contents: read\n/m, ''), /permissions/)
})

test('变异 9：删掉 concurrency → 判红', () => {
  expectRed('删掉 concurrency', (text) => text.replace(/^concurrency:\n(?: {2}[^\n]*\n)+/m, ''), /concurrency/)
})

test('变异 10：cancel-in-progress 改成 false → 判红', () => {
  expectRed('取消并发改成 false', (text) => text.replace('cancel-in-progress: true', 'cancel-in-progress: false'), /cancel-in-progress/)
})

test('变异 11：步骤带 continue-on-error 字段 → 判红（卡面明令禁止）', () => {
  // 注意这是**字段**位置而不是命令行：第一版判据只扫 `run:` 正文，于是这个变异全绿。
  expectRed(
    '加 continue-on-error 字段',
    (text) => text.replace('      - name: 门禁 quick\n', '      - name: 门禁 quick\n        continue-on-error: true\n'),
    /continue-on-error/,
  )
})

test('变异 12：命令加 `|| true` 吞掉退出码 → 判红', () => {
  expectRed(
    '命令吞退出码',
    (text) => text.replace('node scripts/gate.mjs --mode quick --json | tee gate-quick.json', 'node scripts/gate.mjs --mode quick --json | tee gate-quick.json || true'),
    /吞掉退出码/,
  )
})

test('变异 13：引用 secrets → 判红（门禁不需要任何 secret）', () => {
  expectRed(
    '引用 secrets',
    (text) => text.replace(
      '          node-version: ${{ env.NODE_VERSION }}',
      '          node-version: ${{ env.NODE_VERSION }}\n          token: ${{ secrets.GITHUB_TOKEN }}',
    ),
    /secrets/,
  )
})

test('变异 14：写死机器路径 → 判红', () => {
  expectRed(
    '写死 /Users 路径',
    (text) => text.replace(
      /^( {10})node scripts\/gate\.mjs --mode quick --json \| tee gate-quick\.json$/m,
      '$1cd /Users/lute/project/Magpie-Horch\n$1node scripts/gate.mjs --mode quick --json | tee gate-quick.json',
    ),
    /机器\/用户路径/,
  )
})

test('变异 15：版本不钉 → 判红（浮动版本 = 平台行为被当常量）', () => {
  expectRed('删掉版本钉住', (text) => text.replace(/^ {2}NODE_VERSION: '[^']*'\n/m, ''), /NODE_VERSION/)
})

test('变异 16：quick job 跑 full 模式 → 判红', () => {
  expectRed(
    'quick job 跑 full',
    (text) => text.replace(
      /^( {10})node scripts\/gate\.mjs --mode quick --json \| tee gate-quick\.json$/m,
      '$1node scripts/gate.mjs --mode full --json | tee gate-quick.json',
    ),
    /不在允许集合 quick 内/,
  )
})

test('变异 17：用未登记的 action → 判红（供应链面不得悄悄扩大）', () => {
  expectRed(
    '未登记 action',
    (text) => text.replace('      - uses: actions/setup-node@v6', '      - uses: some-unknown/setup@v1'),
    /未登记的 action/,
  )
})

test('变异 18：删掉依赖安装步骤 → 判红', () => {
  expectRed(
    '删掉依赖安装',
    (text) => text.replace(/^ {6}- name: 安装依赖[\s\S]*?(?=^ {6}- name: 门禁 quick)/gm, ''),
    /没有安装依赖的步骤/,
  )
})

test('变异 19：workflow 变成空文件 → 判红（空射程与合格必须分得开）', () => {
  const result = verdictFor('')
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /读不到 workflow/)
})

test('变异 20：workflow 语法/结构读不懂 → 判红，而不是当成合格', () => {
  // 两种坏结构的**根因必须报得准**，而且都不许被当成合格。
  //
  // 诚实边界（实测记下来的）：判据不保证把「任何非 YAML」都报成解析失败。例如
  // `quick:` 下面挂一个缩进的标量序列，在本子集里会被解析成「一个没有字段的 job」，
  // 于是报的是「缺少 timeout-minutes / 没有跑门禁」——那仍然判红，而且**具体**，
  // 只是根因措辞不同。真正要守的性质是两条：①坏输入不得判绿；②键后已有值却又
  // 缩进子块时必须报解析失败（那是会被真实 runner 拒绝的结构）。
  const parseFailures = [
    'name: gate\njobs:\n  quick:\n    runs-on: ubuntu-latest\n      timeout-minutes: 4\n',
    'name: gate\n%YAML 1.2\njobs: {}\n',
  ]
  for (const broken of parseFailures) {
    const result = verdictFor(broken)
    assert.equal(result.passed, false, `坏结构必须判红：${JSON.stringify(broken)}`)
    assert.match(result.violations.join('\n'), /解析失败/)
  }

  // 坏输入但对本子集来说是「合法但缺字段」：仍然判红，只是报缺字段。
  const degraded = verdictFor('name: gate\njobs:\n  quick:\n     - 这不是合法的步骤结构\n')
  assert.equal(degraded.passed, false)
  assert.match(degraded.violations.join('\n'), /缺少 job `full`|没有跑/)
})

test('变异 21：PR 触发器被删掉 → 判红', () => {
  expectRed('删掉 pull_request 触发器', (text) => text.replace(/^ {2}pull_request:$/m, '  # pull_request: 被删掉'), /pull_request/)
})

test('解析器自证：块标量里的正文必须原样读到（否则判据看的是改写过的命令）', () => {
  const doc = parseWorkflowYaml(baseline)
  const install = doc.jobs.quick.steps.find((step) => step.name === '安装依赖（有锁文件则锁文件安装）')
  assert.ok(install, '安装步骤必须被解析到')
  assert.match(install.run, /pnpm install --frozen-lockfile/, '锁文件安装的命令必须原样可读')
  assert.match(install.run, /if \[ -f pnpm-lock\.yaml \]/, '壳语法必须原样保留')
  const gateStep = doc.jobs.quick.steps.find((step) => step.name === '门禁 quick')
  assert.match(gateStep.run, /node scripts\/gate\.mjs --mode quick --json/, '门禁命令必须原样可读')
})

test('解析器负例：不支持的 YAML 构造必须抛错，不得静默降级', () => {
  assert.throws(() => parseWorkflowYaml('a: &anchor\n  b: 1\n'), /不支持的 YAML 构造（锚点\/别名\/标签）/)
  assert.throws(() => parseWorkflowYaml(''), /空/)
})

test('workflow 目录里只有这一个 gate workflow（多份会让「CI 跑的是哪份」不可判）', () => {
  const files = listWorkflows(repoRoot)
  assert.deepEqual(files, ['gate.yml'], `实际：${files.join('、')}`)
  assert.equal(WORKFLOW_REL_PATH, '.github/workflows/gate.yml')
})

test('这份判据自己不会宣称 CI 已建立：读数里必须带 L1-static', () => {
  const result = verdictFor(baseline)
  assert.equal(result.facts.authority, 'L1-static')
  // 反向：越权声明（比如把 authority 写成 'CI-verified'）不属于本模块的能力，
  // 用「读数里有没有这句话」把边界钉住。
  assert.equal(/CI-verified|L3|required check/.test(JSON.stringify(result.facts)), false)
})

test('README/pull_request_template 里的门禁命令与 workflow 一致（一处事实一个家）', () => {
  const template = readFileSync(join(repoRoot, '.github', 'pull_request_template.md'), 'utf8')
  const doc = parseWorkflowYaml(baseline)
  const modes = new Set()
  for (const job of Object.values(doc.jobs)) {
    for (const step of job.steps ?? []) {
      for (const match of (step.run ?? '').matchAll(/scripts\/gate\.mjs\s+--mode\s+([a-z]+)/g)) modes.add(match[1])
    }
  }
  assert.deepEqual([...modes].sort(), ['full', 'quick'], 'workflow 必须同时覆盖 quick 与 full')
  // 模板里若提到命令，必须与 workflow 用同一种写法（防止模板教人跑一条不存在的命令）
  for (const match of template.matchAll(/pnpm run (gate(?::[a-z]+)?)/g)) {
    assert.match(match[1], /^gate(:full|:list|:strict)?$/, `PR 模板引用了不存在的脚本：${match[1]}`)
  }
})

test('变异 22：门禁命令进管道但没有 pipefail → 判红（2026-09-17 实测假绿的形状）', () => {
  // 这条是本卡在真实 CI 上踩过的坑：`node … | tee out.json` 的退出码来自 tee（永远 0），
  // 于是 workflow 首跑在 GitHub 上显示**全绿**，而同一份日志里门禁 JSON 写着
  // `"status": "fail", "failed": 6` —— 六个真失败被一根管道挡住了。
  expectRed(
    '管道吞退出码',
    (text) => text.replace(/^ {10}set -o pipefail\n/m, '').replace(/^ {10}set -o pipefail\n/m, ''),
    /管道吞掉退出码/,
  )
})

test('基线反向：每个 pipefail 步骤的 run 都必须真的有 pipefail', () => {
  const doc = parseWorkflowYaml(baseline)
  for (const [jobName, job] of Object.entries(doc.jobs)) {
    for (const step of job.steps ?? []) {
      const run = step.run ?? ''
      if (/\|\s*(tee|cat|head|tail)\b/.test(run)) {
        assert.match(run, /set\s+-o\s+pipefail/, `job \`${jobName}\` 的步骤「${step.name}」有管道但没有 pipefail`)
      }
    }
  }
})
