#!/usr/bin/env node
/**
 * check-contract-gate.mjs — PHASE6 S12 消费口闸门：核对「进模型目录的卡是否都被契约引用」。
 *
 * 入（前两项在 vault 仓，后一项是本机运行时实物）：
 *   paper2skills-vault/07-资源库/contracts/{A,B}/CTR-*.md    契约（cards = 挂载点）
 *   paper2skills-vault/07-资源库/card-classification.json     精选线 146 张（识别「待装线」引用）
 *   data/classification.json                                  已装线 1338 张（slug ↔ id，白名单认 slug）
 *   ~/.dsh/.agent-presets/agt-<NNN>/manifest.json             **模型目录实物**（每岗 skill-subset）
 *
 * 出：stdout 人读对账表 + `--json-out` 机读账 + 退出码。
 *
 * 退出码（四态，与 check_contracts.py 同口径）：
 *   0 = 对账通过
 *   1 = 判红（有真缺陷，或 --enforce 下有卡该拦而没拦）
 *   2 = **输入没拿到**（契约目录或 classification 缺失 —— 「没东西可查」不等于「查过了没问题」）
 *   3 = 门禁内部错误（与判红分开：门禁自己崩了不该长得像判红）
 *
 * 两种模式（口径差别必须写明，禁止互相换算）：
 *   `--check`（默认）= **过渡期对账**：算出四态账 + 判数据缺陷，**不硬拦**（Q5 过渡期口径）。
 *   `--enforce`     = **硬拦判定**：按「必须被契约引用」过滤白名单，报出会被移除的条目并判红/绿。
 *                     这是**对照测量的仪器** —— 用它证明某张卡真的不进模型目录。
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir, homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import {
  DEFAULT_VAULT, CONTRACTS_REL, CARD_CLASSIFICATION_REL, CARD_STATE, REF_KIND,
  readContracts, resolveRefs, readPresetSubsets, computeLedger, filterSubset,
  contractsWithoutBinding, frontmatterBlock, listField,
} from '../lib/contract-gate.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(HERE, '..')
const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const has = (n) => argv.includes(`--${n}`)

const VAULT = flag('vault', DEFAULT_VAULT)
const CONTRACTS = join(VAULT, CONTRACTS_REL)
const CARD_CLS = join(VAULT, CARD_CLASSIFICATION_REL)
const CLS = flag('classification', join(PKG_ROOT, 'data/classification.json'))
const PRESETS = flag('presets', process.env.P2S_PRESET_ROOT ?? join(homedir(), '.dsh', '.agent-presets'))
const JSON_OUT = flag('json-out', null)

/** 退出码 3 的载体：门禁自己崩了，不许长得像判红。 */
function internalError(err) {
  console.error('✗ [exit 3] 门禁内部错误（不是判红 —— 被核对的资产可能完全正常）：')
  console.error(err && err.stack ? err.stack : String(err))
  process.exit(3)
}

function loadInputs() {
  for (const [name, p] of [['契约目录', CONTRACTS], ['card-classification.json', CARD_CLS], ['classification.json', CLS]]) {
    if (!existsSync(p)) {
      console.error(`✗ [exit 2] 输入没拿到：${name} 不存在（${p}）`)
      console.error('  用 --vault / --classification 或环境变量 P2S_VAULT 指定。')
      process.exit(2)
    }
  }
  const cls = JSON.parse(readFileSync(CLS, 'utf8'))
  const items = cls.items ?? cls.classified ?? []
  if (!Array.isArray(items) || items.length === 0) {
    console.error(`✗ [exit 2] classification.json 里读不到 items（拿到 ${items.length} 条）—— 空的分类库不是「零缺陷」`)
    process.exit(2)
  }
  const slugById = new Map()
  const installedSlugs = new Set()
  for (const it of items) {
    if (!it?.slug) continue
    installedSlugs.add(it.slug)
    if (it.id) slugById.set(it.id, it.slug)
  }
  const sel = JSON.parse(readFileSync(CARD_CLS, 'utf8'))
  const selIds = new Set((sel.items ?? sel.cards ?? []).map((x) => x.id).filter(Boolean))
  if (selIds.size === 0) {
    // 精选线读空 ⇒ 所有 `Skill-*` 引用会被误判成「无法解析」。宁可 exit 2，也不制造假红。
    console.error('✗ [exit 2] card-classification.json 里读不到任何卡 id —— 会让全部 id 形态引用被误判为缺陷')
    process.exit(2)
  }
  return { items, slugById, installedSlugs, selIds }
}

