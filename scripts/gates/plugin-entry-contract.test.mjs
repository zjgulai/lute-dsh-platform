/**
 * `plugin-entry-contract.mjs` 的反向自测（QG-003）：判据必须能说「不」，也不能误伤。
 *
 * 守的是 2026-09-15 的恢复模式事故：宿主插件 `lib/index.js` 只写了 `const inject = [...]`
 * 而忘了 `export { name, inject }`，Cordis loader 看不到 inject，`apply` 里访问
 * `ctx.credentials` 时抛 `cannot get property without inject`。
 *
 * 三层证据**互不替代**：
 *   - L1：纯文本 fixture —— 入口解析、转出口跟随、四种分类、剥离器边界；
 *   - L2：临时文件树上的包变异（`withMutationFixture`，不碰仓库与真实 profile）——
 *     删入口、悬空转出口、移除 apply、未声明 service 必须各自得到非零结果；
 *   - L3：对着**当前仓库**的全部候选做账目恒等式断言 —— 没有任何候选能从分母里消失。
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { withMutationFixture } from '../lib/mutation-fixture.mjs'
import { validateGateResult } from './gate-result.mjs'
import { collectManagedManifests } from './package-collect.mjs'
import {
  CANDIDATE_KINDS,
  analyseCandidate,
  bracketsBalanced,
  checkPluginEntryContract,
  classBody,
  ctxPropertyAccesses,
  expandEntry,
  findExportSurface,
  injectMembers,
  resolveManifestEntry,
  serviceClassShape,
  stripCommentsAndStrings,
  tryGuardSpans,
} from './plugin-entry-contract.mjs'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

const BUNDLE = { dsh: { bundle: { patch: './cordis.patch.yml' } } }

/** 默认清单：显式给出 `main`，因为这些 fixture 的入口就是 `lib/index.js`。 */
const DEFAULT_MANIFEST = { name: 'pkg', main: 'lib/index.js', ...BUNDLE }

/** 用内存文件表跑一次检查。 */
function run(files, packages = [{ dir: 'pkg', manifest: DEFAULT_MANIFEST }]) {
  const map = new Map(Object.entries(files))
  return checkPluginEntryContract(packages, (path) => map.get(path) ?? null)
}

// ---------------------------------------------------------------------------
// Red 重放：旧实现的三个 continue 必须消失
// ---------------------------------------------------------------------------

test('QG-003 Red：入口读不到不再从分母里消失（旧实现 header 里 continue 掉）', () => {
  // 旧实现的形状：reads `<dir>/lib/index.js`，读不到就 continue，
  // 于是 checked 从 23 掉到 21 而门禁照样退出 0。
  const result = run({}) // 清单指向的入口一个都不存在
  assert.equal(result.status, 'fail')
  assert.equal(result.expected, 1, '候选必须留在分母里')
  assert.equal(result.checked, 0)
  assert.equal(result.failed, 1)
  assert.match(result.violations[0], /入口不可解析|读不到/)
})

test('QG-003 Red：入口不是 apply 形态时不再静默跳过，而是给出确定的分类结果', () => {
  // 旧实现读 lib/index.js，发现不导出 apply 就 continue ——
  // dsh-deepresearch-local 与 dsh-agent-team-gui-local 正是这样消失的。
  const serviceFile = [
    'var S = class extends Base {',
    '  static inject = ["storage"];',
    '  constructor(ctx, config) { super(ctx, "svcName"); }',
    '};',
    'export { S as default };',
  ].join('\n')
  const result = run({ 'pkg/lib/index.js': serviceFile })
  assert.equal(result.status, 'pass')
  assert.equal(result.checked, 1, 'Service 型候选必须被**核对**（规则不同），不是跳过')
  assert.equal(result.skipped, 0)
  assert.match(result.note, /plugin-service=1/)
})

