import { describe, it, expect } from "vitest";
import { rateKey, bandOf, rateFor, costOf, normalizeUsage, detectConvention, RATES } from "../lib/rates.js";
import {
  collectCalls,
  rerouteSavings,
  compactSavings,
  RUNAWAY_CALLS,
  COST_PER_CALL_USD,
  CACHE_HIT_FLOOR,
  combinedLevers
} from "../lib/aggregate.js";

/** 造一条 request/header 事件。 */
function header(model, provider = "deepseek-official", effort = "max") {
  return { type: "request/header", time: 0, data: { header: { config: { provider, model, reasoningEffort: effort } } } };
}

/** 造一条 usage 事件。 */
function usage({ at, hit = 0, miss = 0, out = 0, reasoning = 0 }) {
  return {
    type: "assistant/chunk",
    time: at,
    data: { chunk: { type: "usage", usage: { cacheReadTokens: hit, inputTokens: miss, outputTokens: out, reasoningTokens: reasoning, totalTokens: hit + miss } } }
  };
}

/** 北京时间某个确定时刻（2026-09-02 是周三）。 */
function beijing(y, mo, d, h, mi = 0) {
  return new Date(y, mo - 1, d, h, mi).getTime();
}

describe("rates 价率与峰谷", () => {
  it("模型 id 归一到价率档位", () => {
    expect(rateKey("deepseek-v4-pro")).toBe("deepseek-pro");
    expect(rateKey("deepseek-v4-flash")).toBe("deepseek-flash");
    expect(rateKey("deepseek-flash")).toBe("deepseek-flash");
    expect(rateKey("gemini-3.1-pro-preview")).toBe("gemini-pro");
    expect(rateKey("claude-opus-4.7")).toBe("claude-opus");
    expect(rateKey("gpt-5.5")).toBe("gpt-5.5");
    expect(rateKey("zai-org/GLM-5.3")).toBe("glm");
    expect(rateKey("")).toBe("unknown");
  });

  it("峰谷判定按北京时间：工作日 09–12/14–18 为峰，周末与其余时段为谷", () => {
    expect(bandOf(beijing(2026, 9, 2, 10))).toBe("peak"); // 周三 10:00
    expect(bandOf(beijing(2026, 9, 2, 15))).toBe("peak"); // 周三 15:00
    expect(bandOf(beijing(2026, 9, 2, 13))).toBe("off"); // 周三午休
    expect(bandOf(beijing(2026, 9, 2, 8, 59))).toBe("off");
    expect(bandOf(beijing(2026, 9, 2, 18))).toBe("off");
    expect(bandOf(beijing(2026, 9, 5, 10))).toBe("off"); // 周六全天谷时
    expect(bandOf(beijing(2026, 9, 6, 15))).toBe("off"); // 周日全天谷时
  });

  it("DeepSeek 峰时价 = 谷时价 ×2；非 DeepSeek 线路不套用峰谷", () => {
    const off = rateFor("deepseek-v4-pro", beijing(2026, 9, 2, 20)).rate;
    const peak = rateFor("deepseek-v4-pro", beijing(2026, 9, 2, 10)).rate;
    expect(peak.miss).toBeCloseTo(off.miss * 2, 10);
    expect(peak.out).toBeCloseTo(off.out * 2, 10);

    const gOff = rateFor("gemini-3.1-pro-preview", beijing(2026, 9, 2, 20)).rate;
    const gPeak = rateFor("gemini-3.1-pro-preview", beijing(2026, 9, 2, 10)).rate;
    expect(gPeak.miss).toBeCloseTo(gOff.miss, 10);
  });

  it("命中价只有未命中价的 1/31 量级（这正是命中率骗人的原因）", () => {
    const flash = RATES["deepseek-flash"];
    expect(flash.miss / flash.hit).toBeCloseTo(31.43, 1);
    const pro = RATES["deepseek-pro"];
    expect(pro.miss / pro.hit).toBeCloseTo(30, 0);
  });

  it("costOf 按 hit/miss/out 分别计价", () => {
    const r = { hit: 0.007, miss: 0.22, out: 0.66 };
    // 1M hit + 1M miss + 1M out
    expect(costOf({ hit: 1e6, miss: 1e6, out: 1e6 }, r)).toBeCloseTo(0.887, 6);
    expect(costOf({}, r)).toBe(0);
  });

  it("normalizeUsage：prompt = 命中 + 未命中，totalTokens 含输出不能当 prompt 用", () => {
    // 真实样本：totalTokens = inputTokens + cacheReadTokens + outputTokens
    const a = normalizeUsage({ cacheReadTokens: 33792, inputTokens: 9386, outputTokens: 205, totalTokens: 43383 });
    expect(a).toMatchObject({ hit: 33792, miss: 9386, out: 205, prompt: 43178 });
    expect(a.prompt).toBe(a.hit + a.miss);
    expect(a.prompt).not.toBe(43383); // 若把 totalTokens 当 prompt，就多算了输出那 205

    const b = normalizeUsage({ cacheReadTokens: 42496, inputTokens: 149, outputTokens: 80, totalTokens: 42725 });
    expect(b.prompt).toBe(42645);
  });

  it("normalizeUsage：provider 口径下 inputTokens 含命中部分，必须扣掉", () => {
    // 上游照抄 prompt_tokens：input=1000（含 900 命中），output=50，total=1050
    const p = normalizeUsage({ cacheReadTokens: 900, inputTokens: 1000, outputTokens: 50, totalTokens: 1050 }, "provider");
    expect(p.miss).toBe(100);
    expect(p.prompt).toBe(1000);
    // 同一份数据若按 dsh 口径读，会把 900 命中的部分也按未命中价计费
    const wrong = normalizeUsage({ cacheReadTokens: 900, inputTokens: 1000, outputTokens: 50, totalTokens: 1050 }, "dsh");
    expect(wrong.miss).toBe(1000);
    expect(wrong.miss).toBeGreaterThan(p.miss);
  });

  it("normalizeUsage：缺 inputTokens 时用 totalTokens 反推并扣掉输出", () => {
    const c = normalizeUsage({ cacheReadTokens: 10, outputTokens: 5, totalTokens: 20 });
    expect(c.miss).toBe(5);
    expect(c.prompt).toBe(15);
  });

  it("detectConvention 按恒等式判定会话口径，不逐条猜", () => {
    const dshCalls = [
      { cacheReadTokens: 100, inputTokens: 10, outputTokens: 5, totalTokens: 115 },
      { cacheReadTokens: 200, inputTokens: 20, outputTokens: 8, totalTokens: 228 }
    ];
    expect(detectConvention(dshCalls)).toBe("dsh");

    const providerCalls = [
      { cacheReadTokens: 100, inputTokens: 110, outputTokens: 5, totalTokens: 115 },
      { cacheReadTokens: 200, inputTokens: 220, outputTokens: 8, totalTokens: 228 }
    ];
    expect(detectConvention(providerCalls)).toBe("provider");
  });
});

