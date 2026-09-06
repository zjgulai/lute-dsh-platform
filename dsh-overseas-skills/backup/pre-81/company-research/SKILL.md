---
name: company-research
title: "公司调研"
description: "- Company research using Exa search. Finds company info, competitors, news, tweets, financials, LinkedIn profiles, builds company lists. Use when researching companies, doing competitor analysis, market research, or building company lists."
context: fork
disable-model-invocation: true
---


# Company Research


> ⚠️ **环境说明（DSH）**：已接入 Exa 检索工具（exa_search）。优先调用 exa_search 完成调研；若工具返回「未配置 Exa API Key」，引导用户到 设置 → 出海技能 → 外部工具凭据 填写 Key，期间改用通用 web 检索并在结果中标注数据来源与检索时间。

## Tool Selection (Critical)

Exa search is available via **MCP tools** — no API key needed. Use **`accio-mcp-cli`** to invoke them (see **mcp-tools** / **accio-mcp-cli** skills). To discover or verify tool names, run `accio-mcp-cli search exa` (or `accio-mcp-cli toolkit`) before `call`.

**Preferred tools (in order):**

1. **`exa_web_search_exa`** (via `accio-mcp-cli call`) — supports `category`, `livecrawl`, `type`, `numResults`. Best for category-based searches (company, news, tweet, people).
2. **`web_search_exa`** (via `accio-mcp-cli call`) — supports `num_results`, `include_domains`, `exclude_domains`, `start_published_date`, `end_published_date`, `include_text`, `type`. Best for filtered/domain-scoped searches.
3. **`find_similar_pages_exa`** — find pages similar to a given URL.
4. **`get_page_contents_exa`** — extract text/summary from specific URLs.
5. **`exa_answer`** — get a direct answer with source citations.

**Fallback:** If Exa tools are unavailable (e.g. connection error, tool not found), ask the user to provide an `EXA_API_KEY` environment variable and use the Exa REST API directly via `bash`/`curl`.

### Calling Convention

All Exa MCP tools are invoked with `accio-mcp-cli call`. Prefer `--json` for nested parameters:

```bash
accio-mcp-cli call exa_web_search_exa \
  --json '{"query":"...","numResults":10,"type":"auto","category":"company"}'
```

## Token Isolation (Critical)

Never run Exa searches in main context. Always spawn Task agents:
- Agent runs Exa search internally
- Agent processes results using LLM intelligence
- Agent returns only distilled output (compact JSON or brief markdown)
- Main context stays clean regardless of search volume

## Dynamic Tuning

No hardcoded numResults. Tune to user intent:
- User says "a few" → 10-20
- User says "comprehensive" → 50-100
- User specifies number → match it
- Ambiguous? Ask: "How many companies would you like?"

## Query Variation

Exa returns different results for different phrasings. For coverage:
- Generate 2-3 query variations
- Run in parallel
- Merge and deduplicate

## Categories

Use appropriate Exa `category` (via `exa_web_search_exa`) depending on what you need:
- `company` → homepages, rich metadata (headcount, location, funding, revenue)
- `news` → press coverage, announcements
- `tweet` → social presence, public commentary
- `people` → LinkedIn profiles (public data)
- No category (`type: "auto"`) → general web results, deep dives, broader context

Start with `category: "company"` for discovery, then use other categories or no category with `livecrawl: "fallback"` for deeper research.

### Category-Specific Filter Restrictions

When using `category: "company"`, these parameters cause 400 errors:
- `includeDomains` / `excludeDomains`
- `startPublishedDate` / `endPublishedDate`
- `startCrawlDate` / `endCrawlDate`

When searching without a category (or with `news`), domain and date filters work fine.

**Universal restriction:** `includeText` and `excludeText` only support **single-item arrays**. Multi-item arrays cause 400 errors across all categories.

## LinkedIn

Public LinkedIn via Exa: `category: "people"`, no other filters.
Auth-required LinkedIn → use browser automation fallback.

## Browser Fallback

Auto-fallback to browser automation when:
- Exa returns insufficient results
- Content is auth-gated
- Dynamic pages need JavaScript

## Examples

### Discovery: find companies in a space
```bash
accio-mcp-cli call exa_web_search_exa \
  --json '{"query":"AI infrastructure startups San Francisco","category":"company","numResults":20,"type":"auto"}'
```

### Deep dive: research a specific company (with domain filters)
```bash
accio-mcp-cli call web_search_exa \
  --json '{"query":"Anthropic funding rounds valuation 2024","type":"deep","num_results":10,"include_domains":["techcrunch.com","crunchbase.com","bloomberg.com"]}'
```

### News coverage
```bash
accio-mcp-cli call web_search_exa \
  --json '{"query":"Anthropic AI safety","num_results":15,"start_published_date":"2024-01-01"}'
```

### LinkedIn profiles
```bash
accio-mcp-cli call exa_web_search_exa \
  --json '{"query":"VP Engineering AI infrastructure","category":"people","numResults":20}'
```

### Extract page content
```bash
accio-mcp-cli call get_page_contents_exa \
  --json '{"urls":["https://example.com/about"],"text":true,"summary":true}'
```

### Direct answer with citations
```bash
accio-mcp-cli call exa_answer \
  --json '{"query":"What is Anthropic latest valuation?","text":true}'
```

## Output Format

Return:
1) Results (structured list; one company per row)
2) Sources (URLs; 1-line relevance each)
3) Notes (uncertainty/conflicts)
