/**
 * profile 副本同步工具。源与副本语义见 docs/architecture.md 第 2 节红线 4：
 * 编辑工具会打破 `file:` 硬链接 inode，因此副本同步一律 tmp+mv 原子替换，
 * 绝不用 `cat >` 直接覆盖（会同时破坏源与副本两个文件）。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 计算待同步清单：只比较副本中已存在的文件内容，不追加副本缺失的文件
 * （副本可能含构建产物、备份等仓库内不收录的文件，全量复制会覆盖运行所需内容）。
 * @param {string} sourceDir 源目录绝对路径
 * @param {string} targetDir 副本目录绝对路径
 * @param {string[]} files 相对路径列表
 * @returns {{diverged: string[], absentInTarget: string[]}}
 */
export function planSync(sourceDir, targetDir, files) {
  const diverged = []
  const absentInTarget = []
  for (const file of files) {
    const target = join(targetDir, file)
    if (!existsSync(target)) {
      absentInTarget.push(file)
      continue
    }
    if (readFileSync(join(sourceDir, file), 'utf8') !== readFileSync(target, 'utf8')) diverged.push(file)
  }
  return { diverged, absentInTarget }
}

/**
 * 执行同步。每个文件写临时文件后 rename 覆盖，保证副本要么是旧内容要么是新内容。
 * @param {string} sourceDir 源目录绝对路径
 * @param {string} targetDir 副本目录绝对路径
 * @param {string[]} files 相对路径列表
 * @returns {number} 实际写入的文件数
 */
export function applySync(sourceDir, targetDir, files) {
  let written = 0
  for (const file of files) {
    const source = join(sourceDir, file)
    const target = join(targetDir, file)
    mkdirSync(dirname(target), { recursive: true })
    const tmp = `${target}.tmp-${process.pid}`
    copyFileSync(source, tmp)
    renameSync(tmp, target)
    written += 1
  }
  return written
}

/** 删除同步过程中可能残留的临时文件。 */
export function cleanTemps(targetDir, files) {
  for (const file of files) rmSync(join(targetDir, `${file}.tmp-${process.pid}`), { force: true })
}

/**
 * 校验**内嵌副本**（`<profile>/vendor/`）的 package.json 与仓库源一致（只校验元数据，不管构建产物）。
 * 副本不存在该包时视为「未安装」，不报错。
 *
 * 措辞上的红线：`vendor/` **不是装载点**。DSH 的包解析锚点是 profile 根
 * `package.json`（`resolveOverlayPackage` 的 `profilePackageUrl`），实际执行的是
 * `<profile>/node_modules/`；`vendor/` 全仓只被当作「内嵌 profile 拷贝物化」的判别
 * 标记引用过一次。所以本项**不能**被当作「改动已生效」的证据——那由
 * `checkProfileBundleSync` 断言。曾经这里自称「live profile 副本」，而正是这种
 * 名不副实的绿灯让「胶囊没消失但门禁全绿」发生了一整轮（ADR-0054）。
 * @param {Array<{name: string, sourceDir: string, targetDir: string}>} pairs 待校验包
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkProfileMetadata(pairs) {
  const violations = []
  const file = 'package.json'
  for (const { name, sourceDir, targetDir } of pairs) {
    if (!existsSync(join(targetDir, file))) continue
    const { diverged } = planSync(sourceDir, targetDir, [file])
    if (diverged.length > 0) {
      violations.push(`${name}: 内嵌副本（profile/vendor）的 package.json 与仓库源不一致（运行 scripts/sync-profile.mjs --apply --only-metadata）`)
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 校验 profile 副本与包 `files` 清单一致（交付形态，两个方向都查）。
 *
 * 动机（2026-09-11 实测）：`file:` 依赖在 profile 里是**硬链接实体副本**而非符号链接，
 * 安装之后新增的文件不会进副本。dsh-preset-lint-local 的 lib/lint-preset.mjs 就这么丢了，
 * 症状是「preset 校验整体静默失效 + 日志里一句 warn」，排查成本极高。
 * 反向的不一致同样存在：清单声明了但源码里根本没有（陈旧清单）。
 *
 * 语义：`files` 清单即契约。
 *   - 清单条目在源码中不存在（通配条目按其静态前缀目录判定）→ 违规；
 *   - 条目在源码中存在、但 profile 副本中不存在 → 违规。
 * 副本不存在该包时视为「未安装」，跳过（与 checkProfileMetadata 同语义）。
 * @param {Array<{name: string, sourceDir: string, targetDir: string, files?: string[]}>} pairs 待校验包
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkProfileFilesSync(pairs) {
  const violations = []
  for (const { name, sourceDir, targetDir, files } of pairs) {
    if (!existsSync(join(targetDir, 'package.json'))) continue
    for (const entry of files ?? []) {
      // 通配条目（如 lib/types/**/*.d.ts）取其静态前缀目录判定存在性。
      const relative = entry.includes('*')
        ? entry.slice(0, entry.search(/[*?]/)).replace(/\/$/, '')
        : entry
      if (!existsSync(join(sourceDir, relative))) {
        violations.push(`${name}: files 声明的 "${entry}" 在源码中不存在（陈旧清单，请从 package.json 的 files 中删除）`)
        continue
      }
      if (!existsSync(join(targetDir, relative))) {
        violations.push(`${name}: files 声明的 "${entry}" 在 profile 副本中缺失（用 tmp+mv 语义补齐，勿直接覆盖）`)
      }
    }
  }
  return { passed: violations.length === 0, violations }
}

