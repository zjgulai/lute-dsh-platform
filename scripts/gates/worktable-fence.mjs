/**
 * dsh-worktable 信任栅栏的**结构门禁**（C0 的机器化版本）。
 *
 * ## 为什么需要它
 *
 * 栅栏是**补丁**，不是上游行为：`dsh-patches/worktable-fence/apply.mjs` 往
 * `vendor/dsh-worktable/01_content/lib/index.js` 的最前面注入一段 ESM，并把 `apply()` 里
 * `const webServer = ctx.webServer;` 换成过 Proxy 的版本。补丁形态带来三种**自己不会喊**的失效：
 *
 *   1. **产物没打**：`apply.mjs` 忘跑、或 profile 的 `node_modules` 符号链接被换成一份
 *      干净副本——代码照常跑，9 条入口一条不拦。
 *   2. **锚点落空**：上游一发版改了 `apply()` 的写法，注入块还在、包裹那一行对不上，
 *      于是「栅栏块存在」为真而「路由被包住」为假。这两种状态**必须分开判**。
 *   3. **标识符撞名**：注入块与被注入的 bundle 处在**同一个模块作用域**。上游哪天新增一个
 *      与栅栏同名的顶层绑定，轻则 `let/const` 直接 SyntaxError（响亮，好），
 *      重则 `var`/`function` 静默互相覆盖——栅栏函数被顶掉，一样是一条都不拦。
 *
 * 本项把这三条钉成判据。它**不**验证「运行时真的拦住了请求」——那要真开服务、真跑 curl，
 * 归 `scripts/acceptance/worktable-fence-live.mjs`（含变异测试：把未打栅栏的原版 bundle
 * 喂给同一套探针，要求 15 条负向全部转红）。静态与动态两侧互为证伪，取舍见 ADR-0029。
 *
 * ## 契约
 *
 * - 「栅栏在位」= **锚点计数**，不是「文件里有 `__wtFence` 这个词」。两者必须同时判。
 * - 栅栏源（`fence.js`）与产物里那份副本的**版本号必须相等**。源改了忘了重打 = 失败。
 * - profile 不存在时报告为**跳过**（`passed: true` + `note`），与 `patch-anchors`、
 *   `theme-tokens` 同一语义：环境不存在时不假绿也不假红；装上了就必须能失败。
 * - vendor 仓库不在时同样跳过（嵌套仓是按需 clone 的，不进本仓库）。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

/** `apply()` 里被替换成的那一行——栅栏「真的包住了 webServer」的唯一判据。 */
const ANCHOR_PATCHED = 'const webServer = __wtFence(ctx.webServer, ctx);'

/** 顶层声明（esbuild 产物与手写栅栏都把它们放在第 0 列）。 */
const TOP_LEVEL_DECL = /^(?:function|var|let|const|class)\s+([A-Za-z_$][\w$]*)/gm

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function topLevelNames(source) {
  const names = new Set()
  for (const match of source.matchAll(TOP_LEVEL_DECL)) names.add(match[1])
  return names
}

/** 栅栏块 = 注入内容（到 bundle 自己的第一行 `import` 为止）。 */
function splitFenceBlock(artifactText) {
  const at = artifactText.indexOf('\nimport { execFile }')
  return at < 0 ? null : { block: artifactText.slice(0, at), rest: artifactText.slice(at) }
}

function versionOf(text) {
  return text.match(/const __WT_FENCE_VERSION = "([^"]+)"/)?.[1] ?? null
}

/**
 * @param {{repoRoot: string, profileDir: string, dshHome: string}} ctx
 * @returns {{passed: boolean, violations: string[], note?: string}}
 */
