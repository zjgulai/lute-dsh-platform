---
title: Repurchase Prediction Modeling Plan Example
doc_type: analysis
module: da-ecommerce-ml-modeling-advisor
topic: repurchase-prediction
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# Repurchase Prediction Plan Example

## Business Decision

目标是在用户完成一次有效订单后，对未来 30 天复购概率打分，用于召回、优惠券分层和客服触达优先级。

成功标准不是单纯 AUC，而是 TopK 用户触达后的复购提升、优惠券 ROI 和分群命中率。

## Modeling Task Definition

- Task type: binary classification。
- Prediction unit: user_id。
- Prediction time: 最近一次有效订单完成后的 T+1。
- Exclusions: 已退款订单、批发/异常订单、内部测试用户。

## Label And Time Window

- Observation window: 下单前 180 天和最近一单完成时刻之前的行为。
- Performance window: 最近一单后 30 天。
- Positive label: 30 天内产生新的有效 paid order。
- Negative label: 30 天内没有有效 paid order。
- Leakage risks: 不得使用表现窗内的加购、营销触达和订单字段。

## Feature Plan

| Feature group | Examples |
|---|---|
| RFM | days_since_last_order, order_count_180d, monetary_180d |
| Category preference | category_count, dominant_category, category_entropy |
| Lifecycle | first_purchase_age, membership_tier, acquisition_channel |
| Behavior | views_30d, cart_adds_30d, searches_30d |
| Marketing | email_opens_30d, coupon_used_before, campaign_exposure |
| Service | refund_count_180d, complaint_count_180d, delivery_delay_flag |

## Model Candidate Plan

- Baseline: Logistic Regression，用于验证标签、特征方向和校准可解释性。
- Main candidates: LightGBM、XGBoost、CatBoost。
- Reason: 电商结构化 tabular features 通常包含非线性、类别特征和稀疏行为信号。
- Non-default: Stacking 暂不使用，除非 baseline 和单模型在 TopK lift 上明显不足。

## Validation Plan

- Split: 按时间切分训练集、验证集、测试集。
- Offline metrics: AUC、PR-AUC、Precision@TopK、Recall@TopK。
- Business metrics: TopK lift、coupon ROI、incremental repurchase rate。
- Segment checks: 新客/老客、品类、国家、渠道。

## Explainability Plan

- 全局使用 feature importance 和 SHAP summary。
- 单用户输出 reason codes，例如“高品类复购历史”“近期加购强”“上次售后差”。
- 面向业务只输出可行动原因，不输出不可解释黑盒分数。

## Monitoring Plan

- 每周检查特征缺失率、分数分布、TopK 命中率和分群 ROI。
- 每月检查模型漂移、标签比例变化和关键特征 SHAP 排名变化。
- 当 TopK lift 连续两期低于阈值时触发重训或标签复盘。

## Business Action Mapping

| Score band | Action | Guardrail |
|---|---|---|
| Top 5% | 高价值召回或新品优先推荐 | 控制优惠券成本 |
| 5%-20% | 常规 EDM、推荐位和轻优惠 | 避免过度打扰 |
| 20%-50% | 内容触达和品类推荐 | 不做高成本激励 |
| Bottom 50% | 不主动补贴，进入长期培育池 | 保留自然复购对照 |
