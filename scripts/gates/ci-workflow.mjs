/**
 * CI workflow 契约的静态校验（QG-007，证据层级 L1）。
 *
 * ## 这个模块**不能**证明什么
 *
 * 它审的是 workflow 文件本身：结构、命令、权限、超时、以及「哪些写法会让失败被吞掉」。
 * 它**不是**「CI 已建立」的证据——那需要一次真实 runner 上的 run（L2/L3）。卡面把这条
 * 写成了硬要求（Red：「不得引用本机 gate 结果宣称 CI 已建立」），所以本模块的返回值里
 * 固定带 `authority: 'L1-static'`，并且门禁读数里必须出现这句话。
 *
 * ## 为什么自己写一个极小的 YAML 子集解析器
 *
 * 仓库的依赖面是刻意收窄的（无 devDependencies），而且这个仓库有一条更硬的理由：
 * 用 `npm i yaml` 只为读一个文件，等于为了让判据跑起来而扩大供应链面。workflow 用到的
 * YAML 子集很窄（块映射、块序列、行内 `{}` / `[]`、标量），解法是写一个约 80 行、
 * 只认这个子集的读取器——它**读不懂就判红**，不会把「解析失败」当成「结构正确」。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** workflow 的唯一事实之家。 */
export const WORKFLOW_REL_PATH = '.github/workflows/gate.yml'

/**
 * 吞掉退出码的写法。单独提出来是因为它们是**正则字面量**：写在数组里会踩到
 * `|` 的转义（第一版就是在数组字面量里写坏了一个斜杠，文件直接语法错误）。
 */
/**
 * 管道吞退出码：`… | tee x` / `… | cat` / `… | head`。被测命令在管道**前面**时，
 * 步骤的退出码由末端命令决定，于是失败被判成成功。
 */
const MASKED_PIPE_PATTERN = /\|\s*(tee|cat|head|tail|grep|sort|uniq)\b/

const EXIT_SWALLOW_PATTERNS = Object.freeze([
  /\|\|\s*true\b/,
  /\|\|\s*exit\s+0\b/,
  /;\s*true\s*$/,
])

/** 本模块给出的证据层级；写进读数，防止被读成「CI 已验证」。 */
export const WORKFLOW_CHECK_AUTHORITY = 'L1-static'

class YamlSubsetError extends Error {}

/** `${{ … }}` 内部不能当结构看（里面可能出现 `:` 或 `,`）。 */
const EXPR_RE = /\$\{\{(?:[^}]|\}(?!\}))*\}\}/g

function maskExpressions(text) {
  const masked = []
  const out = text.replace(EXPR_RE, (match) => {
    masked.push(match)
    return `\u0000${masked.length - 1}\u0000`
  })
  return { out, masked }
}

function unmask(value, masked) {
  return value.replace(/\u0000(\d+)\u0000/g, (_, index) => masked[Number(index)])
}

/** 去掉一个值后面紧跟的注释（`#` 必须前面是空白或行首）。 */
function stripComment(line) {
  let quote = null
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quote !== null) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1]))) return line.slice(0, index)
  }
  return line
}

function scalarOf(raw) {
  const text = raw.trim()
  if (text === '' || text === '~' || text === 'null') return null
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^-?\d+$/.test(text)) return Number(text)
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1)
  }
  return text
}

/** 行内流式集合：`{a: b, c: d}` 或 `[a, b]`。只在顶层逗号切分。 */
function flowValue(text, masked) {
  const trimmed = text.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (inner === '') return []
    return splitTopLevel(inner).map((piece) => unmask(scalarOf(piece), masked))
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim()
    const out = {}
    if (inner === '') return out
    for (const piece of splitTopLevel(inner)) {
      const colon = piece.indexOf(':')
      if (colon < 0) throw new YamlSubsetError(`流式映射项缺少 ":"：${piece}`)
      out[piece.slice(0, colon).trim()] = unmask(scalarOf(piece.slice(colon + 1)), masked)
    }
    return out
  }
  // 标量也要过 `scalarOf`：否则 `timeout-minutes: 30` 是字符串 `"30"`、`true` 是字符串
  // `"true"`，而判据要按类型读它们（第一版就是这样把 `cancel-in-progress` 判成了缺失）。
  return scalarOf(unmask(trimmed, masked))
}

