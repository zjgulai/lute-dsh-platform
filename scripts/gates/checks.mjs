/**
 * 门禁校验实现。每个 check 接收「仓库根 + 待校验条目」并返回 { passed, violations }，
 * 不自行读取全局状态、不抛异常——调用方（scripts/gate.mjs）负责收集与报告。
 *
 * 契约：violations 为人类可读的中文字符串数组，顺序与输入条目顺序一致；
 * 空数组表示通过。调用方依赖 `passed === (violations.length === 0)`。
 */

/** luteOrigin 的封闭取值集合（ADR-0012）。 */
const LUTE_ORIGINS = ['self', 'internalized', 'npm-pinned']

/**
 * 校验包身份三元组。
 * @param {string} repoRoot 仓库根绝对路径（预留给需要读取磁盘的扩展校验）
 * @param {Array<{dir: string, manifest: Record<string, unknown>}>} entries 待校验的包
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkPackageIdentity(repoRoot, entries) {
  const violations = []
  for (const { dir, manifest } of entries) {
    const { luteOrigin, luteOwner, lutePublish } = manifest
    if (luteOrigin === undefined) violations.push(`${dir}: 缺少 luteOrigin`)
    else if (!LUTE_ORIGINS.includes(luteOrigin)) {
      violations.push(`${dir}: luteOrigin 取值非法（${luteOrigin}），仅允许 ${LUTE_ORIGINS.join(' / ')}`)
    }
    if (luteOwner === undefined) violations.push(`${dir}: 缺少 luteOwner`)
    if (lutePublish === undefined) violations.push(`${dir}: 缺少 lutePublish`)
    else if (typeof lutePublish !== 'boolean') violations.push(`${dir}: lutePublish 必须是布尔值`)
  }
  return { passed: violations.length === 0, violations }
}

/** 白名单条目中不参与存在性校验的通用模式。 */
const WHITELIST_PATTERNS_TO_SKIP = new Set(['*/', '*', '.gitignore'])

