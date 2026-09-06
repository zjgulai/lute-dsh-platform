#!/usr/bin/env node
/**
 * import-81skills.mjs — 把 81-Skills 转换为 DSH 技能并安装进 ~/.dsh/skills/
 *
 * 数据流：
 *   Magpie-Horch/81-Skills/<中文名>/SKILL.md (+references/scripts/examples/assets)
 *     + scripts/81-mapping.json（映射/分类/图标/别名）
 *   -> staging/81-skills/<english-name>/SKILL.md（DSH frontmatter + 正文改名改写）
 *   -> ~/.dsh/skills/<english-name>/（A/B 覆盖保开关，C 新建默认关模型调用）
 *   -> manifest/81-skills.json（3 新分类 + C 类新行 + A/B 覆盖行）
 *   -> staging/81-import-report.json
 *
 * 加密/损坏的 4 个（deferred）跳过并记录。
 * 用法：node scripts/import-81skills.mjs [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = "/Users/lute/project/Magpie-Horch/81-Skills";
const SKILLS_DIR = path.join(process.env.HOME, ".dsh", "skills");
const STAGING = path.join(ROOT, "staging", "81-skills");
const MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, "81-mapping.json"), "utf8"));
const DRY = process.argv.includes("--dry");

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// D1 决策：除垃圾外全量装（tests/eval-reports/.skill-meta/README/LICENSE/CHANGELOG 等全保留）
const KEEP_SUBDIRS = new Set(["references", "scripts", "examples", "assets", "tests", "eval-reports", ".skill-meta"]);
const SKIP_SUBDIRS = new Set([".doctor-backup"]);
const SKIP_TOP_FILES = /^(.*\.DS_Store|.*\.command)$/i;
const MAX_DESC = 500;

// 存量 15 个分类的中文名（与 lib/catalog.js 一致）
const EXISTING_CATEGORY_TITLES = {
  sourcing: "货源与选品",
  "research-selection": "市场调研与分析",
  design: "产品设计与视觉",
  "content-gtm": "内容创作与营销",
  brand: "品牌战略与管理",
  pr: "公关与传播",
  "social-ops": "社媒运营",
  "seo-ads": "流量获取与广告",
  "store-ops": "店铺运营与基建",
  "shipping-tariff": "物流与关税",
  "analytics-finance": "数据分析与财务",
  "crm-retention": "客户生命周期与留存",
  productivity: "文档与办公效率",
  "agent-tools": "Agent 管理与基建",
  other: "其他",
};

function jstr(v) {
  return JSON.stringify(v); // 保证 JSON 引号化、单行、转义正确
}

/** 从 81 原文提取 description 块标量/内联值，压成单行。
 *  块标量判定以「description: |」为准（不能依赖 \s* 吞换行的正则——
 *  它会误把「| 后换行 + 缩进正文」当行内标量，只取到第一行）。 */
function extractDescription(fm) {
  const lines = fm.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^description:\s*/.test(l));
  if (idx < 0) return "";
  const rest = lines[idx].replace(/^description:\s*/, "");
  if (rest.startsWith("|")) {
    // 块标量：| 同行残留 + 后续行，直到下一个顶层 key
    const out = [];
    const first = rest.replace(/^\|/, "").trim();
    if (first) out.push(first);
    for (let i = idx + 1; i < lines.length; i++) {
      if (/^[A-Za-z_][\w-]*:\s*/.test(lines[i])) break; // 下一个顶层 key
      out.push(lines[i].replace(/^-\s*/, "").trim());
    }
    return out.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  return rest.trim();
}

/** 当前已安装文件的 frontmatter 行级保留项 */
function readCurrentKeepLines(name) {
  const p = path.join(SKILLS_DIR, name, "SKILL.md");
  if (!fs.existsSync(p)) return { lines: [], exists: false };
  const text = fs.readFileSync(p, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { lines: [], exists: true };
  const keep = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (/^(disable-model-invocation|user-invocable|workflow|whenToUse):\s*/.test(line)) {
      keep.push(line);
    }
  }
  return { lines: keep, exists: true };
}

/** 把 81 内部命名改写为 DSH 英文名（按最长优先防子串误替换） */
function applyMap(text, nameMap) {
  const sorted = [...nameMap.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(esc, "g"), to);
  }
  return text;
}

