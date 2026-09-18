/**
 * profile 覆盖率：从「本机 profile 声明了什么」推出**期望集**，再把三个断言面
 * （内嵌副本元数据 / 交付清单 / 装载点字节）各自对着这个期望集结账（QG-004）。
 *
 * ## 为什么需要它（2026-09-17 实测的 Red）
 *
 * 把 `~/.dsh/profiles/desktop/package.json` 写成截断的 JSON，然后跑真实的
 * `node scripts/gate.mjs --mode quick --json`，三个 profile 门禁**全部绿**：
 *
 *     profile-files-sync    pass  （读数里一个字都没有）
 *     profile-bundle-sync   pass  （note 写着「对比 0/0 个 file: 依赖」）
 *     profile-metadata-sync skip  （vendor 不存在是本项自己的算术，这里无关）
 *
 * 原因是 `installedProfileDependencies()` 把 JSON 解析失败吞成 `{}`，
 * 于是「清单坏了」与「没有 file: 依赖」在读数上**完全同形**（P-02）。而
 * `profile-bundle-sync` 的射程守卫写的是 `fileDeps > 0 && pairs.length === 0`——
 * 它防的是「声明了却一个都没对上」，防不住「声明本身就没了」。
 *
 * ## 期望集的定义
 *
 * `expected` = 本仓库受管包里、**被这份 profile 以 `file:` 声明**的那些。
 * 匹配按**完整相对路径**（`packages/<组>/<包>`）做后缀对齐，不按 basename：
 * 目录名撞车时 basename 匹配会让两个包互相顶替。
 *
 * 三类对象分开报，互不代替：
 *   - `expected`：声明了且在受管清单里 → 每个都要在三个断言面上有结果；
 *   - `unmanaged`：声明了但不属于本仓库（别的项目的 `file:` 依赖）→ 读数，判红是别人的事；
 *   - `undeclared`：受管但这份 profile 没声明 → 读数（本机 profile 裁剪是合法的），
 *     里面**带 `dsh` 声明却没有被声明**的会单独点出来，那是真信号。
 *
 * ## 只允许一种 skip
 *
 * profile 根整体不存在。profile 在、`node_modules` 或 `vendor` 不在，都要判红：
 * 那份清单声明了 `file:` 依赖，安装没落到位就意味着应用加载不到这些包。
 *
 * @module
 */
import { join, normalize } from 'node:path'

/** 三个互不替代的断言面。 */
export const PROFILE_TARGETS = Object.freeze(['metadata', 'files', 'bundle'])

/** 每个断层面要求的目标目录相对 profile 的位置。 */
const TARGET_LOCATION = Object.freeze({
  metadata: ['vendor'],
  files: ['node_modules'],
  bundle: ['node_modules'],
})

/**
 * 解析 profile 的 package.json。
 *
 * 解析失败**直接判红**，不返回空对象：坏了与没有是两件事，读数上必须分开。
 *
 * @param {{readText: (path: string) => string|null, profileDir: string}} input
 * @returns {{ok: true, dependencies: Record<string, string>} | {ok: false, reason: string}}
 */
export function readProfileManifest({ readText, profileDir }) {
  const manifestPath = join(profileDir, 'package.json')
  const text = readText(manifestPath)
  if (text === null) {
    return { ok: false, reason: `profile 根存在，但读不到 ${manifestPath}——无法知道这份 profile 声明了什么` }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      ok: false,
      reason: `${manifestPath} 不是合法 JSON（${error instanceof Error ? error.message : String(error)}）——`
        + '旧实现会把它吞成「没有 file: 依赖」，于是三个 profile 门禁一起静默变绿',
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: `${manifestPath} 的顶层不是对象` }
  }
  const dependencies = parsed.dependencies
  if (dependencies === undefined) return { ok: true, dependencies: {} }
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    return { ok: false, reason: `${manifestPath} 的 dependencies 不是对象` }
  }
  return { ok: true, dependencies }
}

/**
 * 把 `file:` 说明符化成仓库相对路径。
 *
 * 按**分段后缀**对齐受管包的完整相对路径：`vendor/packages/x/y` 与
 * `packages/x/y` 都归到同一个包，而不必把 `vendor/` 这个布局写死在这里
 * （布局一换，写死的那份就成了新的假绿来源）。
 *
 * @param {string} relPath 受管包的仓库相对路径，如 `packages/surfaces/dsh-x`
 * @param {string} spec 依赖里的 `file:` 说明符
 * @returns {boolean}
 */
