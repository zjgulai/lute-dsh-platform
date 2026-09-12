/**
 * dsh-cost-guard — 大模型调用成本看板与预算闸门（host-only，常驻工具）。
 *
 * 为什么需要它：会话里每一笔模型调用的 token 计量都已经写进 DSH 事件流
 * （request/header 的 model + assistant/chunk 的 usage），但没有任何界面把它换算成钱。
 * 于是"账单超预算"和"钱花在哪"之间缺了一层可审计的账本，压缩/降档/限流这类动作也就无从下手。
 * 本插件把事件流直接折算成钱，并把三个决定账单的开关暴露成可调参数。
 *
 * 工具：
 *  - cg_scan    成本归因扫描：按日/按模型/按会话给出花费排名、缓存命中率、峰谷占比，
 *               并直接算出三条下行路径各自能省多少（降档路由 / 上下文压缩 / 谷时排程）。
 *  - cg_budget  预算闸门：给定会话 id，回报已花费与是否越过阈值，供长任务上手前判停。
 *  - cg_verdict 结论出口：把扫描结果压成一段可直接执行的结论 + 阈值清单。
 *
 * 口径要点（详见 lib/rates.js）：
 *  - 命中价只有未命中价的 1/31，所以决定账单的是「未命中 token × 调用次数」，不是漂亮的命中率；
 *  - DeepSeek 官方线路自 2026-08-16 起分峰谷，峰时 ×2，周末全天按谷时（北京时间 09–12、14–18 为峰）；
 *  - 非 DeepSeek 线路单价随供应商变动，默认标记 estimated，可用 config.overrides 换成你的合同价。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { rateFor, bandOf } from "./rates.js";
import {
  collectCalls,
  rerouteSavings,
  compactSavings,
  combinedLevers,
  RUNAWAY_CALLS,
  COST_PER_CALL_USD,
  CACHE_HIT_FLOOR
} from "./aggregate.js";

const name = "dsh-cost-guard";
const inject = ["sessionController", "tools"];

/** 默认预算闸门（USD，单价口径见 lib/rates.js）。 */
const DEFAULT_LIMITS = {
  sessionUsd: 5,
  taskUsd: 1,
  dayUsd: 10
};
/** 默认上下文保留上限（token）：超过它触发压缩，收益按 compactSavings 计算。 */
const DEFAULT_COMPACT_KEEP = 100000;
/**
 * 落地口径的两个保守系数（"机械活"判定与分流比例）。
 * 离线只能看到 token 结构，看不到每一步的语义，所以必须留出误伤预算：
 * 不假设所有贵档调用都能换掉，只把满足"多调用 + 小输出 + 高命中"的会话按高比例分流。
 */
const MECHANICAL_OUTPUT_PER_CALL = 1000;
const MECHANICAL_TOOL_RATIO = 0.5;
const MECHANICAL_MIN_CACHE_HIT = 0.7;
const MECHANICAL_RETIRE = 0.9;
const JUDGMENT_RETIRE = 0.3;

function errorMessage(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}

function usd(n) {
  return Math.round(Number(n || 0) * 10000) / 10000;
}

function pct(n) {
  return Math.round(Number(n || 0) * 1000) / 10;
}

function dayKeyOf(epochMs) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return "unknown";
  const d = new Date(epochMs);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function ledgerPath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  return path.join(home, "cost-guard", "ledger.jsonl");
}

function readLedgerTail(maxLines) {
  try {
    const p = ledgerPath();
    if (!fs.existsSync(p)) return [];
    const lines = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "");
    return lines.slice(-maxLines).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function appendLedger(entry) {
  try {
    const p = ledgerPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + "\n", "utf8");
    return p;
  } catch (e) {
    return `(账本写入失败: ${errorMessage(e)})`;
  }
}

