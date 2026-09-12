/**
 * dsh-cost-guard — 价率表与峰谷口径（纯函数，无宿主依赖，可单测）。
 *
 * 计费构成（在 1129 份真实会话上核过恒等式）：
 *   prompt = cacheHit + cacheMiss，且 DSH 的 totalTokens = inputTokens + cacheReadTokens + outputTokens
 *   —— totalTokens 是整轮总数、含输出，绝不能当 prompt 长度用。
 *   cacheHitTokens 按缓存命中价计费，cacheMissTokens 按未命中价计费，outputTokens 按输出价计费。
 *
 * 为什么命中率会骗人：DeepSeek 命中价只有未命中价的 1/31（flash 谷时 0.007 vs 0.22）。
 * 命中率 98% 听起来很好，但剩下 2% 的未命中按 31 倍价计费，再乘上 25 万 token 的 prompt，
 * 才是账单真正的大头。所以本模块的收益计算一律落在「未命中 token × 调用次数」上。
 *
 * 峰谷（仅 DeepSeek 官方线路）：自 2026-08-16 起分峰谷，
 *   峰时 = UTC 01:00–04:00 与 06:00–10:00 = 北京时间 09:00–12:00、14:00–18:00，峰时价 = 谷时价 × 2；
 *   周六、周日全天按谷时价计费。
 *
 * 价率口径的三档可信度，对外一律显式标注，避免把估算当账单：
 *   - "list"      ：官方公开标准价，可直接对账（DeepSeek、Gemini、Anthropic、OpenAI）。
 *   - "estimated" ：我方线路是第三方中转/自建，实际单价随合同变动，这里只给参考价。
 *   - 覆盖方式    ：宿主 config.overrides[<rateKey>] = { hit, miss, out } 换成你的实际结算价。
 */

/** 估算里用到的美元兑人民币汇率，仅用于"人民币直觉"，不参与任何计费决策。 */
const USD_CNY = 7.1;

/**
 * 价率表（USD / 1M tokens，**谷时/非峰时**基准价）。
 * tiered：单价随 prompt 长度跳档，取 prompt 所在的最高档。
 * @type {Record<string, {
 *   hit: number, miss: number, out: number, peakMultiplier: number,
 *   confidence: "list" | "estimated",
 *   tiered?: Array<{ over: number, hit: number, miss: number, out: number }>
 * }>}
 */
const RATES = {
  "deepseek-flash": { hit: 0.007, miss: 0.22, out: 0.66, peakMultiplier: 2, confidence: "list" },
  "deepseek-pro": { hit: 0.022, miss: 0.66, out: 1.98, peakMultiplier: 2, confidence: "list" },
  "gemini-pro": {
    hit: 0.2,
    miss: 2.0,
    out: 12.0,
    peakMultiplier: 1,
    confidence: "list",
    // Gemini 3.1 Pro 超过 200K 上下文后输入翻倍、输出上调
    tiered: [{ over: 200000, hit: 0.4, miss: 4.0, out: 18.0 }]
  },
  "gemini-flash": { hit: 0.15, miss: 1.5, out: 9.0, peakMultiplier: 1, confidence: "list" },
  "gpt-5.5": { hit: 0.5, miss: 5.0, out: 30.0, peakMultiplier: 1, confidence: "list" },
  "claude-opus": { hit: 0.5, miss: 5.0, out: 25.0, peakMultiplier: 1, confidence: "list" },
  "claude-sonnet": { hit: 0.3, miss: 3.0, out: 15.0, peakMultiplier: 1, confidence: "list" },
  glm: { hit: 0.06, miss: 0.6, out: 2.2, peakMultiplier: 1, confidence: "estimated" },
  qwen: { hit: 0.05, miss: 0.5, out: 2.0, peakMultiplier: 1, confidence: "estimated" },
  unknown: { hit: 0.022, miss: 0.66, out: 1.98, peakMultiplier: 1, confidence: "estimated" }
};

/**
 * 把模型 id 归一到价率档位 key。
 * @param {unknown} model 模型 id（如 deepseek-v4-pro / gemini-3.1-pro-preview / claude-opus-4.7）
 * @returns {string} RATES 的键
 */
function rateKey(model) {
  const m = String(model ?? "").toLowerCase();
  if (m === "") return "unknown";
  if (m.includes("deepseek") || m.includes("dsh")) return m.includes("pro") ? "deepseek-pro" : "deepseek-flash";
  if (m.includes("gemini")) return m.includes("pro") ? "gemini-pro" : "gemini-flash";
  if (m.includes("gpt-5.5")) return "gpt-5.5";
  if (m.includes("claude")) {
    if (m.includes("opus")) return "claude-opus";
    if (m.includes("sonnet")) return "claude-sonnet";
    return "claude-opus";
  }
  if (m.includes("glm")) return "glm";
  if (m.includes("qwen")) return "qwen";
  return "unknown";
}

/**
 * 判断某个时间戳落在峰时段还是谷时段（北京时间口径）。
 * 峰：周一至周五 09:00–12:00、14:00–18:00；周末全天与其余时段为谷。
 * @param {number} epochMs 毫秒时间戳
 * @returns {"peak" | "off"}
 */
function bandOf(epochMs) {
  const t = new Date(Number(epochMs));
  if (!Number.isFinite(t.getTime())) return "off";
  const day = t.getDay(); // 0=周日 6=周六
  if (day === 0 || day === 6) return "off";
  const m = t.getHours() * 60 + t.getMinutes();
  return (m >= 9 * 60 && m < 12 * 60) || (m >= 14 * 60 && m < 18 * 60) ? "peak" : "off";
}

