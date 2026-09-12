/**
 * 主题 Token 可达性校验（C2「无硬色值、双主题可回归」的机器化版本）。
 *
 * ## 为什么需要它
 *
 * 自研 UI 的颜色一律写成 `var(--dsw-alias-x, <字面色>)`。这个写法有一个**静默**
 * 失败模式：token 名字打错或根本不存在时，CSS 不报错、构建不报错、页面照常显示
 * ——只是**永远走那条字面兜底**，于是这个元素不再随主题变化。浅色下看不出来，
 * 深色下才暴露（`rgba(0,0,0,0.05)` 铺在深色底上等于没有）。
 *
 * 实测（2026-09-12，扫应用内 `@deepseek-ai/` 的已定义 token 对本仓库受管包的引用）：
 * **8 个被引用但从没有任何地方定义过**（登记在基线里）。也就是说「无硬色值」这条
 * 验收此前是**口头**的——没有任何机制能发现它被违反。
 *
 * ## 这个判据自己的两个盲点，以及为什么本项不是唯一防线
 *
 * 本项的「已定义」是**静态文本提取**，它有两种自己看不见的错：**假阳性**（名字在源码里
 * 出现、但在真实级联里永不生效——被后写规则覆盖、写在匹配不到的选择器下）与**假阴性**
 * （供给在运行时才算得出来）。「门禁说已定义」还有两种理由，失效方式不同：官方 CSS 声明
 * 与**本仓库主题插件的 JS 供给**（后者由 `buildThemeTokenOverrides` 的返回值决定，
 * 而本项只看字面量是否出现过）。
 *
 * 故本项**不单独承担**这条验收：`scripts/acceptance/theme-tokens-live.mjs` 用真实 Chrome +
 * 逐字取自产物的样式表 + 逐字调用 `buildThemeTokenOverrides`，把两侧都证伪一遍。
 * 取舍与取证见 ADR-0029。
 *
 * ## 契约
 *
 * - 「已定义」的唯一事实源是**应用内官方主题包**（`@{deepseek-ai}/*` 里的
 *   `<平台命名空间><name>:`，见 `NAMESPACE`），本仓库**不得**再抄一份 token 清单（ADR-0009）。
 * - 覆盖面是平台的三个命名空间 `--dsw-` / `--ds-` / `--dsh-`，不是只有 `--dsw-`：只扫
 *   一个前缀会漏掉整类错别字（取证见 `NAMESPACE` 的注释）。
 * - app 未安装时报告为**跳过**（`passed: true` + `note`），与 `patch-anchors` 同一
 *   语义：环境不存在时不假绿也不假红；装上了就必须能失败。
 * - 存量违规登记在 `theme-tokens-baseline.json`，且**只减不增**：基线里的条目一旦
 *   不再被引用，本项即失败，强制把清单删干净（ADR-0014 的同一纪律）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from '../lib/strip-comments.mjs'

/**
 * 平台 token 的命名空间。
 *
 * 只扫 `--dsw-` 是**漏的**：官方主题同时供给 `--ds-font-family-code`、`--dsh-scrollbar-thumb`
 * 这些前缀，而本仓库确实在用 `--ds-font-family-code`（`dsh-theme-local/src/client/theme-tokens.ts`）。
 * 一个 `--ds-` 前缀的错别字在旧口径下两边都扫不到——门禁看不见、页面照走字面兜底，
 * 又是一个静默失败。故这里把**平台自身的命名空间**都纳入。
 *
 * 为什么不连 `--appearance-*` / `--card-tint` 一起收：那些是组件**自己**在同一个文件里
 * 定义的局部变量（`studio.css` 的 `--appearance-accent: var(--dsw-alias-…)`、
 * `views.module.css` 的 `.projectCard { --card-tint: … }`），不是平台供给的名字，
 * 收进来只会造出一批假阳性——而假阳性会训练人忽略输出。
 */
const NAMESPACE = '--(?:dsw|ds|dsh)-'

