import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOutputRoot,
  checkDependencyReproducibility,
  packageScriptOrder,
  parseImporterSpecifiers,
} from './dependency-reproducibility.mjs'

/**
 * 造一个 pnpm-lock.yaml 形状的文本（只含本校验读的那部分）。
 * @param {{dependencies?: Record<string, string>, devDependencies?: Record<string, string>, optionalDependencies?: Record<string, string>, importers?: string}} input 各字段的 name → specifier
 * @returns {string} 锁文件文本
 */
function lockfixture({ dependencies = {}, devDependencies = {}, optionalDependencies = {}, importers = '.' } = {}) {
  const block = (entries) =>
    Object.entries(entries)
      .map(([name, specifier]) => `      '${name}':\n        specifier: ${specifier}\n        version: 0.0.0`)
      .join('\n')
  const sections = [
    ['dependencies', dependencies],
    ['devDependencies', devDependencies],
    ['optionalDependencies', optionalDependencies],
  ]
    .filter(([, entries]) => Object.keys(entries).length > 0)
    .map(([field, entries]) => `    ${field}:\n${block(entries)}`)
    .join('\n')
  return `lockfileVersion: '9.0'\n\nimporters:\n\n  ${importers}:\n${sections}\n\npackages:\n\n  ws@8.21.3:\n    resolution: {integrity: sha512-x}\n`
}

/** 单包输入的简写。 */
const one = (manifest, lockfileText) => [{ relPath: 'packages/x/dsh-a', manifest, lockfileText }]

test('解析 importer：读出 name → specifier，单引号包裹的 scope 名也认', () => {
  const text = lockfixture({ dependencies: { '@scope/pkg': '^1.2.3' }, devDependencies: { typescript: '5.6.3' } })

  const parsed = parseImporterSpecifiers(text)

  assert.equal(parsed.get('@scope/pkg').specifier, '^1.2.3')
  assert.equal(parsed.get('@scope/pkg').field, 'dependencies')
  assert.equal(parsed.get('typescript').specifier, '5.6.3')
  assert.equal(parsed.get('typescript').field, 'devDependencies')
})

test('解析 importer：只认根 importer `.`，别的工作区 importer 不进结果', () => {
  const text = `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      'ws':\n        specifier: ^8.21.0\n        version: 8.21.3\n\n  packages/other:\n    dependencies:\n      'left-pad':\n        specifier: ^1.0.0\n        version: 1.0.0\n\npackages:\n`
  const parsed = parseImporterSpecifiers(text)

  assert.equal(parsed.has('ws'), true)
  assert.equal(parsed.has('left-pad'), false)
})

test('解析 importer：带引号的长区间去掉引号（loopx-plugin 的 `>=… || >=…` 形状）', () => {
  const text = lockfixture({ dependencies: { '@deepseek-ai/dsh': "'>=0.1.0-rc.7 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0'" } })

  assert.equal(parseImporterSpecifiers(text).get('@deepseek-ai/dsh').specifier, '>=0.1.0-rc.7 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0')
})

test('解析 importer：顶层 packages: 段里的同名条目不会被误读成 importer 声明', () => {
  const text = lockfixture({ dependencies: { '@types/node': '^22.20.2' } })
  // packages 段里再写一份同名条目：解析必须在顶格键处停下
  const parsed = parseImporterSpecifiers(`${text}  '@types/node@22.20.2':\n    resolution: {integrity: sha512-y}\n`)

  assert.equal(parsed.get('@types/node').field, 'dependencies')
  assert.equal(parsed.size, 1)
})

test('解析 importer：没有 importers 块时返回 null（调用方按失败处理，不静默放过）', () => {
  assert.equal(parseImporterSpecifiers("lockfileVersion: '9.0'\npackages:\n"), null)
})

test('产物根：优先 main，其次 exports，最后兜底 lib', () => {
  assert.equal(buildOutputRoot({ main: 'lib/index.js' }), 'lib')
  assert.equal(buildOutputRoot({ exports: { '.': { default: './dist/index.js' } } }), 'dist')
  assert.equal(buildOutputRoot({}), 'lib')
})

test('脚本顺序：有 build 且产物未入库 → build 在 test 之前（否则 test 看到的是「文件不存在」）', () => {
  assert.deepEqual(packageScriptOrder({ hasBuild: true, buildOutputTracked: false }), ['typecheck', 'build', 'test'])
})

test('脚本顺序：产物已入库 → 保持 test 在 build 之前（否则构建会盖掉已提交产物、掩盖漂移）', () => {
  assert.deepEqual(packageScriptOrder({ hasBuild: true, buildOutputTracked: true }), ['typecheck', 'test', 'build'])
})

test('脚本顺序：没有 build 的包顺序不变', () => {
  assert.deepEqual(packageScriptOrder({ hasBuild: false, buildOutputTracked: false }), ['typecheck', 'test', 'build'])
})

