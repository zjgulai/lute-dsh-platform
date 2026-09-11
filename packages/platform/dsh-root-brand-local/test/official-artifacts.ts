/**
 * 官方样式的**真值提取器**：从真实产物里读出官方 CSS-module 注入内容，
 * 供测试在 DOM 里重建官方结构。
 *
 * 纪律：期望值必须来自独立真值（官方产物 / 规格字面量），
 * 禁止复制实现算法或把插件自己写下的哈希常量抄进断言。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** 官方 app 包内 chat 客户端的两条候选路径（本机安装优先）。 */
export const CHAT_CLIENT_CANDIDATES = [
  '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js',
  '/tmp/asarx/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js',
] as const

/** 官方 app 包内对话客户端的两条候选路径（本机安装优先）。 */
export const CONVERSATION_CLIENT_CANDIDATES = [
  '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
  '/tmp/asarx/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
] as const

/** 已入库的 2.0.4 归档（任何机器可复现）。 */
export const ARCHIVE_CONVERSATION_CLIENT =
  'dsh-patches/archive/chatui-orig-bundles/dsh-client-ui-conversation-client.js.orig'

/** 已入库的 2.0.4 chat 包归档（StatsLine 折叠锚的上一代真值）。 */
export const ARCHIVE_CHAT_CLIENT =
  'dsh-patches/archive/chatui-orig-bundles/dsh-client-ui-chat-client.js.orig'

/** 官方统计条模块 id（dsh-client-ui-chat 包）。 */
export const STATS_LINE_MODULE_ID = '@deepseek-ai/dsh-client-ui-chat/StatsLine.module.css'

/** 仓库根：本文件位于 packages/platform/dsh-root-brand-local/test/ 下。 */
export function repoRoot(): string {
  return resolve(import.meta.dirname, '../../../..')
}

/** 第一个存在的候选路径；都不存在时返回 undefined（调用方应 skip 并打印原因）。 */
export function firstExisting(paths: readonly string[]): string | undefined {
  return paths.find((path) => existsSync(path))
}

/**
 * 从官方客户端产物里提取某个 CSS-module 的 CSS 文本。
 *
 * 依据官方编译产物形态（2.0.4 与 2.0.5 逐字一致）：
 *   const css$N = "...";
 *   const tagId$N = "<包路径>/<模块>.module.css";
 * 因此先定位 tagId 行，再回溯最近的 `const css$N = "` 声明。
 */
export function extractModuleCss(bundlePath: string, moduleId: string): string {
  const source = readFileSync(bundlePath, 'utf8')
  const anchor = source.indexOf(`"${moduleId}"`)
  if (anchor < 0) throw new Error(`产物里找不到模块 id ${moduleId}：${bundlePath}`)
  const before = source.slice(0, anchor)
  const declaration = [...before.matchAll(/const css\$[0-9]+ = ("(?:[^"\\]|\\.)*");/g)].pop()
  if (declaration === undefined) throw new Error(`模块 ${moduleId} 前找不到 css 声明：${bundlePath}`)
  return JSON.parse(declaration[1]) as string
}

/**
 * 把官方 CSS 文本里的某个模块局部名解析成**完整类名**，用负向断言取唯一前缀：
 * 含该局部名的前缀必须恰好一个（多于一个说明锚放错了模块）。
 */
export function resolveClassName(css: string, localName: string): string {
  const pattern = new RegExp(`\\.([A-Za-z0-9_]+)_${localName}(?![A-Za-z0-9_-])`, 'g')
  const prefixes = new Set<string>()
  for (const match of css.matchAll(pattern)) prefixes.add(match[1] as string)
  if (prefixes.size !== 1) {
    throw new Error(`局部名 ${localName} 的前缀候选 ${prefixes.size} 个（应为 1）：${[...prefixes].join(', ')}`)
  }
  return `${[...prefixes][0] as string}_${localName}`
}

/** 官方对话客户端里 hero 栅格所用的模块 id。 */
export const HERO_SHELL_MODULE_ID = '@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css'

/** 从产物里读出 hero 三个元素的完整类名（官方真值）。 */
export function officialHeroClasses(bundlePath: string): {
  headline: string
  headlineText: string
  previewBadge: string
} {
  const css = extractModuleCss(bundlePath, HERO_SHELL_MODULE_ID)
  return {
    headline: resolveClassName(css, 'headline'),
    headlineText: resolveClassName(css, 'headlineText'),
    previewBadge: resolveClassName(css, 'previewBadge'),
  }
}