/**
 * 校验 .gitignore 白名单条目都指向磁盘上真实存在的路径（ADR-0013）。
 * @param {{gitignoreText: string, exists: (path: string) => boolean}} input 文件内容与路径存在性判定
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkGitignoreWhitelist({ gitignoreText, exists }) {
  const violations = []
  for (const line of gitignoreText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('!')) continue

    const raw = trimmed.slice(1)
    if (WHITELIST_PATTERNS_TO_SKIP.has(raw)) continue

    const target = raw.replace(/^\//, '').replace(/\/\*\*$/, '').replace(/\/$/, '')
    if (target === '' || target.includes('*')) continue
    if (!exists(target)) {
      violations.push(`${target}: .gitignore 白名单条目指向不存在的路径（ADR-0013 禁止幽灵条目）`)
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验 vendor/dsh-desktop.pin 的 harness-submodule 字段与子模块实际 HEAD 一致（ADR-0008）。
 * @param {{pinText: string, submoduleSha: string}} input pin 文件内容与子模块实际 HEAD
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkPinConsistency({ pinText, submoduleSha }) {
  const violations = []
  const match = /^harness-submodule:\s*(.+)$/m.exec(pinText)
  const recorded = match ? match[1].trim() : undefined

  if (recorded === undefined) {
    violations.push('vendor/dsh-desktop.pin 缺少 harness-submodule 字段')
  } else if (recorded.startsWith('NOT-INITIALIZED')) {
    violations.push('vendor/dsh-desktop.pin 的 harness-submodule 仍为 NOT-INITIALIZED（ADR-0008 要求初始化）')
  } else if (recorded !== submoduleSha) {
    violations.push(
      `vendor/dsh-desktop.pin 记录的 harness-submodule（${recorded}）与 vendor/dsh-desktop/deepseek-harness 实际 HEAD（${submoduleSha}）不一致`,
    )
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验 ADR 索引与文件一致、编号连续（ADR-0015）。
 * @param {{adrFiles: string[], indexText: string}} input ADR 文件路径列表与索引表内容
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkAdrIndex({ adrFiles, indexText }) {
  const violations = []
  const fileNumbers = adrFiles
    .map((path) => /ADR-(\d{4})\.md$/.exec(path)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b)

  const indexedNumbers = []
  for (const line of indexText.split('\n')) {
    if (!line.startsWith('|')) continue
    const match = /^\|\s*ADR-(\d{4})\s*\|/.exec(line)
    if (!match) continue
    const number = Number(match[1])
    indexedNumbers.push(number)
    const expected = `docs/adr/ADR-${match[1]}.md`
    if (!adrFiles.includes(expected)) violations.push(`${expected}：索引已登记但文件不存在`)
  }

  const sorted = [...indexedNumbers].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      violations.push(
        `ADR 编号不连续：缺 ADR-${String(sorted[i - 1] + 1).padStart(4, '0')}（索引含 ${sorted[0]}, ${sorted[sorted.length - 1]}）`,
      )
      break
    }
  }
  if (fileNumbers.length !== indexedNumbers.length) {
    violations.push(`ADR 文件数（${fileNumbers.length}）与索引条目数（${indexedNumbers.length}）不一致`)
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验 ADR 头部的「决策记录」链接可达，且**该 ADR 自己指向的那篇 Note** 正文回引其编号（ADR-0015）。
 *
 * 逐篇解析、逐篇回引：一篇 Note 只需回引指向它的那些 ADR（通常恰好一篇）。
 * 早期实现把 Note 路径写死成单值，于是「中心 Note 必须提到每一个带链接的 ADR」
 * 成了隐含要求——每新增一篇独立主题的 ADR，就得往无关的 Note 里补一行例外说明，
 * 而那行说明既不承载决策也无人维护。见
 * docs/notes/implemented/contract/2026-09-11-adr-note-links-per-note.md。
 *
 * @param {{adrDocs: Array<{path: string, text: string}>, readNote: (path: string) => string, exists: (path: string) => boolean}} input
 *   `readNote` 读取仓库根相对路径的 Note 正文；读不到时返回空串（自然判为未回引）。
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkAdrNoteLinks({ adrDocs, readNote, exists }) {
  const violations = []
  for (const { path, text } of adrDocs) {
    const number = /ADR-(\d{4})/.exec(path)?.[1]
    const match = /决策记录：\[Note\]\(([^)]+)\)/.exec(text)
    if (!match) continue

    const target = resolveDocLink(path, match[1])
    if (!exists(target)) {
      violations.push(`${path}：决策记录链接指向不存在的 Note（${target}）`)
      continue
    }
    if (number === undefined) continue

    if (!readNote(target).includes(`ADR-${number}`)) {
      violations.push(`${target}：正文未引用 ADR-${number}（由 ${path} 指向）`)
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 把文档内的相对链接归一化为仓库根相对路径（链接以所在文档目录为基准）。
 * @param {string} fromPath 链接所在文档的仓库根相对路径
 * @param {string} link 链接字面量
 * @returns {string} 归一化后的仓库根相对路径
 */
function resolveDocLink(fromPath, link) {
  const segments = fromPath.split('/').slice(0, -1)
  for (const part of link.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }
  return segments.join('/')
}

