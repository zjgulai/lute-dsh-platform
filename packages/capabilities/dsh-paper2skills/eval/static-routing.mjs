#!/usr/bin/env node
/**
 * L6-A · 静态路由正确性（确定性，全量 1338 卡 / 50 preset，零模型调用）
 *
 * 测的不是「模型会不会想起来用这个技能」——1338 张全部
 * `disable-model-invocation: "true"`，模型目录里根本没有它们。
 * 真正决定可达性的路由面只有两个：
 *   ① preset 的 skill-subset 白名单（岗位作用域内重注册为模型可见）
 *   ② 斜杠命令（user-invocable）
 * 所以本脚本测的是这两个面的**正确性**：该露的露了没有、不该露的露了没有、
 * 露出来的彼此分得清分不清。
 *
 * 输出 eval/out/static-routing.json（机读）+ 控制台表（人读）。
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EVAL_OUT, REPO, loadInstalledSkills, loadPresets, loadJson,
  roleToPreset, triggersOf, negationTargetsOf, jaccard,
} from './lib/load.mjs'

mkdirSync(EVAL_OUT, { recursive: true })

const classification = loadJson('data/classification.json')
const coverage = loadJson('generated/coverage.json')
const skillMap = JSON.parse(readFileSync(join(REPO, 'scripts/role-presets/skill-map.json'), 'utf8'))
const skills = loadInstalledSkills()
const presets = loadPresets()

const cls = new Map(classification.items.map((it) => [it.slug, it]))
/** L3 名 → 拥有它的 preset（coverage 里 role 是 "AGT-047 接桥"） */
const ownerOfL3 = new Map()
for (const c of coverage.coverage) ownerOfL3.set(c.name, roleToPreset(c.role))
/** L3 名 → skill-map 里的供给名单 */
const supplyOfL3 = new Map(Object.entries(skillMap.skills).map(([k, v]) => [k, v.supply || []]))

