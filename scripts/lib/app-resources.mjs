/**
 * 已装 DSH Desktop app 的资源根解析（LUTE 2.5.0 / 基座 2.0.10 迁移配套）。
 *
 * 上游 v2.0.10 起 `asar: false`（ADR-0067 之前的 2.0.5 是 `app.asar` +
 * `app.asar.unpacked`），资源根从 `app.asar.unpacked/` 变为普通目录 `app/`。
 * 本模块是**唯一**的路径来源（一份事实一个家）：迁移期生产 2.0.5 与新装
 * 2.5.0 并存，探测必须每调用时进行，禁止缓存（app 可被替换）。
 *
 * 判定规则：`Resources/app` 存在且 `Resources/app.asar` 不存在 → no-ASAR 形态；
 * 否则回退 ASAR 形态。两者都不存在时返回 null（调用方按「app 未安装」处理，
 * 不得猜测路径）。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 已装 app 的默认位置（与既有脚本约定一致，可被环境覆盖）。 */
export const DSH_APP_DIR = process.env.DSH_APP ?? '/Applications/DSH Desktop.app'

/** 已装 app 的 Contents/Resources 目录。 */
export function appResourcesDir(appDir = DSH_APP_DIR) {
  return join(appDir, 'Contents', 'Resources')
}

/** 形态探测：'no-asar' | 'asar' | null（app 不存在）。 */
export function appResourcesForm(appDir = DSH_APP_DIR) {
  const res = appResourcesDir(appDir)
  const noAsar = existsSync(join(res, 'app'))
  const asar = existsSync(join(res, 'app.asar')) || existsSync(join(res, 'app.asar.unpacked'))
  if (noAsar && !asar) return 'no-asar'
  if (asar) return 'asar'
  return null
}

/** 资源根（`…/Resources/app` 或 `…/Resources/app.asar.unpacked`）；app 不在返回 null。 */
export function appResourcesRoot(appDir = DSH_APP_DIR) {
  const form = appResourcesForm(appDir)
  if (form === 'no-asar') return join(appResourcesDir(appDir), 'app')
  if (form === 'asar') {
    // unpacked 是可执行资源实际落盘位置；构建机上 .unpacked 必在
    return join(appResourcesDir(appDir), 'app.asar.unpacked')
  }
  return null
}

/** app 内 node_modules（`@deepseek-ai` 等官方包所在）；app 不在返回 null。 */
export function appNodeModules(appDir = DSH_APP_DIR) {
  const root = appResourcesRoot(appDir)
  return root === null ? null : join(root, 'node_modules')
}

// ---------------------------------------------------------------------------
// CLI：`node scripts/lib/app-resources.mjs <appDir>` — bash 消费面（assemble.sh、
// dsh-patches/*）用同一探测的唯一家，不在 shell 里复制判定规则。
// 输出 KEY=VALUE 三行（app 不存在时 printenv 形态 form=absent 且 exit 1）。
// ---------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = process.argv[2] ?? DSH_APP_DIR
  const form = appResourcesForm(appDir)
  if (form === null) {
    console.log(`form=absent`)
    console.error(`app-resources: ${appDir} 不存在或无 app 布局，拒绝猜测（src/scripts/lib/app-resources.mjs 判定规则）`)
    process.exit(1)
  }
  console.log(`form=${form}`)
  console.log(`root=${appResourcesRoot(appDir)}`)
  console.log(`node_modules=${appNodeModules(appDir)}`)
}