/** 正文改写（跳过首行 H1 标题保持中文文档名） */
function rewriteNames(body, nameMap) {
  const lines = body.split(/\r?\n/);
  return [lines[0], ...lines.slice(1).map((l) => applyMap(l, nameMap))].join("\n");
}

function buildNameMap() {
  const map = new Map();
  for (const s of MAPPING.skills) {
    if (s.action !== "deferred") map.set(s.src, s.name);
    else map.set(s.src, s.name); // 暂缓也映射（正文可能引用它们）
  }
  for (const [k, v] of Object.entries(MAPPING.aliases)) map.set(k, v);
  return map;
}

function copySubdirs(srcDir, dstDir, problems) {
  for (const sub of fs.readdirSync(srcDir)) {
    if (sub === "SKILL.md") continue; // 已由转换写入
    const sp = path.join(srcDir, sub);
    const st = fs.statSync(sp);
    if (st.isDirectory()) {
      if (SKIP_SUBDIRS.has(sub)) continue; // 仅剔除备份类垃圾目录，其余全量装
      fs.cpSync(sp, path.join(dstDir, sub), { recursive: true });
    } else if (!SKIP_TOP_FILES.test(sub)) {
      fs.cpSync(sp, path.join(dstDir, sub));
    }
  }
}

function validateFrontmatter(text, name, problems) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) { problems.push(`${name}: 无 frontmatter`); return; }
  const fm = m[1];
  if (!NAME_RE.test(name)) problems.push(`${name}: name 非法`);
  for (const line of fm.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const mm = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!mm) { problems.push(`${name}: 非法行 → ${line.slice(0, 60)}`); continue; }
    const val = mm[2].trim();
    const isJsonStr = val.length >= 2 && val.startsWith('"') && val.endsWith('"');
    const isBool = val === "true" || val === "false";
    if (!isJsonStr && !isBool) problems.push(`${name}: 值未 JSON 引号化 → ${line.slice(0, 60)}`);
  }
}

