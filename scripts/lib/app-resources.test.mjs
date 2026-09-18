import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appResourcesForm,
  appResourcesRoot,
  appNodeModules,
} from './app-resources.mjs'
// 子进程解释器一律走 real-node（ADR-0040）：pnpm 生命周期里 process.execPath 是宿主
// Electron，直接拿它起 node 子进程会「退出码 0 且无输出」，CLI 断言假绿（A0_8 同根因）。
import { nodeCommand } from './real-node.mjs'
// 说话的两半都要拿（command + env）：只拿 command 不带 ELECTRON_RUN_AS_NODE，起的
// 还是 Electron 实例——同 ADR-0040，见 gate.test.mjs 顶部注释。
const { command: NODE, env: NODE_ENV } = nodeCommand()

/**
 * app-resources 双形态 + CLI 面（assemble.sh/dsh-patches 的唯一路径来源）。
 * fixtures 在 tmpdir 造最小布局：只含判定所需目录/文件。
 */
function base(name, build) {
  const root = mkdtempSync(join(tmpdir(), `app-res-${name}-`))
  const app = join(root, 'DSH Desktop.app')
  build(app)
  return root
}

test('no-ASAR 形态（2.0.10 基座）：root/node_modules 指 Resources/app', () => {
  const baseDir = base('noasar', (app) => {
    mkdirSync(join(app, 'Contents/Resources/app/node_modules'), { recursive: true })
  })
  const app = join(baseDir, 'DSH Desktop.app')
  assert.equal(appResourcesForm(app), 'no-asar')
  assert.equal(appResourcesRoot(app), join(app, 'Contents/Resources/app'))
  assert.equal(appNodeModules(app), join(app, 'Contents/Resources/app/node_modules'))
})

test('ASAR 形态（2.0.5 存量）：root 指 app.asar.unpacked', () => {
  const baseDir = base('asar', (app) => {
    mkdirSync(join(app, 'Contents/Resources/app.asar.unpacked/node_modules'), { recursive: true })
    writeFileSync(join(app, 'Contents/Resources/app.asar'), '')
  })
  const app = join(baseDir, 'DSH Desktop.app')
  assert.equal(appResourcesForm(app), 'asar')
  assert.equal(appResourcesRoot(app), join(app, 'Contents/Resources/app.asar.unpacked'))
  assert.equal(appNodeModules(app), join(app, 'Contents/Resources/app.asar.unpacked/node_modules'))
})

test('app 不存在 / 无 app 布局：form 为 null 不猜测', () => {
  const baseDir = base('absent', (app) => { mkdirSync(app, { recursive: true }) })
  // 空壳 app（无 Resources/app|app.asar）→ 调用方须按「app 未装配」处理
  const shellApp = join(baseDir, 'DSH Desktop.app')
  assert.equal(appResourcesForm(shellApp), null)
  assert.equal(appResourcesRoot(shellApp), null)
  assert.equal(appNodeModules(shellApp), null)
  const missing = join(baseDir, 'Not-Installed.app')
  assert.equal(appResourcesForm(missing), null)
  assert.equal(appNodeModules(missing), null)
})

test('CLI：三行 KEY=VALUE 与程序面一致；absent 时 form=absent 且 exit 1', () => {
  const noAsarDir = base('cli-noasar', (app) => {
    mkdirSync(join(app, 'Contents/Resources/app/node_modules'), { recursive: true })
  })
  const r1 = spawnSync(NODE, [new URL('./app-resources.mjs', import.meta.url).pathname, join(noAsarDir, 'DSH Desktop.app')], { encoding: 'utf8', env: NODE_ENV })
  assert.equal(r1.status, 0)
  const out = Object.fromEntries(r1.stdout.trim().split('\n').map((l) => l.split('=')))
  assert.equal(out.form, 'no-asar')
  assert.equal(out.root, join(noAsarDir, 'DSH Desktop.app/Contents/Resources/app'))
  assert.equal(out.node_modules, join(noAsarDir, 'DSH Desktop.app/Contents/Resources/app/node_modules'))

  const r2 = spawnSync(NODE, [new URL('./app-resources.mjs', import.meta.url).pathname, join(noAsarDir, 'Missing.app')], { encoding: 'utf8', env: NODE_ENV })
  assert.equal(r2.status, 1)
  assert.equal(r2.stdout.trim(), 'form=absent')
  assert.match(r2.stderr, /拒绝猜测/)
})
