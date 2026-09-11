#!/usr/bin/env node
/**
 * 词法快筛（v2 schema）：严格（精确技能）+ 宽松（同 cluster）。
 * 结果写入 eval/runs/<时间戳>-lexical.json。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const benchmark = JSON.parse(readFileSync(join(ROOT, "eval", "routing-benchmark.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest", "skills.json"), "utf8"));
const skills = new Map();
for (const s of manifest.skills) {
  if (!s.importable) continue;
  skills.set(s.name, { title: s.title, summaryZh: s.summaryZh || "", category: s.category, description: s.description || "" });
}
try {
  const ps = JSON.parse(readFileSync(join(ROOT, "presets", "preset-skills.json"), "utf8"));
  for (const p of ps.presets) {
    for (const s of p.skills) {
      skills.set(s.name, { title: s.title, summaryZh: s.descriptionZh || "", category: "preset-" + p.id, description: s.descriptionZh || "" });
    }
  }
} catch (e) { /* preset 目录缺失时继续 */ }
try {
  const mk = JSON.parse(readFileSync(join(ROOT, "manifest", "marketing-skills.json"), "utf8"));
  for (const s of mk.skills) {
    skills.set(s.name, { title: s.title, summaryZh: s.summaryZh || "", category: s.category, description: s.summaryZh || "" });
  }
} catch (e) { /* 营销目录缺失时继续 */ }

function tokens(text) {
  return new Set(String(text).toLowerCase().match(/[\u4e00-\u9fa5]|[a-z0-9]+/g) ?? []);
}

let strict = 0, loose = 0, total = 0, sumRank = 0;
const fails = [];
for (const c of benchmark.cases) {
  const q = tokens(c.query);
  const scored = [];
  for (const [name, s] of skills) {
    const doc = new Set([...tokens(s.title), ...tokens(s.summaryZh), ...tokens(s.description)]);
    let hit = 0;
    for (const tok of q) if (doc.has(tok)) hit += 1;
    scored.push([name, hit]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const rank = scored.findIndex(([n]) => n === c.expect) + 1;
  const ok = rank === 1;
  const okLoose = rank <= 3;
  total += 1; sumRank += rank;
  if (ok) strict += 1;
  if (okLoose) loose += 1;
  else fails.push({ query: c.query, expect: c.expect, rank, difficulty: c.difficulty });
}
const report = {
  schema: "lexical-run.v1",
  total,
  strictTop1: strict,
  looseTop3: loose,
  avgRank: +(sumRank / total).toFixed(2),
  fails,
};
const ts = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(join(ROOT, "eval", "runs"), { recursive: true });
writeFileSync(join(ROOT, "eval", "runs", `${ts}-lexical.json`), JSON.stringify(report, null, 2));
const presetCount = benchmark.cases.filter((c) => String(c.cluster || "").startsWith("preset-")).length;
console.log(`词法快筛 | 用例 ${total}（含 preset ${presetCount} 条，LLM 档为准）| Top-1: ${((strict / total) * 100).toFixed(1)}% | Top-3: ${((loose / total) * 100).toFixed(1)}% | 平均排名 ${report.avgRank}`);
console.log(`报告: eval/runs/${ts}-lexical.json | 未进 Top-3: ${fails.length} 条`);
for (const f of fails.slice(0, 8)) console.log(" -", f.query, "->", f.expect, `(排名 ${f.rank})`);
