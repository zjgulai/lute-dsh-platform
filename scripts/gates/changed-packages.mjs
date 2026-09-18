/**
 * `changed-packages` 的**射程解析**（QG-005）。
 *
 * ## 为什么需要它
 *
 * 旧实现在 `gate.mjs` 里用三个来源拼改动文件：
 *
 *     git diff --name-only HEAD
 *     git diff --name-only --cached
 *     git diff --name-only main...HEAD
 *
 * 三个缺陷，每一个都只让射程**变小**，而变小的射程与「没改动」长得一模一样：
 *
 *   1. `main...HEAD` 在 main 上就是 `main...main`——**自比较**，恒为空。
 *      2026-09-17 L1 实测（临时仓库）：本地 main 超前 `origin/main` 两个提交、
 *      两个包被改，三条来源合起来仍然是空集。
 *   2. 没有任何来源包含 untracked 文件。新建的包在 `git add` 之前完全隐形。
 *   3. 每个来源各自 `try/catch` 吞掉失败——`main` 引用不存在时静默少一个来源，
 *      读数上看不出少过。
 *
 * 射程缺失不会报错，只会让 `checkChangedPackages` 少看几个包。这正是「仪器假绿」
 * 的形态（P-02）：它不喊疼，它只是不看了。所以本模块的红线是
 * **未知射程一律失败**——绝不退化成 `changedPackages = []`。
 *
 * ## 基线的选择顺序
 *
 *   1. `DSH_GATE_BASE_SHA`（CI 事件提供的 base SHA；QG-007 的 workflow 负责注入）；
 *   2. 当前分支的 upstream（`@{upstream}`）；
 *   3. `origin/main`。
 *
 * 刻意**不**包含本地 `main`：本地 `main` 与 HEAD 常常是同一个对象，落回它就会
 * 重现自比较。远端跟踪引用被 force-push 覆盖后 `merge-base` 会失败，那时判红而
 * 不是返回空集。
 *
 * @module
 */
import { execFileSync } from 'node:child_process'

/** 改动分析的四类来源，报告里必须分别列账。 */
export const CHANGE_SOURCES = Object.freeze(['committed', 'staged', 'unstaged', 'untracked'])

/** CI 事件基线的环境变量名。 */
export const BASE_SHA_ENV = 'DSH_GATE_BASE_SHA'

/** 本地回退基线。只认远端跟踪引用，理由见模块注释。 */
export const LOCAL_BASE_REF = 'origin/main'

/**
 * 根治理文件规则：仓库根级路径（不属于任何受管包）→ 已命名的后果。
 *
 * `expandAllPackages` 为真表示该文件一改，**每个**受管包的输入都可能变了
 * （工作区级依赖图），因此变更包门槛必须覆盖全部包，而不是零个。
 *
 * 刻意只登记**当前仓库里真实存在、且真的会被 git 报出来**的文件：
 *   - 登记一条永远匹配不到的规则，就是造一个永远跑不到、也永远不会被发现
 *     已经坏掉的仪器（P-24 的邻居形态）；
 *   - `pnpm-lock.yaml` **刻意不在表内**：本仓库的 `.gitignore` 是白名单式
 *     （第 14 行 `*` 起手），该文件被忽略，因此永远不出现在 `git diff` /
 *     `git status` 里 —— 为它登记规则等于登记一条死规则。工作区依赖图这一
 *     后果由根 `package.json` 承担。
 *   - `pnpm-workspace.yaml` 同样不在表内：仓库里没有这个文件。
 *
 * 匹配按**最长（最具体）**优先，与声明顺序无关：否则 `scripts/gates/` 前缀
 * 会把它下面的精确条目全部吃掉，被吃掉的那条就成了影子规则。
 */