describe("aggregate 账本聚合", () => {
  it("顺序扫描时用 request/header 锚定此后调用属于哪个模型", () => {
    const events = [
      header("deepseek-v4-pro"),
      usage({ at: beijing(2026, 9, 2, 20), hit: 1e6, miss: 0, out: 0 }),
      header("deepseek-v4-flash", "deepseek-official", "max"),
      usage({ at: beijing(2026, 9, 2, 20), hit: 1e6, miss: 0, out: 0 })
    ];
    const col = collectCalls(events);
    expect(col.totals.calls).toBe(2);
    expect(Object.keys(col.models).sort()).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    // pro 命中 1M = $0.022；flash 命中 1M = $0.007
    expect(col.models["deepseek-v4-pro"].cost).toBeCloseTo(0.022, 6);
    expect(col.models["deepseek-v4-flash"].cost).toBeCloseTo(0.007, 6);
  });

  it("峰谷在同一会话内分别计价", () => {
    const events = [
      header("deepseek-v4-pro"),
      usage({ at: beijing(2026, 9, 2, 20), miss: 1e6 }), // 谷
      usage({ at: beijing(2026, 9, 2, 10), miss: 1e6 }) // 峰
    ];
    const col = collectCalls(events);
    expect(col.totals.peakCalls).toBe(1);
    expect(col.totals.peakCost).toBeCloseTo(1.32, 6);
    expect(col.peakCostShare).toBeCloseTo(1.32 / (0.66 + 1.32), 6);
  });

  it("缓存命中率按整个 prompt 计，命中率低会被识别", () => {
    const good = collectCalls([header("deepseek-v4-pro"), usage({ at: 0, hit: 99e3, miss: 1e3, out: 10 })]);
    expect(good.cacheHitRate).toBeCloseTo(0.99, 6);
    const bad = collectCalls([header("deepseek-v4-pro"), usage({ at: 0, hit: 1e3, miss: 99e3, out: 10 })]);
    expect(bad.cacheHitRate).toBeCloseTo(0.01, 6);
    expect(bad.cacheHitRate < CACHE_HIT_FLOOR).toBe(true);
  });

  it("pro→flash 降档收益：按实测 token 结构重算，不改动命中结构", () => {
    const events = [header("deepseek-v4-pro"), usage({ at: beijing(2026, 9, 2, 20), hit: 1e6, miss: 1e5, out: 1e5 })];
    const col = collectCalls(events);
    const before = col.totals.cost;
    const r = rerouteSavings(col, "deepseek-pro", "deepseek-v4-flash");
    expect(r.movedCalls).toBe(1);
    expect(r.movedCost).toBeCloseTo(before, 9);
    // pro: 1e6*0.022 + 1e5*0.66 + 1e5*1.98 = 0.022+0.066+0.198 = 0.286
    // flash: 1e6*0.007 + 1e5*0.22 + 1e5*0.66 = 0.007+0.022+0.066 = 0.095
    expect(r.savedUsd).toBeCloseTo(0.286 - 0.095, 6);
  });

  it("压缩收益只算实测真正付过未命中价的那段，不外推", () => {
    // prompt 300k，保留 100k → tail 200k；但本调用只有 5k 是未命中，故最多省 5k 的价差
    const events = [header("deepseek-v4-pro"), usage({ at: beijing(2026, 9, 2, 20), hit: 295e3, miss: 5e3, out: 0 })];
    const col = collectCalls(events);
    const s = compactSavings(col, 100e3, col.cacheHitRate);
    expect(s.affectedCalls).toBe(1);
    // 5k × (0.66 - 0.022) / 1e6
    expect(s.savedUsd).toBeCloseTo((5e3 * (0.66 - 0.022)) / 1e6, 9);

    // prompt 未超阈值则不受影响
    const small = collectCalls([header("deepseek-v4-pro"), usage({ at: 0, hit: 50e3, miss: 1e3 })]);
    expect(compactSavings(small, 100e3, small.cacheHitRate).savedUsd).toBe(0);
    expect(compactSavings(small, 100e3, small.cacheHitRate).affectedCalls).toBe(0);
  });

  it("异常口径常量与文档一致", () => {
    expect(RUNAWAY_CALLS).toBe(200);
    expect(COST_PER_CALL_USD).toBe(0.02);
    expect(CACHE_HIT_FLOOR).toBe(0.95);
  });

  it("空事件不炸，返回零账本", () => {
    const col = collectCalls([]);
    expect(col.totals.calls).toBe(0);
    expect(col.cacheHitRate).toBe(1);
    expect(col.peakCostShare).toBe(0);
  });
});

