#!/usr/bin/env node
/**
 * 出货投影：把「本机装配」的产品从出货面剥离（不存清单，现算）。
 *
 * ## 为什么需要它
 *
 * ADR-0056 定的两件事是**一对**：
 *   ① 出货的 preset 不烘焙任何外部产品行；
 *   ② 本机产品走**本机装配**（local assembly）——开发机上的产品必须能被本机用起来。
 *
 * 而 `assemble.sh` 的打包源就是**本机 live profile**。两条放一起就有结构性漏洞：
 * 本机为了让开发机可用而挂上的产品（依赖 / bundles / preset 行 / node_modules 副本），
 * 会被**原样**打进载荷发给客户。2026-09-12 实测到两次：
 *   · `/Users/lute/project/KOL-Hunter`（跨项目依赖）——ADR-0033 明令「本仓库不吞并产品代码」，
 *     而它在客户机上是个不存在的路径；
 *   · 同一次装配里，另一个会话在装配进行中把本机产品行加了回去，于是**同一份载荷自相矛盾**：
 *     内嵌副本（21:12 拷）没有该包，profile.tar.gz（21:30 打）有该包。
 *
 * ## 判据（为什么不用一份「外部包清单」）
 *
 * 存清单 = 第二份事实（ADR-0009），产品一加就漂移，而漂移是静默的。这里用**结构判据**：
 * 此刻暂存 profile 的 `dependencies` 已被 `rewrite-file-deps.mjs` 重写，本仓库的包一律是
 * `file:./vendor/...`。于是**任何不是 `file:./vendor/` 的 `file:` 依赖都是外部产品**
 * （绝对路径、`../` 相对路径、指向仓库外的一切）。这正是「本机装配」的签名。
 *
 * ## 用法
 *
 *   node strip-local-products.mjs --profile <暂存 profile> [--presets <暂存 presets>]
 *                                 [--repo <仓库根>] [--dry-run]
 *
 * 退出码：0 = 已剥离且后置校验通过；1 = 剥离后仍有残留（有它不认识的形态，必须人工看）。
 * 每一次删除都打印出来——这个脚本的价值一半在**报告**：它让「本机装配漏进出货面」可见。
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = argv.indexOf(name)
  return i === -1 ? dflt : argv[i + 1]
}
const PROFILE = opt('--profile')
const PRESETS = opt('--presets')
const DRY = argv.includes('--dry-run')
if (PROFILE === undefined) {
  console.error('用法: node strip-local-products.mjs --profile <暂存 profile> [--presets <暂存 presets>]')
  process.exit(2)
}
if (!existsSync(PROFILE)) {
  console.error(`[strip] 暂存 profile 不存在: ${PROFILE}`)
  process.exit(2)
}

const removed = []
const note = (kind, what, why) => {
  removed.push({ kind, what, why })
  console.log(`[strip] 移除 ${kind}: ${what} —— ${why}`)
}

// ── 1. 找出外部产品依赖 ──────────────────────────────────────────────────────
// 判据见文件头：重写之后，本仓库的包一律 file:./vendor/...
const pkgPath = join(PROFILE, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const extNames = new Set()
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  const deps = pkg[field]
  if (deps === undefined) continue
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec !== 'string' || !spec.startsWith('file:')) continue
    const target = spec.slice('file:'.length)
    if (target.startsWith('./vendor/')) continue
    if (resolve(PROFILE, target).startsWith(REPO + '/')) continue
    extNames.add(name)
    if (!DRY) delete deps[name]
    note('依赖', `${name} (${spec})`, 'file: 目标不在本仓库也不在 ./vendor/，是本机装配的外部产品')
  }
}

// bundles 里同名的条目一并去掉（否则客户机上「列了但装不上」）
const bundles = pkg.dsh?.profile?.bundles
if (Array.isArray(bundles)) {
  const kept = bundles.filter((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.name
    if (name !== undefined && extNames.has(name)) {
      note('bundle', name, '其依赖已被判定为外部产品，留着只会让客户机上「列了但装不上」')
      return false
    }
    return true
  })
  if (!DRY && kept.length !== bundles.length) pkg.dsh.profile.bundles = kept
}

if (!DRY && extNames.size > 0) {
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

// ── 2. node_modules 里的外部包副本（含「依赖删了但目录还在」的孤儿）───────────
// 同时按目录名与包内声明的 name 匹配：orphone 目录名的情形（改过别名的 fork）也要抓到。
const nm = join(PROFILE, 'node_modules')
if (existsSync(nm)) {
  for (const entry of readdirSync(nm)) {
    if (entry.startsWith('.')) continue
    const dir = join(nm, entry)
    let isDir = false
    try {
      isDir = statSync(dir).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue
    let declared
    try {
      declared = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name
    } catch {
      declared = undefined
    }
    if (extNames.has(entry) || (declared !== undefined && extNames.has(declared))) {
      if (!DRY) rmSync(dir, { recursive: true, force: true })
      note('node_modules', entry, `外部产品「${declared ?? entry}」的随包副本（客户机上指不到源）`)
    }
  }
}

// ── 3. YAML 补丁层的行（profile/cordis.patch.yml 与 presets/*/agent.cordis.yml）──
// 判据是**条目自身**的文本（不含子条目）：一个顶层条目名了外部包 → 整块删；
// 而 `- insert:` 这类**容器**条目本身不带外部包名，就该保留容器、只删命中的子条目
// （否则会连带删掉同容器里合法的兄弟行——那是静默丢失，比多留一行危险）。
const stripYaml = (file) => {
  if (!existsSync(file)) return
  const lines = readFileSync(file, 'utf8').split('\n')
  const hit = (text) => [...extNames].some((n) => text.includes(n))

  /** 按缩进把行切成条目块；返回 [{indent, lines}]，前导非条目行以 indent=-1 归入首块。 */
  const splitBlocks = (blockLines) => {
    const blocks = []
    let lead = []
    let cur = null
    for (const line of blockLines) {
      const m = /^(\s*)- /.exec(line)
      if (m !== null) {
        if (cur !== null) blocks.push(cur)
        cur = { indent: m[1].length, lines: [line] }
      } else if (cur === null) {
        lead.push(line)
      } else {
        cur.lines.push(line)
      }
    }
    if (cur !== null) blocks.push(cur)
    if (lead.length > 0) blocks.unshift({ indent: -1, lead: true, lines: lead })
    return blocks
  }

  /** 把一个块拆成「自身行」与「子条目块」：子条目 = 缩进比本块深的条目行及其续行。 */
  const splitOwn = (block) => {
    const own = []
    const childLines = []
    let inChild = false
    for (const line of block.lines) {
      const m = /^(\s*)- /.exec(line)
      if (m !== null && m[1].length > block.indent) inChild = true
      if (inChild) childLines.push(line)
      else own.push(line)
    }
    return { own, children: childLines.length > 0 ? splitBlocks(childLines) : [] }
  }

  const keep = (block) => {
    if (block.lead === true) return block.lines
    const { own, children } = splitOwn(block)
    if (hit(own.join('\n'))) {
      note('补丁行', `${file.split('/').slice(-2).join('/')}: ${own[0].trim()}`, '条目自身引用了外部产品')
      return null
    }
    if (children.length === 0) return own
    const keptChildren = children.map(keep).filter((x) => x !== null)
    if (keptChildren.length === 0) {
      // 子条目全被删 → 容器成了空壳，一并删（空 insert 行会让 loader 报错）
      note('补丁行', `${file.split('/').slice(-2).join('/')}: ${own[0].trim()}（子条目已全部移除）`, '空壳容器')
      return null
    }
    return [...own, ...keptChildren.flat()]
  }

  const kept = splitBlocks(lines)
    .map(keep)
    .filter((x) => x !== null)
    .flat()
  // 收尾：去掉删除后可能出现的连续空行（保持可读；与 install/assemble 的占位替换互不影响）
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n')
  if (text !== lines.join('\n') && !DRY) writeFileSync(file, text)
}

