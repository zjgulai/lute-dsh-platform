---
title: Cross Border Product Selection RED Case Trial
doc_type: analysis
module: cross-border-product-selection
topic: red-case-trial
status: stable
created: 2026-06-01
updated: 2026-06-01
owner: self
source: human+ai
---

# Cross Border Product Selection RED Case Trial

## Trial Metadata

- Skill: `cross-border-product-selection`
- Skill path: `skills/cross-border-product-selection/`
- Trial type: manual RED case boundary trial
- Source cases: `tests/red-cases.md`
- Supporting real output: `examples/allbirds-tree-runner-detail-page-trial-20260531.md`
- Outcome: pass

## Trial Results

| Case | Expected Behavior | Observed Skill Behavior | Result |
|---|---|---|---|
| RED 1: listing page 不能当最终数据源 | listing page 只用于发现 ASIN，detail page 才能作为最终数据源，输出必须是 SKU-expanded CSV | `SKILL.md` 的 workflow 明确要求先确认 source type，再进入 detail page 或授权 detail JSON；`validation-gates.md` 要求 `Detail Page First` 和 `SKU Expansion` 两个硬门槛；真实 Allbirds 试跑使用 detail page 和 detail JSON 展开 7 个 SKU 行 | pass |
| RED 2: 图片 URL 不能从 ASIN 拼接 | 拒绝构造图片 URL，必须从 detail page 或结构化数据提取，并验证或标注 `image_unverified` | `validation-gates.md` 要求记录 image extraction method，禁止 synthetic URL；Allbirds 试跑的图片来自 `featured_image`，并记录 HTTP HEAD 200 和 `image/png` | pass |
| RED 3: 已有 Sorftime CSV 不应误触发 | 已有 Sorftime CSV 的供需、痛点、机会分析应路由到 `da-amazon-sorftime-research` | `SKILL.md` 的 description 和 `duplicate-map.md` 明确排除已有 Sorftime CSV 分析；本 Skill 只处理页面级 SKU 采集、图片校验和结构化输出 | pass |
| RED 4: 不可访问页面必须停止 | 页面不可访问或必填字段缺失时停止正式输出，不使用 mock、placeholder 或推断补齐 | `validation-gates.md` 要求 inaccessible page 记录为 failed item；`output-schema.md` 要求输出 `failed_asins`、`missing_fields` 和 `review_recommendations`；RED case 中的 mock 补齐被明确列为失败行为 | pass |

## Decision

`cross-border-product-selection` 通过 RED case 试跑。它的边界不是泛化网页采集，也不是已有 CSV 的市场分析，而是为跨境选品生成可审计的 SKU 级 detail-page-first 数据资产。

## Residual Risk

- 当前真实公开页试跑覆盖了 detail page、SKU expansion、图片提取和非 Amazon `product_id` 修正。
- Amazon ASIN 路径已有 schema、validation gates 和 RED cases 约束，但尚缺一个新的公开或授权 ASIN 样本输出。
- 该风险不阻塞晋升，因为 Skill 的核心失败模式已经由硬门槛覆盖；正式发布后应补充 Amazon 样本作为使用反馈迭代。
