#!/usr/bin/env node
/**
 * extract-cards.mjs — 从 paper2skills playbook HTML 站抽取 1338 张技能卡的结构化清单。
 *
 * 源（只读）：$P2S_PLAYBOOK/skills/*.html   默认 /Users/lute/project/paper_to_skills/playbook
 * 出：generated/cards.json      每卡：id / src_domain / title / sections{...} / relations / tags
 *     generated/cards-index.tsv 人读总表
 *
 * 纪律：
 *  - 只读源，绝不写源目录。
 *  - 抽不出的字段留空并在报告里计数，不猜。
 *  - 卡数必须 == 期望值（默认 1338），不符则 exit 1（响亮失败，不把源问题伪装成无事发生）。
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { GENERATED_DIR } from '../lib/taxonomy.js'
import { strip as stripHtml } from '../lib/html-text.js'

const SRC = process.env.P2S_PLAYBOOK || '/Users/lute/project/paper_to_skills/playbook'
const SKILLS_DIR = join(SRC, 'skills')
const OUT_DIR = GENERATED_DIR
const EXPECTED = Number(process.env.P2S_EXPECT || 1338)

/**
 * HTML → 纯文本的实现在 `lib/html-text.js`（纯函数，有单测）。
 * 这里曾经内联一份，含两个全库级缺陷：全局压空白吃掉 `<pre>` 缩进、实体表漏 `&#x27;`。
 */
const strip = stripHtml

/** 抓第一个 class 含 cls 的元素的文本 */
const pick = (html, cls) => {
  const m = html.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</`, 'i'))
  return m ? strip(m[1]) : ''
}

/** 抓「<h2>标题</h2> … 下一个 <h2>」之间的正文 */
function sections(html) {
  /** @type {Record<string,string>} */
  const out = {}
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi
  /** @type {Array<{title:string,start:number}>} */
  const marks = []
  let m
  while ((m = re.exec(html))) marks.push({ title: strip(m[1]), start: re.lastIndex })
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? html.lastIndexOf('<h2', marks[i + 1].start) : html.length
    out[marks[i].title] = strip(html.slice(marks[i].start, end))
  }
  return out
}

/** 技能关系：前置 / 延伸 / 可组合 */
function relations(html) {
  /** @type {Record<string,string[]>} */
  const out = {}
  for (const k of ['前置技能', '延伸技能', '可组合技能']) {
    const m = html.match(new RegExp(`<h3[^>]*>${k}</h3>([\\s\\S]*?)(?=<h3|<\\/section|<h2)`, 'i'))
    out[k] = m
      ? [...m[1].matchAll(/Skill-[A-Za-z0-9\u4e00-\u9fff_.-]+/g)].map((x) => x[0]).filter((v, i, a) => a.indexOf(v) === i)
      : []
  }
  return out
}

/** 卡页顶部的标签行（技术族 / 业务族 / 工作流标签） */
function tags(html) {
  const m = html.match(/class="tag-row"[^>]*>([\s\S]*?)<\/div>/i)
  if (!m) return []
  return [...m[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((x) => strip(x[1])).filter(Boolean)
}

const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.html') && f !== 'index.html')
/** @type {any[]} */
const cards = []
const stats = { noTitle: 0, noDomain: 0, noSections: 0, emptyBody: 0 }

for (const f of files.sort()) {
  const html = readFileSync(join(SKILLS_DIR, f), 'utf8')
  const id = (html.match(/data-skill="([^"]+)"/) || [])[1] || basename(f, '.html')
  const title = pick(html, 'skill-main-title')
  const srcDomain = pick(html, 'skill-domain-chip')
  const sec = sections(html)
  const bodyChars = Object.values(sec).join('').length
  if (!title) stats.noTitle++
  if (!srcDomain) stats.noDomain++
  if (!Object.keys(sec).length) stats.noSections++
  if (bodyChars < 200) stats.emptyBody++
  const roi = (sec['6. 业务价值 / ROI'] || '').match(/[\d.,]+-?[\d.,]*\s*(万元|元|%|倍)/g) || []
  cards.push({
    id,
    file: f,
    src_domain: srcDomain,
    title,
    sections: sec,
    relations: relations(html),
    tags: tags(html),
    roi_hits: roi.slice(0, 6),
    body_chars: bodyChars,
  })
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'cards.json'), JSON.stringify({ count: cards.length, source: SKILLS_DIR, cards }, null, 1))
writeFileSync(
  join(OUT_DIR, 'cards-index.tsv'),
  ['id\tsrc_domain\ttitle\tbody_chars', ...cards.map((c) => `${c.id}\t${c.src_domain}\t${c.title}\t${c.body_chars}`)].join('\n') + '\n',
)

const byDomain = /** @type {Record<string,number>} */ ({})
for (const c of cards) byDomain[c.src_domain] = (byDomain[c.src_domain] || 0) + 1
console.log(`卡片数：${cards.length}（期望 ${EXPECTED}）`)
console.log(`缺 title=${stats.noTitle} 缺 domain=${stats.noDomain} 无章节=${stats.noSections} 正文<200字=${stats.emptyBody}`)
const lens = cards.map((c) => c.body_chars).sort((a, b) => a - b)
console.log(`正文长度 中位/最小/最大：${lens[Math.floor(lens.length / 2)]} / ${lens[0]} / ${lens[lens.length - 1]}`)
console.log('按源域：')
for (const [d, n] of Object.entries(byDomain).sort()) console.log(`  ${d}: ${n}`)
if (cards.length !== EXPECTED) {
  console.error(`✗ 卡数 ${cards.length} != ${EXPECTED}`)
  process.exit(1)
}
