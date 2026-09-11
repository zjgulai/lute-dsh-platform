#!/usr/bin/env node
/**
 * LUTE 门禁入口。退出码即契约（ADR-0014）：
 *   0 = 全部校验通过
 *   1 = 存在失败校验
 *   2 = 用法错误
 *
 * 用法：node scripts/gate.mjs [--mode quick|full] [--list]
 *   quick（默认）提交前使用；full 推送前使用（含变更包 typecheck/test，二期接入 git 钩子后启用）。
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkAdrIndex,
  checkAdrNoteLinks,
  checkCatalogFresh,
  checkChangedPackages,
  checkDependencyLinks,
  checkExemptions,
  checkGitignoreWhitelist,
  checkNestedRepositories,
  checkPackageIdentity,
  checkPinConsistency,
  checkScriptsRunnable,
  checkTrackedIgnored,
} from './gates/checks.mjs'
import { checkProfileFilesSync, checkProfileMetadata } from './gates/sync-profile.mjs'
import { collectPackages } from './gates/package-collect.mjs'
import { renderCatalog } from './gen-catalog.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODES = ['quick', 'full']

/** 不参与包身份校验的目录（无 package.json 或属外部依赖）。 */
const SCAN_SKIP = new Set(['node_modules', 'vendor', '.git', 'packaging', 'docs', '.scratch'])

