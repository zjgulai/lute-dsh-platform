/**
 * `package-files-coverage` 的判据面单测、真实 npm 校准、前提钉与变异自测。
 *
 * 立的规矩（与本仓库其余判据同款）：**每个用例都要能在「判据退化成恒真桩」时变红**。
 * 因此本文件里最要紧的不是「绿的那条」，而是：
 *   · `R-*` 缺陷形状用例——拿 P-24 的真实复发形状喂进去，必须判红并点名文件；
 *   · `CALIB-*` 校准——判定器与**真实 `npm pack`** 的产出逐文件全等，而不是抽样一致；
 *   · `MUT-*` 变异——把模块源码改坏（恒真桩 / 不跟 import / 关掉 import.meta.url 那条），
 *     同一个缺陷形状必须**变绿**；那才证明拦住它的是这两段逻辑，而不是别的东西。
 *
 * 全部磁盘操作走 `createMutationFixture`（QG-006A）：临时根在系统临时目录内，
 * 不读不写真实仓库、真实 HOME 与真实 profile。
 */
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createMutationFixture, withMutationFixture } from '../lib/mutation-fixture.mjs'
import { validateGateResult } from './gate-result.mjs'
import { collectPackages } from './package-collect.mjs'
import {
  auditPackageDelivery,
  checkPackageFilesCoverage,
  collectModuleClosure,
  compileDeliveryAllowlist,
  createFileSource,
  declaredEntryPoints,
  globToRegExp,
  isDelivered,
  listPackageTree,
  matchesIgnorePatterns,
  parseIgnorePatterns,
  resolveEntry,
} from './package-files-coverage.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MODULE_PATH = join(repoRoot, 'scripts', 'gates', 'package-files-coverage.mjs')

/** 本文件自己创建的临时根，逐个在 afterEach 清理。 */
const fixtures = []
afterEach(() => {
  while (fixtures.length > 0) fixtures.pop().cleanup()
})

/** 从文件清单推出目录清单（判据面需要的「裸目录名 = 整棵子树」语义靠它）。 */
function dirsOf(files) {
  const dirs = new Set()
  for (const file of files) {
    const parts = file.split('/')
    for (let index = 1; index < parts.length; index += 1) dirs.add(parts.slice(0, index).join('/'))
  }
  return dirs
}

/**
 * 构造一棵**纯内存**的包树：不碰文件系统，因此可以逐字控制判据面。
 * `sources` 的键就是磁盘上的文件清单，值就是 `readSource` 会返回的文本。
 */
function makeTree({ relPath = 'packages/capabilities/fixture-pkg', manifest, sources }) {
  const files = Object.keys(sources)
  return {
    relPath,
    manifest,
    files: new Set(files),
    dirs: dirsOf(files),
    readSource: (rel) => (Object.hasOwn(sources, rel) ? sources[rel] : null),
  }
}

/**
 * P-24 的**复发形状**（2026-09-16，dsh-wanzh-hulian）的逐字复刻：
 * `files` 就是复发当时的那 6 条，`lib/index.js` 正在 import 的 `atomic-store.js`
 * 与 `oauth-flow.js` 不在里面。缺的不是「随便两个文件」，是**入口 import 闭包里的两个**。
 */
const RECURRENCE_FILES = ['lib/index.js', 'lib/boards.js', 'lib/business-meta.js', 'lib/client.js', 'lib/host-util.js', 'cordis.patch.yml']

function makeP24Tree({ files = RECURRENCE_FILES } = {}) {
  return makeTree({
    relPath: 'packages/capabilities/dsh-wanzh-hulian',
    manifest: {
      name: 'dsh-wanzh-hulian',
      main: 'lib/index.js',
      exports: { '.': './lib/index.js', './client': './lib/client.js', './package.json': './package.json' },
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
      files,
    },
    sources: {
      'package.json': '{}',
      'cordis.patch.yml': 'plugins: []\n',
      'lib/index.js': [
        "import { boards } from './boards.js'",
        "import { meta } from './business-meta.js'",
        "import { hostUtil } from './host-util.js'",
        "import { readStore } from './atomic-store.js'",
        "import { startFlow } from './oauth-flow.js'",
      ].join('\n'),
      'lib/boards.js': 'export const boards = []\n',
      'lib/business-meta.js': 'export const meta = {}\n',
      'lib/host-util.js': 'export const hostUtil = {}\n',
      'lib/atomic-store.js': 'export function readStore() {}\n',
      'lib/oauth-flow.js': 'export function startFlow() {}\n',
      'lib/client.js': 'export const client = 1\n',
    },
  })
}

