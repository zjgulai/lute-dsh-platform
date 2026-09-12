/**
 * `data/code-recovery.json` 的判据 + 围栏解析的回归用例。
 *
 * 这张索引决定两件事：每张 skill 的 ⑦ 段怎么写、要不要落 `references/implementation.py`。
 * 所以它自己必须是对的、且与脚本不漂移。
 *
 * 背景（ADR-0050）：卡面上的 ⑦ 是**预览节选**，完整实现在 vault 卡的代码围栏里。
 * 抽取围栏的正则曾经有两个缺陷 —— 不锚行首（前一个围栏的收尾 ``` 被当成开栏，
 * 配对整体错位）、只认 python 标注（```bash 的首块根本不进候选）。实测后果：
 * 21 张卡被误判成「源站卡与 vault 卡是两代产物」，其中 19 张的实现一直在 vault 里，
 * 另有 4 张卡已「确证」的实现其实被行内 ``` 截断了。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SCRIPT = join(PKG, 'scripts/build-source-code.py')
const doc = JSON.parse(readFileSync(join(PKG, 'data/code-recovery.json'), 'utf8'))
const recs = Object.values(doc.cards)

/**
 * `generated/` 是**派生件、不入库**（.gitignore 挡着），新检出里没有 `cards.json`。
 * 2026-09-12 实测：这个文件曾在模块加载期直接读它，于是在一份全新检出里整个 spec
 * 以 ENOENT 崩掉 —— 63 条断言里这条文件的所有用例都没跑，报告上却只有一行 ENOENT。
 * 现在改成：缺件就**响亮跳过**这一条，并给出重建命令。
 */
const CARDS_PATH = join(PKG, 'generated/cards.json')
const cardsSkip = existsSync(CARDS_PATH)
  ? false
  : '缺 generated/cards.json（派生件不入库）——先跑 npm run extract:cards'

/** 未恢复原因的**封闭词表**：新写一个错别字必须在这里响亮失败，而不是悄悄多一类 */
const REASONS = new Set([
  'NO_VAULT_CARD',
  'NO_FENCE_IN_VAULT',
  'NO_PAIRED_PYTHON_FENCE',
  'EXCERPT_MATCHES_NON_PYTHON_FENCE',
  'EXCERPT_NOT_FOUND_IN_VAULT',
])

/**
 * `parses=false` 去向的**封闭词表**。两者要修的地方完全不同：
 *  - `UNLABELED`       = 卡里的源码本身写坏，且围栏唯一确定了终点（取到的就是全部）；
 *  - `WINDOW_TRUNCATED`= 无 oracle 可定时终点不唯一，恢复区把卡正文一起圈了进来，**不是实现**。
 * 2026-09-12 实测分解为 5 / 15，合计 20。
 */
const DEFECTS = new Set(['UNLABELED', 'WINDOW_TRUNCATED'])

test('判据自测过（围栏候选 / 行中切断 / 实测偏移 / 5 类源码缺陷 / 两类归类）', () => {
  const out = execFileSync('python3', [SCRIPT, '--selftest'], { encoding: 'utf8' })
  assert.match(out, /✓ 判据自测通过/)
  // 断言条数不许缩水：判据被拆掉时这里也要红，而不是只剩一句「通过」。
  const n = Number(out.match(/（(\d+) 条断言）/)?.[1] ?? 0)
  assert.ok(n >= 36, `自测只剩 ${n} 条断言`)
})

test('恢复索引与重算一致（改了判据或卡数据必须重跑脚本）', { skip: cardsSkip }, () => {
  const out = execFileSync('python3', [SCRIPT, '--check'], { encoding: 'utf8' })
  assert.match(out, /✓ 完整实现恢复索引一致/)
})

test('每张卡都有记录 —— 少一张就装配不了，必须响亮失败而不是静默跳过', { skip: cardsSkip }, () => {
  const cards = JSON.parse(readFileSync(CARDS_PATH, 'utf8')).cards
  const missing = cards.filter((c) => !doc.cards[c.id]).map((c) => c.id)
  assert.deepEqual(missing, [], `缺 ${missing.length} 张卡的恢复记录`)
  assert.equal(recs.length, cards.length)
})

test('stats 与逐卡记录一致（报告数字不许是另一套口径算出来的）', () => {
  const s = doc.stats
  assert.equal(s.cards, recs.length)
  assert.equal(s.oracle, recs.filter((r) => r.tier === 'oracle').length)
  assert.equal(s.unverified, recs.filter((r) => r.tier === 'unverified').length)
  assert.equal(s.unrecovered, recs.filter((r) => r.tier === 'unrecovered').length)
  assert.equal(s.recovered, s.oracle + s.unverified)
  assert.equal(s.total_lines, recs.reduce((a, r) => a + (r.lines || 0), 0))
  assert.equal(s.parses_of_recovered, recs.filter((r) => r.tier !== 'unrecovered' && r.parses).length)
})