export const ROOT_GOVERNANCE_RULES = Object.freeze([
  { path: 'package.json', rule: 'workspace-dependency-graph', expandAllPackages: true },
  { path: 'scripts/gate.mjs', rule: 'gate-instrument', expandAllPackages: false },
  { prefix: 'scripts/gates/', rule: 'gate-instrument', expandAllPackages: false },
  { path: 'scripts/gates/exemptions.json', rule: 'exemption-registry', expandAllPackages: false },
  { path: 'docs/architecture.md', rule: 'architecture-contract', expandAllPackages: false },
  { path: 'docs/pitfalls-playbook.md', rule: 'pitfall-registry', expandAllPackages: false },
  { prefix: 'docs/adr/', rule: 'adr-registry', expandAllPackages: false },
  { path: 'AGENTS.md', rule: 'agent-rules', expandAllPackages: false },
  { prefix: 'packaging/', rule: 'release-packaging', expandAllPackages: false },
])

/** 在子进程边界执行 git，并把失败**作为返回值**而不是抛出去的异常。 */
export function createGitRunner({ cwd, env = process.env } = {}) {
  return function git(args) {
    try {
      const stdout = execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        maxBuffer: 32 * 1024 * 1024,
      })
      return { ok: true, stdout, status: 0, stderr: '' }
    } catch (error) {
      return {
        ok: false,
        stdout: typeof error?.stdout === 'string' ? error.stdout : '',
        status: typeof error?.status === 'number' ? error.status : null,
        stderr: String(error?.stderr ?? error?.message ?? error),
      }
    }
  }
}

/** 取错误输出的第一行作为可读原因（完整 stderr 常常是一整段 usage）。 */
function firstLine(text) {
  return String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean)[0] ?? '无输出'
}

/**
 * 解析改动基线。
 *
 * @param {{git: (args: string[]) => {ok: boolean, stdout: string, stderr: string}, env?: NodeJS.ProcessEnv}} input
 * @returns {{ok: true, sha: string, source: string, ref: string} | {ok: false, reason: string}}
 */
export function resolveBase({ git, env = process.env }) {
  const explicit = String(env?.[BASE_SHA_ENV] ?? '').trim()
  if (explicit !== '') {
    const object = git(['cat-file', '-e', `${explicit}^{commit}`])
    if (!object.ok) {
      return {
        ok: false,
        reason: `${BASE_SHA_ENV}=${explicit} 在本仓库不是可达的 commit（${firstLine(object.stderr)}）——`
          + 'CI 必须先把事件基线 fetch 下来；shallow clone 缺该对象时不能假装射程为空',
      }
    }
    const merged = git(['merge-base', 'HEAD', explicit])
    if (!merged.ok || merged.stdout.trim() === '') {
      return {
        ok: false,
        reason: `${BASE_SHA_ENV}=${explicit} 与 HEAD 算不出 merge-base（${firstLine(merged.stderr)}）——`
          + '历史可能被 shallow 截断，无法证明改动范围',
      }
    }
    const sha = merged.stdout.trim()
    if (sha !== explicit) {
      return {
        ok: false,
        reason: `${BASE_SHA_ENV}=${explicit} 不是 HEAD 的 merge-base（真实 merge-base 是 ${sha}）——`
          + '事件基线与本仓库历史不一致，不能拿它当改动起点',
      }
    }
    return { ok: true, sha, source: 'event-base-sha', ref: BASE_SHA_ENV }
  }

  const candidates = []
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  if (upstream.ok && upstream.stdout.trim() !== '') {
    candidates.push({ ref: upstream.stdout.trim(), source: 'upstream' })
  }
  candidates.push({ ref: LOCAL_BASE_REF, source: 'remote-tracking' })

  const failures = []
  for (const candidate of candidates) {
    const merged = git(['merge-base', 'HEAD', candidate.ref])
    if (merged.ok && merged.stdout.trim() !== '') {
      return { ok: true, sha: merged.stdout.trim(), source: candidate.source, ref: candidate.ref }
    }
    failures.push(`${candidate.ref}: ${firstLine(merged.stderr)}`)
  }

  const shallow = git(['rev-parse', '--is-shallow-repository'])
  const shallowTail = shallow.ok && shallow.stdout.trim() === 'true'
    ? '；本仓库是 shallow clone，历史不足以算出 merge-base'
    : ''
  return {
    ok: false,
    reason: `无法解析改动基线（${failures.join('；')}）${shallowTail}——`
      + `未知射程不得退化成空集；CI 请设置 ${BASE_SHA_ENV}，本地请确认 ${LOCAL_BASE_REF} 已 fetch`,
  }
}

