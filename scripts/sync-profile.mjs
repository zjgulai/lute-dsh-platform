#!/usr/bin/env node
/**
 * 同步 profile 副本与仓库源（架构红线 4：一律 tmp+mv 原子替换）。
 *
 * 用法：
 *   node scripts/sync-profile.mjs --check                 # 只报告漂移，不写盘（默认）
 *   node scripts/sync-profile.mjs --apply                 # 同步全部内容不同的文件
 *   node scripts/sync-profile.mjs --apply --only-metadata # 只同步 package.json（构建产物由各自构建脚本产出）
 *   node scripts/sync-profile.mjs --check  --loadpoint    # 只查**装载点**的运行时产物
 *   node scripts/sync-profile.mjs --apply  --loadpoint    # 把装载点的运行时产物补齐——让改动真正生效的那一步
 *   node scripts/sync-profile.mjs --check --profile <目录> # 指定其他 profile
 *
 * 两个目标目录**不是一回事**，混用会得到「同步过了但功能还是旧的」：
 *   - `--loadpoint`：`<profile>/node_modules/<dep>`，DSH 的**真实装载点**（profile 的
 *     package.json 就是包解析锚点，见 lib/profile-*.js 的 resolveOverlayPackage）。
 *     应用执行的正是这里的字节。
 *   - 默认（`<profile>/vendor/`）：内嵌 profile 拷贝物化出来的另一份副本，**不是装载点**。
 *     它只在元数据意义上被门禁看着，别拿它当「改动已生效」的证据。
 *
 * 语义：只替换副本中已存在的文件；副本独有文件（构建产物、备份）一律不追加、不删除。
 * 退出码：0 = 已一致或同步成功；1 = 存在漂移（--check 模式）；2 = 用法错误。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySync, cleanTemps, loadPointFiles, planSync } from './gates/sync-profile.mjs'
import { discoverPackages } from './gates/package-layout.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 仓库内受管插件目录相对路径。归组后包位于 packages/<组>/<包>，
 * 一律通过 discoverPackages 定位，杜绝位置硬编码（曾因硬编码扫不到任何包而谎报一致）。
 * @returns {Array<{relPath: string, dirName: string}>} 仓库根相对路径
 */
function managedPackages() {
  return discoverPackages(repoRoot).map((entry) => ({ relPath: entry.relPath, dirName: entry.dirName }))
}

/** 递归收集相对文件路径，跳过 node_modules 与构建产物目录。 */
function listFiles(root, rel = '', out = []) {
  const dir = join(root, rel)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const child = rel === '' ? entry.name : `${rel}/${entry.name}`
    if (entry.isDirectory()) listFiles(root, child, out)
    else out.push(child)
  }
  return out
}

/** 读取 profile 的已安装依赖表；不可读时按空表处理（视为未安装）。 */
function installedDependencies(profile) {
  const manifest = join(profile, 'package.json')
  if (!existsSync(manifest)) return {}
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {}
  } catch {
    return {}
  }
}

/**
 * 构造**默认（vendor/）**目标清单：条目与仓库逐文件对应，副本独有文件不追加。
 * @param {string} vendorDir profile 的 vendor 目录
 * @returns {Array<{name: string, sourceDir: string, targetDir: string, files: string[]}>}
 */
function vendorPairs(vendorDir) {
  const pairs = []
  for (const { relPath, dirName } of managedPackages()) {
    const target = join(vendorDir, dirName)
    if (!existsSync(target)) continue
    const sourceDir = join(repoRoot, relPath)
    pairs.push({ name: dirName, sourceDir, targetDir: target, files: listFiles(sourceDir) })
  }
  return pairs
}

/**
 * 构造**装载点**目标清单：只取每个包的运行时入口（`lib/<name>.js`）。
 *
 * 作用域限定为仓库受管的包——另一个项目的 `file:` 依赖不该由本仓库的脚本改写。
 * @param {string} profile profile 目录
 * @returns {Array<{name: string, sourceDir: string, targetDir: string, files: string[]}>}
 */
