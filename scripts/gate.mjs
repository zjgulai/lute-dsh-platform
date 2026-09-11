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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkAdrIndex,
  checkAdrNoteLinks,
  checkCatalogFresh,
  checkChangedPackages,
  checkExemptions,
  checkGitignoreWhitelist,
  checkNestedRepositories,
  checkPackageIdentity,
  checkPinConsistency,
  checkTrackedIgnored,
} from './gates/checks.mjs'
import { checkProfileMetadata } from './gates/sync-profile.mjs'
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
        notePath: NOTE_PATH,
        noteText: readIfExists(join(repoRoot, NOTE_PATH)),
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
]

/** 当前重构决策记录 Note 的仓库根相对路径（ADR-0007 ~ ADR-0015）。 */
const NOTE_PATH = 'docs/notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md'

/** 豁免登记文件（仓库根相对路径）。 */
const EXEMPTIONS_PATH = 'scripts/gates/exemptions.json'

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

  let failed = 0
  for (const check of CHECKS) {
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

  const passed = CHECKS.length - failed
  process.stdout.write(
    failed === 0
      ? `ok ${passed}/${CHECKS.length} 项通过（mode=${mode}）\n`
      : `fail ${passed}/${CHECKS.length} 项通过（mode=${mode}）\n`,
  )
  process.exitCode = failed === 0 ? 0 : 1
}

main()
