/**
 * 「设置页呈现层探针的判据有射程」反向自测（P-02 / P-08）。
 *
 * ## 为什么需要它
 *
 * `scripts/acceptance/settings-shell-live.mjs` 的判据至今写错过**三条**，全是射程为零——
 * 无论被测状态修好没修好都返回同一个值：
 *
 * 1. `curl /plugins/…/client.js` 拿 404 当「实例里没有这个包」（该 HTTP 面整体 401 守卫）；
 * 2. 「AXScrollToVisible 调用成功」（基线里它同样成功）；
 * 3. 「AX 树里出现滚动区域」（nav 落成 landmark role，Chromium 每节点只给一个 role，恒为空）。
 *
 * 三次的病根相同：**判据写了，但没有任何东西拿一个「应该判红」的状态去试它**。
 * 「记得试一下」是纪律；纪律守不住的东西要用机制守（P-08）。所以本用例把它变成机制：
 * 探针自带 `--self-test`（把已知状态读数喂进 `judge()`），而本文件进一步做**突变控制**
 * ——把判据改成恒真桩，`--self-test` **必须**当场判红。突变不红，就说明拦住缺陷的不是
 * 判据本身（P-02）。
 *
 * ## 它**不**需要什么（这就是它能进门禁的原因）
 *
 * 不碰 GUI、不需要 DSH Desktop 在跑、不需要重启、不读任何磁盘状态之外的输入。
 * 跑的是纯函数 `judge()` 与一组写死的读数。要**真的**量那台跑着的实例，跑
 * `pnpm run accept:settings-shell`（那条需要应用在前台，见该文件头部）。
 *
 * ## 边界（诚实写清楚）
 *
 * 本用例证明的是「**判据对已知读数会红会绿**」，不是「那些读数在真机上会出现」。
 * 后半句只有实况探针能回答。两者谁也冒充不了谁。
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'

import { nodeCommand } from '../lib/real-node.mjs'
import { withMutationFixture } from '../lib/mutation-fixture.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROBE_REL = 'scripts/acceptance/settings-shell-live.mjs'
const PROBE_ABS = join(repoRoot, PROBE_REL)
const REAL_NODE_ABS = join(repoRoot, 'scripts/lib/real-node.mjs')
const UPSTREAM_SETTINGS_CSS = join(
  repoRoot,
  'vendor/dsh-desktop/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.module.css',
)
const SHELL_CSS = join(repoRoot, 'packages/platform/dsh-settings-shell-local/src/client/shell.css')

/** 跑一次探针，返回退出码与合并输出。 */
function runProbe(file, fixture, args = []) {
  const { command, env } = nodeCommand()
  const r = spawnSync(command, [file, ...args], {
    cwd: fixture.repo,
    env: { ...env, ...fixture.environment },
    encoding: 'utf8',
  })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** 在独占临时 repo 中复制探针与其唯一相对依赖，再运行一次。 */
async function withProbe(mutant, fn) {
  return withMutationFixture({
    prefix: 'settings-shell-criteria',
    prepare(fixture) {
      const acceptanceDir = join(fixture.repo, 'scripts', 'acceptance')
      const libDir = join(fixture.repo, 'scripts', 'lib')
      mkdirSync(acceptanceDir, { recursive: true })
      mkdirSync(libDir, { recursive: true })
      let src = readFileSync(PROBE_ABS, 'utf8')
      if (mutant !== null) {
        assert.ok(src.includes(mutant.from), `突变锚点没找到（探针改过？）：${mutant.from}`)
        src = src.replace(mutant.from, mutant.to)
      }
      writeFileSync(join(acceptanceDir, 'settings-shell-live.mjs'), src)
      copyFileSync(REAL_NODE_ABS, join(libDir, 'real-node.mjs'))
    },
  }, async (fixture) => fn(join(fixture.repo, PROBE_REL), fixture))
}

test('自检本身必须是绿的：现存判据覆盖独立校准、目标尺寸、L1/L2 与 typed unavailable', async () => {
  await withProbe(null, async (probe, fixture) => {
    const { code, out } = runProbe(probe, fixture, ['--self-test'])
    assert.equal(code, 0, `--self-test 应当通过，实得退出码 ${code}：\n${out}`)
    assert.match(out, /判据射程自检：\d+ 个状态、\d+ 条断言/, `没看到自检汇总行：\n${out}`)
    // 自检**不能**顺手去碰 GUI：它必须能在没有任何 app、任何权限的机器上跑。
    assert.doesNotMatch(out, /macos-harness|AXWindow|window-off-screen/, '自检碰了实况仪器，就不再是纯函数用例')
  })
})

test(
  'QG-012：独立锚与 pinned upstream 一致，Shell 自己不得改写 nav 校准宽度',
  {
    // CI 里没有 vendor/dsh-desktop：它是嵌套仓库，源码不入库（.gitignore 显式排除，
    // 没有 .gitmodules 可供 checkout，上游 fork 也不是本仓库能公开拉取的）。
    // 缺的是「pinned upstream 那一侧的输入」，不是「本仓库这一侧的正确性」——
    // 所以报跳过而不是判红，也不报通过（未核实 ≠ 合格）。
    // 本地 checkout 了 vendor/ 时这条照跑，射程不减。
    skip: existsSync(UPSTREAM_SETTINGS_CSS)
      ? false
      : 'vendor/dsh-desktop 未 checkout（嵌套仓库不入库，CI 无此输入）',
  },
  () => {
  const upstream = readFileSync(UPSTREAM_SETTINGS_CSS, 'utf8')
  const nav = upstream.match(/\.nav\s*\{([\s\S]*?)\}/)?.[1]
  const close = upstream.match(/\.close\s*\{([\s\S]*?)\}/)?.[1]
  assert.ok(nav, 'pinned upstream 缺 .nav rule，必须重新选择 calibration anchor')
  assert.ok(close, 'pinned upstream 缺 .close rule，必须重新选择 calibration anchor')
  assert.match(nav, /\bwidth\s*:\s*188px\s*;/, 'pinned upstream nav 不再是 188px')
  assert.match(close, /\bwidth\s*:\s*28px\s*;/, 'pinned upstream close width 不再是 28px')
  assert.match(close, /\bheight\s*:\s*28px\s*;/, 'pinned upstream close height 不再是 28px')

  const shell = readFileSync(SHELL_CSS, 'utf8')
  const shellNav = shell.match(/\[data-dsh-settings-shell-root\]\s*>\s*nav\s*\{([\s\S]*?)\}/)?.[1]
  assert.ok(shellNav, 'Shell nav rule 缺失')
  assert.doesNotMatch(
    shellNav,
    /(?:^|[;\n])\s*width\s*:/,
    'Shell 不得修改作为独立校准锚的 upstream nav width',
  )
})

test('突变控制：l1Ok 改成恒真桩，自检必须判红并点名 l1Ok', async () => {
  await withProbe({
    from: 'const l1Ok = railIndependent && lastReachable',
    to: 'const l1Ok = true',
  }, async (probe, fixture) => {
    const { code, out } = runProbe(probe, fixture, ['--self-test'])
    assert.notEqual(code, 0, `恒真桩竟然通过——自检没有牙（P-02）：\n${out}`)
    assert.match(out, /l1Ok/, `判红但没点名是哪条判据：\n${out}`)
    assert.match(out, /没有射程/, `判红的原因不对：\n${out}`)
  })
})

test('突变控制：l2Ok 改成恒真桩，自检必须判红', async () => {
  await withProbe({
    from: 'const l2Ok = Math.abs(panelCss - targetPanelCss) <= targetPanelCss * PANEL_CSS_TOLERANCE_RATIO',
    to: 'const l2Ok = true',
  }, async (probe, fixture) => {
    const { code, out } = runProbe(probe, fixture, ['--self-test'])
    assert.notEqual(code, 0, `恒真桩竟然通过——自检没有牙（P-02）：\n${out}`)
    assert.match(out, /l2Ok/, `判红但没点名是哪条判据：\n${out}`)
  })
})

test('QG-012：目标按钮尺寸判据改成恒真桩，自检必须稳定打红', async () => {
  await withProbe({
    from: 'const targetButtonSizeOk = Math.abs(targetButtonCssPx - OFFICIAL_BUTTON_CSS_PX) <= BUTTON_CSS_TOLERANCE',
    to: 'const targetButtonSizeOk = true',
  }, async (probe, fixture) => {
    const { code, out } = runProbe(probe, fixture, ['--self-test'])
    assert.notEqual(code, 0, `目标尺寸恒真桩竟然通过——QG-012 没有验收目标尺寸：\n${out}`)
    assert.match(out, /targetButtonSizeOk/, `判红但没点名目标按钮尺寸：\n${out}`)
    assert.match(out, /没有射程/, `判红的原因不对：\n${out}`)
  })
})

test('QG-012：把目标按钮重新拿来反算 scale，会重现代数恒等式并被自检打红', async () => {
  await withProbe({
    from: 'const targetButtonCssPx = medianTargetHeight / calibration.scale',
    to: 'const targetButtonCssPx = medianTargetHeight / (medianTargetHeight / OFFICIAL_BUTTON_CSS_PX)',
  }, async (probe, fixture) => {
    const { code, out } = runProbe(probe, fixture, ['--self-test'])
    assert.notEqual(code, 0, `目标自身校准竟然通过——button/(button/40) 恒等式复发：\n${out}`)
    assert.match(out, /targetButtonSizeOk/, `恒等式 Red 没落在目标尺寸判据：\n${out}`)
  })
})

test('QG-012：忽略独立锚比例冲突会被 typed-unavailable 负控打红', async () => {
  await withProbe({
    from: 'const conflict = measured.find((sample) => sample.residualAxPx > sample.toleranceAxPx)',
    to: 'const conflict = undefined',
  }, async (probe, fixture) => {
    const { code, out } = runProbe(probe, fixture, ['--self-test'])
    assert.notEqual(code, 0, `锚冲突旁路竟然通过——冲突 scale 可被当成有效读数：\n${out}`)
    assert.match(out, /nav\/close scale 冲突/, `没有点名锚冲突负控：\n${out}`)
    assert.match(out, /typed unavailable/, `锚冲突没有保持 unavailable 语义：\n${out}`)
  })
})

test('突变控制：pluginLoaded 恒真桩会让「未生效」那一档失去射程', async () => {
  await withProbe({
    from: 'pluginLoaded: headings.length >= 2,',
    to: 'pluginLoaded: true,',
  }, async (probe, fixture) => {
    const { code, out } = runProbe(probe, fixture, ['--self-test'])
    assert.notEqual(code, 0, `恒真桩竟然通过——「未生效」状态就再也判不出来了：\n${out}`)
    assert.match(out, /pluginLoaded/, `判红但没点名是哪条判据：\n${out}`)
  })
})

test('突变控制：设置入口规则退回「只认 title」，自检必须判红并点名该规则', async () => {
  // 2026-09-18 实测：入口的可访问名住在 `AXDescription`（`AXTitle=""`）。旧写法只认 title，
  // 于是在设置页**没开着**时（最常见状态）判 hasTrigger=false，`ensureOnScreen()` 抛
  // `window-off-screen`「窗口拉不到前台」——窗口明明在屏上、树里 882 个节点可读。
  // 这一条把「名字字段又缩回一个」变成机制能拦住的回归，而不是靠人记得（P-08）。
  await withProbe({
    from: "const SETTINGS_TRIGGER_NAME_FIELDS = ['title', 'description']",
    to: "const SETTINGS_TRIGGER_NAME_FIELDS = ['title']",
  }, async (probe, fixture) => {
    const { code, out } = runProbe(probe, fixture, ['--self-test'])
    assert.notEqual(code, 0, `只认 title 竟然通过——入口在 description 上时又会被报成「窗口拉不到前台」：\n${out}`)
    assert.match(out, /设置入口规则/, `判红但没点名设置入口规则：\n${out}`)
    assert.match(out, /没有射程/, `判红的原因不对：\n${out}`)
  })
})

test('突变控制：角色集合缩成一个，自检必须判红（另一侧同源断言也要响）', async () => {
  await withProbe({
    from: "const SETTINGS_TRIGGER_ROLES = ['AXPopUpButton', 'AXButton']",
    to: "const SETTINGS_TRIGGER_ROLES = ['AXPopUpButton']",
  }, async (probe, fixture) => {
    const { code, out } = runProbe(probe, fixture, ['--self-test'])
    assert.notEqual(code, 0, `角色缩成一个竟然通过——AXButton 形态的入口会被漏判：\n${out}`)
    assert.match(out, /没有覆盖角色|设置入口规则/, `判红但没点名角色覆盖：\n${out}`)
  })
})

test('已证伪的仪器不得被捡回探针里（dead-instrument 的射程不含 .mjs）', () => {
  // dead-instrument 门禁的射程是 `*.md` / `*.sh` / `*.bash`——`.mjs` 不在里面。
  // 而 2026-09-15 删掉的那条零射程判据正是住在一个 `.mjs` 里。这里补上那个洞：
  // 探针源码里不许再出现已登记死仪器的**使用**形态（注释里写明来龙去脉是允许的，
  // 所以只禁代码行）。
  const src = readFileSync(PROBE_ABS, 'utf8')
  const code = src
    .split('\n')
    .filter((line) => !/^\s*(#|\/\/|\*|\/\*)/.test(line))
    .join('\n')
  for (const forbidden of ['AXScrollArea', 'scrollRoles']) {
    assert.ok(
      !code.includes(forbidden),
      `探针代码行里又出现了已证伪的仪器 ${forbidden}（射程为零，见 scripts/gates/dead-instruments.json）`,
    )
  }
})
