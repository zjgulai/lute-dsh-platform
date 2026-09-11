#!/usr/bin/env node
/**
 * normalize-zh.mjs — 对照 zh-CN fork 的三项必采修正（幂等，只处理 AI全栈 29 个技能）
 * ① Unicode 框图 → ASCII（codebase-design/domain-modeling 树图；仅代码块内）
 * ② 中英混排标点归一（代码块外）：
 *    - 箭头 → ->、← <-
 *    - 英文标题分隔 `## X: ` → `## X - `；`# <NN>: ` → `# <NN> — `
 *    - 行尾英文词冒号 `Word:` → `Word：`
 * ③ argument-hint 补写（handoff / teach 的 frontmatter）
 * 用法：node scripts/normalize-zh.mjs [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(process.env.HOME, ".dsh", "skills");
const MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, "fullstack-mapping.json"), "utf8"));
const DRY = process.argv.includes("--dry");

const BOX_MAP = {
  "─": "-", "│": "|", "┌": "+", "┐": "+", "└": "+", "┘": "+",
  "├": "+", "┤": "+", "┬": "+", "┴": "+", "┼": "+", "─": "-",
};
const ARGUMENT_HINTS = {
  handoff: "下一个会话将用于什么？",
  teach: "你想学习什么？",
};

function normalizeBody(body) {
  body = body.replace(/^## (阶段 6|Phase 6)[：:]\s*(清理|Cleanup)\s*$/m, "## $1 - $2 + 事后复盘");
  const lines = body.split("\n");
  const out = [];
  let inCode = false;
  for (const line of lines) {
    const fence = /^```/.test(line.trim());
    if (fence) { out.push(line); inCode = !inCode; continue; }
    if (inCode) {
      let l = line;
      for (const [u, a] of Object.entries(BOX_MAP)) l = l.split(u).join(a);
      l = l.replace(/→/g, "->").replace(/←/g, "<-");
      out.push(l);
    } else {
      let l = line;
      l = l.replace(/→/g, "->").replace(/←/g, "<-");
      l = l.replace(/^## ([A-Za-z][A-Za-z0-9 ,'’/&+-]+): (.*)$/, "## $1 - $2");
      l = l.replace(/^# (<?[A-Za-z0-9-]+>?): (.*)$/, "# $1 — $2");
      l = l.replace(/([A-Za-z]{2,}):\s*$/, "$1：");
      out.push(l);
    }
  }
  return out.join("\n");
}

function main() {
  const report = { bodyChanged: [], hintAdded: [], unchanged: [] };
  for (const s of MAPPING.skills) {
    const file = path.join(SKILLS_DIR, s.name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, "utf8");
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
    if (!m) continue;
    let fm = m[1];
    const newBody = normalizeBody(m[2]);
    let changed = newBody !== m[2];
    // argument-hint
    if (ARGUMENT_HINTS[s.name] && !/^argument-hint:/m.test(fm)) {
      const hint = ARGUMENT_HINTS[s.name];
      const lines = fm.split("\n");
      const descIdx = lines.findIndex((l) => l.startsWith("description:"));
      lines.splice(descIdx + 1, 0, `argument-hint: ${JSON.stringify(hint)}`);
      fm = lines.join("\n");
      changed = true;
      report.hintAdded.push(s.name);
    }
    if (!changed) { report.unchanged.push(s.name); continue; }
    if (!DRY) fs.writeFileSync(file, "---\n" + fm + "\n---\n" + newBody);
    report.bodyChanged.push(s.name);
  }
  console.log(`归一化: 改动 ${report.bodyChanged.length} 个 | 补 argument-hint: ${report.hintAdded.length} | 无变化 ${report.unchanged.length}`);
  console.log("  改动:", report.bodyChanged.join(", "));
  if (DRY) console.log("dry-run：未写盘");
}

main();
