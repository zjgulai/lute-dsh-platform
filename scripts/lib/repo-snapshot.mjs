/**
 * Machine-readable before/after attestation of a checkout (QG-006B).
 *
 * Why this exists: every other gate answers "is the repository correct?". This
 * module answers a different question — "did the *instrument itself* change the
 * repository while answering?". Those two questions fail in the same way when
 * the instrument is silent, which is exactly the假绿 shape the playbook warns
 * about (P-02). So the attestation is a first-class artifact with its own
 * contract, not a helper buried inside a test.
 *
 * Contract (each clause exists because its negation was observed or is
 * reachable):
 *
 * 1. **The射程 is git's view of the worktree.** Tracked files carry the blob
 *    hash git itself computed; untracked files are enumerated with
 *    `--untracked-files=all` (never collapsed to a directory) and hashed with
 *    `git hash-object`, i.e. the same blob domain. 654,616 ignored files exist
 *    in this checkout, so "hash everything on disk" is not a scorable射程 —
 *    but it is also not silently dropped: caller-declared generated roots are
 *    enumerated separately (clause 3) and the ignored-file count is reported.
 * 2. **Empty射程 reports as such.** `plan()` fails closed when a repository
 *    yields zero tracked AND zero untracked entries: a clean attestation and a
 *    broken instrument must not print the same thing (ADR-0102).
 * 3. **Declared generated roots are summed, not ignored.** Roots the project
 *    knows it regenerates (`.dsh-types/`, `node_modules/`, …) are recorded as a
 *    depth-1 name/mode/type listing. That is enough to catch residue and
 *    removal without hashing 479k files, and it still changes when a run
 *    creates or deletes something there.
 * 4. **Git's own state is part of the snapshot.** The index bytes, HEAD, the
 *    ref set and any leftover `*.lock` are recorded, because "we only wrote a
 *    temp file" and "we refreshed the index on someone's dirty worktree" are
 *    different events that a worktree-only digest cannot tell apart.
 * 5. **`identical()` never hides a delta.** It returns the typed delta; callers
 *    that want a boolean read `.identical`. Unknown extra paths fail the
 *    attestation — there is no path allowlist to grow.
 *
 * 6. **A truncated scope cannot pass.** Git collapses untracked directories in
 *    its default mode, so the enumeration runs `--untracked-files=all` **and**
 *    verifies the result: no entry may end with `/`, and each one must resolve
 *    to a real path. A collapsed or unreadable enumeration reports as a
 *    failure, never as "nothing changed" (ADR-0102).
 *
 * Not covered (stated, not implied): file bytes are read non-atomically, so a
 * writer racing this module can produce a torn entry. `attestCommand` handles
 * that by re-running and reporting the offender instead of guessing.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export const SNAPSHOT_SCHEMA = 'repo-snapshot/v1'

/** Entry state values. `tracked` is git-index content; `untracked` is git-visible only. */
export const ENTRY_STATES = Object.freeze(['tracked', 'untracked'])

/**
 * Ref namespaces owned by **other tools**, not by this repository's own flows.
 *
 * Why they need naming rather than ignoring: a concurrent agent/tool writing
 * `refs/codex/**` is real write activity in this checkout (measured 2026-09-17:
 * two of the attestation lanes caught `refs-changed` mid-run, and the ref that
 * moved was under `refs/codex/`). Recording it as "the gate changed refs" would
 * be wrong attribution, while dropping it from the snapshot entirely would hide
 * that someone else *was* writing while we measured.
 *
 * So the two sets are kept apart: `refs` (ours: heads/tags/remotes) is a
 * fail-closed part of the digest; `concurrentRefs` is recorded **by name** and
 * reported as interference in the verdict. Nothing here is a blanket ignore —
 * a ref outside these prefixes still fails as `refs-changed`.
 */
export const CONCURRENT_REF_PREFIXES = Object.freeze(['refs/codex/'])

/** Diff kinds reported by `identical()`. */
export const DIFF_KINDS = Object.freeze([
  'entry-added',
  'entry-removed',
  'entry-changed',
  'root-added',
  'root-removed',
  'root-changed',
  'ignored-area-added',
  'ignored-area-removed',
  'ignored-area-changed',
  'head-changed',
  'refs-changed',
  'index-changed',
])

