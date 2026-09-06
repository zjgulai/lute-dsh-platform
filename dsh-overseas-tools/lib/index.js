/**
 * dsh-overseas-tools — 出海技能外部工具接入（host-only）。
 *
 * - exa_search：Exa 公开网络检索工具（公司调研 / 人物背景 / 组织架构）。
 *   凭据 ref = "overseas_exa"（credentials.resolve 每次调用现读，改 Key 无需重启）。
 *   未配置 Key 时返回配置指引（优雅降级，绝不编造结果）。
 * - 预留凭据位：overseas.jungle-scout / overseas.klaviyo（Tier 2，待账号接入后实现）。
 */
import { defineTool } from "@deepseek-ai/dsh-tools";

const name = "dsh-overseas-tools";
const inject = ["credentials", "tools"];

const EXA_ENDPOINT = "https://api.exa.ai/search";
const EXA_TIMEOUT_MS = 25000;

async function exaSearch(ctx, query, numResults, type, signal) {
    let resolved;
  try {
    resolved = await ctx.credentials.resolve("overseas_exa");
  } catch (e) {
    return { ok: false, error: `凭据解析失败: ${e?.message ?? e}` };
  }
  if (resolved === undefined) {
    return {
      ok: false,
      error:
        "未配置 Exa API Key：请在 设置 → 出海技能 页面的「外部工具凭据」里填写 Exa API Key 后再试（可在 https://exa.ai 获取）。"
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXA_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const r = await fetch(EXA_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": resolved.value },
      body: JSON.stringify({
        query,
        numResults,
        type,
        contents: { text: { maxCharacters: 1500 } },
        useAutoprompt: true
      }),
      signal: controller.signal
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { ok: false, error: `Exa API HTTP ${r.status}: ${text.slice(0, 300)}` };
    }
    const data = await r.json();
    const results = Array.isArray(data?.results) ? data.results.slice(0, numResults) : [];
    return {
      ok: true,
      results: results.map((it) => ({
        title: String(it.title ?? ""),
        url: String(it.url ?? ""),
        publishedDate: String(it.publishedDate ?? ""),
        author: String(it.author ?? ""),
        text: typeof it.text === "string" ? it.text.slice(0, 1500) : ""
      }))
    };
  } catch (error) {
    return { ok: false, error: `Exa 请求失败: ${error?.message ?? error}` };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function renderExa(_args, value) {
  if (value?.ok !== true) return [{ type: "text", text: value?.error ?? "Exa 检索失败" }];
  if (!Array.isArray(value.results) || value.results.length === 0) return [{ type: "text", text: "Exa 无结果。" }];
  const text = value.results
    .map(
      (it, i) =>
        `[${i + 1}] ${it.title}\n${it.url}${it.publishedDate ? `（${it.publishedDate}）` : ""}\n${it.text ? it.text.slice(0, 500) : ""}`
    )
    .join("\n\n");
  return [{ type: "text", text }];
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "exa_search",
    description:
      "用 Exa 检索公开网络信息（公司调研、人物背景、组织架构、行业新闻等公开情报）。已配置 Exa API Key 时可用；未配置时返回配置指引。英文查询效果最佳。",
    parameters: {
      query: { type: "string", required: true, description: "检索问题或关键词（建议英文）" },
      numResults: { type: "integer", description: "返回条数 1-10，默认 5" },
      type: {
        type: "string",
        enum: ["auto", "keyword", "neural"],
        description: "检索模式：auto 自动 / keyword 关键词 / neural 语义，默认 auto"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          error: { type: "string" },
          results: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                publishedDate: { type: "string" },
                author: { type: "string" },
                text: { type: "string" }
              }
            }
          }
        }
      },
      render: renderExa
    },
    timeoutMs: EXA_TIMEOUT_MS,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const query = String(args?.query ?? "").trim();
      if (query === "") return { ok: false, error: "query 不能为空" };
      const numResults = Math.min(10, Math.max(1, Number(args?.numResults) || 5));
      const type = args?.type === "keyword" || args?.type === "neural" ? args.type : "auto";
      return exaSearch(ctx, query, numResults, type, exec?.signal);
    }
  }));
}

export { name, inject };
