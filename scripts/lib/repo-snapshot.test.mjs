/**
 * `repo-snapshot.mjs` 的反向自测（QG-006B）。
 *
 * 这些用例全部在**真 Git 仓库**上跑，而不是喂假数据结构：快照的价值就在
 * 「git 实际看见的射程」这一句上，用假 status 输出喂它等于拿自己的假设量自己
 * （`gate.test.mjs` 头部记着同一类教训）。仓库由 `withMutationFixture` 提供，
 * 用的是它已有的 `repo` 作用域，用完即回收。
 *
 * 每条用例对着一个具体的「不」：
 *
 * - 折叠成目录的 untracked 射程 → 必须报错，不能静默少看；
 * - 递归写入的构建产物（`node_modules/`）→ 必须进声明根，不能被忽略掉；
 * - 空射程 → 必须报错，不能与「干净」同形；
 * - 忽略文件在仓库根出现 → 差异必须**点名到路径**，不能只动 digest；
 * - 声明根无法收缩 → 传更短的 `declaredRoots` 不得让射程变小。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { withMutationFixture } from './mutation-fixture.mjs'
import {
  DEFAULT_DECLARED_ROOTS,
  RepoSnapshotError,
  SNAPSHOT_SCHEMA,
  identical,
  resolveDeclaredRoots,
  snapshotContract,
  snapshotRepo,
} from './repo-snapshot.mjs'

/** 造一个最小真仓库：`repo/` 下 `git init` + 一次提交。 */
function gitInit(repoDir) {
  const git = (...args) => execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' })
  git('init', '--quiet', '--initial-branch=main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'fixture')
  writeFileSync(join(repoDir, '.gitignore'), '*\n!*/\n!.gitignore\n!src/**\n')
  mkdirSync(join(repoDir, 'src'), { recursive: true })
  writeFileSync(join(repoDir, 'src', 'a.txt'), 'alpha\n')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'init')
  return git
}

function withRepo(callback) {
  return withMutationFixture({
    prefix: 'repo-snapshot-selftest',
    prepare(fixture) { gitInit(fixture.repo) },
  }, (fixture) => callback(fixture.repo))
}

function codeIs(code) {
  return (error) => error instanceof RepoSnapshotError && error.code === code
}

test('快照可 JSON 往返：序列化后再比对仍必须判同（CI 要能把快照存下来）', async () => {
  await withRepo((repo) => {
    const before = snapshotRepo(repo)
    const roundTripped = JSON.parse(JSON.stringify(before))
    assert.equal(roundTripped.schema, SNAPSHOT_SCHEMA)
    assert.equal(roundTripped.digest, before.digest, 'JSON 往返不得改变 digest')
    const verdict = identical(before, roundTripped)
    assert.equal(verdict.identical, true, '往返后的快照必须与原快照判同')
  })
})

test('tracked 与 untracked 全部进射程，且 digest 覆盖内容而不是只看文件名', async () => {
  await withRepo((repo) => {
    const before = snapshotRepo(repo)
    assert.equal(before.plan.tracked >= 2, true, `期望至少 2 个 tracked（.gitignore 与 src/a.txt），实际 ${before.plan.tracked}`)
    assert.equal(before.plan.untracked, 0)

    writeFileSync(join(repo, 'src', 'a.txt'), 'beta\n')
    const after = snapshotRepo(repo)
    const verdict = identical(before, after)
    assert.equal(verdict.identical, false)
    assert.deepEqual(
      verdict.diffs.map((diff) => `${diff.kind}:${diff.path}`),
      ['entry-changed:src/a.txt'],
      '改内容必须点名到那一个文件',
    )
  })
})

