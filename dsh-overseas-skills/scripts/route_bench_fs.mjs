#!/usr/bin/env node
/** AI全栈词法路由：以 catalog.js FS 双常量 + 海外行为词库，对 eval/routing-benchmark-fs.json 打分。 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const bench = JSON.parse(readFileSync(join(ROOT, "eval", "routing-benchmark-fs.json"), "utf8"));
const catSrc = readFileSync(join(ROOT, "lib", "catalog.js"), "utf8");
const skills = JSON.parse(/export const SKILLS_FS = (\[[\s\S]*?\]);\s*$/.exec(catSrc)[1]);
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
  strict += rank === 1 ? 1 : 0; loose += rank <= 3 ? 1 : 0; sumRank += rank;
  if (rank > 3) fails.push({ q: c.query.slice(0, 28), expect: c.expect, rank });
}
const n = bench.cases.length;
console.log(`AI全栈词法基准 | 用例 ${n} | Top-1 ${((strict / n) * 100).toFixed(0)}% | Top-3 ${((loose / n) * 100).toFixed(0)}% | 平均排名 ${(sumRank / n).toFixed(2)}`);
for (const f of fails) console.log(" -", f.q, "→", f.expect, `(排名${f.rank})`);
