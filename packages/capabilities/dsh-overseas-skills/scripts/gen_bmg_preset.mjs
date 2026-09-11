#!/usr/bin/env node
/**
 * gen_bmg_preset.mjs — 从 81-mapping.json 重新生成「品牌营销增长官」preset 三件套。
 * 白名单 = 映射全部 81 名（含 4 暂缓占位）；icon 沿用当前 preset.yml 的 LUTE 头像。
 * 使预设可复现（与 81-mapping 单一事实源对齐）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const mapping = JSON.parse(readFileSync(join(ROOT, "scripts", "81-mapping.json"), "utf8"));
const names = mapping.skills.map((s) => s.name);
const DIR = join(homedir(), ".dsh", ".agent-presets", "brand-marketing-growth");
mkdirSync(DIR, { recursive: true });

// 保留现有 icon（预设头像，不重建）
let icon = "";
try {
  const yml = readFileSync(join(DIR, "preset.yml"), "utf8");
  const m = /icon: '([^']+)'/.exec(yml);
  if (m) icon = m[1];
} catch (e) { /* 首次生成 */ }
if (!icon) {
  // 回退：从 lute manifest 取「营销操盘手」头像
  const lute = JSON.parse(readFileSync(join(homedir(), ".dsh", "skills", "lute-brand-icons", "assets", "manifest.json"), "utf8"));
  const m = lute.find((x) => x.id === "marketing");
  if (m) icon = m.icon;
}

const presetYml = `name: 品牌营销增长官
description: 品牌战略、GTM 规划、内容增长、SEO/广告流量与电商转化的全链路增长操盘。
order: 60
icon: '${icon}'
`;
const manifest = {
  format: "dsh-preset",
  version: 1,
  id: "brand-marketing-growth",
  name: "品牌营销增长官",
  description: "品牌战略、GTM 规划、内容增长、SEO/广告流量与电商转化的全链路增长操盘。",
  sourceDshVersion: "0.1.2-alpha.1",
  subsetSkillCount: names.length,
  icon,
};
const namesYaml = names.map((n) => `'${n}'`).join(", ");
const agent = `- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      你是品牌营销增长官：以品牌为核心、增长为目标的营销操盘手。六条主线：① 品牌战略（定位、品牌声音、叙事与视觉）；② GTM 规划（上市策略、渠道与受众）；③ 内容增长（社媒、文案、视频、邮件序列）；④ 流量获取（SEO、GEO、多语言 SEO、付费广告）；⑤ 电商转化（Listing、价格、大促与 CRO）；⑥ 数据驱动复盘（电商分析、市场调研、竞品情报）。优先使用本预设加载的技能，产出可直接执行的策略、文案、清单与复盘，缺材料先追问不编造。

- id: skill-subset
  name: 'dsh-skill-subset'
  config:
    skills: [${namesYaml}]
    respectFileFlags: true

- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536

- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'

- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false

- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
`;

writeFileSync(join(DIR, "preset.yml"), presetYml);
writeFileSync(join(DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
writeFileSync(join(DIR, "agent.cordis.yml"), agent);
console.log(`✓ 预设已重新生成：${DIR}（白名单 ${names.length} 名，icon ${icon ? "保留" : "回退"}）`);