function splitTopLevel(text) {
  const pieces = []
  let depth = 0
  let quote = null
  let current = ''
  for (const char of text) {
    if (quote !== null) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") { quote = char; current += char; continue }
    if (char === '{' || char === '[') depth += 1
    if (char === '}' || char === ']') depth -= 1
    if (char === ',' && depth === 0) { pieces.push(current); current = ''; continue }
    current += char
  }
  if (current.trim() !== '') pieces.push(current)
  return pieces
}

/**
 * 解析 GitHub workflow 用到的 YAML 子集。
 *
 * 支持：块映射、块序列（`- `，含 `- key: value` 与缩进的续行）、行内 `{}` / `[]`、
 * 标量、`#` 注释、`${{ … }}` 表达式（原样保留为字符串）。
 * 不支持：锚点 / 别名 / 多行标量（`|` / `>`）/ 多文档。遇到就抛错——**读不懂要判红**，
 * 不能把「没看懂」当成「没问题」。
 *
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseWorkflowYaml(text) {
  const { out, masked } = maskExpressions(text)
  const records = []
  // 块标量状态：`run: |` 之后的正文是**字面量**，不是结构。把它一起收进 records 会让
  // 结构自检把 `if [ -f pnpm-lock.yaml ]; then` 当成「没有键的子块」而误判整份文件坏掉
  // （实测过一次）。正文由 `parseBlockScalar` 按同一个缩进规则直接取原始行。
  let scalarIndent = null
  for (const rawLine of out.split('\n')) {
    const line = stripComment(rawLine)
    const indent = line.trim() === '' ? line.length : line.length - line.trimStart().length
    // 块标量的正文**仍然要进 records**（解析阶段要按缩进取回它），但要打上标记：
    // 结构自检必须跳过它们——`if [ -f pnpm-lock.yaml ]; then` 不是映射键，
    // 拿它做结构判断会把合法文件判成坏的（两个方向都实测过）。
    let scalarBody = false
    if (scalarIndent !== null) {
      if (line.trim() !== '' && indent <= scalarIndent) scalarIndent = null
      else scalarBody = true
    }
    // 空行一律不进 records：它在块标量里是正文的一部分（由 parseBlockScalar 直接取原始行，
    // 不看 records），在别处没有语义。让空行进 records 会得到一个 text 为空的记录，
    // 解析阶段随即报「不是 key: value」——一条读起来莫名其妙的失败。
    if (line.trim() === '') continue
    if (/^\s*(---|\.\.\.)\s*$/.test(line)) continue
    if (line.trimStart().startsWith('%')) throw new YamlSubsetError(`不支持的指令行：${line.trim()}`)
    // 锚点 / 别名 / 标签：本子集不支持，必须**明确**报不支持，而不是让后续缩进检查
    // 抛一个「映射缩进异常」——那句读起来像文件坏了，而真正的事实是「解析器看不懂它」。
    if (/(^|\s)[&*][A-Za-z0-9_-]+(\s|$)/.test(line) || /(^|\s)![A-Za-z]/.test(line)) {
      throw new YamlSubsetError(`不支持的 YAML 构造（锚点/别名/标签）：${line.trim()}`)
    }
    if (/(^|:\s*|\s)[|>][-+]?\d*\s*$/.test(line.trim())) scalarIndent = indent
    records.push({
      indent,
      text: line.trim(),
      line: rawLine,
      raw: rawLine,
      // 序号项（`- key: value`）与普通映射键的续行规则不同：前者后面的更深行是
      // **同一个 item 的其它键**（`- uses: x` 之后的 `with:` 缩进比 `-` 深），
      // 后者更深的行必须是这个键的子块。混为一谈会把合法的 steps 判成坏结构。
      sequenceItem: line.trimStart().startsWith('- ') || line.trim() === '-',
      scalarBody,
    })
  }
  if (records.length === 0) throw new YamlSubsetError('workflow 是空的')

  // 结构自检：下一个记录缩进更深时，当前记录必须是 `key:` 形式（映射键，其值为块）。
  // 这条检查把「看起来像 YAML 但结构不合法」的文件挡在解析之前 —— 否则它会解析成一个
  // 缺 job 的文档，然后被报成「缺少 job `quick`」，读起来像配置写漏了而不是**文件坏了**。
  for (let index = 0; index + 1 < records.length; index += 1) {
    const current = records[index]
    const next = records[index + 1]
    if (current.scalarBody || next.scalarBody) continue
    if (next.indent <= current.indent) continue
    const body = current.text.startsWith('- ') ? current.text.slice(2).trim() : current.text
    const colon = topLevelColon(body)
    if (colon < 0) {
      throw new YamlSubsetError(
        `第 ${index + 1} 行的子块没有对应的键，结构不合法：${current.text}`,
      )
    }
    // 键后面**已经有标量值**时，不能再挂一个更深的块（YAML 里那是语法错误）。
    // 少了这条，「把值写在冒号后、内容缩进甩到下一行」这种坏结构会被解析成
    // 「值丢了一部分」，然后报成「缺少某步骤」——读起来像配置写漏了，而不是文件坏了。
    if (current.sequenceItem) continue
    const inline = body.slice(colon + 1).trim()
    if (inline !== '' && !/^[|>][-+]?\d*$/.test(inline)) {
      throw new YamlSubsetError(
        `第 ${index + 1} 行的键后已有值，却又缩进了子块：${current.text}`,
      )
    }
  }

  let cursor = 0
  const peek = () => (cursor < records.length ? records[cursor] : null)

  function parseBlock(indent) {
    const first = peek()
    if (first === null || first.indent < indent) return null
    if (first.text.startsWith('- ') || first.text === '-') return parseSequence(first.indent)
    return parseMapping(first.indent)
  }

  /**
   * 块标量 `|` / `>`：把后续**缩进更深**的行原样收成文本。
   *
   * `run: |` 里的 `if [ -f … ]; then` 这类行如果被当结构解析会报「映射缩进异常」——
   * 而脚本正文恰恰是判据要读的地方（`| tee gate-quick.json`、`pnpm install --frozen-lockfile`）。
   * 这里必须用**原始行**而不是 trim 后的文本，否则被审的命令会被改写。
   */
  function parseBlockScalar(minIndent) {
    const lines = []
    let blockIndent = null
    while (cursor < records.length) {
      const record = records[cursor]
      if (record.indent < minIndent) break
      if (blockIndent === null) blockIndent = record.indent
      else if (record.indent < blockIndent) break
      lines.push(record.raw.slice(blockIndent))
      cursor += 1
    }
    return lines.join('\n')
  }

  function parseSequence(indent) {
    const items = []
    while (true) {
      const record = peek()
      if (record === null || record.indent < indent) break
      if (record.indent > indent) throw new YamlSubsetError(`序列项缩进异常：${record.line}`)
      if (!record.text.startsWith('-')) break
      const rest = record.text === '-' ? '' : record.text.slice(2)
      cursor += 1
      if (rest === '') {
        items.push(parseBlock(indent + 1))
        continue
      }
      const colon = topLevelColon(rest)
      if (colon < 0) {
        items.push(unmask(scalarOf(rest), masked))
        continue
      }
      // `- key: value` 起一个映射项，后续同级的 `key: value` 续在它上面。
      const item = {}
      const key = rest.slice(0, colon).trim()
      const valueText = rest.slice(colon + 1).trim()
      if (valueText === '|' || valueText === '>' || /^[|>][-+]?\d*$/.test(valueText)) {
        // 序号项里键的起始列是 `indent + 2`（`- ` 占两格），正文再缩进两格。
        // 传 `indent + 1` 会让正文被判为「不更深」而整段丢失（实测：安装步骤的
        // run 变成空字符串，于是判据报「没有安装依赖的步骤」）。
        item[key] = parseBlockScalar(indent + 4)
      } else if (key === 'run' && valueText !== '') {
        // `run: <单行命令>` 是合法写法，语义与 `run: |` 相同（一行脚本）。
        // 第一版把它当普通标量存着，于是 `runLines()` 看不到任何命令 ——
        // 判据会以为这个 job 没跑门禁（实测：quick job 的 mode 变异因此全绿）。
        item[key] = unmask(valueText, masked)
      } else {
        item[key] = valueText === '' ? parseBlock(indent + 1) : flowValue(valueText, masked)
      }
      const nested = peek()
      if (nested !== null && nested.indent > indent && !nested.text.startsWith('- ')) {
        // 续行映射：`- uses: x` 后面跟着同深或更深的 `with:` / `name:`。
        const continuation = parseMapping(nested.indent)
        Object.assign(item, continuation)
      }
      items.push(item)
    }
    return items
  }

  function parseMapping(indent) {
    const out2 = {}
    while (true) {
      const record = peek()
      if (record === null || record.indent < indent) break
      if (record.indent > indent) throw new YamlSubsetError(`映射缩进异常：${record.line}`)
      if (record.text.startsWith('- ')) break
      const colon = topLevelColon(record.text)
      if (colon < 0) throw new YamlSubsetError(`不是 "key: value"：${record.line}`)
      const key = record.text.slice(0, colon).trim()
      const valueText = record.text.slice(colon + 1).trim()
      cursor += 1
      if (valueText === '|' || valueText === '>' || /^[|>][-+]?\d*$/.test(valueText)) {
        out2[key] = parseBlockScalar(indent + 1)
      } else {
        out2[key] = valueText === '' ? parseBlock(indent + 1) : flowValue(valueText, masked)
      }
    }
    return out2
  }

  const document = parseMapping(records[0].indent)
  if (cursor !== records.length) {
    throw new YamlSubsetError(`解析在第 ${records[cursor].line} 行停下（缩进或结构不被支持）`)
  }
  return document
}

