/**
 * 依赖可复现校验（ADR-0055）。
 *
 * 契约与 scripts/gates/checks.mjs 一致：纯函数，接收「已读好的文本」，
 * 返回 { passed, violations }，violations 为人类可读中文字符串数组。
 *
 * 为什么不用 `pnpm install --frozen-lockfile` 当判据：
 *   1. 它会联网（本仓有 `file:` 与注册表混合依赖，离线跑不出结论）；
 *   2. 实测它在同一棵树上给出过不一致的结论（见 .scratch/dependency-reproducibility/README.md
 *      「未解」一节：preset-lint-local 首轮 FAIL、次轮与连跑三次 OK）。
 * 门禁要的是「同一输入永远同一结论」，所以这里只解析已提交的文本，不 shell 出 pnpm、不联网。
 *
 * 与 pnpm 实际行为的对齐点（两处都实测过，见 ADR-0055）：
 *   - pnpm 把「清单声明了但锁文件没有」的依赖算作违规（ERR_PNPM_OUTDATED_LOCKFILE 的
 *     "dependencies were added"），所以本校验只做「清单 → 锁文件」的正向包含，
 *     不做反向多余检查——`autoInstallPeers` 会把 peer 自动填进锁文件，反向查会误报。
 *   - peerDependencies 只在「该名字没有在 dependencies / devDependencies / optionalDependencies
 *     里出现过」时才要求锁文件记录它；同一个名字已经本地声明过就算满足，
 *     pnpm 对 dsh-browser-local 的 7 条 `*` peer 正是这么放行的。
 */

/** 参与「清单 → 锁文件」比对的字段。顺序决定报错顺序。 */
const IMPORT_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies']

/**
 * 同一个名字在多个字段里出现时，pnpm 实际生效的那一侧（实测，见 ADR-0055）：
 *   dsh-browser-local 的 @deepseek-ai/schemastery 写在 dependencies(^3.18.1) 与
 *   devDependencies(3.18.2) 两处，锁文件只记了 ^3.18.1 —— dependencies 赢。
 *   dsh-deepresearch-local 的 dsh-storage-sqlite / dsh-web-fetch-http 同形，同理。
 * 但「赢」不等于「另一处无害」：那份被忽略的声明会让下一个读的人以为它生效。
 * 所以重复声明本身单列一条违规（见下），这串顺序只保证比对有确定行为。
 */
const FIELD_PRECEDENCE = ['dependencies', 'optionalDependencies', 'devDependencies']

/** 清单里出现即视为机器绝对路径的 specifier 形状。 */
const MACHINE_ABSOLUTE_SPEC = /^\/|^~[\\/]|^[A-Za-z]:[\\/]/u

/**
 * 锁文件文本里出现即视为不可移植的形状。
 *
 * 实测形状来自 HEAD(c1f9572) 的 dsh-browser-local/pnpm-lock.yaml——清单写的是
 * `/Applications/DSH Desktop.app/…`，pnpm 把它记成
 *   specifier: /Applications/DSH Desktop.app/…
 *   version: link:../../../../../Applications/DSH Desktop.app/…
 * 也就是说**锁文件里存的是相对形式**，而相对前缀取决于安装深度（换个深度重装即变一层）。
 * 所以这里判的是「目标绝对」或「目标用 ../ 逃出包目录」，而不是只判前导斜杠。
 * 包内自带的 `file:./vendor/x` 不在此列——它与包一起搬，不随安装深度变。
 */
const MACHINE_ABSOLUTE_TEXT = /^\s+version:\s*(?:file|link):\s*(?:\/|~[\\/]|[A-Za-z]:[\\/]|\.\.\/)/mu

/**
 * 去掉 YAML 标量两侧的引号。
 * @param {string} value 原始标量
 * @returns {string} 去引号后的值
 */
function unquote(value) {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) return value.slice(1, -1)
  }
  return value
}

