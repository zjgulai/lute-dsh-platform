/**
 * `changed-packages` 射程解析的反向自测（QG-005）。
 *
 * 三层证据**互不替代**：
 *   - L1：临时 Git 仓库 fixture（提交图 / 工作树 / 远端跟踪引用都是造出来的），
 *     覆盖「本地超前远端」「untracked」「rename」「delete」「base 不可解析」；
 *   - L2：对**当前仓库**只读对比——本文件不写仓库任何文件，只把解析器的账目
 *     与 `git status` 的账目对账，证明没有路径在中间消失；
 *   - L3：CI 事件 base 重放由 QG-007 承担，本文件只断言它的入口契约
 *     （`DSH_GATE_BASE_SHA` 必须存在、必须可达、必须真的是 merge-base）。
 *
 * 反证的落点：每一条判据都要能说「不」。`断言判据会红` 一节用**独立的本机
 * git 调用**算出期望值，再要求解析器给出同一个答案；`守卫会红` 一节直接
 * 对着守卫输入制造它该拒绝的形状。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { withMutationFixture } from '../lib/mutation-fixture.mjs'
import { collectManagedManifests } from './package-collect.mjs'
import {
  BASE_SHA_ENV,
  CHANGE_SOURCES,
  LOCAL_BASE_REF,
  ROOT_GOVERNANCE_RULES,
  collectWorktreeChanges,
  createGitRunner,
  ownerOf,
  parseNameStatus,
  resolveBase,
  resolveChangedScope,
  ruleOf,
} from './changed-packages.mjs'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** 临时 fixture 里跑 git 的固定环境：不读用户全局配置，不依赖身份设置。 */
function fixtureEnv(fixture) {
  return {
    ...process.env,
    HOME: fixture.home,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  }
}