test('新增 untracked 文件：必须进射程（`--untracked-files=all` 不折叠目录）', async () => {
  await withRepo((repo) => {
    const before = snapshotRepo(repo)
    mkdirSync(join(repo, 'src', 'deep', 'deeper'), { recursive: true })
    writeFileSync(join(repo, 'src', 'deep', 'deeper', 'new.txt'), 'new\n')
    const after = snapshotRepo(repo)

    assert.equal(after.plan.untracked, 1, '新文件必须被逐文件枚举，不能折叠成目录')
    const verdict = identical(before, after)
    assert.deepEqual(
      verdict.diffs.map((diff) => `${diff.kind}:${diff.path}`),
      ['entry-added:src/deep/deeper/new.txt'],
    )
    // 反向：新的影子文件也不能被当成没变化
    assert.equal(verdict.identical, false)
  })
})

test('被 .gitignore 覆盖的新文件：差异必须点名到路径，不许只动 digest', async () => {
  await withRepo((repo) => {
    const before = snapshotRepo(repo)
    // 白名单式 .gitignore 下仓库根的任何新文件都是 ignored（`*` 起手，`!*/` 只放行目录）。
    writeFileSync(join(repo, 'leaked-at-root.txt'), 'x\n')
    const after = snapshotRepo(repo)

    assert.notEqual(before.digest, after.digest, 'ignored 区域的变化必须进 digest，否则它是一片盲区')
    const verdict = identical(before, after)
    assert.equal(verdict.identical, false)
    assert.equal(verdict.unexplained, false, 'digest 动了却指不出路径 = 判据有洞，必须显式说出来')
    assert.deepEqual(verdict.diffs.map((diff) => `${diff.kind}:${diff.path}`), ['ignored-area-added:leaked-at-root.txt'])
    // 同一条反向用例的另一半：删掉它也必须能被看见
    rmSync(join(repo, 'leaked-at-root.txt'))
    const restored = identical(before, snapshotRepo(repo))
    assert.equal(restored.identical, true, '删除后必须回到与原快照相同——否则「无副作用」无法被判绿')
  })
})

test('声明根被递归写入时会被抓住（构建产物不得成为盲区）', async () => {
  await withRepo((repo) => {
    const before = snapshotRepo(repo)
    mkdirSync(join(repo, 'node_modules', 'pkg-a'), { recursive: true })
    writeFileSync(join(repo, 'node_modules', 'pkg-a', 'index.js'), 'x\n')
    const after = snapshotRepo(repo)
    const verdict = identical(before, after)

    assert.equal(verdict.identical, false, 'node_modules 是声明根，深度 1 名录变化必须计入')
    // 两条通道都要出现：声明根名录（root-*）与 ignored 区域（ignored-area-*）。
    // 只断言其中一条会让另一条整段失效而用例仍然绿——「射程里少了一半」
    // 与「没问题」在读数上同形，正是本卡要防的形状。
    const kinds = verdict.diffs.map((diff) => diff.kind)
    assert.equal(kinds.includes('root-changed'), true, `声明根变化必须被点名，实际：${JSON.stringify(verdict.diffs)}`)
    assert.equal(kinds.includes('ignored-area-added'), true, `ignored 区域也必须被点名，实际：${JSON.stringify(verdict.diffs)}`)
    assert.equal(
      verdict.diffs.some((diff) => diff.path.startsWith('node_modules')),
      true,
      '差异必须落在 node_modules 上',
    )
  })
})