/**
 * 收集**引用**：受管包的 src/ 下所有平台命名空间 token，且必须出现在 `var()` 里。
 *
 * ## 为什么必须是 `var()`，而不是「名字出现过」
 *
 * 一个 token 的**定义**（`--dsw-x: …`、`"--dsw-x": …`）与它的**使用**
 * （`var(--dsw-x)`）是两种形状，而「引用」只指后者。旧口径按「文本里出现过」收集，
 * 于是有两类东西被当成了引用，各自造出一批**假红**（实测 2026-09-12，本仓库）：
 *
 *  1. **注释里的名字**。本规格要求「弃用的 token 必须写清为什么弃用」，而按旧口径，
 *     一句「这里不要再用 `--dsw-font-mono`」会让 `--dsw-font-mono` **重新变成一个必须
 *     存在的 token**——写文档反而造出违规。这是与 ADR-0015 直接冲突的行为。
 *  2. **供给方自己的映射键**。`dsh-theme-local` 的 `"--dsw-font-mono": same(codeFamily)`
 *     是**定义**，却被计入「谁引用了它」，于是这门禁永远答不出「这个 token 没人用」。
 *
 * 所以先剥注释、再只认 `var(` 后面的名字。剥注释的顺序是**先块后行**，且行注释的正则
 * 要求 `/` 前面不是 `:`——否则 `https://…` 会被从中间截断，把 URL 后面的真实引用吃掉。
 *
 * 代价说清楚：写在裸字符串里（`setProperty('--dsw-x', …)` 这类）的引用不再计入。
 * 本仓库当前没有这种写法（8 条基线违规全是 `var()`），真出现时**假阴性**由
 * `scripts/acceptance/theme-tokens-live.mjs` 兜——它跑真实引擎，不依赖文本形状。
 */
const TOKEN_IN_VAR = new RegExp(`var\\(\\s*(${NAMESPACE}[a-z0-9]+(?:-[a-z0-9]+)*)`, 'g')

// 剥注释的家在 scripts/lib/strip-comments.mjs——它在 2026-09-12 当天被两个门禁项同时
// 需要（本项与 node-interpreter），按 ADR-0009 提为公共模块，判据文字也随之搬过去。


/** 一个 token 至少要有一个非空的段，`--dsw-` / `--dsw-alias-` 这类前缀片段不算。 */
function isCompleteToken(token) {
  return new RegExp(`^${NAMESPACE}[a-z0-9]+(?:-[a-z0-9]+)+$`).test(token)
}

/** 递归列出目录下的文本文件（跳过 node_modules / lib / build / dist）。 */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'lib' || name === 'build' || name === 'dist') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|js|mjs|cjs|css)$/.test(name)) out.push(full)
  }
  return out
}

/**
 * 受管包引用到的全部 token → 引用它的文件清单。
 * @param repoRoot 仓库根
 * @returns {Map<string, string[]>} token → 仓库相对路径列表
 */
export function collectReferencedTokens(repoRoot) {
  const packs = join(repoRoot, 'packages')
  const found = new Map()
  if (!existsSync(packs)) return found
  for (const group of readdirSync(packs)) {
    const groupDir = join(packs, group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const pkg of readdirSync(groupDir)) {
      const srcDir = join(groupDir, pkg, 'src')
      for (const file of walk(srcDir)) {
        const text = stripComments(readFileSync(file, 'utf8'))
        for (const match of text.matchAll(TOKEN_IN_VAR)) {
          const token = match[1]
          if (!isCompleteToken(token)) continue
          const rel = file.slice(repoRoot.length + 1)
          const list = found.get(token) ?? []
          if (!list.includes(rel)) list.push(rel)
          found.set(token, list)
        }
      }
    }
  }
  return found
}

/**
 * 官方主题包定义的 token 集合。唯一事实源是应用内的官方包，本仓库不抄第二份。
 * @param appDir 应用根（`/Applications/DSH Desktop.app`）
 * @returns {Set<string>} 已定义 token
 */
