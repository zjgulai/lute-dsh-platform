#!/usr/bin/env node
/**
 * extract-cards.mjs — 从 paper2skills playbook HTML 站抽取 1338 张技能卡的结构化清单。
 *
 * 源：/Users/lute/project/paper_to_skills/playbook/skills/*.html（权威本地源，只读）
 * 出：data/cards.json     每卡：id / src_domain / title / sections{...} / relations / tags
 *     data/cards-index.tsv 人读总表
 *
 * 纪律：
 *  - 只读源，不写源目录。
 *  - 抽不出的字段留空并在 report 里计数，不猜。
 *  - 卡数必须 == 1338，不符则 exit 1（响亮失败）。
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = process.env.P2S_PLAYBOOK || '/Users/lute/project/paper_to_skills/playbook'
const SKILLS_DIR = join(SRC, 'skills')
const OUT_DIR = join(ROOT, 'data')
const EXPECTED = Number(process.env.P2S_EXPECT || 1338)

const strip = (s) =>
  s
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const pick = (html, cls) => {
  const m = html.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</`, 'i'))
  return m ? strip(m[1]) : ''
}

/** 抓「<h2>标题</h2> … 下一个 <h2>」之间的正文 */
function sections(html) {
  const out = {}
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi
  const marks = []
  let m
  while ((m = re.exec(html))) marks.push({ title: strip(m[1]), start: re.lastIndex })
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? html.lastIndexOf('<h2', marks[i + 1].start) : html.length
    out[marks[i].title] = strip(html.slice(marks[i].start, end))
  }
  return out
}

function relations(html) {
  const out = {}
  for (const k of ['前置技能', '延伸技能', '可组合技能']) {
    const m = html.match(new RegExp(`<h3[^>]*>${k}</h3>([\\s\\S]*?)(?=<h3|<\\/section|<h2)`, 'i'))
    out[k] = m
      ? [...m[1].matchAll(/Skill-[A-Za-z0-9\u4e00-\u9fff_.-]+/g)].map((x) => x[0]).filter((v, i, a) => a.indexOf(v) === i)
      : []
  }
  return out
}

function tags(html) {
  // tag-row 之后到下一个区块之间的所有 pill/span
  const m = html.match(/class="tag-row"[^>]*>([\s\S]*?)<\/div>/i)
  if (!m) return []
  return [...m[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((x) => strip(x[1])).filter(Boolean)
}

const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.html') && f !== 'index.html')
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

const byDomain = {}
for (const c of cards) byDomain[c.src_domain] = (byDomain[c.src_domain] || 0) + 1
console.log(`卡片数：${cards.length}（期望 ${EXPECTED}）`)
console.log(`缺 title=${stats.noTitle} 缺 domain=${stats.noDomain} 无章节=${stats.noSections} 正文<200字=${stats.emptyBody}`)
console.log('正文长度 中位/最小/最大：', [cards.map((c) => c.body_chars).sort((a, b) => a - b)[Math.floor(cards.length / 2)], Math.min(...cards.map((c) => c.body_chars)), Math.max(...cards.map((c) => c.body_chars))].join(' / '))
console.log('按源域：')
for (const [d, n] of Object.entries(byDomain).sort()) console.log(`  ${d}: ${n}`)
if (cards.length !== EXPECTED) {
  console.error(`✗ 卡数 ${cards.length} != ${EXPECTED}`)
  process.exit(1)
}