function main() {
  const t0 = Date.now()
  const { items, slugById, installedSlugs, selIds } = loadInputs()

  const { contracts, problems: contractProblems, missing } = readContracts(CONTRACTS)
  if (missing) {
    console.error(`✗ [exit 2] 契约目录下没有 A/ 或 B/（${CONTRACTS}）`)
    process.exit(2)
  }
  const { bySlug, refs, counts: refCounts } = resolveRefs({ contracts, slugById, installedSlugs, selIds })

  const subsets = readPresetSubsets(PRESETS)
  if (subsets.missing) {
    // 「读不到模型目录」与「模型目录里没有未挂契约的卡」是两件事。前者必须 exit 2：
    // 否则第一版那个字段名没对上的 bug 会伪装成「已挂契约 0 / 未接线 1338」的**假绿**。
    console.error(`✗ [exit 2] 模型目录实物读不到（${PRESETS}）`)
    console.error(`  见到 manifest ${subsets.manifests} 份，其中取到 skills.subset 的 ${subsets.roles} 份。`)
    for (const u of subsets.unreadable.slice(0, 5)) console.error(`  · ${u}`)
    if (subsets.unreadable.length > 5) console.error(`  …另有 ${subsets.unreadable.length - 5} 份`)
    console.error('  先跑 `node scripts/role-presets/generate.mjs` 生成 50 个岗位 preset，或用 --presets 指定目录。')
    process.exit(2)
  }
  const ledger = computeLedger({ items, p2sByRole: subsets.p2sByRole, bySlug })
  const boundBySlug = new Map(ledger.boundWired.map((c) => [c.slug, '已挂契约']))

  // ── 硬拦模式：按同一份判据过滤每个岗位的白名单 ────────────────────────────────
  const enforce = has('enforce')
  const perRoleFilter = []
  let totalDropped = 0
  for (const [role, ids] of subsets.byRole) {
    const { kept, dropped } = filterSubset(ids, boundBySlug)
    totalDropped += dropped.length
    if (dropped.length) perRoleFilter.push({ role, dropped: dropped.sort(), kept: kept.length })
  }

  // ── 缺陷（真判红项）：与「过渡期计不计入」无关，它们是数据缺陷 ─────────────────
  const unresolvable = refs.filter((r) => r.kind === REF_KIND.UNRESOLVABLE)
  const pendingInstall = refs.filter((r) => r.kind === REF_KIND.PENDING_INSTALL)
  const unboundContracts = contractsWithoutBinding(contracts, refs)
  // 「可写但零绑定」要拆两态，否则会把**合法的 S5 前置依赖**判成缺陷（假红）：
  //   · 引用了精选线卡（待装线）⇒ 契约没错，是卡还没装线 ⇒ 记「待装线契约」，不判红；
  //   · 三个命名空间都指不到任何东西 ⇒ 真缺陷。
  const pendingInstallContracts = new Set(pendingInstall.map((r) => r.contract))
  const trulyUnbound = unboundContracts.filter((c) => !pendingInstallContracts.has(c.id))
  const waitingInstall = unboundContracts.filter((c) => pendingInstallContracts.has(c.id))
  const defects = []
  if (contractProblems.length) defects.push({ key: 'CONTRACT_MALFORMED', rows: contractProblems })
  if (unresolvable.length) defects.push({ key: 'REF_UNRESOLVABLE', rows: unresolvable })
  if (ledger.ghostWired.length) {
    defects.push({
      key: 'WIRED_NOT_IN_CLASSIFICATION',
      rows: ledger.ghostWired.map((s) => ({ slug: s, detail: '白名单里有它，但 classification.json 里没有这张卡（第二份事实源风险）' })),
    })
  }
  if (trulyUnbound.length) defects.push({ key: 'CONTRACT_WRITABLE_BUT_UNBOUND', rows: trulyUnbound })

  // ── 人读对账表 ──────────────────────────────────────────────────────────────
  console.log('=== S12 消费口闸门 · 对账 ===')
  console.log(`模式：${enforce ? '--enforce（硬拦判定，这是对照测量的仪器）' : '--check（过渡期对账，不硬拦）'}`)
  console.log(`契约：${contracts.length} 份（A ${contracts.filter((c) => c.sub === 'A').length} / B ${contracts.filter((c) => c.sub === 'B').length}）`)
  console.log(`引用条目：${refs.length} 条 → 绑定 ${refCounts[REF_KIND.BOUND]} / 待装线 ${refCounts[REF_KIND.PENDING_INSTALL]} / 无法解析 ${refCounts[REF_KIND.UNRESOLVABLE]}`)
  console.log(`模型目录实物：${subsets.roles} 个岗位 preset（${PRESETS}）`)
  console.log('')
  console.log('卡的四态账（分母 = classification.json 已装线）：')
  console.log(`  已装线卡总数      ${ledger.total}`)
  console.log(`  ├ 已挂契约        ${ledger.counts[CARD_STATE.BOUND]}`)
  console.log(`  ├ 待挂契约        ${ledger.counts[CARD_STATE.PENDING]}   ← 进白名单、无契约引用`)
  console.log(`  └ 未接线          ${ledger.counts[CARD_STATE.UNWIRED]}   ← 与 S12 无关（S13/Q4 的账）`)
  console.log('')
  console.log(`白名单里的 p2s 条目（跨岗位去重）：${ledger.wiredSlugs.length}`)
  console.log(`  ├ 已挂契约        ${ledger.boundWired.length}`)
  console.log(`  └ 待挂契约        ${ledger.pendingWired.length}`)
  if (enforce) {
    console.log('')
    console.log(`--enforce 会从白名单移除：${totalDropped} 条（跨 ${perRoleFilter.length} 个岗位）`)
    for (const r of perRoleFilter.slice(0, 5)) console.log(`  ${r.role}: −${r.dropped.length} → 剩 ${r.kept}   例：${r.dropped.slice(0, 2).join(', ')}`)
    if (perRoleFilter.length > 5) console.log(`  …另有 ${perRoleFilter.length - 5} 个岗位同样受影响`)
  }
  if (pendingInstall.length) {
    console.log('')
    console.log(`待装线引用 ${pendingInstall.length} 条（契约写的是精选线 id，S5 换底前它不在技能目录里）：`)
    for (const r of pendingInstall) console.log(`  ${r.contract}: ${r.raw}`)
    console.log(`  ⇒ 其中 ${waitingInstall.length} 份契约因此暂时零绑定（CTR：${waitingInstall.map((c) => c.id).join(', ')}）`)
    console.log('     这不是缺陷，是 S5（p2s 换底装精选线）的前置依赖；换底后若 id 与 slug 对不上，本闸门会立刻报 REF_UNRESOLVABLE。')
  }
  if (defects.length) {
    console.log('')
    console.log(`✗ 真缺陷 ${defects.length} 类：`)
    for (const d of defects) {
      console.log(`  [${d.key}] ${d.rows.length} 条`)
      for (const row of d.rows.slice(0, 8)) console.log(`    ${JSON.stringify(row)}`)
      if (d.rows.length > 8) console.log(`    …另有 ${d.rows.length - 8} 条（见 --json-out）`)
    }
  } else {
    console.log('')
    console.log('★ 无数据缺陷（引用全部可解析、白名单无编外条目、无「可写却零绑定」的契约）')
  }

  const verdict = defects.length > 0 ? 1 : (enforce && totalDropped > 0 ? 1 : 0)
  console.log('')
  console.log(verdict === 0
    ? `★ 判定：${enforce ? '硬拦后白名单全部被契约引用' : '对账通过（过渡期不硬拦）'}`
    : (defects.length > 0 ? '✗ 判定：存在数据缺陷（见上）' : `✗ 判定：--enforce 下有 ${totalDropped} 条白名单条目未被任何契约引用`))

  const out = {
    _meta: {
      gate: 'S12-contract-consumption',
      mode: enforce ? 'enforce' : 'check',
      vault: VAULT,
      presets_root: PRESETS,
      generated_at: new Date().toISOString(),
      elapsed_ms: Date.now() - t0,
    },
    inputs: {
      contracts: contracts.length,
      contracts_a: contracts.filter((c) => c.sub === 'A').length,
      contracts_b: contracts.filter((c) => c.sub === 'B').length,
      classification_total: ledger.total,
      presets: subsets.roles,
    },
    refs: { total: refs.length, ...refCounts, pending_install: pendingInstall, unresolvable },
    counts: ledger.counts,
    wired: {
      distinct_p2s: ledger.wiredSlugs.length,
      bound: ledger.boundWired.length,
      pending: ledger.pendingWired.length,
      pending_rows: ledger.pendingWired.map((c) => ({ slug: c.slug, roles: c.roles })),
    },
    enforce_dropped: perRoleFilter,
    defects,
    verdict,
  }
  if (JSON_OUT) {
    mkdirIfNeeded(dirname(resolve(JSON_OUT)))
    writeFileSync(resolve(JSON_OUT), JSON.stringify(out, null, 1))
    console.log(`已写机读账：${resolve(JSON_OUT)}`)
  }
  process.exit(verdict)
}