test('分层与行数的关系：已恢复必有正文行，未恢复必为 0 且有原因码', () => {
  for (const r of recs) {
    if (r.tier === 'unrecovered') {
      assert.equal(r.lines, 0, `${r.card} 未恢复却记了行数`)
      assert.ok(REASONS.has(r.reason), `${r.card} 的原因码不在封闭词表里：${r.reason}`)
    } else {
      assert.ok(r.lines > 0, `${r.card} 标成 ${r.tier} 却 0 行`)
      assert.equal(r.reason, undefined, `${r.card} 已恢复却仍带原因码`)
      assert.match(r.sha256, /^[0-9a-f]{64}$/, `${r.card} 缺 sha256`)
    }
  }
})

test('确证集的偏移是**量出来的** 1，不是写死的常量', () => {
  // 这里曾经是伪守卫：调用方把 offset 写死成 EXPECTED_OFFSET，集合恒等于 {1}，
  // 那条「偏移必须恒为 1」永远不可能触发。现在 offset 来自 prefix_offset 的返回值。
  const oracle = recs.filter((r) => r.tier === 'oracle')
  assert.ok(oracle.length > 0)
  for (const r of oracle) {
    assert.equal(r.offset, 1, `${r.card} 偏移不是 1：${r.offset}`)
    // 后缀含义：`+partial` = 源站那份节选自己被从行中间切断，末行只对得上前缀；
    // `+extendedN` = 卡里的 Python 把整张 markdown 卡塞进了三引号字符串，围栏边界
    // 落在字符串中间，因此按语法把终点往后延了 N 行。两者都不改变「起点已校验」这件事。
    assert.match(r.cross_check, /^prefix@1(\+partial)?(\+extended\d+)?$/,
      `${r.card} 校验方式异常：${r.cross_check}`)
  }
})

test('围栏判据修好的那批卡不许再掉回未恢复（回归护栏）', () => {
  // 这些卡 2026-09-12 之前被判成「源站卡 ≠ vault 卡」，实际是围栏判据漏读。
  // 逐张点名：判据再退回去，这里必须红，而不是只在总数上少几行。
  const mustBeOracle = [
    'Skill-Context-Kubernetes-KB-Orchestration',
    'Skill-Cost-Aware-Agent-Scheduling',
    'Skill-Ontology-Schema-Design',
    'Skill-Realtime-Feature-Collection',
    'Skill-Trajectory-Pattern-Mining',
    'Skill-Visual-Data-Collection',
    'Skill-Multi-Objective-Budget-Allocation',
    'Skill-SQL-Agent-Text-to-SQL',
    'Skill-SC-Agent-MCP-ERP-Integration',
    'Skill-Graph-OKB-Design-SC',
    'Skill-Cleanroom-Audience-Collaboration',
    'Skill-Skill-Lifecycle-Design',
    'Skill-Property-Graph-Query-Optimization',
    'Skill-Memory-as-Action',
    'Skill-Compliance-Scored-Guardrail-Orchestration',
  ]
  const bad = mustBeOracle.filter((c) => doc.cards[c]?.tier !== 'oracle')
  assert.deepEqual(bad, [], `这些卡掉出了确证集：${bad.join(', ')}`)
})

test('被行内 ``` 截断过的卡，实现长度必须是修好之后的长度（回归护栏）', () => {
  // 卡里的 Python 自己写了抓围栏的正则，正文里就带 ```；旧判据在那里提前收尾。
  const floors = {
    'Skill-Skill-Card-API-Serving': 200,
    'Skill-Argos-Agentic-Anomaly-Detection': 200,
    'Skill-CodeRAG-Repository-Level-Retrieval': 150,
  }
  for (const [card, floor] of Object.entries(floors)) {
    const r = doc.cards[card]
    assert.ok(r, `缺 ${card} 的记录`)
    assert.ok(r.lines >= floor, `${card} 只有 ${r.lines} 行，少于回归下限 ${floor}`)
  }
})

test('确证集规模下限：低于它说明源或口径变了，必须响亮失败', () => {
  // 与脚本里的 MIN_ORACLE_CARDS 同一个数，写在这里是为了让「悄悄少恢复」在测试层也拦一次。
  assert.ok(doc.stats.oracle >= 1200, `确证集只有 ${doc.stats.oracle} 张`)
  assert.equal(doc.stats.cards, 1338)
})

