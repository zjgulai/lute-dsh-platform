#!/usr/bin/env node
/**
 * unify-directories.mjs — 统一 ~/.dsh/skills 目录形态（D2/D3 决策）。
 * 规则（幂等，已存在的文件不覆盖）：
 *  - 全部非 81 系技能目录：生成 README.md（标题/摘要/文件结构/快速开始）
 *  - 单文件目录（无子目录）：另生成 references/README.md（从正文提取 触发词/何时使用/何时不用/安全边界/工作流 章节原文，零虚构）
 *  - 81 系 77 个：跳过（源生全量结构）
 * 用法：node scripts/unify-directories.mjs [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(process.env.HOME, ".dsh", "skills");
const DRY = process.argv.includes("--dry");

const mapping = JSON.parse(fs.readFileSync(path.join(__dirname, "81-mapping.json"), "utf8"));
const NAMES_81 = new Set(mapping.skills.map((s) => s.name));

// catalog 摘要（摘要优先，无则用 frontmatter description 首行）
const catSrc = fs.readFileSync(path.join(ROOT, "lib", "catalog.js"), "utf8");
const ROWS = JSON.parse(/export const SKILLS = (\[[\s\S]*?\]);\s*$/.exec(catSrc)[1]);
const byName = new Map(ROWS.map((r) => [r.name, r]));

function parseSkill(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const fm = m[1];
  const g = (k) => {
    const mm = new RegExp(`^${k}:\\s*"?(.+?)"?\\s*$`, "m").exec(fm);
    return mm ? mm[1].replace(/^"|"$/g, "") : "";
  };
  return { name: g("name"), title: g("title"), description: g("description"), body: m[2] || "" };
}

/** 从正文提取 81 风格章节原文（## 触发词 等） */
function extractSections(body) {
  const out = [];
  for (const sec of ["触发词", "何时使用", "何时不用", "安全边界", "工作流"]) {
    const re = new RegExp(`## ${sec}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |\\r?\\n?$)`, "m");
    const m = re.exec(body);
    if (m && m[1].trim()) out.push(`## ${sec}\n${m[1].trim()}`);
  }
  return out;
}

function main() {
  const report = { readme: [], refs: [], skipped81: 0, problems: [] };
  for (const dir of fs.readdirSync(SKILLS_DIR).sort()) {
    if (NAMES_81.has(dir)) { report.skipped81++; continue; }
    const dirPath = path.join(SKILLS_DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    const skillFile = path.join(dirPath, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    const parsed = parseSkill(fs.readFileSync(skillFile, "utf8"));
    if (!parsed) { report.problems.push(`${dir}: 解析失败`); continue; }

    const row = byName.get(dir);
    const summary = (row && row.summaryZh) || parsed.description.split(/[。\n]/)[0] || parsed.title;
    const subdirs = fs.readdirSync(dirPath).filter((s) => fs.statSync(path.join(dirPath, s)).isDirectory());
    const files = fs.readdirSync(dirPath).filter((s) => fs.statSync(path.join(dirPath, s)).isFile());

    // README.md（已存在则不覆盖）
    const readmePath = path.join(dirPath, "README.md");
    if (!fs.existsSync(readmePath)) {
      const tree = ["SKILL.md"]
        .concat(subdirs.map((s) => `${s}/`))
        .concat(files.filter((f) => f !== "SKILL.md" && !/^README/i.test(f)).map((f) => f));
      const sections = extractSections(parsed.body);
      const quickStart = sections.length > 0 ? sections[0] : `- 技能名：\`${parsed.name}\`\n- 使用方式：对话中提及「${parsed.title}」或输入 \`/${parsed.name}\``;
      const readme = [
        `# ${parsed.title || parsed.name}`,
        "",
        `> 技能名：\`${parsed.name}\``,
        "",
        summary,
        "",
        "## 快速开始",
        "",
        quickStart,
        "",
        "## 文件结构",
        "",
        "```",
        tree.map((t) => (t.endsWith("/") ? t : "  " + t)).map((t, i) => i === 0 ? `${t}` : t).join("\n"),
        "```",
        "",
      ].join("\n");
      if (!DRY) fs.writeFileSync(readmePath, readme);
      report.readme.push(dir);
    }

    // references/README.md（仅单文件目录：无任何子目录时生成）
    if (subdirs.length === 0) {
      const refDir = path.join(dirPath, "references");
      const refReadme = path.join(refDir, "README.md");
      if (!fs.existsSync(refReadme)) {
        const sections = extractSections(parsed.body);
        const content = [
          `# ${parsed.title || parsed.name} · 路由与边界速查`,
          "",
          "> 本文件由 unify-directories.mjs 从 SKILL.md 正文自动摘录（零虚构）。",
          "",
          ...(sections.length > 0 ? sections : ["- 本技能正文暂无分节边界，完整说明见 ../SKILL.md"]),
          "",
        ].join("\n");
        if (!DRY) {
          fs.mkdirSync(refDir, { recursive: true });
          fs.writeFileSync(refReadme, content);
        }
        report.refs.push(dir);
      }
    }
  }
  fs.writeFileSync(path.join(ROOT, "staging", "unify-directories-report.json"), JSON.stringify(report, null, 2));
  console.log(`README 生成: ${report.readme.length} | references 速查: ${report.refs.length} | 81系跳过: ${report.skipped81} | 问题: ${report.problems.length}`);
  if (report.problems.length) console.log("Problems:\n  " + report.problems.join("\n  "));
  if (DRY) console.log("dry-run：未写盘");
}

main();