test('空射程判红：没有 tracked 也没有 untracked 时不得给出「干净」', async () => {
  await withMutationFixture({
    prefix: 'repo-snapshot-empty',
    // 不 init：连仓库都不是
  }, async (fixture) => {
    assert.throws(() => snapshotRepo(fixture.repo, { declaredRoots: [] }), codeIs('SNAPSHOT_GIT_FAILED'))
  })

  await withMutationFixture({ prefix: 'repo-snapshot-empty-commit' }, async (fixture) => {
    const git = (...args) => execFileSync('git', ['-C', fixture.repo, ...args], { encoding: 'utf8' })
    git('init', '--quiet', '--initial-branch=main')
    git('config', 'user.email', 'fixture@example.invalid')
    git('config', 'user.name', 'fixture')
    // 一个空仓库：没有 tracked、没有 untracked —— 这正是要判红的那种「空」。
    // 先确认「没有 HEAD」不再是一个障碍（下面那条负例守的是另一件事）。
    assert.throws(
      () => snapshotRepo(fixture.repo),
      codeIs('SNAPSHOT_EMPTY_SCOPE'),
      '空射程必须报错：它与「干净」在 digest 上同形',
    )
    // 反向：把射程真的撑起来之后，同一个仓库必须能出快照——
    // 否则「没有 HEAD 就一律抛错」也会让上面那条用例假绿（它期待的异常会来自别处）。
    writeFileSync(join(fixture.repo, 'untracked.txt'), 'x\n')
    const snapshot = snapshotRepo(fixture.repo)
    assert.equal(snapshot.head, '(no-head)', '没有 HEAD 的仓库必须能出快照，并如实记下占位值')
    assert.equal(snapshot.plan.untracked, 1)
  })
})

test('声明根不可收缩：传更短的列表只做并集，不缩小被见证的范围', async () => {
  await withRepo((repo) => {
    const all = resolveDeclaredRoots(repo, null)
    const narrowed = resolveDeclaredRoots(repo, ['src', 'node_modules'])
    for (const rel of all) {
      assert.equal(narrowed.includes(rel), true, `${rel} 不得因为调用方传了更短的列表而消失`)
    }
    assert.equal(DEFAULT_DECLARED_ROOTS.includes('node_modules/'), true)

    // 负例：绝对路径、越界路径必须被拒绝
    assert.throws(() => resolveDeclaredRoots(repo, ['/etc']), codeIs('SNAPSHOT_ROOT_ESCAPE'))
    assert.throws(() => resolveDeclaredRoots(repo, ['../etc']), codeIs('SNAPSHOT_ROOT_ESCAPE'))
  })
})

test('外部工具的 ref 必须被点名回报，但不得被判成本次运行的副作用', async () => {
  await withRepo((repo) => {
    const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    const head = git('rev-parse', 'HEAD').trim()
    const before = snapshotRepo(repo)

    // 模拟另一个工具（Codex 的 turn-diff 记录）在见证窗口内写自己的 ref 命名空间。
    git('update-ref', 'refs/codex/turn-diffs/selftest/base', head)
    const after = snapshotRepo(repo)
    const verdict = identical(before, after)

    assert.equal(verdict.identical, true, '外部工具的 ref 不是本次运行的副作用，不得判红')
    assert.deepEqual(verdict.diffs, [], '也不得混进 diffs——那会把归因搞错')
    assert.equal(verdict.unexplained, false, 'digest 不含外部 ref，因此不存在「说不清的变化」')
    assert.deepEqual(
      verdict.concurrentActivity.map((entry) => `${entry.kind}:${entry.ref}`),
      ['added:refs/codex/turn-diffs/selftest/base'],
      '必须点名是哪个 ref 动了，否则「有人在写」与「没问题」分不开',
    )

    // 反向：非外部命名空间的 ref 动了，必须照旧判红。
    git('update-ref', 'refs/heads/selftest-branch', head)
    const ours = identical(snapshotRepo(repo), (() => {
      git('update-ref', '-d', 'refs/heads/selftest-branch')
      return snapshotRepo(repo)
    })())
    assert.equal(ours.identical, false, '本仓库自己的 ref 变化必须仍然判红')
    assert.equal(ours.diffs.some((diff) => diff.kind === 'refs-changed'), true)
  })
})

test('schema 不同不得被当成「有差异」：必须显式拒绝比较', async () => {
  await withRepo((repo) => {
    const snapshot = snapshotRepo(repo)
    assert.throws(
      () => identical(snapshot, { ...snapshot, schema: 'repo-snapshot/v0' }),
      codeIs('SNAPSHOT_SCHEMA_MISMATCH'),
    )
  })
})

