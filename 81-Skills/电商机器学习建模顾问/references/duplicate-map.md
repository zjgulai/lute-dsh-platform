---
title: E-Commerce ML Modeling Advisor Duplicate Map
doc_type: analysis
module: da-ecommerce-ml-modeling-advisor
topic: duplicate-map
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# Duplicate Map

## 结论

当前仓库没有完整覆盖“电商业务问题 -> 标签/特征/模型选择 -> 验证指标 -> 解释监控 -> 业务动作”的通用建模 advisor。

因此本能力已在完成 under_review 试跑和内容评估后发布到 `skills/da-ecommerce-ml-modeling-advisor/`。

## 相邻 Skill 边界

| Skill | 已覆盖 | 不覆盖 | 路由结论 |
|---|---|---|---|
| `da-ecom-insights` | 订单、销售、经营数据复盘 | 建模标签、模型族选择、验证指标、模型监控 | 常规 BI 复盘不触发本 Skill |
| `scm-inventory-forecaster` | 需求预测、补货、安全库存、断货风险 | 通用用户预测、营销响应、LTV、VOC 分群建模 | 库存运营问题不触发本 Skill |
| `cbec-product-data-analyzer` | 产品和市场数据决策备忘录 | ML 建模任务定义和验证方案 | 产品市场分析不触发本 Skill |
| `da-voc-sentiment-analyzer` | 评论情绪、痛点、主题、行动建议 | 聚类稳定性、预测建模、特征/标签设计 | VOC 可作为特征源，但不替代本 Skill |
| `pp-product-research-matrix` | 选品矩阵、机会评估、竞品比较 | 预测模型与监控方案 | 选品判断不触发本 Skill |

## 新建理由

- 来源文档包含 GBDT、ensemble、repurchase、churn、coupon targeting、LTV、VOC clustering、monitoring 等跨场景模型设计规则。
- 现有数据分析类 Skill 多数从已有数据生成报告，不负责把业务决策转成可验证建模任务。
- 该能力的核心风险在于误用模型，因此需要独立 RED cases 约束标签、时间切分、TopK 指标和业务动作映射。