function main() {
  const report = { ok: [], deferred: [], problems: [], manifest: { categories: [], skills: [], overrides: [] } };
  const nameMap = buildNameMap();
  const catMap = new Map(MAPPING.categories.map((c) => [c.key, c]));
  for (const [k, v] of Object.entries(EXISTING_CATEGORY_TITLES)) {
    if (!catMap.has(k)) catMap.set(k, { key: k, title: v, icon: "" });
  }

  fs.rmSync(STAGING, { recursive: true, force: true });
  fs.mkdirSync(STAGING, { recursive: true });

  for (const s of MAPPING.skills) {
    const srcFile = path.join(SRC_ROOT, s.src, "SKILL.md");
    if (s.action === "deferred") {
      report.deferred.push(s.src);
      // 覆盖行提前生效：81 标题 + 清 toolBacked 误标（内容待源文件补齐后替换）
      const upd = { name: s.name, title: s.src, icon: s.icon };
      if (s.catalogUpdate) Object.assign(upd, s.catalogUpdate);
      if (!upd.summaryZh && s.summaryZh) upd.summaryZh = s.summaryZh;
      report.manifest.overrides.push(upd);
      continue;
    }
    if (!fs.existsSync(srcFile)) { report.problems.push(`${s.src}: 源文件缺失`); continue; }
    let text;
    try { text = fs.readFileSync(srcFile, "utf8"); }
    catch (e) { report.problems.push(`${s.src}: 读取失败（${e.code || e.message}）`); continue; }

    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
    if (!m) { report.problems.push(`${s.src}: frontmatter 解析失败`); continue; }
    const fm = m[1], body = m[2] || "";

    let desc = extractDescription(fm);
    if (!desc) desc = s.src;
    // description 内的路由引用也改写（排除自身中文名，保持句子可读）
    const descMap = new Map(nameMap);
    descMap.delete(s.src);
    desc = applyMap(desc, descMap);
    if (desc.length > MAX_DESC) desc = desc.slice(0, MAX_DESC) + "…";
    desc = jstr(desc); // JSON 引号化 + 转义（JSON.stringify 已处理内部引号）

    // 开关状态：overwrite 保留现有行，否则 O1 默认（模型关、用户可调）
    const cur = s.action === "overwrite" ? readCurrentKeepLines(s.name) : { lines: [], exists: false };
    const flagLines = [];
    const hasFlag = (k) => cur.lines.some((l) => l.startsWith(k));
    if (hasFlag("disable-model-invocation")) flagLines.push(cur.lines.find((l) => l.startsWith("disable-model-invocation")));
    else flagLines.push("disable-model-invocation: true");
    if (hasFlag("user-invocable")) flagLines.push(cur.lines.find((l) => l.startsWith("user-invocable")));
    else flagLines.push("user-invocable: true");
    if (hasFlag("workflow")) flagLines.push(cur.lines.find((l) => l.startsWith("workflow")));
    if (hasFlag("whenToUse")) flagLines.push(cur.lines.find((l) => l.startsWith("whenToUse")));

    const newBody = rewriteNames(body, nameMap);
    const out = [
      "---",
      `name: ${jstr(s.name)}`,
      `title: ${jstr(s.src)}`,
      `description: ${desc}`,
      `enabled: "true"`,
      ...flagLines,
      "---",
      "",
      newBody.replace(/\s+$/, "") + "\n",
    ].join("\n");

    const dstDir = path.join(STAGING, s.name);
    fs.mkdirSync(dstDir, { recursive: true });
    fs.writeFileSync(path.join(dstDir, "SKILL.md"), out);
    copySubdirs(path.join(SRC_ROOT, s.src), dstDir, report.problems);
    validateFrontmatter(out, s.name, report.problems);

    // manifest 行
    if (s.class === "C") {
      const cat = catMap.get(s.category) || { key: s.category, title: s.category };
      let summaryZh = desc.replace(/^"|"$/g, "").replace(/\\"/g, '"');
      const firstStop = summaryZh.search(/[。；]/);
      if (firstStop > 0 && firstStop < 80) summaryZh = summaryZh.slice(0, firstStop + 1);
      else summaryZh = summaryZh.slice(0, 60);
      report.manifest.skills.push({
        name: s.name, title: s.src, category: s.category, categoryTitle: cat.title,
        toolBacked: false, summaryZh, toolGap: s.toolGap || "", icon: s.icon,
      });
    } else {
      const upd = { name: s.name, title: s.src, icon: s.icon };
      if (s.catalogUpdate) Object.assign(upd, s.catalogUpdate);
      // 摘要：从实时描述首句生成（A/B 替换后卡面语义与 81 正文对齐，不再残留旧 Accio 文案）
      let summaryZh = desc.replace(/^"|"$/g, "").replace(/\\"/g, '"');
      const firstStop = summaryZh.search(/[。；]/);
      if (firstStop > 0 && firstStop < 80) summaryZh = summaryZh.slice(0, firstStop + 1);
      else summaryZh = summaryZh.slice(0, 60);
      upd.summaryZh = summaryZh;
      report.manifest.overrides.push(upd);
    }
    report.ok.push({ src: s.src, name: s.name, class: s.class, action: s.action, created: !cur.exists && s.action === "overwrite" });
  }

  // manifest/81-skills.json
  report.manifest.categories = MAPPING.categories.map((c) => ({ key: c.key, title: c.title, icon: c.icon }));
  fs.writeFileSync(path.join(ROOT, "manifest", "81-skills.json"), JSON.stringify(report.manifest, null, 2));
  fs.writeFileSync(path.join(STAGING, "81-import-report.json"), JSON.stringify(report, null, 2));

  console.log(`OK: ${report.ok.length}  Deferred: ${report.deferred.length}  Problems: ${report.problems.length}`);
  if (report.deferred.length) console.log("Deferred:", report.deferred.join(", "));
  if (report.problems.length) console.log("Problems:\n  " + report.problems.join("\n  "));
  const created = report.ok.filter((x) => x.created);
  if (created.length) console.log("Note（目录行存在但本地无文件的 B 类，本次新建）:", created.map((x) => x.name).join(", "));

  if (!DRY) {
    // 安装：staging -> ~/.dsh/skills/
    let installed = 0;
    for (const x of report.ok) {
      const src = path.join(STAGING, x.name);
      const dst = path.join(SKILLS_DIR, x.name);
      if (!fs.existsSync(src)) continue;
      if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
      fs.cpSync(src, dst, { recursive: true });
      installed++;
    }
    console.log(`Installed: ${installed} → ~/.dsh/skills/`);
  } else {
    console.log("dry-run：未写入 ~/.dsh/skills/，staging 已生成");
  }
}

main();
