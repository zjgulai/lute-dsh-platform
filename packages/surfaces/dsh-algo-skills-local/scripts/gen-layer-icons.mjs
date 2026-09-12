#!/usr/bin/env node
/**
 * Generate `src/layer-icons.ts` — the 4 plane + 8 responsibility-domain avatars.
 *
 * The avatars are authored by the `lute-brand-icons` skill (LUTE 品牌方形徽章
 * 家族), which owns the SVG generator, the catalog and the dual-theme preview.
 * This script only *selects* the twelve layer entries out of that skill's
 * published manifest and bakes them into the plugin, so the settings page keeps
 * rendering its layer icons even when the brand skill is not installed on the
 * machine — the same split `dsh-overseas-skills` uses for its category icons.
 *
 * Usage:
 *   node scripts/gen-layer-icons.mjs            # read the brand skill's manifest
 *   BRAND_MANIFEST=<path> node scripts/gen-layer-icons.mjs
 *
 * Exit codes: 0 = written; 1 = a required avatar is missing or malformed.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const OUT = join(ROOT, 'src', 'layer-icons.ts')
const MANIFEST = process.env.BRAND_MANIFEST
  ?? join(homedir(), '.dsh', 'skills', 'lute-brand-icons', 'assets', 'manifest.json')

/** Brand-skill entry id → the taxonomy key the host looks the avatar up by. */
const LAYER_MAP = [
  ['pln-mgt', 'PLN-MGT', '经营管理'],
  ['pln-ops', 'PLN-OPS', '业务运营'],
  ['pln-ctl', 'PLN-CTL', '独立控制'],
  ['pln-plt', 'PLN-PLT', '数据与Agent平台'],
  ['dom-01', 'DOM-01', '经营与组织'],
  ['dom-02', 'DOM-02', '产品与创新'],
  ['dom-03', 'DOM-03', '供应与履约'],
  ['dom-04', 'DOM-04', '渠道经营'],
  ['dom-05', 'DOM-05', '品牌与增长'],
  ['dom-06', 'DOM-06', '服务与体验'],
  ['dom-07', 'DOM-07', '财务与合规'],
  ['dom-08', 'DOM-08', '数据与AI运行'],
]

let entries
try {
  entries = JSON.parse(readFileSync(MANIFEST, 'utf8'))
} catch (error) {
  console.error(`✗ 读不到品牌头像清单 ${MANIFEST}：${error instanceof Error ? error.message : String(error)}`)
  console.error('  先跑 lute-brand-icons 的 `node scripts/build.js`，或用 BRAND_MANIFEST=<path> 指定。')
  process.exit(1)
}
if (!Array.isArray(entries)) {
  console.error(`✗ ${MANIFEST} 不是数组（品牌清单格式已变？）`)
  process.exit(1)
}
const byId = new Map(entries.map((entry) => [entry?.id, entry]))

const rows = []
const missing = []
for (const [brandId, key, label] of LAYER_MAP) {
  const entry = byId.get(brandId)
  const icon = typeof entry?.icon === 'string' ? entry.icon : ''
  if (!icon.startsWith('data:image/svg+xml;base64,')) {
    missing.push(`${brandId} → ${key}（${label}）`)
    continue
  }
  rows.push({ key, brandId, label, icon })
}
if (missing.length > 0) {
  console.error(`✗ 品牌清单缺 ${missing.length} 枚层头像：\n  ${missing.join('\n  ')}`)
  console.error('  在 lute-brand-icons 的 scripts/catalog.js 补齐条目后重跑 node scripts/build.js。')
  process.exit(1)
}

const body = rows
  .map((row) => `  // ${row.label}　← lute-brand-icons「${row.brandId}」\n  ${JSON.stringify(row.key)}: ${JSON.stringify(row.icon)},`)
  .join('\n')

const text = `/**
 * 层头像：4 面 + 8 责任域，共 12 枚。
 *
 * 本文件由 \`node scripts/gen-layer-icons.mjs\` 生成——**不要手改**。
 * 头像的艺术源在 lute-brand-icons 技能（品牌方形徽章家族，含 SVG 生成器、
 * catalog 与暗/浅双主题预览）；本包只从中挑出这 12 条并烘焙进来，页面因此
 * 不依赖品牌技能是否安装在目标机器上。改图标请改品牌技能的 catalog.js，
 * 重跑它的 build.js，再回到本包重跑生成脚本与 \`pnpm run verify:icons\`。
 */

/** 分类键 → 头像 data URI（base64 SVG）。 */
export const LAYER_ICONS: Record<string, string> = {
${body}
}

/** 生成来源清单，供 \`verify:icons\` 与页面页脚回溯。 */
export const LAYER_ICON_SOURCES: ReadonlyArray<{ key: string; brandId: string; label: string }> = [
${rows.map((row) => `  { key: ${JSON.stringify(row.key)}, brandId: ${JSON.stringify(row.brandId)}, label: ${JSON.stringify(row.label)} },`).join('\n')}
]
`

writeFileSync(OUT, text)
console.log(`✓ 写入 ${OUT}（${rows.length} 枚：4 面 + 8 责任域，源 ${MANIFEST}）`)