/**
 * 解析 `git --name-status -z` 的输出。
 *
 * `-z` 下重命名/复制占三个字段（`R###\0旧\0新\0`），其余占两个（`M\0路径\0`）。
 * 重命名必须**同时**保留旧路径与新路径：只取新路径会漏掉「包被改名」这种
 * 让旧包凭空消失的改动。
 *
 * 空字符串要当成**缺字段**：`'R086\0only-one\0'` 切出来是
 * `['R086','only-one','']`，把末尾那个空串当合法目标路径就会产出半个条目，
 * 而半个条目在射程里既不算命中也不算报错。
 *
 * @param {string} raw
 * @returns {{entries: Array<{status: string, from: string, to: string}>, malformed: string|null}}
 */
export function parseNameStatus(raw) {
  const parts = String(raw ?? '').split('\0')
  const entries = []
  let index = 0
  while (index < parts.length) {
    const status = parts[index]
    if (status === '') {
      index += 1
      continue
    }
    const code = status[0]
    if (code === 'R' || code === 'C') {
      const from = parts[index + 1]
      const to = parts[index + 2]
      if (!from || !to) return { entries, malformed: `重命名条目字段不足：${JSON.stringify(status)}` }
      entries.push({ status: code, from, to })
      index += 3
    } else {
      const path = parts[index + 1]
      if (!path) return { entries, malformed: `条目字段不足：${JSON.stringify(status)}` }
      entries.push({ status: code, from: path, to: path })
      index += 2
    }
  }
  return { entries, malformed: null }
}

/**
 * 收集四类来源的改动。
 *
 * 每一类单独列账，任何一类取不到都进 `problems` 而不是被吞掉；调用方必须把
 * `problems` 变成判红。
 *
 * @param {{git: (args: string[]) => {ok: boolean, stdout: string, stderr: string}, base: string}} input
 * @returns {{buckets: Record<string, Array<{status: string, from: string, to: string}>>, problems: string[]}}
 */
export function collectWorktreeChanges({ git, base }) {
  const buckets = Object.fromEntries(CHANGE_SOURCES.map((name) => [name, []]))
  const problems = []

  const readStatus = (name, args) => {
    const result = git(args)
    if (!result.ok) {
      problems.push(`${name} 来源取不到：${firstLine(result.stderr)}`)
      return
    }
    const { entries, malformed } = parseNameStatus(result.stdout)
    if (malformed !== null) {
      problems.push(`${name} 来源解析失败：${malformed}`)
      return
    }
    buckets[name] = entries
  }

  readStatus('committed', ['diff', '--name-status', '-M', '-z', `${base}..HEAD`])
  readStatus('staged', ['diff', '--cached', '--name-status', '-M', '-z', 'HEAD'])
  readStatus('unstaged', ['diff', '--name-status', '-M', '-z'])

  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
  if (!untracked.ok) {
    problems.push(`untracked 来源取不到：${firstLine(untracked.stderr)}`)
  } else {
    buckets.untracked = untracked.stdout
      .split('\0')
      .filter((path) => path !== '')
      .map((path) => ({ status: '?', from: path, to: path }))
  }

  return { buckets, problems }
}

/**
 * 把一个路径归到它所属的受管包。
 *
 * 只在**路径分段边界**上匹配：`packages/a/b` 属于 `packages/a`，`packages/a/bc`
 * 不属于。字符串前缀匹配会让同级同前缀的包互相冒领改动。
 *
 * @param {string} path 仓库相对路径
 * @param {string[]} packageDirs 受管包目录（已按长度降序，保证取最具体的那个）
 * @returns {string|null}
 */
export function ownerOf(path, packageDirs) {
  for (const dir of packageDirs) {
    if (path === dir || path.startsWith(`${dir}/`)) return dir
  }
  return null
}