describe("combinedLevers 互不重叠的组合收益", () => {
  it("各步收益之和 = 组合收益，且组合收益绝不超过基线账单（守恒律）", () => {
    const events = [
      header("deepseek-v4-pro"),
      usage({ at: beijing(2026, 9, 2, 10), hit: 250e3, miss: 20e3, out: 5e3 }), // 峰时、超阈值
      usage({ at: beijing(2026, 9, 2, 20), hit: 180e3, miss: 30e3, out: 8e3 }), // 谷时、超阈值
      header("gemini-3.1-pro-preview", "lute"),
      usage({ at: beijing(2026, 9, 2, 11), hit: 200e3, miss: 90e3, out: 4e3 }) // 贵档 + 低命中 + 超阈值
    ];
    const col = collectCalls(events);
    const c = combinedLevers(col, { keepTokens: 100e3 });

    expect(c.baselineUsd).toBeCloseTo(col.totals.cost, 9);

    const stepSum = c.steps.premium + c.steps.pro + c.steps.compact + c.steps.offPeak;
    expect(stepSum).toBeCloseTo(c.savedUsd, 9); // 不重复计数
    expect(c.savedUsd).toBeLessThanOrEqual(c.baselineUsd + 1e-9); // 不会省出比账单还多
    expect(c.savedShare).toBeLessThanOrEqual(1 + 1e-9);
    expect(c.afterOffPeakUsd).toBeCloseTo(c.baselineUsd - c.savedUsd, 9);

    // 每一步都必须是单调下降的（施加杠杆不会让账单变高）
    expect(c.afterPremiumUsd).toBeLessThanOrEqual(c.baselineUsd + 1e-9);
    expect(c.afterProUsd).toBeLessThanOrEqual(c.afterPremiumUsd + 1e-9);
    expect(c.afterCompactUsd).toBeLessThanOrEqual(c.afterProUsd + 1e-9);
    expect(c.afterOffPeakUsd).toBeLessThanOrEqual(c.afterCompactUsd + 1e-9);
  });

  it("已全部在 flash 上、无峰时、无超阈值 prompt 时，组合收益为零", () => {
    const events = [
      header("deepseek-v4-flash"),
      usage({ at: beijing(2026, 9, 2, 20), hit: 40e3, miss: 1e3, out: 500 })
    ];
    const col = collectCalls(events);
    const c = combinedLevers(col, { keepTokens: 100e3 });
    expect(c.savedUsd).toBeCloseTo(0, 9);
    expect(c.savedShare).toBe(0);
  });

  it("组合收益独立计算出的降幅落入 0–100%，不出现 >100% 的算术假象", () => {
    // 同一批 token 同时满足"贵档 + 峰时 + 超阈值"时，最容易被重复计数
    const events = [
      header("gemini-3.1-pro-preview", "lute"),
      usage({ at: beijing(2026, 9, 2, 10), hit: 100e3, miss: 300e3, out: 20e3 })
    ];
    const col = collectCalls(events);
    const c = combinedLevers(col, { keepTokens: 50e3 });
    // 这一单同时命中"贵档 + 峰时 + 超阈值"，可省掉绝大部分账单，但绝不能超过 100%
    expect(c.savedShare).toBeGreaterThan(0.85);
    expect(c.savedShare).toBeLessThanOrEqual(1);
  });
});