function topLevelColon(text) {
  let depth = 0
  let quote = null
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== null) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') depth -= 1
    else if (char === ':' && depth === 0) {
      const next = text[index + 1]
      if (next === undefined || next === ' ' || next === '\t') return index
    }
  }
  return -1
}

/** 收集一个 job 里所有 step 的可执行文本（`run` / `uses`）。 */
function stepCommands(job) {
  const steps = Array.isArray(job?.steps) ? job.steps : []
  return steps.map((step) => ({
    name: typeof step?.name === 'string' ? step.name : '',
    uses: typeof step?.uses === 'string' ? step.uses : null,
    run: typeof step?.run === 'string' ? step.run : null,
    if: typeof step?.if === 'string' ? step.if : null,
    with: step?.with ?? null,
    // 原始字段：`continue-on-error` 这类**开关**写在字段位置而不是命令行里，
    // 只看 `run` 会把它们漏掉（实测第一版就漏了）。
    raw: step && typeof step === 'object' ? step : {},
  }))
}

/** `run:` 里出现的那条命令（多行脚本按行拆，取所有非注释行）。 */
function runLines(step) {
  if (step.run === null) return []
  return step.run.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'))
}

/**
 * 校验 workflow 是否满足门禁契约。
 *
 * @param {{workflowText: string|null, gateNames?: string[], allowedActionRefs?: string[]}} input
 *   `workflowText` 为 null 表示文件读不到（判红，不判跳过——「没有 workflow」与
 *   「workflow 合格」必须长得不一样）。
 * @returns {{passed: boolean, violations: string[], facts: Record<string, unknown>}}
 */
