/**
 * dsh-cost-guard — 账本聚合（纯函数：输入 inspect() 出来的事件数组，输出可审计的账本）。
 *
 * 事件流口径（与 DSH session.jsonl 一致）：
 *  - `request/header` 携带本次请求的 config（provider / model / reasoningEffort），
 *    它是"此后发生的 usage 属于哪个模型"的权威锚点 → 顺序扫描时用它更新当前路由。
 *  - `assistant/chunk` 且 chunk.type==='usage' 携带该次模型调用的 token 计量。
 * 一次 usage 事件 = 一次计费调用（billing call），这是本插件所有口径的最小单位。
 */

import { rateFor, costOf, normalizeUsage, detectConvention } from "./rates.js";

/**
 * 「跑飞」判定：不看绝对金额（长任务天然花得多），看两个与任务长度无关的形态指标。
 *  - 单次调用均价 ≥ COST_PER_CALL_USD：prompt 或输出失控，钱不是花在"多做了事"上；
 *  - 调用数 ≥ RUNAWAY_CALLS：同一步骤反复重试/来回试探，属于可以中断止损的形态。
 */
const RUNAWAY_CALLS = 200;
const COST_PER_CALL_USD = 0.02;
/** 缓存命中率红线：低于它说明上下文没被复用，未命中 token 会按 31 倍价计费。 */
const CACHE_HIT_FLOOR = 0.95;

/**
 * 从事件数组里抽出每会话的调用明细，并聚合。
 * @param {Array<Record<string, any>>} events 会话事件
 * @returns {{
 *   calls: Array<{ model: string, provider: string, effort: string|null, at: number, band: string,
 *                  rateKey: string, confidence: "list"|"estimated", hasToolCall: boolean,
 *                  hit: number, miss: number, out: number, prompt: number, reasoning: number, cost: number }>,
 *   totals: { calls: number, hit: number, miss: number, out: number, prompt: number, cost: number, peakCalls: number, peakCost: number },
 *   models: Record<string, { calls: number, hit: number, miss: number, out: number, cost: number }>,
 *   convention: "dsh" | "provider",
 *   peakCostShare: number, cacheHitRate: number, avgPromptPerCall: number
 * }}
 */
function collectCalls(events) {
  const list = Array.isArray(events) ? events : [];

  // 先扫一遍 usage，判定该会话采用的是哪种计数习惯（避免逐条猜导致混合口径）。
  const rawUsages = [];
  for (const e of list) {
    if (!e || typeof e !== "object" || e.type !== "assistant/chunk") continue;
    const data = e.data && typeof e.data === "object" ? e.data : {};
    const chunk = data.chunk && typeof data.chunk === "object" ? data.chunk : {};
    if (chunk.type === "usage" && chunk.usage) rawUsages.push(chunk.usage);
  }
  const convention = detectConvention(rawUsages);

  // 先把"哪些 turn:step 里有工具调用"收集起来：机械活（读上下文→调工具→看结果）的判据要用它。
  // 注意 turn/step 挂在事件顶层，不在 data 里——按 data 取会全部落到 "0:0"，判据恒为 0（踩过）。
  const toolSteps = new Set();
  for (const e of list) {
    if (!e || typeof e !== "object" || e.type !== "assistant/message") continue;
    const data = e.data && typeof e.data === "object" ? e.data : {};
    const msg = data.message && typeof data.message === "object" ? data.message : {};
    const content = Array.isArray(msg.content) ? msg.content : [];
    if (content.some((b) => b && b.type === "tool-call")) {
      toolSteps.add(`${e.turn ?? data.turn ?? 0}:${e.step ?? data.step ?? 0}`);
    }
  }

  let route = { provider: "unknown", model: "unknown", effort: null };
  const calls = [];
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    const data = e.data && typeof e.data === "object" ? e.data : {};
    if (e.type === "request/header") {
      const cfg = (data.header && data.header.config) || data.config || {};
      route = {
        provider: cfg.provider ?? route.provider,
        model: cfg.model ?? route.model,
        effort: cfg.reasoningEffort ?? null
      };
      continue;
    }
    if (e.type !== "assistant/chunk") continue;
    const chunk = data.chunk && typeof data.chunk === "object" ? data.chunk : {};
    if (chunk.type !== "usage") continue;
    const t = normalizeUsage(chunk.usage || {}, convention);
    const at = Number(e.time) || 0;
    // 传入 prompt 长度：Gemini 等模型单价随上下文长度跳档，不传会低估贵档账单。
    const r = rateFor(route.model, at, undefined, t.prompt);
    const cost = costOf({ hit: t.hit, miss: t.miss, out: t.out }, r.rate);
    calls.push({
      model: String(route.model),
      provider: String(route.provider),
      effort: route.effort,
      at,
      band: r.band,
      rateKey: r.key,
      confidence: r.confidence,
      hit: t.hit,
      miss: t.miss,
      out: t.out,
      prompt: t.prompt,
      reasoning: t.reasoning,
      hasToolCall: toolSteps.has(`${e.turn ?? data.turn ?? 0}:${e.step ?? data.step ?? 0}`),
      cost
    });
  }
  const totals = { calls: 0, hit: 0, miss: 0, out: 0, prompt: 0, cost: 0, peakCalls: 0, peakCost: 0 };
  /** @type {Record<string, { calls: number, hit: number, miss: number, out: number, cost: number }>} */
  const models = {};
  for (const c of calls) {
    totals.calls += 1;
    totals.hit += c.hit;
    totals.miss += c.miss;
    totals.out += c.out;
    totals.prompt += c.prompt;
    totals.cost += c.cost;
    if (c.band === "peak") {
      totals.peakCalls += 1;
      totals.peakCost += c.cost;
    }
    const m = (models[c.model] ||= { calls: 0, hit: 0, miss: 0, out: 0, cost: 0 });
    m.calls += 1;
    m.hit += c.hit;
    m.miss += c.miss;
    m.out += c.out;
    m.cost += c.cost;
  }
  return {
    calls,
    totals,
    models,
    convention,
    peakCostShare: totals.cost > 0 ? totals.peakCost / totals.cost : 0,
    cacheHitRate: totals.prompt > 0 ? totals.hit / totals.prompt : 1,
    avgPromptPerCall: totals.calls > 0 ? totals.prompt / totals.calls : 0
  };
}

