/**
 * dsh-worktable 的**卸载门禁**（ADR-0045；本文件是 ADR-0029/0030 那份栅栏门禁的语义翻转版）。
 *
 * ## 为什么判据从「守护已安装」翻成「断言未安装」
 *
 * 这份门禁原先守护的是：栅栏补丁已经打进 vendor 产物、锚点没落空、profile 装的就是
 * 那一份被打补丁的文件。那一整套判据成立的前提是**插件在跑**——它每一条都在回答
 * 「运行时装载的这份产物，拦不拦得住那 9 条入口」。
 *
 * 用户裁决（ADR-0045 R5/R6）：工作台与控制室的 UI 全部清除，本机不再装载它。前提没了，
 * 判据就得跟着没：一个断言「不存在的耦合仍然完好」的门禁，正是 ADR-0009 说的那种
 * 「一个事实的第二处家」——它会一直绿，并且一直让人以为这条链路还在。
 *
 * 所以翻转后它只回答三件事：
 *
 *   1. **别装回来**：profile 的 `dependencies` / `dsh.profile.bundles` / `node_modules`
 *      三处都必须没有 `dsh-worktable`。任一处出现，1.4 MB client 与 9 条路由就回来了
 *      ——这正是本次剪枝要消掉的东西。
 *   2. **资产还在**：vendor 树、pin、栅栏补丁必须在位。卸载是「不安装」，不是「删资产」：
 *      资产是这条决策唯一可逆的凭据，删掉它，想回退就得重新 clone + 重新锚补丁。
 *   3. **pin 没漂**（vendor 在时）：资产仍是 pin 记录的那一份。ADR-0008 的纪律不因为
 *      不装载而失效——资产的意义就在于它**是什么**。
 *
 * ## 它**不**再判什么（诚实写清楚）
 *
 * - 不判栅栏锚点在不在产物里：没有运行时装载那份产物，锚点是否落空不影响任何行为。
 *   该判据连同实况探针一并作废，作废的理由记在 ADR-0045。
 * - 不判运行时真的 404：那要真开服务真发请求，归
 *   `scripts/acceptance/worktable-fence-live.mjs`（同一套翻转语义）。
 *
 * ## 契约
 *
 * - **安装面三项不依赖 vendor**：vendor 没 clone 也必须照判（否则「vendored 资产在不在」
 *   会变成「这条门禁跑不跑」的开关，而漏装的插件正好能让门禁静默消失）。
 * - vendor 资产项在 vendor 未 clone 时报告为**跳过**（`passed: true` + `note`），与
 *   `patch-anchors`、`theme-tokens` 同一语义：环境不存在时不假绿也不假红。
 * - profile 目录不存在时同样跳过。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

/** profile 里**不允许**再出现的包名。 */
const PACKAGE_NAME = 'dsh-worktable'

/**
 * 卸载后的资产清单：这些东西必须留着，卸载才是可逆的。
 * @param repoRoot - 仓库根。
 * @returns 资产绝对路径，第 0 项是 vendor 树（可能未 clone），其余都在仓库内。
 */
function assetPaths(repoRoot) {
  return [
    join(repoRoot, 'vendor', PACKAGE_NAME),
    join(repoRoot, 'vendor', `${PACKAGE_NAME}.pin`),
    join(repoRoot, 'dsh-patches', 'worktable-fence', 'fence.js'),
    join(repoRoot, 'dsh-patches', 'worktable-fence', 'apply.mjs'),
  ]
}

/**
 * 检查 dsh-worktable 确实没有被安装，且它的资产仍然保留。
 * @param {{repoRoot: string, profileDir: string}} ctx
 * @returns {{passed: boolean, violations: string[], note?: string}}
 */
