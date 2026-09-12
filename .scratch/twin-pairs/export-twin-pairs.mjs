#!/usr/bin/env node
/**
 * 孪生对评审材料导出（只读盘点，不改任何数据源）
 *
 * 复刻 eval/static-routing.mjs 的 M3 枚举逻辑（同一 preset 内两张卡共享 ≥1 个 L3），
 * 但输出**全部**孪生对（原脚本只落 worst-10），并附每张卡的差异摘要字段，
 * 供「合并 / 区分描述 / 排名降级」三选一评审。
 *
 * 数据源（只读）：
 *   - 安装态 ~/.dsh/skills/p2s-{slug}/SKILL.md（fm + ①②③ 正文）
 *   - 50 个岗位 preset（~/.dsh/.agent-presets/agt-{xxx}/agent.cordis.yml）
 *   - packages/capabilities/dsh-paper2skills/data/classification.json
 *   - scripts/role-presets/skill-map.json
 *
 * 输出（仅写本目录 .scratch/twin-pairs/）：
 *   - pairs.json      全量孪生对（机读，阶段 1/2 的处理表原料）
 *   - pairs.tsv       平铺版（人读 / 表格工具）
 *   - l3-groups.json  按共享 L3 分组聚合
 *   - sample-top20.json  评审样本（严重度排序，每 L3 组至多 3 对）
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadInstalledSkills, loadPresets, loadJson, triggersOf, jaccard, roleToPreset,
} from '../../packages/capabilities/dsh-paper2skills/eval/lib/load.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const OUT = HERE
mkdirSync(OUT, { recursive: true })

const classification = loadJson('data/classification.json')
const coverage = loadJson('generated/coverage.json')
const skills = loadInstalledSkills()
const presets = loadPresets()

const cls = new Map(classification.items.map((it) => [it.slug, it]))
/** preset → 岗位中文名（coverage 里 "AGT-047 接桥"） */
const roleOfPreset = new Map()
for (const c of coverage.coverage) {
  const p = roleToPreset(c.role)
  if (p && !roleOfPreset.has(p)) roleOfPreset.set(p, c.role)
}

// ── M3 枚举（与 static-routing.mjs 完全一致的逻辑） ──────────────────────────
const raw = []
for (const [p, info] of presets) {
  for (let i = 0; i < info.p2s.length; i++) {
    for (let j = i + 1; j < info.p2s.length; j++) {
      const A = cls.get(info.p2s[i]), B = cls.get(info.p2s[j])
      if (!A || !B) continue
      const shared = A.l3.filter((n) => B.l3.includes(n))
      if (!shared.length) continue
      raw.push({ preset: p, a: info.p2s[i], b: info.p2s[j], shared_l3: shared })
    }
  }
}
const siblings = new Set(raw.flatMap((r) => [`${r.preset}|${r.a}`, `${r.preset}|${r.b}`]))

const norm = (x) => String(x || '').toLowerCase().replace(/[\s\u3000—\-–—：:，,。.·()（）【】\[\]「」『』/]/g, '')
const bigrams = (s) => { const out = new Set(); for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2)); return out }
const dice = (a, b) => {
  const A = bigrams(a), B = bigrams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return (2 * inter) / (A.size + B.size)
}

/** 单卡差异摘要 */
function card(slug) {
  const it = cls.get(slug)
  const s = skills.get(slug)
  if (!it) return { slug, missing: 'not_in_classification' }
  if (!s) return { slug, title: it.title, missing: 'not_installed' }
  return {
    slug,
    title: s.fm.title || it.title,
    l3: it.l3,
    l1_l2_l3: it.facets.l1_l2_l3,
    src_domain: it.src_domain,
    confidence: it.confidence,
    user_summary: s.fm.user_summary || '',
    workflow: s.fm.workflow || '',
    triggers: triggersOf(s.fm.description),
    problem_140: (s.sec.problem || '').replace(/\s+/g, ' ').slice(0, 140),
    algo_140: (s.sec.algo || '').replace(/\s+/g, ' ').slice(0, 140),
  }
}

const pairs = raw.map((r, i) => {
  const A = card(r.a), B = card(r.b)
  const ta = A.triggers || [], tb = B.triggers || []
  const trigJac = jaccard(ta, tb)
  const sharedTrig = ta.filter((t) => tb.includes(t))
  const titleIdentical = A.title && B.title && norm(A.title) === norm(B.title)
  const titleDice = A.title && B.title ? dice(norm(A.title), norm(B.title)) : 0
  // 预分桶：标题高度相似 → 合并候选；否则同 L3 共域邻接 → 区分描述候选
  const bucket = titleDice >= 0.45 ? 'near_dup' : 'adjacent'
  // 严重度：标题相似为主（合并候选优先评审），触发词重叠为辅
  const severity = +(titleDice * 0.8 + trigJac * 0.2 + (titleIdentical ? 0.3 : 0)).toFixed(3)
  return {
    idx: i + 1,
    preset: r.preset,
    role: roleOfPreset.get(r.preset) || r.preset,
    shared_l3: r.shared_l3,
    a: A, b: B,
    trig_jaccard: +trigJac.toFixed(2),
    shared_triggers: sharedTrig,
    title_identical: titleIdentical,
    title_dice: +titleDice.toFixed(2),
    bucket,
    severity,
  }
})