const R = {}
const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`)

// ── M0 · 可见性面确认 ────────────────────────────────────────────────────────
R.m0_visibility = {
  installed: skills.size,
  model_off: [...skills.values()].filter((s) => s.fm['disable-model-invocation'] === 'true').length,
  user_invocable: [...skills.values()].filter((s) => s.fm['user-invocable'] === 'true').length,
  exposed_in_some_preset: new Set([...presets.values()].flatMap((p) => p.p2s)).size,
}

// ── M1 · 供给可达性：每个有供给的 L3，本岗 preset 是否至少露出 1 张能干的卡 ──
const l3Rows = []
for (const c of coverage.coverage) {
  const p = ownerOfL3.get(c.name)
  const list = presets.get(p)?.p2s ?? []
  const exposed = c.cards.map((id) => cls.get(id)?.slug).filter((s) => s && list.includes(s))
  const supplied = (supplyOfL3.get(c.name) || []).filter((s) => s.startsWith('p2s-'))
  const suppliedExposed = supplied.filter((s) => list.includes(s))
  l3Rows.push({
    l3: c.name, plane: c.plane, domain: c.domain, role: c.role, preset: p,
    cards_total: c.cards.length, cards_exposed: exposed.length,
    supplied_p2s: supplied.length, supplied_exposed: suppliedExposed.length,
    reachable: exposed.length > 0 || suppliedExposed.length > 0,
  })
}
const reachable = l3Rows.filter((r) => r.reachable)
R.m1_reachability = {
  l3_covered: l3Rows.length,
  l3_reachable: reachable.length,
  l3_unreachable: l3Rows.filter((r) => !r.reachable).map((r) => `${r.domain}/${r.l3} (${r.role})`),
  l3_with_zero_card_exposed_but_supply_map_hit: l3Rows.filter((r) => r.cards_exposed === 0 && r.supplied_exposed > 0).length,
}

// ── M2 · 越岗暴露：preset 里露出的 p2s 卡，它的 L3 是否真属本岗 ────────────────
const offRole = []
for (const [p, info] of presets) {
  for (const slug of info.p2s) {
    const it = cls.get(slug)
    if (!it || !it.l3.length) continue
    const owned = it.l3.filter((n) => ownerOfL3.get(n) === p)
    if (!owned.length) {
      offRole.push({ preset: p, slug, l3: it.l3, owned_by: it.l3.map((n) => ownerOfL3.get(n) || null) })
    }
  }
}
R.m2_off_role_exposure = {
  total_p2s_exposures: [...presets.values()].reduce((a, p) => a + p.p2s.length, 0),
  off_role: offRole.length,
  rate: pct(offRole.length, [...presets.values()].reduce((a, p) => a + p.p2s.length, 0)),
  // 按卡聚合：一张卡可能被多个非属岗 preset 露出
  distinct_cards: new Set(offRole.map((o) => o.slug)).size,
  top: offRole.slice(0, 20),
}

// ── M3 · 近重复共现：同一 preset 内两张卡共享 L3（模型要二选一） ──────────────
const nearDup = []
const sharedL3InPreset = new Map() // `${preset}|${slug}` -> 同 preset 内共享 L3 的兄弟
for (const [p, info] of presets) {
  for (let i = 0; i < info.p2s.length; i++) {
    for (let j = i + 1; j < info.p2s.length; j++) {
      const A = cls.get(info.p2s[i]), B = cls.get(info.p2s[j])
      if (!A || !B) continue
      const shared = A.l3.filter((n) => B.l3.includes(n))
      if (!shared.length) continue
      nearDup.push({ preset: p, a: A.slug, b: B.slug, shared_l3: shared })
      const ka = `${p}|${A.slug}`, kb = `${p}|${B.slug}`
      sharedL3InPreset.set(ka, (sharedL3InPreset.get(ka) || 0) + 1)
      sharedL3InPreset.set(kb, (sharedL3InPreset.get(kb) || 0) + 1)
    }
  }
}
R.m3_near_duplicate = {
  colliding_pairs: nearDup.length,
  presets_affected: new Set(nearDup.map((n) => n.preset)).size,
  cards_with_sibling: sharedL3InPreset.size,
  worst: [...nearDup].slice(0, 10),
}

// ── M4 · 触发词冲突：同一 preset 内两卡触发词 Jaccard ≥ 0.34 ─────────────────
const trig = new Map()
for (const s of skills.values()) trig.set(s.slug, triggersOf(s.fm.description))
const trigCollisions = []
for (const [p, info] of presets) {
  for (let i = 0; i < info.p2s.length; i++) {
    for (let j = i + 1; j < info.p2s.length; j++) {
      const a = trig.get(info.p2s[i]) || [], b = trig.get(info.p2s[j]) || []
      const jac = jaccard(a, b)
      if (jac >= 0.34) trigCollisions.push({ preset: p, a: info.p2s[i], b: info.p2s[j], jaccard: +jac.toFixed(2), overlap: a.filter((x) => b.includes(x)) })
    }
  }
}
const allTriggers = [...trig.values()].flat()
const trigFreq = new Map()
for (const t of allTriggers) trigFreq.set(t, (trigFreq.get(t) || 0) + 1)
R.m4_trigger_collision = {
  cards_with_triggers: [...trig.values()].filter((t) => t.length).length,
  median_triggers_per_card: (() => { const v = [...trig.values()].map((t) => t.length).sort((x, y) => x - y); return v[Math.floor(v.length / 2)] })(),
  in_preset_collisions: trigCollisions.length,
  top_collisions: trigCollisions.sort((a, b) => b.jaccard - a.jaccard).slice(0, 12),
  most_reused_triggers: [...trigFreq.entries()].filter(([, n]) => n >= 12).sort((a, b) => b[1] - a[1]).slice(0, 20),
}

// ── M5 · 负向指引悬空：卡 C 说「要 X 时用「Y」」，Y 在本岗可不可达 ─────────────
const norm = (x) => String(x || '').toLowerCase().replace(/[\s　、，,。.：:；;（）()「」『』\[\]【】\/／|—\-–—_+＋&＆'"]/g, '')
/** 中文业务名（151 个 L3）→ 供给名单 */
const l3ByName = new Map(Object.entries(skillMap.skills))
/** 归一化后的中文名 → {kind, slug} 反查表：L3 名 + 卡标题（整条 / 破折号后 / 冒号前）+ 卡 user_summary 首句 */
const nameIndex = new Map()
for (const [n, v] of l3ByName) nameIndex.set(norm(n), { kind: 'l3_name', name: n, slug: null, supply: v.supply || [] })
for (const s of skills.values()) {
  const t = String(s.fm.title || '')
  const cands = new Set([t, t.split('—').pop(), t.split('：')[0].split('—').pop(), t.split('—')[0]])
  for (const c of cands) {
    const k = norm(c)
    if (k.length >= 3 && !nameIndex.has(k)) nameIndex.set(k, { kind: 'card_title', name: c.trim(), slug: s.slug, supply: [s.slug] })
  }
}
let negTotal = 0, negResolved = 0, negReachable = 0
const negByKind = { l3_name: 0, card_title: 0, fuzzy: 0, unmapped: 0 }
const negDangling = []
for (const s of skills.values()) {
  const targets = negationTargetsOf(s.fm.description)
  if (!targets.length) continue
  const p = [...presets.entries()].find(([, v]) => v.p2s.includes(s.slug))?.[0]
  const list = p ? presets.get(p).skills : []
  for (const t of targets) {
    negTotal++
    let hit = nameIndex.get(norm(t)) || null
    if (!hit) {
      // 模糊兜底：归一化后互为子串（长度 ≥4），记 fuzzy 档，不与精确命中混算
      const k = norm(t)
      if (k.length >= 4) {
        for (const [nk, v] of nameIndex) {
          if (nk.length >= 4 && (nk.includes(k) || k.includes(nk))) { hit = { ...v, kind: 'fuzzy' }; break }
        }
      }
    }
    negByKind[hit ? hit.kind : 'unmapped']++
    const reachNow = hit ? (hit.slug ? list.includes(hit.slug) : (hit.supply.length === 0 || hit.supply.some((x) => list.includes(x)))) : false
    if (hit) negResolved++
    if (reachNow) { negReachable++; continue }
    negDangling.push({ card: s.slug, preset: p, target: t, kind: hit ? hit.kind : 'unmapped', resolved_to: hit ? (hit.slug || hit.name) : null, supply_in_preset: hit ? hit.supply.filter((x) => list.includes(x)) : [] })
  }
}
R.m5_negation_dangling = {
  negation_pointers: negTotal,
  resolved: negResolved,
  resolved_by: negByKind,
  resolution_rate: pct(negResolved, negTotal),
  target_reachable_in_own_preset: negReachable,
  reach_rate: pct(negReachable, negTotal),
  dangling: negDangling.length,
  dangling_unresolvable: negDangling.filter((d) => d.kind === 'unmapped').length,
  dangling_resolved_but_absent: negDangling.filter((d) => d.kind !== 'unmapped').length,
  samples: negDangling.slice(0, 12),
}

// ── M6 · 分类字段一致性（装上去的与库里的对得上） ─────────────────────────────
let fmMismatch = 0
const fmBad = []
for (const [slug, it] of cls) {
  const s = skills.get(slug)
  if (!s) { fmBad.push({ slug, why: 'missing_install' }); fmMismatch++; continue }
  if (!it.l3.length) continue
  if (s.fm.l1_l2_l3 !== it.facets.l1_l2_l3 || s.fm.l3_business !== it.facets.l3_business) {
    fmMismatch++; fmBad.push({ slug, why: 'facet_drift', disk: s.fm.l1_l2_l3, data: it.facets.l1_l2_l3 })
  }
}
R.m6_field_consistency = { checked: cls.size, mismatches: fmMismatch, samples: fmBad.slice(0, 10) }

writeFileSync(join(EVAL_OUT, 'static-routing.json'), JSON.stringify(R, null, 2) + '\n')

// ── 控制台表 ────────────────────────────────────────────────────────────────
const line = '─'.repeat(72)
console.log(`\n${line}\nL6-A · 静态路由正确性（全量）\n${line}`)
console.log(`M0 可见性    已装 ${R.m0_visibility.installed} · 模型关 ${R.m0_visibility.model_off} · 斜杠开 ${R.m0_visibility.user_invocable} · 被某岗露出 ${R.m0_visibility.exposed_in_some_preset}`)
console.log(`M1 供给可达  L3 总数 ${R.m1_reachability.l3_covered} → 本岗可达 ${R.m1_reachability.l3_reachable} (${pct(R.m1_reachability.l3_reachable, R.m1_reachability.l3_covered)})；空 L3 ${R.m1_reachability.l3_covered - R.m1_reachability.l3_reachable}`)
if (R.m1_reachability.l3_unreachable.length) console.log(`             不可达：${R.m1_reachability.l3_unreachable.join(' · ')}`)
console.log(`M2 越岗暴露  ${R.m2_off_role_exposure.off_role} / ${R.m2_off_role_exposure.total_p2s_exposures} 次暴露 (${R.m2_off_role_exposure.rate})，涉 ${R.m2_off_role_exposure.distinct_cards} 张卡`)
console.log(`M3 近重复    ${R.m3_near_duplicate.colliding_pairs} 对共现于 ${R.m3_near_duplicate.presets_affected} 个 preset，涉 ${R.m3_near_duplicate.cards_with_sibling} 张卡`)
console.log(`M4 触发词    中位 ${R.m4_trigger_collision.median_triggers_per_card} 个/卡，preset 内冲突 ${R.m4_trigger_collision.in_preset_collisions} 对`)
console.log(`M5 负向指引  ${R.m5_negation_dangling.negation_pointers} 条 → 可解析 ${R.m5_negation_dangling.resolved} (${R.m5_negation_dangling.resolution_rate}) [L3名 ${R.m5_negation_dangling.resolved_by.l3_name} · 卡标题 ${R.m5_negation_dangling.resolved_by.card_title} · 无解 ${R.m5_negation_dangling.resolved_by.unmapped}] · 本岗可达 ${R.m5_negation_dangling.target_reachable_in_own_preset} (${R.m5_negation_dangling.reach_rate})`)
console.log(`M6 字段一致  ${R.m6_field_consistency.checked - R.m6_field_consistency.mismatches} / ${R.m6_field_consistency.checked} 一致`)
console.log(`${line}\n→ eval/out/static-routing.json\n`)