/**
 * 校验豁免登记只减不增、期限不延后、到期即失败（ADR-0014）。
 * @param {{exemptions: Array<Record<string, unknown>>, baseline: Array<Record<string, unknown>>, today: string}} input
 *   当前豁免条目、基线条目（上次提交状态）与今日日期（YYYY-MM-DD）
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkExemptions({ exemptions, baseline, today, baselineExists = true }) {
  const violations = []
  const baselineByName = new Map(baseline.map((entry) => [entry.package, entry]))

  for (const entry of exemptions) {
    const name = entry.package
    const previous = baselineByName.get(name)

    if (!previous) {
      if (!baselineExists) continue
      violations.push(`${name}: 新增豁免条目被拒绝（ADR-0014 只减不增，请在基线中登记或先补齐）`)
      continue
    }
    if (entry.deadline === undefined) {
      violations.push(`${name}: 豁免条目缺少 deadline 字段（ADR-0014）`)
    } else if (previous.deadline !== undefined && entry.deadline > previous.deadline) {
      violations.push(`${name}: 豁免期限不得延后（基线 ${previous.deadline} → 当前 ${entry.deadline}，ADR-0014）`)
    } else if (entry.deadline < today) {
      violations.push(`${name}: 豁免已过期（deadline ${entry.deadline}，今天 ${today}）——到期即为最高优先级，不得继续豁免`)
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验没有「已跟踪文件同时命中忽略规则」的漂移（ADR-0013）。
 * 该状态会让仓库对同一文件给出两种相反回答：git 跟踪它，忽略规则又声称它不该存在。
 * @param {{trackedIgnored: string[]}} input `git ls-files --cached --ignored --exclude-standard` 的输出
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkTrackedIgnored({ trackedIgnored }) {
  return {
    passed: trackedIgnored.length === 0,
    violations: trackedIgnored.map(
      (file) => `${file}: 已跟踪文件同时命中忽略规则（tracked+ignored 漂移，ADR-0013）`,
    ),
  }
}

/**
 * 校验受管目录中不存在「未在 .gitmodules 声明」的嵌套仓库（ADR-0016）。
 * 嵌套仓库不属于父仓库任何提交：父仓库既跟踪不了它的文件，也读不到它的历史，
 * 内容会在无人察觉的情况下失管。
 * @param {{nestedRepos: string[], declaredSubmodules: string[]}} input 受管目录下的 .git 持有者与 .gitmodules 声明的子模块路径
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkNestedRepositories({ nestedRepos, declaredSubmodules }) {
  const declared = new Set(declaredSubmodules)
  return {
    passed: nestedRepos.every((repo) => declared.has(repo)),
    violations: nestedRepos
      .filter((repo) => !declared.has(repo))
      .map((repo) => `${repo}: 未在 .gitmodules 声明的嵌套仓库——它不属于父仓库任何提交，内容会静默失管（ADR-0016）`),
  }
}

/**
 * 校验生成式目录墙与再生成结果一致（ADR-0011）。
 * 生成物是只读产物：手改会让文档与代码脱节，且门禁必须能发现。
 * @param {{current: string, regenerated: string}} input 磁盘上的产物与按当前代码重新生成的内容
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkCatalogFresh({ current, regenerated }) {
  return current === regenerated
    ? { passed: true, violations: [] }
    : {
        passed: false,
        violations: [
          'docs/catalog/packages.md: 与再生成结果不一致（生成物请勿手改，运行 node scripts/gen-catalog.mjs 更新，ADR-0011）',
        ],
      }
}

/**
 * 校验本次改动的包已具备 typecheck 与 test 脚本（ADR-0014 的「变更包立即纳入硬门槛」）。
 * 豁免登记中的包不参与校验；未改动的存量包由 exemptions-frozen 负责按期限收敛。
 * @param {{changed: string[], packages: Array<{relPath: string, manifest: Record<string, unknown>}>, exempted: string[]}} input
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkChangedPackages({ changed, packages, exempted }) {
  const exempt = new Set(exempted)
  const byPath = new Map(packages.map((entry) => [entry.relPath, entry]))
  const violations = []

  for (const relPath of changed) {
    if (exempt.has(relPath)) continue
    const entry = byPath.get(relPath)
    if (!entry) continue
    const scripts = entry.manifest.scripts ?? {}
    if (!scripts.typecheck) {
      violations.push(`${relPath}: 改动了本包但缺少 typecheck 脚本（ADR-0014：变更包立即纳入硬门槛）`)
    }
    if (!scripts.test) {
      violations.push(`${relPath}: 改动了本包但缺少 test 脚本（ADR-0014：变更包立即纳入硬门槛）`)
    }
  }
  return { passed: violations.length === 0, violations }
}

/** 命令未找到的退出码（脚本存在但执行体缺失时 shell 返回）。 */
const EXIT_COMMAND_NOT_FOUND = 127

/** 报失败证据时，每个流最多取几行非空输出。 */
const EVIDENCE_LINES_PER_STREAM = 3