/** 校验项注册表：新增校验在此登记，name 会出现在 --list 输出中。 */
const CHECKS = [
  {
    name: 'package-identity',
    remediation: '在每个受管 package.json 补 luteOrigin / luteOwner / lutePublish（ADR-0012）',
    run() {
      return checkPackageIdentity(repoRoot, collectManifests())
    },
  },
  {
    name: 'pin-consistency',
    remediation: '更新 vendor/dsh-desktop.pin 的 harness-submodule 为实际 HEAD（ADR-0008）',
    run() {
      return checkPinConsistency({
        pinText: readIfExists(join(repoRoot, 'vendor', 'dsh-desktop.pin')),
        submoduleSha: submoduleHead() ?? '<未初始化>',
      })
    },
  },
  {
    name: 'gitignore-whitelist',
    remediation: '删除 .gitignore 中指向不存在路径的白名单条目（ADR-0013）',
    run() {
      return checkGitignoreWhitelist({
        gitignoreText: readIfExists(join(repoRoot, '.gitignore')),
        exists: (path) => existsSync(join(repoRoot, path)),
      })
    },
  },
  {
    name: 'adr-index',
    remediation: '修正 docs/adr/README.md 索引与 docs/adr/ADR-NNNN.md 文件的一致性（ADR-0015）',
    run() {
      return checkAdrIndex({
        adrFiles: listAdrFiles(),
        indexText: readIfExists(join(repoRoot, 'docs', 'adr', 'README.md')),
      })
    },
  },
  {
    name: 'adr-note-links',
    remediation: '修正 ADR 的「决策记录」链接或在其 Note 正文回引 ADR 编号（ADR-0015）',
    run() {
      return checkAdrNoteLinks({
        adrDocs: listAdrFiles().map((path) => ({ path, text: readIfExists(join(repoRoot, path)) })),
        // 逐篇读该 ADR 自己指向的那篇 Note（不再写死单一路径）。
        readNote: (path) => readIfExists(join(repoRoot, path)),
        exists: (path) => existsSync(join(repoRoot, path)),
      })
    },
  },
  {
    name: 'catalog-fresh',
    remediation: '运行 node scripts/gen-catalog.mjs 重新生成目录墙（ADR-0011）',
    run() {
      const target = 'docs/catalog/packages.md'
      const current = readIfExists(join(repoRoot, target))
      if (current === '') return { passed: true, violations: [] }
      return checkCatalogFresh({
        current,
        regenerated: renderCatalog({ packages: collectManifests() }),
      })
    },
  },
  {
    name: 'dependency-links',
    remediation: '修复断链：重新安装该包依赖，或把链接目标改为绝对路径（ADR-0016）',
    run() {
      return checkDependencyLinks({ links: collectDependencyLinks() })
    },
  },
  {
    name: 'nested-repos',
    remediation: '把嵌套仓库纳入 .gitmodules 声明，或折叠为普通目录（ADR-0016）',
    run() {
      const nested = []
      for (const entry of collectManifests()) {
        if (entry.dir === '.') continue
        if (existsSync(join(repoRoot, entry.dir, '.git'))) nested.push(entry.dir)
      }
      const gitmodules = readIfExists(join(repoRoot, '.gitmodules'))
      const declared = [...gitmodules.matchAll(/^\s*path\s*=\s*(.+)$/gm)].map((m) => m[1].trim())
      return checkNestedRepositories({ nestedRepos: nested, declaredSubmodules: declared })
    },
  },
  {
    name: 'index-drift',
    remediation: '结清漂移：git rm --cached 已不在磁盘的条目，或把受管归档纳入 .gitignore 白名单（ADR-0013）',
    run() {
      const output = execFileSync('git', ['-C', repoRoot, 'ls-files', '--cached', '--ignored', '--exclude-standard'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return checkTrackedIgnored({ trackedIgnored: output.split('\n').filter(Boolean) })
    },
  },
  {
    name: 'profile-metadata-sync',
    remediation: '运行 node scripts/sync-profile.mjs --apply --only-metadata 同步 live profile 副本的 package.json',
    run() {
      const profileVendor = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop', 'vendor')
      if (!existsSync(profileVendor)) return { passed: true, violations: [] }
      return checkProfileMetadata(
        collectManifests()
          .filter((entry) => entry.dir !== '.')
          .map((entry) => ({
            name: entry.dir,
            sourceDir: join(repoRoot, entry.dir),
            targetDir: join(profileVendor, entry.dir.split('/').pop()),
          })),
      )
    },
  },
  {
    name: 'profile-files-sync',
    remediation: '按 package.json 的 files 清单修正：陈旧条目从 files 中删除；真缺件用 tmp+mv 语义补齐 profile 副本（勿直接覆盖）',
    run() {
      const profile = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
      // 盯 node_modules：`file:` 依赖是硬链接实体副本，且这是 DSH 真实装载点
      // （2026-09-11 实测报错路径即 profiles/desktop/node_modules/dsh-preset-lint-local/lib/...）。
      // vendor/ 是另一份命名不同的副本，两份都缺 linter——本项只对装载点断言。
      const target = join(profile, 'node_modules')
      if (!existsSync(target)) return { passed: true, violations: [] }
      const packages = new Map(collectManifests().filter((entry) => entry.dir !== '.').map((entry) => [entry.dir.split('/').pop(), entry]))
      const pairs = []
      for (const [name, spec] of Object.entries(installedProfileDependencies(profile))) {
        if (!spec.startsWith('file:')) continue
        const sourceDir = spec.slice('file:'.length)
        if (!existsSync(join(sourceDir, 'package.json'))) continue
        const entry = packages.get(sourceDir.split('/').pop())
        pairs.push({
          name,
          sourceDir,
          targetDir: join(target, name),
          files: entry?.manifest.files ?? [],
        })
      }
      return checkProfileFilesSync(pairs)
    },
  },
  {
    name: 'scripts-runnable',
    modes: ['full'],
    remediation: '补齐脚本依赖（如 devDependencies 加 typescript）或修复脚本本体，使其退出码为 0（ADR-0014）',
    run() {
      const exempted = new Set(JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]').map((row) => row.package))
      const packages = runPackageScripts().filter((entry) => !exempted.has(entry.relPath))
      return checkScriptsRunnable({ packages })
    },
  },
  {
    name: 'changed-packages',
    remediation: '为本次改动的包补 typecheck 与 test 脚本，或按 ADR-0014 登记豁免（只减不增）',
    run() {
      const manifests = collectManifests().filter((entry) => entry.dir !== '.')
      const exempted = JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]').map((row) => row.package)
      return checkChangedPackages({
        changed: changedPackages(manifests),
        packages: manifests,
        exempted,
      })
    },
  },
  {
    name: 'exemptions-frozen',
    remediation: '不得新增豁免条目；补齐后请删除条目，期限不可延后（ADR-0014）',
    run() {
      const baselineExists = baselineExemptionsExist()
      return checkExemptions({
        exemptions: JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]'),
        baseline: baselineExists ? readBaselineExemptions() : [],
        today: new Date().toISOString().slice(0, 10),
        baselineExists,
      })
    },
  },
  {
    name: 'patch-anchors',
    modes: ['full'],
    remediation: '运行 packaging/verify-patches-v2.sh 看 MISSING/FAIL 明细；补丁确实丢失时需重打并按 ADR-0018 的教训改用稳定锚（勿依赖内容哈希文件名）',
    run() {
      const appDir = join('/', 'Applications', 'DSH Desktop.app')
      // 环境相关：未安装 app 时报告为跳过（对照 profile-metadata-sync 的 pass 语义），
      // 而不是假绿——真正跑起来时它必须能失败（已有负向验证）。
      if (!existsSync(join(appDir, 'Contents', 'Resources', 'app.asar.unpacked'))) {
        return { passed: true, violations: [] }
      }
      const script = join(repoRoot, 'packaging', 'verify-patches-v2.sh')
      const result = runScript(repoRoot, `DSH_APP="$DSH_APP_TEST" bash "${script}"`, 300000, { DSH_APP_TEST: appDir })
      if (result.code === 0) return { passed: true, violations: [] }
      const lines = (result.output ?? '').split('\n').filter((line) => /^(MISSING|FAIL)/.test(line))
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`补丁锚点校验失败（退出码 ${result.code}）`],
      }
    },
  },
]