/**
 * Roots and glob patterns every run of this repository regenerates.
 *
 * Glob entries exist because the ignored areas are not all at a fixed depth:
 * per-package `node_modules` live at `packages/<group>/<pkg>/node_modules`, and
 * a fixed list would have to be edited every time a package is added — the
 * shape of decay that turns a scope into a fossil.
 *
 * These are *added to* `DEFAULT_DECLARED_ROOTS`, never subtracted from: a
 * caller cannot narrow the attested scope by passing a shorter list, because
 * "I only attested this much and it was clean" must never be printable as
 * "the run was clean".
 */
export const DEFAULT_DECLARED_ROOTS = Object.freeze([
  'node_modules/',
  '.dsh-types/',
  'packages/',
  'packages/*/*/node_modules/',
  'packaging/',
  'deliverables/',
])

/**
 * Ignored areas this repository is known to generate. Matched on the leading
 * one or two path segments of a `git ls-files --ignored --directory` entry.
 * Adding to this list widens what the attestation reports as attributed
 * content; it never removes anything from the reported set.
 */
export const GENERATED_IGNORED_PREFIXES = Object.freeze([
  'node_modules',
  '.dsh-types',
  '.DS_Store',
  '.codex',
  '.ua',
  '.loopx',
  'packaging/staging',
  'packaging/release',
  'packaging/.app-cache',
  'packaging/.app-postprocess-preview',
  'packages',
  'vendor',
  'deliverables',
  'pnpm-lock.yaml',
  'package-lock.json',
])

export class RepoSnapshotError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'RepoSnapshotError'
    this.code = code
    this.details = details
  }
}

function fail(code, message, details) {
  throw new RepoSnapshotError(code, message, details)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function statOf(pathname) {
  try {
    return lstatSync(pathname, { bigint: true })
  } catch {
    return null
  }
}

/**
 * Run git with a fixed, non-interactive environment.
 *
 * `-c core.quotepath=false` keeps non-ASCII paths literal; `-z` keeps both
 * `ls-files` and `status` unquoted and NUL-delimited, so a filename containing
 * whitespace, a double quote or a newline survives parsing intact (the
 * `git-quoted-path` pitfall: stripping the surrounding quotes of a *quoted*
 * path mangles it silently). `--no-optional-locks` keeps read-only commands
 * from taking the index lock.
 */
function git(repoRoot, args, { encoding = 'utf8' } = {}) {
  const result = spawnSync(
    'git',
    ['-C', repoRoot, '-c', 'core.quotepath=false', ...args],
    {
      encoding,
      maxBuffer: 512 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: '0',
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C',
      },
    },
  )
  if (result.error) {
    fail('SNAPSHOT_GIT_SPAWN', `无法执行 git：${result.error.message}`, { args, code: result.error.code })
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim()
    fail('SNAPSHOT_GIT_FAILED', `git ${args.join(' ')} 失败（退出码 ${result.status}）：${stderr}`, {
      args,
      status: result.status,
      stderr,
    })
  }
  return result.stdout
}

function splitNul(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw
  return text.split('\0').filter((piece) => piece.length > 0)
}

/** NUL-safe lines: git never emits a bare newline inside a `-z` field. */
function splitLines(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw
  return text.split('\n').filter((line) => line.length > 0)
}

function resolveRepoRoot(repoRoot) {
  if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
    fail('SNAPSHOT_ROOT_INVALID', 'repoRoot 必须是非空路径', { repoRoot })
  }
  const absolute = isAbsolute(repoRoot) ? repoRoot : resolve(repoRoot)
  if (!existsSync(absolute)) {
    fail('SNAPSHOT_ROOT_MISSING', `仓库根不存在：${absolute}`, { repoRoot: absolute })
  }
  return absolute
}

/**
 * Hash worktree files through git so their identifiers live in the same domain
 * as the index blob hashes. Paths are fed on stdin (`--stdin-paths`) in
 * batches; one process per file would dominate the runtime and one process per
 * repository would blow the argument limit on a 2,000-file射程.
 */
function hashObjects(repoRoot, relPaths) {
  const hashes = new Map()
  const BATCH = 256
  for (let offset = 0; offset < relPaths.length; offset += BATCH) {
    const batch = relPaths.slice(offset, offset + BATCH)
    const result = spawnSync(
      'git',
      ['-C', repoRoot, '-c', 'core.quotepath=false', 'hash-object', '--stdin-paths'],
      {
        input: `${batch.join('\n')}\n`,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
      },
    )
    if (result.error || result.status !== 0) {
      fail('SNAPSHOT_HASH_FAILED', 'git hash-object 失败', {
        status: result.status,
        stderr: String(result.stderr ?? '').trim(),
        batchSize: batch.length,
      })
    }
    const lines = splitLines(result.stdout)
    if (lines.length !== batch.length) {
      // Fail closed: a short answer means the mapping is wrong, and a wrong
      // mapping would silently compare the wrong files.
      fail('SNAPSHOT_HASH_MISMATCH', `hash-object 返回 ${lines.length} 行，期望 ${batch.length} 行`, {
        expected: batch.length,
        actual: lines.length,
      })
    }
    batch.forEach((rel, index) => hashes.set(rel, lines[index]))
  }
  return hashes
}