export function specTargetsPackage(relPath, spec) {
  if (typeof spec !== 'string' || !spec.startsWith('file:')) return false
  const raw = normalize(spec.slice('file:'.length)).replace(/^\.\//, '').replace(/^\/+/, '')
  const segments = raw.split('/').filter((piece) => piece !== '' && piece !== '.')
  const wanted = relPath.split('/').filter(Boolean)
  if (segments.length < wanted.length) return false
  const tail = segments.slice(segments.length - wanted.length)
  return tail.every((piece, index) => piece === wanted[index])
}

/**
 * 建立期望集：把 profile 声明的 `file:` 依赖分成「受管 / 不受管」两堆，
 * 再把受管的那些补上前两个断言面各自的目标目录。
 *
 * @param {{
 *   profileDir: string,
 *   repoRoot: string,
 *   dependencies: Record<string, string>,
 *   packages: Array<{relPath: string, dir?: string, manifest: Record<string, unknown>}>,
 * }} input
 * @returns {{
 *   expected: Array<{name: string, relPath: string, sourceDir: string, vendorDir: string, loadDir: string}>,
 *   unmanaged: Array<{name: string, spec: string}>,
 *   undeclared: Array<{relPath: string, name: string, declaresBundle: boolean}>,
 *   fileDeps: number,
 * }}
 */
export function buildExpectedSet({ profileDir, repoRoot, dependencies, packages }) {
  const managed = packages
    .filter((entry) => entry.relPath !== '.' && typeof entry.relPath === 'string')
    .map((entry) => ({ relPath: entry.relPath, name: String(entry.manifest?.name ?? entry.relPath) }))

  const expected = []
  const unmanaged = []
  const claimed = new Set()
  let fileDeps = 0

  for (const [name, spec] of Object.entries(dependencies)) {
    if (typeof spec !== 'string' || !spec.startsWith('file:')) continue
    fileDeps += 1
    const owner = managed.find((entry) => specTargetsPackage(entry.relPath, spec))
    if (owner === undefined) {
      unmanaged.push({ name, spec })
      continue
    }
    claimed.add(owner.relPath)
    expected.push({
      name,
      relPath: owner.relPath,
      sourceDir: join(repoRoot, owner.relPath),
      vendorDir: join(profileDir, 'vendor', owner.relPath),
      loadDir: join(profileDir, 'node_modules', name),
    })
  }

  const undeclared = managed
    .filter((entry) => !claimed.has(entry.relPath))
    .map((entry) => {
      const packageEntry = packages.find((item) => item.relPath === entry.relPath)
      const dsh = packageEntry?.manifest?.dsh
      return {
        relPath: entry.relPath,
        name: entry.name,
        declaresBundle: dsh !== undefined && typeof dsh === 'object' && dsh !== null,
      }
    })

  expected.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return { expected, unmanaged, undeclared, fileDeps }
}

/**
 * 把一组 pair 逐个喂给现成的判定器，得到**对象级**账目。
 *
 * 逐个调用而不是整批调用，是为了知道每个包里哪一个出了问题——整批调用只能得到
 * 一个 `passed`，而覆盖率要的是「N 个里几个过了」。逐包的判定逻辑与整批完全
 * 相同（同一批函数、同一份规则），这里不复制任何判据。
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => {passed: boolean, violations: string[]}} judge
 * @returns {{ok: number, violations: string[], failed: number}}
 */
export function accountPerObject(items, judge) {
  let ok = 0
  let failed = 0
  const violations = []
  for (const item of items) {
    const result = judge(item)
    if (result.passed) ok += 1
    else {
      failed += 1
      violations.push(...result.violations)
    }
  }
  return { ok, failed, violations }
}

/**
 * 覆盖率的**存在性**层：期望集里的每个包都必须在目标目录里真的存在。
 *
 * 这一层是 0/N、1/N、N-1/N 三条 mutation 的落点：旧实现把「目标里没有这个包」
 * 当成 `continue`（未安装），于是 N 个期望对象里少看几个不会改变结论。
 *
 * @param {{
 *   expected: Array<{name: string, relPath: string, vendorDir: string, loadDir: string}>,
 *   target: string,
 *   exists: (path: string) => boolean,
 * }} input
 * @returns {{missing: Array<{name: string, relPath: string, dir: string}>, present: number, dir: string|null}}
 */
export function checkTargetPresence({ expected, target, exists }) {
  const marker = target === 'metadata' ? 'package.json' : null
  const dirOf = (item) => (target === 'metadata' ? item.vendorDir : item.loadDir)
  const missing = []
  let present = 0
  for (const item of expected) {
    const dir = dirOf(item)
    const hit = marker === null ? exists(dir) : exists(join(dir, marker))
    if (hit) present += 1
    else missing.push({ name: item.name, relPath: item.relPath, dir })
  }
  return { missing, present, dir: expected.length > 0 ? dirOf(expected[0]) : null }
}

/**
 * 组装一个断言面的规范门禁结果。
 *
 * 账目恒等式：`expected = checked + skipped + failed`，且 `expected` 就是期望集的
 * 大小——不能因为「目标里没有它」而从分母里掉出去。
 *
 * @param {{
 *   target: string,
 *   profileDir: string,
 *   exists: (path: string) => boolean,
 *   manifest: {ok: true, dependencies: Record<string, string>} | {ok: false, reason: string},
 *   set: ReturnType<typeof buildExpectedSet>,
 *   judge: (pair: object) => {passed: boolean, violations: string[]},
 * }} input
 * @returns {object} 规范门禁结果
 */
export function summarizeTarget({ target, profileDir, exists, manifest, set, judge }) {
  const location = TARGET_LOCATION[target].join('/')
  const coverage = {
    fileDeps: set.fileDeps,
    unmanaged: set.unmanaged.length,
    undeclared: set.undeclared.length,
    declaresBundleButUndeclared: set.undeclared.filter((entry) => entry.declaresBundle).map((entry) => entry.relPath),
  }
  const tail = `；profile 声明 ${coverage.fileDeps} 个 file: 依赖（受管 ${set.expected.length} / 不受管 ${coverage.unmanaged}），`
    + `受管但未声明 ${coverage.undeclared} 个${coverage.declaresBundleButUndeclared.length > 0 ? `（其中带 dsh 声明的是 ${coverage.declaresBundleButUndeclared.join('、')}）` : ''}`

  if (!manifest.ok) {
    return {
      status: 'fail', expected: 1, discovered: 0, checked: 0, skipped: 0, failed: 1, typedSkips: [],
      reason: 'profile 清单读不了',
      violations: [manifest.reason],
    }
  }

  if (set.expected.length === 0) {
    return {
      status: 'skip', expected: 1, discovered: 0, checked: 0, skipped: 1, failed: 0,
      typedSkips: [{
        type: 'profile-declares-no-managed-file-dependency',
        count: 1,
        reason: '这份 profile 没有声明任何**本仓库受管**的 file: 依赖——本项未核对任何包（不是「都一致」）',
      }],
      reason: '期望集为空',
      violations: [],
      note: `断言面 ${target}（${location}）${tail}`,
    }
  }

  const targetDir = target === 'metadata' ? join(profileDir, 'vendor') : join(profileDir, 'node_modules')
  if (!exists(targetDir)) {
    return {
      status: 'fail', expected: set.expected.length, discovered: set.expected.length,
      checked: 0, skipped: 0, failed: set.expected.length, typedSkips: [],
      reason: `${location} 目录不存在`,
      violations: [
        `profile 根存在，但 ${targetDir} 不存在——这份 profile 声明了 ${set.expected.length} 个受管的 file: 依赖，`
        + '安装没落到位就意味着应用加载不到这些包。只有 profile 根**整体**不存在才允许跳过本项',
      ],
      note: `断言面 ${target}（${location}）${tail}`,
    }
  }

  const presence = checkTargetPresence({ expected: set.expected, target, exists })
  const present = set.expected.filter((item) => !presence.missing.some((miss) => miss.relPath === item.relPath))
  const accounting = accountPerObject(present, judge)
  const violations = [
    ...presence.missing.map((miss) => (
      `${miss.relPath}: ${location} 里没有它（找的是 ${miss.dir}）——`
      + '射程期望集包含这个包，它必须在这里，缺件不能从分母里消失'
    )),
    ...accounting.violations,
  ]
  const failed = presence.missing.length + accounting.failed
  const checked = accounting.ok
  const note = `断言面 ${target}（${location}）：期望 ${set.expected.length} 个，核对 ${checked} 个`
    + `${presence.missing.length > 0 ? `，目标缺失 ${presence.missing.length} 个` : ''}${tail}`

  if (failed > 0) {
    return {
      status: 'fail', expected: set.expected.length, discovered: set.expected.length,
      checked, skipped: 0, failed, typedSkips: [], reason: `${failed} 个受管包不达标`, violations, note,
    }
  }
  return {
    status: 'pass', expected: set.expected.length, discovered: set.expected.length,
    checked, skipped: 0, failed: 0, typedSkips: [], reason: `${checked} 个受管包达标`, violations: [], note,
  }
}
