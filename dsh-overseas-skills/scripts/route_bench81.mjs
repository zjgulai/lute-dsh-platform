#!/usr/bin/env node
/** 81 系路由词法快筛：以 lib/catalog.js 终版（228 行）为词库，对 eval/routing-benchmark-81.json 打分。 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const bench = JSON.parse(readFileSync(join(ROOT, "eval", "routing-benchmark-81.json"), "utf8"));
const catSrc = readFileSync(join(ROOT, "lib", "catalog.js"), "utf8");
const skills = JSON.parse(/export const SKILLS = (\[[\s\S]*?\]);\s*$/.exec(catSrc)[1]);
const byName = new Map(skills.map((s) => [s.name, s]));
function tokens(t) { return new Set(String(t).toLowerCase().match(/[\u4e00-\u9fa5]|[a-z0-9]+/g) ?? []); }
let strict = 0, loose = 0, sumRank = 0;
const fails = [];
for (const c of bench.cases) {
  const q = tokens(c.query);
  const scored = [];
  for (const s of skills) {
    const doc = new Set([...tokens(s.title), ...tokens(s.summaryZh || "")]);
    let hit = 0;
    for (const tok of q) if (doc.has(tok)) hit += 1;
    scored.push([s.name, hit]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const rank = scored.findIndex(([n]) => n === c.expect) + 1;
  const ok = rank === 1, okL = rank <= 3;
  strict += ok ? 1 : 0; loose += okL ? 1 : 0; sumRank += rank;
  if (!okL) fails.push({ q: c.query, expect: c.expect, rank, top: scored.slice(0, 3).map(([n]) => n) });
}
const ts = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(join(ROOT, "eval", "runs"), { recursive: true });
writeFileSync(join(ROOT, "eval", "runs", `${ts}-lexical-81.json`), JSON.stringify({ total: bench.cases.length, strictTop1: strict, looseTop3: loose, avgRank: +(sumRank / bench.cases.length).toFixed(2), fails }, null, 2));
console.log(`81 系词法快筛 | 用例 ${bench.cases.length} | Top-1: ${((strict / bench.cases.length) * 100).toFixed(1)}% | Top-3: ${((loose / bench.cases.length) * 100).toFixed(1)}% | 平均排名 ${(sumRank / bench.cases.length).toFixed(2)}`);
for (const f of fails) console.log(` - ${f.q} → 期望 ${f.expect}（排名 ${f.rank}，前三: ${f.top.join("/")}）`);
