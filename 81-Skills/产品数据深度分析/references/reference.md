# Jungle Scout 深度分析 — 参考手册

与 `SKILL.md` 配套：API 与 SDK 对照、指标定义、徽章、报告结构、CSV 模式、常见坑。撰写与实现时保持简洁可执行。

---

## 一、Jungle Scout：REST/文档名与 SDK 方法对照

文档或网关里常见 `_query` 后缀；**Python SDK 方法名通常更短**。错误方法名会导致 `AttributeError`。

| 文档/类型习惯写法 | SDK 正确调用（`ClientSync` 实例 `client`） | 典型用途 |
|------------------|------------------------------------------|----------|
| `keywords_by_keyword_query` | `client.keywords_by_keyword(...)` | 关键词扩展、精确/广泛量、PPC、自然竞品数 |
| `product_database_query` | `client.product_database(...)` | 按词/类目筛品、销量与价格带、竞品池 |
| `keywords_by_asin_query` | `client.keywords_by_asin(...)` | 单 ASIN 反查关键词（参数为单个 ASIN 字符串） |
| `sales_estimates_query` | `client.sales_estimates(...)` | ASIN 日粒度历史销量估算（非所有 ASIN 有数） |
| `historical_search_volume`（同名） | `client.historical_search_volume(...)` | 关键词历史搜索量，用于季节性 |
| `share_of_voice`（同名） | `client.share_of_voice(...)` | 品牌 SOV、自然/广告结构 |

**注意**：SDK **无** `client.keywords.xxx` 等子命名空间，方法均在 `client` 根上。

**常用参数记忆**：

- `product_database`：`include_keywords`、`categories` 等为 **list**，不可用单个字符串顶替。  
- `keywords_by_keyword`：主参为 **`search_terms`**（字符串），不是 `keyword=`。  
- `historical_search_volume`：`marketplace` 须为 **`Marketplace.US`** 等枚举，**不可**传 `'us'` 字符串。

---

## 二、指标定义（指标框架）

以下为管线中建议计算的**核心四类**；细分指标可在此基础上扩展。

### 1. 市场规模（代理指标）

- **主词月搜索量**：来自 `keywords_by_keyword` 的 `monthly_search_volume_exact`（主关键词行）。  
  - 粗阈值（仅作叙事参考）：>1 万偏大盘；5k–1 万中等；<5k 偏细分。  
- **头部卖家月收入量级**（可选）：由 `approximate_30_day_revenue` 或 `sales_estimates` × 价格推算，取 Top 样本最大值作「天花板」叙述。

### 2. 竞争强度（竞争指数叙事）

综合多项代理指标，**不要合成神秘黑箱指数**，报告中分项写明：

- **评论与评分门槛**：竞品池 `reviews`、`rating` 的均值或分位数（Top10/Top50）。  
  - 粗阈值：均评 <500 偏低门槛；500–2000 中等；>2000 偏高。  
- **自然结果竞品数**：`organic_product_count`（来自关键词结果）。  
- **品牌集中度**：见下「垄断/SOV」。

### 3. 季节性指数（基于历史搜索量）

对 `historical_search_volume` 返回的序列 \(v_1,\ldots,v_N\)（建议 \(N\ge 12\) 周或月点）：

- \(\text{mean} = \frac{1}{N}\sum v_i\)  
- \(\text{std} = \sqrt{\frac{1}{N}\sum(v_i-\text{mean})^2}\)  
- **变异系数** \(\text{CV} = \text{std} / \text{mean}\)（mean 为 0 则标记无有效量）

**分类建议**：CV > 0.5 → 偏「季节性/波动大」；CV ≤ 0.5 → 偏「平稳」；点数过少 → 「数据不足」。

### 4. 利润空间潜力（代理，非财报毛利）

- **价格带**：竞品 `price` 均值/分位。  
- **费用线索**：`fee_breakdown` 或 FBA 相关字段（若有）；无则仅讨论「结构敏感性」。  
- **广告成本上限线索**：`ppc_bid_exact` 区间；结合 SOV 中自然/付费占比判断**广告依赖风险**。

### 品牌集中度（常与竞争维度一起写）

来自 `share_of_voice` 的 `combined_weighted_sov`：

- `top1 = max(SOV)`，`top3 = sum(前三)`  
- top1 > 0.30 → 叙事上「单品牌强势」；top3 > 0.60 → 「多强集中」；否则 → 「相对分散」。若 top1 为 Amazon 相关展示，需单独说明。

---

## 三、数据源徽章定义

报告中每条**量化或关键定性结论**应能追溯到数据源。推荐在 Markdown 中使用语义化引用（可按渲染环境简化为纯文本括号）。

| 徽章 | 含义 | 典型内容 |
|------|------|----------|
| **Jungle Scout** | API 返回的结构化数据 | 搜索量、估算销量、SOV、关键词难度等 |
| **Amazon** | 商品页或基于 ASIN 的汇总 | 标题、价格、星级、评论数、类目、主图 |
| **Alibaba** | 供应商站点检索结果 | MOQ、标价区间、工厂名、链接 |
| **Web** | 公开检索 | 合规、认证、舆情、百科、新闻（非 JS 必标） |

