---
title: Cross Border Product Selection
doc_type: workflow
module: cross-border-product-selection
topic: skill-release
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# Cross Border Product Selection

`cross-border-product-selection` 是 SKU 级跨境选品采集与校验正式 Skill。它负责把公开或用户授权的商品详情页转化为可审计的 JSON 和 SKU-expanded CSV。

## 独立边界

它的独立价值不是“做选品分析”，而是保证选品分析前的数据采集足够细：

- listing page 只用于发现 ASIN。
- detail page 才是最终数据源。
- variant 必须展开为 SKU 级记录。
- 图片 URL 需要真实提取与可访问验证。
- 缺字段或校验失败时停止，不用 mock 或推断补齐。

## 晋升条件

- 通过 `skill-doctor --check`。
- 通过 `validate-skill --strict`。
- 完成 `tests/red-cases.md` 的人工试跑记录。
- 至少用一个真实公开页面或用户授权样本完成 JSON/CSV 输出。
- 证明其不能被 `data-web-scrapy-designer` 或 `da-amazon-sorftime-research` 完全替代。

## 试跑记录

| 日期 | 类型 | 输出 | 结果 |
|---|---|---|---|
| 2026-05-31 | Public detail page SKU expansion | `examples/allbirds-tree-runner-detail-page-trial-20260531.md` | 通过：7 个尺码变体展开为 7 行；图片 URL 来自页面结构化数据并 HEAD 200；同时修正 schema 支持非 Amazon `product_id` |
| 2026-06-01 | RED case boundary trial | `tests/red-case-trial-20260601.md` | 通过：listing-only、synthetic image URL、Sorftime CSV 误触发、inaccessible page mock 四类失败模式均被拒绝 |
| 2026-06-01 | Pre-promotion evaluation | `eval-reports/cross-border-product-selection-evaluation-summary.md` | 通过：92/100，无阻塞错误；结论为 `migrated_to_skills` |

## 当前结论

`cross-border-product-selection` 已迁移到 `skills/` 正式发布区。后续只在真实使用反馈出现时迭代；优先补一个公开或用户授权的 Amazon ASIN 样本，验证 ASIN、variant、图片和 CSV 字段在 Amazon 场景下的完整性。