export function checkWorktableFence({ repoRoot, profileDir }) {
  const vendorDir = join(repoRoot, 'vendor', 'dsh-worktable')
  const packageDir = join(vendorDir, '01_content')
  const artifactPath = join(packageDir, 'lib', 'index.js')
  const fenceSrcPath = join(repoRoot, 'dsh-patches', 'worktable-fence', 'fence.js')
  const pinPath = join(repoRoot, 'vendor', 'dsh-worktable.pin')

  if (!existsSync(artifactPath) || !existsSync(fenceSrcPath)) {
    return {
      passed: true,
      violations: [],
      note: 'vendor/dsh-worktable 未 clone（嵌套仓按需拉取），本项跳过',
    }
  }
  if (!existsSync(pinPath)) {
    return { passed: false, violations: ['vendor/dsh-worktable.pin 缺失——栅栏的 pin 守卫没有事实源'] }
  }

  const violations = []
  const pin = readFileSync(pinPath, 'utf8')
  const pinnedSha = pin.match(/^upstream-sha:\s*(\S+)/m)?.[1] ?? null
  const artifactText = readFileSync(artifactPath, 'utf8')
  const fenceSrc = readFileSync(fenceSrcPath, 'utf8')

  // ① 锚点：**先判「块在不在」，再判「包没包住」**。
  //    这两种失效方式的修法完全不同（前者跑 apply.mjs，后者要人工重锚），
  //    所以判据必须分开——早先的写法靠「上游原文那一行还在不在」来分，
  //    结果把「块在 + 锚点落空」误报成「块没打上」（由 worktable-fence.test.mjs 的
  //    第 3 条用例抓出来）。分叉点只能是**注入块自身的标识**。
  const blockPresent = artifactText.includes('function __wtFence(')
  const anchorHits = artifactText.split(ANCHOR_PATCHED).length - 1
  if (!blockPresent) {
    violations.push(
      '产物里没有 __wtFence 定义——注入块没打上（产物仍是上游原文），9 条入口一条不拦；'
      + '跑 node dsh-patches/worktable-fence/apply.mjs',
    )
  } else if (anchorHits !== 1) {
    violations.push(
      `产物里有注入块，但 ${ANCHOR_PATCHED} 出现 ${anchorHits} 次（期望 1）——`
      + '锚点落空（上游 apply() 的写法已变），栅栏块在却**没有包住路由**；需人工重锚后跑 apply.mjs',
    )
  }

  // ② 版本一致性：源改了没重打，产物就是过期的栅栏。
  const srcVersion = versionOf(fenceSrc)
  const artifactVersion = versionOf(artifactText)
  if (srcVersion === null) violations.push('fence.js 里读不到 __WT_FENCE_VERSION')
  else if (artifactVersion === null) violations.push('产物里读不到 __WT_FENCE_VERSION——栅栏块缺失')
  else if (artifactVersion !== srcVersion) {
    violations.push(`产物栅栏版本 ${artifactVersion} ≠ 源 ${srcVersion}——源改过但没重跑 apply.mjs`)
  }

  // ③ 标识符撞名：注入块与被注入 bundle 同处一个模块作用域。
  const split = splitFenceBlock(artifactText)
  if (split === null) {
    violations.push('切不出注入块与 bundle 本体（找不到 bundle 的首个 import）——撞名判据无法成立')
  } else {
    const fenceNames = topLevelNames(split.block)
    const bundleNames = topLevelNames(split.rest)
    const clash = [...fenceNames].filter((name) => bundleNames.has(name))
    if (clash.length > 0) {
      violations.push(
        `栅栏与 bundle 顶层标识符撞名：${clash.join('、')}——`
        + 'var/function 会静默互相覆盖（栅栏被顶掉即一条都不拦），let/const 则直接 SyntaxError；给栅栏换前缀',
      )
    }
  }

  // ④ pin 守卫：栅栏锚在上游文本上，pin 不匹配就等于锚在未知版本上。
  if (pinnedSha !== null && existsSync(join(vendorDir, '.git'))) {
    try {
      const head = execFileSync('git', ['-C', vendorDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      if (head !== pinnedSha) {
        violations.push(`vendor/dsh-worktable HEAD ${head.slice(0, 12)} ≠ pin 的 ${pinnedSha.slice(0, 12)}——先 bump pin 并重审锚点`)
      }
    } catch (error) {
      violations.push(`读 vendor/dsh-worktable 的 HEAD 失败：${String(error).slice(0, 160)}`)
    }
  }

  // ⑤ 已安装产物：profile 里那份必须与 vendor 产物是**同一份文件**，且带栅栏。
  //
  // 两件事分开查，因为它们是两个失效形态：
  //   - 同一份**内容**（逐字节）——安装面被换成了别的副本；
  //   - 同一份**文件**（realpath 落在 vendor 树内）——副本此刻恰好同字节，但它是
  //     一份可独立漂移的拷贝，明天补打栅栏就不会进去。
  // 后者不是假想：`file:` 依赖在 profile 里落成硬链接实体副本（scripts/gates/
  // sync-profile.mjs 有同一条实测记录），于是 vendor 改了、运行时那份没改，而当时
  // 门禁只比字节时它会**通过**——直到某次内容真正分叉才响。故安装形态固定为 `link:`
  // （见 vendor/dsh-worktable.pin），并在此按身份校验。
  const installedEntry = join(profileDir, 'node_modules', 'dsh-worktable', 'lib', 'index.js')
  if (!existsSync(installedEntry)) {
    return {
      passed: violations.length === 0,
      violations,
      note: 'profile 未安装 dsh-worktable（profile 目录不存在或未 pnpm install），仅校验 vendor 产物',
    }
  }
  let realpath = null
  try {
    realpath = realpathSync(installedEntry)
  } catch (error) {
    violations.push(`profile 里的 dsh-worktable 入口不可解析：${String(error).slice(0, 160)}`)
  }
  if (realpath !== null && statSync(realpath).isFile()) {
    // 身份：解析结果必须落在 vendor 树内。前缀比较用 realpath，避免 /var → /private/var 之类的
    // 符号链接差异把正确的安装误判成拷贝。
    const vendorReal = realpathSync(vendorDir)
    const inside = realpath === vendorReal || realpath.startsWith(vendorReal + sep)
    if (!inside) {
      violations.push(
        `profile 安装的 dsh-worktable 解析到 ${realpath}，不在 vendor 树 ${vendorReal} 内——`
        + '运行时装载的是一份**可独立漂移的拷贝**而不是被打补丁的那个文件；'
        + '依赖请写成 link:<repo>/vendor/dsh-worktable/01_content（见 vendor/dsh-worktable.pin）',
      )
    }
    const installedText = readFileSync(realpath, 'utf8')
    if (sha256(installedText) !== sha256(artifactText)) {
      violations.push(
        `profile 安装的产物与 vendor 产物不是同一份字节（${realpath}）——`
        + '安装面被换成了别的副本，vendor 侧过门禁也拦不住运行时的这一份',
      )
    }
    if (installedText.split(ANCHOR_PATCHED).length - 1 !== 1) {
      violations.push('profile 安装的产物没有栅栏锚点——运行时那份是干净的')
    }
  }

  // ⑥ 安装面登记：profile 的 dependencies + dsh.profile.bundles 两个条目缺一不可。
  const profilePkgPath = join(profileDir, 'package.json')
  if (existsSync(profilePkgPath)) {
    let profilePkg = null
    try {
      profilePkg = JSON.parse(readFileSync(profilePkgPath, 'utf8'))
    } catch (error) {
      violations.push(`profile/package.json 解析失败：${String(error).slice(0, 160)}`)
    }
    if (profilePkg !== null) {
      if (typeof profilePkg.dependencies?.['dsh-worktable'] !== 'string') {
        violations.push('profile/package.json 的 dependencies 里没有 dsh-worktable——插件不会被安装')
      }
      const bundles = profilePkg.dsh?.profile?.bundles
      if (!Array.isArray(bundles) || !bundles.includes('dsh-worktable')) {
        violations.push('profile/package.json 的 dsh.profile.bundles 里没有 dsh-worktable——插件装了也不会挂载')
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    ...(violations.length === 0
      ? { note: `栅栏 v${artifactVersion} 在位（锚点 1/1、无撞名、pin 一致、安装面同字节）` }
      : {}),
  }
}
