#!/usr/bin/env node
/**
 * 生成业务工作流 agent presets：
 *   node scripts/gen_preset.mjs [--dry-run]
 * 读 presets/workflows.json + manifest/skills.json → 写 ~/.dsh/.agent-presets/<id>/。
 * 子集 = 各分类的已导入技能（排除工具型）；preset 组合挂 dsh-skill-subset 运行时重注册实现子集隔离。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const dryRun = process.argv.includes("--dry-run");
const PRESETS_DIR = join(homedir(), ".dsh", ".agent-presets");

const workflows = JSON.parse(readFileSync(join(ROOT, "presets", "workflows.json"), "utf8")).workflows;
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest", "skills.json"), "utf8"));
const byCategory = new Map();
for (const s of manifest.skills) {
  if (!s.importable) continue;
  if (!byCategory.has(s.category)) byCategory.set(s.category, []);
  byCategory.get(s.category).push(s.name);
}

function subsetNames(categories) {
  const names = [];
  for (const c of categories) {
    for (const n of byCategory.get(c) ?? []) if (!names.includes(n)) names.push(n);
  }
  return names;
}

let order = 30;
for (const wf of workflows) {
  order += 10;
  const subset = subsetNames(wf.categories);
  const dir = join(PRESETS_DIR, wf.id);
  const presetYml = `name: ${wf.name}\ndescription: ${wf.description}\norder: ${order}\n`;
  const agentCordis = [
    `- id: persona`,
    `  name: '@deepseek-ai/dsh-persona'`,
    `  config:`,
    `    text: >-`,
    `      ${wf.persona}`,
    ``,
    `- id: skill-subset`,
    `  name: 'dsh-skill-subset'`,
    `  config:`,
    `    skills: [${subset.map((n) => `'${n}'`).join(", ")}]`,
    ``,
    `- id: agent-instructions`,
    `  name: '@deepseek-ai/dsh-agent-instructions'`,
    `  config:`,
    `    maxBytes: 65536`,
    ``,
    `- id: tool-fs`,
    `  name: '@deepseek-ai/dsh-tool-fs'`,
    ``,
    `- id: tool-fs-search`,
    `  name: '@deepseek-ai/dsh-tool-fs-search'`,
    `  config:`,
    `    sampleOverCapGlobResults: false`,
    ``,
    `- id: tool-bash`,
    `  name: '@deepseek-ai/dsh-tool-bash'`,
    `  disabled: !!js process.platform === 'win32'`,
    ``,
  ].join("\n");
  const manifestJson = JSON.stringify({
    format: "dsh-preset",
    version: 1,
    id: wf.id,
    name: wf.name,
    description: wf.description,
    sourceDshVersion: "0.1.2-alpha.1",
    subsetSkillCount: subset.length,
  }, null, 2);

  if (dryRun) {
    console.log(`[dry-run] ${wf.id}: ${subset.length} 技能（${wf.categories.join("+")}）`);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "preset.yml"), presetYml, "utf8");
  writeFileSync(join(dir, "agent.cordis.yml"), agentCordis, "utf8");
  writeFileSync(join(dir, "manifest.json"), manifestJson, "utf8");
  console.log(`[生成] ${wf.id}（${wf.name}）: ${subset.length} 技能`);
}
console.log(dryRun ? "\n（--dry-run，未写盘）" : `\n全部写入 ${PRESETS_DIR}`);
