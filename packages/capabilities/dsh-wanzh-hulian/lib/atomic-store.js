import { open, mkdir, rename, chmod, unlink, readFile, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { basename, dirname, join } from 'node:path'

/**
 * dsh-wanzh-hulian — 原子持久化（SEC-RT-006）。
 *
 * ## 为什么需要这一层
 *
 * 旧的四个 JSON store（`config.json` / `connections.json` / `mcp-servers.json` /
 * `oauth-pixpix.json`）都是 `writeFile(最终路径, …)`。它有两个后果：
 *
 *  1. **写中途消失即截断**：进程被杀、磁盘满、宿主退出，读者看到半个 JSON；
 *  2. **权限不会收紧**：`writeFile` 的 `mode` 只在**创建**时生效，既有 0644 的
 *     文件（例如由旧版本或用户手工创建）写一万次仍是 0644。
 *
 * ## 提交协议
 *
 * 同目录随机后缀临时文件（`wx`：拒绝跟随被预置的 symlink）→ 写入 → `fsync` →
 * `chmod` 到目标权限 → `rename` 覆盖最终路径 → `fsync` 父目录。读者在任何时刻
 * 看到的都是「旧完整内容」或「新完整内容」，不存在中间态；权限位随**新 inode**
 * 一起生效，因此收紧既有 0644 时没有「先宽后窄」的窗口。
 *
 * `chmod` 打在**临时文件**上而不是最终路径：最终路径上的 chmod 会先暴露一个
 * 宽权限窗口，而临时文件在 rename 之前对读者不可见。
 *
 * 目录 `fsync` 不是可选项：rename 本身只保证「目录项替换是原子的」，不保证它
 * 已经落盘。macOS/APFS 实测支持（`open(dir,'r')` + `sync()`），平台不支持时本层
 * **如实抛错**而不是静默降级——按最坏情况设计，失败方向是「不落盘」而不是
 * 「看起来落盘了」（docs/pitfalls-playbook.md P-06）。
 *
 * ## 与 `@deepseek-ai/dsh-atomic-write` 的关系
 *
 * 宿主的 `dsh-atomic-write` 提供了同形的 `writeFileAtomic`（并额外提供跨进程
 * `withFileLock`），但它**明确把 fsync 排除在外**（"Crash durability (fsync) is
 * out of scope"），而本卡要求文件与目录 fsync；且它不在本包的运行期依赖里，
 * 引入它会给插件加一条随包出货的依赖。因此这里复用它的**设计**（同目录随机后缀
 * + `wx` + rename 携带 mode），补上 fsync 与 JSON 健康语义。取舍见 ADR-0099。
 *
 * @module atomic-store
 */

/** `readJson` 的两类失败：文件不存在 / 内容不可解析。二者必须可区分。 */
export const MISSING = 'missing'
/** 不可解析（或顶层不是对象）时的 reason。 */
export const CORRUPT = 'corrupt'
/** `updateJson` 拒绝在损坏文件上写入时抛出的错误码。 */
export const CORRUPT_STATE = 'CORRUPT_STATE'

/** 损坏文件上拒绝写入：覆盖损坏内容等于抹掉唯一的取证来源。 */
export class CorruptStateError extends Error {
  /**
   * @param {string} file 损坏的状态文件路径。
   * @param {string} reason 解析失败原因。
   * @param {string} raw 损坏的原始字节（保留给调用方取证/展示）。
   */
  constructor(file, reason, raw) {
    super(`状态文件损坏，已拒绝写入以免覆盖取证字节：${file}（${reason}）`)
    this.name = 'CorruptStateError'
    this.code = CORRUPT_STATE
    this.file = file
    this.reason = reason
    this.raw = typeof raw === 'string' ? raw : ''
  }
}

/**
 * 串行队列：把一个文件的读-改-写放进同一条串行链。
 *
 * 只保证**同进程内**的先后。精度说清（第一版注释写成「插件的写入口都在同一条链上」，
 * 而当时只有 `updateJson` 真在链上，独立审证据此实测出丢更新）：
 *  - **读-改-写**类入口（state / connections / mcp / token / 技能 flag）都必须经
 *    `runExclusive` 或 `updateJson`，它们在链上；
 *  - **整文件替换**类写入（技能模板首次落盘、模板升级）不排队——它们没有
 *    「读到旧值再拼装」的窗口，重复执行结果相同。
 * 跨进程互斥是另一件事，需要 `dsh-atomic-write` 的 `withFileLock`，本包未引入。
 * 一个任务失败不影响后续任务。
 *
 * **重入即报错**：在队列任务内部再调一次 `run` 会"等自己"，那是一个**不可见的挂死**。
 * 用 `AsyncLocalStorage` 认出这种嵌套并当场抛错（并发的第二个调用者不属于嵌套，
 * 照常排队）。挂死与报错在读数上必须区分开——挂死没有任何读数。
 * @returns {{ run: <T>(task: () => Promise<T> | T) => Promise<T> }} 串行执行器。
 */
export function createSerialQueue() {
  const inside = new AsyncLocalStorage()
  const token = {}
  let tail = Promise.resolve()
  return {
    run(task) {
      if (inside.getStore() === token) {
        throw new Error('串行队列重入：在队列任务内部再调用 run() 会等自己（必然挂死）。请改用不排队的内层写入，或把两段合并成一次任务。')
      }
      const result = tail.then(() => inside.run(token, () => task()))
      tail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }
}

/**
 * 读 JSON 的两种结果。
 * @typedef {{ ok: true, value: any, raw: string }} ReadJsonOk
 * @typedef {{ ok: false, reason: string, raw?: string, error?: string, file: string }} ReadJsonFail
 * @typedef {ReadJsonOk | ReadJsonFail} ReadJsonResult
 */

/**
 * fs 门面：本模块唯一的 I/O 边界。类型刻意宽松（`any`）——它是一层可注入的替身，
 * 而 `FileHandle` 与测试替身并不共享结构类型，收紧只会逼出无意义的断言。
 * @typedef {{
 *   mkdir: (dir: string, options: { recursive: boolean, mode?: number }) => Promise<any>,
 *   open: (path: string, flags: string, mode: number) => Promise<any>,
 *   rename: (from: string, to: string) => Promise<any>,
 *   chmod: (path: string, mode: number) => Promise<any>,
 *   unlink: (path: string) => Promise<any>,
 *   readFile: (path: string, encoding: "utf8") => Promise<string>,
 *   stat: (path: string) => Promise<{ mode: number }>,
 *   fsyncDir: (dir: string) => Promise<void>
 * }} StoreOps
 */

/** 真实文件系统门面。抽出来只为让「rename 前失败」这类时序可确定性重放。 */
function createDefaultOps() {
  return {
    mkdir: (dir, options) => mkdir(dir, options),
    open: (path, flags, mode) => open(path, flags, mode),
    rename: (from, to) => rename(from, to),
    chmod: (path, mode) => chmod(path, mode),
    unlink: (path) => unlink(path),
    readFile: async (path, encoding) => String(await readFile(path, encoding)),
    stat: (path) => stat(path),
    /** 目录 fsync：让 rename 本身落盘，而不只是让它在内存里完成。 */
    async fsyncDir(dir) {
      const handle = await open(dir, 'r')
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
    },
  }
}

/**
 * 「顶层是不是一个可用的 JSON 对象」——读路径与写路径**共用同一把尺子**。
 *
 * 导出而不是各自留一份：`updateJson` 用它拒写、插件的读路径用它判损坏，
 * 两份实现只要分叉一次，同一个文件就会「读说健康、写说损坏」（ADR-0099）。
 * @param {unknown} value 待判断的值。
 * @returns {boolean} 是非数组的普通对象时为 true。
 */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 建立一个原子 store。
 * @param {StoreOps} [ops] fs 门面；缺省为真实文件系统。
 * @returns {{
 *   ops: StoreOps,
 *   writeText: (file: string, text: string, options?: { mode?: number }) => Promise<void>,
 *   writeJson: (file: string, value: unknown, options?: { mode?: number }) => Promise<void>,
 *   readJson: (file: string) => Promise<ReadJsonResult>,
 *   updateJson: <T>(file: string, mutator: (current: any) => T | Promise<T>, options: { initial: T | (() => T), mode?: number }) => Promise<T>,
 *   runExclusive: <T>(task: () => Promise<T> | T) => Promise<T>,
 *   replaceAfterArchive: (file: string, value: unknown, options?: { mode?: number }) => Promise<{ archived: string | null }>
 * }} store 实例。
 */
export function createAtomicStore(ops = createDefaultOps()) {
  const queue = createSerialQueue()

  /**
   * 写后校验最终权限——在 **rename 之前**做。
   *
   * 校验对象是临时文件而不是最终路径，理由是同一个 inode：rename 只改目录项，
   * 权限位随 inode 一起生效，所以在临时文件上量到的位就是最终路径将要拥有的位。
   * 这样做同时把失败方向钉死：位不对就**不 rename**，于是一个宽权限的状态文件
   * 永远不会出现在最终路径上（先 rename 再校验只能事后报警，文件已经在外面了）。
   * 实测依据：umask 022 下 `open(…, 0o600)` 本身就给出 0600，`chmod` 看似冗余；
   * umask 077 下同一次调用会给出 0600 而不是请求的 0644——所以校验必须存在，
   * 而「看起来多余」的 chmod 正是让它成立的那一步。
   * @param {string} tmp 尚未 rename 的临时文件。
   * @param {number} mode 期望的权限位。
   */
  async function verifyMode(tmp, mode) {
    const actual = (await ops.stat(tmp)).mode & 0o777
    if (actual !== mode) {
      throw new Error(`状态文件权限校验失败：期望 ${mode.toString(8)}，实际 ${actual.toString(8)}（${tmp}）`)
    }
  }

  async function writeText(file, text, { mode = 0o600 } = {}) {
    const dir = dirname(file)
    await ops.mkdir(dir, { recursive: true, mode: 0o700 })
    const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
    try {
      const handle = await ops.open(tmp, 'wx', mode)
      try {
        await handle.writeFile(text, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await ops.chmod(tmp, mode)
      await verifyMode(tmp, mode)
      await ops.rename(tmp, file)
      await ops.fsyncDir(dir)
    } catch (error) {
      await ops.unlink(tmp).catch(() => {})
      throw error
    }
  }

  async function writeJson(file, value, options = {}) {
    await writeText(file, `${JSON.stringify(value, null, 2)}\n`, options)
  }

  /** @returns {Promise<ReadJsonResult>} 读结果（缺失/损坏是两种不同的失败）。 */
  async function readJson(file) {
    /** @type {string} */
    let raw
    try {
      raw = await ops.readFile(file, 'utf8')
    } catch (error) {
      const code = /** @type {any} */ (error)?.code
      if (code === 'ENOENT') return { ok: false, reason: MISSING, file }
      throw error
    }
    try {
      return { ok: true, value: JSON.parse(raw), raw }
    } catch (error) {
      return { ok: false, reason: CORRUPT, raw, error: /** @type {any} */ (error)?.message ?? String(error), file }
    }
  }

  async function updateJson(file, mutator, { initial, mode = 0o600 }) {
    return queue.run(async () => {
      const current = await readJson(file)
      if (!current.ok && current.reason === CORRUPT) {
        throw new CorruptStateError(file, current.error ?? '解析失败', current.raw ?? '')
      }
      const base = current.ok ? current.value : typeof initial === 'function' ? initial() : initial
      if (!isPlainObject(base)) {
        throw new CorruptStateError(file, '顶层不是 JSON 对象', current.raw ?? '')
      }
      const next = await mutator(base)
      await writeJson(file, next, { mode })
      return next
    })
  }

  /**
   * 在**同一个排他槽位**里做一次读-改-写（跨文件也可以）。
   *
   * 为什么需要它：`updateJson` 只护住它自己那一份读-改-写。插件里还有几处写入是
   * 「先 readXxx() 再拼装再 writeJson()」，中间的 await 就是并发窗口——两个并发的
   * `/toggle` 各自读到同一份旧值，后写的把先写的吞掉，而**两个请求都返回 200**。
   * 那就是「内存显示成功、磁盘没成功」。调用方把整段包进这里即可消掉该窗口。
   *
   * 边界：只在同进程内串行。跨进程互斥需要文件锁（宿主 `dsh-atomic-write` 的
   * `withFileLock` 形态），本包未引入，见 ADR-0099 的「已知边界」。
   * @template T
   * @param {() => Promise<T> | T} task 读-改-写整段。
   * @returns {Promise<T>} 任务结果。
   */
  function runExclusive(task) {
    return queue.run(task)
  }

  /**
   * 归档损坏文件后写新内容——**唯一的例外通道**，只给「凭证类、可重新获取」的文件用。
   *
   * 为什么需要例外：默认策略是「损坏就拒绝写入」，理由是覆盖损坏内容等于抹掉证据。
   * 但 PixPix token 文件恰好是这条策略会把人关死的地方——它的正文本身就是密钥、
   * 没有界面入口可删，而「重新授权」是唯一能把它写回正常的动作，于是「拒绝写入」
   * 直接等于「永远无法重新授权」（独立审证 2026-09-16 实证）。因此对这一个文件改为：
   * 先把损坏原字节改名归档（`<file>.corrupt-<ts>`，同样 0600，证据仍在盘上），再写新内容。
   *
   * 只对**不可解析**的文件生效；归档步骤自己失败时如实抛出（不静默覆盖）。
   * @param {string} file 目标文件。
   * @param {unknown} value 新内容（JSON）。
   * @param {{ mode?: number }} [options] 权限位，缺省 0600。
   * @returns {Promise<{ archived: string | null }>} 归档路径（没有需要归档的内容时为 null）。
   */
  async function replaceAfterArchive(file, value, { mode = 0o600 } = {}) {
    return queue.run(async () => {
      const current = await readJson(file)
      let archived = null
      if (!current.ok && current.reason === CORRUPT) {
        archived = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
        await ops.rename(file, archived)
        await ops.chmod(archived, mode)
        await ops.fsyncDir(dirname(file))
      }
      await writeJson(file, value, { mode })
      return { archived }
    })
  }

  return { ops, writeText, writeJson, readJson, updateJson, runExclusive, replaceAfterArchive }
}

/** 插件内唯一的 store 实例（所有落盘都走它）。 */
export const atomicStore = createAtomicStore()