test('一致时通过，且不因未声明任何依赖而误报', () => {
  const result = checkDependencyReproducibility({
    packages: [
      ...one({ dependencies: { ws: '^8.21.0' } }, lockfixture({ dependencies: { ws: '^8.21.0' } })),
      { relPath: 'packages/x/dsh-empty', manifest: { name: 'empty' }, lockfileText: null },
    ],
  })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('声明了依赖却没有锁文件 → 违规（本轮 loopx-plugin / overseas-skills / role-matrix 的形状）', () => {
  const result = checkDependencyReproducibility({ packages: one({ devDependencies: { typescript: '5.6.3' } }, null) })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /没有 pnpm-lock\.yaml/u)
})

test('specifier 不一致 → 违规（本轮 skill-subset 的 `^5.6.3` vs `5.6.3`）', () => {
  const result = checkDependencyReproducibility({
    packages: one({ devDependencies: { typescript: '5.6.3' } }, lockfixture({ devDependencies: { typescript: '^5.6.3' } })),
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /typescript 的 specifier 不一致（锁文件 \^5\.6\.3 \/ 清单 devDependencies 写的是 5\.6\.3）/u)
})

test('锁文件漏记一条 → 违规（本轮 browser-local 的 `dependencies were added` 形状）', () => {
  const result = checkDependencyReproducibility({
    packages: one(
      { dependencies: { ws: '^8.21.0' }, devDependencies: { typescript: '5.6.3' } },
      lockfixture({ dependencies: { ws: '^8.21.0' } }),
    ),
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /锁文件未记录 typescript/u)
})

test('机器绝对路径 spec → 违规，且报文点出改进方向（本轮 browser-local 的 11 条 /Applications/… 形状）', () => {
  const abs = '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-tools'
  const result = checkDependencyReproducibility({
    packages: one({ devDependencies: { '@deepseek-ai/dsh-tools': abs } }, lockfixture({})),
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /指向机器绝对路径/u)
  assert.match(result.violations[0], /改用注册表版本区间/u)
})

test('锁文件里含逃出包目录的 link: 目标 → 违规（这是锁文件不可跨目录移植的真实形状）', () => {
  // 逐字取自 HEAD(c1f9572) 的 dsh-browser-local/pnpm-lock.yaml：清单写绝对路径，
  // pnpm 记成相对形式，而前缀随安装深度变（上一轮换个深度重装即从 5 个 .. 变成 6 个）。
  const text = `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      '@deepseek-ai/cordis':\n        specifier: /Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/cordis\n        version: link:../../../../../Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/cordis\n\npackages:\n`
  const result = checkDependencyReproducibility({
    packages: one(
      { dependencies: { '@deepseek-ai/cordis': '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/cordis' } },
      text,
    ),
  })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /pnpm-lock\.yaml 里含逃出包目录或绝对的/u)
})

test('包内自带的 file:./ 目标不算违规（它与包一起搬，不随安装深度变）', () => {
  const text = `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      'ws':\n        specifier: file:./vendor/ws\n        version: file:vendor/ws\n\npackages:\n`
  const result = checkDependencyReproducibility({ packages: one({ dependencies: { ws: 'file:./vendor/ws' } }, text) })

  assert.equal(result.passed, true)
})

test('锁文件结构不可解析 → 按失败处理，不静默放过', () => {
  const result = checkDependencyReproducibility({ packages: one({ dependencies: { ws: '^8.21.0' } }, "lockfileVersion: '9.0'\n") })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /缺少可解析的 importers 块/u)
})

test('同名双声明 → 违规（本轮 deepresearch-local 的真病例：dependencies 与 devDependencies 各写一个区间）', () => {
  const result = checkDependencyReproducibility({
    packages: one(
      { dependencies: { '@deepseek-ai/dsh-storage-sqlite': '^0.1.1-rc.2' }, devDependencies: { '@deepseek-ai/dsh-storage-sqlite': '^0.1.5-rc.1' } },
      lockfixture({ dependencies: { '@deepseek-ai/dsh-storage-sqlite': '^0.1.1-rc.2' } }),
    ),
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /在多个字段里重复声明/u)
})

test('peer 的同一个名字已在本地声明过 → 不报（pnpm 就是这么放行 browser-local 的 7 条 `*` peer）', () => {
  const result = checkDependencyReproducibility({
    packages: one(
      { peerDependencies: { '@deepseek-ai/cordis': '*' }, devDependencies: { '@deepseek-ai/cordis': '4.0.2' } },
      lockfixture({ devDependencies: { '@deepseek-ai/cordis': '4.0.2' } }),
    ),
  })

  assert.equal(result.passed, true)
})

test('peer 未在锁文件记录 → 违规（本轮 auto-compact-local 的 3 条 peerDependencies 形状）', () => {
  const result = checkDependencyReproducibility({
    packages: one(
      { peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' }, devDependencies: { typescript: '5.6.3' } },
      lockfixture({ devDependencies: { typescript: '5.6.3' } }),
    ),
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /锁文件未记录 peerDependency @deepseek-ai\/cordis/u)
})

test('peer 记录在锁文件里但 specifier 不同 → 违规', () => {
  const result = checkDependencyReproducibility({
    packages: one(
      { peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' } },
      lockfixture({ dependencies: { '@deepseek-ai/cordis': '^4.0.2' } }),
    ),
  })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], /peerDependency @deepseek-ai\/cordis 的 specifier 不一致/u)
})

test('一个包的违规不串到下一个包：报文逐包前缀', () => {
  const result = checkDependencyReproducibility({
    packages: [
      { relPath: 'packages/a/dsh-x', manifest: { dependencies: { ws: '^8.21.0' } }, lockfileText: null },
      { relPath: 'packages/b/dsh-y', manifest: { dependencies: { ws: '^8.21.0' } }, lockfileText: null },
    ],
  })

  assert.equal(result.violations.length, 2)
  assert.match(result.violations[0], /^packages\/a\/dsh-x:/u)
  assert.match(result.violations[1], /^packages\/b\/dsh-y:/u)
})
