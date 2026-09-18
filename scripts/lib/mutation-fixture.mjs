/**
 * A short-lived, owned filesystem fixture for tests that would otherwise
 * mutate the checkout, a real DSH profile, or the caller's home directory.
 *
 * The fixture deliberately has a small lifecycle: create -> prepare ->
 * commit -> cleanup. `commit()` always cleans up, including when its callback
 * throws. Callers that need asynchronous setup should use
 * `withMutationFixture()`.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/u
const FIXTURE_DIRS = Object.freeze(['repo', 'home', 'profile', 'tmp'])

/**
 * Live fixture roots owned by this process, in creation order.
 *
 * Why a registry and not just `finally`: a `finally` cannot run when the
 * process is terminated. The observed shape (2026-09-17, QG-006B): `kill
 * -TERM` on a running gate left eight `fullstack-installer-*` roots behind in
 * `TMPDIR` and one `node scripts/gate.mjs` reparented to init, and a machine
 * that runs the gate a few times a day had accumulated **2,066** stale fixture
 * directories (35 MB) that nobody had noticed, because nothing reported them.
 * A cleanup path that only exists on the happy path is not a cleanup path.
 */
const liveRoots = new Set()
let reaperInstalled = false
let reaperRunning = false

/** Signals whose default action ends the process; each one must reap first. */
const REAPED_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP'])

function installReaper() {
  if (reaperInstalled) return
  reaperInstalled = true
  // 'exit' covers normal completion, an uncaught throw, and the re-raise below.
  process.on('exit', () => { reapAll() })
  for (const signal of REAPED_SIGNALS) {
    process.on(signal, () => {
      reapAll()
      // Re-raise with the default disposition so the parent still observes a
      // signal death. Exiting with a code instead would make a killed run
      // indistinguishable from a run that chose to stop (143 is a convention,
      // not a fact the parent can check).
      process.removeAllListeners(signal)
      process.kill(process.pid, signal)
    })
  }
}

/**
 * Remove every live fixture root. Safe to call at any time; a root whose
 * ownership can no longer be proven is left alone and reported, never removed.
 *
 * @returns {{removed: string[], refused: {root: string, reason: string}[]}}
 */
export function reapAll() {
  if (reaperRunning) return { removed: [], refused: [] }
  reaperRunning = true
  /** @type {string[]} */
  const removed = []
  /** @type {{root: string, reason: string}[]} */
  const refused = []
  for (const entry of [...liveRoots]) {
    try {
      if (entry.cleanup()) removed.push(entry.root)
    } catch (error) {
      // 这里的两处注解不是装饰：包级 `tsc` 会把本文件当 `.mjs` 检查
      // （`checkJs` + 本文件被包的 test glob 传递引入），而 `catch` 的绑定在
      // 严格模式下是 `unknown`——不注解就是 TS2339 把整条 `scripts-runnable`
      // 判红，而红的位置与被改的代码无关（实测 2026-09-17）。
      const failure = /** @type {{code?: string, message?: string}} */ (error)
      refused.push({ root: entry.root, reason: failure?.code ?? failure?.message ?? 'UNKNOWN' })
    }
  }
  reaperRunning = false
  return { removed, refused }
}

/** Roots this process still owns. Used by tests and by the attestation harness. */
export function liveFixtureRoots() {
  return [...liveRoots].map((entry) => entry.root).sort()
}

export class MutationFixtureError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'MutationFixtureError'
    this.code = code
    this.details = details
  }
}

/**
 * 抛一个带 code 的 fixture 错误。
 *
 * `@returns {never}` **不是文档装饰**：包级 `tsc` 会检查本文件（`checkJs` +
 * 被包的 test glob 传递引入），而 `catch { fail(...) }` 这类卫语句只有在
 * `fail` 被标注成 `never` 时才会让后续代码完成窄化。没有它就会出现两件坏事：
 * ①`stat.isDirectory()` 报 TS18048（`T | undefined`），②真缺陷被 `.` 或 `?.`
 * 掩盖而不是被类型系统逼出来。实测 2026-09-17 由 `scripts-runnable` 判红。
 */
function fail(code, message, details) {
  throw new MutationFixtureError(code, message, details)
}