/**
 * 取某模型在某时段、某 prompt 长度下的价率。
 * @param {unknown} model 模型 id
 * @param {number} epochMs 调用发生的毫秒时间戳
 * @param {Record<string, Partial<{ hit: number, miss: number, out: number }>>} [overrides] 宿主覆盖价（谷时基准，USD / 1M）
 * @param {number} [promptTokens] 该次调用的输入侧 token（决定是否跳档）
 * @returns {{ key: string, band: "peak" | "off", rate: { hit: number, miss: number, out: number },
 *             confidence: "list" | "estimated", overridden: boolean, tiered: boolean, usdCny: number }}
 */
function rateFor(model, epochMs, overrides, promptTokens) {
  const key = rateKey(model);
  const spec = RATES[key] || RATES.unknown;
  const prompt = Number(promptTokens) || 0;
  let base = { hit: spec.hit, miss: spec.miss, out: spec.out };
  let tiered = false;
  if (Array.isArray(spec.tiered)) {
    for (const tier of spec.tiered) {
      if (prompt > tier.over) {
        base = { hit: tier.hit, miss: tier.miss, out: tier.out };
        tiered = true;
      }
    }
  }
  const ov = overrides && overrides[key] ? overrides[key] : null;
  if (ov) {
    if (typeof ov.hit === "number") base.hit = ov.hit;
    if (typeof ov.miss === "number") base.miss = ov.miss;
    if (typeof ov.out === "number") base.out = ov.out;
  }
  const band = bandOf(epochMs);
  const mul = band === "peak" ? spec.peakMultiplier : 1;
  return {
    key,
    band,
    rate: { hit: base.hit * mul, miss: base.miss * mul, out: base.out * mul },
    confidence: ov ? "list" : spec.confidence,
    overridden: Boolean(ov),
    tiered,
    usdCny: USD_CNY
  };
}

/**
 * 计算一次调用的花费（USD）。
 * @param {{ hit?: number, miss?: number, out?: number }} tokens 三类 token 数
 * @param {{ hit: number, miss: number, out: number }} rate 价率（USD / 1M）
 * @returns {number} USD
 */
function costOf(tokens, rate) {
  const hit = Math.max(Number(tokens.hit) || 0, 0);
  const miss = Math.max(Number(tokens.miss) || 0, 0);
  const out = Math.max(Number(tokens.out) || 0, 0);
  return (hit * rate.hit + miss * rate.miss + out * rate.out) / 1e6;
}

/**
 * 把单条 usage 归一成 token 三元组。
 *
 * 关键事实（在 1129 份真实会话上核过，99.8% 命中恒等式）：
 * `totalTokens = inputTokens + cacheReadTokens + outputTokens`，totalTokens 含输出。
 * 因此 prompt（输入侧）= inputTokens + cacheReadTokens，用 totalTokens 当 prompt 会串味。
 *
 * semantics 决定 inputTokens 的含义：
 *  - "dsh"      ：inputTokens = 未命中缓存的输入（按未命中价计费）；
 *  - "provider" ：inputTokens 照抄 API 的 prompt_tokens（含命中部分），未命中量 = inputTokens - cacheReadTokens。
 * @param {Record<string, unknown>} usage assistant/chunk 里的 usage 对象
 * @param {"dsh" | "provider"} [semantics] 该会话的计数习惯，缺省 "dsh"
 * @returns {{ hit: number, miss: number, out: number, prompt: number, reasoning: number, semantics: "dsh" | "provider" }}
 */
function normalizeUsage(usage, semantics) {
  const u = usage && typeof usage === "object" ? usage : {};
  const mode = semantics === "provider" ? "provider" : "dsh";
  const hit = Number(u.cacheReadTokens) || 0;
  const out = Number(u.outputTokens) || 0;
  const reasoning = Number(u.reasoningTokens) || 0;
  const rawInput = Number(u.inputTokens);
  if (Number.isFinite(rawInput)) {
    const miss = mode === "provider" ? Math.max(rawInput - hit, 0) : Math.max(rawInput, 0);
    return { hit, miss, out, prompt: hit + miss, reasoning, semantics: mode };
  }
  // 缺 inputTokens：只能用 totalTokens 反推，且必须扣掉命中与输出部分。
  const total = Number(u.totalTokens) || 0;
  const miss = Math.max(total - hit - out, 0);
  return { hit, miss, out, prompt: hit + miss, reasoning, semantics: mode };
}

/**
 * 判定一批 usage 采用的是哪种计数习惯（会话级，避免逐条猜导致混合口径）。
 * 判据是恒等式哪个成立得多，不是逐条推断。
 * @param {Array<Record<string, any>>} usages 一批 usage 对象
 * @returns {"dsh" | "provider"} 判定结果
 */
function detectConvention(usages) {
  let dsh = 0;
  let provider = 0;
  for (const u of Array.isArray(usages) ? usages : []) {
    if (!u || typeof u !== "object") continue;
    const input = Number(u.inputTokens);
    const hit = Number(u.cacheReadTokens) || 0;
    const out = Number(u.outputTokens) || 0;
    const total = Number(u.totalTokens) || 0;
    if (!Number.isFinite(input) || total <= 0) continue;
    if (total === input + hit + out) dsh += 1;
    else if (total === input + out) provider += 1;
  }
  return provider > dsh ? "provider" : "dsh";
}

export {
  USD_CNY,
  RATES,
  rateKey,
  bandOf,
  rateFor,
  costOf,
  normalizeUsage,
  detectConvention
};
