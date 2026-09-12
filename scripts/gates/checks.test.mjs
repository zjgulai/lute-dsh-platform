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
  checkExemptions,
  checkNestedRepositories,
  checkPackageIdentity,
  checkPinConsistency,
  checkScriptsRunnable,
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