/** 豁免登记文件（仓库根相对路径）。 */
const EXEMPTIONS_PATH = 'scripts/gates/exemptions.json'

/**
 * 收集受管包 node_modules 顶层作用域内的符号链接及其可达性。
 * @returns {Array<{from: string, target: string, exists: boolean}>}
 */
function collectDependencyLinks() {
  const links = []
  for (const entry of collectManifests()) {
    if (entry.dir === '.') continue
    const modulesDir = join(repoRoot, entry.dir, 'node_modules')
    if (!existsSync(modulesDir)) continue
    for (const scope of readdirSync(modulesDir)) {
      if (!scope.startsWith('@')) continue
      const scopeDir = join(modulesDir, scope)
      if (!statSync(scopeDir).isDirectory()) continue
      for (const pkg of readdirSync(scopeDir)) {
        const linkPath = join(scopeDir, pkg)
        if (!lstatSync(linkPath).isSymbolicLink()) continue
        const target = readlinkSync(linkPath)
        links.push({
          from: `${entry.dir}/node_modules/${scope}/${pkg}`,
          target,
          exists: existsSync(linkPath),
        })
      }
    }
  }
  return links
}

/**
 * 逐个运行受管包声明的 typecheck 与 test 脚本，收集真实退出码。
 * 只用于 full 模式：逐包执行耗时较长，且需要各包 node_modules 已安装。
 * @returns {Array<{relPath: string, scripts: Record<string, string>, results: Record<string, {code: number, output: string}>}>}
 */
function runPackageScripts() {
  const timeoutMs = 180000
  return collectManifests()
    .filter((entry) => entry.dir !== '.')
    .map((entry) => {
      const scripts = entry.manifest.scripts ?? {}
      const results = {}
      for (const key of ['typecheck', 'test', 'build']) {
        if (!scripts[key]) continue
        results[key] = runScript(join(repoRoot, entry.dir), scripts[key], timeoutMs)
      }
      return { relPath: entry.dir, scripts, results }
    })
    .filter((entry) => Object.keys(entry.results).length > 0)
}

/**
 * 运行一个包脚本并返回退出码与输出尾部。
 * @param {string} cwd 包目录
 * @param {string} script 脚本命令
 * @param {number} timeoutMs 超时毫秒
 * @returns {{code: number, output: string}} 超时按 124 记（与 coreutils timeout 一致）
 */
/**
 * 保留的输出尾部长度。实测校准（2026-09-11）：patch-anchors 依赖的
 * verify-patches-v2.sh 会打印 35 行锚点结果（约 1 KB），而 FAIL/MISSING 明细
 * 出现在输出**开头**——原先的 500 字符只留到 OK 行与汇总，导致门禁只能报
 * 「退出码 1」而指不出漂移项。4000 足以容纳该脚本全部输出，仍远小于异常堆栈。
 */
const SCRIPT_OUTPUT_TAIL = 4000

