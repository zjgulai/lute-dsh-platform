#!/usr/bin/env node
/**
 * LLM 档路由评测聚合（v2）：读取 eval/llm-picks.jsonl（每行一组 JSON 数组），
 * 与 benchmark v2 期望比对。query 键归一化（给/帮、空白差异容忍）。
 * 输出严格/宽松命中率，报告写入 eval/runs/<时间戳>-llm.json，并与上一轮 LLM 报告 diff 回归。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const benchmark = JSON.parse(readFileSync(join(ROOT, "eval", "routing-benchmark.json"), "utf8"));
const runsDir = join(ROOT, "eval", "runs");
mkdirSync(runsDir, { recursive: true });

const norm = (s) => String(s).replace(/给/g, "帮").replace(/\s+/g, "");

const picksFile = join(ROOT, "eval", "llm-picks.jsonl");
let picks = [];
try {
  for (const line of readFileSync(picksFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    for (const item of JSON.parse(line)) picks.push(item);
  }
} catch (e) {
  console.error("无法读取 llm-picks.jsonl:", e.message);
  process.exit(1);
}
const byQuery = new Map(picks.map((p) => [norm(p.q), p.pick]));

let strict = 0, loose = 0, total = 0;
const fails = [];
const perCase = [];
for (const c of benchmark.cases) {
  const pick = byQuery.get(norm(c.query));
  total += 1;
  const okStrict = pick === c.expect;
  const okLoose = okStrict || (pick !== undefined && c.cluster && (() => {
    // 同分类视为宽松命中
    const expCat = c.cluster;
    const manifest = JSON.parse(readFileSync(join(ROOT, "manifest", "skills.json"), "utf8"));
    let presetSkills = [];
    try {
      const ps = JSON.parse(readFileSync(join(ROOT, "presets", "preset-skills.json"), "utf8"));
      presetSkills = ps.presets.flatMap((p) => p.skills.map((s) => ({ name: s.name, category: "preset-" + p.id })));
    } catch (e) { /* preset 目录缺失时按海外目录判定 */ }
    const byName = new Map([...manifest.skills.map((s) => [s.name, s.category]), ...presetSkills.map((s) => [s.name, s.category])]);
    return byName.get(pick) === expCat;
  })());
  if (okStrict) strict += 1;
  if (okLoose) loose += 1;
  else fails.push({ query: c.query, expect: c.expect, pick: pick ?? "(无返回)", difficulty: c.difficulty });
  perCase.push({ q: c.query, expect: c.expect, pick: pick ?? null, okStrict, difficulty: c.difficulty });
}

const report = {
  schema: "llm-run.v1",
  total,
  strictHit: strict,
  looseHit: loose,
  strictPct: +((strict / total) * 100).toFixed(1),
  loosePct: +((loose / total) * 100).toFixed(1),
  fails,
};
const ts = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(runsDir, `${ts}-llm.json`), JSON.stringify(report, null, 2));

console.log(`LLM 档评测 | 用例 ${total}`);
console.log(`严格命中: ${strict}/${total} = ${report.strictPct}% | 宽松命中: ${loose}/${total} = ${report.loosePct}%`);

// 与上一轮 LLM 报告 diff（回归）
const prev = readdirSync(runsDir)
  .filter((f) => f.endsWith("-llm.json") && f !== `${ts}-llm.json`)
  .sort()
  .pop();
if (prev) {
  const p = JSON.parse(readFileSync(join(runsDir, prev), "utf8"));
  const prevFails = new Set((p.fails ?? []).map((f) => norm(f.query)));
  const regressed = report.fails.filter((f) => !prevFails.has(norm(f.query)));
  const recovered = (p.fails ?? []).filter((f) => !report.fails.some((x) => norm(x.query) === norm(f.query)));
  console.log(`\n对比上一轮（${prev}）：新增失败 ${regressed.length} 条 / 修复 ${recovered.length} 条`);
  for (const r of regressed) console.log("  REGRESS:", r.query);
  for (const r of recovered) console.log("  FIXED:", r.query);
} else {
  console.log("\n（首轮 LLM 报告，无历史对比）");
}
if (fails.length) {
  console.log(`\n未命中 ${fails.length} 条：`);
  for (const f of fails) console.log(` - [${f.difficulty}] ${f.query} -> 期望 ${f.expect}，实选 ${f.pick}`);
}
console.log(`\n报告: eval/runs/${ts}-llm.json`);
