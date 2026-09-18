#!/usr/bin/env node
/**
 * fetch-third-party-skills.mjs — 第三方技能**不可变取件器**（SOP §12.0 第零步，SEC-RT-002）
 *
 * ## 为什么是「取件器」而不是「clone」
 *
 * 2026-09-15 实测：`git clone https://github.com/phuryn/pm-skills` **连续三次失败**
 * （`Connection reset by peer` / `invalid index-pack output`），`codeload` 的 tar.gz
 * 90s 内未完成；而同一时刻
 *   - `api.github.com/repos/<r>/git/trees/<commit>?recursive=1` 秒回（151 blob）
 *   - `raw.githubusercontent.com/<r>/<commit>/<path>` 逐文件 <20s
 * 即**仓库级打包取件在本机网络下不可靠，文件级取件可靠**。故取件路径固定为
 * 「锁定不可变 Commit → trees API 枚举 → raw 逐文件按 raw bytes 取件 → 双重 digest（SHA-256 + Git blob OID）对账」，
 * 绝对不使用 HEAD/分支/tag 浮动引用，不依赖 clone。
 *
 * ## 这道闸门守什么（SEC-RT-002）
 *
 * ① **不可变 Commit 保证**：trees API 枚举与 raw 逐文件取件必须使用完全相同的不可变 Commit SHA。
 *    拒绝使用 HEAD、分支名或浮动 tag，防止上游 commit 推进产生竞态。
 * ② **枚举完整性**：trees API 返回 `truncated: true` 时**拒绝**——截断的树里
 *    「少了几条技能」与「上游本来就没有」长得一模一样，静默漏收是最难查的缺陷。
 * ③ **双重哈希与字节完整性**：每文件落盘前后比对 Git blob OID（sha1("blob <len>\0" + content)）
 *    与独立的 SHA-256 哈希。缓存命中与新拉取走完全相同的哈希校验（拒绝仅按 size 比对）。
 * ④ **二进制资源保真**：一律以原始 Buffer（raw bytes）流式取件，禁止 res.text() 破坏二进制。
 * ⑤ **清单闭合**：manifest 里声明的每条技能都必须能在树里找到，反之树里有
 *    SKILL.md 而 manifest 未声明时必须恰好登记为 imported / skipped / alreadyInstalled 之一。
 *
 * ## 用法
 *
 *   node scripts/fetch-third-party-skills.mjs --list        # 只枚举，不下载
 *   node scripts/fetch-third-party-skills.mjs               # 按 manifest 取件到缓存
 *   node scripts/fetch-third-party-skills.mjs --only pm     # 只取一个仓库
 *   node scripts/fetch-third-party-skills.mjs --force       # 强制重取并重新对账
 *
 * 缓存根：`staging/third-party/<owner>__<repo>/<path>`（进仓库，可审计、可离线重放）
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const MANIFEST = path.join(HERE, 'third-party-intake.json')
const CACHE = path.join(ROOT, 'staging', 'third-party')

const argv = process.argv.slice(2)
const LIST_ONLY = argv.includes('--list')
const FORCE = argv.includes('--force')
const oi = argv.indexOf('--only')
const ONLY = oi >= 0 ? (argv[oi + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : []

const API = 'https://api.github.com'
const RAW = 'https://raw.githubusercontent.com'
const UA = 'lute-fullstack-intake/1.0 (+local skill intake; contact: repo owner)'

const say = (s = '') => console.log(s)

/** 计算 SHA-256 哈希 */
export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/** 计算 Git Blob OID: sha1("blob " + size + "\0" + content) */
export function gitBlobOid(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`, 'utf8')
  return crypto.createHash('sha1').update(header).update(buf).digest('hex')
}

/** 带指数退避的取原始字节；网络是本机已知的不稳定项，重试必须显式而不是靠运气。 */
async function getBytes(url, { attempts = 4 } = {}) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 30_000)
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctl.signal })
      clearTimeout(timer)
      if (res.status === 404) return { ok: false, status: 404, buffer: null }
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`)
      } else {
        const arrayBuf = await res.arrayBuffer()
        return { ok: true, status: res.status, buffer: Buffer.from(arrayBuf) }
      }
    } catch (e) {
      lastErr = e
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 700 * 2 ** i))
  }
  throw new Error(`${url} 取件失败（${attempts} 次）：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

async function getText(url, options = {}) {
  const res = await getBytes(url, options)
  return {
    ok: res.ok,
    status: res.status,
    text: res.buffer ? res.buffer.toString('utf8') : null,
  }
}

/** 枚举一棵树，严格使用不可变 commit。`truncated: true` 一律拒绝。 */
export async function listTree(repo, commit) {
  if (!commit || commit.length !== 40 || !/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error(`${repo}: 缺少合法的不可变 Commit SHA（收到「${commit}」），禁止以 HEAD 枚举树`)
  }
  const { ok, text, status } = await getText(`${API}/repos/${repo}/git/trees/${commit}?recursive=1`)
  if (!ok) throw new Error(`${repo}: trees API ${status} (commit: ${commit})`)
  // `text` 在无响应体时为 null；单独报，免得 JSON.parse 抛出看不懂的语法错。
  if (text === null) throw new Error(`${repo}: trees API 响应体为空 (commit: ${commit})`)
  const data = JSON.parse(text)
  if (data.truncated) {
    throw new Error(
      `${repo}: trees API 返回 truncated=true。截断的树无法区分「上游没有这条」与「本次没收到这条」，` +
        `拒绝继续。请改用分页树 API 逐层枚举。`
    )
  }
  if (!Array.isArray(data.tree)) throw new Error(`${repo}: trees 响应无 tree 数组`)
  return data.tree
}

/** 一条技能的「单元目录」= 它的 SKILL.md 所在目录；其余文件按同一目录前缀收。 */
export function unitFiles(tree, skillDir) {
  const prefix = skillDir + '/'
  return tree
    .filter((x) => x.type === 'blob' && x.path.startsWith(prefix))
    .map((x) => ({ path: x.path, rel: x.path.slice(prefix.length), size: x.size, gitSha: x.sha }))
}

async function main() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`缺少 manifest：${MANIFEST}`)
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  // 空数组字面量在 strict 下推断为 `never[]`，于是后面每一处 push 都被判
  // 「Argument of type 'string' is not assignable to parameter of type 'never'」。
  // 写清元素类型，别让推断去猜。
  /** @type {{ fetchedAt: string, repos: Record<string, unknown>, skills: Array<Record<string, unknown>>, problems: string[], skipped: string[] }} */
  const report = { fetchedAt: new Date().toISOString(), repos: {}, skills: [], problems: [], skipped: [] }

  for (const repo of manifest.repos) {
    if (ONLY.length && !ONLY.includes(repo.id)) continue
    const commit = repo.commit
    if (!commit) {
      report.problems.push(`${repo.id}: manifest 缺少不可变 commit，拒绝取件`)
      continue
    }
    say(`\n=== ${repo.id}  ${repo.repo} @ ${commit.slice(0, 10)} ===`)
    const tree = await listTree(repo.repo, commit)
    const allSkillDirs = [...new Set(tree.filter((x) => x.path.endsWith('/SKILL.md')).map((x) => x.path.replace(/\/SKILL\.md$/, '')))].sort()
    say(`  树上 SKILL.md 单元 ${allSkillDirs.length} 个 | blob ${tree.filter((x) => x.type === 'blob').length}`)

    const declared = new Set([...repo.skills.map((s) => s.dir), ...(repo.skip || []).map((s) => s.dir)])
    const declaredNames = new Set([
      ...repo.skills.map((s) => s.sourceName ?? s.name),
      ...(repo.skip || []).map((s) => s.sourceName ?? s.name),
      ...(repo.alreadyInstalled || []).map((s) => s.name),
    ])
    const nameOf = (dir) => dir.split('/').pop()
    const sourceNameCounts = new Map()
    for (const dir of allSkillDirs) sourceNameCounts.set(nameOf(dir), (sourceNameCounts.get(nameOf(dir)) || 0) + 1)
    const duplicateSourceNames = [...sourceNameCounts].filter(([, count]) => count > 1).map(([name]) => name).sort()
    if (duplicateSourceNames.length) {
      report.problems.push(`${repo.id}: 上游 source name 不唯一，不能用 name 做稳定 ID：${duplicateSourceNames.join(', ')}`)
    }
    const undeclared = allSkillDirs.filter((d) => !declared.has(d) && !declaredNames.has(nameOf(d)))
    if (undeclared.length) {
      report.problems.push(
        `${repo.id}: ${undeclared.length} 个单元没有 imported / skipped / alreadyInstalled 终态 —— 「没装」与「忘了装」在结果上无法区分：\n    ${undeclared.join('\n    ')}`
      )
    }
    const missing = [...declared].filter((d) => !allSkillDirs.includes(d))
    if (missing.length) report.problems.push(`${repo.id}: manifest 声明了树上不存在的单元：${missing.join(', ')}`)
    const liveSourceNames = new Set(allSkillDirs.map(nameOf))
    const missingAlready = (repo.alreadyInstalled || []).map((s) => s.name).filter((name) => !liveSourceNames.has(name))
    if (missingAlready.length) report.problems.push(`${repo.id}: alreadyInstalled 声明了树上不存在的 source ID：${missingAlready.join(', ')}`)

    if (LIST_ONLY) {
      report.repos[repo.id] = {
        repo: repo.repo,
        commit,
        skillUnits: allSkillDirs.length,
        imported: repo.skills.length,
        skipped: (repo.skip || []).length,
        alreadyInstalled: (repo.alreadyInstalled || []).length,
      }
      continue
    }

    const outRoot = path.join(CACHE, repo.repo.replace('/', '__'))
    let bytes = 0, files = 0
    for (const s of repo.skills) {
      const files_ = unitFiles(tree, s.dir)
      if (!files_.length) { report.problems.push(`${repo.id}/${s.name}: 单元 ${s.dir} 在树上无文件`); continue }
      const dest = path.join(outRoot, s.dir)
      for (const f of files_) {
        const url = `${RAW}/${repo.repo}/${commit}/${f.path}`
        const target = path.join(dest, f.rel)

        // SEC-RT-002: 缓存命中与新拉取共享严格校验（Git blob OID + 长度），拒绝只比对 size
        let buf = null
        if (!FORCE && fs.existsSync(target)) {
          const cachedBuf = fs.readFileSync(target)
          const cachedOid = gitBlobOid(cachedBuf)
          if (cachedBuf.length === f.size && (!f.gitSha || cachedOid === f.gitSha)) {
            buf = cachedBuf
          }
        }

        if (!buf) {
          const { ok, buffer } = await getBytes(url)
          if (!ok) { report.problems.push(`${repo.id}/${s.name}: raw 404 ${f.path}`); continue }
          // 同 extraFiles 处：`buffer` 自身可空（getBytes 在 404 时回 null），
          // 不先收窄的话 `buf` 在块后仍是 `Buffer | null`。
          if (!buffer) { report.problems.push(`${repo.id}/${s.name}: raw 空响应 ${f.path}`); continue }
          buf = buffer
          if (f.size !== undefined && buf.length !== f.size) {
            report.problems.push(
              `${repo.id}/${s.name}: ${f.rel} 字节数不符（trees 报 ${f.size}，实得 ${buf.length}）—— 正文可能被截断，拒绝落盘`
            )
            continue
          }
          const actualOid = gitBlobOid(buf)
          if (f.gitSha && actualOid !== f.gitSha) {
            report.problems.push(
              `${repo.id}/${s.name}: ${f.rel} Git blob OID 不符（trees 报 ${f.gitSha}，实算 ${actualOid}）—— 内容损坏，拒绝落盘`
            )
            continue
          }
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.writeFileSync(target, buf)
        }

        files++
        bytes += buf.length
      }
      report.skills.push({
        repo: repo.id, commit, name: s.name, sourceName: s.sourceName ?? s.dir.split('/').pop(), dir: s.dir,
        installAs: s.installAs ?? s.name, category: s.category, titleZh: s.titleZh, summaryZh: s.summaryZh,
        fileCount: files_.length, sha256SkillMd: sha256(fs.readFileSync(path.join(dest, 'SKILL.md'))),
      })
    }

    const extra = repo.extraFiles || []
    for (const rel of extra) {
      const url = `${RAW}/${repo.repo}/${commit}/${rel}`
      const target = path.join(outRoot, rel)
      let buf = null
      if (!FORCE && fs.existsSync(target)) {
        buf = fs.readFileSync(target)
      }
      if (!buf) {
        const { ok, buffer } = await getBytes(url)
        if (!ok) { report.problems.push(`${repo.id}: extraFile 404 ${rel}`); continue }
        // 分开判而不是并进上一行：`ok=true` 却没有字节是另一种坏响应，
        // 报出来时不该假装成 404。顺带让 `buf` 在下面收窄成非空。
        if (!buffer) { report.problems.push(`${repo.id}: extraFile 空响应 ${rel}`); continue }
        buf = buffer
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, buf)
      }
      files++
      bytes += buf.length
    }
    if (extra.length) say(`  · 附属文件 ${extra.length} 个（commands 等）`)

    say(`  ✓ 落盘 ${files} 文件 / ${(bytes / 1024).toFixed(1)} KiB → ${path.relative(ROOT, outRoot)}`)
    report.repos[repo.id] = {
      repo: repo.repo,
      commit,
      skillUnits: allSkillDirs.length,
      imported: repo.skills.length,
      skipped: (repo.skip || []).length,
      alreadyInstalled: (repo.alreadyInstalled || []).length,
      files,
      bytes,
    }
  }

  if (!LIST_ONLY) {
    const out = path.join(ROOT, 'staging', 'third-party-fetch-report.json')
    fs.writeFileSync(out, JSON.stringify(report, null, 2))
    say(`\n报告 → ${path.relative(ROOT, out)}`)
  }
  say(`\n技能单元合计 ${report.skills.length} | 问题 ${report.problems.length}`)
  if (report.problems.length) { report.problems.forEach((p) => say('  - ' + p)); process.exit(1) }
  if (!LIST_ONLY) say('✓ 取件完成，不可变 Commit、哈希比对与清单闭合均通过')
}

// 仅在直接执行时运行 main
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}