/**
 * 从 pnpm-lock.yaml 文本里抽出根 importer（`.`）记下的 name → specifier。
 *
 * 只认 v9 锁文件的 importers 块结构：
 *   importers:
 *   <2 空格>  .:
 *   <4 空格>    dependencies:
 *   <6 空格>      '@scope/name':
 *   <8 空格>        specifier: ^1.2.3
 * 缩进变了就返回 null，由调用方报「解析不了」而不是静默放过。
 *
 * @param {string} lockfileText pnpm-lock.yaml 全文
 * @returns {Map<string, {field: string, specifier: string}>|null} 解析结果；结构不符时为 null
 */
export function parseImporterSpecifiers(lockfileText) {
  const lines = lockfileText.split('\n')
  const start = lines.indexOf('importers:')
  if (start === -1) return null
  const entries = new Map()
  let importer = null
  let field = null
  let name = null
  let sawImporter = false
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const content = line.trim()
    if (content === '' || content.startsWith('#')) continue
    if (!line.startsWith(' ')) break // 顶格键 = importers 块结束
    const indent = line.length - line.trimStart().length
    if (indent === 2) {
      importer = unquote(content.replace(/:\s*$/u, ''))
      sawImporter = true
      field = null
      name = null
      continue
    }
    if (indent === 4) {
      field = content.replace(/:\s*$/u, '')
      name = null
      continue
    }
    if (indent === 6) {
      name = unquote(content.replace(/:\s*$/u, ''))
      continue
    }
    if (indent === 8 && importer === '.' && name !== null && content.startsWith('specifier:')) {
      entries.set(name, { field: field ?? '', specifier: unquote(content.slice('specifier:'.length).trim()) })
    }
  }
  if (!sawImporter) return null
  return entries
}

/**
 * 取包产物根目录名：优先 main，其次 exports 里第一个字符串路径，缺省 lib。
 * 九个带 build 的受管包 main 全是 `lib/index.js`，这里不写死 lib 是为了
 * 有新包 output 到 dist/ 时口径自动跟上。
 * @param {Record<string, unknown>} manifest 包清单
 * @returns {string} 产物根目录名，如 `lib`
 */
export function buildOutputRoot(manifest) {
  const candidates = []
  if (typeof manifest.main === 'string') candidates.push(manifest.main)
  const collect = (node) => {
    if (typeof node === 'string') candidates.push(node)
    else if (node && typeof node === 'object') for (const value of Object.values(node)) collect(value)
  }
  collect(manifest.exports)
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/^\.\//u, '')
    const segment = cleaned.split('/')[0]
    if (segment && segment !== '.' && !segment.includes('*')) return segment
  }
  return 'lib'
}

/**
 * full 模式下逐包跑脚本的顺序判据（ADR-0055）。
 *
 * 判据不是「有没有 lib/ 目录」——干净检出里它本来就不存在，问的是错的问题。
 * 判据是「产物有没有入库」：
 *   - 产物未入库：干净检出里 test 看到的是「文件不存在」，必须先 build 造出来 → typecheck → build → test
 *   - 产物已入库：已提交的那份就是被测对象，先 build 会用新字节盖掉它，
 *     从而掩盖「src 改了、lib 没重编」的真实漂移 → typecheck → test → build
 * 实测（干净检出、lib/ 缺席）：role-matrix 10 失败 / algo-skills 8 / newapp 6 / root-brand 4，
 * 而 skill-center 与 agent-team-gui 全绿——所以「未入库就 build 先行」对后两者只是一次白跑的 build。
 *
 * @param {{hasBuild: boolean, buildOutputTracked: boolean}} input 该包是否有 build、产物是否入库
 * @returns {string[]} 脚本键顺序
 */
export function packageScriptOrder({ hasBuild, buildOutputTracked }) {
  if (hasBuild && !buildOutputTracked) return ['typecheck', 'build', 'test']
  return ['typecheck', 'test', 'build']
}

