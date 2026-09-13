/**
 * 门禁 `patch-anchors` 的**扫描集判据**。
 *
 * 纯函数：输入是名字列表，不是磁盘状态，所以可以被反向自测（含恒真桩突变）。
 *
 * ── 为什么需要这一层 ────────────────────────────────────────────────────────
 *
 * 锚点清单**随时间单调增长**（36 → 38 → …，每加一条运行时守卫就多一条），
 * 而 `packaging/staging/` 是**随时间累积的历史堆积**。把「今天的尺子」套到「历史产物」上，
 * 得到的红（历史版本缺今天才有的锚）与它本要拦的东西（本次装配把补丁弄丢了）
 * 在输出上**完全不可区分**。于是「清掉历史目录」成了让门禁变绿的唯一手段，
 * 而清理又恰恰是门禁看不见的动作——仪器从此可以被打扫卫生修好。
 *
 * 这条教训本仓库已经写过一次。`packaging/verify-patches-v2.sh` 头部记着：
 *
 *   > 把历史版本号（曾为 2.0.0）硬编码在默认值里，会随目录裁剪变成结构性红灯：
 *   > 表现为 35 条 MISSING，与「补丁真的漂移」在输出上不可区分。
 *
 * 当时修的是**脚本默认值**；同一根因随后从**门禁扫描集**长回来（见总账 P-11）。
 * 这正是一条根因复发两次的形状：修掉一个出口，不修「射程由环境决定」这件事本身。
 *
 * ── 判据：本项只量「待发布」的树 ────────────────────────────────────────────
 *
 * 判「已发布」的权威家是 **git tag**（ADR-0058：清单入库 → 打 tag，tag 才担保得住字节）。
 * 打过 tag 的版本，其字节由 `packaging/release/<版本>/` 的产物与仓库外归档负责
 * （ADR-0067 的 `uchg` 锁定 + 找回命令），**不由本项度量**。
 *
 * 这不是「历史版本不重要」，而是「历史版本不能用这把尺子量」。还有一条实测理由：
 * `staging/2.3.1/app` 在 2.3.1 发布之后被就地改过（守卫文件 mtime 晚于该版发布时刻），
 * 所以那棵树的**绿不证明任何出厂字节**。已发布版本的证据必须是产物本身
 * （DMG + 入库清单的哈希），不是一棵谁都能顺手改一下的暂存树。
 *
 * ── 为什么取 tag 而不是「有无入库清单」 ─────────────────────────────────────
 *
 * 后者会在**同号重制**时把新树静默排除：旧清单还在（上一轮留下的），新树还没发布，
 * 于是门禁对着一棵从未被量过的树说 ok——这是本项最危险的失效方向。
 * 取 tag 则偏向**纳入**：没有 tag 就照量。判据的默认错误方向要选「多量」而不是「放行」。
 *
 * @typedef {object} AnchorScope
 * @property {string[]} scanStaging      要校验的 staging 版本号（未打 tag，升序）
 * @property {string[]} retired          已打 tag、退出扫描的版本号（升序）
 * @property {boolean}  checkInstalledApp 本机 `/Applications` 是否在本项射程内
 * @property {boolean}  vacuous           射程为空：本项**没量任何东西**（与「通过」不是同一件事）
 * @property {string}   note             读数：量了谁、谁退出了
 */

/**
 * 选出本项真正的扫描对象。
 *
 * @param {object} input
 * @param {string[]} [input.stagingVersions] `packaging/staging/` 下**有 app 树**的版本目录名
 * @param {string[]} [input.taggedVersions]  已打 tag 的版本号（不含 `v` 前缀）；读不到 tag 时传空数组
 * @param {boolean}  [input.appInstalled]    本机 `/Applications/DSH Desktop.app` 是否可读
 * @returns {AnchorScope}
 */
export function selectAnchorTargets({ stagingVersions = [], taggedVersions = [], appInstalled = false }) {
  const tagged = new Set(taggedVersions)
  const sorted = [...stagingVersions].sort()
  const scanStaging = sorted.filter((version) => !tagged.has(version))
  const retired = sorted.filter((version) => tagged.has(version))
  const vacuous = scanStaging.length === 0 && !appInstalled
  const scanned = [
    ...(appInstalled ? ['本机 /Applications'] : []),
    ...(scanStaging.length > 0 ? [`待发布 staging：${scanStaging.join(' ')}`] : []),
  ]
  const note = [
    scanned.length > 0 ? `扫描 ${scanned.join('；')}` : '无可扫描对象',
    retired.length > 0 ? `已发布（有 tag，由 ADR-0067 归档负责）不参与：${retired.join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('；')
  return { scanStaging, retired, checkInstalledApp: appInstalled, vacuous, note }
}