/** Symlinks are digestible by target; the blob hash would follow them instead. */
function symlinkDigest(target) {
  return sha256(`symlink\0${target}`)
}

function missingDigest(rel, error) {
  return sha256(`missing\0${rel}\0${error?.code ?? 'UNKNOWN'}`)
}

/**
 * Tracked entries.
 *
 * Index stages are the answer to "what did this run start from"; the worktree
 * is the answer to "what does it look like now". `git status` supplies the
 * worktree blob hash for anything modified, so no file is read by this module
 * unless it is untracked (untracked paths have no hash to borrow).
 */
function readTrackedEntries(repoRoot) {
  const staged = new Map()
  for (const line of splitNul(git(repoRoot, ['ls-files', '--stage', '-z']))) {
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const [mode, hash, stage] = line.slice(0, tab).split(' ')
    const path = line.slice(tab + 1)
    if (stage !== '0') continue // conflicted index: the path is still reported below
    staged.set(path, { mode, hash })
  }

  const worktree = new Map()
  for (const record of splitNul(git(repoRoot, ['status', '--porcelain=v2', '-z', '--untracked-files=all']))) {
    if (!record.startsWith('1 ')) continue
    const fields = record.split(' ')
    if (fields.length < 9) continue
    worktree.set(fields.slice(8).join(' '), { mode: fields[3], hash: fields[5] })
  }

  const entries = []
  for (const [path, index] of staged) {
    const current = worktree.get(path)
    entries.push({
      path,
      state: 'tracked',
      mode: current?.mode ?? index.mode,
      digest: current?.hash ?? index.hash,
    })
  }
  return entries
}

/** Untracked entries: git-visible only, hashed through git so the digest domain matches. */
function readUntrackedEntries(repoRoot) {
  const paths = splitNul(git(repoRoot, ['status', '--porcelain=v2', '-z', '--untracked-files=all']))
    .filter((record) => record.startsWith('? '))
    .map((record) => record.slice(2))

  // Truncation check. Porcelain v2 in `--untracked-files=all` mode never emits a
  // directory entry, so a trailing slash means the射程 was collapsed; and an
  // entry whose path does not exist means the enumeration and the disk disagree.
  // Both must be loud: `git status` is the fastest thing to go quiet here, and
  // its silence is indistinguishable from a clean run.
  const collapsed = paths.filter((path) => path.endsWith('/'))
  if (collapsed.length > 0) {
    fail('SNAPSHOT_SCOPE_COLLAPSED', `untracked 射程被折叠成目录，无法逐文件核对：${collapsed.slice(0, 5).join('、')}`, {
      collapsed: collapsed.slice(0, 20),
      count: collapsed.length,
    })
  }
  const vanished = paths.filter((path) => statOf(join(repoRoot, path)) === null)
  if (vanished.length > 0) {
    fail('SNAPSHOT_ENUMERATION_STALE', `untracked 清单里有 ${vanished.length} 个路径在磁盘上不存在：${vanished.slice(0, 5).join('、')}`, {
      vanished: vanished.slice(0, 20),
      count: vanished.length,
      total: paths.length,
    })
  }

  // 符号链接**不能进 `git hash-object`**。实测（2026-09-17）：checkout 里有一个悬空软链
  // `packaging/backup/…/Electron Framework.framework/Helpers -> Versions/Current/Helpers`，
  // git 对它的回答是 `fatal: could not open … for reading: No such file or directory`，
  // 整批 hashing 直接失败。而且 `lstatSync` 对悬空软链**是成功的**（链接本身存在），
  // 所以它顺着上一步的存在性检查一路走到了这里。
  //
  // 处置是分拣而不是宽容：链接按链接读（`readlinkSync` 给出目标字符串，悬空与否都能读），
  // 普通文件才交给 git。判据强度不变——悬空软链的目标是被记录的事实，改了照样判红。
  const symlinkPaths = []
  const regularPaths = []
  for (const path of paths) {
    const stat = statOf(join(repoRoot, path))
    if (stat !== null && stat.isSymbolicLink()) symlinkPaths.push(path)
    else regularPaths.push(path)
  }
  const digests = regularPaths.length > 0 ? hashObjects(repoRoot, regularPaths) : new Map()

  return paths.map((path) => {
    const absolute = join(repoRoot, path)
    const stat = statOf(absolute)
    if (stat === null) {
      // Unreachable while the staleness check above holds; kept as a typed
      // answer rather than a crash if a writer removes the file mid-loop.
      return { path, state: 'untracked', mode: '000000', digest: missingDigest(path, null) }
    }
    if (stat.isSymbolicLink()) {
      let target
      try {
        // `readlinkSync` 而不是 `readFileSync`：前者读的是链接自身的目标字符串，
        // 对悬空链接同样成立；后者会跟着链接去打开目标，目标不存在就 ENOENT。
        target = readlinkSync(absolute)
      } catch (error) {
        return { path, state: 'untracked', mode: '120000', digest: missingDigest(path, error) }
      }
      // 目标是否存在，本身就是一条要记下来的事实：软链从"指向 A"变成"指向 B"
      // 与从"有效"变成"悬空"，在这个 digest 里都是可见的变化。
      return { path, state: 'untracked', mode: '120000', digest: symlinkDigest(target) }
    }
    return {
      path,
      state: 'untracked',
      mode: stat.mode & 0o111n ? '100755' : '100644',
      digest: digests.get(path) ?? sha256(`unhashed\0${path}`),
    }
  })
}

