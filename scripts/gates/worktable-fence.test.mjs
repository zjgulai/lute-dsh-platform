/**
 * `worktable-fence` 门禁项的**自检**：逐条证明它的判据能红。
 *
 * 判据自己也需要被证伪。本文件在临时目录里搭一棵**最小仓库树**（vendor 产物 + 栅栏源 +
 * pin + profile 安装面），再逐条注入五种「栅栏失效」的形态，要求门禁**分别**报出正确的
 * 那一条。不碰真实仓库——那里跑的是同一份代码，但被改坏就影响运行。
 *
 * 五种形态对应五种不同的失效方式（这不是五条重复的测试）：
 *   ① 注入块没打上（产物 = 上游原文）
 *   ② 锚点落空（块在，但 `apply()` 里那一行对不上 → 路由没被包住）
 *   ③ 源改了没重打（版本号不一致 → 跑的是过期栅栏）
 *   ④ 顶层标识符撞名（同模块作用域，`var`/`function` 会静默互相覆盖）
 *   ⑤ pin 与 vendor HEAD 不一致（栅栏锚在未知版本的上游文本上）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkWorktableFence } from './worktable-fence.mjs'

// 本文件在 scripts/gates/ 下，仓库根是上两级。
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REAL_VENDOR = join(repoRoot, 'vendor', 'dsh-worktable')
const REAL_ARTIFACT = join(REAL_VENDOR, '01_content', 'lib', 'index.js')
const REAL_FENCE_SRC = join(repoRoot, 'dsh-patches', 'worktable-fence', 'fence.js')
const REAL_PIN = join(repoRoot, 'vendor', 'dsh-worktable.pin')

const ANCHOR = 'const webServer = ctx.webServer;'
const ANCHOR_PATCHED = 'const webServer = __wtFence(ctx.webServer, ctx);'

const available = existsSync(REAL_ARTIFACT) && existsSync(REAL_FENCE_SRC) && existsSync(join(REAL_VENDOR, '.git'))

/** 上游原文（未打栅栏）——从 vendor 自己的 git HEAD 取，不依赖任何本地备份。 */
function pristineBundle() {
  return execFileSync('git', ['-C', REAL_VENDOR, 'show', 'HEAD:01_content/lib/index.js'], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  })
}

/**
 * 搭一棵最小仓库树。
 * @param {(parts: {artifact: string, fenceSrc: string, pin: string}) => {artifact?: string, fenceSrc?: string, pin?: string}} mutate
 */
