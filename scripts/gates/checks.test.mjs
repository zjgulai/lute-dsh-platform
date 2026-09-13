import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  checkAdrIndex,
  checkAdrNoteLinks,
  checkGitignoreWhitelist,
  checkChangedPackages,
  checkDependencyLinks,
  checkDmgReadmeTccPanes,
  checkExemptions,
  checkNestedRepositories,
  checkPackageIdentity,
  checkPinConsistency,
  checkReadmeHeredocIsLiteral,
  checkScriptsRunnable,
  checkShellVarAdjacentMultibyte,
  checkTccPaneGuidance,
  checkTrackedIgnored,
} from './checks.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

test('包身份校验：缺少 luteOrigin 的包必须被拒绝', () => {
  const result = checkPackageIdentity(repoRoot, [
    { dir: 'fixture-valid', manifest: { name: 'fixture-valid', luteOrigin: 'self', luteOwner: 'lute', lutePublish: false } },
    { dir: 'fixture-missing-origin', manifest: { name: 'fixture-missing-origin', luteOwner: 'lute', lutePublish: false } },
    { dir: 'fixture-bad-origin', manifest: { name: 'fixture-bad-origin', luteOrigin: 'borrowed', luteOwner: 'lute', lutePublish: false } },
    { dir: 'fixture-missing-owner', manifest: { name: 'fixture-missing-owner', luteOrigin: 'self', lutePublish: false } },
    { dir: 'fixture-bad-publish', manifest: { name: 'fixture-bad-publish', luteOrigin: 'self', luteOwner: 'lute', lutePublish: 'no' } },
  ])

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'fixture-missing-origin: 缺少 luteOrigin',
    'fixture-bad-origin: luteOrigin 取值非法（borrowed），仅允许 self / internalized / npm-pinned',
    'fixture-missing-owner: 缺少 luteOwner',
    'fixture-bad-publish: lutePublish 必须是布尔值',
  ])
})

