import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mutationRoot } from '../../../../scripts/lib/mutation-fixture.mjs'
import { nodeCommand } from '../../../../scripts/lib/real-node.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUILDER = join(HERE, '..', 'scripts', 'build-generic-manifest.mjs')

/**
 * `build-generic-manifest.mjs --check` 的**退出码契约**（ADR-0085 §③）。
 *
 * ## 为什么要有这一层
 *
 * 这条契约只活在三个地方：派生器里一句 `process.exit(2)`，以及两个 verifier 里各一个
 * `if (e.status === 2)` 分支。它守的是**环境事实与数据缺陷不能共用一条红**：
 *
 * - `staging/` 按 `.gitignore:44` 不入库 → **任何一份干净的 clone 上都没有派生源**；
 * - 而 `manifest/generic-skills.json` 是入库的派生产物 → 没有源也照样存在。
 *
 * 两者混成一句话时，「派生源不在本机」会被报成「清单与派生源不一致」：前者的修法是
 * 「别跑这一项」，后者是「重建清单」。一句红字同时说两件事，两条路都不会被走——
 * 这正是 ADR-0085 给 `verify-fullstack` 诊过的病（把「预设组不在本机」报成「预设副本丢失」），
 * 也是本项当初要修的东西。所以**跳过必须是可分辨的**，且必须能被反向验证：
 * 数据真的坏了的时候，退出码必须还是 1。
 *
 * 这三条用例跑在临时目录里（派生器只 import node: 内建模块，可以单独拷走），
 * 不动仓库里的真 manifest。
 */

/**
 * 从派生器**源码**里取出分组标题与 T0 名单，拼一份最小可用的派生源。
 *
 * 为什么从源码取而不在这里抄一份名单：抄一份就是给 T0 名单造第二个家，
 * 而本项存在的理由正是「一条事实一个家」（ADR-0009）。源码是唯一入口，
 * 它改了这里跟着改，不会漂移。
 */
function minimalLocalize() {
  const src = readFileSync(BUILDER, 'utf8')
  const titles = [...src.matchAll(/\['(gn-[a-z]+)',\s*'([^']+)'\]/g)].map((m) => m[2])
  const t0 = [...(/const T0_NAMES = \[([\s\S]*?)\]/.exec(src)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  assert.ok(titles.length >= 2, 'GROUP_ORDER 没解析到，用例的前提不成立')
  assert.ok(t0.length >= titles.length, `T0 名单（${t0.length}）至少要够铺满 ${titles.length} 个分组，否则分组空转会先判红`)
  const skills = t0.map((name, i) => ({
    name,
    catalog: 'generic',
    genericGroup: titles[i % titles.length],
    title: name,
    summaryZh: '自测夹具',
  }))
  return { skills }
}

/**
 * 拷一份派生器到临时树；`staging: false` 模拟干净 clone。
 *
 * @param {{ staging?: boolean, manifest?: string | null, localize?: object | null }} [opts]
 */
function makeTree({ staging = false, manifest = null, localize = null } = {}) {
  const root = mutationRoot('gn-check-')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, 'manifest'), { recursive: true })
  copyFileSync(BUILDER, join(root, 'scripts', 'build-generic-manifest.mjs'))
  if (staging) {
    mkdirSync(join(root, 'staging'), { recursive: true })
    writeFileSync(join(root, 'staging', 'intake-localize.json'), JSON.stringify(localize ?? minimalLocalize()), 'utf8')
  }
  if (manifest !== null) writeFileSync(join(root, 'manifest', 'generic-skills.json'), manifest, 'utf8')
  return join(root, 'scripts', 'build-generic-manifest.mjs')
}

function runCheck(builderPath) {
  const { command, env } = nodeCommand()
  return spawnSync(command, [builderPath, '--check'], { encoding: 'utf8', env })
}

test('G1 派生源不在本机（干净 clone）：退出码 2 + 说清跳过了什么，不是红', () => {
  const r = runCheck(makeTree({ staging: false, manifest: '{"skills":[]}' }))
  assert.equal(r.status, 2, '派生源不在本机必须走「跳过」码；报成 1 就是环境事实被当成数据缺陷')
  assert.match(r.stdout, /跳过/, '跳过必须打印出来——静默跳过与通过长得一样（P-11）')
  assert.match(r.stdout, /不入库/, 'note 必须说清**为什么**不在：staging/ 不入库，不是清单丢了')
  assert.doesNotMatch(r.stdout + r.stderr, /不一致/, '环境不在时不许出现「不一致」字样，那是另一种修法')
})

test('G2 源在、而清单与它不一致：退出码必须是 1，且不许出现「跳过」', () => {
  // 真跑到比对那一步：派生源有效，而磁盘上的 manifest 是别的内容 → 数据缺陷。
  // 若这里也是 2，「跳过」就成了坏数据的避难所。
  const r = runCheck(makeTree({ staging: true, manifest: '{"skills":[{"name":"手改过的行"}]}' }))
  assert.equal(r.status, 1, '数据缺陷必须判红——若这里也是 2，跳过分支就把真缺陷吞了')
  assert.match(r.stderr, /不一致/, '必须点名是「与派生源不一致」，否则人不知道该重建清单')
  assert.doesNotMatch(r.stdout, /跳过/)
})

test('G3 源在但坏了：同样是 1，不许退化成「跳过」', () => {
  // 派生源存在却读不动（坏 JSON）——这是数据缺陷，不是环境不在。
  // 退出码 2 只留给「源根本不在本机」这一种情形，否则跳过会变成坏数据的避难所。
  const root = mutationRoot('gn-check-')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, 'staging'), { recursive: true })
  copyFileSync(BUILDER, join(root, 'scripts', 'build-generic-manifest.mjs'))
  writeFileSync(join(root, 'staging', 'intake-localize.json'), '{ 这不是 JSON', 'utf8')
  const r = runCheck(join(root, 'scripts', 'build-generic-manifest.mjs'))
  assert.equal(r.status, 1, '源在而内容坏了必须是红；退成 2 就是「跳过」吞了坏数据')
  assert.doesNotMatch(r.stdout, /跳过/)
})

test('G4 两个 verifier 都认这条契约：源码里 status === 2 的分支必须在，且不等于「不一致」', () => {
  // 光有派生器的退出码没有用：跳过会不会被认，取决于消费侧那两个分支。
  // 这条用例盯住它们，避免有人把 `=== 2` 改成 `!== 0` 时没人发现。
  for (const rel of ['verify_static.mjs', 'verify-generic.mjs']) {
    const src = readFileSync(join(HERE, '..', 'scripts', rel), 'utf8')
    assert.match(src, /status\s*[=!]==\s*2|e\.status\s*===\s*2/, `${rel} 缺「退出码 2 = 跳过」的分支`)
    assert.match(src, /跳过/, `${rel} 的跳过分支必须打印出来`)
  }
})