export function collectDefinedTokens(appDir) {
  const official = join(appDir, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', '@deepseek-ai')
  if (!existsSync(official)) return new Set()
  let output = ''
  try {
    output = execFileSync('grep', ['-rhoE', '--', `${NAMESPACE}[a-z0-9-]*[a-z0-9]:`, official], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    // grep 无命中时退出码为 1；此处不是错误。
    return new Set()
  }
  return new Set(output.split('\n').map((line) => line.replace(/:$/, '')).filter((line) => line !== ''))
}

/**
 * 本仓库自己**定义**的 token（主题插件是 token 的供给方）。
 *
 * 为什么必须算进来：`dsh-theme-local` 的职责就是供给 alias 层，它以 JS 映射的形式
 * 返回 `{"--dsw-alias-bg-layer-1": …, "--dsw-font-mono": …}`（实测 65 个）。只看官方
 * 包会把它们全判成幻觉 token——**假阳性会训练人忽略输出**，真正的违规就藏进噪音里。
 *
 * 两种定义形态都要认：
 *   - 本仓库：`"--dsw-x": value`（引号包裹的映射键，主题插件的供给形态）
 *   - 官方包：`--dsw-x: value`（CSS 自定义属性声明）
 * @param repoRoot 仓库根
 * @returns {Set<string>} 本仓库定义的 token
 */
export function collectRepoDefinedTokens(repoRoot) {
  const packs = join(repoRoot, 'packages')
  const found = new Set()
  if (!existsSync(packs)) return found
  for (const group of readdirSync(packs)) {
    const groupDir = join(packs, group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const pkg of readdirSync(groupDir)) {
      for (const file of walk(join(groupDir, pkg, 'src'))) {
        for (const match of readFileSync(file, 'utf8').matchAll(new RegExp(`"(${NAMESPACE}[a-z0-9]+(?:-[a-z0-9]+)*)":`, 'g'))) {
          found.add(match[1])
        }
      }
    }
  }
  return found
}

/**
 * 门禁校验项：引用的 token 必须真的被定义（官方主题包，或本仓库的主题插件）。
 * @param root0 依赖
 * @param root0.repoRoot 仓库根
 * @param root0.appDir 应用根；不存在时本项跳过
 * @param root0.baseline 存量违规 token 列表（只减不增）
 * @returns {{passed: boolean, violations: string[], note?: string}}
 */
export function checkThemeTokens({ repoRoot, appDir, baseline }) {
  const official = join(appDir, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', '@deepseek-ai')
  if (!existsSync(official)) {
    // 与 patch-anchors 同一语义：环境不存在时跳过，不假绿也不假红。
    return { passed: true, violations: [], note: '官方主题包不可达，本项跳过' }
  }

  const referenced = collectReferencedTokens(repoRoot)
  const defined = collectDefinedTokens(appDir)
  if (defined.size === 0) {
    // 扫到了目录却一个 token 都没读出来 = 提取方式已失效，绝不当成「全部合规」。
    return {
      passed: false,
      violations: ['官方主题包里读不出任何平台命名空间 token：提取方式已失效，本项会静默变空转'],
    }
  }
  for (const token of collectRepoDefinedTokens(repoRoot)) defined.add(token)

  const allowed = new Set(baseline.map((row) => row.token))
  const violations = []

  for (const [token, files] of [...referenced].sort()) {
    if (defined.has(token) || allowed.has(token)) continue
    violations.push(
      `${token} 从未被任何地方定义（引用于 ${files.join('、')}）`
      + '——`var()` 会静默走字面兜底，该元素不随主题变化；改用真实 token 或登记进基线',
    )
  }

  // 只减不增：基线条目一旦不再被引用就必须删除，否则清单会永久腐烂成噪音。
  for (const row of baseline) {
    if (!referenced.has(row.token)) {
      violations.push(
        `基线条目 ${row.token} 已不再被任何包引用——请从 theme-tokens-baseline.json 删除`
        + '（本项只减不增；留着会让真正的违规藏进噪音）',
      )
    }
  }

  return { passed: violations.length === 0, violations }
}
