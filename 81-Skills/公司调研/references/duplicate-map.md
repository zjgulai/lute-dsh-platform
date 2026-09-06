---
title: Company Research Duplicate Map
doc_type: analysis
module: company-research
topic: duplicate-map
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# Duplicate Map

## 判定

`company-research` 已作为正式 Skill 发布，不合并进现有 Skill。

## 对照表

| 既有 Skill | 重叠点 | 不足 | 结论 |
|---|---|---|---|
| `pp-competitor-intelligence` | 多源竞品信息收集、竞争策略洞察 | 以竞品矩阵和策略对比为中心，没有 L1-L4 深度、source tier、字段级 confidence 和尽调 Notes | 保留为下游/相邻 Skill |
| `pp-product-research-matrix` | 市场与机会研究 | 以产品/品类选择为中心，不处理公司融资、团队、治理、诉讼、估值冲突 | 不合并 |
| `cbec-market-viability-auditor` | 风险和进入判断 | 以 Momcozy 是否进入新品方向为中心，不生成公司级尽调报告 | 不合并 |
| `da-amazon-sorftime-research` | 数据驱动调研 | 聚焦 Amazon 类目和商品数据，不处理公司层面来源验证 | 不合并 |
| `seo-competitor-analyzer` | 竞品情报 | 聚焦 SEO 策略，不覆盖公司经营、融资、治理与风险字段 | 不合并 |

## RED 边界

如果任务要求“比较 5 个竞品的功能、价格、渠道”，优先 `pp-competitor-intelligence`。

如果任务要求“判断某品类是否值得进入”，优先 `cbec-market-viability-auditor` 或 `pp-product-research-matrix`。

如果任务要求“研究某家公司最新融资、估值、团队、诉讼、风险和引用来源”，使用 `company-research`。