/** 可执行的 bundle 扩展名。 */
const BUNDLE_EXT = /\.(?:js|mjs|cjs)$/

/** 装载点不读、或 pnpm 必然重写的文件，一律不进断言面。 */
function assertable(file) {
  if (file.includes('*') || file.includes('?')) return false // 通配条目无法逐文件对账
  if (file === 'package.json') return false // pnpm 在装载点重写它（剥掉 devDependencies / scripts）
  if (file.endsWith('.map') || file.endsWith('.d.ts') || file.endsWith('.tsbuildinfo')) return false
  if (file.startsWith('lib/types/')) return false // TS 类型产物，装载点不执行
  if (file.endsWith('.md')) return false // 文档，装载点不读
  return true
}

/**
 * 装载点断言面 = 应用**会执行或读取**的那些文件。
 *
 * 规则一处定义、两处使用（门禁 `checkProfileBundleSync` 与 CLI `--loadpoint`），
 * 避免校验面与同步面各写一份然后悄悄分叉。
 *
 * 两部分：
 *   1. `lib/` 顶层的 bundle —— 宿主 `lib/index.js` 与 Web `lib/client.js`，
 *      以及 `lint-preset.mjs` 这类 `.mjs` 工具。**直接读源码目录**而不是读 `files`
 *      清单：有的包用 `lib/**` 通配声明，按清单取会一个都没取到，于是恰好漏掉
 *      最该盯的那个文件。
 *   2. `files` 清单里声明的数据与配置（`manifest/*.json`、`cordis.patch.yml`…），
 *      跳过高通配条目、类型产物、文档与 package.json。
 * 为什么不含 `lib/types/**`：那是 TS 类型输出，装载点不执行；把它拉进来只会让门禁
 * 为噪声变红，而噪声最终会让真信号一起被忽略。
 * @param {string} sourceDir 仓库源目录
 * @param {string[]|undefined} declared package.json 的 files 清单
 * @returns {string[]} 仓库根相对路径（已排序）
 */
export function loadPointFiles(sourceDir, declared) {
  const files = new Set()
  const libDir = join(sourceDir, 'lib')
  if (existsSync(libDir)) {
    for (const entry of readdirSync(libDir, { withFileTypes: true })) {
      if (entry.isFile() && BUNDLE_EXT.test(entry.name)) files.add(`lib/${entry.name}`)
    }
  }
  for (const file of declared ?? []) {
    if (!assertable(file)) continue
    const target = join(sourceDir, file)
    // 声明的**目录**条目（`lib` / `src` / `docs` / `pipeline`…）不展开：展开会把别的包
    // 的 TypeScript 源码也拉进断言面，噪声最终会淹掉信号；bundle 层由上面第 1 条
    // 独立覆盖，不依赖各包用什么形态声明。
    if (!existsSync(target) || !statSync(target).isFile()) continue
    files.add(file)
  }
  return [...files].sort()
}

/**
 * 校验**装载点上产物的字节**与仓库源一致。
 *
 * 动机（2026-09-12 实测）：R1 已把输入框上方那两枚胶囊从
 * `dsh-overseas-skills/lib/client.js` 移除，仓库副本确实干净、该包测试全绿，
 * 但装载点上的 `lib/client.js` 还是旧的，用户屏幕上胶囊照旧。三个原因叠在一起：
 *   1. `file:` 依赖在 profile 里是**硬链接实体**，编辑工具 tmp+mv 落盘会换掉
 *      inode，硬链接当场断开，此后仓库里的每次构建都只写进仓库那一份；
 *   2. 测试读的是仓库文件，因此全绿；
 *   3. `profile-files-sync` 只断言文件**存在**——副本旧但存在，因此也全绿。
 * 于是「门禁全绿 + 功能没生效」可以同时成立，而唯一的证据在用户的屏幕上。
 *
 * 本项把粒度从「文件在不在」升到「字节一不一样」。缺失由 `profile-files-sync`
 * 负责，本项只判内容，避免同一事实两处报。
 *
 * 作用域限定为**仓库受管的包**：另一个项目自己的 `file:` 依赖漂移是那个项目的事，
 * 挂到这里只会让本仓库门禁为别人的状态变红，然后被加豁免。
 * @param {Array<{name: string, sourceDir: string, targetDir: string, files?: string[]}>} pairs 待校验包
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkProfileBundleSync(pairs) {
  const violations = []
  for (const { name, sourceDir, targetDir, files } of pairs) {
    if (!existsSync(join(targetDir, 'package.json'))) continue
    for (const file of loadPointFiles(sourceDir, files)) {
      const source = join(sourceDir, file)
      const target = join(targetDir, file)
      if (!existsSync(source) || !existsSync(target)) continue
      if (!readFileSync(source).equals(readFileSync(target))) {
        violations.push(
          `${name}: 装载点的 ${file} 与仓库源字节不一致（应用会跑旧产物；用 tmp+mv 语义同步，见 node scripts/sync-profile.mjs --apply --loadpoint）`,
        )
      }
    }
  }
  return { passed: violations.length === 0, violations }
}