function loadPointPairs(profile) {
  const modulesDir = join(profile, 'node_modules')
  if (!existsSync(modulesDir)) return []
  const managed = new Set(managedPackages().map((entry) => entry.dirName))
  const pairs = []
  for (const [name, spec] of Object.entries(installedDependencies(profile))) {
    if (!spec.startsWith('file:')) continue
    const sourceDir = spec.slice('file:'.length)
    if (!managed.has(sourceDir.split('/').pop())) continue
    if (!existsSync(join(sourceDir, 'package.json'))) continue
    const manifest = JSON.parse(readFileSync(join(sourceDir, 'package.json'), 'utf8'))
    pairs.push({
      name,
      sourceDir,
      targetDir: join(modulesDir, name),
      files: loadPointFiles(sourceDir, manifest.files ?? []),
    })
  }
  return pairs
}

function parseArgs(argv) {
  let mode = 'check'
  let onlyMetadata = false
  let loadpoint = false
  let profile = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') mode = 'check'
    else if (argv[i] === '--apply') mode = 'apply'
    else if (argv[i] === '--only-metadata') onlyMetadata = true
    else if (argv[i] === '--loadpoint') loadpoint = true
    else if (argv[i] === '--profile') {
      profile = argv[i + 1]
      i += 1
    } else return { error: `未知参数：${argv[i]}` }
  }
  if (loadpoint && onlyMetadata) return { error: '--only-metadata 是 vendor 副本的概念，不能与 --loadpoint 同用' }
  return { mode, onlyMetadata, loadpoint, profile }
}

function main() {
  const { mode, onlyMetadata, loadpoint, profile, error } = parseArgs(process.argv.slice(2))
  if (error) {
    process.stderr.write(`${error}\n`)
    process.exitCode = 2
    return
  }

  let pairs
  if (loadpoint) {
    const modulesDir = join(profile, 'node_modules')
    if (!existsSync(modulesDir)) {
      process.stdout.write(`skip 未找到装载点目录：${modulesDir}\n`)
      return
    }
    pairs = loadPointPairs(profile)
  } else {
    const vendorDir = join(profile, 'vendor')
    if (!existsSync(vendorDir)) {
      process.stdout.write(`skip 未找到 profile 副本目录：${vendorDir}\n`)
      return
    }
    pairs = vendorPairs(vendorDir)
  }

  const scope = loadpoint ? '装载点' : 'vendor 副本'
  let driftCount = 0
  for (const { name, sourceDir, targetDir, files } of pairs) {
    if (!existsSync(targetDir)) continue

    const { diverged, absentInTarget } = planSync(sourceDir, targetDir, files)
    const selected = onlyMetadata ? diverged.filter((file) => file === 'package.json') : diverged
    if (selected.length === 0) {
      if (absentInTarget.length > 0) {
        process.stdout.write(`note ${name}: ${scope}未包含 ${absentInTarget.length} 个仓库文件（不追加，副本可能含运行所需产物）\n`)
      }
      continue
    }

    driftCount += 1
    process.stdout.write(
      `drift ${name}: ${selected.slice(0, 5).map((f) => `~${f}`).join(' ')}${selected.length > 5 ? ` … (+${selected.length - 5})` : ''}\n`,
    )

    if (mode === 'apply') {
      applySync(sourceDir, targetDir, selected)
      cleanTemps(targetDir, selected)
      process.stdout.write(`sync  ${name}: 已按 tmp+mv 原子替换 ${selected.length} 个文件\n`)
    }
  }

  if (driftCount === 0) {
    process.stdout.write(`ok ${scope}与仓库源一致\n`)
    process.exitCode = 0
    return
  }
  if (mode === 'check') {
    process.stdout.write(`fail ${driftCount} 个包在${scope}存在漂移（运行 --apply${loadpoint ? ' --loadpoint' : ''} 同步）\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`ok 已同步 ${driftCount} 个包（${scope}）\n`)
    process.exitCode = 0
  }
}

main()
