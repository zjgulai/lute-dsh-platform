/**
 * `worktable-fence` 门禁项的**自检**：逐条证明翻转后的判据能红。
 *
 * 判据自己也需要被证伪。本文件在临时目录里搭最小仓库树 + 最小 profile，逐条注入
 * 「它又被装回来了」与「资产被删了」的形态，要求门禁**分别**报出正确的那一条。
 * 不碰真实仓库——那里跑的是同一份代码，但被改坏就影响运行。
 *
 * 六种形态对应六种不同的失效方式（这不是六条重复的测试）：
 *   ① 基线：真仓库 + 真 profile → 必须绿
 *   ② dependencies 里又有它（会被装回来）
 *   ③ bundles 里又有它（装了就会挂载，UI 回来）
 *   ④ node_modules 里有残留（bundles 已摘但产物还在）
 *   ⑤ 资产缺失（pin / 补丁被删——卸载变成不可逆）
 *   ⑥ pin 与 vendor HEAD 不一致（保留的资产自己漂了）
 *
 * 还有一条**负向对照**：vendor 未 clone 时安装面三项**仍须照判**。否则「资产在不在」
 * 就成了这条门禁跑不跑的开关，而一个漏装的插件正好能让门禁静默消失。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkWorktableFence } from './worktable-fence.mjs'

// 本文件在 scripts/gates/ 下，仓库根是上两级。
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REAL_VENDOR = join(repoRoot, 'vendor', 'dsh-worktable')
const REAL_FENCE_SRC = join(repoRoot, 'dsh-patches', 'worktable-fence', 'fence.js')
const REAL_APPLY = join(repoRoot, 'dsh-patches', 'worktable-fence', 'apply.mjs')
const REAL_PIN = join(repoRoot, 'vendor', 'dsh-worktable.pin')

const assetsAvailable = existsSync(REAL_FENCE_SRC) && existsSync(REAL_APPLY) && existsSync(REAL_PIN)

/** 一份**干净**的 profile：三处都没有 dsh-worktable。 */
function cleanProfile(root) {
  const profileDir = join(root, 'profile')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    dependencies: { 'dsh-newapp-local': 'file:./packages/surfaces/dsh-newapp-local' },
    dsh: { profile: { bundles: ['dsh-newapp-local'] } },
  }, null, 2))
  return profileDir
}

/**
 * 搭一棵最小仓库树，并允许逐处注入违规。
 * @param {(ctx: {profileDir: string}) => void} [mutate] 在干净基线之上注入违规。
 * @returns {{root: string, profileDir: string, cleanup: () => void}}
 */
function makeTree(mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'lute-absent-gate-'))
  mkdirSync(join(root, 'vendor'), { recursive: true })
  mkdirSync(join(root, 'dsh-patches', 'worktable-fence'), { recursive: true })
  writeFileSync(join(root, 'vendor', 'dsh-worktable.pin'), readFileSync(REAL_PIN, 'utf8'))
  writeFileSync(join(root, 'dsh-patches', 'worktable-fence', 'fence.js'), readFileSync(REAL_FENCE_SRC, 'utf8'))
  writeFileSync(join(root, 'dsh-patches', 'worktable-fence', 'apply.mjs'), readFileSync(REAL_APPLY, 'utf8'))
  const profileDir = cleanProfile(root)
  mutate({ root, profileDir })
  return { root, profileDir, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

const run = (mutate) => {
  const tree = makeTree(mutate)
  try {
    return checkWorktableFence({ repoRoot: tree.root, profileDir: tree.profileDir })
  } finally {
    tree.cleanup()
  }
}

const mentions = (violations, fragment) => violations.some((line) => line.includes(fragment))

test('卸载门禁：真仓库 + 真 profile 必须通过（基线正控）', { skip: !assetsAvailable && '资产缺失' }, () => {
  // 用真实仓库跑：这是「门禁在自己该绿的时候绿吗」的正控。它同时是对
  // 「本机确实没装 dsh-worktable」的一次真实读数——M7。
  const realProfile = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
  const result = checkWorktableFence({ repoRoot, profileDir: realProfile })
  assert.equal(result.passed, true, `基线不该失败：${JSON.stringify(result.violations)}`)
})

test('卸载门禁：干净的最小树必须通过', { skip: !assetsAvailable && '资产缺失' }, () => {
  assert.equal(run().passed, true)
})

test('卸载门禁：dependencies 里又有它必须被拒绝', { skip: !assetsAvailable && '资产缺失' }, () => {
  const result = run(({ profileDir }) => {
    const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
    pkg.dependencies['dsh-worktable'] = 'link:./vendor/dsh-worktable/01_content'
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify(pkg, null, 2))
  })
  assert.equal(result.passed, false)
  assert.ok(mentions(result.violations, 'dependencies 里又有'), JSON.stringify(result.violations))
})