function attachCleanupError(primary, cleanupError) {
  if ((typeof primary === 'object' && primary !== null) || typeof primary === 'function') {
    primary.cleanupError ??= cleanupError
    return primary
  }
  return new AggregateError(
    [primary, cleanupError],
    'mutation fixture 主流程与 cleanup 同时失败',
    { cause: primary },
  )
}

function isInside(parent, candidate) {
  const rel = relative(parent, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function canonicalExistingDirectory(pathname, label) {
  if (typeof pathname !== 'string' || pathname.length === 0) {
    fail('FIXTURE_PARENT_INVALID', `${label} 必须是非空路径`, { label })
  }
  const requested = resolve(pathname)
  // 不要给 `stat` 加 `@type` 注解。JS 里带 JSDoc 类型的 `let` 是**声明类型**，
  // 后续 `if (stat === undefined)` 对它窄化会被忽略，于是下一行的
  // `stat.isDirectory()` 仍旧报 TS18048（实测两次都是这个形状）。
  // 让它保持推断，窄化才真的生效。
  let stat
  try {
    stat = lstatSync(requested, { bigint: true })
  } catch (error) {
    const failure = /** @type {{code?: string}} */ (error)
    // 这里是**唯一**一处直接 `throw` 而不是走 `fail()`：`checkJs` 只把语句位置的
    // `throw` 当作控制流终点，`fail()` 的 `@returns {never}` 在窄化上不生效
    // （实测三次都判在这里，TS18048）。抛的是同一个错误类型与同一个 code，
    // 差别只在类型系统认不认——这正是「不改行为、只改形状」的那一类修正。
    throw new MutationFixtureError('FIXTURE_PARENT_MISSING', `${label} 不存在：${requested}`, {
      label,
      path: requested,
      cause: failure?.code,
    })
  }
  if (!stat.isDirectory()) fail('FIXTURE_PARENT_NOT_DIRECTORY', `${label} 不是目录：${requested}`, { label, path: requested })
  return realpathSync.native(requested)
}

function validatePrefix(prefix) {
  if (typeof prefix !== 'string' || prefix.length < 3) {
    fail('FIXTURE_PREFIX_INVALID', 'fixture prefix 必须至少三个字符', { prefix })
  }
  if (prefix !== prefix.normalize('NFC')) {
    fail('FIXTURE_PREFIX_NORMALIZATION', 'fixture prefix 必须使用 NFC', { prefix })
  }
  if (CONTROL_RE.test(prefix) || prefix.includes('/') || prefix.includes('\\') || prefix === '.' || prefix === '..') {
    fail('FIXTURE_PREFIX_INVALID', `fixture prefix 非法：${JSON.stringify(prefix)}`, { prefix })
  }
  return prefix.endsWith('-') ? prefix : `${prefix}-`
}

function assertSafeTemporaryParent(parent) {
  const systemTemp = canonicalExistingDirectory(tmpdir(), '系统临时目录')
  if (!isInside(systemTemp, parent)) {
    fail('FIXTURE_PARENT_NOT_TEMP', `mutation fixture 只能创建在系统临时目录内：${parent}`, {
      parent,
      systemTemp,
    })
  }
  const protectedRoots = [
    canonicalExistingDirectory(process.cwd(), '当前 checkout'),
    canonicalExistingDirectory(homedir(), '当前 HOME'),
  ]
  for (const protectedRoot of protectedRoots) {
    if (isInside(protectedRoot, parent)) {
      fail('FIXTURE_PARENT_PROTECTED', `拒绝在受保护目录下创建 mutation fixture：${parent}`, {
        parent,
        protectedRoot,
      })
    }
  }
}

function directoryIdentity(pathname) {
  const stat = lstatSync(pathname, { bigint: true })
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('FIXTURE_OWNERSHIP_INVALID', `fixture root 不是自有普通目录：${pathname}`, { path: pathname })
  }
  return Object.freeze({ dev: stat.dev.toString(), ino: stat.ino.toString() })
}

function sameIdentity(pathname, expected) {
  try {
    const actual = directoryIdentity(pathname)
    return actual.dev === expected.dev && actual.ino === expected.ino
  } catch (error) {
    if (error instanceof MutationFixtureError) return false
    throw error
  }
}

function validateSegment(segment) {
  if (typeof segment !== 'string' || segment.length === 0) {
    fail('FIXTURE_PATH_SEGMENT', 'fixture 子路径必须是非空字符串', { segment })
  }
  if (segment !== segment.normalize('NFC') || CONTROL_RE.test(segment)
    || segment === '.' || segment === '..' || isAbsolute(segment)
    || segment.includes('/') || segment.includes('\\')) {
    fail('FIXTURE_PATH_ESCAPE', `fixture 子路径越界：${JSON.stringify(segment)}`, { segment })
  }
  return segment
}

function assertNoSymlinkOnPath(base, target) {
  const rel = relative(base, target)
  if (!isInside(base, target)) {
    fail('FIXTURE_PATH_ESCAPE', `fixture 路径越过根目录：${target}`, { base, target })
  }
  let cursor = base
  for (const piece of rel === '' ? [] : rel.split(sep)) {
    cursor = join(cursor, piece)
    if (!existsSync(cursor)) continue
    const stat = lstatSync(cursor)
    if (stat.isSymbolicLink()) {
      fail('FIXTURE_PATH_SYMLINK', `fixture 路径不得穿越符号链接：${cursor}`, { base, target, link: cursor })
    }
  }
  return target
}

/**
 * Create an owned root and four isolated directories. The caller must call
 * `prepare()` before `commit()`. Unlike a bare `mkdtemp`, cleanup proves the
 * root is still the exact inode created here before recursively removing it.
 */
export function createMutationFixture({ prefix = 'lute-mutation-fixture', tempParent = tmpdir() } = {}) {
  const safePrefix = validatePrefix(prefix)
  const parent = canonicalExistingDirectory(tempParent, 'tempParent')
  assertSafeTemporaryParent(parent)

  const requestedRoot = mkdtempSync(join(parent, safePrefix))
  const root = realpathSync.native(requestedRoot)
  if (basename(root).startsWith(safePrefix) === false || isInside(parent, root) === false) {
    // This cannot be a valid mkdtemp result. Do not attempt cleanup because
    // ownership was never established.
    fail('FIXTURE_ROOT_INVALID', `mkdtemp 返回了不在受控父目录中的路径：${root}`, { parent, root })
  }
  const ownership = directoryIdentity(root)

  const locations = Object.fromEntries(FIXTURE_DIRS.map((name) => [name, join(root, name)]))
  for (const pathname of Object.values(locations)) mkdirSync(pathname)

  let state = 'DRAFT'
  let cleanupResult = null

  function assertLive() {
    if (state === 'CLEANED' || state === 'CLEANUP_REFUSED') {
      fail('FIXTURE_CLOSED', 'mutation fixture 已关闭，不能再使用', { root, state })
    }
  }

  function fixturePath(scope, ...segments) {
    assertLive()
    if (scope !== 'root' && !FIXTURE_DIRS.includes(scope)) {
      fail('FIXTURE_SCOPE_INVALID', `未知 fixture scope：${scope}`, { scope })
    }
    const base = scope === 'root' ? root : locations[scope]
    const checkedSegments = segments.map(validateSegment)
    const target = resolve(base, ...checkedSegments)
    return assertNoSymlinkOnPath(base, target)
  }

  function cleanup() {
    if (cleanupResult !== null) return cleanupResult
    if (!existsSync(root)) {
      state = 'CLEANED'
      cleanupResult = false
      // Deregister only once the root is provably gone. A failed cleanup keeps
      // the entry live on purpose: the process-exit reaper should get another
      // try, and a root left behind must stay visible to `liveFixtureRoots()`.
      liveRoots.delete(fixture)
      return cleanupResult
    }
    if (!sameIdentity(root, ownership)) {
      state = 'CLEANUP_REFUSED'
      fail('FIXTURE_OWNERSHIP_CHANGED', 'fixture root 身份已改变；拒绝删除非自有目录', { root, ownership })
    }
    rmSync(root, { recursive: true, force: false })
    state = 'CLEANED'
    cleanupResult = true
    liveRoots.delete(fixture)
    return cleanupResult
  }

  const fixture = Object.freeze({
    root,
    ...locations,
    environment: Object.freeze({ HOME: locations.home, TMPDIR: locations.tmp, DSH_PROFILE_DIR: locations.profile }),
    get state() { return state },
    path: fixturePath,
    cleanup,
    /**
     * 生命周期第一步：调用方在这里造自己的载荷（不传则什么也不做，只把状态推进到
     * PREPARED）。
     *
     * 默认值从 `= () => {}` 改成「可选参数 + 显式 JSDoc 类型」：原来那种写法让 TS 把参数
     * 推成**零参数函数**，于是同一函数体里的 `callback(fixture)` 报 TS2554（实测由
     * `scripts-runnable` 的包级 tsc 判红）。可选签名既保留「可以不传」这个既有 API，
     * 又让参数带上正确的形状。
     *
     * @param {(fixture: object) => unknown | Promise<unknown>} [callback]
     */
    async prepare(callback) {
      assertLive()
      if (state !== 'DRAFT') fail('FIXTURE_LIFECYCLE', `prepare 只能在 DRAFT 状态调用，当前为 ${state}`, { state })
      try {
        // `?.()`：`callback` 是可选的（签名上可选、JSDoc 上给了形状），
        // 直接调用会报 TS2722。这里保留「不传就只推进状态」的既有语义。
        await callback?.(fixture)
        state = 'PREPARED'
      } catch (error) {
        let failure = error
        try { cleanup() } catch (cleanupError) { failure = attachCleanupError(error, cleanupError) }
        throw failure
      }
    },
    async commit(callback) {
      assertLive()
      if (state !== 'PREPARED') fail('FIXTURE_LIFECYCLE', `commit 必须在 PREPARED 状态调用，当前为 ${state}`, { state })
      if (typeof callback !== 'function') fail('FIXTURE_COMMIT_CALLBACK', 'commit callback 必须是函数')
      state = 'COMMITTING'
      let callbackError = null
      try {
        return await callback(fixture)
      } catch (error) {
        callbackError = error
        throw error
      } finally {
        try {
          cleanup()
        } catch (cleanupError) {
          if (callbackError !== null) throw attachCleanupError(callbackError, cleanupError)
          throw cleanupError
        }
      }
    },
  })
  // Register *after* the object exists, so the reaper calls the same
  // ownership-checked cleanup the caller does rather than a second
  // implementation of it.
  liveRoots.add(fixture)
  installReaper()
  return fixture
}

/**
 * An owned temp directory as a plain path string.
 *
 * Why this exists next to `createMutationFixture`: the package specs that leak
 * (measured 2026-09-17: 1,555 `fullstack-installer-*`, 438 `gn-check-*`, 82
 * `wanzh-routes-*` roots, 35 MB) do not want a four-scope fixture — they want
 * `mkdtempSync(join(tmpdir(), 'prefix-'))` with a cleanup that survives an
 * interrupted run. Returning the canonical path keeps their `join(root, ...)`
 * call sites unchanged, and the root is reaped on exit and on SIGTERM/SIGINT
 * by the same registry the full fixture uses.
 *
 * `withMutationFixture` remains the right choice when a caller needs the
 * repo/home/profile/tmp split; this is the narrow version for callers that
 * only need "a temp dir I will not leak".
 *
 * @param {string} prefix directory name prefix, at least three characters
 * @param {{tempParent?: string}} [options]
 * @returns {string} canonical path to an existing, owned directory
 */
export function mutationRoot(prefix, options = {}) {
  const fixture = createMutationFixture({ prefix, tempParent: options.tempParent })
  return fixture.root
}

/** Execute the complete prepare -> commit lifecycle with cleanup on all paths. */
export async function withMutationFixture(options, callback) {
  if (!options || typeof options !== 'object') fail('FIXTURE_OPTIONS_INVALID', 'options 必须是对象')
  const { prepare, ...createOptions } = options
  if (prepare !== undefined && typeof prepare !== 'function') {
    fail('FIXTURE_PREPARE_CALLBACK', 'prepare callback 必须是函数')
  }
  const fixture = createMutationFixture(createOptions)
  try {
    await fixture.prepare(prepare)
    return await fixture.commit(callback)
  } catch (error) {
    let failure = error
    if (fixture.state !== 'CLEANED' && fixture.state !== 'CLEANUP_REFUSED') {
      try { fixture.cleanup() } catch (cleanupError) { failure = attachCleanupError(error, cleanupError) }
    }
    throw failure
  }
}
