import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeCommand } from './real-node.mjs'
import {
  MutationFixtureError,
  createMutationFixture,
  liveFixtureRoots,
  mutationRoot,
  reapAll,
  withMutationFixture,
} from './mutation-fixture.mjs'

const fixtureModulePath = fileURLToPath(new URL('./mutation-fixture.mjs', import.meta.url))

const leftovers = []

afterEach(() => {
  while (leftovers.length > 0) rmSync(leftovers.pop(), { recursive: true, force: true })
})

function isInside(parent, candidate) {
  const rel = relative(parent, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function codeIs(code) {
  return (error) => error instanceof MutationFixtureError && error.code === code
}

test('完整生命周期：唯一根、隔离 repo/home/profile/tmp，commit 后自动清理', async () => {
  let observed
  const result = await withMutationFixture({ prefix: 'mutation-fixture-lifecycle' }, async (fixture) => {
    observed = fixture
    assert.equal(fixture.state, 'COMMITTING')
    for (const pathname of [fixture.repo, fixture.home, fixture.profile, fixture.tmp]) {
      assert.equal(isInside(fixture.root, pathname), true)
      assert.equal(isInside(resolve(process.cwd()), pathname), false)
      assert.equal(isInside(resolve(homedir()), pathname), false)
    }
    assert.equal(fixture.environment.HOME, fixture.home)
    assert.equal(fixture.environment.TMPDIR, fixture.tmp)
    assert.equal(fixture.environment.DSH_PROFILE_DIR, fixture.profile)
    writeFileSync(fixture.path('repo', 'fixture.txt'), 'isolated\n')
    return 'committed'
  })

  assert.equal(result, 'committed')
  assert.equal(observed.state, 'CLEANED')
  assert.equal(existsSync(observed.root), false)
  assert.equal(observed.cleanup(), true, '重复 cleanup 必须幂等地返回首次结果')
})

test('每次 create 都生成不同 mkdtemp 根', () => {
  const one = createMutationFixture({ prefix: 'mutation-fixture-unique' })
  const two = createMutationFixture({ prefix: 'mutation-fixture-unique' })
  try {
    assert.notEqual(one.root, two.root)
    assert.notDeepEqual(lstatSync(one.root, { bigint: true }).ino, lstatSync(two.root, { bigint: true }).ino)
  } finally {
    one.cleanup()
    two.cleanup()
  }
})

test('临时父目录不得落在 checkout 或真实 HOME，也不得借 tempParent 改到系统临时目录外', () => {
  assert.throws(
    () => createMutationFixture({ prefix: 'mutation-fixture-protected', tempParent: process.cwd() }),
    (error) => error instanceof MutationFixtureError
      && ['FIXTURE_PARENT_NOT_TEMP', 'FIXTURE_PARENT_PROTECTED'].includes(error.code),
  )
  assert.throws(
    () => createMutationFixture({ prefix: 'mutation-fixture-home', tempParent: homedir() }),
    (error) => error instanceof MutationFixtureError
      && ['FIXTURE_PARENT_NOT_TEMP', 'FIXTURE_PARENT_PROTECTED'].includes(error.code),
  )
})

test('prepare 半失败：已创建的隔离根自动清理，commit 不会运行', async () => {
  let root = null
  let committed = false
  await assert.rejects(
    withMutationFixture({
      prefix: 'mutation-fixture-prepare-failure',
      prepare(fixture) {
        root = fixture.root
        writeFileSync(fixture.path('profile', 'partial.yml'), 'partial\n')
        throw new Error('prepare half failed')
      },
    }, async () => { committed = true }),
    /prepare half failed/,
  )
  assert.equal(committed, false)
  assert.equal(existsSync(root), false)
})

test('commit 回调抛错：自动 cleanup 后将原错误交还调用方', async () => {
  let root = null
  await assert.rejects(
    withMutationFixture({
      prefix: 'mutation-fixture-work-failure',
      prepare(fixture) { root = fixture.root },
    }, async (fixture) => {
      writeFileSync(fixture.path('home', 'state.txt'), 'mutated\n')
      throw new Error('work failed')
    }),
    /work failed/,
  )
  assert.equal(existsSync(root), false)
})

test('路径解析拒绝 traversal、绝对路径和既有 symlink 穿越', async () => {
  const fixture = createMutationFixture({ prefix: 'mutation-fixture-boundary' })
  try {
    await fixture.prepare()
    for (const segments of [['..'], ['/tmp'], ['a/b'], ['a\\b']]) {
      assert.throws(() => fixture.path('repo', ...segments), codeIs('FIXTURE_PATH_ESCAPE'))
    }
    assert.throws(() => fixture.path('outside', 'x'), codeIs('FIXTURE_SCOPE_INVALID'))
    symlinkSync(fixture.tmp, join(fixture.repo, 'escape'), 'dir')
    assert.throws(() => fixture.path('repo', 'escape', 'payload'), codeIs('FIXTURE_PATH_SYMLINK'))
  } finally {
    fixture.cleanup()
  }
})

test('cleanup 只删除原始自有 inode；根被替换时拒绝删除', () => {
  const fixture = createMutationFixture({ prefix: 'mutation-fixture-ownership' })
  const root = fixture.root
  // The replacement is deliberately outside the fixture API: it models a
  // concurrent actor replacing the pathname after creation.
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root)
  writeFileSync(join(root, 'must-survive.txt'), 'not owned by fixture\n')
  leftovers.push(root)

  assert.throws(() => fixture.cleanup(), codeIs('FIXTURE_OWNERSHIP_CHANGED'))
  assert.equal(existsSync(join(root, 'must-survive.txt')), true)
})

test('断言与 cleanup 同时失败：保留原断言并附带 cleanup 错误，替换根不被删除', async () => {
  let replacementRoot = null
  let failure = null
  try {
    await withMutationFixture({ prefix: 'mutation-fixture-double-failure' }, async (fixture) => {
      replacementRoot = fixture.root
      rmSync(fixture.root, { recursive: true, force: true })
      mkdirSync(fixture.root)
      writeFileSync(join(fixture.root, 'must-survive.txt'), 'replacement is not owned\n')
      leftovers.push(fixture.root)
      assert.fail('fixture assertion failed')
    })
  } catch (error) {
    failure = error
  }

  assert.match(failure?.message ?? '', /fixture assertion failed/)
  assert.equal(failure?.cleanupError?.code, 'FIXTURE_OWNERSHIP_CHANGED')
  assert.equal(existsSync(join(replacementRoot, 'must-survive.txt')), true)
})

// ── 进程级回收：finally 跑不到的那些结束路径 ──────────────────────────────────
//
// 这两条是**真子进程**用例，不是对函数的调用：`process.on('exit')` 与信号处理
// 只有在进程真的结束时才成立，在测试进程里模拟结束就是拿自己的替身量自己。
//
// 立项依据是实测，不是担心：2026-09-17 在 TMPDIR 上数出 1,555 个
// `fullstack-installer-*`、438 个 `gn-check-*`、82 个 `wanzh-routes-*`（35 MB）
// 是历次跑门禁留下的；`kill -TERM` 一个正在跑的 gate 会留下 8 个根，并把一个
// `node scripts/gate.mjs` 变成 init 的子进程。全绿的门禁与「干净」在读数上同形。

const { command: NODE, env: NODE_ENV } = nodeCommand()

/** 让子进程创建一个 fixture 并把根路径打到 stdout 后挂住。 */
const REAP_PROBE = [
  'const { mutationRoot, liveFixtureRoots } = await import(process.env.REAP_PROBE_MODULE)',
  "const root = mutationRoot('reap-probe-')",
  'process.stdout.write(`ROOT=${root}\\n`)',
  'process.stdout.write(`LIVE=${liveFixtureRoots().length}\\n`)',
  'setInterval(() => {}, 1000)',
].join('\n')

function startReapProbe() {
  const child = spawn(NODE, ['--input-type=module', '-e', REAP_PROBE], {
    env: { ...NODE_ENV, REAP_PROBE_MODULE: fixtureModulePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
  const rooted = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`probe 没打印 ROOT：${stdout}`)), 15000)
    child.stdout.on('data', () => {
      const match = /ROOT=(.+)/.exec(stdout)
      if (match !== null) {
        clearTimeout(timer)
        resolve(match[1].trim())
      }
    })
  })
  return { child, rooted }
}