/** P-24 的**最初形状**（2026-09-15，dsh-preset-lint-local 的 lint-preset.mjs）：
 *  运行时文件不是被 import，而是被 `new URL('./x', import.meta.url)` 定位的。 */
function makeMetaUrlTree({ files = ['lib/index.js', 'cordis.patch.yml'] } = {}) {
  return makeTree({
    relPath: 'packages/contract/dsh-preset-lint-local',
    manifest: {
      name: 'dsh-preset-lint-local',
      main: 'lib/index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      files,
    },
    sources: {
      'package.json': '{}',
      'cordis.patch.yml': 'plugins: []\n',
      'lib/index.js': 'const bundledLinter = new URL("./lint-preset.mjs", import.meta.url)\n',
      'lib/lint-preset.mjs': 'export const lint = 1\n',
    },
  })
}

/** 把模块源码复制进一个独占临时根，改写若干处后动态 import 回来。 */
async function loadMutant(mutations) {
  const fixture = createMutationFixture({ prefix: 'files-mutation' })
  fixtures.push(fixture)
  let mutated = readFileSync(MODULE_PATH, 'utf8')
  for (const { anchor, replacement, linePrefix } of mutations) {
    if (linePrefix !== undefined) {
      const lines = mutated.split('\n')
      const index = lines.findIndex((line) => line.startsWith(linePrefix))
      assert.notEqual(index, -1, `变异锚点（行首）未命中：${linePrefix}——模块被重构了，请同步本文件的变异锚点`)
      lines[index] = replacement
      mutated = lines.join('\n')
      continue
    }
    assert.ok(mutated.includes(anchor), `变异锚点未命中：${anchor}——模块被重构了，请同步本文件的变异锚点`)
    mutated = mutated.replace(anchor, replacement)
  }
  const target = join(fixture.root, 'mutant.mjs')
  writeFileSync(target, mutated)
  return import(pathToFileURL(target).href)
}

// ── 判定器：files 的射程 ──────────────────────────────────────────────────

test('files 射程：exact / 裸目录 / 单层 / 递归 / 递归带扩展名 五种形态', () => {
  const dirs = new Set(['lib', 'lib/types', 'assets', 'docs', 'examples'])
  const allowlist = compileDeliveryAllowlist(
    ['lib/index.js', 'assets', 'docs/*.md', 'examples/**/*.json', 'lib/types/**/*.d.ts'],
    dirs,
  )
  const delivered = (rel) => isDelivered(rel, allowlist)
  assert.equal(delivered('lib/index.js'), true, 'exact 必须命中')
  assert.equal(delivered('lib/other.js'), false, 'exact 不得外溢到同目录其他文件')
  assert.equal(delivered('assets/a.png'), true, '裸目录名必须收整棵子树')
  assert.equal(delivered('assets/nested/deep/b.png'), true, '裸目录名必须递归')
  assert.equal(delivered('docs/a.md'), true, '单层通配命中')
  assert.equal(delivered('docs/sub/a.md'), false, '单层通配不得跨层')
  assert.equal(delivered('examples/a/b.json'), true, '递归通配命中')
  assert.equal(delivered('examples/a/b.yaml'), false, '递归通配不得跨扩展名')
  assert.equal(delivered('lib/types/x.d.ts'), true, '递归带扩展名命中')
  assert.equal(delivered('lib/types/x.js'), false, '递归带扩展名不得误命中别的扩展名')
})

test('files 射程：npm 永远打包的四类文件即使不在清单里也不算漏项（避免假红）', () => {
  const allowlist = compileDeliveryAllowlist(['lib/index.js'], new Set(['lib']))
  assert.equal(isDelivered('package.json', allowlist), true)
  assert.equal(isDelivered('README.md', allowlist), true)
  assert.equal(isDelivered('LICENSE', allowlist), true, 'LICENSE 无扩展名也必须命中')
  assert.equal(isDelivered('lib/index.js', allowlist, 'lib/index.js'), true, 'main 永远被打包')
  assert.equal(isDelivered('lib/unused.js', allowlist, 'lib/index.js'), false, 'main 的豁免不得外溢')
})

