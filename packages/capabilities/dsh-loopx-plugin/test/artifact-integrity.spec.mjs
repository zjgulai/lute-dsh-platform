import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

/**
 * 本包是**纯预构建产物**：git 中从未有过 src/、tsconfig 或测试目录
 * （`git log -- src/` 为空），发布内容只有 lib/ 下的 bundle 与 lib/types 的类型声明。
 * 因此可验证的契约只能是「产物完整性」：入口可达、导出面存在、声明与实现同源、
 * manifest 的导出映射都能解析。这些检查替代了原先那批永远无法运行的上游脚本。
 */

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))

test('manifest：入口与导出映射都指向真实存在的文件', async () => {
  const targets = []
  for (const [key, value] of Object.entries(manifest.exports ?? {})) {
    if (typeof value === 'string') targets.push({ key, path: value })
    else if (value && typeof value === 'object') {
      for (const [condition, path] of Object.entries(value)) targets.push({ key: `${key}#${condition}`, path })
    }
  }
  assert.ok(targets.length > 0, 'exports 不应为空')

  for (const { key, path } of targets) {
    assert.ok(existsSync(join(packageRoot, path)), `导出 ${key} 指向不存在的文件：${path}`)
  }
})

test('宿主入口可加载，且导出面完整（工具/服务/驱动/命令）', async () => {
  const module = await import(join(packageRoot, manifest.main))

  for (const name of ['name', 'inject', 'apply', 'GoalBarService', 'LoopXContinuationDriver']) {
    assert.ok(name in module, `入口应导出 ${name}`)
  }
  assert.equal(module.name, 'dsh-loopx-plugin')
  assert.ok(Array.isArray(module.inject), 'inject 应为数组')
})

test('类型入口可达：每个 exports 的 types 指向的文件存在且非空', async () => {
  const typesDir = join(packageRoot, 'lib', 'types')
  const entries = Object.entries(manifest.exports ?? {})
    .map(([key, value]) => [key, typeof value === 'string' ? undefined : value?.types])
    .filter(([, types]) => typeof types === 'string')

  assert.ok(entries.length > 0, 'exports 中应至少有一个带 types 的入口')

  for (const [key, types] of entries) {
    const rel = String(types).replace(/^\.\/lib\/types\//, '')
    const path = join(typesDir, rel)
    assert.ok(existsSync(path), `入口 ${key} 的 types 指向不存在文件：${types}`)
    const text = await readFile(path, 'utf8')
    assert.ok(text.length > 50, `入口 ${key} 的类型声明疑似空文件：${types}`)
  }
})

test('exports 的每个条目都同时提供 types 与实现（避免只声明不实现）', () => {
  for (const [key, value] of Object.entries(manifest.exports ?? {})) {
    if (typeof value === 'string') continue
    if (value === null || typeof value !== 'object') continue
    if (!('types' in value) && !('default' in value)) continue
    assert.ok('types' in value, `导出 ${key} 缺少 types 条件`)
    assert.ok('default' in value, `导出 ${key} 缺少 default 条件`)
  }
})

test('bundle 产物非空且可解析（宿主与客户端两面）', async () => {
  for (const rel of ['lib/index.js', 'lib/client.js']) {
    const path = join(packageRoot, rel)
    assert.ok(existsSync(path), `缺少产物 ${rel}`)
    const info = await stat(path)
    assert.ok(info.size > 1000, `${rel} 体积异常小（${info.size} 字节），疑似空产物`)
  }
})

test('每个脚本引用的路径都必须存在（死脚本守卫）', () => {
  // 通用不变量，而非模式匹配：脚本里出现的 -p <file> 与 node <path> 目标都必须真实存在。
  // 实测背景：本包原先声明了 build/typecheck/test/smoke:* 共 8 个脚本，全部引用
  // 不存在的 src/、tsconfig.host.json、scripts/、smoke/ —— 引用上游开发仓库的结构，
  // 在本仓库永远无法运行。
  const scripts = manifest.scripts ?? {}
  const missing = []

  for (const [name, command] of Object.entries(scripts)) {
    const text = String(command)
    const candidates = []
    for (const match of text.matchAll(/-p\s+(\S+)/g)) candidates.push(match[1])
    for (const match of text.matchAll(/node\s+(?!-)(\.?\/?[\w./-]+\.(?:mjs|js|cjs))/g)) candidates.push(match[1])

    for (const candidate of candidates) {
      if (candidate.startsWith('-')) continue
      if (!existsSync(join(packageRoot, candidate))) missing.push(`${name} → ${candidate}`)
    }
  }

  assert.deepEqual(missing, [], `以下脚本引用了不存在的路径：${missing.join('; ')}`)
})

/** 递归收集 .d.ts 相对路径。 */
async function collectDts(dir, prefix = '') {
  const { readdir } = await import('node:fs/promises')
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) out.push(...await collectDts(join(dir, entry.name), rel))
    else if (entry.name.endsWith('.d.ts')) out.push(rel)
  }
  return out
}

/**
 * 从 exports 的 types 入口出发，沿相对 re-export 收集可达的声明文件。
 * @returns {Promise<Set<string>>} 可达声明的相对路径（相对 lib/types）
 */
async function collectReachableDeclarations() {
  const typesDir = join(packageRoot, 'lib', 'types')
  const reachable = new Set()
  const queue = []
  for (const value of Object.values(manifest.exports ?? {})) {
    const entry = typeof value === 'string' ? undefined : value?.types
    if (typeof entry !== 'string') continue
    const rel = entry.replace(/^\.\/lib\/types\//, '')
    queue.push(rel)
  }

  while (queue.length > 0) {
    const rel = queue.pop()
    if (reachable.has(rel)) continue
    if (!existsSync(join(typesDir, rel))) continue
    reachable.add(rel)

    const text = await readFile(join(typesDir, rel), 'utf8')
    for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const spec = match[1]
      const base = join(dirname(rel), spec)
      const normalised = base.replace(/^\.\//, '')
      // 声明里可能写 .ts 后缀（源码风格），统一映射到 .d.ts
      queue.push(normalised.replace(/\.ts$/, '.d.ts'))
    }
  }
  return reachable
}