/**
 * Ignored-area accounting, scoped so a 654k-file ignored set stays reportable.
 *
 * `git ls-files --ignored` over this checkout costs ~5.6s and ~100MB of text,
 * and an attestation needs it twice. Instead the *set* of ignored top-level
 * areas is taken cheaply (`--directory`, which stops at the first ignored
 * directory), the generated ones are recognised by name, and only the rest are
 * walked in full. A run that creates an ignored directory nobody declared
 * therefore shows up as unattributed content — the thing this ordering exists
 * to catch — while `.dsh-types/` regenerating does not make the attestation
 * slow.
 *
 * A generated area is named by **both** its top-level name and its top-level
 * name plus first segment, so a `node_modules` entry covers its contents while
 * a two-segment entry such as `packaging/staging` is matched exactly as
 * written — no sloppy prefix match that would swallow a neighbour.
 */
function readIgnoredSummary(repoRoot, markers = []) {
  const areas = splitNul(
    git(repoRoot, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']),
  )
  const generated = new Set(GENERATED_IGNORED_PREFIXES)
  const summarized = []
  let attributed = 0
  let unattributed = 0
  let unreadable = 0
  const areasByName = new Map()

  for (const area of areas) {
    const stripped = area.replace(/\/+$/u, '')
    const segments = stripped.split('/')
    // A generated area is matched on its top-level name and on its two leading
    // segments, so `node_modules` covers `node_modules/x` while a sloppy prefix
    // match cannot swallow `packages/foo` as "generated".
    if (generated.has(segments[0]) || generated.has(segments.slice(0, 2).join('/'))) {
      summarized.push(`generated\0${stripped}`)
      areasByName.set(stripped, { kind: 'generated', count: 0 })
      attributed += 1
      continue
    }
    if (!area.endsWith('/')) {
      summarized.push(`file\0${stripped}\0${entrySummaryOf(repoRoot, stripped).type}`)
      areasByName.set(stripped, { kind: 'file', count: 1 })
      unattributed += 1
      continue
    }
    // Undeclared ignored directory: walk it. This is the case the attestation
    // exists to catch, so here the cost is the point.
    const walked = walkTree(join(repoRoot, stripped))
    summarized.push(`dir\0${stripped}\0${walked.count}\0${walked.digest}`)
    areasByName.set(stripped, { kind: 'dir', count: walked.count, digest: walked.digest })
    unattributed += walked.count
    unreadable += walked.unreadable
  }

  for (const marker of markers) {
    summarized.push(`transient\0${marker}`)
    areasByName.set(marker, { kind: 'transient-lock', count: 1 })
    attributed += 1
  }

  return {
    areas: areas.length + markers.length,
    attributedAreas: attributed,
    unattributed,
    unreadable,
    transientMarkers: markers,
    // Names are kept, not just the digest: a digest that moved with no name to
    // point at is the "not identical, no differences" report that reads like a
    // tool bug. See `identical()`.
    //
    // A plain object, not a Map: the snapshot contract is JSON-serializable so
    // a caller can persist one and have another process (CI) compare against
    // it. A Map stringifies to `{}` — which is exactly how the first version
    // of the ignored-area diff compared nothing while the digest moved
    // (measured 2026-09-17 against one ignored file at the repo root).
    areaNames: [...areasByName.keys()].sort(),
    areaDetails: Object.fromEntries([...areasByName.entries()].sort()),
    digest: sha256(sortedCopy(summarized).join('\n')),
  }
}

function sortedCopy(values) {
  return [...values].sort()
}

/** Walk an undeclared ignored tree, returning count plus a path/type digest. */
function walkTree(absolute, prefix = '') {
  const lines = []
  let count = 0
  let unreadable = 0
  let names
  try {
    names = readdirSync(absolute).sort()
  } catch {
    return { count: 0, unreadable: 1, digest: sha256(`unreadable\0${absolute}`) }
  }
  for (const name of names) {
    const rel = prefix.length === 0 ? name : `${prefix}/${name}`
    const child = join(absolute, name)
    const stat = statOf(child)
    if (stat === null) {
      lines.push(`${rel}\0missing`)
      unreadable += 1
      continue
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      const nested = walkTree(child, rel)
      lines.push(`${rel}\0dir\0${nested.count}`)
      count += nested.count
      unreadable += nested.unreadable
      continue
    }
    const type = stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : 'other'
    lines.push(`${rel}\0${type}`)
    count += 1
  }
  return { count, unreadable, digest: sha256(lines.join('\n')) }
}

function entrySummaryOf(dir, name) {
  const stat = statOf(join(dir, name))
  if (stat === null) return { name, type: 'missing', mode: '000000' }
  if (stat.isSymbolicLink()) return { name, type: 'symlink', mode: '120000' }
  if (stat.isDirectory()) return { name, type: 'dir', mode: '040000' }
  if (stat.isFile()) return { name, type: 'file', mode: String(stat.mode & 0o777n).padStart(6, '0') }
  return { name, type: 'other', mode: '000000' }
}

/**
 * Depth-1 summation of one declared generated root.
 *
 * Depth 1 is a deliberate choice, not a shortcut: the roots below hold 479k
 * files, and hashing them would make every attestation minutes long while
 * telling us little (their regeneration is the point). A residue *appears* at
 * depth 1 — a new package, a new staging dir, a deleted output — and this
 * module's job is to notice that inside a single run, not to baseline a
 * developer's build.
 */
function readDeclaredRoot(repoRoot, rel) {
  const absolute = join(repoRoot, rel)
  const stat = statOf(absolute)
  if (stat === null) {
    return { path: rel, present: false, childCount: 0, digest: sha256(`absent\0${rel}`) }
  }
  if (!stat.isDirectory()) {
    return {
      path: rel,
      present: true,
      childCount: 1,
      digest: sha256(`nondir\0${rel}\0${stat.mode & 0o777n}`),
    }
  }
  let names
  try {
    names = readdirSync(absolute).sort()
  } catch (error) {
    return {
      path: rel,
      present: true,
      childCount: -1,
      digest: sha256(`unreadable\0${rel}\0${error?.code ?? 'UNKNOWN'}`),
    }
  }
  const children = names.map((name) => {
    const summary = entrySummaryOf(absolute, name)
    return `${summary.name}\0${summary.type}\0${summary.mode}`
  })
  return {
    path: rel,
    present: true,
    childCount: children.length,
    digest: sha256(children.join('\n')),
  }
}

function readGitState(repoRoot) {
  const gitDirRaw = String(git(repoRoot, ['rev-parse', '--absolute-git-dir'])).trim()
  const indexPath = join(gitDirRaw, 'index')
  const indexStat = statOf(indexPath)
  let indexHash = null
  if (indexStat !== null && indexStat.isFile()) {
    try {
      indexHash = sha256(readFileSync(indexPath))
    } catch (error) {
      indexHash = `unreadable:${error?.code ?? 'UNKNOWN'}`
    }
  }
  /**
   * HEAD may legitimately not exist yet (a freshly `git init`ed baseline), and a
   * revision-less repository must still be attestable — otherwise the one case
   * where "there is nothing to compare against" matters most is the one that
   * throws before it can say so. The placeholder is a recorded value, not an
   * error, and it is recorded in the digest like any other field.
   */
  let head = '(no-head)'
  let refName = '(no-ref)'
  try {
    head = String(git(repoRoot, ['rev-parse', 'HEAD'])).trim()
    refName = String(git(repoRoot, ['rev-parse', '--symbolic-full-name', 'HEAD'])).trim()
  } catch { /* unborn HEAD: keep the placeholders */ }
  const refs = splitLines(git(repoRoot, ['for-each-ref', '--format=%(refname) %(objectname)']))
  const ownRefs = []
  const concurrentRefs = []
  for (const ref of refs) {
    const name = ref.split(' ')[0]
    if (CONCURRENT_REF_PREFIXES.some((prefix) => name.startsWith(prefix))) concurrentRefs.push(ref)
    else ownRefs.push(ref)
  }
  return {
    gitDir: gitDirRaw,
    head,
    refName,
    indexHash,
    indexSize: indexStat === null ? null : Number(indexStat.size),
    refsDigest: sha256(ownRefs.join('\n')),
    refCount: ownRefs.length,
    concurrentRefs: Object.fromEntries(concurrentRefs.map((ref) => ref.split(' ')).map(([name, oid]) => [name, oid])),
  }
}

/**
 * Transient marker files under `.git/` (`index.lock`, `HEAD.lock`, …).
 *
 * Recorded separately from the rest of git state because their *presence at the
 * instant of a snapshot* is not evidence of a side effect: git creates them on
 * write and removes them on completion, so a read-only command that runs
 * concurrently can be observed mid-lock (measured 2026-09-17 in the attestation
 * suite, where concurrent gate processes produced a spurious `lock-added`).
 * What *is* a side effect is a marker that **persists** — a killed git leaves
 * its lock behind and blocks the next writer.
 *
 * This is reported as an "ignored area", not a diff kind, on purpose: an
 * ignored area can only add or change, and `identical()` therefore flags a new
 * one as `unexplained` — which is exactly the shape of "we saw something we
 * cannot attribute to a named change". The caller (`attestCommand`) turns that
 * into a pass only after confirming the marker is gone; a marker still there on
 * the second look stays fatal.
 */
function readTransientMarkers(gitDirRaw) {
  try {
    return readdirSync(gitDirRaw).filter((name) => name.endsWith('.lock')).sort().map((name) => `.git/${name}`)
  } catch {
    return []
  }
}

/**
 * Compute the canonical digest over the recorded state.
 *
 * Field-joined with NUL rather than JSON.stringify: the digest must not depend
 * on key ordering, and it must stay stable if a future field is added (a new
 * field joins the record; it does not reshuffle it).
 */
function digestOfRecord({ entries, roots, gitState, ignoredSummary }) {
  const lines = [`${SNAPSHOT_SCHEMA}\0entries\0${entries.length}`]
  for (const entry of entries) lines.push([entry.path, entry.state, entry.mode, entry.digest].join('\0'))
  for (const root of roots) lines.push(['root', root.path, root.present, root.childCount, root.digest].join('\0'))
  lines.push([
    'git',
    gitState.head,
    gitState.refName,
    gitState.indexHash ?? 'no-index',
    gitState.indexSize ?? 'no-size',
    gitState.refsDigest,
  ].join('\0'))
  lines.push(['ignored', ignoredSummary.areas, ignoredSummary.attributedAreas, ignoredSummary.unattributed, ignoredSummary.digest].join('\0'))
  return sha256(lines.join('\n'))
}

/**
 * Expand one declared root into concrete repo-relative directories.
 *
 * Dialect: a trailing `/` is decoration, `*` matches exactly one path segment,
 * and everything else is literal. No `**`, no braces, no negation — an
 * attestation scope that needs a full glob engine is a scope nobody can read.
 */
function expandDeclaredRoot(repoRoot, pattern) {
  const cleaned = pattern.replace(/\/+$/u, '')
  if (cleaned.length === 0) {
    fail('SNAPSHOT_ROOT_ESCAPE', 'declared root 不得为空', { pattern })
  }
  const segments = cleaned.split('/')
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..' || segment.includes('\\')) {
      fail('SNAPSHOT_ROOT_ESCAPE', `declared root 必须是仓库内相对路径：${pattern}`, { pattern })
    }
  }
  if (!segments.includes('*')) return [cleaned]

  let candidates = ['']
  for (const segment of segments) {
    const next = []
    for (const prefix of candidates) {
      const absolute = prefix.length === 0 ? repoRoot : join(repoRoot, prefix)
      const stat = statOf(absolute)
      if (stat === null || !stat.isDirectory()) continue
      if (segment === '*') {
        for (const name of readdirSync(absolute).sort()) {
          const child = statOf(join(absolute, name))
          if (child !== null && child.isDirectory() && !child.isSymbolicLink()) {
            next.push(prefix.length === 0 ? name : `${prefix}/${name}`)
          }
        }
      } else {
        next.push(prefix.length === 0 ? segment : `${prefix}/${segment}`)
      }
    }
    candidates = next
  }
  return candidates
}

