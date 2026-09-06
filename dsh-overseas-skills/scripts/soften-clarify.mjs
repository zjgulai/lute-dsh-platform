#!/usr/bin/env node
/**
 * soften-clarify.mjs — F1：把 blanket「缺材料先追问」软化为分级规则（幂等）。
 * 范围：81 系 77 个的 frontmatter description + 存量统一层正文「缺关键材料时先追问澄清，不编造。」
 * 新措辞：缺不可推定的关键材料（账号/文件/数值）才追问；可依行业惯例或品牌既定风格推定的，标注假设后继续，绝不编造数据。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(process.env.HOME, ".dsh", "skills");
const MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, "81-mapping.json"), "utf8"));
const NAMES_81 = new Set(MAPPING.skills.map((s) => s.name));
const DRY = process.argv.includes("--dry");

const NEW_CLAUSE = "缺不可推定的关键材料（账号/文件/数值）才追问；可依行业惯例或品牌既定风格推定的，标注假设后继续，绝不编造数据";
const DESC_PATTERNS = [
  /缺[^。"]{2,40}先追问[^。"]{0,40}。/g,          // description 内各种「缺…先追问…。」
  /缺材料先追问，不编造。/g,
];
const BODY_PATTERNS = [
  /^- 缺关键材料时先追问澄清，不编造。$/gm,
  /^-\s*缺材料先追问，不编造。$/gm,
];

function main() {
  const report = { desc: [], body: [], skipped: [] };
  const dirs = fs.readdirSync(SKILLS_DIR).sort();
  for (const dir of dirs) {
    const file = path.join(SKILLS_DIR, dir, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    let changed = false;
    let next = text;
    // DESC_PATTERNS 只作用于 frontmatter description 字段（此前误扫全文，
    // 会把正文「缺具体材料→追问细则」条目压成同一句，丢失区分信息）。
    if (NAMES_81.has(dir)) {
      const fm = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(next);
      if (fm) {
        let inner = fm[2];
        for (const re of DESC_PATTERNS) inner = inner.replace(re, NEW_CLAUSE + "。");
        if (inner !== fm[2]) {
          next = fm[1] + inner + fm[3] + next.slice(fm[0].length);
          changed = true;
          report.desc.push(dir);
        }
      }
    }
    for (const re of BODY_PATTERNS) {
      if (re.test(next)) { next = next.replace(re, "- " + NEW_CLAUSE + "。"); re.lastIndex = 0; changed = true; report.body.push(dir); }
    }
    if (!changed) { report.skipped.push(dir); continue; }
    if (!DRY) fs.writeFileSync(file, next);
  }
  console.log(`F1 软化: description ${new Set(report.desc).size} 个 | 正文 ${new Set(report.body).size} 个 | 未命中 ${report.skipped.length}`);
  if (DRY) console.log("dry-run：未写盘");
}
main();