test('SIGTERM：进程被信号杀死时自有根仍被回收，且退出方式仍是信号死亡', async () => {
  const { child, rooted } = startReapProbe()
  const root = await rooted
  assert.equal(existsSync(root), true, '探针必须先真的建出根，否则下面的「已删除」是空射程')

  const exit = new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
  child.kill('SIGTERM')
  const outcome = await exit

  assert.equal(outcome.signal, 'SIGTERM', '回收不得把「死于信号」改写成「正常退出」——父进程要能分辨这两件事')
  assert.equal(existsSync(root), false, 'SIGTERM 之后自有根必须已被回收')
})

test('SIGINT：同一处理器覆盖第二个信号，不只在 SIGTERM 上有效', async () => {
  const { child, rooted } = startReapProbe()
  const root = await rooted
  assert.equal(existsSync(root), true)

  const exit = new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
  child.kill('SIGINT')
  const outcome = await exit

  assert.equal(outcome.signal, 'SIGINT')
  assert.equal(existsSync(root), false)
})

test('mutationRoot：返回自有根、登记进回收表，rmSync 后不留登记', () => {
  const root = mutationRoot('mutation-root-selftest-')
  assert.equal(existsSync(root), true)
  assert.equal(isAbsolute(root), true)
  assert.equal(isInside(resolve(process.cwd()), root), false)
  // 断言「新建的这一个在表里」，而不是「表里只有它」：同一进程里别的用例
  // 可能还持有 live 根，把总数写死会让这条用例在编排顺序变化时假红。
  assert.ok(liveFixtureRoots().includes(root), '新根必须被登记，否则退出时没人回收它')

  // 直接删掉自己（模拟调用方的 rmSync）后，下一次 reap 必须把它当作已回收，
  // 并且不留登记——否则清理过的根会被一遍遍重试。
  rmSync(root, { recursive: true, force: true })
  const reaped = reapAll()
  assert.equal(reaped.refused.length, 0, '已消失的自有根不该被拒绝')
  assert.equal(liveFixtureRoots().includes(root), false, '已回收的根必须从回收表里消失')
})