test('裸目录条目按磁盘上的目录判定，而不是按名字里有没有点', () => {
  const dirs = new Set(['lib', 'LICENSE'])
  const allowlist = compileDeliveryAllowlist(['lib', 'NOTICE'], dirs)
  assert.equal(isDelivered('lib/deep/x.js', allowlist), true, 'lib 是目录 → 整棵子树')
  assert.equal(isDelivered('NOTICE', allowlist), true, 'NOTICE 不是目录 → 只收自己')
  assert.equal(isDelivered('NOTICE/sub', allowlist), false, 'NOTICE 不是目录 → 不得外溢')
})

// ── 判据面：运行时模块图 ─────────────────────────────────────────────────

test('模块闭包：静态 import / re-export / require / 字面量 import() / import.meta.url 全部跟进', () => {
  const files = new Set(['lib/index.js', 'lib/a.js', 'lib/b.js', 'lib/c.js', 'lib/d.js', 'lib/e.js'])
  const sources = {
    'lib/index.js': [
      "import './a.js'",
      "export { x } from './b.js'",
      "const c = require('./c.js')",
      "const d = await import('./d.js')",
      'const e = new URL("./e.js", import.meta.url)',
      "import pkg from 'some-external-pkg'",
    ].join('\n'),
    'lib/a.js': '', 'lib/b.js': '', 'lib/c.js': '', 'lib/d.js': '', 'lib/e.js': '',
  }
  const { reachable, unreadable } = collectModuleClosure({
    entries: ['lib/index.js'],
    files,
    readSource: (rel) => sources[rel] ?? null,
  })
  assert.deepEqual(unreadable, [], '所有源码都可读')
  assert.deepEqual(reachable, ['lib/a.js', 'lib/b.js', 'lib/c.js', 'lib/d.js', 'lib/e.js', 'lib/index.js'])
})

test('模块闭包：裸包名不得被当成包内文件', () => {
  const tree = makeTree({
    manifest: { name: 'p', main: 'lib/index.js', files: ['lib/index.js'] },
    sources: { 'lib/index.js': "import fs from 'node:fs'\nimport x from 'lodash'\n" },
  })
  assert.deepEqual(auditPackageDelivery(tree).surface, ['lib/index.js'])
})

