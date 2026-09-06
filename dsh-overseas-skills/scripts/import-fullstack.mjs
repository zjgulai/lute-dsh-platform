#!/usr/bin/env node
/**
 * import-fullstack.mjs — 安装 mattpocock AI全栈技能（稳定集 29 个）到 ~/.dsh/skills/
 * 决策依据：docs/adr/（ADR-0001~0007）
 * - frontmatter：JSON 引号化；title/description 中文（mapping.summaryZh + 触发词）；默认模型可调用（D7）
 * - 正文：优先 staging/translations/<name>.body.md（汉译），缺省回退英文原文并在报告标注
 * - 资源保真：除 SKILL.md 外全量复制（含 agents/、scripts/、template.sh、*.md）
 * - 撞名（tdd/to-spec/grill-me）：直接覆盖安装全局层（预设层旧版共存，见 ADR-0002）
 * 用法：node scripts/import-fullstack.mjs [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = "/tmp/mattpocock-skills/skills";
const SKILLS_DIR = path.join(process.env.HOME, ".dsh", "skills");
const TRANSLATIONS = path.join(ROOT, "staging", "translations");
const MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, "fullstack-mapping.json"), "utf8"));
const DRY = process.argv.includes("--dry");

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function jstr(v) { return JSON.stringify(v); }

function buildDescription(s) {
  const triggers = `触发词：${s.title}、${s.name}${s.summaryZh ? "、" + s.summaryZh : ""}。`;
  return s.summaryZh + "。" + triggers;
}

function validateFrontmatter(text, name, problems) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) { problems.push(`${name}: 无 frontmatter`); return; }
  if (!NAME_RE.test(name)) problems.push(`${name}: name 非法`);
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const mm = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!mm) { problems.push(`${name}: 非法行 ${line.slice(0, 50)}`); continue; }
    const v = mm[2].trim();
    const ok = (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) || v === "true" || v === "false";
    if (!ok) problems.push(`${name}: 值未引号化 ${line.slice(0, 50)}`);
  }
}

function main() {
  const report = { ok: [], translated: [], untranslated: [], problems: [] };
  for (const s of MAPPING.skills) {
    const srcFile = path.join(SRC_ROOT, s.src, "SKILL.md");
    if (!fs.existsSync(srcFile)) { report.problems.push(`${s.name}: 源缺失`); continue; }
    const text = fs.readFileSync(srcFile, "utf8");
    const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(text);
    const srcBody = m ? m[1] : text;

    const zhFile = path.join(TRANSLATIONS, `${s.name}.body.md`);
    let body = srcBody;
    if (fs.existsSync(zhFile)) {
      body = fs.readFileSync(zhFile, "utf8").replace(/\s+$/, "") + "\n";
      report.translated.push(s.name);
    } else {
      report.untranslated.push(s.name);
    }

    const out = [
      "---",
      `name: ${jstr(s.name)}`,
      `title: ${jstr(s.title)}`,
      `description: ${jstr(buildDescription(s))}`,
      `enabled: "true"`,
      `disable-model-invocation: false`,
      `user-invocable: true`,
      "---",
      "",
      body,
    ].join("\n");

    const dst = path.join(SKILLS_DIR, s.name);
    if (!DRY) {
      if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
      fs.mkdirSync(dst, { recursive: true });
      fs.writeFileSync(path.join(dst, "SKILL.md"), out);
      // 资源保真（含 agents/scripts/附属 md/sh）
      for (const sub of fs.readdirSync(path.dirname(srcFile))) {
        if (sub === "SKILL.md" || sub === ".DS_Store") continue;
        const sp = path.join(path.dirname(srcFile), sub);
        fs.cpSync(sp, path.join(dst, sub), { recursive: true });
      }
    }
    validateFrontmatter(out, s.name, report.problems);
    report.ok.push(s.name);
  }
  fs.writeFileSync(path.join(ROOT, "staging", "fullstack-import-report.json"), JSON.stringify(report, null, 2));
  console.log(`OK: ${report.ok.length}/29 | 已汉译: ${report.translated.length} | 未汉译(英文回退): ${report.untranslated.length} | 问题: ${report.problems.length}`);
  if (report.untranslated.length) console.log("未汉译:", report.untranslated.join(", "));
  if (report.problems.length) console.log("问题:\n  " + report.problems.join("\n  "));
  if (DRY) console.log("dry-run：未写盘");
}

main();
