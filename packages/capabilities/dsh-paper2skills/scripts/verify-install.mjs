#!/usr/bin/env node
/**
 * verify-install.mjs — 安装后结构校验（L1 结构层 + L2 分类层）。
 *
 * 断言：
 *  1. 每个 slug 目录存在且只含 SKILL.md(+references)
 *  2. 目录名 = frontmatter name；name 合法；description ≤500；正文 ≤12KB
 *  3. disable-model-invocation: true 齐备（全局模型目录不得被推高）
 *  4. frontmatter 的 l1_id/l2_id/l3_business 与 data/classification.json 一致
 *  5. 与「非本包」的既有技能零同名占用（防止覆盖别人）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, NAME_RE, MAX_DESC, MAX_SKILL_BYTES, SLUG_PREFIX } from '../lib/taxonomy.js'
import { countSecrets } from '../lib/secret-scrub.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SKILLS_DIR = process.env.P2S_SKILLS_OUT || path.join(process.env.HOME || '', '.dsh', 'skills')
const CLASSIFICATION = path.join(DATA_DIR, 'classification.json')

if (!fs.existsSync(CLASSIFICATION)) {
  console.error(`✗ 缺少 ${CLASSIFICATION}，先跑 scripts/merge-classification.mjs`)
  process.exit(1)
}
const cls = JSON.parse(fs.readFileSync(CLASSIFICATION, 'utf8'))
/** @type {Map<string, any>} */
const bySlug = new Map(cls.items.map((/** @type {any} */ i) => [i.slug, i]))

/** @type {string[]} */
const problems = []
let installed = 0
let missing = 0