test('包身份校验：合法的自研包通过', () => {
  const result = checkPackageIdentity(repoRoot, [
    { dir: 'fixture-valid', manifest: { name: 'fixture-valid', luteOrigin: 'self', luteOwner: 'lute', lutePublish: false } },
  ])

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('pin 校验：pin 记录的 sha 与子模块实际 sha 不一致必须被拒绝', () => {
  const result = checkPinConsistency({
    pinText: 'harness-submodule: a66e4702047846cdaa10c66c9d3df3951f5ea70d\n',
    submoduleSha: 'ffffffffffffffffffffffffffffffffffffffff',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'vendor/dsh-desktop.pin 记录的 harness-submodule（a66e4702047846cdaa10c66c9d3df3951f5ea70d）与 vendor/dsh-desktop/deepseek-harness 实际 HEAD（ffffffffffffffffffffffffffffffffffffffff）不一致',
  ])
})

test('pin 校验：pin 仍为 NOT-INITIALIZED 视为未初始化并拒绝', () => {
  const result = checkPinConsistency({
    pinText: 'harness-submodule: NOT-INITIALIZED (pin a66e4702047846cdaa10c66c9d3df3951f5ea70d, runtime 0.1.2-rc.1)\n',
    submoduleSha: 'a66e4702047846cdaa10c66c9d3df3951f5ea70d',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['vendor/dsh-desktop.pin 的 harness-submodule 仍为 NOT-INITIALIZED（ADR-0008 要求初始化）'])
})

test('pin 校验：sha 一致时通过', () => {
  const result = checkPinConsistency({
    pinText: 'harness-submodule: a66e4702047846cdaa10c66c9d3df3951f5ea70d\n',
    submoduleSha: 'a66e4702047846cdaa10c66c9d3df3951f5ea70d',
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('gitignore 白名单校验：指向不存在路径的条目必须被拒绝', () => {
  const result = checkGitignoreWhitelist({
    gitignoreText: ['*', '!*/', '!real-dir/**', '!ghost-dir/**', '!vendor/dsh-desktop.pin', '!/README.md'].join('\n'),
    exists: (path) => path === 'vendor/dsh-desktop.pin' || path === 'README.md' || path === 'real-dir',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['ghost-dir: .gitignore 白名单条目指向不存在的路径（ADR-0013 禁止幽灵条目）'])
})

test('gitignore 白名单校验：全部条目指向真实路径时通过', () => {
  const result = checkGitignoreWhitelist({
    gitignoreText: ['*', '!*/', '!real-dir/**', '!vendor/dsh-desktop.pin'].join('\n'),
    exists: (path) => path === 'vendor/dsh-desktop.pin' || path === 'real-dir',
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('ADR 索引校验：索引行必须有对应文件且编号连续', () => {
  const result = checkAdrIndex({
    adrFiles: ['docs/adr/ADR-0001.md', 'docs/adr/ADR-0003.md'],
    indexText: '| ADR-0001 | 标题一 | accepted | — |\n| ADR-0003 | 标题三 | accepted | [Note](x.md) |\n',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['ADR 编号不连续：缺 ADR-0002（索引含 1, 3）'])
})

test('ADR 索引校验：索引提到但文件缺失必须被拒绝', () => {
  const result = checkAdrIndex({
    adrFiles: ['docs/adr/ADR-0001.md'],
    indexText: '| ADR-0001 | 标题一 | accepted | — |\n| ADR-0002 | 幽灵 | accepted | — |\n',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'docs/adr/ADR-0002.md：索引已登记但文件不存在',
    'ADR 文件数（1）与索引条目数（2）不一致',
  ])
})

test('ADR 索引校验：索引与文件一致时通过', () => {
  const result = checkAdrIndex({
    adrFiles: ['docs/adr/ADR-0001.md', 'docs/adr/ADR-0002.md'],
    indexText: '| ADR-0001 | 标题一 | accepted | — |\n| ADR-0002 | 标题二 | accepted | [Note](n.md) |\n',
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('ADR↔Note 互链校验：ADR 指向不存在的 Note 必须被拒绝', () => {
  const result = checkAdrNoteLinks({
    adrDocs: [
      { path: 'docs/adr/ADR-0007.md', text: '- 决策记录：[Note](../notes/implemented/architecture/2026-09-11-missing.md)\n' },
      { path: 'docs/adr/ADR-0008.md', text: '- 决策记录：[Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md)\n' },
    ],
    readNote: (path) => (path === 'docs/notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md' ? 'ADR-0008\n' : ''),
    exists: (path) => path === 'docs/notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['docs/adr/ADR-0007.md：决策记录链接指向不存在的 Note（docs/notes/implemented/architecture/2026-09-11-missing.md）'])
})

test('ADR↔Note 互链校验：Note 未引用其 ADR 编号必须被拒绝', () => {
  const result = checkAdrNoteLinks({
    adrDocs: [{ path: 'docs/adr/ADR-0007.md', text: '- 决策记录：[Note](../notes/implemented/architecture/2026-09-11-topic.md)\n' }],
    readNote: () => '本篇记录重构决策。\n',
    exists: () => true,
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['docs/notes/implemented/architecture/2026-09-11-topic.md：正文未引用 ADR-0007（由 docs/adr/ADR-0007.md 指向）'])
})

test('ADR↔Note 互链校验：双向可达时通过', () => {
  const result = checkAdrNoteLinks({
    adrDocs: [{ path: 'docs/adr/ADR-0007.md', text: '- 决策记录：[Note](../notes/implemented/architecture/2026-09-11-topic.md)\n' }],
    readNote: () => 'ADR-0007 记录三次推进。\n',
    exists: () => true,
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('ADR↔Note 互链校验：两篇 ADR 各指向自己的 Note 时互不牵连', () => {
  // 回归：早期实现把 Note 路径写死为单值，于是第二篇 ADR 会被拿去第一篇 Note 里找编号，
  // 必然失败——实际后果是每新增一篇独立主题的 ADR，都要往无关的 Note 里补一行例外说明。
  const notes = {
    'docs/notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md': 'ADR-0007 记录三期推进。\n',
    'docs/notes/implemented/architecture/2026-09-11-role-squad-contract.md': '决策记录见 ADR-0020。\n',
  }
  const result = checkAdrNoteLinks({
    adrDocs: [
      { path: 'docs/adr/ADR-0007.md', text: '- 决策记录：[Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md)\n' },
      { path: 'docs/adr/ADR-0020.md', text: '- 决策记录：[Note](../notes/implemented/architecture/2026-09-11-role-squad-contract.md)\n' },
    ],
    readNote: (path) => notes[path] ?? '',
    exists: (path) => path in notes,
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('ADR↔Note 互链校验：别的 Note 提到了该编号不能顶替自己那篇', () => {
  // 反向回归：ADR-0020 自己指向的 Note 没回引，而另一篇提到了 ADR-0020 —— 仍然必须被拒绝。
  const notes = {
    'docs/notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md': '另见 ADR-0020。\n',
    'docs/notes/implemented/architecture/2026-09-11-role-squad-contract.md': '本篇只讲编队。\n',
  }
  const result = checkAdrNoteLinks({
    adrDocs: [{ path: 'docs/adr/ADR-0020.md', text: '- 决策记录：[Note](../notes/implemented/architecture/2026-09-11-role-squad-contract.md)\n' }],
    readNote: (path) => notes[path] ?? '',
    exists: (path) => path in notes,
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['docs/notes/implemented/architecture/2026-09-11-role-squad-contract.md：正文未引用 ADR-0020（由 docs/adr/ADR-0020.md 指向）'])
})

test('豁免登记校验：新增条目必须被拒绝（只减不增）', () => {
  const result = checkExemptions({
    exemptions: [{ package: 'dsh-big', reason: '缺 typecheck', owner: 'lute', deadline: '2026-10-31' }],
    baseline: [],
    today: '2026-09-11',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'dsh-big: 新增豁免条目被拒绝（ADR-0014 只减不增，请在基线中登记或先补齐）',
  ])
})

test('豁免登记校验：deadline 延后必须被拒绝', () => {
  const result = checkExemptions({
    exemptions: [{ package: 'dsh-big', reason: '缺 typecheck', owner: 'lute', deadline: '2026-12-31' }],
    baseline: [{ package: 'dsh-big', reason: '缺 typecheck', owner: 'lute', deadline: '2026-10-31' }],
    today: '2026-09-11',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['dsh-big: 豁免期限不得延后（基线 2026-10-31 → 当前 2026-12-31，ADR-0014）'])
})

test('豁免登记校验：不可反悔地删除条目是允许的（只减不增）', () => {
  const result = checkExemptions({
    exemptions: [],
    baseline: [{ package: 'dsh-big', reason: '缺 typecheck', owner: 'lute', deadline: '2026-10-31' }],
    today: '2026-09-11',
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('豁免登记校验：缺字段与过期条目必须被拒绝', () => {
  const result = checkExemptions({
    exemptions: [
      { package: 'dsh-a', reason: '缺 typecheck', owner: 'lute', deadline: '2026-10-31' },
      { package: 'dsh-b', reason: '缺 test', owner: 'lute' },
      { package: 'dsh-c', reason: '缺 test', owner: 'lute', deadline: '2026-09-01' },
    ],
    baseline: [
      { package: 'dsh-a', reason: '缺 typecheck', owner: 'lute', deadline: '2026-10-31' },
      { package: 'dsh-b', reason: '缺 test', owner: 'lute', deadline: '2026-10-31' },
      { package: 'dsh-c', reason: '缺 test', owner: 'lute', deadline: '2026-09-01' },
    ],
    today: '2026-09-11',
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'dsh-b: 豁免条目缺少 deadline 字段（ADR-0014）',
    'dsh-c: 豁免已过期（deadline 2026-09-01，今天 2026-09-11）——到期即为最高优先级，不得继续豁免',
  ])
})

test('豁免登记校验：空数组且今天不晚于任何期限时通过', () => {
  const result = checkExemptions({ exemptions: [], baseline: [], today: '2026-09-11' })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('索引漂移校验：已跟踪文件同时命中忽略规则必须被拒绝', () => {
  const result = checkTrackedIgnored({
    trackedIgnored: ['dsh-patches/archive/profile-backups/package.json.bak-1788066245', 'release/README.md'],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'dsh-patches/archive/profile-backups/package.json.bak-1788066245: 已跟踪文件同时命中忽略规则（tracked+ignored 漂移，ADR-0013）',
    'release/README.md: 已跟踪文件同时命中忽略规则（tracked+ignored 漂移，ADR-0013）',
  ])
})

test('索引漂移校验：无漂移时通过', () => {
  const result = checkTrackedIgnored({ trackedIgnored: [] })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('嵌套仓库校验：未在 .gitmodules 声明的嵌套仓库必须被拒绝', () => {
  const result = checkNestedRepositories({
    nestedRepos: ['dsh-team-hub', 'dsh-task-board-local'],
    declaredSubmodules: [],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'dsh-team-hub: 未在 .gitmodules 声明的嵌套仓库——它不属于父仓库任何提交，内容会静默失管（ADR-0016）',
    'dsh-task-board-local: 未在 .gitmodules 声明的嵌套仓库——它不属于父仓库任何提交，内容会静默失管（ADR-0016）',
  ])
})

test('嵌套仓库校验：已声明的子模块不算未声明', () => {
  const result = checkNestedRepositories({
    nestedRepos: ['vendor/dsh-desktop'],
    declaredSubmodules: ['vendor/dsh-desktop'],
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('变更包校验：改动的包缺 typecheck/test 必须被拒绝', () => {
  const result = checkChangedPackages({
    changed: ['packages/capabilities/dsh-overseas-skills', 'packages/infra/dsh-team-hub'],
    packages: [
      { relPath: 'packages/capabilities/dsh-overseas-skills', manifest: { scripts: {} } },
      { relPath: 'packages/infra/dsh-team-hub', manifest: { scripts: { test: 'node --test test/*.test.mjs' } } },
    ],
    exempted: [],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'packages/capabilities/dsh-overseas-skills: 改动了本包但缺少 typecheck 脚本（ADR-0014：变更包立即纳入硬门槛）',
    'packages/capabilities/dsh-overseas-skills: 改动了本包但缺少 test 脚本（ADR-0014：变更包立即纳入硬门槛）',
    'packages/infra/dsh-team-hub: 改动了本包但缺少 typecheck 脚本（ADR-0014：变更包立即纳入硬门槛）',
  ])
})

test('变更包校验：豁免登记中的包不参与校验', () => {
  const result = checkChangedPackages({
    changed: ['packages/contract/dsh-skill-subset'],
    packages: [{ relPath: 'packages/contract/dsh-skill-subset', manifest: { scripts: {} } }],
    exempted: ['packages/contract/dsh-skill-subset'],
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('变更包校验：已补齐的包通过', () => {
  const result = checkChangedPackages({
    changed: ['packages/contract/dsh-skill-subset'],
    packages: [
      { relPath: 'packages/contract/dsh-skill-subset', manifest: { scripts: { typecheck: 'tsc --noEmit', test: 'node --test test/*.test.mjs' } } },
    ],
    exempted: [],
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('豁免冻结校验：豁免文件首次入库时允许初始登记', () => {
  const result = checkExemptions({
    exemptions: [{ package: 'packages/contract/dsh-skill-subset', reason: '缺 typecheck', owner: 'lute', deadline: '2026-10-31' }],
    baseline: [],
    today: '2026-09-11',
    baselineExists: false,
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('豁免冻结校验：基线已存在时仍禁止新增', () => {
  const result = checkExemptions({
    exemptions: [{ package: 'packages/x', reason: 'r', owner: 'lute', deadline: '2026-10-31' }],
    baseline: [],
    today: '2026-09-11',
    baselineExists: true,
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /新增豁免条目被拒绝/)
})

test('脚本可运行校验：退出码 127 视为空转（脚本存在但执行体不存在）', () => {
  const result = checkScriptsRunnable({
    packages: [
      { relPath: 'packages/platform/dsh-theme', scripts: { typecheck: 'tsc --noEmit' }, results: { typecheck: { code: 127, output: 'sh: tsc: command not found' } } },
    ],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'packages/platform/dsh-theme: typecheck 脚本无法执行（退出码 127）——脚本存在但执行体不存在，属空转脚本（ADR-0014）',
  ])
})

test('脚本可运行校验：退出码 0 通过，非 0 非 127 报告为运行失败', () => {
  const result = checkScriptsRunnable({
    packages: [
      { relPath: 'a', scripts: { typecheck: 'tsc --noEmit' }, results: { typecheck: { code: 0, stdout: '' } } },
      { relPath: 'b', scripts: { test: 'node --test' }, results: { test: { code: 1, stdout: 'boom' } } },
    ],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['b: test 脚本运行失败（退出码 1） — stdout: boom'])
})

test('脚本可运行校验：stderr 噪声不得挤掉 stdout 里的失败汇总（ADR-0043 实测比例）', () => {
  // 复刻 dsh-skill-center-local 的真实体量：stdout 784 字节装汇总，
  // stderr 5821 字节全是 React act() 警告。旧的「拼接后取尾 4000」会让
  // stderr 整段覆盖汇总——本项就是钉住那个回归。
  const stdout = 'Test Files  1 failed (11)\n  × panel.spec.tsx > forwards the displayed skill path\n'
  const stderr = 'Warning: An update to Root inside a test was not wrapped in act(...).\n'.repeat(80)

  const result = checkScriptsRunnable({
    packages: [
      {
        relPath: 'packages/surfaces/dsh-skill-center-local',
        scripts: { test: 'vitest run' },
        results: { test: { code: 1, stdout, stderr } },
      },
    ],
  })

  assert.equal(result.passed, false)
  const violation = result.violations[0]
  assert.match(violation, /退出码 1/)
  assert.match(violation, /stdout: .*Test Files {2}1 failed/)
  assert.match(violation, /forwards the displayed skill path/)
  assert.match(violation, /stderr: .*act\(\.\.\.\)/)
})

test('脚本可运行校验：没有退出码时不得折算成「退出码 1」（超限/信号与测试失败必须分得开）', () => {
  const result = checkScriptsRunnable({
    packages: [
      {
        relPath: 'packages/surfaces/dsh-big-local',
        scripts: { test: 'vitest run' },
        results: { test: { code: null, stdout: '', stderr: '', note: '输出超过 maxBuffer 16777216 字节' } },
      },
    ],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'packages/surfaces/dsh-big-local: test 脚本未给出退出码 — 输出超过 maxBuffer 16777216 字节',
  ])
  assert.doesNotMatch(result.violations[0], /退出码 1/)
})

test('脚本可运行校验：超时按 124 记，且说明是超时而非失败', () => {
  const result = checkScriptsRunnable({
    packages: [
      {
        relPath: 'packages/surfaces/dsh-slow-local',
        scripts: { test: 'vitest run' },
        results: { test: { code: 124, stdout: '', stderr: '', note: '超时 180000ms' } },
      },
    ],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'packages/surfaces/dsh-slow-local: test 脚本运行失败（退出码 124） — 超时 180000ms',
  ])
})

test('脚本可运行校验：无脚本的包不由本项负责（交给 changed-packages 与豁免）', () => {
  const result = checkScriptsRunnable({ packages: [{ relPath: 'c', scripts: {}, results: {} }] })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('依赖链接校验：指向不存在目标的符号链接必须被拒绝', () => {
  const result = checkDependencyLinks({
    links: [
      { from: 'packages/a/node_modules/@deepseek-ai/dsh-x', target: '/missing/path', exists: false },
      { from: 'packages/b/node_modules/@deepseek-ai/dsh-y', target: '/ok/path', exists: true },
    ],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'packages/a/node_modules/@deepseek-ai/dsh-x: 依赖符号链接断链（指向 /missing/path）——包目录层级变化会让相对链接失效（ADR-0016）',
  ])
})

test('依赖链接校验：全部链接可达时通过', () => {
  const result = checkDependencyLinks({
    links: [{ from: 'packages/b/node_modules/@deepseek-ai/dsh-y', target: '/ok/path', exists: true }],
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('shell 变量多字节校验：$VAR 紧跟全角字符必须被拒绝', () => {
  const result = checkShellVarAdjacentMultibyte({
    files: [
      { relPath: 'a.sh', text: 'say "编译完成: $APP（身份：x）"\n' },
      { relPath: 'b.sh', text: 'echo "退出码 $RC，应为 1"\n' },
    ],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, [
    'a.sh:1: $APP（ —— 变量名被后续多字节字符吞掉，请写成 ${VAR} 形式',
    'b.sh:1: $RC， —— 变量名被后续多字节字符吞掉，请写成 ${VAR} 形式',
  ])
})

test('shell 变量多字节校验：加花括号、ASCII 边界、位置参数均通过', () => {
  const result = checkShellVarAdjacentMultibyte({
    files: [
      { relPath: 'ok.sh', text: 'say "编译完成: ${APP}（身份：x）"\n' },
      { relPath: 'ascii.sh', text: 'echo "$RC, expected 1"\n' },
      { relPath: 'positional.sh', text: 'echo "$1（第一个参数）"\n' },
      { relPath: 'braced.sh', text: 'echo "${VAR}x"\n' },
    ],
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('shell 变量多字节校验：注释里的写法不算违规', () => {
  const result = checkShellVarAdjacentMultibyte({
    files: [
      { relPath: 'comment.sh', text: '# `$IDENTITY」` 会被解析成变量名\nSTAGING=""   # 已属于 $REL，不再管理\necho ok\n' },
    ],
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('shell 变量多字节校验：引号内的 # 不是注释起点', () => {
  const result = checkShellVarAdjacentMultibyte({
    files: [{ relPath: 'quoted.sh', text: 'echo "# tag $VAR，尾" > /dev/null\n' }],
  })

  assert.equal(result.passed, false)
  assert.deepEqual(result.violations, ['quoted.sh:1: $VAR， —— 变量名被后续多字节字符吞掉，请写成 ${VAR} 形式'])
})

test('出货 README 的 TCC 两项：写全两块面板时通过', () => {
  const result = checkDmgReadmeTccPanes({
    assembleScript:
      '- 启动后：**首次安装需授权两项**（系统设置 → 隐私与安全性）：\n' +
      '  **辅助功能**、**屏幕录制**。\n',
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('授权指引：出货 README 的历史错法（写「自动化」）必须判红', () => {
  // 这一行就是 2026-09-13 之前 assemble.sh 生成的出货 README 原文，用户照着授「自动化」，
  // 键盘鼠标类能力始终没反应。README 段的**完整性**由 checkDmgReadmeTccPanes 管
  // （这一行其实写全了两项），「把自动化/输入监控写成要授的项」由 checkTccPaneGuidance 管
  // ——它扫的正是 assemble.sh 的 heredoc 正文，两条判据合起来才是完整防线。
  const historical =
    '- 启动后：**首次安装需授权 TCC**（系统设置 → 隐私与安全 → 屏幕录制/辅助功能/自动化，授权 LUTE Agentic System）。\n'
  const result = checkTccPaneGuidance({
    files: [{ path: 'packaging/assemble.sh', text: historical }],
  })

  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /自动化/)
})

test('出货 README 的 TCC 两项：把「输入监控」写成第三项也必须判红（2026-09-13 的第二版错法）', () => {
  // 第一次改正时把第三项改成了「输入监控」——同样是错的：post_events 由「辅助功能」承载，
  // 库里没有 ListenEvent 行时 doctor 三项照样全 true（ADR-0069）。判据当时还**强制**要求
  // 每一处都这么写，于是把这个错误事实钉进了六个出货面。这条测试钉住：它不能再回来。
  const result = checkDmgReadmeTccPanes({
    assembleScript:
      '- 启动后：**首次安装需授权三项**：辅助功能、屏幕录制、输入监控。\n',
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /输入监控/)
})

test('出货 README 的 TCC 两项：正文解释「不要授权自动化」不算违规', () => {
  const result = checkDmgReadmeTccPanes({
    assembleScript:
      '- 启动后：**首次安装需授权两项**：辅助功能、屏幕录制。\n' +
      '  **不要授权「自动化」**——授了它不会让键盘鼠标类能力可用。\n',
  })

  assert.equal(result.passed, true)
})

test('出货 README 的 TCC 两项：整段缺失时判红并说明后果', () => {
  const result = checkDmgReadmeTccPanes({ assembleScript: '# 什么都没有\n' })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /缺少「首次安装需授权」段落/)
})

test('出货 README 的 TCC 两项：段落在但少了面板同样判红', () => {
  const result = checkDmgReadmeTccPanes({
    assembleScript: '- 启动后：**首次安装需授权两项**：辅助功能。\n',
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /缺少「屏幕录制」/)
})

// ── 授权指引的「出货面清单」（checkTccPaneGuidance）────────────────
// 起因：README 段改对之后，同一句话在另外五处仍是错的，其中 install.sh 的收尾提示
// 是用户装完机器最后看到的那一行。判据只守一个文件时，会对那五处说「全部通过」。

test('授权指引：安装器收尾提示里真实发生过的错法（录屏/辅助功能/自动化）必须判红', () => {
  // 2026-09-13 之前 packaging/installer/install.sh 末行就是这一句，装机后用户看到的就是它。
  const result = checkTccPaneGuidance({
    files: [
      {
        path: 'packaging/installer/install.sh',
        text: 'say "完成。① 重启 DSH Desktop；② 重新授权 TCC（录屏/辅助功能/自动化）；③ 复验：bash verify.sh"\n',
      },
    ],
  })

  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /install\.sh:1/)
  assert.match(result.violations[0], /自动化/)
})

test('授权指引：把「输入监控」写成要授的项必须判红（第二版错法，六个出货面都这么写过）', () => {
  // 这一条同时是判据自身的回归：改错之前，判据**要求**这一行必须含「输入监控」——
  // 判据成了错误事实的守门人，谁把文档改对反而判红。
  const result = checkTccPaneGuidance({
    files: [
      {
        path: 'README.md',
        text: '3. 安装后重启 DSH Desktop，重新授权 TCC（辅助功能/屏幕录制/输入监控）\n',
      },
    ],
  })

  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /输入监控/)
})

test('授权指引：改正后（辅助功能 / 屏幕录制）必须放行', () => {
  const result = checkTccPaneGuidance({
    files: [
      {
        path: 'README.md',
        text: '3. 安装后重启 DSH Desktop，重新授权 TCC（辅助功能/屏幕录制）\n',
      },
    ],
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('授权指引：只讲一个面板的行是合法的（排错句不该被判红）', () => {
  // 判据一旦开始冤枉正确文档，人就会绕过它。单面板排错句（「进辅助功能面板把开关打开」）
  // 不该被要求写全两项——完整性只由 checkDmgReadmeTccPanes 守在权威 README 那一处。
  const result = checkTccPaneGuidance({
    files: [
      {
        path: 'packaging/INSTALL-GUIDE.md',
        text: '| 点了没反应 | 授权是死的 | 进「辅助功能」面板，把该应用**关掉再打开** |\n',
      },
    ],
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('授权指引：否定式说明不算违规（判据不得逼着文档删掉警示）', () => {
  const result = checkTccPaneGuidance({
    files: [
      {
        path: 'packaging/assemble.sh',
        text:
          '  **不要授权「自动化」**——授了它不会让 `mac.key` 可用。\n' +
          '  也**不要去授「输入监控」**：它并非必需，post_events 由「辅助功能」承载。\n',
      },
    ],
  })

  assert.equal(result.passed, true)
})

test('授权指引：登记了却读不到内容的出货面必须判红（清单漂移不得静默通过）', () => {
  const result = checkTccPaneGuidance({
    files: [{ path: 'packaging/INSTALL-CARD.md', text: '' }],
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /读不到内容/)
})

test('授权指引：与授权项无关的普通行不受影响', () => {
  const result = checkTccPaneGuidance({
    files: [{ path: 'README.md', text: '# 标题\n- 这是一段与授权无关的说明。\n' }],
  })

  assert.equal(result.passed, true)
})

test('授权指引：shell 注释里的机制说明不算违规（它不发到用户面前）', () => {
  // assemble.sh 里真有一段这样的注释，解释的是本缺陷的机制——它逐字写着旧的三项说法。
  // 历史记录必须能留在注释里（否则没人敢记「我们曾经错在哪」），故 .sh 的注释行一律跳过。
  // 这条测试同时也钉住「跳过注释」只在 .sh 生效——下一测试管 .md。
  const result = checkTccPaneGuidance({
    files: [
      {
        path: 'packaging/assemble.sh',
        text: '# 早先的授权指引写的是「辅助功能 / 屏幕录制 / 输入监控」，那是错的：输入监控并非必需\n',
      },
    ],
  })

  assert.equal(result.passed, true)
})

test('授权指引：markdown 里的 # 是标题不是注释，仍须检查', () => {
  const result = checkTccPaneGuidance({
    files: [{ path: 'README.md', text: '# 重新授权 TCC（录屏/辅助功能/自动化）\n' }],
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /自动化/)
})

// ── 出货 README 的 heredoc 必须是字面文本（checkReadmeHeredocIsLiteral）──────
// 起因：unquoted heredoc + 裸反引号 = 打包时真的执行。2026-09-13 在同一份产物上抓到两处，
// 客户拿到的 README 里真的印着 `macos-harness doctor` 的原始 JSON 与构建机的目录名。

const heredoc = (body) => `cat > "$PAYLOAD/README.md" <<EOF\n${body}\nEOF\n`

test('出货 README heredoc：真实发生过的错法（裸反引号打进了 doctor 的 JSON）必须判红', () => {
  const result = checkReadmeHeredocIsLiteral({
    assembleScript: heredoc('这三项正是 `macos-harness doctor` 的读数：`accessibility`、`post_events`。'),
  })

  assert.equal(result.passed, false)
  // 三对反引号 = 6 处未转义，逐处点名（每一处都会真的执行一次）
  assert.equal(result.violations.length, 6)
  assert.match(result.violations[0], /assemble\.sh:2/)
  assert.match(result.violations[0], /裸反引号/)
})

test('出货 README heredoc：真实发生过的第二处（$(basename "$PWD")）必须判红', () => {
  const result = checkReadmeHeredocIsLiteral({
    assembleScript: heredoc('shasum -a 256 ../$(basename "$PWD").dmg  # 与发布方给的 SHA256 对照'),
  })

  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /命令替换/)
})

test('出货 README heredoc：转义后的写法放行，参数展开（$VERSION）不算违规', () => {
  const result = checkReadmeHeredocIsLiteral({
    assembleScript: heredoc(
      '# DSH Desktop LUTE $VERSION 离线完整包\n' +
        '这三项正是 \\`macos-harness doctor\\` 的读数。\n' +
        'shasum -a 256 ~/Downloads/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg\n',
    ),
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('出货 README heredoc：锚点漂移必须判红（找不到段就不能当通过）', () => {
  const result = checkReadmeHeredocIsLiteral({ assembleScript: '# 什么都没有\n' })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /找不到出货 README 的 heredoc 锚点/)
})

test('出货 README heredoc：段外的裸反引号不受影响（只审判这一段）', () => {
  const result = checkReadmeHeredocIsLiteral({
    assembleScript: `echo \`date\`\n${heredoc('全部字面文本。')}`,
  })

  assert.equal(result.passed, true)
})