/**
 * 把根级路径归到已登记的治理规则，**最具体者胜**（长路径 > 短前缀）。
 *
 * 按声明顺序取第一个命中会让 `scripts/gates/` 前缀把
 * `scripts/gates/exemptions.json` 整条吃掉——被吃掉的那条从此永远不会触发，
 * 而它在表里看起来完全正常。顺序不该是判据的一部分。
 * @param {string} path
 * @returns {typeof ROOT_GOVERNANCE_RULES[number]|null}
 */
export function ruleOf(path) {
  let best = null
  let bestScore = -1
  for (const entry of ROOT_GOVERNANCE_RULES) {
    const pattern = entry.path ?? entry.prefix
    if (pattern === undefined) continue
    const matched = entry.path !== undefined ? path === entry.path : path.startsWith(entry.prefix)
    if (matched && pattern.length > bestScore) {
      best = entry
      bestScore = pattern.length
    }
  }
  return best
}

/**
 * 解析本次改动的完整射程。
 *
 * @param {{git: (args: string[]) => object, env?: NodeJS.ProcessEnv, packages: Array<{relPath: string, dir?: string}>}} input
 * @returns {{
 *   ok: boolean,
 *   reason: string,
 *   base: {sha: string, source: string, ref: string}|null,
 *   sources: Record<string, string[]>,
 *   renames: Array<{from: string, to: string}>,
 *   packages: string[],
 *   directPackages?: string[],
 *   rules: string[],
 *   otherRootPaths: string[],
 *   expandAllPackages: boolean,
 *   allPackages: string[],
 * }}
 */
export function resolveChangedScope({ git, env = process.env, packages }) {
  const packageDirs = packages
    .map((entry) => entry.relPath ?? entry.dir)
    .filter((dir) => typeof dir === 'string' && dir !== '' && dir !== '.')
    .sort((a, b) => b.length - a.length)

  const base = resolveBase({ git, env })
  const empty = {
    ok: false,
    reason: base.ok ? '' : base.reason,
    base: base.ok ? base : null,
    sources: Object.fromEntries(CHANGE_SOURCES.map((name) => [name, []])),
    renames: [],
    packages: [],
    rules: [],
    otherRootPaths: [],
    expandAllPackages: false,
    allPackages: packageDirs.slice().sort(),
  }
  if (!base.ok) return empty

  const { buckets, problems } = collectWorktreeChanges({ git, base: base.sha })
  if (problems.length > 0) {
    return { ...empty, base, reason: `改动来源不完整，射程未知：${problems.join('；')}` }
  }

  const sources = Object.fromEntries(CHANGE_SOURCES.map((name) => [name, []]))
  const hit = new Set()
  const rootPaths = new Set()
  const rules = new Set()
  let expandAllPackages = false
  const renames = []

  for (const name of CHANGE_SOURCES) {
    for (const entry of buckets[name]) {
      if (entry.status === 'R' || entry.status === 'C') renames.push({ from: entry.from, to: entry.to })
      for (const path of new Set([entry.from, entry.to])) {
        if (path === undefined || path === '') continue
        sources[name].push(path)
        const owner = ownerOf(path, packageDirs)
        if (owner !== null) {
          hit.add(owner)
          continue
        }
        rootPaths.add(path)
        const rule = ruleOf(path)
        if (rule !== null) {
          rules.add(rule.rule)
          if (rule.expandAllPackages) expandAllPackages = true
        }
      }
    }
  }

  const scope = [...hit].sort()
  return {
    ok: true,
    reason: '',
    base,
    sources: Object.fromEntries(CHANGE_SOURCES.map((name) => [name, [...new Set(sources[name])].sort()])),
    renames,
    packages: expandAllPackages ? packageDirs.slice().sort() : scope,
    directPackages: scope,
    rules: [...rules].sort(),
    otherRootPaths: [...rootPaths].sort(),
    expandAllPackages,
    allPackages: packageDirs.slice().sort(),
  }
}