test('四个总数是**钉死的**：1,338 张 / 落盘 1,317 / 可 parse 1,297 / 缺陷 5+15', () => {
  // 为什么钉死：这三个数（1338 / 1317 / 1297）被反复重新「发现」过 —— 每轮都有人
  // 从零跑一遍统计才知道现状。钉在这里之后，**改数就是改断言**，谁都不能悄悄挪。
  //
  // 它和 `--check` 不重复：`--check` 是「索引 vs 按现判据重算」，脚本一旦改了判据、
  // 索引跟着重生成，两边就一起漂移且互相印证；只有钉死的绝对值能拦住那种漂移。
  assert.equal(doc.stats.recovered, 1317, '落盘张数变了')
  assert.equal(doc.stats.parses, 1297, '可 ast.parse 的张数变了')
  assert.equal(doc.stats.parses, doc.stats.parses_of_recovered)
  assert.deepEqual(doc.stats.defects, { WINDOW_TRUNCATED: 15, UNLABELED: 5 },
    '缺陷分解变了 —— 改这里必须同时改 README 与 ADR-0051 的口径表')
  assert.equal(doc.stats.unrecovered, 21)
  // 分解必须正好解释「落盘但不能 parse」的差额，不是另凑一个数。
  const broken = doc.stats.recovered - doc.stats.parses
  assert.equal(broken, 20)
  assert.equal(Object.values(doc.stats.defects).reduce((a, b) => a + b, 0), broken)
})

test('parses=false 必须带 defect，且 defect 只出现在 parses=false 的卡上', () => {
  for (const r of recs) {
    if (r.tier === 'unrecovered') {
      assert.equal(r.defect, undefined, `${r.card} 未恢复却带 defect`)
      continue
    }
    if (r.parses) {
      assert.equal(r.defect, undefined, `${r.card} 能 parse 却带 defect：${r.defect}`)
    } else {
      assert.ok(DEFECTS.has(r.defect), `${r.card} 的 defect 不在封闭词表里：${r.defect}`)
      assert.ok(r.defect_detail, `${r.card} 缺 defect_detail`)
    }
  }
})

test('stats.defects 与逐卡记录一致，且分解就是「卡写坏」对「判据未定终点」', () => {
  const s = doc.stats
  const counted = {}
  for (const r of recs) {
    if (r.defect) counted[r.defect] = (counted[r.defect] || 0) + 1
  }
  assert.deepEqual(s.defects, counted)
  assert.equal(
    Object.values(s.defects).reduce((a, b) => a + b, 0),
    s.recovered - s.parses_of_recovered,
    '分解合计必须等于「已恢复但不能 parse」的张数',
  )
  // 两个方向都不许单边归零：全归 UNLABELED 说明窗口判据退化，全归 WINDOW 说明源码缺陷判据失效。
  assert.ok(s.defects.UNLABELED > 0 && s.defects.WINDOW_TRUNCATED > 0,
    `分解退化成一个方向了：${JSON.stringify(s.defects)}`)
})

test('源码写坏的那 5 张：每张都定位到了具体行与具体原因（点名回归护栏）', () => {
  // 这 5 张的围栏之后只剩收栏 —— 终点唯一确定，取到的就是全部，解析失败只能来自源码本身。
  // 逐张点名并锁定缺陷行：判据退化成「一律说窗口截断」时这里必须红。
  const want = {
    'Skill-CodeXEmbed-Code-Semantic-Embedding': { line: 208, re: /三引号串体内第 208 行又出现三引号/ },
    'Skill-Model-Performance-Monitor': { line: 62, re: /控制字符 U\+0001/ },
    'Skill-RFM-Segment-Campaign-Dispatcher': { line: 170, re: /收尾 '}' 与第 168 行的开符号 '\(' 不匹配/ },
    'Skill-Real-Time-Competitive-Repricing': { line: 58, re: /第 58 行的 """ 到末尾仍未收尾/ },
    'Skill-TimeCMA-LLM-Forecasting': { line: 1, re: /模块名 'paper2skills-code\.03-时间序列\.time_cma_llm_2025\.model' 不是合法标识符/ },
  }
  for (const [card, exp] of Object.entries(want)) {
    const r = doc.cards[card]
    assert.ok(r, `缺 ${card} 的记录`)
    assert.equal(r.parses, false, `${card} 现在能 parse 了 —— 若确实修好，请同步更新这条断言`)
    assert.equal(r.defect, 'UNLABELED', `${card} 被归成了 ${r.defect}（源码写坏的那批不许归成窗口截断）`)
    assert.equal(r.defect_line, exp.line, `${card} 的缺陷行变了：${r.defect_line}`)
    assert.match(r.defect_detail, exp.re, `${card} 的缺陷原因变了：${r.defect_detail}`)
  }
})

test('恢复区把卡正文圈进来的那 15 张：必须标 WINDOW_TRUNCATED，且不许混进确证集之外的任何交付', () => {
  const thirty = recs.filter((r) => r.defect === 'WINDOW_TRUNCATED')
  assert.equal(thirty.length, 15, `窗口截断应是 15 张，实际 ${thirty.length}`)
  for (const r of thirty) {
    assert.equal(r.tier, 'unverified',
      `${r.card} 标成 ${r.tier} 却是窗口截断 —— 无 oracle 可定时才会吞正文，确证集不该出现`)
  }
})