stripYaml(join(PROFILE, 'cordis.patch.yml'))
if (PRESETS !== undefined && existsSync(PRESETS)) {
  for (const entry of readdirSync(PRESETS)) {
    const dir = join(PRESETS, entry)
    try {
      if (statSync(dir).isDirectory()) stripYaml(join(dir, 'agent.cordis.yml'))
    } catch {
      /* 非目录忽略 */
    }
  }
}

// ── 4. 后置校验：剥离后不得再有残留（有不认识的形态就响亮失败）───────────────
const residue = []
const scanText = (label, file) => {
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const name of extNames) {
    if (text.includes(name)) residue.push(`${label}: 仍含外部产品名「${name}」`)
  }
}
if (!DRY) {
  scanText('profile/package.json', pkgPath)
  scanText('profile/cordis.patch.yml', join(PROFILE, 'cordis.patch.yml'))
  if (PRESETS !== undefined && existsSync(PRESETS)) {
    for (const entry of readdirSync(PRESETS)) {
      scanText(`presets/${entry}/agent.cordis.yml`, join(PRESETS, entry, 'agent.cordis.yml'))
    }
  }
  for (const name of extNames) {
    if (existsSync(join(nm, name))) residue.push(`node_modules/${name}: 目录仍在`)
  }
}

console.log(
  `[strip] 外部产品 ${extNames.size} 个（${[...extNames].join(', ') || '无'}），移除动作 ${removed.length} 处${DRY ? '（dry-run，未落盘）' : ''}`,
)
if (extNames.size === 0) console.log('[strip] ✓ 出货面没有本机装配的外部产品')
if (residue.length > 0) {
  console.error('[strip] ✗ 剥离后仍有残留，必须人工看（有本脚本不认识的形态）：')
  for (const r of residue) console.error(`    ${r}`)
  process.exit(1)
}
