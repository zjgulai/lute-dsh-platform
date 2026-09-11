#!/usr/bin/env node
/** 全目录词法路由基准：以 lib/catalog.js 228 行为词库，对 eval/routing-benchmark-full.json 打分。 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const bench = JSON.parse(readFileSync(join(ROOT, "eval", "routing-benchmark-full.json"), "utf8"));
const catSrc = readFileSync(join(ROOT, "lib", "catalog.js"), "utf8");
const skills = JSON.parse(/export const SKILLS = (\[[\s\S]*?\]);\n/.exec(catSrc)[1]);
const tokens = (t) => new Set(String(t).toLowerCase().match(/[\u4e00-\u9fa5]|[a-z0-9]+/g) ?? []);
let strict = 0, loose = 0, sumRank = 0;
const fails = [];
for (const c of bench.cases) {
  const q = tokens(c.query);
  const scored = skills.map((s) => {
    const doc = new Set([...tokens(s.title), ...tokens(s.summaryZh || "")]);
    let hit = 0;
    for (const tok of q) if (doc.has(tok)) hit += 1;
    return [s.name, hit];
  });
  scored.sort((a, b) => b[1] - a[1]);
  const rank = scored.findIndex(([n]) => n === c.expect) + 1;
  strict += rank === 1 ? 1 : 0;
  loose += rank <= 3 ? 1 : 0;
  sumRank += rank;
  if (rank > 3) fails.push({ q: c.query, expect: c.expect, rank, top: scored.slice(0, 3).map(([n]) => n), difficulty: c.difficulty });
}
const ts = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(join(ROOT, "eval", "runs"), { recursive: true });
writeFileSync(join(ROOT, "eval", "runs", `${ts}-lexical-full.json`), JSON.stringify({ total: bench.cases.length, strictTop1: strict, looseTop3: loose, avgRank: +(sumRank / bench.cases.length).toFixed(2), fails }, null, 2));
const n = bench.cases.length;
console.log(`全目录词法基准 | 用例 ${n} | Top-1: ${((strict / n) * 100).toFixed(1)}% | Top-3: ${((loose / n) * 100).toFixed(1)}% | 平均排名 ${(sumRank / n).toFixed(2)} | 未进Top-3: ${fails.length}`);
for (const f of fails.slice(0, 10)) console.log(` - ${f.q.slice(0, 30)} → ${f.expect}（排名 ${f.rank}）`);