function makeTree(mutate = () => ({})) {
  const root = mkdtempSync(join(tmpdir(), 'lute-fence-gate-'))
  const packageDir = join(root, 'vendor', 'dsh-worktable', '01_content', 'lib')
  mkdirSync(packageDir, { recursive: true })
  mkdirSync(join(root, 'dsh-patches', 'worktable-fence'), { recursive: true })
  const parts = {
    artifact: readFileSync(REAL_ARTIFACT, 'utf8'),
    fenceSrc: readFileSync(REAL_FENCE_SRC, 'utf8'),
    pin: readFileSync(REAL_PIN, 'utf8'),
  }
  const next = { ...parts, ...mutate(parts) }
  writeFileSync(join(packageDir, 'index.js'), next.artifact)
  writeFileSync(join(root, 'dsh-patches', 'worktable-fence', 'fence.js'), next.fenceSrc)
  writeFileSync(join(root, 'vendor', 'dsh-worktable.pin'), next.pin)
  return {
    root,
    // profile 指向一个不存在的目录 → 门禁只校验 vendor 侧，并报 note（跳过安装面）。
    profileDir: join(root, 'no-such-profile'),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

const run = (mutate) => {
  const tree = makeTree(mutate)
  try {
    return checkWorktableFence({ repoRoot: tree.root, profileDir: tree.profileDir })
  } finally {
    tree.cleanup()
  }
}

const mentions = (violations, fragment) =>
  violations.some((line) => line.includes(fragment))

test('worktable-fence 门禁：基线（打好栅栏的产物）必须通过', { skip: !available && 'vendor 未 clone' }, () => {
  // 用真实仓库跑：这是「门禁在自己该绿的时候绿吗」的正控。
  const result = checkWorktableFence({ repoRoot, profileDir: join(repoRoot, 'no-such-profile') })
  assert.equal(result.passed, true, `基线不该失败：${JSON.stringify(result.violations)}`)
})

test('worktable-fence 门禁：注入块没打上（产物 = 上游原文）必须被拒绝', { skip: !available && 'vendor 未 clone' }, () => {
  const result = run(() => ({ artifact: pristineBundle() }))
  assert.equal(result.passed, false)
  assert.ok(mentions(result.violations, '注入块没打上'), `未点名「注入块没打上」：${JSON.stringify(result.violations)}`)
})

test('worktable-fence 门禁：锚点落空（块在、apply() 那一行对不上）必须与「没打上」区分开', { skip: !available && 'vendor 未 clone' }, () => {
  const result = run(({ artifact }) => ({ artifact: artifact.replace(ANCHOR_PATCHED, ANCHOR) }))
  assert.equal(result.passed, false)
  assert.ok(mentions(result.violations, '锚点落空'), `未点名「锚点落空」：${JSON.stringify(result.violations)}`)
  assert.ok(!mentions(result.violations, '注入块没打上'), '这个形态被误判成了「注入块没打上」——两种失效方式必须分开')
})

test('worktable-fence 门禁：源改了没重打（版本号不一致）必须被拒绝', { skip: !available && 'vendor 未 clone' }, () => {
  const result = run(({ artifact }) => ({
    artifact: artifact.replace('const __WT_FENCE_VERSION = "1"', 'const __WT_FENCE_VERSION = "0"'),
  }))
  assert.equal(result.passed, false)
  assert.ok(mentions(result.violations, '没重跑 apply.mjs'), JSON.stringify(result.violations))
})

test('worktable-fence 门禁：顶层标识符撞名必须被拒绝', { skip: !available && 'vendor 未 clone' }, () => {
  // 往 bundle 本体加一个与栅栏同名的顶层绑定——真实的上游发版就是这么撞上的。
  const result = run(({ artifact }) => ({
    artifact: artifact.replace('\nfunction apply(ctx) {', '\nlet __wtFence = 1;\nfunction apply(ctx) {'),
  }))
  assert.equal(result.passed, false)
  assert.ok(mentions(result.violations, '__wtFence'), JSON.stringify(result.violations))
  assert.ok(mentions(result.violations, '撞名'), JSON.stringify(result.violations))
})

test('worktable-fence 门禁：pin 与 vendor HEAD 不一致必须被拒绝', { skip: !available && 'vendor 未 clone' }, () => {
  // 最小树里没有 .git，所以这一条用真实仓库造：临时把 pin 的 sha 改错再还原。
  const pinFile = join(repoRoot, 'vendor', 'dsh-worktable.pin')
  const original = readFileSync(pinFile, 'utf8')
  try {
    writeFileSync(pinFile, original.replace(/^upstream-sha:\s*\S+/m, `upstream-sha: ${'0'.repeat(40)}`))
    const result = checkWorktableFence({ repoRoot, profileDir: join(repoRoot, 'no-such-profile') })
    assert.equal(result.passed, false)
    assert.ok(mentions(result.violations, '≠ pin 的'), JSON.stringify(result.violations))
  } finally {
    writeFileSync(pinFile, original)
  }
})

test('worktable-fence 门禁：vendor 未 clone 时报跳过而不是失败', () => {
  const root = mkdtempSync(join(tmpdir(), 'lute-fence-gate-empty-'))
  try {
    const result = checkWorktableFence({ repoRoot: root, profileDir: join(root, 'nope') })
    assert.equal(result.passed, true)
    assert.match(result.note ?? '', /未 clone/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('worktable-fence 门禁：安装面被换成干净副本必须被拒绝', { skip: !available && 'vendor 未 clone' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'lute-fence-gate-install-'))
  try {
    // 复制一份**打好栅栏**的 vendor 产物，再把 profile 里那份换成上游原文。
    cpSync(join(REAL_VENDOR, '01_content', 'lib'), join(root, 'vendor', 'dsh-worktable', '01_content', 'lib'), { recursive: true })
    mkdirSync(join(root, 'dsh-patches', 'worktable-fence'), { recursive: true })
    writeFileSync(join(root, 'dsh-patches', 'worktable-fence', 'fence.js'), readFileSync(REAL_FENCE_SRC, 'utf8'))
    writeFileSync(join(root, 'vendor', 'dsh-worktable.pin'), readFileSync(REAL_PIN, 'utf8').replace(/^checked-at:.*$/m, 'checked-at: 2026-09-12'))
    const profileDir = join(root, 'profile')
    mkdirSync(join(profileDir, 'node_modules', 'dsh-worktable', 'lib'), { recursive: true })
    writeFileSync(join(profileDir, 'node_modules', 'dsh-worktable', 'lib', 'index.js'), pristineBundle())
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-worktable': 'file:./vendor/dsh-worktable/01_content' },
      dsh: { profile: { bundles: ['dsh-worktable'] } },
    }, null, 2))

    const result = checkWorktableFence({ repoRoot: root, profileDir })
    assert.equal(result.passed, false)
    assert.ok(mentions(result.violations, '不是同一份字节'), JSON.stringify(result.violations))
    assert.ok(mentions(result.violations, '运行时那份是干净的'), JSON.stringify(result.violations))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('worktable-fence 门禁：字节相同但不在 vendor 树内的拷贝安装必须被拒绝', { skip: !available && 'vendor 未 clone' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'lute-fence-gate-identity-'))
  try {
    // 打好栅栏的 vendor 产物。
    cpSync(join(REAL_VENDOR, '01_content', 'lib'), join(root, 'vendor', 'dsh-worktable', '01_content', 'lib'), { recursive: true })
    mkdirSync(join(root, 'dsh-patches', 'worktable-fence'), { recursive: true })
    writeFileSync(join(root, 'dsh-patches', 'worktable-fence', 'fence.js'), readFileSync(REAL_FENCE_SRC, 'utf8'))
    writeFileSync(join(root, 'vendor', 'dsh-worktable.pin'), readFileSync(REAL_PIN, 'utf8').replace(/^checked-at:.*$/m, 'checked-at: 2026-09-12'))

    // 关键构造：profile 里那份是**逐字节相同**的拷贝，只是住在 vendor 树**外面**。
    // 这正是 `file:`（硬链接实体副本）安装形态的样子——此刻内容一致，但它是一份
    // 可独立漂移的文件：明天往 vendor 补打栅栏不会进去。只比字节的判据会放它过。
    const profileDir = join(root, 'profile')
    const installedDir = join(profileDir, 'node_modules', 'dsh-worktable', 'lib')
    mkdirSync(installedDir, { recursive: true })
    writeFileSync(
      join(installedDir, 'index.js'),
      readFileSync(join(root, 'vendor', 'dsh-worktable', '01_content', 'lib', 'index.js'), 'utf8'),
    )
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-worktable': 'file:./vendor/dsh-worktable/01_content' },
      dsh: { profile: { bundles: ['dsh-worktable'] } },
    }, null, 2))

    const result = checkWorktableFence({ repoRoot: root, profileDir })
    assert.equal(result.passed, false, '同字节的树外拷贝必须被拒')
    assert.ok(
      mentions(result.violations, '不在 vendor 树'),
      JSON.stringify(result.violations),
    )
    // 且**不能**误报成字节不一致——两种失效的修法不同。
    assert.ok(
      !mentions(result.violations, '不是同一份字节'),
      `不该同时报字节不一致：${JSON.stringify(result.violations)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
