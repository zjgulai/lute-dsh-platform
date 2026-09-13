#!/usr/bin/env node
/**
 * measure-contract-gate.mjs — PHASE6 S12 验收判据 ③ 的**对照测量**仪器。
 *
 * 要回答的问题只有一句：**「不被契约引用的卡，真的不进模型目录吗？」**
 * 换措辞的证明不算证明 —— 这里用同一份生成器、同一个技能库、同一份材料，
 * 只翻一个环境变量（`P2S_CONTRACT_GATE=count | enforce`），然后**逐字节比对两次产出的
 * preset 白名单**，把「某张卡从有到无」这件事钉成可复跑的读数。
 *
 * 判据（每条都能失败）：
 *   A 基线一致     当前 `~/.dsh/.agent-presets` 与 count 臂逐岗 subset **完全相同**
 *                  （证明线上模型目录就是 count 臂的产物，对照才有意义）
 *   B 待挂契约的卡  enforce 臂里必须**缺席**、count 臂里必须**在位**（≥1 张，逐张列出）
 *   C 已挂契约的卡  两臂都必须在位（防止「闸门把整条白名单都砍了」也算通过）
 *   D 非 p2s 技能   两臂完全一致（平台原生技能与 pb 手册技能不归本闸门管）
 *   E 反向          把 `--card` 指定的已挂契约卡人为当成未挂 ⇒ B 的判定必须翻转
 *                  （证伪「这条判据恒真」）
 *
 * 产出目录在系统临时目录，**绝不写 ~/.dsh**。
 *
 * 用法：
 *   node scripts/role-presets/measure-contract-gate.mjs
 *   node scripts/role-presets/measure-contract-gate.mjs --keep      # 保留临时产出以便人工翻看
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tmpdir, homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const PKG = join(REPO, 'packages', 'capabilities', 'dsh-paper2skills')
const GENERATE = join(HERE, 'generate.mjs')
const KEEP = process.argv.includes('--keep')
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }

const LIVE = process.env.P2S_PRESET_ROOT ?? join(homedir(), '.dsh', '.agent-presets')
const WORK = join(tmpdir(), `s12-measure-${Date.now()}`)
const OUT_COUNT = join(WORK, 'count')
const OUT_ENFORCE = join(WORK, 'enforce')

/** 从 preset 目录读每岗 skill-subset（与生产链路同一个落点：manifest 的 x_lute.skills.subset）。 */
function readSubsets(root) {
  const out = new Map()
  if (!existsSync(root)) return out
  for (const d of readdirSync(root).filter((n) => /^agt-\d+$/.test(n)).sort()) {
    const p = join(root, d, 'manifest.json')
    if (!existsSync(p)) continue
    const m = JSON.parse(readFileSync(p, 'utf8'))
    const subset = m?.x_lute?.skills?.subset ?? m?.skills?.subset
    if (Array.isArray(subset)) out.set(d, subset.slice().sort())
  }
  return out
}

/** 从 preset 目录读每岗 agent.cordis.yml 里的 skill-subset 行（**模型目录的实物**）。 */
function readCompositionSubsets(root) {
  const out = new Map()
  for (const d of readdirSync(root).filter((n) => /^agt-\d+$/.test(n)).sort()) {
    const p = join(root, d, 'agent.cordis.yml')
    if (!existsSync(p)) continue
    const line = /^\s*skills: \[(.*)\]\s*$/m.exec(readFileSync(p, 'utf8'))
    if (!line) continue
    out.set(d, line[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean).sort())
  }
  return out
}

function runGenerator(mode, outDir) {
  mkdirSync(outDir, { recursive: true })
  const r = spawnSync(process.execPath, [GENERATE], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, P2S_CONTRACT_GATE: mode, ROLE_PRESET_OUT: outDir },
  })
  if (r.status !== 0) {
    console.error(`✗ ${mode} 臂生成失败（exit ${r.status}）`)
    console.error((r.stdout ?? '').split('\n').slice(-15).join('\n'))
    console.error(r.stderr ?? '')
    process.exit(3)
  }
  return r.stdout ?? ''
}