/**
 * 把失败输出整理成一行可读证据，stdout 与 stderr **各自标注、各自限额**。
 *
 * 为什么不合成一个 blob 再截尾（ADR-0043）：两者体量常常差一个数量级，合成后
 * 取尾等于让大的那个流垄断证据位。实测 dsh-skill-center-local 跑 vitest，stdout
 * 784 字节（含 `Test Files / Tests` 汇总）对 stderr 5821 字节（React `act()` 警告）
 * ——截尾后汇总 100% 消失，报告只剩警告。分流标注后，警告仍在，但不再顶掉汇总。
 * @param {{stdout?: string, stderr?: string, note?: string}} result 单次脚本执行结果
 * @returns {string} 形如 `stdout: … ⏎ stderr: … ⏎ <note>`；全空时为空串
 */
function formatScriptEvidence(result) {
  const parts = []
  for (const [label, text] of [
    ['stdout', result.stdout],
    ['stderr', result.stderr],
  ]) {
    const lines = String(text ?? '')
      .split('\n')
      .filter(Boolean)
      .slice(-EVIDENCE_LINES_PER_STREAM)
    if (lines.length > 0) parts.push(`${label}: ${lines.join(' ⏎ ')}`)
  }
  if (result.note) parts.push(result.note)
  return parts.join(' ⏎ ')
}

/**
 * 校验包声明的脚本能真实执行（ADR-0014）。
 * 动机（实测）：dsh-theme-local 与 dsh-loopx-plugin 的 typecheck 脚本存在，
 * 但缺 typescript 依赖，执行即 127；脚本"存在"不等于"可用"，只看脚本键会漏掉这类空转。
 *
 * `build` 也在校验范围内：ADR-0018 让 `types-fresh` 依赖构建产出来判断新鲜度，
 * 若某个包 build 跑不通，它的产物新鲜度就无从判定。把「build 能不能跑通」放在
 * 本校验而不是 `types-fresh`，同一个问题才不会在门禁里报两遍。
 * @param {{packages: Array<{relPath: string, scripts: Record<string, string>, results: Record<string, {code: number|null, stdout?: string, stderr?: string, note?: string}>}>}} input
 *   逐包的脚本定义与实际执行结果（由调用方负责运行）
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkScriptsRunnable({ packages }) {
  const violations = []
  for (const { relPath, scripts, results } of packages) {
    for (const key of ['typecheck', 'test', 'build']) {
      if (!scripts[key]) continue
      const result = results[key]
      if (!result) continue
      if (result.code === EXIT_COMMAND_NOT_FOUND) {
        violations.push(`${relPath}: ${key} 脚本无法执行（退出码 127）——脚本存在但执行体不存在，属空转脚本（ADR-0014）`)
      } else if (result.code !== 0) {
        const tail = formatScriptEvidence(result)
        const verdict = result.code === null ? '脚本未给出退出码' : `脚本运行失败（退出码 ${result.code}）`
        violations.push(`${relPath}: ${key} ${verdict}${tail ? ` — ${tail}` : ''}`)
      }
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 剔除 shell 行里的注释部分（`#` 在未加引号且**位于词首**时才开始注释）。
 * 为什么需要：`sign-and-dmg.sh:204` 形如 `STAGING=""   # 已属于 $REL，不再…`，
 * 变量在注释里、不参与展开，若整行匹配就会误报——硬门槛不接受假红。
 * @param {string} line 原始行
 * @returns {string} 去掉注释后的代码部分
 */
function stripShellComment(line) {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '\\' && !inSingle) {
      i += 1
      continue
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (ch === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i)
    }
  }
  return line
}