**HTML 示例**（可选用）：

```html
<cite>[Jungle Scout](https://www.junglescout.com)</cite>
<cite>[Amazon](https://www.amazon.com)</cite>
<cite>[Alibaba](https://www.alibaba.com)</cite>
<cite>[Web](https://www.google.com)</cite>
```

**规则摘要**：同一连续段落同一来源只标一次；章节标题或表格标题可标主要来源。

---

## 四、`final_report.md` 建议结构

以下为强制逻辑顺序；具体标题语言随步骤 1 语言检测结果（zh/en）。

1. **元信息**：站点、时间窗口、核心关键词/类目、数据限制与缺口声明。  
2. **执行摘要（Executive Summary）**：3～7 条 bullet：做不做、谁有机会、最大风险。  
3. **八大维度**（每节：结论 → 数据依据+徽章 → 不确定性）：  
   市场规模；竞争格局；季节性；利润空间；进入壁垒；营销策略；细分机会；痛点分析。  
4. **产品推荐 / 样本解读**：基于 ~50 ASIN 表，价格带、差异化、可对标对象（如 Boppy、My Brest Friend、Momcozy）。  
5. **供应链与采购线索**：Alibaba 摘要表、MOQ/价格带、验厂与打样建议。  
6. **下一步行动**：补数清单、验证实验（小批量测款）、合规与认证待办。

---

## 五、CSV 模式定义

### 5.1 Jungle Scout 管线中间表（示例命名，可与脚本一致）

| 文件（示例） | 主要列（逻辑名） | 说明 |
|--------------|------------------|------|
| `keywords_market.csv` | keyword, monthly_search_volume_exact, monthly_search_volume_broad, ppc_bid_exact, ease_of_ranking_score, organic_product_count | 关键词层 |
| `competitors.csv` | asin_raw, title, brand, price, approximate_30_day_units_sold, approximate_30_day_revenue, reviews, rating, category, listing_quality_score, image_url | `asin_raw` 可能含 `us/B0XX` 前缀 |
| `keyword_trends.csv` | date, estimated_exact_search_volume | 历史搜索量 |
| `market_concentration.csv` | brand, combined_weighted_sov, organic_products, sponsored_products | SOV |

**ASIN 规范**：落盘可保留 `us/B0XXX`；调用 `sales_estimates` 前须 **`split('/')[-1]`** 得裸 ASIN。

### 5.2 交付用增强表（强烈建议）

**`final_recommendations.csv`**（约 50 行级）：

| 列 | 必填 | 说明 |
|----|------|------|
| asin | ✅ | 裸 ASIN |
| title | ✅ | |
| brand | ✅ | |
| price | ✅ | USD |
| sales_cnt_30d | ✅ | 估算或 JS 字段 |
| rating | ✅ | 禁止空 |
| reviews | ✅ | 禁止空 |
| net_margin_pct | ✅ | 估算百分比，注明假设 |
| prodUrl | ✅ | `https://www.amazon.com/dp/{asin}`（或对应站点域名） |
| imageUrl | ✅ | |

**`alibaba_supply.csv`**：

| 列 | 必填 |
|----|------|
| title, supplier_name, price_min, price_max, moq, supplier_rating, url | 全必填 |

---

## 六、常见陷阱与 SDK 要点

1. **客户端类型**：使用 **`ClientSync` + `with` 上下文**；不要用裸 `Client` 或未进入上下文的 `ClientSync`，否则易出现 **401/400 授权头无效**。  
2. **导入路径**：`from junglescout import ClientSync`（顶层包）；避免深层子模块导入导致初始化异常。  
3. **凭证**：具体项目可能通过**网关 dispatch** 或环境注入获取 `api_key_name` / `api_key`；**勿在技能文档或代码库中硬编码密钥**；沙箱未配置环境变量时不可用 `os.environ` 空值冒充已鉴权。  
4. **响应解析**：Pydantic 模型用 **`model_dump()`**，避免臆造 `.to_dict()`。  
5. **字段名**：`title` 非 `product_name`；`approximate_30_day_units_sold` 非 `monthly_sales`；**不存在** `product_url`，用 `https://www.amazon.{tld}/dp/{asin}` 拼接。  
6. **限流与错误**：429 退避重试；422 常见于 ASIN 无销量估算数据——跳过并记录，**报告仍须完整**。  
7. **速率参考**（以官方/租户配额为准）：常见文档级描述为约 **10 req/s**、日上限等，实际以密钥权限为准。

---

## 七、与 `SKILL.md` 的边界

- 本文件不替代官方 Jungle Scout OpenAPI 全文；字段以 SDK 实际 `model_dump()` 为准。  
- 脚本实现以项目 `scripts/` 为准；技能作者仅维护本文与 `SKILL.md` 时，应保证**报告模板与 CSV 列**与脚本输出一致或注明差异。