export function checkCiWorkflow({ workflowText, gateNames = [], allowedActionRefs = [] } = {}) {
  const violations = []
  const facts = { authority: WORKFLOW_CHECK_AUTHORITY }

  if (workflowText === null || workflowText === undefined || workflowText.trim() === '') {
    return {
      passed: false,
      violations: [`${WORKFLOW_REL_PATH}: 读不到 workflow —— CI 不是「以后再做」，它是本项的判据面本身`],
      facts,
    }
  }

  let workflow
  try {
    workflow = parseWorkflowYaml(workflowText)
  } catch (error) {
    return {
      passed: false,
      violations: [`${WORKFLOW_REL_PATH}: 解析失败（${error.message}）—— 读不懂的 workflow 不能当作合格`],
      facts,
    }
  }

  const jobs = workflow.jobs && typeof workflow.jobs === 'object' ? Object.entries(workflow.jobs) : []
  facts.jobs = jobs.map(([name]) => name)
  if (jobs.length === 0) {
    violations.push(`${WORKFLOW_REL_PATH}: 一个 job 都没有`)
    return { passed: false, violations, facts }
  }

  // 1. 权限最小化：门禁不写仓库、不读 secret。
  const permissions = workflow.permissions
  if (permissions === undefined) {
    violations.push('顶层缺少 `permissions:` —— 不写就是默认权限，而门禁只需要读')
  } else if (permissions !== 'read-all') {
    const scopes = typeof permissions === 'object' && permissions !== null ? permissions : {}
    for (const [scope, level] of Object.entries(scopes)) {
      if (level !== 'read') violations.push(`permissions.${scope}=${level}：门禁只允许只读权限`)
    }
    if (scopes.contents !== 'read') violations.push('permissions.contents 必须是 read')
  }

  // 2. 并发取消：同一分支的旧运行要能被取消，否则门禁排队会掩盖当前提交的真实状态。
  if (workflow.concurrency === undefined) {
    violations.push('缺少 `concurrency`：同一分支的旧运行不会被取消（门禁问的是「这个提交合不合格」）')
  } else if (workflow.concurrency?.group === undefined) {
    violations.push('concurrency 缺少 `group`')
  } else if (workflow.concurrency['cancel-in-progress'] !== true) {
    violations.push('concurrency 必须 `cancel-in-progress: true`')
  }

  // 3. `env` 里必须钉住 Node 与 pnpm 版本（浮动版本 = 平台行为被当常量，P-06）。
  const env = workflow.env && typeof workflow.env === 'object' ? workflow.env : {}
  for (const key of ['NODE_VERSION', 'PNPM_VERSION']) {
    if (typeof env[key] !== 'string' || env[key].trim() === '') {
      violations.push(`env 缺少 ${key}：版本必须被钉住，不能靠 runner 镜像的默认值`)
    }
  }
  facts.pinnedVersions = { node: env.NODE_VERSION ?? null, pnpm: env.PNPM_VERSION ?? null }

  // 4. 触发器：PR 与 main 都要跑。
  const on = workflow.on
  const triggers = typeof on === 'string' ? [on] : Object.keys(on ?? {})
  facts.triggers = triggers
  if (!triggers.includes('pull_request')) violations.push('缺少 `pull_request` 触发器：PR 上没有人跑门禁')
  if (!triggers.some((trigger) => trigger === 'push')) {
    violations.push('缺少 `push` 触发器：main 上没有 required run')
  }

  /** 一个 job 必须：跑门禁（指定模式）+ 见证 + 有超时 + 上传证据。 */
  const requireJob = (jobName, { modes, mustRunOnPush }) => {
    const entry = jobs.find(([name]) => name === jobName)
    if (entry === undefined) {
      violations.push(`缺少 job \`${jobName}\``)
      return null
    }
    const [, job] = entry
    if (typeof job['timeout-minutes'] !== 'number') {
      violations.push(`job \`${jobName}\` 缺少数值型 \`timeout-minutes\`: 卡死的 job 会占满 runner`)
    }
    if (typeof job['runs-on'] !== 'string' || job['runs-on'].trim() === '') {
      violations.push(`job \`${jobName}\` 缺少 \`runs-on\``)
    }
    // `mustRunOnPush` 的语义是「PR 上不跑」：判据是它**排除**了 pull_request。
    // 第一版写成了「提到 pull_request 就判红」，而正确写法 `github.event_name != 'pull_request'`
    // 恰恰要提到它——判据反了，会把对的配置判成错的。
    if (mustRunOnPush) {
      const condition = typeof job.if === 'string' ? job.if : ''
      if (!/!=\s*'pull_request'/.test(condition)) {
        violations.push(`job \`${jobName}\` 必须在 \`if\` 里排除 pull_request（例如 \`github.event_name != 'pull_request'\`），实际：${condition || '无 if'}`)
      }
    }

    const steps = stepCommands(job)
    // 步骤级字段也要审，不能只看 `run:` 正文。第一版只扫了命令行，于是
    // `continue-on-error: true` 写在**字段**位置时判据全绿——而它恰恰是卡面明令禁止的写法。
    for (const step of steps) {
      const label = step.name || step.uses || '(无名步骤)'
      for (const [key, value] of Object.entries(step.raw ?? {})) {
        if (/^continue-on-error$/u.test(key)) {
          violations.push(`job \`${jobName}\` 的步骤「${label}」带 continue-on-error=${String(value)} —— 失败必须阻断`)
        }
      }
    }
    // 门禁步骤：出现 `node scripts/gate.mjs --mode <mode>`
    const gateModes = []
    for (const step of steps) {
      for (const line of runLines(step)) {
        const match = /scripts\/gate\.mjs\s+--mode\s+([a-z]+)/.exec(line)
        if (match && !/--attest/.test(line)) gateModes.push(match[1])
        if (/\bcontinue-on-error\b/.test(line)) {
          violations.push(`job \`${jobName}\` 的步骤里出现 continue-on-error —— 失败必须阻断`)
        }
        for (const pattern of [EXIT_SWALLOW_PATTERNS[0], EXIT_SWALLOW_PATTERNS[1], EXIT_SWALLOW_PATTERNS[2]]) {
          if (pattern.test(line)) {
            violations.push(`job \`${jobName}\` 的命令吞掉退出码：${line}`)
          }
        }
        // **管道也会吞退出码**，而且它比 `|| true` 隐蔽得多：`cmd | tee out.json` 的退出码
        // 来自 `tee`（永远 0）。实测 2026-09-17：workflow 首跑在 GitHub 上显示**全绿**，
        // 而同一份日志里门禁 JSON 写着 `"status": "fail", "failed": 6` —— 六个真失败被
        // 一根管道挡住了。判据必须能拦住这个形状，否则本卡的成果本身就是一句假话。
        if (MASKED_PIPE_PATTERN.test(line) && !/set\s+-o\s+pipefail/.test(step.run ?? '')) {
          violations.push(
            `job \`${jobName}\` 的管道吞掉退出码（退出码来自管道末端而非被测命令）：${line}`
              + ' —— 在该步骤的 run 里先写 `set -o pipefail`，或改用 `> file` 重定向',
          )
        }
      }
    }
    if (gateModes.length === 0) {
      violations.push(`job \`${jobName}\` 没有跑 \`node scripts/gate.mjs --mode …\``)
    }
    for (const mode of gateModes) {
      if (!modes.includes(mode)) {
        violations.push(`job \`${jobName}\` 跑的 mode=${mode} 不在允许集合 ${modes.join('/')} 内`)
      }
    }
    if (!gateModes.includes(modes[0])) {
      violations.push(`job \`${jobName}\` 必须跑 mode=${modes[0]}（实际：${gateModes.join('、') || '无'}）`)
    }

    // 见证步骤必须在门禁之后（顺序即语义：先跑，再看有没有改动）。
    const gateIndex = steps.findIndex((step) => runLines(step).some((line) => /scripts\/gate\.mjs\s+--mode/.test(line) && !/--attest/.test(line)))
    const attestIndex = steps.findIndex((step) => runLines(step).some((line) => /scripts\/gate\.mjs\s+--attest/.test(line)))
    if (attestIndex < 0) {
      violations.push(`job \`${jobName}\` 没有 \`node scripts/gate.mjs --attest …\` 步骤（ADR-0103 的见证）`)
    } else if (gateIndex >= 0 && attestIndex < gateIndex) {
      violations.push(`job \`${jobName}\` 的见证步骤排在门禁之前`)
    }

    // 证据：失败也要留档（`if: always()`）。
    const uploads = steps.filter((step) => step.uses !== null && /upload-artifact@/.test(step.uses))
    if (uploads.length === 0) {
      violations.push(`job \`${jobName}\` 没有上传证据（对失败的提交，日志会随 runner 一起消失）`)
    } else if (!uploads.some((step) => typeof step.if === 'string' && /always\s*\(\s*\)/.test(step.if))) {
      violations.push(`job \`${jobName}\` 的上传步骤缺少 \`if: always()\`：失败时恰恰最需要日志`)
    }

    // 第三方 action 必须钉版本（浮动 tag 会在某天换掉行为）。
    for (const step of steps) {
      if (step.uses === null) continue
      if (!/^[^@]+@[^@]+$/.test(step.uses)) {
        violations.push(`job \`${jobName}\` 的 action 没有钉版本：${step.uses}`)
      }
      if (allowedActionRefs.length > 0 && !allowedActionRefs.some((allowed) => step.uses.startsWith(allowed))) {
        violations.push(`job \`${jobName}\` 使用了未登记的 action：${step.uses}`)
      }
    }

    // 依赖安装必须显式，并且不能被静默跳过。
    const installLines = steps.flatMap((step) => runLines(step)).filter((line) => /\b(pnpm|npm|yarn)\s+(install|ci)\b/.test(line))
    if (installLines.length === 0) {
      violations.push(`job \`${jobName}\` 没有安装依赖的步骤`)
    }
    facts[`${jobName}.gateModes`] = gateModes
    facts[`${jobName}.steps`] = steps.length
    return job
  }

  requireJob('quick', { modes: ['quick'], mustRunOnPush: false })
  requireJob('full', { modes: ['full'], mustRunOnPush: true })

  // 5. 不得访问真实 profile / 凭证 / 客户数据（红线：凭证只进 DSH 凭据服务）。
  //
  // 扫描前先去掉注释：说明文字里必然会出现 `~/.dsh`、`secrets.X` 这类**例子**，
  // 把它们当违规会让判据惩罚解释（第一版就这样误报过一次）。
  const executableText = workflowText
    .split('\n')
    .map((line) => stripComment(line))
    .join('\n')
  const secretsUsage = [...executableText.matchAll(/\bsecrets\.[A-Za-z0-9_]+/g)].map((match) => match[0])
  if (secretsUsage.length > 0) {
    violations.push(`workflow 引用了 secrets：${[...new Set(secretsUsage)].join('、')}（门禁不需要任何 secret）`)
  }
  for (const pattern of [/\/Users\/[a-zA-Z0-9._-]+/, /\/home\/[a-zA-Z0-9._-]+/, /\$HOME\/\.dsh/, /~\//]) {
    const hits = [...executableText.matchAll(new RegExp(pattern, 'g'))].map((match) => match[0])
    if (hits.length > 0) {
      violations.push(`workflow 里出现机器/用户路径：${[...new Set(hits)].join('、')}`)
    }
  }

  // 6. 闸门与注册表对得上：workflow 里若点名某个检查（`--only` 之类）必须真实存在。
  if (gateNames.length > 0) {
    for (const name of [...workflowText.matchAll(/--only[= ]([a-z0-9-]+)/g)].map((match) => match[1])) {
      if (!gateNames.includes(name)) violations.push(`workflow 点名了不存在的门禁项：${name}`)
    }
    facts.gateCount = gateNames.length
  }

  return { passed: violations.length === 0, violations, facts }
}

/** 读 workflow 文件；不存在返回 null（由调用方判红）。 */
export function readWorkflow(repoRoot) {
  const path = join(repoRoot, WORKFLOW_REL_PATH)
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

/** 列出 `.github/workflows/` 下的全部文件名（用于「只有一个 gate workflow」这类断言）。 */
export function listWorkflows(repoRoot) {
  const dir = join(repoRoot, '.github', 'workflows')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).sort()
}