function mkdirIfNeeded(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

// ── selftest：每个判据配一份**能打红它**的变异样本 ──────────────────────────────
function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 's12-gate-'))
  const fails = []
  const assert = (name, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${name}`)
    else { console.log(`  ✗ ${name} ${detail}`); fails.push(name) }
  }
  const write = (rel, body) => {
    const p = join(tmp, rel)
    mkdirIfNeeded(dirname(p))
    writeFileSync(p, body)
    return p
  }
  const CONTRACT = (id, cards, status = '可写') => `---
contract_id: ${id}
template: A
responsibility: 测试
role_id: AGT-003
status: ${status}
cards: ${cards}
---
正文
`

  console.log('S12 闸门 selftest（每份变异都必须被打红）')

  // 1 反向：契约目录不存在 ⇒ 是「输入没拿到」，不是「零引用」
  const noneDir = join(tmp, 'nope', 'contracts')
  const r1 = readContracts(noneDir)
  assert('变异 1/9 契约目录不存在 ⇒ missing=true（调用方转 exit 2，不判绿）', r1.missing === true)

  // 2 多行 YAML 列表不得被读成「零引用」（漏洞 #11 同族）
  const d2 = join(tmp, 'v2', 'contracts')
  write('v2/contracts/A/CTR-A-900-多行.md', `---
contract_id: CTR-A-900
template: A
status: 可写
cards:
  - p2s-alpha
  - p2s-beta
---
正文
`)
  const r2 = readContracts(d2)
  assert('变异 2/9 多行 cards ⇒ CARDS_UNREADABLE（不得静默读成 0 条）',
    r2.problems.some((p) => p.kind === 'CARDS_UNREADABLE') && r2.contracts[0].cards === null,
    JSON.stringify(r2.problems))

  // 3 三个命名空间逐条落到三态
  const d3 = join(tmp, 'v3', 'contracts')
  write('v3/contracts/A/CTR-A-901-三命名空间.md', CONTRACT('CTR-A-901',
    '[p2s-alpha, Skill-Alpha, Skill-精选线卡, p2s-不存在]'))
  const r3 = readContracts(d3)
  const res3 = resolveRefs({
    contracts: r3.contracts,
    slugById: new Map([['Skill-Alpha', 'p2s-alpha']]),
    installedSlugs: new Set(['p2s-alpha']),
    selIds: new Set(['Skill-精选线卡']),
  })
  const kindOf = (raw) => res3.refs.find((x) => x.raw === raw)?.kind
  assert('变异 3/9 slug 形态 ⇒ bound', kindOf('p2s-alpha') === REF_KIND.BOUND)
  assert('变异 3/9 已装线 id ⇒ 归一化成 slug 后 bound', kindOf('Skill-Alpha') === REF_KIND.BOUND
    && res3.refs.find((x) => x.raw === 'Skill-Alpha').slug === 'p2s-alpha')
  assert('变异 3/9 精选线 id ⇒ pending-install（不算引用成功）', kindOf('Skill-精选线卡') === REF_KIND.PENDING_INSTALL)
  assert('变异 3/9 编造卡 ⇒ unresolvable（报红，不静默丢弃）', kindOf('p2s-不存在') === REF_KIND.UNRESOLVABLE)

  // 4 账真的会动：删掉引用该卡的契约 ⇒ 该卡从「已挂契约」掉到「待挂契约」
  const items = [
    { slug: 'p2s-alpha', id: 'Skill-Alpha', l3: ['A'] },
    { slug: 'p2s-beta', id: 'Skill-Beta', l3: ['B'] },
  ]
  const p2sByRole = new Map([['agt-001', ['p2s-alpha', 'p2s-beta']]])
  const before = computeLedger({ items, p2sByRole, bySlug: res3.bySlug })
  const after = computeLedger({ items, p2sByRole, bySlug: new Map() })
  assert('变异 4/9 删契约前：alpha 已挂契约', before.cards.find((c) => c.slug === 'p2s-alpha').state === CARD_STATE.BOUND)
  assert('变异 4/9 删契约后：alpha 掉到待挂契约（账不是摆设）',
    after.cards.find((c) => c.slug === 'p2s-alpha').state === CARD_STATE.PENDING
    && after.counts[CARD_STATE.PENDING] === 2 && after.counts[CARD_STATE.BOUND] === 0)

  // 5 白名单里的编外条目（classification 里没有）不得被静默略过
  const ghost = computeLedger({ items, p2sByRole: new Map([['agt-001', ['p2s-alpha', 'p2s-幽灵']]]), bySlug: new Map() })
  assert('变异 5/9 白名单编外条目 ⇒ ghostWired 非空', ghost.ghostWired.length === 1 && ghost.ghostWired[0] === 'p2s-幽灵')

  // 6 filterSubset 的正反两面（只有「全丢」也能过的过滤器是摆设）
  const bound = new Map([['p2s-alpha', '已挂契约']])
  const f = filterSubset(['p2s-alpha', 'p2s-beta', 'ecommerce-monthly-review', 'pb-002'], bound)
  assert('变异 6/9 已挂契约的卡必须 kept', f.kept.includes('p2s-alpha'))
  assert('变异 6/9 未挂契约的 p2s 卡必须 dropped', f.dropped.length === 1 && f.dropped[0] === 'p2s-beta')
  assert('变异 6/9 非 p2s 技能不归本闸门管（kept 且不 dropped）',
    f.kept.includes('ecommerce-monthly-review') && f.kept.includes('pb-002'))

  // 7 status 可写却零绑定 ⇒ 单独一类缺陷
  const d7 = join(tmp, 'v7', 'contracts')
  write('v7/contracts/A/CTR-A-902-零绑定.md', CONTRACT('CTR-A-902', '[Skill-精选线卡]'))
  const r7 = readContracts(d7)
  const res7 = resolveRefs({ contracts: r7.contracts, slugById: new Map(), installedSlugs: new Set(), selIds: new Set(['Skill-精选线卡']) })
  assert('变异 7/9 「可写」但只引用待装线 ⇒ 计入零绑定契约',
    contractsWithoutBinding(r7.contracts, res7.refs).length === 1)

  // 8 frontmatter 取不到 ≠ 字段缺失
  assert('变异 8/9 无 frontmatter ⇒ null（不是空串）', frontmatterBlock('# 只有正文\n') === null)
  assert('变异 8/9 listField 缺字段 ⇒ ok:false', listField('status: 可写', 'cards').ok === false)

  // 9 **本仪器自己踩过的坑**：preset manifest 的 subset 在 `x_lute.skills.subset`，
  //   第一版只读顶层 `m.skills.subset` ⇒ 50 个岗位全读空，而账照样打出来
  //   「已挂契约 0 / 未接线 1338」——一个看起来像真结果的假绿。两份样本钉住两个方向。
  write('p-ok/agt-001/manifest.json', JSON.stringify({ id: 'agt-001', x_lute: { skills: { subset: ['p2s-alpha', 'pb-002'] } } }))
  const okPresets = readPresetSubsets(join(tmp, 'p-ok'))
  assert('变异 9/9 x_lute.skills.subset ⇒ 读得到（不得读成零接线）',
    okPresets.roles === 1 && okPresets.byRole.get('agt-001').includes('p2s-alpha'), JSON.stringify(okPresets.unreadable))
  write('p-bad/agt-001/manifest.json', JSON.stringify({ id: 'agt-001', someOtherNamespace: { subset: ['p2s-alpha'] } }))
  const badPresets = readPresetSubsets(join(tmp, 'p-bad'))
  assert('变异 9/9 subset 落在未知键下 ⇒ missing=true（调用方转 exit 2，不判绿）',
    badPresets.missing === true && badPresets.manifests === 1, JSON.stringify(badPresets))

  // 10 **变异测试抓出来的缺口**：上面 9 组全在测库函数，`main()` 里那两道 exit 2 守卫
  //    没有任何用例能打红它们 —— 实测把守卫改成 `if (false)`，selftest 照样全绿
  //    （「断言恒真 = 没断言」，与 F2 抓出的 4 处摆设断言同型）。
  //    故这里**起子进程跑真 CLI**，直接断言退出码。
  const self = fileURLToPath(import.meta.url)
  const runCli = (args) => {
    const r = spawnSync(process.execPath, [self, ...args], { encoding: 'utf8' })
    return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
  }
  const badRun = runCli(['--presets', join(tmp, 'p-bad')])
  assert('变异 10/10 真 CLI + 坏 preset 根 ⇒ exit 2（不许打出「已挂契约 0」的假绿账）',
    badRun.code === 2 && /exit 2/.test(badRun.out), `exit=${badRun.code}`)
  const goodRun = runCli(['--presets', join(tmp, 'p-ok'), '--json-out', join(tmp, 'ok.json')])
  assert('变异 10/10 反向：可读的 preset 根 ⇒ 不得误判成 exit 2',
    goodRun.code !== 2, `exit=${goodRun.code} ${goodRun.out.slice(0, 120)}`)
  const noVault = runCli(['--vault', join(tmp, '不存在'), '--presets', join(tmp, 'p-ok')])
  assert('变异 10/10 反向：vault 缺失 ⇒ exit 2（输入没拿到 ≠ 零缺陷）',
    noVault.code === 2, `exit=${noVault.code}`)

  // 11 **变异测试第二轮抓出来的缺口**：M9（删掉「契约目录没有 A/B」守卫）与
  //    M10（unresolvable 不计入缺陷）两处**仍然漏网** —— 它们同样只在 `main()` 里。
  //    故再补一组**端到端夹具**：干净夹具必须 exit 0（防「什么输入都判红」的假仪表），
  //    同一份夹具插一条编造引用必须 exit 1。
  const fv = join(tmp, 'fv')
  const cleanContract = `---
contract_id: CTR-A-900
template: A
responsibility: 夹具
role_id: AGT-003
status: 可写
cards: [Skill-Alpha]
---
正文
`
  write('fv/07-资源库/contracts/A/CTR-A-900-夹具.md', cleanContract)
  write('fv/07-资源库/card-classification.json', JSON.stringify({ items: [{ id: 'Skill-Alpha' }] }))
  const fcls = write('fcls.json', JSON.stringify({ items: [{ slug: 'p2s-alpha', id: 'Skill-Alpha', l3: ['A'] }] }))
  const cleanRun = runCli(['--vault', fv, '--classification', fcls, '--presets', join(tmp, 'p-ok')])
  assert('变异 11/12 干净夹具 ⇒ exit 0（仪表不得「什么输入都判红」）',
    cleanRun.code === 0, `exit=${cleanRun.code} ${cleanRun.out.slice(-200)}`)
  write('fv/07-资源库/contracts/A/CTR-A-901-编造.md', cleanContract
    .replace('CTR-A-900', 'CTR-A-901').replace('[Skill-Alpha]', '[p2s-编造卡]'))
  const dirtyRun = runCli(['--vault', fv, '--classification', fcls, '--presets', join(tmp, 'p-ok')])
  assert('变异 11/12 插一条编造引用 ⇒ exit 1（REF_UNRESOLVABLE 必须判红）',
    dirtyRun.code === 1 && /REF_UNRESOLVABLE/.test(dirtyRun.out), `exit=${dirtyRun.code}`)
  rmSync(join(fv, '07-资源库/contracts/A/CTR-A-901-编造.md'), { force: true })

  // 12 「契约目录里既没有 A/ 也没有 B/」⇒ 输入没拿到，exit 2（不是「零引用」的绿）
  write('fv2/07-资源库/contracts/.keep', '')
  write('fv2/07-资源库/card-classification.json', JSON.stringify({ items: [{ id: 'Skill-Alpha' }] }))
  const emptyContracts = runCli(['--vault', join(tmp, 'fv2'), '--classification', fcls, '--presets', join(tmp, 'p-ok')])
  assert('变异 12/13 契约目录无 A/B ⇒ exit 2（不是「零引用」的绿）',
    emptyContracts.code === 2, `exit=${emptyContracts.code}`)

  // 13 空分类库 / 精选线读空 ⇒ exit 2。这一条是**第三轮变异测试**抓出来的：
  //    把「classification 读空就报错」改掉之后 selftest 全绿 —— 而那个守卫一旦失效，
  //    账会变成「已装线 0 张、已挂契约 0」的漂亮数字，看起来完全正常。
  const emptyCls = write('empty-cls.json', JSON.stringify({ items: [] }))
  const emptyClsRun = runCli(['--vault', fv, '--classification', emptyCls, '--presets', join(tmp, 'p-ok')])
  assert('变异 13/13 空分类库 ⇒ exit 2（不许打出「已装线 0 张」的漂亮账）',
    emptyClsRun.code === 2, `exit=${emptyClsRun.code}`)
  write('fv3/07-资源库/contracts/A/CTR-A-900-夹具.md', cleanContract)
  write('fv3/07-资源库/card-classification.json', JSON.stringify({ items: [] }))
  const emptySelRun = runCli(['--vault', join(tmp, 'fv3'), '--classification', fcls, '--presets', join(tmp, 'p-ok')])
  assert('变异 13/13 精选线读空 ⇒ exit 2（否则全部 id 形态引用被误判成缺陷 = 假红）',
    emptySelRun.code === 2, `exit=${emptySelRun.code}`)

  rmSync(tmp, { recursive: true, force: true })
  console.log('')
  if (fails.length) {
    console.error(`✗ selftest 失败 ${fails.length} 项：${fails.join(' / ')}`)
    process.exit(1)
  }
  console.log('★ selftest 全过（13 组 / 27 条断言，每份变异各自被对应用例打红）')
  process.exit(0)
}

try {
  if (has('selftest')) selftest()
  else main()
} catch (err) {
  internalError(err)
}