/**
 * 校验「清单 ↔ 锁文件」一致、无机器绝对路径。
 * @param {{packages: Array<{relPath: string, manifest: Record<string, unknown>, lockfileText: string|null}>}} input 受管包
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkDependencyReproducibility({ packages }) {
  const violations = []
  for (const { relPath, manifest, lockfileText } of packages) {
    /** 逐字段的原始声明，用于机器路径与重复声明两条检查。 */
    const raw = []
    for (const field of IMPORT_FIELDS) {
      const block = manifest[field]
      if (!block || typeof block !== 'object') continue
      for (const [name, spec] of Object.entries(block)) raw.push({ name, spec: String(spec), field })
    }
    const peers = Object.entries(manifest.peerDependencies ?? {}).map(([name, spec]) => ({ name, spec: String(spec) }))

    // 机器绝对路径先报——它跟锁文件在不在场无关，且是最容易被忽略的一条。
    for (const { name, spec, field } of raw) {
      if (MACHINE_ABSOLUTE_SPEC.test(spec)) {
        violations.push(
          `${relPath}: ${field} 的 ${name} 指向机器绝对路径（${spec}）——换台机器或换个安装深度即失效，改用注册表版本区间`,
        )
      }
    }
    for (const { name, spec } of peers) {
      if (MACHINE_ABSOLUTE_SPEC.test(spec)) {
        violations.push(`${relPath}: peerDependencies 的 ${name} 指向机器绝对路径（${spec}）`)
      }
    }

    // 同名多声明：pnpm 只认优先级最高的那一侧，另一侧是写给人看的谎。
    const byName = new Map()
    for (const entry of raw) {
      if (!byName.has(entry.name)) byName.set(entry.name, [])
      byName.get(entry.name).push(entry)
    }
    for (const [name, entries] of byName) {
      if (entries.length < 2) continue
      const shown = entries.map((entry) => `${entry.field}=${entry.spec}`).join(' / ')
      violations.push(
        `${relPath}: ${name} 在多个字段里重复声明（${shown}）——pnpm 只让优先级最高的那一侧生效，另一侧不会报错但也不生效`,
      )
    }

    /** 生效声明：按 FIELD_PRECEDENCE 取第一个出现的字段。 */
    const effective = new Map()
    for (const field of FIELD_PRECEDENCE) {
      for (const entry of raw) {
        if (entry.field !== field || effective.has(entry.name)) continue
        effective.set(entry.name, entry)
      }
    }

    if (effective.size === 0 && peers.length === 0) continue

    if (lockfileText === null) {
      violations.push(
        `${relPath}: 清单声明了依赖但仓库里没有 pnpm-lock.yaml——干净检出按清单装出来的版本不受约束（ADR-0055）`,
      )
      continue
    }
    if (MACHINE_ABSOLUTE_TEXT.test(lockfileText)) {
      violations.push(
        `${relPath}: pnpm-lock.yaml 里含逃出包目录或绝对的 file:/link: 目标——该目标随安装深度或机器变，锁文件不可移植`,
      )
    }
    const recorded = parseImporterSpecifiers(lockfileText)
    if (recorded === null) {
      violations.push(`${relPath}: pnpm-lock.yaml 缺少可解析的 importers 块——本校验无法判定，按失败处理`)
      continue
    }
    for (const { name, spec, field } of effective.values()) {
      const found = recorded.get(name)
      if (found === undefined) {
        violations.push(`${relPath}: 锁文件未记录 ${name}（${field} 声明 ${spec}）——清单改过而锁文件没重生成`)
      } else if (found.specifier !== spec) {
        violations.push(
          `${relPath}: ${name} 的 specifier 不一致（锁文件 ${found.specifier} / 清单 ${field} 写的是 ${spec}）`,
        )
      }
    }
    for (const { name, spec } of peers) {
      if (effective.has(name)) continue // 同一个名字已在本地声明过，peer 即被满足
      const found = recorded.get(name)
      if (found === undefined) {
        violations.push(`${relPath}: 锁文件未记录 peerDependency ${name}（清单 ${spec}）`)
      } else if (found.specifier !== spec) {
        violations.push(`${relPath}: peerDependency ${name} 的 specifier 不一致（锁文件 ${found.specifier} / 清单 ${spec}）`)
      }
    }
  }
  return { passed: violations.length === 0, violations }
}