test('卸载门禁：bundles 里又有它必须被拒绝', { skip: !assetsAvailable && '资产缺失' }, () => {
  const result = run(({ profileDir }) => {
    const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
    pkg.dsh.profile.bundles.push('dsh-worktable')
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify(pkg, null, 2))
  })
  assert.equal(result.passed, false)
  assert.ok(mentions(result.violations, 'bundles 里又有'), JSON.stringify(result.violations))
  // 且不能误报成 dependencies 违规——两种失效的修法不同。
  assert.ok(!mentions(result.violations, 'dependencies 里又有'), '不该同时报 dependencies 违规')
})

test('卸载门禁：node_modules 里的残留必须被拒绝（实测过的那个状态）', { skip: !assetsAvailable && '资产缺失' }, () => {
  // 这是真机上**真的发生过**的中间态：摘掉 dependencies 与 bundles 之后，
  // `pnpm install` 并没有把 symbol link 删掉，产物还在那里解析得到。
  const result = run(({ profileDir }) => {
    const dir = join(profileDir, 'node_modules', 'dsh-worktable', 'lib')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.js'), 'export function apply() {}\n')
  })
  assert.equal(result.passed, false)
  assert.ok(mentions(result.violations, 'node_modules 里仍有'), JSON.stringify(result.violations))
})

test('卸载门禁：资产缺失（补丁被删）必须被拒绝', { skip: !assetsAvailable && '资产缺失' }, () => {
  const result = run(({ root }) => {
    rmSync(join(root, 'dsh-patches', 'worktable-fence', 'apply.mjs'))
  })
  assert.equal(result.passed, false)
  assert.ok(mentions(result.violations, '资产缺失'), JSON.stringify(result.violations))
})

test('卸载门禁：资产缺失（pin 被删）必须被拒绝', { skip: !assetsAvailable && '资产缺失' }, () => {
  const result = run(({ root }) => {
    rmSync(join(root, 'vendor', 'dsh-worktable.pin'))
  })
  assert.equal(result.passed, false)
  assert.ok(mentions(result.violations, '资产缺失'), JSON.stringify(result.violations))
})

test('卸载门禁：pin 与 vendor HEAD 不一致必须被拒绝', { skip: !assetsAvailable && '资产缺失' }, () => {
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

test('卸载门禁：vendor 未 clone 时跳过资产项，但安装面三项仍须照判', () => {
  // 负向对照。若「vendor 不在」能让整条门禁短路成绿，那么一个漏装的插件
  // （顺手也把 vendor 删了）就能让这条判据静默消失——判据的存在就成了可选的。
  const tree = makeTree(({ profileDir }) => {
    const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
    pkg.dependencies['dsh-worktable'] = 'link:./vendor/dsh-worktable/01_content'
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify(pkg, null, 2))
  })
  try {
    const result = checkWorktableFence({ repoRoot: tree.root, profileDir: tree.profileDir })
    assert.equal(result.passed, false, 'vendor 不在时安装面违规仍必须被拒')
    assert.ok(mentions(result.violations, 'dependencies 里又有'), JSON.stringify(result.violations))
  } finally {
    tree.cleanup()
  }
})

test('卸载门禁：vendor 不在且安装面干净时报跳过而不是失败', () => {
  const root = mkdtempSync(join(tmpdir(), 'lute-absent-gate-empty-'))
  try {
    mkdirSync(join(root, 'dsh-patches', 'worktable-fence'), { recursive: true })
    mkdirSync(join(root, 'vendor'), { recursive: true })
    writeFileSync(join(root, 'dsh-patches', 'worktable-fence', 'fence.js'), readFileSync(REAL_FENCE_SRC, 'utf8'))
    writeFileSync(join(root, 'dsh-patches', 'worktable-fence', 'apply.mjs'), readFileSync(REAL_APPLY, 'utf8'))
    writeFileSync(join(root, 'vendor', 'dsh-worktable.pin'), readFileSync(REAL_PIN, 'utf8'))
    const result = checkWorktableFence({ repoRoot: root, profileDir: join(root, 'nope') })
    assert.equal(result.passed, true, JSON.stringify(result.violations))
    assert.match(result.note ?? '', /未安装/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('卸载门禁：vendor 树在且 pin 一致时给出「资产与 pin 在位」的读数', { skip: !existsSync(join(REAL_VENDOR, '.git')) && 'vendor 未 clone', }, () => {
  const result = checkWorktableFence({ repoRoot, profileDir: join(repoRoot, 'no-such-profile') })
  assert.equal(result.passed, true, JSON.stringify(result.violations))
  assert.match(result.note ?? '', /资产与 pin 在位/)
})