test('QG-003 Red：候选总数恒等于 checked + skipped + failed（谁都不能消失）', () => {
  const packages = [
    { dir: 'a', manifest: { name: 'a', main: 'lib/index.js', ...BUNDLE } },
    { dir: 'b', manifest: { name: 'b', main: 'lib/index.js', ...BUNDLE } },
    { dir: 'c', manifest: { name: 'c', main: 'lib/index.js', ...BUNDLE } },
  ]
  const result = run({
    'a/lib/index.js': 'export function apply(ctx) { ctx.get("x") }\n',
    'b/lib/index.js': serviceFile(),
    // c 的入口整个不存在
  }, packages)
  assert.equal(result.expected, 3)
  assert.equal(result.checked + result.skipped + result.failed, 3)
  assert.equal(result.failed, 1)
  assert.equal(result.status, 'fail')
})

function serviceFile() {
  return [
    'var S = class extends Base {',
    '  static inject = ["storage"];',
    '  constructor(ctx, config) { super(ctx, "svcName"); }',
    '};',
    'export { S as default };',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// 入口解析：不硬编码 lib/index.js
// ---------------------------------------------------------------------------

test('QG-003：入口按清单解析——exports 字符串 / 条件对象 / main / 都没有', () => {
  assert.deepEqual(
    resolveManifestEntry({ exports: './lib/entry.js' }).path,
    'lib/entry.js',
  )
  assert.deepEqual(
    resolveManifestEntry({ exports: { '.': { types: './x.d.ts', import: './esm.js', default: './cjs.js' } } }).path,
    'esm.js',
  )
  assert.deepEqual(
    resolveManifestEntry({ exports: { '.': { types: './x.d.ts', default: './cjs.js' } } }).path,
    'cjs.js',
  )
  assert.deepEqual(resolveManifestEntry({ main: 'index.js' }).path, 'index.js')
  // 没有 "." 的 exports 对象按「无条件子路径」处理：宿主根本 import 不到包根。
  assert.equal(resolveManifestEntry({ exports: { './client': './lib/client.js' } }).path, null)
  assert.equal(resolveManifestEntry({ exports: { '.': { types: './x.d.ts' } } }).path, null)
  assert.equal(resolveManifestEntry({}).path, null)
})

test('QG-003：清单入口不是 lib/index.js 时必须读清单说的那个文件', () => {
  // 旧实现硬编码 `<dir>/lib/index.js`，读对了纯属巧合。
  const result = run({
    'pkg/index.js': 'export * from "./lib/index.js";\n',
    'pkg/lib/index.js': 'const inject = ["credentials"];\nexport function apply(ctx) { return ctx.credentials }\nexport { inject };\n',
  }, [{ dir: 'pkg', manifest: { name: 'pkg', main: 'index.js', ...BUNDLE } }])
  assert.equal(result.status, 'pass', result.violations.join('\n'))
  assert.match(result.note, /plugin-apply=1/)
})

test('QG-003：悬空转出口必须判红，不能被当成「没有 apply 的库」', () => {
  const result = run({ 'pkg/lib/index.js': 'export * from "./missing.js";\n' })
  assert.equal(result.status, 'fail')
  assert.equal(result.failed, 1)
  assert.match(result.violations[0], /读不到|转出口/)
})

test('QG-003：转出口成环必须判红，不能无限跟下去', () => {
  const result = run({
    'pkg/lib/index.js': 'export * from "./other.js";\n',
    'pkg/lib/other.js': 'export * from "./index.js";\n',
  })
  assert.equal(result.status, 'fail')
  assert.equal(result.failed, 1)
  assert.match(result.violations[0], /成环|转出口链超过/)
})

// ---------------------------------------------------------------------------
// 分类与 classify 恒等式
// ---------------------------------------------------------------------------

test('QG-003：四种分类覆盖每一个候选，且没有人被遗漏', () => {
  const packages = [
    { dir: 'apply', manifest: { name: 'apply', main: 'lib/index.js', ...BUNDLE } },
    { dir: 'service', manifest: { name: 'service', main: 'lib/index.js', ...BUNDLE } },
    { dir: 'library', manifest: { name: 'library', main: 'lib/index.js', ...BUNDLE } },
    { dir: 'broken', manifest: { name: 'broken', main: 'gone.js', ...BUNDLE } },
  ]
  const result = run({
    'apply/lib/index.js': 'export function apply(ctx) { ctx.get("x") }\n',
    'service/lib/index.js': serviceFile(),
    'library/lib/index.js': 'export const answer = 42\n',
  }, packages)
  const kinds = Object.fromEntries(
    CANDIDATE_KINDS.map((kind) => [kind, (result.note.match(new RegExp(`${kind}=(\\d+)`)) ?? [])[1]]),
  )
  assert.deepEqual(kinds, { 'plugin-apply': '1', 'plugin-service': '1', library: '1', unresolved: '1' })
  assert.equal(result.expected, 4)
  assert.equal(result.checked, 2)
  assert.equal(result.failed, 2, 'library 与 unresolved 都必须判红')
})

test('QG-003：移除 apply（插件退化成纯库）必须判红并写出两种可能', () => {
  const result = run({ 'pkg/lib/index.js': 'export const name = "pkg"\n' })
  assert.equal(result.status, 'fail')
  assert.match(result.violations[0], /既不导出 apply/)
  assert.match(result.violations[0], /纯库/)
  assert.match(result.violations[0], /apply 丢了/)
})

test('QG-003：Service 型把 inject 写成实例字段（缺 static）必须判红', () => {
  const result = run({
    'pkg/lib/index.js': [
      'var S = class extends Base {',
      '  inject = ["storage"];', // 缺 static → 字段落在实例上，Cordis 读不到
      '  constructor(ctx, config) { super(ctx, "svcName"); }',
      '};',
      'export { S as default };',
    ].join('\n'),
  })
  assert.equal(result.status, 'fail')
  assert.match(result.violations[0], /实例字段/)
})

test('QG-003：0 候选必须报 skip 并写明，不是「都合规」', () => {
  const result = run({}, [{ dir: 'pkg', manifest: { name: 'pkg', dsh: { client: {} } } }])
  assert.equal(result.status, 'skip')
  assert.equal(result.checked, 0)
  assert.match(result.typedSkips[0].reason, /未核对任何入口/)
})

// ---------------------------------------------------------------------------
// inject 规则：精确到缺陷形状
// ---------------------------------------------------------------------------

test('QG-003 缺陷原文形状：导出 apply、未导出 inject、访问 ctx.credentials → 判红', () => {
  const result = run({
    'pkg/lib/index.js': 'const name = "p";\nconst inject = ["credentials"];\nexport function apply(ctx) { return ctx.credentials ?? ctx.get("credentials") }\n',
  })
  assert.equal(result.status, 'fail')
  assert.ok(result.violations.some((v) => v.includes('未导出 inject') && v.includes('ctx.credentials')))
})

test('QG-003：只有方法调用、没有属性访问的入口不需要 inject → 判绿', () => {
  const result = run({
    'pkg/lib/index.js': 'export function apply(ctx) { ctx.inject(["settings"], (c) => {}); ctx.on("x", () => {}); ctx.effect(() => {}); }\n',
  })
  assert.equal(result.status, 'pass', result.violations.join('\n'))
  assert.equal(result.checked, 1)
})

test('QG-003：导出 inject 且成员一致 → 判绿；成员缺一个 → 判红', () => {
  const ok = run({
    'pkg/lib/index.js': 'const inject = ["credentials"];\nexport function apply(ctx) { return ctx.credentials }\nexport { inject };\n',
  })
  assert.equal(ok.status, 'pass', ok.violations.join('\n'))

  const missing = run({
    'pkg/lib/index.js': 'const inject = ["credentials"];\nexport function apply(ctx) { return ctx.webServer.register({}) }\nexport { inject };\n',
  })
  assert.equal(missing.status, 'fail')
  assert.match(missing.violations[0], /ctx\.webServer/)
  assert.match(missing.violations[0], /名单里没有它/)
})

test('QG-003：注释与字符串里的 ctx.credentials 不算命中（剥离后再扫）', () => {
  const inComment = run({
    'pkg/lib/index.js': 'export function apply(ctx) {\n  // 见 ctx.credentials 的说明\n  return ctx.get("credentials")\n}\n',
  })
  assert.equal(inComment.status, 'pass', inComment.violations.join('\n'))

  const inString = run({
    'pkg/lib/index.js': 'export function apply(ctx) { return "ctx.credentials" }\n',
  })
  assert.equal(inString.status, 'pass', inString.violations.join('\n'))
})

test('QG-003：落在 try 里的访问是刻意探测，不判红（实测理由：findPairing）', () => {
  const result = run({
    'pkg/lib/index.js': [
      'export function apply(ctx) {',
      '  try { const p = ctx.remoteWebUiPairing; if (p) return p } catch {}',
      '}',
    ].join('\n'),
  })
  assert.equal(result.status, 'pass', result.violations.join('\n'))
  assert.equal(result.checked, 1)
})

test('QG-003：同一个服务在 try 内外都出现时，只有未防护的那次判红', () => {
  const result = run({
    'pkg/lib/index.js': [
      'export function apply(ctx) {',
      '  try { void ctx.secretService } catch {}',
      '  return ctx.secretService.now()',
      '}',
    ].join('\n'),
  })
  assert.equal(result.status, 'fail')
  assert.match(result.violations[0], /ctx\.secretService/)
})

test('QG-003：内置属性与 Cordis 方法调用不需要 inject', () => {
  assert.deepEqual(ctxPropertyAccesses('ctx.get("x")'), [])
  assert.deepEqual(ctxPropertyAccesses('ctx.inject(["a"], cb)'), [])
  assert.deepEqual(ctxPropertyAccesses('ctx.root; ctx.scope; ctx.logger.warn("x")'), [])
  assert.deepEqual(ctxPropertyAccesses('ctx.credentials').map((hit) => hit.name), ['credentials'])
})

test('QG-003：inject 数组跨多行也能取全成员（下标位移必须跟着拼接走）', () => {
  const source = 'const inject = [\n  "webServer",\n  "credentials",\n  "tools",\n];\nexport function apply(ctx) { return ctx.webServer }\n'
  const stripped = stripCommentsAndStrings(source)
  assert.deepEqual(injectMembers(stripped.code, stripped.literals), ['webServer', 'credentials', 'tools'])
})

// ---------------------------------------------------------------------------
// 剥离器与最小解析器的边界
// ---------------------------------------------------------------------------

test('QG-003：剥离器保持长度不变，且注释/字符串/正则都不破坏括号平衡', () => {
  const source = 'const a = "}{"  // } 注释里的花括号\nconst re = /[{}]/g\nconst t = `x${"}"}`\n'
  const stripped = stripCommentsAndStrings(source)
  assert.equal(stripped.code.length, source.length)
  assert.equal(stripped.codeWithStrings.length, source.length)
  assert.equal(bracketsBalanced(stripped.code), true, stripped.code)
  assert.deepEqual(stripped.problems, [])
})

test('QG-003：导出面识别覆盖子句、默认导出、type-only 与转出口', () => {
  const surface = findExportSurface(
    stripCommentsAndStrings([
      'export { name, inject };',
      'export type Foo = string;',
      'export interface Bar {}',
      'export default class X extends Y {}',
      'export * from "./lib/index.js"',
    ].join('\n')).code,
    stripCommentsAndStrings([
      'export { name, inject };',
      'export type Foo = string;',
      'export interface Bar {}',
      'export default class X extends Y {}',
      'export * from "./lib/index.js"',
    ].join('\n')).codeWithStrings,
  )
  assert.deepEqual([...surface.names].sort(), ['inject', 'name'])
  assert.equal(surface.hasDefault, true)
  assert.equal(surface.defaultBindingName, 'X')
  assert.deepEqual(surface.starFrom, ['./lib/index.js'])
  assert.deepEqual(surface.unknownForms, [])
})

test('QG-003：没建模的导出形态必须报出来，不能当成「没有这个导出」', () => {
  const source = 'export == broken\n'
  const stripped = stripCommentsAndStrings(source)
  const surface = findExportSurface(stripped.code, stripped.codeWithStrings)
  assert.equal(surface.unknownForms.length, 1)
})

test('QG-003：类体解析覆盖 `var X = class extends Y` 与链式继承', () => {
  const source = [
    'var Base = class extends Root {',
    '  constructor(ctx, config) { super(ctx, "realService"); }',
    '};',
    'var Derived = class extends Base {',
    '  static inject = ["a"];',
    '  constructor(ctx, config) { super(ctx, config); }',
    '};',
    'export { Derived as default };',
  ].join('\n')
  const stripped = stripCommentsAndStrings(source)
  const surface = findExportSurface(stripped.code, stripped.codeWithStrings)
  assert.equal(surface.defaultBindingName, 'Derived')
  assert.notEqual(classBody(stripped.code, 'Derived'), null)
  const shape = serviceClassShape({
    code: stripped.code,
    text: source,
    names: surface.names,
    hasDefault: surface.hasDefault,
    defaultBindingName: surface.defaultBindingName,
    literals: stripped.literals,
  })
  assert.equal(shape.isService, true, '必须沿 extends 链找到真正的 super(ctx, "服务名")')
  assert.equal(shape.serviceName, 'realService')
  assert.equal(shape.declaresStaticInject, true)
  assert.deepEqual(shape.chain, ['Derived', 'Base'])
})

test('QG-003：try 区间识别必须配对到真正的右花括号', () => {
  const code = 'try { if (a) { b() } } catch {}\nconst after = 1\n'
  const spans = tryGuardSpans(code)
  assert.equal(spans.length, 1)
  assert.equal(code.slice(spans[0][0], spans[0][1] + 1), '{ if (a) { b() } }')
})

// ---------------------------------------------------------------------------
// L2：临时文件树上的包变异
// ---------------------------------------------------------------------------

test('QG-003 L2：临时包树上删入口 / 悬空转出口 / 移除 apply / 未声明 service 各自判红', async () => {
  await withMutationFixture({ prefix: 'lute-qg003' }, async (fixture) => {
    const pkgDir = fixture.path('repo', 'pkg')
    mkdirSync(join(pkgDir, 'lib'), { recursive: true })
    const write = (relative, contents) => {
      const target = fixture.path('repo', 'pkg', ...relative.split('/'))
      mkdirSync(join(target, '..'), { recursive: true })
      writeFileSync(target, contents)
    }
    const readText = (path) => {
      // 判定器吃的是「仓库相对路径」，这里把 fixture 的 repo 目录当成仓库根。
      const target = join(fixture.repo, ...path.split('/'))
      return existsSync(target) ? readFileSync(target, 'utf8') : null
    }
    const packages = [{ dir: 'pkg', manifest: { name: 'pkg', main: 'lib/index.js', ...BUNDLE } }]

    // 正控：干净形态必须绿。
    write('lib/index.js', 'const inject = ["credentials"];\nexport function apply(ctx) { return ctx.credentials }\nexport { inject };\n')
    assert.equal(checkPluginEntryContract(packages, readText).status, 'pass')

    // 变异 1：未声明 service。
    write('lib/index.js', 'const inject = ["credentials"];\nexport function apply(ctx) { return ctx.webServer.register({}) }\nexport { inject };\n')
    const drift = checkPluginEntryContract(packages, readText)
    assert.equal(drift.status, 'fail')
    assert.match(drift.violations[0], /ctx\.webServer/)

    // 变异 2：移除 apply。
    write('lib/index.js', 'export const name = "pkg"\n')
    assert.equal(checkPluginEntryContract(packages, readText).status, 'fail')

    // 变异 3：清单指向的入口被删掉。
    write('lib/index.js', 'export function apply() {}\n')
    const missingEntry = checkPluginEntryContract(
      [{ dir: 'pkg', manifest: { name: 'pkg', main: 'lib/gone.js', ...BUNDLE } }],
      readText,
    )
    assert.equal(missingEntry.status, 'fail')
    assert.equal(missingEntry.failed, 1)
  })
})

// ---------------------------------------------------------------------------
// L3：当前仓库的全部候选
// ---------------------------------------------------------------------------

test('QG-003 L3：当前仓库每个候选都得到解释，谁都不从分母里消失', () => {
  const packages = collectManagedManifests(REPO_ROOT).filter((entry) => entry.dir !== '.')
  const readText = (path) => {
    const target = join(REPO_ROOT, ...path.split('/'))
    return existsSync(target) ? readFileSync(target, 'utf8') : null
  }
  const result = checkPluginEntryContract(packages, readText)
  const validation = validateGateResult(result)
  assert.deepEqual(validation.errors, [], '规范门禁结果必须自洽')
  assert.equal(result.expected, result.checked + result.skipped + result.failed)
  assert.equal(result.failed, 0, result.violations.join('\n'))

  const candidates = packages.filter((entry) => {
    const dsh = entry.manifest.dsh
    return dsh && typeof dsh === 'object' && dsh.bundle && typeof dsh.bundle === 'object' && typeof dsh.bundle.patch === 'string'
  })
  assert.ok(candidates.length > 0)
  const analysed = candidates.map((entry) => analyseCandidate(entry, readText))
  for (const item of analysed) {
    assert.ok(CANDIDATE_KINDS.includes(item.kind), `${item.dir} 的分类 ${item.kind} 不在枚举里`)
    assert.ok(item.entryPath !== null || item.kind === 'unresolved', `${item.dir} 必须有入口路径或明确的 unresolved`)
  }
  // 旧实现的形状：`checked=21 / candidates=23` 而退出 0。这里两者必须相等。
  assert.equal(result.checked, candidates.length)
})

test('QG-003 L3：清单入口与 lib/index.js 不同的那个包，必须按清单读并跟到真实现', () => {
  const readText = (path) => {
    const target = join(REPO_ROOT, ...path.split('/'))
    return existsSync(target) ? readFileSync(target, 'utf8') : null
  }
  // 2026-09-17 实测：dsh-task-board-local 的清单入口是 `./index.js`，
  // 而它是 `export * from './lib/index.js'` 的转出口壳。
  const entry = collectManagedManifests(REPO_ROOT)
    .find((item) => item.relPath === 'packages/surfaces/dsh-task-board-local')
  assert.ok(entry, '这个包必须还在受管清单里，否则本断言要跟着改')
  const analysed = analyseCandidate(entry, readText)
  assert.equal(analysed.entryVia, 'exports["."].default')
  assert.equal(analysed.entryPath, 'packages/surfaces/dsh-task-board-local/index.js')
  assert.ok(analysed.chain.length >= 2, `转出口必须被跟开：${JSON.stringify(analysed.chain)}`)
  assert.equal(analysed.kind, 'plugin-apply')
})

test('QG-003 L3：Service 型候选被核对（不是跳过），且分类写进 note', () => {
  const packages = collectManagedManifests(REPO_ROOT).filter((entry) => entry.dir !== '.')
  const readText = (path) => {
    const target = join(REPO_ROOT, ...path.split('/'))
    return existsSync(target) ? readFileSync(target, 'utf8') : null
  }
  const result = checkPluginEntryContract(packages, readText)
  assert.match(result.note, /plugin-service=\d+/)
  assert.match(result.note, /未核对\*\* Service 型要哪些服务/, '边界必须写在读数里，不能留给人推断')
  assert.equal(validateGateResult(result).valid, true)
})