/**
 * 校验 shell 脚本里没有「$VAR 紧跟非 ASCII 字符」的写法（ADR-0064）。
 *
 * 动机（2026-09-13 实测，代价是一整轮装配）：`build-setup-app.sh` 末行
 * `say "编译完成: $APP（身份：…）"` 让 2.3.0 首次装配在 §5 中断，退出码 1：
 *   build-setup-app.sh: line 43: APP<坏字节>: unbound variable
 * 成因不是拼错变量名，而是 bash 的词法——`（` 的字节 EF BC 88 被当作标识符字符
 * 并入变量名，引用的成了从未定义过的「APP（」。脚本开头 `set -euo pipefail`，
 * 于是硬中断。**加花括号即解**：`${APP}（` 把变量名边界钉死。
 *
 * 为什么必须是机器判据：`ensure-signing-identity.sh:27` 早就把这条陷阱写在注释里，
 * 「知道」却没能拦住 4 处新犯（其中 `pkg-postinstall.sh:46` 恰在**错误报告路径**上，
 * 自身一炸反而掩盖真实错误）。这正是 ADR-0057 那句「靠人记得不是工程解，机读判据才是」。
 *
 * 判定范围：`$` + 标识符首字符 [A-Za-z_] + 后续 [A-Za-z0-9_]*，其后紧跟码点 ≥ 0x80。
 * 位置参数不受影响（`$1（` 中 bash 只按数字取参，`（` 不会被并入），故本正则不覆盖 `$1`。
 *
 * @param {{files: Array<{relPath: string, text: string}>}} input 待校验的 shell 脚本
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkShellVarAdjacentMultibyte({ files }) {
  const violations = []
  for (const { relPath, text } of files) {
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const code = stripShellComment(lines[i])
      const match = code.match(/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7f]/)
      if (match) {
        violations.push(`${relPath}:${i + 1}: ${match[0]} —— 变量名被后续多字节字符吞掉，请写成 \${VAR} 形式`)
      }
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验包内依赖符号链接未断链（ADR-0016 的目录可迁移性）。
 * 动机（实测）：dsh-browser-local 的 @deepseek-ai/* 曾是指向应用包目录的相对符号链接，
 * 包目录从 1 层移到 3 层后相对路径失效，11 个测试套件全部无法收集——而门禁此前看不到。
 * @param {{links: Array<{from: string, target: string, exists: boolean}>}} input 待校验的符号链接
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkDependencyLinks({ links }) {
  return {
    passed: links.every((link) => link.exists),
    violations: links
      .filter((link) => !link.exists)
      .map(
        (link) =>
          `${link.from}: 依赖符号链接断链（指向 ${link.target}）——包目录层级变化会让相对链接失效（ADR-0016）`,
      ),
  }
}

/**
 * 校验出货 README 里让用户授权的那三项，与 `macos-harness doctor` 实际检查的三项一致。
 *
 * 为什么这值得一条门禁：这三项是终端用户**唯一**的授权指引，而写错其中一项不会产生任何
 * 报错——用户照着授了「自动化」，`mac.key` / `mac.click` 却因缺「输入监控」静默失败。
 * 这正是 ADR-0063 要消除的那类失败（能力静默死亡），且它已经真实发生过一次：
 * README 原写「屏幕录制/辅助功能/自动化」，而 2026-09-13 实测三项对应的是
 * `kTCCServiceAccessibility` / `kTCCServiceScreenCapture` / `kTCCServiceListenEvent`，
 * 系统 TCC 库里**根本没有 `PostEvent` 行**（`post_events` 由「输入监控」承载）。
 *
 * 判据只要求三项齐备——不禁止正文解释「不要授权自动化」，因为那正是需要写清楚的地方。
 * @param {{assembleScript: string}} input packaging/assemble.sh 的全文
 * @returns {{passed: boolean, violations: string[]}}
 */
const TCC_REQUIRED_PANES = ['辅助功能', '屏幕录制', '输入监控']
const TCC_README_MARKER = '首次安装需授权'

export function checkDmgReadmeTccPanes({ assembleScript }) {
  const violations = []
  const lines = assembleScript.split('\n')
  const idx = lines.findIndex((line) => line.includes(TCC_README_MARKER))
  if (idx === -1) {
    violations.push(
      `packaging/assemble.sh: 出货 README 缺少「${TCC_README_MARKER}」段落——用户将拿不到授权指引`,
    )
    return { passed: false, violations }
  }
  const block = lines.slice(idx, idx + 10).join('\n')
  for (const pane of TCC_REQUIRED_PANES) {
    if (!block.includes(pane)) {
      violations.push(
        `packaging/assemble.sh: 出货 README 的授权段缺少「${pane}」——需授权的三项是 ${TCC_REQUIRED_PANES.join(' / ')}（ADR-0063）`,
      )
    }
  }
  return { passed: violations.length === 0, violations }
}
