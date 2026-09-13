/**
 * `patch-anchors` 扫描集判据的反向自测（P-11 / P-03：判据自己也要被证伪）。
 *
 * 立的规矩：**每个用例都要能在「判据退化成恒真桩」时变红**。
 * 下面每条注释都点名它挡的是哪种退化。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectAnchorTargets } from './patch-anchor-scope.mjs'

test('扫描集：已打 tag 的树退出扫描，未打 tag 的进入（2026-09-13 的真实形状）', () => {
  // 挡的退化：如果过滤被判成「无条件纳入」，下面 scanStaging 会多出 2.2.0/2.3.0/2.3.1，
  // 于是门禁又去拿 38 锚点量 36 锚点时代的产物——本项存在的全部理由。
  const scope = selectAnchorTargets({
    stagingVersions: ['2.2.0', '2.3.0', '2.3.1', '2.3.2', '2.3.3'],
    taggedVersions: ['2.0.0', '2.0.1', '2.2.0', '2.3.0', '2.3.1'],
    appInstalled: true,
  })

  assert.deepEqual(scope.scanStaging, ['2.3.2', '2.3.3'])
  assert.deepEqual(scope.retired, ['2.2.0', '2.3.0', '2.3.1'])
  assert.equal(scope.vacuous, false)
  // 读数必须点出「谁退出了」：不然「本项只量了两棵树」这件事没有任何地方说。
  assert.match(scope.note, /已发布/)
  assert.match(scope.note, /2\.2\.0/)
})

test('扫描集：射程为空必须报「空」，不许与「通过」同形（P-02 的第二形态）', () => {
  // 挡的退化：把 vacuous 恒置 false（或干脆不返回），则「一棵树都没量」会被读成
  // 「所有树都合格」——这正是假绿最便宜的那条路径。
  const scope = selectAnchorTargets({
    stagingVersions: ['2.2.0'],
    taggedVersions: ['2.2.0'],
    appInstalled: false,
  })

  assert.equal(scope.vacuous, true)
  assert.match(scope.note, /无可扫描对象/)
})

test('扫描集：本机 app 可读时不算空射程', () => {
  // 挡的退化：vacuous 写成 `scanStaging.length === 0`（漏掉本机 app 这一路），
  // 则干净机器上每一次都会误报「跳过」，跳过会被当成噪声关掉（P-02）。
  const scope = selectAnchorTargets({ stagingVersions: [], taggedVersions: [], appInstalled: true })

  assert.equal(scope.vacuous, false)
  assert.equal(scope.checkInstalledApp, true)
})

test('扫描集：同号重制（清单已入库、尚未打 tag）不得被静默排除', () => {
  // 这是**最危险的失效方向**，也是判据取 tag 而不是「有无入库清单」的原因：
  // 2.3.3 的入库清单在重制后仍然躺在 release/ 里，若按「有清单 = 已发布」判，
  // 重制出来的新树会被排除，门禁对一棵从未量过的树说 ok。
  const scope = selectAnchorTargets({
    stagingVersions: ['2.3.3'],
    taggedVersions: ['2.2.0', '2.3.0', '2.3.1'],
    appInstalled: false,
  })

  assert.deepEqual(scope.scanStaging, ['2.3.3'])
  assert.equal(scope.vacuous, false)
})

test('扫描集：读不到任何 tag 时全部纳入（默认错误方向选「多量」）', () => {
  // 浅克隆 / 新克隆 / git 不可用时，releasedVersions() 回退为空数组。
  // 此时必须**照量**：判据宁可多量几棵已发布的树（红是可解释的），
  // 也不能因为「读不到 tag」而把待发布树放行。
  const scope = selectAnchorTargets({
    stagingVersions: ['2.2.0', '2.3.3'],
    taggedVersions: [],
    appInstalled: false,
  })

  assert.deepEqual(scope.scanStaging, ['2.2.0', '2.3.3'])
  assert.deepEqual(scope.retired, [])
})

test('扫描集：输出顺序稳定（版本升序），不随输入顺序抖动', () => {
  const a = selectAnchorTargets({ stagingVersions: ['2.3.3', '2.3.2'], taggedVersions: [] })
  const b = selectAnchorTargets({ stagingVersions: ['2.3.2', '2.3.3'], taggedVersions: [] })

  assert.deepEqual(a.scanStaging, ['2.3.2', '2.3.3'])
  assert.deepEqual(b.scanStaging, a.scanStaging)
})

test('扫描集：已打 tag 与未打 tag 互斥且并集等于输入（不吞版本）', () => {
  // 挡的退化：两个 filter 的条件写反或写重叠，导致某个版本既不扫描也不出现在读数里
  // ——静默消失的版本比红灯更坏。
  const staging = ['2.2.0', '2.3.0', '2.3.1', '2.3.2', '2.3.3']
  const scope = selectAnchorTargets({ stagingVersions: staging, taggedVersions: ['2.3.0'], appInstalled: false })

  assert.deepEqual([...scope.scanStaging, ...scope.retired].sort(), [...staging].sort())
  assert.deepEqual(scope.scanStaging.filter((v) => scope.retired.includes(v)), [])
})
