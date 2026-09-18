/**
 * `theme-tokens.mjs` 的反向自测。
 *
 * ## 为什么这一项差点成了假红制造机
 *
 * 2026-09-15 实测：`dsh-settings-shell-local/src/client/shell.css` 在 `:root` 里声明
 * `--dsh-settings-shell-brand: #3d8a33`，并在**同一文件**用 `var()` 引用它——一个组件
 * 自有的局部变量被本项判成「从未被任何地方定义」，因为它的前缀 `--dsh-` 撞上了平台
 * 命名空间，而本项**只把 `"--dsw-x": v`（引号包裹的 JS 映射键）当成定义**，不认
 * CSS 里的裸声明 `--dsw-x: v`。
 *
 * 判据文字当时是自相矛盾的：注释写着「两种定义形态都要认」，实现只认一种。
 *
 * ## 用例为什么必须是「能说不」的
 *
 * 修法的风险**不在漏报而在过度放行**：一旦把「本包声明过」放宽成「别处声明过」，
 * 任何包写错一个平台 token 都会被另一个包的局部变量放行，本项就退化成恒真桩。
 * 所以这里的负向用例比正向的多，且最后一条直接钉住射程边界。
 *
 * 用**真的仓库**跑正向用例（不是合成夹具）：那样才证明「这条规则确实认得那个真实文件」，
 * 而不是证明它认得我临时造的字符串。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectLocallyScopedTokens, collectReferencedTokens } from './theme-tokens.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 真实仓库里那个曾造成假红的 token。 */
const REAL_LOCAL_TOKEN = '--dsh-settings-shell-brand'
/** 声明它的那个包（也是引用它的那个包）。 */
const SHELL_CSS = 'packages/platform/dsh-settings-shell-local/src/client/shell.css'
/** 一个与本 token 无关的包，用来构造「跨包引用」。 */
const OTHER_PACKAGE_FILE = 'packages/platform/dsh-theme-local/src/client/theme-tokens.ts'

/** @param {Record<string, string[]>} entries token → 引用文件 */
const asReferenced = (entries) => new Map(Object.entries(entries))

test('正向：真实仓库里「同包声明 + 同包引用」的局部 token 被认成局部（这才是那次假红的形状）', () => {
  const referenced = collectReferencedTokens(repoRoot)
  assert.ok(
    referenced.has(REAL_LOCAL_TOKEN),
    `前提失效：${REAL_LOCAL_TOKEN} 已不再被任何包引用，本用例失去射程`,
  )
  assert.deepEqual(
    referenced.get(REAL_LOCAL_TOKEN),
    [SHELL_CSS],
    '前提失效：该 token 的引用位置变了，跨包/同包的判断随之改变',
  )

  const local = collectLocallyScopedTokens(repoRoot, referenced)
  assert.equal(local.has(REAL_LOCAL_TOKEN), true, '同包声明的局部 token 必须被认出来，否则又是假红')
})

test('负向：跨包引用一个「只在别的包内部声明」的名字，仍然必须判红', () => {
  // 把引用者换成另一个包——此时「谁该供给它」确实没有答案，正是本项要拦的形状。
  const local = collectLocallyScopedTokens(
    repoRoot,
    asReferenced({ [REAL_LOCAL_TOKEN]: [OTHER_PACKAGE_FILE] }),
  )
  assert.equal(
    local.has(REAL_LOCAL_TOKEN),
    false,
    '跨包引用被放行了——射程被放宽成「别处声明过」，本项会退化成恒真桩（P-02）',
  )
})

test('负向：真正的幻觉 token 不得被任何局部声明放行', () => {
  const local = collectLocallyScopedTokens(
    repoRoot,
    asReferenced({ '--dsw-alias-totally-made-up': [SHELL_CSS] }),
  )
  assert.equal(local.size, 0, '凭空的名字被判成局部——判据失去了对幻觉 token 的射程')
})

test('负向：只在注释里出现过的名字不算声明（剥注释必须真的生效）', () => {
  // 用**合成夹具**而不是找真实文件：真实 shell.css 的注释里恰好没有 token 名，
  // 拿它当靶子是一条没有射程的用例（第一版就是这样，突变「不剥注释」它照样绿）。
  // 注释里的一句「这里不要再用 --dsw-x」是**叙述**不是声明，若被当成声明，
  // 任何一个被文档提到过的 token 都会被静默放行。
  const fixture = 'packages/platform/dsh-fixture-local/src/client/x.css'
  const text = [
    '/* 弃用说明：这里不要再用 var(--dsw-alias-deprecated-thing)。 */',
    '/* --dsw-alias-commented-out: 0; */',
    '.a { color: var(--dsw-alias-really-declared); }',
    ':root { --dsw-alias-really-declared: #000; }',
  ].join('\n')

  const deps = {
    listFiles: (packageDir) => (packageDir === 'packages/platform/dsh-fixture-local' ? [fixture] : []),
    readText: (rel) => (rel === fixture ? text : null),
  }

  const local = collectLocallyScopedTokens(
    repoRoot,
    asReferenced({
      '--dsw-alias-commented-out': [fixture],
      '--dsw-alias-deprecated-thing': [fixture],
      '--dsw-alias-really-declared': [fixture],
    }),
    deps,
  )

  assert.equal(local.has('--dsw-alias-really-declared'), true, '真声明必须被认出来（否则夹具本身没射程）')
  assert.equal(
    local.has('--dsw-alias-commented-out'),
    false,
    '块注释里的名字被当成了声明——剥注释没生效，等于给所有被文档提到过的 token 开后门',
  )
  assert.equal(
    local.has('--dsw-alias-deprecated-thing'),
    false,
    '注释里 var() 引用的名字被当成了声明——剥注释没生效',
  )
})

