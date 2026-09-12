#!/usr/bin/env node
/**
 * Structural acceptance for the twelve layer avatars.
 *
 * The brand skill's own discipline is "每个新图标必须过暗/浅双主题预览验收",
 * which is an eyes-on step a script cannot replace — but it can catch every
 * failure mode that step exists to catch, and catch it reproducibly:
 *
 *   - frame / stroke / clip / highlight departures from the品牌规范
 *   - a chest emblem that silently rendered as nothing. The generator's
 *     `EMBLEMS[id]` lookup falls through to an empty string for an unknown id,
 *     so a typo in the catalog costs the emblem with no error anywhere. This
 *     check rebuilds each entry with and without its emblem and diffs the two,
 *     which is the only way to see the difference.
 *   - emblem geometry escaping the chest box
 *   - a colour outside the family palette (baseline measured from the existing
 *     entries rather than hand-copied, so it cannot drift from reality)
 *
 * Usage: node scripts/verify-layer-icons.mjs
 * Exit codes: 0 = all twelve pass; 1 = at least one violation; 2 = prerequisites missing.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BRAND = process.env.BRAND_SKILL ?? join(homedir(), '.dsh', 'skills', 'lute-brand-icons')

let generator
let catalog
try {
  const require = createRequire(join(BRAND, 'package.json'))
  generator = require(join(BRAND, 'lib', 'generator.js'))
  catalog = require(join(BRAND, 'scripts', 'catalog.js'))
} catch (error) {
  console.error(`✗ 需要 lute-brand-icons 技能的生成器：${error instanceof Error ? error.message : String(error)}`)
  console.error(`  期望位于 ${BRAND}；可用 BRAND_SKILL=<path> 覆盖。`)
  process.exit(2)
}

/** The generated module is the artifact under test — read it, do not re-derive it. */
const source = readFileSync(join(ROOT, 'src', 'layer-icons.ts'), 'utf8')
const baked = new Map()
for (const match of source.matchAll(/^ {2}"([A-Z]+-[A-Z0-9]+)": "([^"]+)",$/gm)) baked.set(match[1], match[2])
if (baked.size !== 12) {
  console.error(`✗ src/layer-icons.ts 应含 12 条层头像，实测 ${baked.size} 条（先跑 node scripts/gen-layer-icons.mjs）`)
  process.exit(1)
}

const LAYER_MAP = Object.fromEntries(
  [...source.matchAll(/{ key: "([A-Z]+-[A-Z0-9]+)", brandId: "([^"]+)", label: "([^"]+)" \}/g)]
    .map((m) => [m[1], { brandId: m[2], label: m[3] }]),
)
const byBrandId = new Map(catalog.map((entry) => [entry.id, entry]))

/** Family palette baseline: measured from every entry EXCEPT the twelve under test. */
const LAYER_BRAND_IDS = new Set(Object.values(LAYER_MAP).map((row) => row.brandId))
const familyColors = new Set()
for (const entry of catalog) {
  if (LAYER_BRAND_IDS.has(entry.id)) continue
  for (const match of generator.buildIcon(entry, entry.id).matchAll(/#[0-9A-Fa-f]{6}/g)) {
    familyColors.add(match[0].toUpperCase())
  }
}

/** The slice of `a` that differs from `b` (common prefix/suffix trimmed). */
function diffMiddle(a, b) {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1
  return a.slice(head, a.length - tail)
}

const failures = []
for (const [key, { brandId, label }] of Object.entries(LAYER_MAP)) {
  const where = `${key}（${label}，源 ${brandId}）`
  const entry = byBrandId.get(brandId)
  if (entry === undefined) { failures.push(`${where}: 品牌 catalog 里没有这个条目`); continue }

  const dataUri = baked.get(key)
  if (dataUri === undefined) { failures.push(`${where}: layer-icons.ts 里没有烘焙头像`); continue }
  const svg = Buffer.from(dataUri.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')

  // 生成物必须与品牌技能当前 catalog 的输出逐字节一致（改了图标没重跑生成脚本 = 静默分叉）
  if (svg !== generator.buildIcon(entry, brandId)) failures.push(`${where}: 烘焙头像与品牌技能当前输出不一致（重跑 node scripts/gen-layer-icons.mjs）`)

  if (!/<rect x="4\.5" y="4\.5" width="91" height="91" rx="18" fill="url\(#bg/.test(svg)) failures.push(`${where}: 缺外框 4.5/4.5/91/91/rx18`)
  if (!svg.includes('stroke="#58B848" stroke-width="2.2"')) failures.push(`${where}: 外框描边非品牌绿 2.2px`)
  if (!svg.includes('fill="rgba(0,0,0,0.12)"')) failures.push(`${where}: 缺单层 12% 投影`)
  if (!svg.includes('rgba(255,255,255,0.68)')) failures.push(`${where}: 缺左上径向高光`)
  if (!new RegExp(`<clipPath id="clip${brandId}">`).test(svg)) failures.push(`${where}: 缺 clipPath`)
  if (!/<rect x="6\.5" y="6\.5" width="87" height="87" rx="15\.5"\/><\/clipPath>/.test(svg)) failures.push(`${where}: 裁剪区非 6.5/6.5/87/87/rx15.5`)
  if (!/<circle cx="50" cy="44" r="34"/.test(svg)) failures.push(`${where}: 非成人脸型 cx50 cy44 r34`)

  // 胸章：未知 emblem 会静默渲染为空，必须 diff 出真实几何
  const withoutEmblem = generator.buildIcon({ ...entry, emblem: undefined }, brandId)
  const emblem = diffMiddle(svg, withoutEmblem)
  if (emblem === '') failures.push(`${where}: 胸章未渲染（emblem「${entry.emblem}」被生成器静默丢弃）`)
  else {
    for (const match of emblem.matchAll(/(?<![\w-])(?:cx|x)="(-?[\d.]+)"|(?<![\w-])(?:cy|y)="(-?[\d.]+)"/g)) {
      const isX = match[1] !== undefined
      const value = Number(match[1] ?? match[2])
      if (isX && (value < 36 || value > 64)) { failures.push(`${where}: 胸章 x 越出内框 (${value})`); break }
      if (!isX && (value < 76 || value > 100)) { failures.push(`${where}: 胸章 y 越出内框 (${value})`); break }
    }
  }

  for (const match of svg.matchAll(/#[0-9A-Fa-f]{6}/g)) {
    if (!familyColors.has(match[0].toUpperCase())) { failures.push(`${where}: 引入家族外新色 ${match[0]}`); break }
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} 处不合格：\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`✓ 12 枚层头像通过结构化验收：框架 / 品牌绿描边 2.2 / 裁剪区 / 高光 / 胸章非空且不越界 / 无家族外新色（基线 ${familyColors.size} 色，取自品牌 catalog 其余 ${catalog.length - LAYER_BRAND_IDS.size} 枚实测）`)
console.log('  仍需人工过一眼 assets/preview-dark.html 与 preview-light.html（双主题目视验收）。')