/**
 * 路由降档能省多少：把指定模型的调用整体换成目标模型，重算成本。
 * 未命中率按同会话实测值平移（重算缓存命中部分不变），不做乐观假设。
 * @param {ReturnType<typeof collectCalls>} col 单会话聚合结果
 * @param {string} fromKey rates.rateKey 档位（如 'deepseek-pro'）
 * @param {string} toModel 目标模型 id
 * @param {Record<string, any>} [overrides] 价率覆盖
 * @returns {{ savedUsd: number, movedCalls: number, movedCost: number }}
 */
function rerouteSavings(col, fromKey, toModel, overrides) {
  let moved = 0;
  let movedCost = 0;
  let newCost = 0;
  for (const c of col.calls) {
    if (c.rateKey !== fromKey) continue;
    moved += 1;
    movedCost += c.cost;
    const r = rateFor(toModel, c.at, overrides, c.prompt);
    newCost += costOf({ hit: c.hit, miss: c.miss, out: c.out }, r.rate);
  }
  return { savedUsd: Math.max(movedCost - newCost, 0), movedCalls: moved, movedCost };
}

/**
 * 把上下文自 X% 处截断（压缩）能省多少。
 * 保守口径：只把"这一调用真正按未命中价付过钱的那部分 token"折算成命中价，
 * 因此省下的钱不会超过该调用实测的未命中开销——不假设压缩后会产生任何额外命中。
 * @param {ReturnType<typeof collectCalls>} col 单会话聚合结果
 * @param {number} keepTokens 压缩后允许保留的上下文 token 数
 * @param {number} observedHitRate 实测命中率（保留参数以对齐调用方口径；本口径不依赖它做乐观外推）
 * @param {Record<string, any>} [overrides] 价率覆盖
 * @returns {{ savedUsd: number, affectedCalls: number }}
 */
function compactSavings(col, keepTokens, observedHitRate, overrides) {
  let saved = 0;
  let affected = 0;
  void observedHitRate;
  for (const c of col.calls) {
    if (c.prompt <= keepTokens) continue;
    affected += 1;
    const r = rateFor(c.model, c.at, overrides, c.prompt).rate;
    // 超出保留阈值的 tail 按未命中计费；省下的是这部分从 miss 价降到 hit 价。
    const tailMiss = Math.min(c.prompt - keepTokens, c.miss);
    saved += (tailMiss * (r.miss - r.hit)) / 1e6;
  }
  return { savedUsd: saved, affectedCalls: affected };
}