const fails = []
const assert = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`)
  else { console.log(`  ✗ ${name}   ${detail}`); fails.push(name) }
}

console.log('=== S12 对照测量：不被契约引用的卡是否真的不进模型目录 ===')
console.log(`工作目录（临时，不碰 ~/.dsh）：${WORK}`)
console.log('')

console.log('· 生成 count 臂（过渡期口径）…')
const countLog = runGenerator('count', OUT_COUNT)
console.log('· 生成 enforce 臂（硬拦）…')
const enforceLog = runGenerator('enforce', OUT_ENFORCE)

const live = readSubsets(LIVE)
const cSub = readSubsets(OUT_COUNT)
const eSub = readSubsets(OUT_ENFORCE)
const cComp = readCompositionSubsets(OUT_COUNT)
const eComp = readCompositionSubsets(OUT_ENFORCE)

console.log('')
console.log('── 判据 A：线上模型目录 == count 臂 ──')
const roles = [...cSub.keys()].sort()
const liveMismatch = roles.filter((r) => JSON.stringify(live.get(r)) !== JSON.stringify(cSub.get(r)))
assert(`A 当前线上 ${live.size} 个岗位的 subset 与 count 臂逐岗相同`,
  live.size === roles.length && liveMismatch.length === 0,
  `线上 ${live.size} 岗 / count 臂 ${roles.length} 岗；不一致：${liveMismatch.slice(0, 5).join(', ')}`)

console.log('')
console.log('── 判据 B：待挂契约的卡在 enforce 臂里消失 ──')
const dropped = []
for (const r of roles) {
  const c = new Set(cSub.get(r) ?? [])
  const e = new Set(eSub.get(r) ?? [])
  for (const s of c) if (!e.has(s)) dropped.push({ role: r, slug: s })
}
assert(`B1 enforce 臂确实移除了条目（${dropped.length} 条 / 跨 ${new Set(dropped.map((d) => d.role)).size} 个岗位）`, dropped.length > 0)
const sample = dropped[0]
assert(`B2 抽一张卡做物证：${sample ? sample.slug : '—'} 在 count 臂在位、enforce 臂缺席`,
  !!sample && (cSub.get(sample.role) ?? []).includes(sample.slug) && !(eSub.get(sample.role) ?? []).includes(sample.slug))

console.log('')
console.log('── 判据 C：已挂契约的卡两臂都在位 ──')
// 已挂契约的卡从 count 臂的 manifest 读（生成器自己写的账）
const boundSlugs = new Set()
for (const r of roles) {
  const m = JSON.parse(readFileSync(join(OUT_COUNT, r, 'manifest.json'), 'utf8'))
  for (const s of m?.x_lute?.skills?.contract_gate?.bound ?? []) boundSlugs.add(s)
}
assert(`C1 count 臂的账里有已挂契约的卡（${boundSlugs.size} 张）`, boundSlugs.size > 0)
const wronglyRemoved = []
for (const r of roles) {
  const e = new Set(eSub.get(r) ?? [])
  for (const s of (cSub.get(r) ?? [])) if (boundSlugs.has(s) && !e.has(s)) wronglyRemoved.push(`${r}:${s}`)
}
assert('C2 已挂契约的卡一张都没被 enforce 移除', wronglyRemoved.length === 0, wronglyRemoved.slice(0, 5).join(', '))

console.log('')
console.log('── 判据 D：非 p2s 技能两臂一致 ──')
const nonP2sDiff = []
for (const r of roles) {
  const a = (cSub.get(r) ?? []).filter((s) => !s.startsWith('p2s-'))
  const b = (eSub.get(r) ?? []).filter((s) => !s.startsWith('p2s-'))
  if (JSON.stringify(a) !== JSON.stringify(b)) nonP2sDiff.push(r)
}
assert('D 平台原生技能与 pb 手册技能不受闸门影响', nonP2sDiff.length === 0, nonP2sDiff.slice(0, 5).join(', '))
const p2sCountBefore = roles.reduce((n, r) => n + (cSub.get(r) ?? []).filter((s) => s.startsWith('p2s-')).length, 0)
const p2sCountAfter = roles.reduce((n, r) => n + (eSub.get(r) ?? []).filter((s) => s.startsWith('p2s-')).length, 0)
console.log(`  · p2s 条目：count 臂 ${p2sCountBefore} 条 → enforce 臂 ${p2sCountAfter} 条（−${p2sCountBefore - p2sCountAfter}）`)
console.log(`  · 非 p2s 条目：两臂均 ${roles.reduce((n, r) => n + (cSub.get(r) ?? []).filter((s) => !s.startsWith('p2s-')).length, 0)} 条`)

console.log('')
console.log('── 判据 E：反向 —— 摘掉引用它的契约，该卡必须**也**从模型目录消失 ──')
// 首版这里写的是「人为构造一个 dropped 集合，断言它包含该卡」—— 那是**恒真的摆设断言**
// （自证抓出）。真正的反向必须让因果翻面：同一张**已挂契约**的卡，只把引用它的那份契约摘掉，
// 它就必须从 enforce 臂消失 ⇒ 证明「在不在目录里」确实由契约决定，而不是相关。
const probeCard = flag('probe', [...boundSlugs][0])
const probeRole = roles.find((r) => (cSub.get(r) ?? []).includes(probeCard))
assert(`E1 探针卡 ${probeCard} 在 ${probeRole} 的白名单里且已挂契约`, !!probeRole && boundSlugs.has(probeCard))

// 造一份「少一份契约」的 vault：只复制契约目录与精选线清单，其余按需
const vaultSrc = process.env.P2S_VAULT ?? join(REPO, '..', 'paper_to_skills', 'paper2skills-vault')
const revVault = join(WORK, 'rev-vault')
mkdirSync(join(revVault, '07-资源库'), { recursive: true })
const cp = spawnSync('cp', ['-R', join(vaultSrc, '07-资源库', 'contracts'), join(revVault, '07-资源库', 'contracts')])
if (cp.status !== 0) { console.error('✗ 复制契约目录失败'); process.exit(3) }
writeFileSync(join(revVault, '07-资源库', 'card-classification.json'),
  readFileSync(join(vaultSrc, '07-资源库', 'card-classification.json')))

// 找出并摘掉引用探针卡的那份契约
let removedContract = null
for (const sub of ['A', 'B']) {
  const d = join(revVault, '07-资源库', 'contracts', sub)
  if (!existsSync(d)) continue
  for (const f of readdirSync(d).filter((n) => /^CTR-.*\.md$/.test(n))) {
    const t = readFileSync(join(d, f), 'utf8')
    const line = /^cards:[ \t]*\[(.*)\][ \t]*$/m.exec(t)
    if (line && line[1].split(',').map((s) => s.trim()).includes(probeCard)) {
      rmSync(join(d, f))
      if (!removedContract) removedContract = f
    }
  }
}
assert(`E2 找得到并摘掉了引用 ${probeCard} 的契约（${removedContract}）`, !!removedContract)

const revOut = join(WORK, 'reverse')
mkdirSync(revOut, { recursive: true })
const revRun = spawnSync(process.execPath, [GENERATE], {
  cwd: REPO,
  encoding: 'utf8',
  env: { ...process.env, P2S_CONTRACT_GATE: 'enforce', P2S_VAULT: revVault, ROLE_PRESET_OUT: revOut },
})
assert('E3 反向臂生成成功', revRun.status === 0, `exit=${revRun.status} ${(revRun.stderr ?? '').slice(0, 200)}`)
const revSub = readSubsets(revOut)
assert(`E4 摘掉契约后，${probeCard} 从模型目录消失（因果翻面）`,
  probeRole ? !(revSub.get(probeRole) ?? []).includes(probeCard) : false,
  `反向臂 ${probeRole} 仍有它`)
// 对照：另一张已挂契约、契约仍在的卡必须留下
const control = [...boundSlugs].find((s) => s !== probeCard)
const controlRole = roles.find((r) => (eSub.get(r) ?? []).includes(control))
assert(`E5 对照：契约仍在的 ${control} 必须留在目录里（不是「反向臂把所有卡都砍了」）`,
  !!controlRole && (revSub.get(controlRole) ?? []).includes(control),
  `反向臂 ${controlRole} 里没有 ${control}`)

console.log('')
console.log('── 判据 F：模型目录实物（agent.cordis.yml 的 skill-subset 行）与 manifest 一致 ──')
const compMismatch = roles.filter((r) =>
  JSON.stringify(cComp.get(r) ?? []) !== JSON.stringify(cSub.get(r) ?? []) ||
  JSON.stringify(eComp.get(r) ?? []) !== JSON.stringify(eSub.get(r) ?? []))
assert('F 两臂的 cordis.yml 与 manifest 逐岗一致（账不是另一份事实源）', compMismatch.length === 0, compMismatch.slice(0, 5).join(', '))

console.log('')
console.log('=== 物证 ===')
console.log(`卡：${sample?.slug}`)
console.log(`岗位：${sample?.role}`)
console.log(`  count 臂   agent.cordis.yml 里 ${(cComp.get(sample?.role) ?? []).includes(sample?.slug) ? '有' : '无'} 该卡`)
console.log(`  enforce 臂 agent.cordis.yml 里 ${(eComp.get(sample?.role) ?? []).includes(sample?.slug) ? '有' : '无'} 该卡`)
console.log(`  ⇒ 该卡${(cComp.get(sample?.role) ?? []).includes(sample?.slug) && !(eComp.get(sample?.role) ?? []).includes(sample?.slug) ? '确实' : '未能'}在硬拦模式下退出模型目录`)
console.log(`  该卡的契约引用数：${boundSlugs.has(sample?.slug) ? '>0（不应被移除！）' : '0（因此被移除）'}`)

console.log('')
console.log('=== 生成器自报的两臂账 ===')
for (const [name, log] of [['count', countLog], ['enforce', enforceLog]]) {
  const lines = log.split('\n').filter((l) => /契约闸门|已挂契约|待挂契约|硬拦|过渡期/.test(l))
  console.log(`  [${name}] ${lines.map((l) => l.trim()).join(' | ')}`)
}

writeFileSync(join(WORK, 'evidence.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  live_presets: LIVE,
  roles: roles.length,
  dropped,
  probe: { card: sample?.slug, role: sample?.role },
  bound_slugs: [...boundSlugs].sort(),
  p2s_before: p2sCountBefore,
  p2s_after: p2sCountAfter,
  fails,
}, null, 1))
console.log('')
console.log(`证据 JSON：${join(WORK, 'evidence.json')}`)

if (KEEP) console.log(`两臂产出保留在：${WORK}`)
else rmSync(WORK, { recursive: true, force: true })

if (fails.length) {
  console.error(`\n✗ 对照测量失败 ${fails.length} 项：${fails.join(' / ')}`)
  process.exit(1)
}
console.log('\n★ 对照测量通过：不被契约引用的卡在硬拦模式下真的退出模型目录，已挂契约的一张没动。')
process.exit(0)