function runScript(cwd, script, timeoutMs, extraEnv = {}) {
  const binDir = join(cwd, 'node_modules', '.bin')
  const env = { ...process.env, ...extraEnv, PATH: `${binDir}:${process.env.PATH ?? ''}` }
  try {
    const output = execFileSync('sh', ['-c', script], { cwd, env, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, output: String(output).slice(-SCRIPT_OUTPUT_TAIL) }
  } catch (error) {
    if (error.killed) return { code: 124, output: `超时 ${timeoutMs}ms` }
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.slice(-SCRIPT_OUTPUT_TAIL)
    return { code: typeof error.status === 'number' ? error.status : 1, output }
  }
}

/**
 * 找出本次改动涉及的受管包（未提交改动 ∪ 与 main 的差异）。
 * @param {Array<{dir: string}>} manifests 受管包清单
 * @returns {string[]} 包相对路径
 */
function changedPackages(manifests) {
  const files = new Set()
  for (const args of [
    ['diff', '--name-only', 'HEAD'],
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only', 'main...HEAD'],
  ]) {
    try {
      const out = execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      for (const line of out.split('\n')) if (line) files.add(line)
    } catch {
      // main 不存在或仓库无该引用时忽略该来源
    }
  }
  const changed = new Set()
  for (const entry of manifests) {
    const prefix = `${entry.dir}/`
    if ([...files].some((file) => file === entry.dir || file.startsWith(prefix))) changed.add(entry.dir)
  }
  return [...changed]
}

/**
 * 判断豁免登记文件是否已存在于 git HEAD（未入库即处于初始登记引导期）。
 * @returns {boolean}
 */
function baselineExemptionsExist() {
  try {
    execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', `HEAD:${EXEMPTIONS_PATH}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * 从 git HEAD 读取豁免登记基线；文件尚未入库或仓库尚无提交时返回空数组。
 * @returns {Array<Record<string, unknown>>}
 */
function readBaselineExemptions() {
  try {
    const text = execFileSync('git', ['-C', repoRoot, 'show', `HEAD:${EXEMPTIONS_PATH}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(text)
  } catch {
    return []
  }
}

/** 列出 docs/adr 下的 ADR 文件（仓库根相对路径）。 */
function listAdrFiles() {
  const dir = join(repoRoot, 'docs', 'adr')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^ADR-\d{4}\.md$/.test(name))
    .sort()
    .map((name) => `docs/adr/${name}`)
}

/**
 * 收集仓库根与全部受管包的清单（根包自身也受身份契约约束）。
 * 与目录墙生成器共用 collectPackages，避免两侧包集合分叉。
 * @returns {Array<{dir: string, manifest: Record<string, unknown>}>}
 */
function collectManifests() {
  const { rootManifest, packages } = collectPackages(repoRoot)
  return [
    { relPath: '.', dir: '.', manifest: rootManifest },
    ...packages.map((entry) => ({
      relPath: entry.relPath,
      dir: entry.relPath,
      group: entry.group,
      manifest: entry.manifest,
    })),
  ]
}

/** 读取子模块实际 HEAD；未初始化或不可读时返回 undefined。 */
function submoduleHead() {
  const path = join(repoRoot, 'vendor', 'dsh-desktop', 'deepseek-harness')
  try {
    return execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

/**
 * 读取 live profile 的已安装依赖表（package.json 的 dependencies）。
 * 返回空对象表示该 profile 未安装或不可读——调用方据此跳过校验。
 */
function installedProfileDependencies(profileDir) {
  const manifest = join(profileDir, 'package.json')
  if (!existsSync(manifest)) return {}
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {}
  } catch {
    return {}
  }
}

function parseArgs(argv) {
  let mode = 'quick'
  let list = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--list') list = true
    else if (argv[i] === '--mode') {
      mode = argv[i + 1]
      i += 1
    } else {
      return { error: `未知参数：${argv[i]}` }
    }
  }
  if (!MODES.includes(mode)) return { error: `未知模式：${mode}（可用：${MODES.join(' / ')}）` }
  return { mode, list }
}

/**
 * 某包入库的 lib/types 文件清单。
 * @param {string} dir 包相对路径
 * @returns {string[]}
 */
function trackedTypeFiles(dir) {
  const output = execFileSync('git', ['-C', repoRoot, 'ls-files', `${dir}/lib/types`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return output.split('\n').filter(Boolean)
}

/** 程序入口：解析参数、跑校验、按失败数设置退出码。 */
function main() {
  const { mode, list, error } = parseArgs(process.argv.slice(2))
  if (error) {
    process.stderr.write(`${error}\n`)
    process.exitCode = 2
    return
  }
  if (list) {
    process.stdout.write(`${CHECKS.map((check) => check.name).join('\n')}\n`)
    return
  }

  const active = CHECKS.filter((check) => !check.modes || check.modes.includes(mode))
  let failed = 0
  for (const check of active) {
    const result = check.run()
    if (result.passed) {
      process.stdout.write(`ok   contract ${check.name}\n`)
      continue
    }
    failed += 1
    process.stdout.write(`fail contract ${check.name}\n`)
    for (const violation of result.violations) process.stdout.write(`     - ${violation}\n`)
    process.stdout.write(`     → ${check.remediation}\n`)
  }

  const passed = active.length - failed
  process.stdout.write(
    failed === 0
      ? `ok ${passed}/${active.length} 项通过（mode=${mode}）\n`
      : `fail ${passed}/${active.length} 项通过（mode=${mode}）\n`,
  )
  process.exitCode = failed === 0 ? 0 : 1
}

main()