/** Resolve the union of default and caller-declared roots into a stable order. */
export function resolveDeclaredRoots(repoRoot, declaredRoots) {
  const patterns = declaredRoots === null
    ? [...DEFAULT_DECLARED_ROOTS]
    : [...DEFAULT_DECLARED_ROOTS, ...(declaredRoots ?? [])]
  const expanded = new Set()
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      fail('SNAPSHOT_ROOT_ESCAPE', `declared root 必须是非空字符串：${String(pattern)}`, { pattern })
    }
    if (isAbsolute(pattern)) {
      fail('SNAPSHOT_ROOT_ESCAPE', `declared root 不得是绝对路径：${pattern}`, { pattern })
    }
    for (const rel of expandDeclaredRoot(repoRoot, pattern)) expanded.add(rel)
  }
  return [...expanded].sort()
}

/**
 * Capture the attestation snapshot.
 *
 * @param {string} repoRoot checkout to attest
 * @param {{declaredRoots?: string[]|null, requireEntries?: boolean}} [options]
 * @returns {object} JSON-serializable snapshot with `digest`
 */
export function snapshotRepo(repoRoot, options = {}) {
  const root = resolveRepoRoot(repoRoot)
  const declaredRoots = resolveDeclaredRoots(root, options.declaredRoots)

  const tracked = readTrackedEntries(root)
  const untracked = readUntrackedEntries(root)
  const entries = [...tracked, ...untracked].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const roots = declaredRoots.map((rel) => readDeclaredRoot(root, rel))
  const gitState = readGitState(root)
  const ignoredSummary = readIgnoredSummary(root, readTransientMarkers(gitState.gitDir))

  const plan = {
    tracked: tracked.length,
    untracked: untracked.length,
    declaredRoots: roots.map((entry) => ({ path: entry.path, childCount: entry.childCount })),
    ignored: {
      areas: ignoredSummary.areas,
      attributedAreas: ignoredSummary.attributedAreas,
      unattributed: ignoredSummary.unattributed,
      unreadable: ignoredSummary.unreadable,
    },
  }
  if (options.requireEntries !== false && entries.length === 0) {
    // Fail closed: an empty射程 and a healthy clean tree look identical in a
    // digest, and only one of them is a real "no side effects".
    fail('SNAPSHOT_EMPTY_SCOPE', '快照射程为空：既没有 tracked 也没有 untracked 条目，无法据此声明零副作用', { root, plan })
  }

  return {
    schema: SNAPSHOT_SCHEMA,
    repoRoot: root,
    capturedAt: new Date().toISOString(),
    plan,
    head: gitState.head,
    refName: gitState.refName,
    entries,
    roots,
    gitState,
    ignoredSummary,
    digest: digestOfRecord({ entries, roots, gitState, ignoredSummary }),
  }
}

