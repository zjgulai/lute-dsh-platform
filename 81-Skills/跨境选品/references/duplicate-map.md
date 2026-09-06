---
title: Cross Border Product Selection Duplicate Map
doc_type: analysis
module: cross-border-product-selection
topic: duplicate-map
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# Duplicate Map

## 判定

`cross-border-product-selection` 作为正式 Skill 保留，不合并到现有 Skill。

## 对照表

| 既有 Skill | 重叠点 | 不足 | 结论 |
|---|---|---|---|
| `data-web-scrapy-designer` | 网页字段审计、采集方案设计 | 只负责设计低维护采集 PRD，不负责 SKU 展开、图片验证、JSON/CSV 硬校验 | 保留为上游设计 Skill |
| `da-amazon-sorftime-research` | Amazon 类目和商品研究 | 依赖 Sorftime/CSV/SP-API 数据，不强调 detail-page-first 和 variant 级原始采集 | 保留为下游分析 Skill |
| `pp-product-research-matrix` | 产品机会评估 | 负责评分矩阵，不处理页面级原始采集质量 | 不合并 |
| `cbec-market-viability-auditor` | 进入裁决 | 负责 Go/No-Go，不采集 SKU 原始数据 | 不合并 |

## RED 边界

如果任务是“设计网页采集字段”，优先 `data-web-scrapy-designer`。

如果任务是“分析已有 Sorftime/CSV 数据”，优先 `da-amazon-sorftime-research`。

如果任务是“从 ASIN/listing/category 页面生成 SKU-expanded JSON/CSV 并做硬校验”，使用 `cross-border-product-selection`。