test('契约面自证：diff 类型表覆盖到实现真正会产出的每一种', async () => {
  const contract = snapshotContract()
  assert.equal(contract.schema, SNAPSHOT_SCHEMA)
  for (const kind of ['entry-added', 'entry-removed', 'entry-changed', 'root-added', 'root-removed', 'root-changed', 'ignored-area-added', 'ignored-area-removed', 'ignored-area-changed', 'head-changed', 'refs-changed', 'index-changed']) {
    assert.equal(contract.diffKinds.includes(kind), true, `契约表缺 ${kind}`)
  }
  assert.equal(contract.entryStates.includes('tracked'), true)
  assert.equal(contract.entryStates.includes('untracked'), true)
  // `.git/*.lock` 刻意**不在**差异类型表里：并发读锁与被打断的写入者残留同形，
  // 它作为 ignored 区域进 digest、只能走 `unexplained` 通道 + 二次确认（ADR-0103）。
  assert.equal(contract.diffKinds.includes('lock-added'), false)
  assert.equal(contract.diffKinds.includes('lock-removed'), false)
})

test('悬空符号链接：必须被记成链接事实，而不是让整批 hashing 失败', async () => {
  // 2026-09-17 实测的真实形状：checkout 里出现一个指向不存在目标的软链
  // （`…/Electron Framework.framework/Helpers -> Versions/Current/Helpers`），
  // `git hash-object` 对它直接 `fatal: could not open … for reading`，
  // 而 `lstatSync` 对悬空软链**是成功的**，于是一路走到 hashing 才炸。
  // 本用例把它钉住：分拣成「链接按链接读、普通文件交给 git」。
  await withRepo((repo) => {
    // 这个夹具的 `.gitignore` 是白名单式的（`*` + `!src/**`），所以载荷必须放在 `src/` 下——
    // 放根目录会被 ignore，于是软链根本不进射程，用例会以"看不见"的方式通过失败。
    const dir = join(repo, 'src')
    writeFileSync(join(dir, 'real.txt'), 'content\n')
    symlinkSync('does-not-exist-target', join(dir, 'dangling.txt'))
    symlinkSync('real.txt', join(dir, 'good-link.txt'))

    const snapshot = snapshotRepo(repo)
    const byPath = new Map(snapshot.entries.map((entry) => [entry.path, entry]))
    const dangling = byPath.get('src/dangling.txt')
    assert.ok(dangling, `悬空软链必须出现在 entries 里（它是仓库里的一个真实对象），实际：${[...byPath.keys()].join('、')}`)
    assert.equal(dangling.mode, '120000', '软链的 mode 必须是 120000')
    assert.notEqual(dangling.digest, undefined)

    const good = byPath.get('src/good-link.txt')
    assert.equal(good?.mode, '120000')
    assert.notEqual(dangling.digest, good.digest, '两个链接指向不同目标，digest 必须不同')
    assert.notEqual(dangling.digest, byPath.get('src/real.txt')?.digest, '软链与它指向的文件不是同一个对象')

    // 幂等：同一个仓库连拍两次必须逐字相同（悬空软链不得引入不稳定）。
    assert.equal(identical(snapshot, snapshotRepo(repo)).identical, true)

    // 目标改了 → 必须判红（判据强度不得因为"软链特殊"而降低）。
    rmSync(join(dir, 'dangling.txt'))
    symlinkSync('a-different-target', join(dir, 'dangling.txt'))
    const verdict = identical(snapshot, snapshotRepo(repo))
    assert.equal(verdict.identical, false, '软链目标变化必须被看见')
    assert.ok(
      verdict.diffs.some((diff) => diff.path === 'src/dangling.txt'),
      `差异必须点名到路径，实际：${JSON.stringify(verdict.diffs)}`,
    )
  })
})