export function apply(ctx, config) {
  const controller = ctx.sessionController;
  const cfg = config && typeof config === "object" ? config : {};
  const overrides = cfg.overrides && typeof cfg.overrides === "object" ? cfg.overrides : undefined;
  const limits = { ...DEFAULT_LIMITS, ...(cfg.limits && typeof cfg.limits === "object" ? cfg.limits : {}) };
  const compactKeep = Number(cfg.compactKeepTokens) > 0 ? Number(cfg.compactKeepTokens) : DEFAULT_COMPACT_KEEP;
  const maxSessions = Number(cfg.maxSessions) > 0 ? Number(cfg.maxSessions) : 500;

  /**
   * 列出全部会话并逐会话读事件，返回账本。
   * @param {{ sinceDays?: number, sessionIds?: string[], includeCalls?: boolean }} opts 过滤条件
   */
  async function scan(opts) {
    const sinceDays = Number(opts.sinceDays) > 0 ? Number(opts.sinceDays) : 0;
    const sinceMs = sinceDays > 0 ? Date.now() - sinceDays * 86400000 : 0;
    /** @type {Array<{sessionId: string, title: string|null, preset: string|null, origin: string|null, cwd: string|null, updatedAt: number}>} */
    let rows = [];
    let listError = null;
    try {
      const list = await controller.list({});
      for (const row of list.items ?? []) {
        rows.push({
          sessionId: String(row.sessionId),
          title: (row.projections && row.projections.title) ?? null,
          preset: row.agentPreset ?? null,
          origin: row.origin ?? "root",
          cwd: row.cwd ?? null,
          updatedAt: Number(row.updatedAt) || 0
        });
      }
    } catch (e) {
      listError = errorMessage(e);
    }
    if (Array.isArray(opts.sessionIds) && opts.sessionIds.length > 0) {
      const want = new Set(opts.sessionIds.map(String));
      rows = rows.filter((r) => want.has(r.sessionId));
    }
    if (sinceMs > 0) rows = rows.filter((r) => r.updatedAt >= sinceMs);
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    const truncated = rows.length > maxSessions;
    rows = rows.slice(0, maxSessions);

    const sessions = [];
    const byDay = {};
    const byModel = {};
    const totals = { sessions: 0, calls: 0, hit: 0, miss: 0, out: 0, prompt: 0, cost: 0, peakCost: 0, peakCalls: 0 };
    let degradeFeasibleCost = 0;
    let degradeSavedUsd = 0;
    let compactTotalSaved = 0;
    let peakSavedUsd = 0;
    let premiumSavedUsd = 0;
    let combinedSavedUsd = 0;
    const combinedSteps = { premium: 0, pro: 0, compact: 0, offPeak: 0 };
    /**
     * 落地口径的收益组合：只把"机械可分流"的会话整条降档，其余保留贵档。
     * 这样得出的数字才是可以写进承诺的，而不是"每笔贵档调用都能换成 flash"的天花板。
     */
    const portfolio = {
      downshiftUsd: 0,
      compactUsd: 0,
      offPeakUsd: 0,
      totalUsd: 0,
      keptPremiumUsd: 0,
      retiredPremiumShare: 0,
      /** @type {Array<{ sessionId: string, preset: string|null, calls: number, costUsd: number, mechanical: boolean, retireShare: number, toolCallRatio: number, shortsShare: number, savingUsd: number, projectedUsd: number }>} */
      bySession: []
    };
    /** 非 DeepSeek 线路（gemini/gpt/claude 等）改走 flash 的收益，按目标模型汇总。 */
    const premiumAgg = {};
    let unreadable = 0;

    for (const r of rows) {
      let ins;
      try {
        ins = await controller.inspect(r.sessionId);
      } catch {
        unreadable += 1;
        continue;
      }
      const events = Array.isArray(ins && ins.events) ? ins.events : [];
      const col = collectCalls(events);
      if (col.totals.calls === 0) continue;
      const meta = (ins && ins.meta) || {};
      const preset = meta.agentPreset ?? r.preset ?? null;
      const origin = meta.origin ?? r.origin ?? null;
      const createdAt = Number(meta.createdAt) || r.updatedAt;
      const day = dayKeyOf(createdAt);

      totals.sessions += 1;
      totals.calls += col.totals.calls;
      totals.hit += col.totals.hit;
      totals.miss += col.totals.miss;
      totals.out += col.totals.out;
      totals.prompt += col.totals.prompt;
      totals.cost += col.totals.cost;
      totals.peakCost += col.totals.peakCost;
      totals.peakCalls += col.totals.peakCalls;

      // 第一条降档路径：DeepSeek pro 档 → flash 档。
      const proPaths = [];
      const proDown = rerouteSavings(col, "deepseek-pro", "deepseek-v4-flash", overrides);
      if (proDown.movedCalls > 0) {
        proPaths.push({
          model: "deepseek-v4-pro",
          calls: proDown.movedCalls,
          cost: usd(proDown.movedCost),
          saved: usd(proDown.savedUsd)
        });
        degradeFeasibleCost += proDown.movedCost;
        degradeSavedUsd += proDown.savedUsd;
      }
      const comp = compactSavings(col, compactKeep, col.cacheHitRate, overrides);
      compactTotalSaved += comp.savedUsd;

      // 互不重叠的组合收益（逐级施加），避免把同一批 token 的收益重复计入。
      const comb = combinedLevers(col, { keepTokens: compactKeep, overrides });
      combinedSavedUsd += comb.savedUsd;
      combinedSteps.premium += comb.steps.premium;
      combinedSteps.pro += comb.steps.pro;
      combinedSteps.compact += comb.steps.compact;
      combinedSteps.offPeak += comb.steps.offPeak;

      // 落地口径：判断这个会话的贵档调用是不是"机械活"。
      // 判据（离线可观测、可复核）：调用多（≥200）+ 单次输出小（≤1K token）+ 工具调用占比高（≥50%）
      // ——这是"读上下文→调工具→看结果"的迭代形态，正是可自动校验、可分流到便宜档的工作。
      // 命中率只作为反向排除项（低于 70% 说明上下文在剧烈变化，压缩优先），不作为必要条件：
      // 否则"调用多但没吃上缓存"的最大一笔会被判成判断型活而继续贵着——实测正是如此，白白放过 53% 的账单。
      const shortTurns = col.calls.filter((c) => c.out > 0 && c.out <= MECHANICAL_OUTPUT_PER_CALL).length;
      const toolBearing = col.calls.filter((c) => c.hasToolCall).length;
      const outputPerCall = col.totals.out / Math.max(col.totals.calls, 1);
      const mechanicalPremium =
        col.totals.calls >= RUNAWAY_CALLS &&
        outputPerCall <= MECHANICAL_OUTPUT_PER_CALL &&
        toolBearing / Math.max(col.totals.calls, 1) >= MECHANICAL_TOOL_RATIO &&
        col.cacheHitRate >= MECHANICAL_MIN_CACHE_HIT;
      const premiumRetireShare = mechanicalPremium ? MECHANICAL_RETIRE : JUDGMENT_RETIRE;
      let sessionPortfolio = 0;
      const premiumSavings = comb.steps.premium + comb.steps.pro;
      if (premiumSavings > 0) {
        const downshifted = premiumSavings * premiumRetireShare;
        portfolio.downshiftUsd += downshifted;
        portfolio.keptPremiumUsd += premiumSavings - downshifted;
        sessionPortfolio += downshifted;
      }
      portfolio.compactUsd += comb.steps.compact;
      portfolio.offPeakUsd += comb.steps.offPeak;
      sessionPortfolio += comb.steps.compact + comb.steps.offPeak;
      if (sessionPortfolio > 0) {
        portfolio.totalUsd += sessionPortfolio;
        portfolio.bySession.push({
          sessionId: r.sessionId,
          preset,
          calls: col.totals.calls,
          costUsd: usd(col.totals.cost),
          mechanical: mechanicalPremium,
          retireShare: premiumRetireShare,
          toolCallRatio: pct(toolBearing / Math.max(col.totals.calls, 1)),
          shortsShare: pct(shortTurns / Math.max(col.totals.calls, 1)),
          savingUsd: usd(sessionPortfolio),
          projectedUsd: usd(Math.max(col.totals.cost - sessionPortfolio, 0))
        });
      }

      // 第二条降档路径：非 DeepSeek 线路（gemini/gpt/claude/glm 等）单价是 flash 的数倍到数十倍，
      // 把可自动校验的活分流回 flash 是账本上最大的一笔。按价率档位逐档算。
      const premiumPaths = [];
      const premiumKeys = new Set(
        col.calls
          .map((c) => c.rateKey)
          .filter((k) => k !== "deepseek-flash" && k !== "deepseek-pro")
      );
      for (const rk of premiumKeys) {
        const down = rerouteSavings(col, rk, "deepseek-v4-flash", overrides);
        if (down.movedCalls === 0) continue;
        const label = (col.calls.find((c) => c.rateKey === rk) || {}).model || rk;
        premiumPaths.push({ model: label, calls: down.movedCalls, cost: usd(down.movedCost), saved: usd(down.savedUsd) });
        const agg = (premiumAgg[label] ||= { model: label, calls: 0, cost: 0, saved: 0 });
        agg.calls += down.movedCalls;
        agg.cost += down.movedCost;
        agg.saved += down.savedUsd;
        premiumSavedUsd += down.savedUsd;
      }

      for (const c of col.calls) {
        if (c.band !== "peak") continue;
        const off = rateFor(c.model, c.at + 36 * 3600 * 1000, overrides, c.prompt).rate; // 同一价档的谷时价
        const offCost = (c.hit * off.hit + c.miss * off.miss + c.out * off.out) / 1e6;
        peakSavedUsd += Math.max(c.cost - offCost, 0);
      }

      const costPerCall = col.totals.calls > 0 ? col.totals.cost / col.totals.calls : 0;
      // 跑飞 = 与任务长度无关的两个形态指标失衡：上下文没被复用（命中率低），或步骤在反复空转（调用数高）。
      // 不用绝对金额判定：长任务天然花得多，用金额判会把正常的大任务全部误标。
      const runaway = col.totals.calls >= RUNAWAY_CALLS || col.cacheHitRate < CACHE_HIT_FLOOR;

      sessions.push({
        sessionId: r.sessionId,
        title: r.title,
        preset,
        origin,
        day,
        createdAt,
        calls: col.totals.calls,
        cost: usd(col.totals.cost),
        cacheHitRate: pct(col.cacheHitRate),
        avgPromptPerCall: Math.round(col.avgPromptPerCall),
        costPerCall: usd(costPerCall),
        peakCost: usd(col.totals.peakCost),
        outputTokens: col.totals.out,
        reasoningTokens: col.calls.reduce((s, c) => s + c.reasoning, 0),
        models: Object.fromEntries(
          Object.entries(col.models).map(([k, v]) => [k, { calls: v.calls, cost: usd(v.cost) }])
        ),
        downshiftPaths: proPaths,
        premiumPaths,
        compactSaving: usd(comp.savedUsd),
        runaway,
        flags: [
          col.totals.calls >= RUNAWAY_CALLS ? `calls≥${RUNAWAY_CALLS}` : null,
          col.cacheHitRate < CACHE_HIT_FLOOR ? `cacheHit<${pct(CACHE_HIT_FLOOR)}%` : null
        ].filter(Boolean),
        _calls: opts.includeCalls ? col.calls.slice(-200) : undefined
      });

      const d = (byDay[day] ||= { day, sessions: 0, calls: 0, cost: 0, peakCost: 0 });
      d.sessions += 1;
      d.calls += col.totals.calls;
      d.cost += col.totals.cost;
      d.peakCost += col.totals.peakCost;
      for (const [model, m] of Object.entries(col.models)) {
        const mm = (byModel[model] ||= { model: model, calls: 0, hit: 0, miss: 0, out: 0, cost: 0 });
        mm.calls += m.calls;
        mm.hit += m.hit;
        mm.miss += m.miss;
        mm.out += m.out;
        mm.cost += m.cost;
      }
    }

    portfolio.totalUsd = portfolio.downshiftUsd + portfolio.compactUsd + portfolio.offPeakUsd;
    portfolio.bySession.sort((a, b) => b.savingUsd - a.savingUsd);
    portfolio.retiredPremiumShare = MECHANICAL_RETIRE;
    // aggressiveUsd 是"每一笔贵档调用都换成 flash"的天花板，用于标定上界；落地看 portfolio。
    const aggressiveUsd = combinedSavedUsd;
    const days = Object.values(byDay)
      .map((d) => ({
        day: d.day,
        sessions: d.sessions,
        calls: d.calls,
        cost: usd(d.cost),
        peakCostShare: pct(d.cost > 0 ? d.peakCost / d.cost : 0)
      }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));
    const models = Object.values(byModel)
      .map((m) => ({
        model: m.model,
        calls: m.calls,
        cacheHitRate: pct(m.hit / Math.max(m.hit + m.miss, 1)),
        outputTokens: m.out,
        cost: usd(m.cost),
        costShare: pct(m.cost / Math.max(totals.cost, 1e-9))
      }))
      .sort((a, b) => b.cost - a.cost);

    return {
      generatedAt: new Date().toISOString(),
      listError,
      truncated,
      unreadable,
      totals: {
        sessions: totals.sessions,
        calls: totals.calls,
        cacheHitRate: pct(totals.hit / Math.max(totals.prompt, 1)),
        peakCostShare: pct(totals.peakCost / Math.max(totals.cost, 1e-9)),
        avgPromptPerCall: Math.round(totals.prompt / Math.max(totals.calls, 1)),
        costUsd: usd(totals.cost),
        costCny: Math.round(totals.cost * 7.1 * 100) / 100
      },
      days,
      models,
      sessions: sessions.sort((a, b) => b.cost - a.cost),
      levers: {
        downshift: {
          from: "deepseek-v4-pro",
          to: "deepseek-v4-flash",
          affectedCostUsd: usd(degradeFeasibleCost),
          savingUsd: usd(degradeSavedUsd),
          savingShare: pct(degradeSavedUsd / Math.max(totals.cost, 1e-9))
        },
        premiumDownshift: Object.values(premiumAgg)
          .map((p) => ({
            model: p.model,
            calls: p.calls,
            affectedCostUsd: usd(p.cost),
            savingUsd: usd(p.saved),
            savingShare: pct(p.saved / Math.max(totals.cost, 1e-9))
          }))
          .sort((a, b) => b.savingUsd - a.savingUsd),
        compact: {
          keepTokens: compactKeep,
          savingUsd: usd(compactTotalSaved),
          savingShare: pct(compactTotalSaved / Math.max(totals.cost, 1e-9))
        },
        offPeak: {
          savingUsd: usd(peakSavedUsd),
          savingShare: pct(peakSavedUsd / Math.max(totals.cost, 1e-9))
        },
        // 互不重叠的组合收益：逐级施加，每步只在上一步剩下的账单上取收益。
        // 直接把上面几个数相加会重复计数（实测会超过 100%），故这里用 combined 汇总各会话的逐级结果。
        combined: {
          savingUsd: usd(combinedSavedUsd),
          savingShare: pct(combinedSavedUsd / Math.max(totals.cost, 1e-9)),
          steps: {
            premiumUsd: usd(combinedSteps.premium),
            proUsd: usd(combinedSteps.pro),
            compactUsd: usd(combinedSteps.compact),
            offPeakUsd: usd(combinedSteps.offPeak)
          },
          baselineUsd: usd(totals.cost),
          projectedUsd: usd(Math.max(totals.cost - combinedSavedUsd, 0))
        },
        // 落地口径：combined 是"把每一笔贵档调用都当可降档"的天花板，不是承诺。
        // portfolio 把它拆成「机械可分流的活」与「必须留贵档的活」两笔，后者按保守比例保留，
        // 因为离线只能看到 token 结构、看不到每一步的语义，必须留出误伤预算。
        portfolio: {
          aggressiveUsd: usd(aggressiveUsd),
          aggressiveShare: pct(aggressiveUsd / Math.max(totals.cost, 1e-9)),
          downshiftUsd: usd(portfolio.downshiftUsd),
          compactUsd: usd(portfolio.compactUsd),
          offPeakUsd: usd(portfolio.offPeakUsd),
          totalUsd: usd(portfolio.totalUsd),
          totalShare: pct(portfolio.totalUsd / Math.max(totals.cost, 1e-9)),
          projectedUsd: usd(Math.max(totals.cost - portfolio.totalUsd, 0)),
          keptPremiumUsd: usd(portfolio.keptPremiumUsd),
          retiredPremiumShare: portfolio.retiredPremiumShare,
          bySession: portfolio.bySession.slice(0, 15)
        }
      },
      thresholds: {
        runawayCalls: RUNAWAY_CALLS,
        costPerCallUsd: COST_PER_CALL_USD,
        cacheHitFloor: pct(CACHE_HIT_FLOOR),
        sessionUsd: limits.sessionUsd,
        taskUsd: limits.taskUsd,
        dayUsd: limits.dayUsd,
        compactKeepTokens: compactKeep
      }
    };
  }

  ctx.tools.register({
    name: "cg_scan",
    description:
      "大模型调用成本归因扫描（只读）：按日/按模型/按会话给出真实花费排名、缓存命中率、峰谷占比与「跑飞会话」名单；" +
      "并直接算出三条降本路径各自能省多少钱——降档路由（pro→flash）、上下文压缩（保留阈值 keepTokens）、谷时排程。" +
      "价率口径：命中价 = 未命中价 /31；DeepSeek 官方线路峰时 ×2（北京时间 09–12、14–18 为峰，周末全天谷时）。" +
      "回传可审计的完整账本，不修改任何会话。",
    parameters: {
      type: "object",
      properties: {
        sinceDays: { type: "number", description: "只统计最近 N 天更新过的会话（缺省=全部）" },
        sessionIds: { type: "array", items: { type: "string" }, description: "只统计这些会话（可选）" },
        topN: { type: "number", description: "会话排名返回前 N 条（缺省 20）" },
        includeCalls: { type: "boolean", description: "是否附带每会话最近 200 次调用明细（缺省 false）" }
      },
      required: []
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (a, v) => [{ type: "text", text: JSON.stringify(v, null, 2) }]
    },
    timeoutMs: 600000,
    execute: async (args) => {
      const a = args && typeof args === "object" ? args : {};
      const report = await scan({
        sinceDays: Number(a.sinceDays) > 0 ? Number(a.sinceDays) : 0,
        sessionIds: Array.isArray(a.sessionIds) ? a.sessionIds : [],
        includeCalls: Boolean(a.includeCalls)
      });
      const topN = Number(a.topN) > 0 ? Number(a.topN) : 20;
      const top = report.sessions.slice(0, topN);
      const runaway = report.sessions.filter((s) => s.runaway);
      const ledger = appendLedger({
        at: report.generatedAt,
        totals: report.totals,
        levers: report.levers
      });
      return {
        generatedAt: report.generatedAt,
        totals: report.totals,
        levers: report.levers,
        thresholds: report.thresholds,
        topSessions: top,
        runaway: {
          count: runaway.length,
          costUsd: usd(runaway.reduce((s, x) => s + x.cost, 0)),
          costShare: pct(
            runaway.reduce((s, x) => s + x.cost, 0) / Math.max(report.totals.costUsd, 1e-9)
          ),
          sessions: runaway.slice(0, 10).map((s) => ({
            sessionId: s.sessionId,
            title: s.title,
            calls: s.calls,
            costUsd: s.cost,
            flags: s.flags
          }))
        },
        byModel: report.models,
        byDay: report.days,
        scanMeta: {
          truncated: report.truncated,
          unreadable: report.unreadable,
          listError: report.listError,
          ledger
        }
      };
    }
  });

  ctx.tools.register({
    name: "cg_budget",
    description:
      "成本闸门（只读）：给定会话 id，回报它已经花掉的金额、调用次数与缓存命中率，并对照阈值判定" +
      "继续跑 / 先压缩 / 先降档 / 停。长任务或批量任务上手前调用，避免跑飞后再补救。",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "要核账的会话 id" }
      },
      required: ["sessionId"]
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (a, v) => [{ type: "text", text: JSON.stringify(v, null, 2) }]
    },
    timeoutMs: 120000,
    execute: async (args) => {
      const sessionId = String((args && args.sessionId) || "");
      if (sessionId === "") return { ok: false, error: "sessionId 为空" };
      let ins;
      try {
        ins = await controller.inspect(sessionId);
      } catch (e) {
        return { ok: false, error: errorMessage(e) };
      }
      const col = collectCalls(Array.isArray(ins && ins.events) ? ins.events : []);
      const cost = usd(col.totals.cost);
      const overSession = cost >= limits.sessionUsd;
      const overTask = cost >= limits.taskUsd;
      const lowCache = col.cacheHitRate < CACHE_HIT_FLOOR;
      const tooManyCalls = col.totals.calls >= RUNAWAY_CALLS;
      const verdict = overSession || (tooManyCalls && lowCache)
        ? "stop"
        : lowCache || col.avgPromptPerCall > compactKeep
          ? "compact-first"
          : tooManyCalls || overTask
            ? "downshift"
            : "continue";
      return {
        ok: true,
        sessionId,
        costUsd: cost,
        costCny: Math.round(cost * 7.1 * 100) / 100,
        calls: col.totals.calls,
        cacheHitRate: pct(col.cacheHitRate),
        avgPromptPerCall: Math.round(col.avgPromptPerCall),
        peakCostShare: pct(col.peakCostShare),
        limits,
        verdict,
        reason:
          verdict === "stop"
            ? `已超单会话上限 $${limits.sessionUsd} 或处于"多调用+低命中"跑飞形态`
            : verdict === "compact-first"
              ? `缓存命中率 ${pct(col.cacheHitRate)}% 低于 ${pct(CACHE_HIT_FLOOR)}%，或单次 prompt 均值 ${Math.round(col.avgPromptPerCall)} 超过保留阈值 ${compactKeep}`
              : verdict === "downshift"
                ? `调用次数 ${col.totals.calls} 偏多或已超单任务预算 $${limits.taskUsd}，剩余步骤建议走 flash`
                : "在阈值内"
      };
    }
  });

  ctx.tools.register({
    name: "cg_verdict",
    description:
      "把成本扫描压成一段可直接执行的结论：找到的浪费点、三条下行路径各自的金额与占比、需要落地的阈值清单、" +
      "以及降本后仍要守住的业务校验项。适合在扫描之后一次性给出决策，不必再自己算。",
    parameters: {
      type: "object",
      properties: {
        sinceDays: { type: "number", description: "统计窗口天数（缺省 30）" },
        targetShare: { type: "number", description: "目标降幅（0–1，缺省 0.5）" }
      },
      required: []
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (a, v) => [{ type: "text", text: JSON.stringify(v, null, 2) }]
    },
    timeoutMs: 600000,
    execute: async (args) => {
      const a = args && typeof args === "object" ? args : {};
      const sinceDays = Number(a.sinceDays) > 0 ? Number(a.sinceDays) : 30;
      const target = Number(a.targetShare) > 0 && Number(a.targetShare) < 1 ? Number(a.targetShare) : 0.5;
      const r = await scan({ sinceDays, sessionIds: [], includeCalls: false });
      const runaway = r.sessions.filter((s) => s.runaway);
      const runawayCost = usd(runaway.reduce((s, x) => s + x.cost, 0));
      const worst = r.sessions[0];
      const modelRank = r.models.slice(0, 3).map((m) => `${m.model}(${m.costShare}%)`).join(" + ");
      const reached = r.levers.combined.savingShare >= target * 100;
      return {
        windowDays: sinceDays,
        baseline: r.totals,
        concentration: {
          top1SharePct: pct((worst ? worst.cost : 0) / Math.max(r.totals.costUsd, 1e-9) * 100),
          top10SharePct: pct(
            r.sessions.slice(0, 10).reduce((s, x) => s + x.cost, 0) / Math.max(r.totals.costUsd, 1e-9) * 100
          ),
          runawayCount: runaway.length,
          runawayCostUsd: runawayCost,
          runawaySharePct: pct(runawayCost / Math.max(r.totals.costUsd, 1e-9) * 100)
        },
        costDrivers: modelRank,
        levers: r.levers,
        targetShare: target,
        targetReached: reached,
        gapUsd: reached ? 0 : usd(Math.max(r.totals.costUsd * target - r.levers.combined.savingUsd, 0)),
        actions: [
          `1) 非 DeepSeek 线路改道（落地口径省 $${r.levers.portfolio.downshiftUsd}）：把 gemini/gpt/claude 上的调用按任务类型迁回 flash。`
            + (r.levers.premiumDownshift.length > 0
              ? `当前最该迁的是 ${r.levers.premiumDownshift[0].model}（${r.levers.premiumDownshift[0].calls} 次，账单 $${r.levers.premiumDownshift[0].affectedCostUsd}）。`
              : "")
            + "判据：调用多、单次输出小、工具调用占比高的迭代型活（校验/抽取/搬运/格式转换/单测修复）整条降档；"
            + "在写长文长代码、或需要开放式判断的活（架构取舍、方案审计、疑难诊断）保留贵档。",
          `2) DeepSeek pro→flash 分流（已含在上一条的分流预算里）：只降路由，不降验收标准与提示词。`,
          `3) 上下文压缩（省 $${r.levers.portfolio.compactUsd}）：保留阈值 ${r.thresholds.compactKeepTokens} token，超过即压缩；压缩点选在"已完成子任务 + 已落盘产物"之后，砍的是过程记录不是交付物。`,
          `4) 谷时排程（省 $${r.levers.portfolio.offPeakUsd}）：把批量/离线任务移出北京时间 09–12、14–18；交互式任务留在原地即可。`,
          `组合后账单：$${r.levers.portfolio.projectedUsd}（当前 $${r.levers.combined.baselineUsd}，降 ${r.levers.portfolio.totalShare}%）；`
            + `若把贵档调用全部改道，理论天花板是降 ${r.levers.combined.savingShare}%——差额 $${r.levers.portfolio.keptPremiumUsd} 是刻意留给判断型活的预算。`,
          `5) 闸门：单会话 $${r.thresholds.sessionUsd} / 单任务 $${r.thresholds.taskUsd} / 单日 $${r.thresholds.dayUsd} 触发即停；命中率低于 ${r.thresholds.cacheHitFloor}% 或调用数 ≥${r.thresholds.runawayCalls} 判跑飞。`
        ],
        guardrails: [
          "同一批测试用例通过率不低于改造前（差值 ≤2 个百分点），业务失败率不升。",
          "每条降档规则只改路由，不改提示词与工具集；提示词一改就无法归因。",
          "先灰度一条业务线，跑满 3 天再全量；每天都留一份 cg_scan 账本快照做对照。",
          "降本后重跑人工抽检样本，确认交付物质量未退化再撤掉 pro 路由。"
        ]
      };
    }
  });
}

export { name, inject };