/** ⑦ 段的上限口径来自可得性表，避免这里再写一个 60。 */
const CODE_CAP = (() => {
  const f = path.join(DATA_DIR, 'code-availability.json')
  if (!fs.existsSync(f)) {
    console.error(`✗ 缺少 ${f}，先跑 python3 scripts/build-code-availability.py`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')).source_cap_lines
})()

/** 完整实现索引（入库）。缺它时退化为「只看 ⑦ 段口径」，不假装校验过实现文件。 */
const RECOVERY = path.join(DATA_DIR, 'code-recovery.json')
/** @type {Record<string, any>} */
const recoveryById = fs.existsSync(RECOVERY)
  ? (JSON.parse(fs.readFileSync(RECOVERY, 'utf8')).cards ?? {})
  : {}
/** 完整实现文件的抬头行数；正文（= 卡面节选）必须紧接其后。 */
const IMPL_HEADER_LINES = 5

/**
 * ⑦ 段口径校验（ADR-0048；第六轮按恢复结果改写）。
 *
 * 卡页把 ⑦ 段叫「代码模板」、标签写「N 行 · 可运行复制」、并附一个 `路径：paper2skills-code/…`。
 * 三处都被实测证伪：它是顶在 60 行上限的**节选**，其中 457/1,279 张连 `ast.parse` 都过不了，
 * 而那个路径指向的代码树不在本包内。所以装配器会把这三处换成实测口径 —— 这里守住它。
 *
 * **第六轮订正**：上一轮此处要求正文写「这是节选，不是完整实现」并断言「完整实现不在本包内」。
 * 该结论已作废（完整实现一直在语料 vault 的 git 明文里，1,302 张可恢复），故判据改为二分：
 *  · 有完整实现 → 必须指向 `references/implementation.py`，且**不得**再出现旧说法；
 *  · 没有       → 保留旧说法（此时它是对的）。
 *
 * @param {string} slug
 * @param {string} text SKILL.md 全文
 * @param {string} dir 卡片目录（取 references/code.md 用）
 * @param {string} cardId p2s 卡 id（查完整实现索引）
 * @param {string[]} out
 */
function checkCodeSection(slug, text, dir, cardId, out) {
  const i7 = text.indexOf('## ⑦')
  if (i7 < 0) {
    out.push(`${slug}: 缺 ⑦ 段`)
    return
  }
  const i8 = text.indexOf('## ⑧', i7)
  const sec7 = text.slice(i7, i8 >= 0 ? i8 : undefined)
  const rec = recoveryById[cardId]
  const hasFull = !!rec && rec.tier !== 'unrecovered' && rec.lines > 0

  if (sec7.includes('可运行复制')) {
    out.push(`${slug}: ⑦ 段转发了源站自述「可运行复制」——该说法已被证伪（截断的节选不能直接运行）`)
  }

  const refFile = path.join(dir, 'references', 'code.md')
  let body = sec7
  if (!sec7.includes('```')) {
    if (sec7.includes('references/code.md')) {
      if (!fs.existsSync(refFile)) {
        out.push(`${slug}: ⑦ 段指向 references/code.md，但文件不存在`)
        return
      }
      body = fs.readFileSync(refFile, 'utf8')
    } else if (sec7.includes('references/implementation.py')) {
      // 完整实现已落伴生文件：正文不留代码是**正常**的（SKILL.md 有 12KB 上限）。
      body = sec7
    } else if (!sec7.includes('未附代码')) {
      out.push(`${slug}: ⑦ 段没有代码，却也没说明未附代码`)
      return
    } else {
      return
    }
  }

  if (hasFull) {
    if (!body.includes('references/implementation.py')) {
      out.push(`${slug}: 索引标了完整实现（${rec.lines} 行），⑦ 段却没指向 references/implementation.py`)
    }
    if (body.includes('完整实现不在本包内')) {
      out.push(`${slug}: ⑦ 段仍写着「完整实现不在本包内」——该说法已被证伪（ADR-0048 订正）`)
    }
    if (rec.tier === 'unverified' && !body.includes('未经交叉核对')) {
      out.push(`${slug}: 该卡的完整实现无 oracle 可校验，⑦ 段必须点明「未经交叉核对」`)
    }
  } else if (body.includes('```')) {
    if (!body.includes('本节是源站卡页的代码预览节选')) {
      out.push(`${slug}: ⑦ 段有代码却没说清「这是节选，不是完整实现」`)
    }
  }
  if (!body.includes(`源站对代码预览设了 ${CODE_CAP} 行上限`) && body.includes('```')) {
    out.push(`${slug}: ⑦ 段有代码却没说明源站 ${CODE_CAP} 行上限`)
  }
  if (body.includes('```') && !/ast\.parse|非 Python 片段/.test(body)) {
    out.push(`${slug}: ⑦ 段没说这段节选能不能解析（读者无从判断能不能直接跑）`)
  }
}

/**
 * 完整实现伴生文件的校验（第六轮新增）。
 *
 * 这里守的是「恢复出来的东西真的到了装好的库里，而且真的是那份代码」：
 *  1. 索引说有 → 文件必须在；索引说没有 → 文件不该在（多了就是索引与产物脱节）
 *  2. 抬头恰好 {@link IMPL_HEADER_LINES} 行，且**正文首行 = 第 HEADER+1 行**
 *  3. 正文行数与索引一致
 *  4. 文件里**零密钥**（出口脱敏的最后一道闸）
 *  5. 卡面节选必须是文件第 HEADER+1 行起的连续前缀（oracle 档才断言）
 *
 * @param {string} slug
 * @param {string} dir
 * @param {string} cardId
 * @param {string} text SKILL.md 全文
 * @param {string[]} out
 */
function checkImplementation(slug, dir, cardId, text, out) {
  const rec = recoveryById[cardId]
  const file = path.join(dir, 'references', 'implementation.py')
  const exists = fs.existsSync(file)
  const declared = !!rec && rec.tier !== 'unrecovered' && rec.lines > 0
  if (declared && !exists) {
    out.push(`${slug}: 索引标了 ${rec.tier}/${rec.lines} 行完整实现，但 references/implementation.py 不存在`)
    return
  }
  if (!declared) {
    if (exists) out.push(`${slug}: 索引说没有完整实现，却存在 references/implementation.py（产物与索引脱节）`)
    return
  }
  const raw = fs.readFileSync(file, 'utf8')
  if (countSecrets(raw) > 0) {
    out.push(`${slug}: references/implementation.py 含未脱敏的凭证`)
  }
  const lines = raw.split('\n')
  const body = lines.slice(IMPL_HEADER_LINES).join('\n').replace(/\n+$/, '')
  if (!lines[0]?.startsWith('# dsh-paper2skills · 完整实现')) {
    out.push(`${slug}: implementation.py 抬头首行不是本包标识`)
  }
  if (body.split('\n').length !== rec.lines) {
    out.push(`${slug}: implementation.py 正文 ${body.split('\n').length} 行，索引记 ${rec.lines} 行`)
    return
  }
  if (rec.tier === 'oracle') {
    const sec7 = text.slice(text.indexOf('## ⑦'), text.indexOf('## ⑧') || undefined)
    const fenced = /```[a-z]*\n([\s\S]*?)```/.exec(sec7.includes('```') ? sec7 : '')
    if (fenced) {
      const ex = fenced[1].replace(/\n+$/, '').split('\n').map((l) => l.trimEnd())
      const bl = body.split('\n').map((l) => l.trimEnd())
      // 索引记 `prefix@1+partial` 的卡，源站那份节选自己是被行内 ``` **从行中间**切断的
      // （如 Skill-CodeRAG-Repository-Level-Retrieval），末行只对得上前缀。
      // 判据必须与 build-source-code.py 的 prefix_offset_partial 同口径，
      // 否则这里会把已经校验过的卡判成坏的。
      const partial = String(rec.cross_check || '').includes('+partial')
      const headOk = bl.slice(0, ex.length - 1).join('\n') === ex.slice(0, -1).join('\n')
      const ok = partial
        ? headOk && (bl[ex.length - 1] || '').startsWith(ex[ex.length - 1] || '')
        : bl.slice(0, ex.length).join('\n') === ex.join('\n')
      if (!ok && countSecrets(fenced[1]) === 0) {
        out.push(`${slug}: 卡面节选不是 implementation.py 正文的前缀`
          + `（该卡索引记 ${rec.cross_check}）`)
      }
    }
  }
}

for (const [slug, item] of bySlug) {
  const dir = path.join(SKILLS_DIR, slug)
  const file = path.join(dir, 'SKILL.md')
  if (!fs.existsSync(file)) {
    missing += 1
    continue
  }
  installed += 1
  const text = fs.readFileSync(file, 'utf8')
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) {
    problems.push(`${slug}: 无 frontmatter`)
    continue
  }
  /** @type {Record<string,string>} */
  const fields = {}
  for (const line of m[1].split(/\r?\n/)) {
    const mm = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!mm) continue
    const v = mm[2].trim()
    fields[mm[1]] = v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
  }
  if (!NAME_RE.test(slug)) problems.push(`${slug}: slug 非法`)
  if (fields.name !== slug) problems.push(`${slug}: frontmatter name「${fields.name}」与目录名不一致`)
  if (fields['disable-model-invocation'] !== 'true') problems.push(`${slug}: disable-model-invocation 不是 true`)
  if ((fields.description || '').length > MAX_DESC) problems.push(`${slug}: description 超长`)
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > MAX_SKILL_BYTES) problems.push(`${slug}: SKILL.md ${bytes} 字节 > 12KB`)
  const facets = item.facets
  if (facets) {
    if (fields.l1_id && fields.l1_id !== facets.l1_id) problems.push(`${slug}: l1_id 与分类资产不一致`)
    if (fields.l2_id && fields.l2_id !== facets.l2_id) problems.push(`${slug}: l2_id 与分类资产不一致`)
    if (fields.l3_business && fields.l3_business !== facets.l3_business) problems.push(`${slug}: l3_business 与分类资产不一致`)
  }
  checkCodeSection(slug, text, dir, fields.p2s_card_id, problems)
  checkImplementation(slug, dir, fields.p2s_card_id, text, problems)
}

// 同名占用：本包以外的技能目录不得被 p2s- 前缀以外的技能占用（本包只写 p2s-*）
const foreign = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith(SLUG_PREFIX) && !bySlug.has(e.name))
  .map((e) => e.name)
if (foreign.length) problems.push(`存在 ${foreign.length} 个本包不认识却占用 p2s- 前缀的技能目录：${foreign.slice(0, 10).join(', ')}`)

console.log(`技能库：${SKILLS_DIR}`)
console.log(`应装 ${bySlug.size}  已装 ${installed}  缺失 ${missing}  问题 ${problems.length}`)
if (problems.length) {
  console.error('Problems:')
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`)
  if (problems.length > 40) console.error(`  … 另有 ${problems.length - 40} 项`)
  process.exit(1)
}
if (missing > 0) {
  console.error(`✗ 仍有 ${missing} 个技能未安装`)
  process.exit(1)
}
console.log('✓ 安装校验通过')
