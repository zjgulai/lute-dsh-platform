#!/usr/bin/env node
/**
 * unify-refine.mjs — 精修层：用人工校准的路由边界替换批量层生成的「## 何时不用」内容。
 * 只动 <!-- 81-style-unified:batch --> 标记之后由批量层追加的区块，原文与前部结构不动。
 * 用法：node scripts/unify-refine.mjs <refine.json> [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(process.env.HOME, ".dsh", "skills");
const [refinePath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");

const refine = JSON.parse(fs.readFileSync(path.resolve(__dirname, refinePath), "utf8"));

function replaceSection(text, title, newLines) {
  // 定位 "## <title>" 起始行到下一个 "## " 或结尾
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`## ${esc}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |\\r?\\n?$)`, "m");
  if (!re.test(text)) return null;
  return text.replace(re, `## ${title}\n${newLines.join("\n")}`);
}

function main() {
  const report = { refined: [], missing: [], noMarker: [], noSection: [] };
  for (const [name, spec] of Object.entries(refine)) {
    const file = path.join(SKILLS_DIR, name, "SKILL.md");
    if (!fs.existsSync(file)) { report.missing.push(name); continue; }
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("<!-- 81-style-unified:batch -->")) { report.noMarker.push(name); continue; }
    const notUse = Array.isArray(spec.notUse) ? spec.notUse.map((l) => "- " + l) : [];
    const safety = Array.isArray(spec.safety) ? spec.safety.map((l) => "- " + l) : [];
    let next = replaceSection(text, "何时不用", notUse);
    if (next === null) { report.noSection.push(name); continue; }
    if (safety.length > 0) next = replaceSection(next, "安全边界", safety);
    next = next.replace("<!-- 81-style-unified:batch -->", "<!-- 81-style-unified:refined -->");
    if (!DRY) fs.writeFileSync(file, next);
    report.refined.push(name);
  }
  console.log(`精修: ${report.refined.length}  缺文件: ${report.missing.length}  无标记: ${report.noMarker.length}  无章节: ${report.noSection.length}`);
  if (report.missing.length) console.log("缺文件:", report.missing.join(", "));
  if (report.noMarker.length) console.log("无标记:", report.noMarker.join(", "));
  if (report.noSection.length) console.log("无章节:", report.noSection.join(", "));
}

main();