/**
 * 四条杠杆的**互不重叠**归因。
 *
 * 陷阱：直接把各杠杆单独算出的收益相加会重复计数——同一批 token 既可能被"降档路由"改价，
 * 又可能被"上下文压缩"改价，还可能被"谷时排程"再打一次折，相加轻松超过 100%（实际观测到 109%）。
 * 正确做法是按固定顺序逐级施加，每一步只在**上一步剩下的账单**上取收益，最后一步的残值即新账单。
 *
 * 顺序有业务含义，不随意调换：
 *   1) premium→flash  先砍单价最贵的非 DeepSeek 线路（决定性的那一刀）
 *   2) pro→flash      再砍 DeepSeek 内部的贵档
 *   3) compact        降档之后"未命中价 vs 命中价"的价差变小，压缩收益随之缩水——这才是真实收益
 *   4) offPeak        最后对仍然留在峰时段的调用打折（仅 DeepSeek 官方线路有峰谷）
 *
 * @param {ReturnType<typeof collectCalls>} col 单会话聚合结果
 * @param {{ keepTokens?: number, overrides?: Record<string, any> }} [opts] 可选参数
 * @returns {{
 *   baselineUsd: number, afterPremiumUsd: number, afterProUsd: number,
 *   afterCompactUsd: number, afterOffPeakUsd: number, savedUsd: number, savedShare: number,
 *   steps: { premium: number, pro: number, compact: number, offPeak: number }
 * }}
 */
function combinedLevers(col, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const keepTokens = Number(o.keepTokens) > 0 ? Number(o.keepTokens) : 100000;
  const overrides = o.overrides;
  const FLASH = "deepseek-v4-flash";

  /**
   * 按"已施加到第几步"决定这次调用落在哪个模型上。
   * stage 0 必须原样返回当前路由——否则基线账单会被算成"已经降过档"的金额，
   * 收益与基线同时被低估（实测会把 $0.36 的基线算成 $0.14）。
   * @param {ReturnType<typeof collectCalls>["calls"][number]} c 调用
   * @param {0|1|2} stage 0=原始路由 1=已降非 DeepSeek 线路 2=已降 DeepSeek pro 档
   * @returns {string} 生效模型 id
   */
  function modelAt(c, stage) {
    if (stage === 0) return c.model;
    const isDeepSeek = c.rateKey === "deepseek-flash" || c.rateKey === "deepseek-pro";
    if (!isDeepSeek) return FLASH; // 非 DeepSeek 线路在 stage≥1 一律改走 flash
    if (c.rateKey === "deepseek-pro" && stage >= 2) return FLASH;
    return c.model;
  }

  /**
   * 算出某个场景下的账单：路由阶段 × 是否压缩 × 是否谷时。
   * 价率按**该场景下的 prompt 长度**取，压缩把 prompt 压到阈值以下时可能连带掉一档单价。
   * @param {0|1|2} stage 路由阶段
   * @param {boolean} compact 是否已压缩
   * @param {boolean} offPeak 是否按谷时价
   * @returns {number} USD
   */
  function bill(stage, compact, offPeak) {
    let sum = 0;
    for (const c of col.calls) {
      const model = modelAt(c, stage);
      const tailMiss = compact ? Math.max(Math.min(c.prompt - keepTokens, c.miss), 0) : 0;
      const hit = c.hit + tailMiss;
      const miss = c.miss - tailMiss;
      const prompt = hit + miss;
      // 谷时价：取同一模型在谷时段的价率；非 DeepSeek 线路无峰谷，结果不变。
      const r = rateFor(model, offPeak ? c.at + 36 * 3600 * 1000 : c.at, overrides, prompt).rate;
      sum += costOf({ hit, miss, out: c.out }, r);
    }
    return sum;
  }

  const baselineUsd = bill(0, false, false);
  const afterPremiumUsd = bill(1, false, false);
  const afterProUsd = bill(2, false, false);
  const afterCompactUsd = bill(2, true, false);
  const afterOffPeakUsd = Math.min(afterCompactUsd, bill(2, true, true));

  const steps = {
    premium: Math.max(baselineUsd - afterPremiumUsd, 0),
    pro: Math.max(afterPremiumUsd - afterProUsd, 0),
    compact: Math.max(afterProUsd - afterCompactUsd, 0),
    offPeak: Math.max(afterCompactUsd - afterOffPeakUsd, 0)
  };
  const savedUsd = Math.max(baselineUsd - afterOffPeakUsd, 0);
  return {
    baselineUsd,
    afterPremiumUsd,
    afterProUsd,
    afterCompactUsd,
    afterOffPeakUsd,
    savedUsd,
    savedShare: baselineUsd > 0 ? savedUsd / baselineUsd : 0,
    steps
  };
}

export {
  RUNAWAY_CALLS,
  COST_PER_CALL_USD,
  CACHE_HIT_FLOOR,
  collectCalls,
  rerouteSavings,
  compactSavings,
  combinedLevers
};
