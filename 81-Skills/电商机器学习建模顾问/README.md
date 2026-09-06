---
title: E-Commerce ML Modeling Advisor
doc_type: workflow
module: da-ecommerce-ml-modeling-advisor
topic: skill
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# E-Commerce ML Modeling Advisor

## 定位

`da-ecommerce-ml-modeling-advisor` 是电商 ML 建模方案正式 Skill。

它承接的问题不是“分析一份数据表”，而是“把业务预测或分群问题设计成可验证、可解释、可落地的建模方案”。

## 候选来源

- `core_skills_library/集成算法01-使用场景及原理实例.md`
- `core_skills_library/算法模型库/预测类/GBDT/GBDT类算法模型原理与简介.md`
- `core_skills_library/算法模型库/预测类/GBDT/GBDT类算法模型案例.md`

## 验证重点

- 是否能稳定区分建模 advisor 与 BI 复盘、库存预测、选品分析。
- 是否能先定义标签和时间窗口，再选择模型。
- 是否能把模型指标转换为业务动作，而不是停留在算法说明。
- 是否能拒绝 AUC-only、随机切分误用、黑盒分数和未验证上线声明。

## 发布门槛

- 至少完成 3 次真实业务建模方案试跑。
- RED cases 中的误触发边界稳定通过。
- 输出模板能覆盖标签、特征、验证、解释、监控、动作六个核心部分。
- 经过 `lute-skills-eval` 内容评估，且正式迁移后重新通过结构和图谱校验。

## 试跑记录

| 日期 | 类型 | 输出 | 结果 |
|---|---|---|---|
| 2026-05-31 | Coupon uplift modeling plan | `examples/coupon-uplift-modeling-plan-trial-20260531.md` | 通过：定义 treatment/control、uplift 标签、时间切分、增量指标、TopK 动作和非部署边界 |
| 2026-05-31 | LTV regression modeling plan | `examples/ltv-regression-modeling-plan-trial-20260531.md` | 通过：定义 90 天毛利标签、回归目标、时间切分、MAE/RMSE/Top-decile capture、分层 ROI 和非 BI 报表边界 |
| 2026-05-31 | VOC clustering boundary plan | `examples/voc-clustering-boundary-plan-trial-20260531.md` | 通过：区分无监督聚类与有标签预测，拒绝 GBDT 聚类误用，并定义聚类稳定性与下游预测接入条件 |

## 发布评估记录

| 日期 | 报告 | 分数 | 结论 |
|---|---|---:|---|
| 2026-05-31 | `eval-reports/da-ecommerce-ml-modeling-advisor-evaluation-report.yaml` | 93/100 | 通过：无 error、无 warning，达到正式发布门槛 |
| 2026-06-01 | 发布复验 | 100/100 | 通过：正式迁移、索引同步和图谱一致性校验完成 |