/**
 * Compare two snapshots and return the typed delta.
 *
 * `identical: false` is the only failing outcome, and it always carries at
 * least one diff: "not identical for unspecified reasons" would be its own
 * silent failure.
 */
export function identical(before, after, { maxDiffs = 200 } = {}) {
  if (before?.schema !== SNAPSHOT_SCHEMA || after?.schema !== SNAPSHOT_SCHEMA) {
    fail('SNAPSHOT_SCHEMA_MISMATCH', '两个快照必须来自同一 schema', {
      before: before?.schema,
      after: after?.schema,
    })
  }
  const diffs = []
  const push = (kind, path, detail = {}) => {
    if (diffs.length < maxDiffs) diffs.push({ kind, path, ...detail })
  }

  const beforeEntries = new Map(before.entries.map((entry) => [entry.path, entry]))
  const afterEntries = new Map(after.entries.map((entry) => [entry.path, entry]))
  for (const [path, entry] of afterEntries) {
    const previous = beforeEntries.get(path)
    if (previous === undefined) push('entry-added', path, { state: entry.state })
    else if (previous.digest !== entry.digest || previous.mode !== entry.mode) {
      push('entry-changed', path, { from: previous.digest, to: entry.digest })
    }
  }
  for (const path of beforeEntries.keys()) {
    if (!afterEntries.has(path)) push('entry-removed', path, {})
  }

  const beforeRoots = new Map(before.roots.map((entry) => [entry.path, entry]))
  const afterRoots = new Map(after.roots.map((entry) => [entry.path, entry]))
  for (const [path, entry] of afterRoots) {
    const previous = beforeRoots.get(path)
    if (previous === undefined) push('root-added', path, { childCount: entry.childCount })
    else if (previous.digest !== entry.digest) {
      push('root-changed', path, { from: previous.childCount, to: entry.childCount })
    }
  }
  for (const path of beforeRoots.keys()) {
    if (!afterRoots.has(path)) push('root-removed', path, {})
  }

  if (before.head !== after.head) push('head-changed', 'HEAD', { from: before.head, to: after.head })
  if (before.gitState.refsDigest !== after.gitState.refsDigest) {
    push('refs-changed', 'refs', { from: before.gitState.refCount, to: after.gitState.refCount })
  }

  // 外部工具的 ref：如实点名，但**不算作本次运行的副作用**（归因见
  // CONCURRENT_REF_PREFIXES 的注释）。它不出现在 `diffs` 里，因此不影响
  // `identical`；它出现在 `concurrentActivity` 里，调用方能看到「测的这段时间
  // 有人在写」。
  const concurrentActivity = []
  for (const [name, oid] of Object.entries(after.gitState.concurrentRefs ?? {})) {
    const previous = before.gitState.concurrentRefs?.[name]
    if (previous === undefined) concurrentActivity.push({ ref: name, kind: 'added', to: oid })
    else if (previous !== oid) concurrentActivity.push({ ref: name, kind: 'moved', from: previous, to: oid })
  }
  for (const [name, oid] of Object.entries(before.gitState.concurrentRefs ?? {})) {
    if (!(name in (after.gitState.concurrentRefs ?? {}))) concurrentActivity.push({ ref: name, kind: 'removed', from: oid })
  }
  if (before.gitState.indexHash !== after.gitState.indexHash) {
    push('index-changed', '.git/index', { from: before.gitState.indexHash, to: after.gitState.indexHash })
  }

  // Ignored areas are part of the digest, so they must be part of the
  // explanation. Without this branch `identical()` can return `false` with an
  // empty `diffs` — exactly what it does when a run leaves a file that
  // `.gitignore` covers.
  const beforeAreas = before.ignoredSummary?.areaDetails ?? {}
  const afterAreas = after.ignoredSummary?.areaDetails ?? {}
  for (const [path, detail] of Object.entries(afterAreas)) {
    const previous = beforeAreas[path]
    if (previous === undefined) push('ignored-area-added', path, { areaKind: detail.kind, count: detail.count })
    else if (JSON.stringify(previous) !== JSON.stringify(detail)) {
      push('ignored-area-changed', path, { from: previous.count, to: detail.count })
    }
  }
  for (const [path, detail] of Object.entries(beforeAreas)) {
    if (!(path in afterAreas)) push('ignored-area-removed', path, { areaKind: detail.kind })
  }

  // `identical` is a claim about the digest; `diffs` is the explanation. They
  // are computed separately on purpose — a digest that moved while no diff was
  // found means the explanation is incomplete, and that must be reported as
  // such instead of printing "not identical, no differences" (measured
  // 2026-09-17: that exact pair is what a caller sees when the comparator has
  // a hole, and it reads like a tool bug rather than a finding).
  const digestIdentical = before.digest === after.digest
  const unexplained = !digestIdentical && diffs.length === 0
  return {
    schema: SNAPSHOT_SCHEMA,
    identical: digestIdentical && diffs.length === 0,
    beforeDigest: before.digest,
    afterDigest: after.digest,
    diffCount: diffs.length,
    truncated: diffs.length >= maxDiffs,
    unexplained,
    diffs,
    // 外部写入者的活动（只含具名 ref 命名空间）：如实回报，不参与判定。
    concurrentActivity,
    plan: { before: before.plan, after: after.plan },
  }
}

/** Public entry-point shape used by `gate.mjs`; also what `identical` guards. */
export function snapshotContract() {
  return Object.freeze({
    schema: SNAPSHOT_SCHEMA,
    entryStates: ENTRY_STATES,
    diffKinds: DIFF_KINDS,
    declaredRoots: DEFAULT_DECLARED_ROOTS,
    generatedIgnoredPrefixes: GENERATED_IGNORED_PREFIXES,
    concurrentRefPrefixes: CONCURRENT_REF_PREFIXES,
  })
}
