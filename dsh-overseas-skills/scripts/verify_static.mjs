#!/usr/bin/env node
/**
 * verify_static.mjs — 静态闸门（重建后 / 交付前必跑）
 * 检查：① 目录行 name 唯一 ② 图标覆盖（分类头像 + 行级回退后无空）③ 81 系 + 存量精修的路由引用无悬空
 * 退出码 0=通过，1=失败。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SKILLS_DIR = join(homedir(), ".dsh", "skills");

const catSrc = readFileSync(join(ROOT, "lib", "catalog.js"), "utf8");
const CATEGORIES = JSON.parse(/export const CATEGORIES = (\[[\s\S]*?\]);\n/.exec(catSrc)[1]);
const SKILLS = JSON.parse(/export const SKILLS = (\[[\s\S]*?\]);\n/.exec(catSrc)[1]);
const FS_M = /export const CATEGORIES_FS = (\[[\s\S]*?\]);\n/.exec(catSrc);
const CATEGORIES_FS = FS_M ? JSON.parse(FS_M[1]) : [];
const SKILLS_FS_M = /export const SKILLS_FS = (\[[\s\S]*?\]);\s*$/.exec(catSrc);
const SKILLS_FS = SKILLS_FS_M ? JSON.parse(SKILLS_FS_M[1]) : [];

const errors = [];
// ① 名字唯一
const names = SKILLS.map((s) => s.name);
if (new Set(names).size !== names.length) {
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  errors.push(`catalog 重名: ${[...new Set(dup)].join(", ")}`);
}
// ② 图标覆盖
const catIcon = new Map([...CATEGORIES, ...CATEGORIES_FS].map((c) => [c.key, c.icon]));
const noCatIcon = CATEGORIES.filter((c) => !(c.icon || "").startsWith("data:image/svg+xml;base64,"));
if (noCatIcon.length) errors.push(`无头像分组: ${noCatIcon.map((c) => c.key).join(", ")}`);
const emptyIcon = [];
for (const s of [...SKILLS, ...SKILLS_FS]) {
  const icon = s.icon || catIcon.get(s.category) || "";
  if (!icon) emptyIcon.push(s.name);
}
if (emptyIcon.length) errors.push(`无图标行: ${emptyIcon.join(", ")}`);
// ②b v3 二级结构：8 大场景 / 28 细分 / 行级 subcategory 全覆盖 / 无 preset 残留
const scenCount = CATEGORIES.length;
const subCount = CATEGORIES.reduce((n, c) => n + (c.subs || []).length, 0);
if (scenCount !== 8) errors.push(`大场景数应为 8，实际 ${scenCount}`);
if (subCount !== 28) errors.push(`细分场景数应为 28，实际 ${subCount}`);
const noSub = SKILLS.filter((s) => !s.subcategory);
if (noSub.length) errors.push(`缺 subcategory 行: ${noSub.map((s) => s.name).slice(0, 8).join(", ")}`);
const presetRows = SKILLS.filter((s) => s.category.startsWith("preset-"));
if (presetRows.length) errors.push(`preset 残留: ${presetRows.map((s) => s.name).join(", ")}`);
// ③ 路由引用悬空（union：catalog + 实际技能目录）
const dirs = new Set(readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
// v3：路由引用可指向 agent 预设（已从技能目录移出，但仍是合法目标）
let presetIds = [];
try {
  const ps = JSON.parse(readFileSync(join(ROOT, "presets", "preset-skills.json"), "utf8"));
  presetIds = (ps.presets || []).map((x) => x.id);
} catch {}
const all = new Set([...names, ...dirs, ...presetIds]);
const refineFiles = ["unify-refine-batch1.json", "unify-refine-batch2.json", "unify-refine-batch3.json"];
let refs = 0, dangling = [];
for (const f of refineFiles) {
  const p = join(ROOT, "scripts", f);
  if (!existsSync(p)) continue;
  const refine = JSON.parse(readFileSync(p, "utf8"));
  for (const [name, spec] of Object.entries(refine)) {
    for (const line of (spec.notUse || [])) {
      for (const ref of line.matchAll(/走\s*([a-z0-9-]+)/g)) {
        refs++;
        if (!all.has(ref[1])) dangling.push(`${name}→${ref[1]}`);
      }
    }
  }
}
if (dangling.length) errors.push(`悬空路由引用 ${dangling.length}: ${dangling.slice(0, 8).join(", ")}`);

if (errors.length) {
  console.error("✗ verify_static 失败:");
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
console.log(`✓ verify_static 通过：${CATEGORIES.length} 大场景/${subCount} 细分 + FS ${CATEGORIES_FS.length} 组 / ${SKILLS.length}+${SKILLS_FS.length} 行 / 名字唯一 / 图标覆盖 / ${refs} 条路由引用无悬空`);