function gitIn(fixture, args) {
  return execFileSync('git', ['-C', fixture.repo, ...args], {
    encoding: 'utf8',
    env: fixtureEnv(fixture),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function writeFileUnder(fixture, relativePath, contents) {
  const target = fixture.path('repo', ...relativePath.split('/'))
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, contents)
  return target
}

function commit(fixture, message) {
  gitIn(fixture, ['add', '-A'])
  gitIn(fixture, ['commit', '-qm', message])
}

/**
 * 基线 fixture：两个包在**基线提交里就存在**，`origin/main` 就停在这里，
 * 之后没有任何本地提交。于是「射程里有什么」完全由测试自己造成的改动决定，
 * 断言集合不必猜 fixture 的历史。
 */
async function withBaseFixture(callback) {
  return withMutationFixture({ prefix: 'lute-qg005' }, async (fixture) => {
    gitIn(fixture, ['init', '-q', '--initial-branch=main', '.'])
    writeFileUnder(fixture, 'packages/alpha/package.json', '{"name":"alpha"}\n')
    writeFileUnder(fixture, 'packages/alpha/lib/index.js', 'export const a = 1\n')
    writeFileUnder(fixture, 'packages/beta/package.json', '{"name":"beta"}\n')
    writeFileUnder(fixture, 'packages/beta/lib/index.js', 'export const b = 1\n')
    commit(fixture, 'base')
    gitIn(fixture, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
    return callback(fixture)
  })
}

/**
 * 在基线之上再走两个提交：本地 main 因此**超前** origin/main 两个提交。
 * 这正是旧实现 `main...HEAD` 自比较失效的形状。
 */
async function withAheadFixture(callback) {
  return withBaseFixture(async (fixture) => {
    writeFileUnder(fixture, 'packages/alpha/lib/index.js', 'export const a = 2\n')
    commit(fixture, 'touch packages/alpha')
    writeFileUnder(fixture, 'packages/beta/lib/index.js', 'export const b = 2\n')
    commit(fixture, 'touch packages/beta')
    return callback(fixture)
  })
}

const FIXTURE_PACKAGES = [
  { relPath: 'packages/alpha' },
  { relPath: 'packages/beta' },
]

function scopeOf(fixture, packages = FIXTURE_PACKAGES, env = {}) {
  return resolveChangedScope({
    git: createGitRunner({ cwd: fixture.repo, env: fixtureEnv(fixture) }),
    env: { ...fixtureEnv(fixture), ...env },
    packages,
  })
}

// ---------------------------------------------------------------------------
// 断言判据会红：旧实现的形状必须消失
// ---------------------------------------------------------------------------

test('QG-005 Red：本地 main 超前 origin/main 时，旧的 main...HEAD 自比较射程为空', async () => {
  await withAheadFixture(async (fixture) => {
    // 先用**独立的本机 git 调用**确认 fixture 真的是那个形状：
    const ahead = gitIn(fixture, ['rev-list', '--left-right', '--count', 'origin/main...HEAD']).trim()
    assert.equal(ahead, '0\t2', 'fixture 必须让本地超前 origin/main 两个提交')

    // 旧来源 1：自比较，恒为空。
    assert.equal(gitIn(fixture, ['diff', '--name-only', 'main...HEAD']).trim(), '')
    // 旧来源 2/3：没有未提交改动时也是空的。
    assert.equal(gitIn(fixture, ['diff', '--name-only', 'HEAD']).trim(), '')
    assert.equal(gitIn(fixture, ['diff', '--name-only', '--cached']).trim(), '')

    // 新解析器：同一棵树上必须命中两个包。
    const scope = scopeOf(fixture)
    assert.equal(scope.ok, true, scope.reason)
    assert.deepEqual(scope.packages, ['packages/alpha', 'packages/beta'])
    assert.equal(scope.sources.committed.length, 2)
    assert.equal(scope.base.ref, LOCAL_BASE_REF)
  })
})

test('QG-005 Red：全新 untracked 包必须进入射程（旧实现四个来源都不含它）', async () => {
  await withBaseFixture(async (fixture) => {
    writeFileUnder(fixture, 'packages/gamma/package.json', '{"name":"gamma"}\n')
    // 独立读数：它确实还是 untracked。
    assert.match(gitIn(fixture, ['status', '--porcelain', '--untracked-files=all']), /\?\? packages\/gamma\//)

    const scope = scopeOf(fixture, [...FIXTURE_PACKAGES, { relPath: 'packages/gamma' }])
    assert.equal(scope.ok, true, scope.reason)
    assert.deepEqual(scope.packages, ['packages/gamma'])
    assert.deepEqual(scope.sources.untracked, ['packages/gamma/package.json'])
    assert.deepEqual(scope.sources.committed, [], 'committed 射程必须为空——不要把 untracked 混进来')
  })
})

test('QG-005 Red：base 不可解析时判红，绝不返回空集合', async () => {
  await withMutationFixture({ prefix: 'lute-qg005' }, async (fixture) => {
    gitIn(fixture, ['init', '-q', '--initial-branch=main', '.'])
    writeFileUnder(fixture, 'packages/alpha/package.json', '{}\n')
    commit(fixture, 'base')

    // 没有远端跟踪引用、没有 upstream —— 基线无法解析。
    const scope = scopeOf(fixture)
    assert.equal(scope.ok, false)
    assert.deepEqual(scope.packages, [])
    assert.match(scope.reason, /无法解析改动基线/)
    assert.match(scope.reason, /未知射程不得退化成空集/)
  })
})

test('QG-005：只有被证明为空的完整并集才允许空射程', async () => {
  await withBaseFixture(async (fixture) => {
    const scope = scopeOf(fixture)
    assert.equal(scope.ok, true, scope.reason)
    assert.deepEqual(scope.packages, [])
    for (const name of CHANGE_SOURCES) assert.deepEqual(scope.sources[name], [], `${name} 应当为空`)
    // 空射程是**被证明**的：基线在、四类来源都取到了、只是真的没改动。
    assert.ok(scope.base.sha.length === 40)
  })
})

// ---------------------------------------------------------------------------
// rename / delete / 分段边界
// ---------------------------------------------------------------------------

test('QG-005：rename 必须同时映射旧包与新包', async () => {
  await withBaseFixture(async (fixture) => {
    gitIn(fixture, ['mv', 'packages/beta', 'packages/beta-renamed'])
    commit(fixture, 'rename packages/beta')
    const scope = scopeOf(fixture, [
      { relPath: 'packages/alpha' },
      { relPath: 'packages/beta' },
      { relPath: 'packages/beta-renamed' },
    ])
    assert.equal(scope.ok, true, scope.reason)
    assert.equal(scope.renames.length, 2, `rename 应逐文件记两处（package.json 与 lib/index.js）：${JSON.stringify(scope.renames)}`)
    // 只取新路径会漏掉「旧包凭空消失」那一半。
    assert.deepEqual(scope.packages, ['packages/beta', 'packages/beta-renamed'])
  })
})

test('QG-005：delete 必须定位到被删文件所属的包', async () => {
  await withBaseFixture(async (fixture) => {
    gitIn(fixture, ['rm', '-q', 'packages/beta/lib/index.js'])
    commit(fixture, 'delete packages/beta/lib/index.js')
    const scope = scopeOf(fixture)
    assert.equal(scope.ok, true, scope.reason)
    assert.deepEqual(scope.packages, ['packages/beta'], '被删除的包仍须进射程')
    assert.deepEqual(scope.sources.committed, ['packages/beta/lib/index.js'])
  })
})

test('QG-005：路径必须按分段边界归属，同前缀的兄弟包不得互相冒领', () => {
  const dirs = ['packages/a/b', 'packages/a/bc'].sort((x, y) => y.length - x.length)
  assert.equal(ownerOf('packages/a/b/lib/index.js', dirs), 'packages/a/b')
  assert.equal(ownerOf('packages/a/bc/lib/index.js', dirs), 'packages/a/bc')
  assert.equal(ownerOf('packages/a/b', dirs), 'packages/a/b')
  assert.equal(ownerOf('packages/a/b-other/x.js', dirs), null)
  assert.equal(ownerOf('packages/a', dirs), null)
})

test('QG-005：staged 与 unstaged 分类入账，不合并成一个来源', async () => {
  await withBaseFixture(async (fixture) => {
    writeFileUnder(fixture, 'packages/alpha/staged.txt', 's\n')
    gitIn(fixture, ['add', 'packages/alpha/staged.txt'])
    // unstaged 必须是**已跟踪**文件的改动：新建文件无论加不加 `-N` 都只出现在
    // untracked 桶里，把它写进 unstaged 的期望值就是在一个错的分类上做断言。
    writeFileUnder(fixture, 'packages/beta/lib/index.js', 'export const b = 2\n')

    const scope = scopeOf(fixture)
    assert.equal(scope.ok, true, scope.reason)
    assert.deepEqual(scope.sources.staged, ['packages/alpha/staged.txt'])
    assert.deepEqual(scope.sources.unstaged, ['packages/beta/lib/index.js'])
    assert.deepEqual(scope.sources.untracked, [])
    assert.deepEqual(scope.packages, ['packages/alpha', 'packages/beta'])
    // 同一份改动不能同时算进两个来源——重复计入会让 report 的来源计数说谎。
    assert.deepEqual(scope.sources.committed, [])
  })
})

// ---------------------------------------------------------------------------
// L3 入口契约：CI 事件 base
// ---------------------------------------------------------------------------

test('QG-005 L3：事件 base SHA 不可达时判红并点名 fetch 缺失', async () => {
  await withAheadFixture(async (fixture) => {
    const missing = 'b'.repeat(40)
    const scope = scopeOf(fixture, FIXTURE_PACKAGES, { [BASE_SHA_ENV]: missing })
    assert.equal(scope.ok, false)
    assert.match(scope.reason, /不是可达的 commit/)
    assert.match(scope.reason, /shallow clone 缺该对象时不能假装射程为空/)
  })
})

test('QG-005 L3：事件 base 不在 HEAD 的历史上时判红（事件与历史不一致）', async () => {
  await withAheadFixture(async (fixture) => {
    // 造一条与 HEAD 分叉的提交：它可达，但不是 HEAD 的祖先，因此
    // `merge-base(HEAD, it)` 是更早的公共祖先而不是它自己。
    const sha = gitIn(fixture, ['rev-list', '--max-parents=0', 'HEAD']).trim()
    gitIn(fixture, ['checkout', '-q', '-b', 'divergent', sha])
    writeFileUnder(fixture, 'packages/delta/package.json', '{}\n')
    commit(fixture, 'divergent work')
    const divergentSha = gitIn(fixture, ['rev-parse', 'HEAD']).trim()
    gitIn(fixture, ['checkout', '-q', 'main'])

    // 独立读数：它确实在对象库里，也确实不是 HEAD 的祖先。
    gitIn(fixture, ['cat-file', '-e', `${divergentSha}^{commit}`])
    assert.throws(() => gitIn(fixture, ['merge-base', '--is-ancestor', divergentSha, 'HEAD']))

    const scope = scopeOf(fixture, FIXTURE_PACKAGES, { [BASE_SHA_ENV]: divergentSha })
    assert.equal(scope.ok, false)
    assert.match(scope.reason, /不是 HEAD 的 merge-base/)
    assert.deepEqual(scope.packages, [])
  })
})

test('QG-005 L3：事件 base 确实是 HEAD 的 merge-base 时被接受，且来源标为事件基线', async () => {
  await withAheadFixture(async (fixture) => {
    const base = gitIn(fixture, ['merge-base', 'HEAD', 'origin/main']).trim()
    const scope = scopeOf(fixture, FIXTURE_PACKAGES, { [BASE_SHA_ENV]: base })
    assert.equal(scope.ok, true, scope.reason)
    assert.equal(scope.base.source, 'event-base-sha')
    assert.equal(scope.base.sha, base)
  })
})

test('QG-005 L3：shallow clone 里事件 base 未被 fetch 时判红，绝不假装射程为空', async () => {
  await withMutationFixture({ prefix: 'lute-qg005' }, async (fixture) => {
    const originDir = fixture.path('repo', 'origin-src')
    mkdirSync(originDir)
    const originGit = (args) => execFileSync('git', ['-C', originDir, ...args], {
      encoding: 'utf8',
      env: fixtureEnv(fixture),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    originGit(['init', '-q', '--initial-branch=main', '.'])
    writeFileUnder(fixture, 'origin-src/packages/alpha/package.json', '{}\n')
    originGit(['add', '-A'])
    originGit(['commit', '-qm', 'oldest'])
    const oldest = originGit(['rev-parse', 'HEAD']).trim()
    writeFileUnder(fixture, 'origin-src/packages/beta/package.json', '{}\n')
    originGit(['add', '-A'])
    originGit(['commit', '-qm', 'newest'])

    const cloneDir = fixture.path('repo', 'shallow')
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${originDir}`, cloneDir], {
      env: fixtureEnv(fixture),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const git = createGitRunner({ cwd: cloneDir, env: fixtureEnv(fixture) })
    assert.equal(git(['rev-parse', '--is-shallow-repository']).stdout.trim(), 'true')
    // 独立读数：CI 事件要的那个基线的对象**确实不在**这个浅克隆里。
    assert.equal(git(['cat-file', '-e', `${oldest}^{commit}`]).ok, false)

    const scope = resolveChangedScope({
      git,
      env: { ...fixtureEnv(fixture), [BASE_SHA_ENV]: oldest },
      packages: FIXTURE_PACKAGES,
    })
    assert.equal(scope.ok, false)
    assert.deepEqual(scope.packages, [])
    assert.match(scope.reason, /不是可达的 commit/)
  })
})

// ---------------------------------------------------------------------------
// 根治理文件与规则活性
// ---------------------------------------------------------------------------

test('QG-005：根治理文件命中已登记规则，工作区级的展开全部包', async () => {
  await withBaseFixture(async (fixture) => {
    writeFileUnder(fixture, 'package.json', '{"name":"fixture-root"}\n')
    const scope = scopeOf(fixture, FIXTURE_PACKAGES.concat([{ relPath: 'packages/gamma' }]))
    assert.equal(scope.ok, true, scope.reason)
    assert.deepEqual(scope.rules, ['workspace-dependency-graph'])
    assert.equal(scope.expandAllPackages, true)
    // 直接命中的是 0 个包，但工作区依赖图变了 → 射程必须覆盖全部包。
    assert.deepEqual(scope.directPackages, [])
    assert.deepEqual(scope.packages, ['packages/alpha', 'packages/beta', 'packages/gamma'])
  })
})

test('QG-005：未登记治理规则的根级改动进读数桶，不冒充成「命中规则」', async () => {
  await withBaseFixture(async (fixture) => {
    writeFileUnder(fixture, 'README.md', '# x\n')
    writeFileUnder(fixture, 'docs/notes/implemented/contract/2026-09-17-x.md', '# y\n')
    const scope = scopeOf(fixture)
    assert.equal(scope.ok, true, scope.reason)
    assert.deepEqual(scope.rules, [])
    assert.deepEqual(scope.otherRootPaths, ['README.md', 'docs/notes/implemented/contract/2026-09-17-x.md'])
    assert.deepEqual(scope.packages, [])
  })
})

test('QG-005：登记的每条治理规则在真实仓库里都活着，且不被更宽的前缀吃掉', () => {
  // 死规则是「写了但从没跑到」的形态：它永远绿，因为它的输入永远不存在。
  // 影子规则更隐蔽——它的输入存在，但每次都被更宽的兄弟先接走。
  const tracked = execFileSync('git', ['-C', REPO_ROOT, 'ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
  const dead = ROOT_GOVERNANCE_RULES.filter((entry) => !tracked.some((path) => ruleOf(path) === entry))
  assert.deepEqual(
    dead.map((entry) => entry.path ?? entry.prefix),
    [],
    '这些治理规则匹配不到任何文件（或每次都被更宽的前缀吃掉），它们永远不会触发',
  )
})

test('QG-005：规则匹配必须与路径形状一致（精确文件名不得吃掉同前缀的兄弟）', () => {
  assert.equal(ruleOf('package.json')?.rule, 'workspace-dependency-graph')
  assert.equal(ruleOf('package.json.bak'), null)
  assert.equal(ruleOf('scripts/gates/changed-packages.mjs')?.rule, 'gate-instrument')
  assert.equal(ruleOf('scripts/gate.mjs')?.rule, 'gate-instrument')
  assert.equal(ruleOf('scripts/gate.mjs.bak'), null)
  assert.equal(ruleOf('docs/adr/ADR-0001.md')?.rule, 'adr-registry')
  assert.equal(ruleOf('docs/notes/implemented/contract/x.md'), null)
})

// ---------------------------------------------------------------------------
// 解析器边界
// ---------------------------------------------------------------------------

test('QG-005：name-status -z 解析覆盖 rename / delete / 尾随 NUL', () => {
  const rename = parseNameStatus('R086\0old/a.js\0new/a.js\0')
  assert.deepEqual(rename.entries, [{ status: 'R', from: 'old/a.js', to: 'new/a.js' }])
  assert.equal(rename.malformed, null)

  const remove = parseNameStatus('D\0gone/a.js\0')
  assert.deepEqual(remove.entries, [{ status: 'D', from: 'gone/a.js', to: 'gone/a.js' }])

  const mixed = parseNameStatus('M\0a.js\0A\0b.js\0')
  assert.deepEqual(mixed.entries.map((entry) => entry.status), ['M', 'A'])

  // 字段不足必须报出来，不能静默产出半个条目。
  const short = parseNameStatus('R086\0only-one\0')
  assert.match(short.malformed, /重命名条目字段不足/)
  assert.deepEqual(short.entries, [])
})

test('QG-005：来源取不到时进 problems，而不是被吞成一个更小的射程', async () => {
  await withMutationFixture({ prefix: 'lute-qg005' }, async (fixture) => {
    // 不是 git 仓库：四个来源全部取不到。
    const { buckets, problems } = collectWorktreeChanges({
      git: createGitRunner({ cwd: fixture.repo, env: fixtureEnv(fixture) }),
      base: 'HEAD',
    })
    assert.equal(buckets.committed.length, 0)
    assert.equal(problems.length, 4, `四类来源都必须各报一次，实际：${problems.join('；')}`)
  })
})

test('QG-005 L2：解析器的账目与 git status 的账目逐路径对账（只读，不写仓库）', () => {
  // 独立仪器：直接问 git 要一份完整的工作树清单，再要求解析器一个字都不少。
  // 本断言不依赖仓库当前是否脏——它断言的是「没有任何路径在中间消失」。
  const raw = execFileSync('git', ['-C', REPO_ROOT, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    encoding: 'utf8',
  })
  const fields = raw.split('\0')
  const expected = new Set()
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index]
    if (!entry || entry.length < 4) continue
    const code = entry.slice(0, 2)
    expected.add(entry.slice(3))
    // rename/copy 的**目标路径在前、源路径在后**（与 diff --name-status 相反）。
    if (code[0] === 'R' || code[0] === 'C') {
      expected.add(fields[index + 1] ?? '')
      index += 1
    }
  }
  expected.delete('')

  const git = createGitRunner({ cwd: REPO_ROOT, env: process.env })
  const base = resolveBase({ git, env: {} })
  assert.equal(base.ok, true, `真实仓库必须能解析出基线：${base.reason}`)
  const { buckets, problems } = collectWorktreeChanges({ git, base: base.sha })
  assert.deepEqual(problems, [])

  const actual = new Set()
  // 2026-09-18：这里原先只写 `actual.add(entry.to)`，于是**只要工作树里存在任何未提交的
  // 重命名**，本条就必红——上面的期望集是从 `git status --porcelain=v1 -z` 独立解析出来的，
  // 它对 rename 条目**新旧两个路径都收**；而解析器 `collectWorktreeChanges` 的
  // `buckets[*][].from` 里明明也带着源路径（第 348 行 `new Set([entry.from, entry.to])`）。
  // 断言只对了账一半，报出来的却是「这些路径在 git status 里，却没进解析器的账目」——
  // 指向一个不存在的缺陷。它把真缺陷（解析器**确实**丢路径）藏在了一条永远亮着的红灯后面：
  // 假红会训练人忽略输出（P-02）。两个端点都要收。
  for (const name of CHANGE_SOURCES) {
    for (const entry of buckets[name]) {
      if (entry.to !== undefined && entry.to !== '') actual.add(entry.to)
      if (entry.from !== undefined && entry.from !== '') actual.add(entry.from)
    }
  }

  const missing = [...expected].filter((path) => !actual.has(path)).sort()
  assert.deepEqual(missing, [], '这些路径在 git status 里，却没进解析器的账目')
})

test('QG-005 L2：真实仓库的射程能在只读前提下解析出来，且基线可追溯', () => {
  const manifests = collectManagedManifests(REPO_ROOT).filter((entry) => entry.dir !== '.')
  const scope = resolveChangedScope({
    git: createGitRunner({ cwd: REPO_ROOT, env: process.env }),
    env: {},
    packages: manifests,
  })
  assert.equal(scope.ok, true, scope.reason)
  assert.ok(scope.base.sha.length === 40, '基线必须是完整 SHA，报告里要能追溯')
  // 射程内的每个包都必须在受管清单里——否则就是解析器与包收集器分叉。
  const known = new Set(manifests.map((entry) => entry.relPath))
  for (const relPath of scope.packages) assert.ok(known.has(relPath), `${relPath} 不在受管包清单里`)
})
