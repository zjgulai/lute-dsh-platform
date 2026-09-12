#!/usr/bin/env node
/**
 * 生成 `lib/layer-icons.js` —— 4 面 + 8 责任域共 12 枚层头像。
 *
 * 头像的艺术源是 lute-brand-icons 技能（LUTE 品牌方形徽章家族）发布在
 * `assets/manifest.json` 里的清单；本包只**挑出这 12 条烘焙进来**，页面因此
 * 不依赖品牌技能是否安装在目标机器上——与 `lib/catalog.js` 里场景图标的做法一致。
 *
 * 与 `dsh-algo-skills-local`（算法技能页）**同源**：两边都从同一份品牌清单里按
 * 同一组 brandId 取图，且本包测试跨包断言 12 条 data URI 逐字节相等（漂移即红）。
 *
 * 用法：
 *   node scripts/gen-layer-icons.mjs                 # 读品牌技能清单
 *   BRAND_MANIFEST=<path> node scripts/gen-layer-icons.mjs
 *
 * 退出码：0 = 已写入；1 = 缺图或格式不符（绝不写半份文件）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "lib", "layer-icons.js");
const MANIFEST =
  process.env.BRAND_MANIFEST ?? join(homedir(), ".dsh", "skills", "lute-brand-icons", "assets", "manifest.json");

/** 品牌清单条目 id → 组织骨架键（与算法技能页逐字一致）。 */
const LAYER_MAP = [
  ["pln-mgt", "PLN-MGT", "经营管理"],
  ["pln-ops", "PLN-OPS", "业务运营"],
  ["pln-ctl", "PLN-CTL", "独立控制"],
  ["pln-plt", "PLN-PLT", "数据与Agent平台"],
  ["dom-01", "DOM-01", "经营与组织"],
  ["dom-02", "DOM-02", "产品与创新"],
  ["dom-03", "DOM-03", "供应与履约"],
  ["dom-04", "DOM-04", "渠道经营"],
  ["dom-05", "DOM-05", "品牌与增长"],
  ["dom-06", "DOM-06", "服务与体验"],
  ["dom-07", "DOM-07", "财务与合规"],
  ["dom-08", "DOM-08", "数据与AI运行"],
];

let entries;
try {
  entries = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (error) {
  console.error(`✗ 读不到品牌头像清单 ${MANIFEST}：${error instanceof Error ? error.message : String(error)}`);
  console.error("  先跑 lute-brand-icons 的 `node scripts/build.js`，或用 BRAND_MANIFEST=<path> 指定。");
  process.exit(1);
}
if (!Array.isArray(entries)) {
  console.error(`✗ ${MANIFEST} 不是数组（品牌清单格式已变？）`);
  process.exit(1);
}
const byId = new Map(entries.map((entry) => [entry?.id, entry]));

const rows = [];
const missing = [];
for (const [brandId, key, label] of LAYER_MAP) {
  const icon = typeof byId.get(brandId)?.icon === "string" ? byId.get(brandId).icon : "";
  if (!icon.startsWith("data:image/svg+xml;base64,")) {
    missing.push(`${brandId} → ${key}（${label}）`);
    continue;
  }
  rows.push({ key, brandId, label, icon });
}
if (missing.length > 0) {
  console.error(`✗ 品牌清单缺 ${missing.length} 枚层头像：\n  ${missing.join("\n  ")}`);
  console.error("  在 lute-brand-icons 的 scripts/catalog.js 补齐条目后重跑 node scripts/build.js。");
  process.exit(1);
}

const body = rows
  .map((row) => `  // ${row.label}　← lute-brand-icons「${row.brandId}」\n  ${JSON.stringify(row.key)}: ${JSON.stringify(row.icon)},`)
  .join("\n");

const text = `/**
 * 层头像：4 面 + 8 责任域，共 12 枚。
 *
 * 本文件由 \`node scripts/gen-layer-icons.mjs\` 生成——**不要手改**。
 * 与 \`dsh-algo-skills-local\` 同源同字节（同一份品牌清单、同一组 brandId）；
 * 本包测试会跨包断言两边逐字节相等。改图标请改品牌技能的 catalog.js，
 * 重跑它的 build.js，再回到本包重跑生成脚本。
 */

/** 组织骨架键 → 头像 data URI（base64 SVG）。 */
export const LAYER_ICONS = {
${body}
};

/** 生成来源清单，供页面页脚回溯。 */
export const LAYER_ICON_SOURCES = [
${rows.map((row) => `  { key: ${JSON.stringify(row.key)}, brandId: ${JSON.stringify(row.brandId)}, label: ${JSON.stringify(row.label)} },`).join("\n")}
];
`;

writeFileSync(OUT, text);
console.log(`✓ 写入 ${OUT}（${rows.length} 枚：4 面 + 8 责任域，源 ${MANIFEST}）`);