// ── 按共享 L3 分组聚合（一对多 L3 时会出现在多组，故组内计数之和 ≥ 678） ──
const l3Groups = new Map()
for (const pr of pairs) {
  for (const l3 of pr.shared_l3) {
    if (!l3Groups.has(l3)) l3Groups.set(l3, { l3, pairs: 0, cards: new Set() })
    const g = l3Groups.get(l3)
    g.pairs++
    g.cards.add(pr.a.slug); g.cards.add(pr.b.slug)
  }
}
const l3GroupsOut = [...l3Groups.values()]
  .map((g) => ({ l3: g.l3, pair_contributions: g.pairs, distinct_cards: g.cards.size }))
  .sort((x, y) => y.pair_contributions - x.pair_contributions)

// ── 评审样本 top-20：near_dup 全部收进（至多 10），余量按严重度补邻接对，每 L3 组至多 3 对 ──
const byL3 = new Map()
const sample = []
const nd = pairs.filter((p) => p.bucket === 'near_dup')
for (const pr of nd) {
  if (sample.length >= 10) break
  let hitCap = false
  for (const l3 of pr.shared_l3) {
    if ((byL3.get(l3) || 0) >= 3) { hitCap = true; break }
  }
  if (hitCap) continue
  sample.push(pr)
  for (const l3 of pr.shared_l3) byL3.set(l3, (byL3.get(l3) || 0) + 1)
}
const adj = pairs.filter((p) => p.bucket === 'adjacent').sort((x, y) => y.severity - x.severity)
for (const pr of adj) {
  if (sample.length >= 20) break
  let hitCap = false
  for (const l3 of pr.shared_l3) {
    if ((byL3.get(l3) || 0) >= 3) { hitCap = true; break }
  }
  if (hitCap) continue
  sample.push(pr)
  for (const l3 of pr.shared_l3) byL3.set(l3, (byL3.get(l3) || 0) + 1)
}

const sanity = {
  colliding_pairs: pairs.length,
  presets_affected: new Set(pairs.map((p) => p.preset)).size,
  cards_with_sibling: siblings.size,
  published: { colliding_pairs: 678, presets_affected: 47, cards_with_sibling: 365 },
  note: '与 eval/out/static-routing.json 的 M3 数值比对：一致说明现场与实测时未漂移；不一致需先查漂移再评审。',
}

const out = { generated_at: new Date().toISOString(), sanity, l3_groups: l3GroupsOut, pairs }
writeFileSync(join(OUT, 'pairs.json'), JSON.stringify(out, null, 2) + '\n')

// tsv 平铺（字段内制表符/换行已清洗）
const esc = (x) => String(x ?? '').replace(/[\t\n\r]/g, ' ')
const tsvHead = ['idx', 'preset', 'role', 'shared_l3', 'a_slug', 'a_title', 'b_slug', 'b_title',
  'trig_jaccard', 'shared_triggers', 'title_identical', 'a_user_summary', 'b_user_summary', 'a_workflow', 'b_workflow']
const tsvLines = [tsvHead.join('\t')]
for (const pr of pairs) {
  tsvLines.push([
    pr.idx, pr.preset, pr.role, pr.shared_l3.join('/'),
    pr.a.slug, esc(pr.a.title), pr.b.slug, esc(pr.b.title),
    pr.trig_jaccard, pr.shared_triggers.join('、'), pr.title_identical ? '1' : '',
    esc(pr.a.user_summary), esc(pr.b.user_summary), esc(pr.a.workflow), esc(pr.b.workflow),
  ].join('\t'))
}
writeFileSync(join(OUT, 'pairs.tsv'), tsvLines.join('\n') + '\n')

writeFileSync(join(OUT, 'l3-groups.json'), JSON.stringify(l3GroupsOut, null, 2) + '\n')
writeFileSync(join(OUT, 'sample-top20.json'), JSON.stringify(sample, null, 2) + '\n')

// ── 控制台摘要 ────────────────────────────────────────────────────────────────
const line = '─'.repeat(68)
console.log(`\n${line}\n孪生对导出完成（只读盘点）\n${line}`)
console.log(`枚举结果   ${pairs.length} 对 · ${sanity.presets_affected} 个 preset · ${sanity.cards_with_sibling} 张卡有孪生`)
console.log(`对账       发布口径 678 / 47 / 365 ${pairs.length === 678 ? '✅ 一致' : '⚠️ 已漂移，需先查现场'}`)
console.log(`标题完全相同 ${pairs.filter((p) => p.title_identical).length} 对 · 标题 Dice≥0.45（合并候选） ${pairs.filter((p) => p.bucket === 'near_dup').length} 对`)
console.log(`触发词重叠 ≥0.5 ${pairs.filter((p) => p.trig_jaccard >= 0.5).length} 对`)
console.log(`\nL3 贡献 top 12：`)
for (const g of l3GroupsOut.slice(0, 12)) console.log(`  ${String(g.pair_contributions).padStart(3)} 对·${String(g.distinct_cards).padStart(3)} 卡  ${g.l3}`)
console.log(`\n→ pairs.json / pairs.tsv / l3-groups.json / sample-top20.json\n`)
