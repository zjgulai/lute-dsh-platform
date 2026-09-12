/**
 * 端到端验收：用真实会话存储驱动真实插件（apply + 三个工具），验证账本可算、闸门可判。
 * 只读：mock controller 从磁盘 zstd 会话文件还原 events，不写任何会话。
 * 运行：node scripts/e2e-live.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { apply } from "../lib/index.js";

const SESSIONS_ROOT =
  process.env.CG_E2E_ROOT ||
  path.join(os.homedir(), ".dsh/sessions/--Users-lute-project-Magpie-Horch--");
const MAX = Number(process.env.CG_E2E_MAX || 5000);

/** 把 session.jsonl.zstd 还原成 host inspect() 形状的事件数组（保留计费与工具形态两类事件）。 */
function loadEvents(file) {
  let raw;
  try {
    raw = execFileSync("unzstd", ["-c", file], { maxBuffer: 1 << 30 });
  } catch {
    return null;
  }
  const events = [];
  let meta = {};
  for (const line of raw.toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type === "session") {
      meta = { createdAt: o.createdAt, cwd: o.cwd, agentPreset: o.agentPreset, origin: o.origin };
    }
    // 必须保留 assistant/message：工具调用形态只在这个事件里，丢了它"机械活"判据恒为 0。
    if (o.type === "request/header" || o.type === "assistant/chunk" || o.type === "assistant/message") events.push(o);
  }
  return { events, meta };
}

const dirs = fs
  .readdirSync(SESSIONS_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
// 注意：早期版本在这里做了 .slice(0, MAX)，而 readdir 的顺序是字典序，
// 结果把字典序靠后的最贵会话（session-ff38…）整条切掉了，扫出来的账单凭空少一半。
// 需要限量时必须按 mtime 排序后再截断，且上限要宽容到覆盖全量。
const limited = dirs.slice(0, MAX);

const store = new Map();
const rows = [];
for (const d of limited) {
  const f = path.join(SESSIONS_ROOT, d, "session.jsonl.zstd");
  if (!fs.existsSync(f)) continue;
  const loaded = loadEvents(f);
  if (!loaded) continue;
  const stat = fs.statSync(f);
  store.set(d, loaded);
  rows.push({
    sessionId: d,
    cwd: "/Users/lute/project/Magpie-Horch",
    updatedAt: stat.mtimeMs,
    blank: false,
    running: false,
    origin: loaded.meta.origin ?? "root",
    agentPreset: loaded.meta.agentPreset ?? null,
    parentSessionId: null,
    projections: { title: d.slice(0, 16) }
  });
}

const controller = {
  async list() {
    return { items: rows };
  },
  async inspect(sessionId) {
    const s = store.get(sessionId);
    if (!s) throw new Error(`session not found: ${sessionId}`);
    return { meta: s.meta, events: s.events };
  }
};

const registered = new Map();
const ctx = { sessionController: controller, tools: { register: (t) => registered.set(t.name, t) } };
// 账本写到临时目录，不污染真实 DSH_HOME
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "cg-e2e-"));
process.env.DSH_HOME = tmpHome;

apply(ctx, { limits: { sessionUsd: 5, taskUsd: 1, dayUsd: 10 }, compactKeepTokens: 100000, maxSessions: 2000 });

const names = [...registered.keys()].sort();
console.log(`sessions in store = ${store.size}`);
console.log(`tools registered  = ${names.join(", ")}`);
if (names.join(",") !== "cg_budget,cg_scan,cg_verdict") {
  console.error("FAIL: tool set mismatch");
  process.exit(1);
}

const scan = await registered.get("cg_scan").execute({ topN: 8 });
console.log("\n=== cg_scan ===");
console.log(JSON.stringify({ totals: scan.totals, levers: scan.levers, thresholds: scan.thresholds }, null, 2));
console.log("\nrunaway:", JSON.stringify(scan.runaway, null, 2));
console.log("\ntopSessions:");
for (const s of scan.topSessions) {
  console.log(
    `  ${s.sessionId.slice(0, 16)} preset=${String(s.preset).slice(0, 22).padEnd(22)} calls=${String(s.calls).padStart(5)} hit%=${String(s.cacheHitRate).padStart(5)} $/call=${String(s.costPerCall).padStart(7)} $${String(s.cost).padStart(7)} compact=$${s.compactSaving} ${s.runaway ? "FLAG:" + s.flags.join("|") : ""}`
  );
}
console.log("\nbyModel:");
for (const m of scan.byModel) {
  console.log(
    `  ${m.model.padEnd(32)} calls=${String(m.calls).padStart(6)} hit%=${String(m.cacheHitRate).padStart(5)} $${String(m.cost).padStart(8)} ${String(m.costShare).padStart(5)}%`
  );
}

const verdict = await registered.get("cg_verdict").execute({ sinceDays: 0, targetShare: 0.5 });
console.log("\n=== cg_verdict ===");
console.log(JSON.stringify(verdict, null, 2));

const budget = await registered.get("cg_budget").execute({ sessionId: scan.topSessions[0].sessionId });
console.log("\n=== cg_budget (最贵会话) ===");
console.log(JSON.stringify(budget, null, 2));

const ledger = path.join(tmpHome, "cost-guard", "ledger.jsonl");
console.log(`\nledger written: ${fs.existsSync(ledger)} (${ledger})`);
console.log(`ledger lines: ${fs.readFileSync(ledger, "utf8").trim().split("\n").length}`);

const ok =
  scan.totals.calls > 0 &&
  scan.levers.combined.savingShare > 0 &&
  budget.ok === true &&
  fs.existsSync(ledger);
console.log(`\nE2E ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