export function checkWorktableFence({ repoRoot, profileDir }) {
  const violations = []

  // ── ① 安装面：三处都必须没有它。**不依赖 vendor**，因此排在资产判定之前。
  const packageJsonPath = join(profileDir, 'package.json')
  const installedDir = join(profileDir, 'node_modules', PACKAGE_NAME)

  if (existsSync(packageJsonPath)) {
    let profilePkg = null
    try {
      profilePkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    } catch (error) {
      violations.push(`profile/package.json 解析失败：${String(error).slice(0, 160)}`)
    }
    if (profilePkg !== null) {
      const depends = profilePkg.dependencies?.[PACKAGE_NAME]
      if (depends !== undefined) {
        violations.push(
          `profile/package.json 的 dependencies 里又有 ${PACKAGE_NAME}（${String(depends)}）——`
          + '它会被装回来，1.4 MB client 与 9 条路由随之回场（ADR-0045 B1）',
        )
      }
      const bundles = profilePkg.dsh?.profile?.bundles
      if (Array.isArray(bundles) && bundles.includes(PACKAGE_NAME)) {
        violations.push(
          `profile/package.json 的 dsh.profile.bundles 里又有 ${PACKAGE_NAME}——`
          + '装了就会挂载，工作台与控制室的 UI 会重新出现（ADR-0045 B2）',
        )
      }
    }
  }

  // 目录也要判：pnpm 的残留（一次 install 之前留下的符号链接或实体副本）足以让 bundles
  // 里的旧条目继续解析到一份真实产物。只判 package.json 会漏掉这个状态——实测遇到过：
  // 摘掉 bundles 与 dependencies 之后，node_modules 里的符号链接仍在。
  if (existsSync(installedDir)) {
    let resolved = installedDir
    try {
      resolved = realpathSync(installedDir)
    } catch {
      // 解析不了也照样报：一个解析不动的安装项本来就是违规。
    }
    violations.push(
      `profile/node_modules 里仍有 ${PACKAGE_NAME}（解析到 ${resolved}）——`
      + 'bundles 已摘但产物还在，装载面是否干净就取决于下一次 install 的运气；'
      + `直接删掉它：rm -rf ${installedDir}`,
    )
  }

  // ── ② 资产保留：vendor 树 + pin + 补丁必须在位，卸载才可逆。
  const [vendorDir, pinPath] = assetPaths(repoRoot)
  const missingInRepo = assetPaths(repoRoot)
    .filter((path) => path !== vendorDir)
    .filter((path) => !existsSync(path))
  for (const path of missingInRepo) {
    violations.push(
      `资产缺失：${path}——卸载保留资产是为了让这条决策可逆（ADR-0045 R6）；`
      + '删掉资产等于把回退路径也一起删了',
    )
  }

  const vendorPresent = existsSync(vendorDir)
  if (!vendorPresent && missingInRepo.length === 0 && violations.length === 0) {
    return {
      passed: true,
      violations,
      note: `${PACKAGE_NAME} 未安装；vendor 树未 clone（嵌套仓按需拉取），pin 与补丁在位`,
    }
  }

  // ── ③ pin 没漂：资产仍是 pin 记录的那一份。
  if (vendorPresent && existsSync(pinPath)) {
    const pinnedSha = readFileSync(pinPath, 'utf8').match(/^upstream-sha:\s*(\S+)/m)?.[1] ?? null
    if (pinnedSha === null) {
      violations.push(`${pinPath} 里读不到 upstream-sha——资产的 pin 没有事实源`)
    } else if (existsSync(join(vendorDir, '.git'))) {
      try {
        const head = execFileSync('git', ['-C', vendorDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
        if (head !== pinnedSha) {
          violations.push(
            `vendor/${PACKAGE_NAME} HEAD ${head.slice(0, 12)} ≠ pin 的 ${pinnedSha.slice(0, 12)}——`
            + '资产在无人察觉的情况下漂了；要么 bump pin，要么回到 pin 的那个提交（ADR-0008）',
          )
        }
      } catch (error) {
        violations.push(`读 vendor/${PACKAGE_NAME} 的 HEAD 失败：${String(error).slice(0, 160)}`)
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    ...(violations.length === 0
      ? { note: `${PACKAGE_NAME} 未安装（dependencies / bundles / node_modules 三处皆无），资产与 pin 在位` }
      : {}),
  }
}