test('反空转：局部集合必须真的是子集，且不含平台供给的 token', () => {
  const referenced = collectReferencedTokens(repoRoot)
  const local = collectLocallyScopedTokens(repoRoot, referenced)
  // 若实现退化成「全都算局部」，本项会恒绿——这条钉住它。
  assert.ok(
    local.size < referenced.size,
    `局部集合(${local.size}) 不小于引用总量(${referenced.size})——判据已经退化成恒真桩`,
  )
  assert.equal(local.has('--dsw-alias-bg-layer-1'), false, '平台供给的 token 不得被判成局部')
})

/* ── 射程：按包的实际形态分流（2026-09-18）────────────────────────────────────
 *
 * 原先射程只覆盖 `packages/<组>/<包>/src/`。对有 TypeScript 源的包这是对的，
 * 但仓库里有一批**纯 JS 包**（无 `src/`，`lib/client.js` 就是源头）：对它们
 * `walk(srcDir)` 目录不存在、静默返回空，于是**整个包一条引用都扫不到**——
 * 射程为空，读数上却与「全合规」同形（P-02 最便宜的失效路径）。
 *
 * 当天实测该盲区的代价：14 个无 `src` 的包里 5 个正在引用平台 token，其中 3 个是
 * 幻觉 token（`--dsh-layer-drawer`、`--dsw-alias-label-on-accent`、
 * `--dsw-alias-state-warning-primary`）。三者都写了字面兜底，所以页面上看不出问题，
 * 只是那些元素不随主题变化——与基线的 7 条旧违规同一个失效方式。
 *
 * 下面两条是**互补**的：一条守「无 src 的包必须进射程」，一条守「有 src 的包不得
 * 重复扫 lib」——只加前者会让「干脆所有包都扫 src+lib」这种过度修法也能变绿，
 * 而那会把每一处引用数两遍，并让 `lib/` 里过期的构建产物造出假红。
 */

test('射程：无 src 的包（lib 即源头）必须被扫到——改回「只扫 src」本条即红', () => {
  const srcLessPkg = 'packages/capabilities/dsh-wanzh-hulian'
  assert.equal(
    existsSync(join(repoRoot, srcLessPkg, 'src')),
    false,
    `前提失效：${srcLessPkg} 现在有了 src/，本用例的「无 src」前提需重立（换一个仍无 src 的包或改判据）`,
  )

  const referenced = collectReferencedTokens(repoRoot)
  const fromLib = [...referenced.values()].filter((files) =>
    files.some((f) => f.startsWith(`${srcLessPkg}/lib/`)))

  assert.ok(
    fromLib.length > 0,
    `${srcLessPkg} 无 src/，其 lib/ 就是源头，却一条引用都没扫到——`
    + '射程为空在读数上与「全合规」同形。把 collectReferencedTokens 的分支改回只扫 src，本条必须变红',
  )
})

test('射程：有 src 的包只扫 src，不得重复扫 lib——改成 src+lib 全扫本条即红', () => {
  const packageWithSrc = 'packages/platform/dsh-theme-local'
  assert.equal(
    existsSync(join(repoRoot, packageWithSrc, 'src')),
    true,
    `前提失效：${packageWithSrc} 失去了 src/，本用例不再是「有 src 的包」`,
  )

  const referenced = collectReferencedTokens(repoRoot)
  const fromLib = [...referenced.values()]
    .flat()
    .filter((f) => f.startsWith(`${packageWithSrc}/lib/`))

  assert.deepEqual(
    fromLib,
    [],
    '有 src 的包不该再扫 lib/：lib 是构建产物，扫它等于把同一处引用数两遍，'
    + '且会让 lib 里过期的字节造出假红——射程要按包的实际形态分流，不是简单取并集',
  )
})

test('射程对齐：无 src 的包在 lib/ 里「声明 + 同包引用」必须认作局部——声明侧只扫 src 本条即红', () => {
  const srcLess = 'packages/surfaces/dsh-my-quotes'
  const declFile = `${srcLess}/lib/client.js`
  const token = '--dsh-scrollbar-thumb-hover'

  assert.equal(
    existsSync(join(repoRoot, srcLess, 'src')),
    false,
    `前提失效：${srcLess} 现在有 src/ 了，本用例的「无 src」前提需重立`,
  )
  assert.match(
    readFileSync(join(repoRoot, declFile), 'utf8'),
    new RegExp(`${token}\\s*:`),
    `前提失效：${declFile} 不再声明 ${token}，本用例失去射程`,
  )

  // 引用侧是**构造的**：本用例量的是「声明侧能不能看见 lib/」，不是「谁引用了它」——
  // 后者由默认的 collectReferencedTokens 负责，那一条在真实仓库里可能随时变化。
  const local = collectLocallyScopedTokens(repoRoot, new Map([[token, [declFile]]]))

  assert.equal(
    local.has(token),
    true,
    '无 src 的包其 lib/ 就是源头。声明侧若仍只扫 src/，就会出现「引用被收下、声明看不见」的'
    + '不对称，同包声明+同包引用当场被判成幻觉 token——那是假红，长相与真缺陷一模一样（P-02）。'
    + '把 defaultListSourceFiles 改回只扫 src，本条必须变红',
  )
})