test('声明入口取自 main / exports 的每个字符串叶子 / bin / dsh.bundle.patch，且滤掉类型产物', () => {
  const files = new Set([
    'lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'cordis.patch.yml', 'bin/cli.js', 'index.js',
  ])
  const manifest = {
    main: './lib/index.js',
    exports: { '.': { types: './lib/types/index.d.ts', default: './lib/index.js' }, './client': './lib/client.js' },
    bin: { cli: './bin/cli.js' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }
  assert.deepEqual(declaredEntryPoints(manifest, files), [
    'bin/cli.js', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js',
  ])
})

// ── R：缺陷形状必须判红 ──────────────────────────────────────────────────

test('R1 P-24 复发形状：入口 import 的模块不在 files 里必须判红并点名文件', () => {
  const audit = auditPackageDelivery(makeP24Tree())
  assert.deepEqual(audit.missing, ['lib/atomic-store.js', 'lib/oauth-flow.js'],
    `必须点名两个真实丢过的文件，实际=${JSON.stringify(audit.missing)}`)
  const result = checkPackageFilesCoverage([makeP24Tree()])
  assert.equal(result.status, 'fail')
  assert.equal(result.failed, 2)
  assert.equal(validateGateResult(result).valid, true, `canonical schema 必须合法：${JSON.stringify(validateGateResult(result).errors)}`)
  assert.ok(result.violations.every((line) => line.includes('ERR_MODULE_NOT_FOUND')), '判红信息必须说清后果')
  assert.ok(result.violations.every((line) => line.includes('不要')), '判红信息必须把人引向「加进 files」，而不是「去补装载点」')
})

test('R2 P-24 最初形状：new URL(…, import.meta.url) 定位的文件不在 files 里必须判红', () => {
  const audit = auditPackageDelivery(makeMetaUrlTree())
  assert.deepEqual(audit.missing, ['lib/lint-preset.mjs'])
})

test('R3 把缺件补进 files 之后必须转绿（同一条判据、同一个形状）', () => {
  // 真实工作树现在的那 8 条：复发时缺的两个已经补进去了。
  const fixed = makeP24Tree({
    files: [...RECURRENCE_FILES, 'lib/atomic-store.js', 'lib/oauth-flow.js'],
  })
  const result = checkPackageFilesCoverage([fixed])
  assert.equal(result.status, 'pass', `补进 files 后必须转绿，实际=${JSON.stringify(result.violations)}`)
  assert.equal(result.checked > 0, true, 'pass 必须带非空 checked')
})

test('R4 裸目录条目（files: ["lib"]）覆盖深层模块时不得判红', () => {
  const tree = makeP24Tree({ files: ['lib', 'cordis.patch.yml'] })
  assert.deepEqual(auditPackageDelivery(tree).missing, [])
})

test('R5 入口源码读不到必须判红：闭包不完整不得当作「这个文件没有 import」', () => {
  const tree = makeP24Tree()
  const blinded = { ...tree, readSource: (rel) => (rel === 'lib/index.js' ? null : tree.readSource(rel)) }
  const result = checkPackageFilesCoverage([blinded])
  assert.equal(result.status, 'fail')
  assert.ok(result.violations.some((line) => line.includes('闭包不完整')), JSON.stringify(result.violations))
})

// ── 非判定面：不能把噪声当信号 ────────────────────────────────────────────

test('N1 无 files 白名单且 ignore 文件命中不了任何运行时文件 → 不适用，进 note 不进 skipped', () => {
  const tree = makeTree({
    relPath: 'packages/platform/dsh-auto-compact-local',
    manifest: { name: 'dsh-auto-compact', main: 'lib/index.js' },
    sources: {
      'lib/index.js': 'export const x = 1\n',
      '.gitignore': 'node_modules/\n*.log\n.DS_Store\n',
      'run.log': '',
    },
  })
  const result = checkPackageFilesCoverage([tree])
  assert.equal(result.status, 'skip', '全部不适用时必须是显式 skip，不是 pass')
  assert.equal(result.typedSkips[0].type, 'no-checkable-package')
  assert.ok(result.note.includes('.gitignore'), 'note 必须写明 ignore 文件已核对')
})

test('N2 无 files 白名单但 ignore 规则可能命中运行时文件 → 类型化 skip（不是通过）', () => {
  const tree = makeTree({
    manifest: { name: 'p', main: 'lib/index.js' },
    sources: { 'lib/index.js': 'export const x = 1\n', '.gitignore': 'lib/\n' },
  })
  const audit = auditPackageDelivery(tree)
  assert.equal(audit.skip?.type, 'ignore-rules-may-drop-runtime-file')
  assert.equal(checkPackageFilesCoverage([tree]).status, 'skip')
})

test('N3 ignore 里出现本项未建模的形态（取反 / 锚定路径 / 通配）必须 fail-closed 成 skip', () => {
  for (const line of ['!keep.js', 'build/output.js', 'global/**/x.js']) {
    const tree = makeTree({
      manifest: { name: 'p', main: 'lib/index.js' },
      sources: { 'lib/index.js': 'export const x = 1\n', '.gitignore': `${line}\n` },
    })
    const audit = auditPackageDelivery(tree)
    assert.equal(audit.skip?.type, 'ignore-pattern-not-modeled', `「${line}」必须走未建模分支`)
    assert.ok(audit.skip.reason.includes(line), 'skip 原因必须点名那一行')
  }
  // 前导斜杠**刻意**降级成「任意层级同名」：本函数只用来高估 ignore 射程（多算 = 更保守 =
  // 更容易 skip），丢掉锚定语义是安全方向，反过来才是危险的。
  const anchored = parseIgnorePatterns('/dist\n')
  assert.deepEqual(anchored.patterns.length, 1)
  assert.equal(matchesIgnorePatterns('lib/dist/x.js', anchored.patterns), true, '必须高估而不是低估')
  assert.deepEqual(parseIgnorePatterns('node_modules/\n# 注释\n*.log\n').patterns.length, 2)
})

test('N4 声明了 files 却解析不出任何运行时文件 → 类型化 skip，不得读成通过', () => {
  const tree = makeTree({
    manifest: { name: 'p', main: 'lib/index.js', files: ['lib/index.js'] },
    sources: { 'lib/other.js': 'export const x = 1\n' },
  })
  const audit = auditPackageDelivery(tree)
  assert.equal(audit.skip?.type, 'empty-runtime-surface')
  assert.equal(checkPackageFilesCoverage([tree]).status, 'skip')
})

test('N5 一个受管包都没发现 → fail（空射程不是通过）', () => {
  const result = checkPackageFilesCoverage([])
  assert.equal(result.status, 'fail')
  assert.equal(validateGateResult(result).valid, true)
})

test('N6 可达闭包之外的 lib 顶层 bundle 只进读数，不判红也不判 skip', () => {
  const tree = makeTree({
    relPath: 'packages/capabilities/dsh-paper2skills',
    manifest: { name: 'dsh-paper2skills', exports: { '.': './lib/taxonomy.js' }, files: ['lib/taxonomy.js'] },
    sources: { 'lib/taxonomy.js': 'export const t = 1\n', 'lib/dev-tool.js': 'export const d = 1\n' },
  })
  const audit = auditPackageDelivery(tree)
  assert.deepEqual(audit.missing, [], '开发期模块不得被当成漏件（那是假红）')
  assert.deepEqual(audit.unjudgedLibBundles, ['lib/dev-tool.js'])
  assert.ok(checkPackageFilesCoverage([tree]).note.includes('lib/dev-tool.js'), 'note 必须把它作为读数列出')
})

test('N7 判据面不允许自行读盘：没注入 readSource 就必须抛，而不是悄悄读到真实文件', () => {
  const tree = makeP24Tree()
  const naked = { ...tree, readSource: undefined }
  assert.throws(() => auditPackageDelivery(naked), /必须注入 readSource/)
})

// ── 校准：判定器 vs 真实 npm ─────────────────────────────────────────────

test('CALIB npm：判定器与真实 npm pack 的产出逐文件全等（全部受管包，不是抽样）', async (t) => {
  let npmVersion
  try {
    npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()
  } catch {
    return t.skip('npm 不可用——本项没有校准任何东西（不是通过）')
  }
  const { packages } = collectPackages(repoRoot)
  const withFiles = packages.filter((entry) => Array.isArray(entry.manifest.files))
  // 受管包各自独立，可以并发；23 个包串行跑 npm 是 10 秒级，并发后 ~2 秒。
  const packedPerPackage = await mapWithConcurrency(withFiles, 8, (entry) => packPaths(entry.dir))
  const mismatches = []
  for (const [index, entry] of withFiles.entries()) {
    const { files, dirs } = listPackageTree(entry.dir)
    const packed = new Set(packedPerPackage[index])
    const allowlist = compileDeliveryAllowlist(entry.manifest.files, new Set(dirs))
    const main = resolveEntry(entry.manifest.main, new Set(files))
    const predicted = new Set(files.filter((rel) => isDelivered(rel, allowlist, main)))
    for (const rel of packed) if (!predicted.has(rel)) mismatches.push(`${entry.relPath}: npm 打了但我们说不会 → ${rel}`)
    for (const rel of predicted) if (!packed.has(rel)) mismatches.push(`${entry.relPath}: 我们说会打但 npm 没打 → ${rel}`)
  }
  assert.ok(withFiles.length >= 20, `受管包带 files 白名单的只有 ${withFiles.length} 个——射程缩小了，先确认目录布局`)
  assert.deepEqual(mismatches, [], `判定器与 npm ${npmVersion} 的产出必须全等；不一致说明 glob 语义建模有偏`)
})

test('CALIB 前提钉：pnpm 对 file: 依赖遵守 files 白名单（本门禁的全部立论基础）', async (t) => {
  try {
    execFileSync('pnpm', ['--version'], { encoding: 'utf8' })
  } catch {
    return t.skip('pnpm 不可用——本项没有核对前提（不是通过）')
  }
  await withMutationFixture({
    prefix: 'files-pnpm-premise',
    prepare: async (fixture) => {
      await mkdir(join(fixture.path('repo', 'pkg', 'lib')), { recursive: true })
      await mkdir(join(fixture.path('repo', 'consumer')), { recursive: true })
      await writeFile(join(fixture.path('repo', 'pkg', 'package.json')),
        `${JSON.stringify({ name: 'probe-pkg', version: '1.0.0', files: ['lib/a.js'] }, null, 2)}\n`)
      await writeFile(join(fixture.path('repo', 'pkg', 'lib', 'a.js')), 'export default 1\n')
      await writeFile(join(fixture.path('repo', 'pkg', 'lib', 'b.js')), 'export default 2\n')
      await writeFile(join(fixture.path('repo', 'pkg', 'undeclared.txt')), 'x\n')
      await writeFile(join(fixture.path('repo', 'consumer', 'package.json')),
        `${JSON.stringify({ name: 'consumer', version: '1.0.0', dependencies: { 'probe-pkg': 'file:../pkg' } }, null, 2)}\n`)
    },
  }, async (fixture) => {
    const consumer = fixture.path('repo', 'consumer')
    execFileSync('pnpm', ['install', '--offline', '--ignore-scripts', '--reporter=silent'], {
      cwd: consumer,
      // 隔离 HOME/TMPDIR/cache：这条用例不得碰真实 HOME 的 store 或缓存。
      env: { PATH: process.env.PATH, HOME: fixture.home, TMPDIR: fixture.tmp, npm_config_cache: join(fixture.tmp, 'npm-cache') },
      stdio: 'pipe',
    })
    const installed = join(consumer, 'node_modules', 'probe-pkg')
    assert.deepEqual(readdirSync(join(installed, 'lib')), ['a.js'],
      'file: 安装后 lib/ 里应当只剩 files 声明的那一个文件')
    assert.equal(existsSync(join(installed, 'lib', 'b.js')), false, '未声明的 lib/b.js 不得出现')
    assert.equal(existsSync(join(installed, 'undeclared.txt')), false, '未声明的顶层文件不得出现')
  })
})

/** `npm pack --dry-run --json` 的产出路径；`--ignore-scripts` 关掉 prepack，避免构建与 stdout 污染。 */
async function packPaths(packageDir) {
  const out = await new Promise((resolve, reject) => {
    execFile('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: packageDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    }, (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout)))
  })
  const parsed = JSON.parse(out)
  return parsed[0].files.map((entry) => entry.path)
}

/** 定并发映射：保持结果顺序，任一项抛错即整体抛错（不吞）。 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

// ── 变异自测：缺陷形状必须「在突变下变绿」才证明判据有牙 ──────────────────

test('MUT1 恒真桩：isDelivered 改成永远 true，P-24 形状必须漏过（否则拦住它的不是这个判定器）', async () => {
  const mutant = await loadMutant([{
    anchor: 'return allowlist.some((entry) => entry.regex.test(relPath))',
    replacement: 'return true',
  }])
  assert.equal(mutant.checkPackageFilesCoverage([makeP24Tree()]).status, 'pass',
    '恒真桩下必须漏过——漏不过说明这个形状根本不是靠 isDelivered 拦住的')
  assert.equal(checkPackageFilesCoverage([makeP24Tree()]).status, 'fail', '未突变时必须判红')
})

test('MUT2 不跟 import：闭包只剩声明入口，P-24 形状必须漏过', async () => {
  const mutant = await loadMutant([{
    anchor: 'for (const regex of [RELATIVE_SPECIFIER, META_URL_SPECIFIER]) {',
    replacement: 'for (const regex of []) {',
  }])
  const audit = mutant.auditPackageDelivery(makeP24Tree())
  assert.deepEqual(audit.surface, ['cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'package.json'],
    '不扩展时应恰好只剩声明入口；两个丢过的文件都不在里面')
  assert.equal(mutant.checkPackageFilesCoverage([makeP24Tree()]).status, 'pass', '不跟 import 时不得判红')
  assert.equal(checkPackageFilesCoverage([makeP24Tree()]).status, 'fail')
})

test('MUT3 关掉 import.meta.url 那条：new URL 定位的运行时文件必须漏过', async () => {
  const mutant = await loadMutant([{
    linePrefix: 'const META_URL_SPECIFIER = ',
    replacement: 'const META_URL_SPECIFIER = /NEVER_MATCHES_THIS_FIXTURE/g',
  }])
  assert.deepEqual(mutant.auditPackageDelivery(makeMetaUrlTree()).missing, [], '关掉之后必须看不见 lib/lint-preset.mjs')
  assert.deepEqual(auditPackageDelivery(makeMetaUrlTree()).missing, ['lib/lint-preset.mjs'], '未突变时必须看得见')
})
