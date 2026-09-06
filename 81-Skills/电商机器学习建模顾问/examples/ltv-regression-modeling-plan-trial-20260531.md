---
title: LTV Regression Modeling Plan Trial
doc_type: analysis
module: da-ecommerce-ml-modeling-advisor
topic: ltv-regression-modeling
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# LTV Regression Modeling Plan Trial

## Trial Metadata

- Skill: `da-ecommerce-ml-modeling-advisor`
- Trial type: real business modeling-plan scenario
- Scenario: 90-day customer value / gross margin prediction
- Data context: DTC e-commerce warehouse tables are assumed; no production customer data is stored in this repo
- Outcome: pass; the plan handles regression labels, margin-adjusted value, time split, skewed-target treatment, segment-level evaluation, and business actions without turning into a BI report.

## User Request

```text
我们想预测用户未来 90 天能贡献多少毛利，用于决定 VIP 客服、会员权益和广告再营销预算。已有用户表、订单表、商品毛利、站内行为、营销触达、退款退货和客服工单。请给一份建模方案，不要只算历史 LTV 报表，也不要写训练代码。
```

## 1. Business Decision

- Decision owner: CRM, retention, and paid remarketing teams.
- Business action: allocate VIP service capacity, membership benefit level, and remarketing budget based on expected 90-day gross margin.
- Target population: active customers and high-intent leads with valid consent and enough behavioral/order history.
- Success KPI: incremental gross margin after action cost, not prediction accuracy alone.

## 2. Modeling Task Definition

- Task type: supervised regression.
- Prediction unit: `user_id`.
- Prediction time: weekly scoring cut, before any new campaign or VIP action.
- Target value: net gross margin contributed by the user in the next 90 days.
- Exclusions: wholesale accounts, suspected fraud, internal test users, orders with unresolved payment disputes, users without marketing/service eligibility.

## 3. Label And Time Window

- Observation window: 365 days before scoring date, with recency features at 7/30/90/180/365-day horizons.
- Performance window: scoring date to scoring date + 90 days.
- Positive label: numeric value `future_90d_gross_margin = paid_order_margin - discounts - refunds - return_cost - service_compensation`.
- Zero label: no valid paid order or no positive net margin in the 90-day performance window.
- Target transform:
  - Keep raw margin for business reporting.
  - Train candidate models on `log1p(max(future_90d_gross_margin, 0))` or winsorized margin if distribution is highly skewed.
- Leakage risks:
  - Do not use orders, refunds, tickets, campaign exposures, or VIP touches from the performance window.
  - Do not include features derived from future membership upgrades triggered by the model itself.
  - Do not let ad spend after scoring leak into pre-score features.

## 4. Data Source And Feature Plan

| Source | Example fields | Feature direction | Risk |
|---|---|---|---|
| User | lifecycle_stage, acquisition_channel, country, membership_tier | baseline customer profile | stale membership state |
| Order | recency, frequency, monetary, gross_margin_365d, avg_discount_rate | historical value and price sensitivity | future order leakage |
| Product | preferred_category, margin_band, replenishment_cycle, premium_sku_share | value potential by preference | sparse SKU history |
| Behavior | views_30d, carts_30d, wishlist_30d, searches_30d, session_recency | current intent strength | bot/noise |
| Marketing | email_open_rate, sms_click_rate, campaign_recency, prior_coupon_use | channel and incentive responsiveness | post-score campaign leakage |
| Aftersales | refund_rate, return_count, complaint_count, service_credit_amount | margin erosion and service risk | penalizing service-failed customers |
| VOC | positive themes, price sensitivity, quality complaints | reason-code enrichment | biased sample |

## 5. Model Candidate Plan

- Baseline:
  - Mean/median by lifecycle and RFM segment.
  - Linear regression or regularized regression on transformed target.
- Candidate models:
  - LightGBM regressor or XGBoost regressor for nonlinear tabular patterns.
  - CatBoost regressor if high-cardinality categorical features dominate.
  - Random Forest regressor as stability benchmark for noisy features.
- Why these models:
  - LTV/gross margin is a numeric target with skew and nonlinear behavior.
  - GBDT regression fits structured order, behavior, marketing, and service features.
- Why not more complex models:
  - No stacking until segment-level ROI and calibration prove a single GBDT regressor is insufficient.
  - No sequence/deep model unless there is dense event history and clear lift over GBDT.

## 6. Validation Plan

- Split strategy:
  - Use rolling time split by scoring date.
  - Train on older scoring cohorts, validate on later cohorts, test on the most recent closed 90-day window.
  - Keep future campaign interventions separate from pure prediction validation.
- Offline metrics:
  - MAE and RMSE on raw margin.
  - MAPE only for users with positive margin above a minimum threshold.
  - Spearman rank correlation for value ranking.
  - Top-decile capture rate: share of total future margin captured by top-scored users.
  - Calibration by predicted value decile.
- Business metrics:
  - Incremental margin from VIP/service/remarketing actions.
  - Cost per incremental gross-margin dollar.
  - False positive cost: high predicted LTV users who generate low or negative margin.
  - False negative cost: low predicted LTV users who later become high-margin customers.
- Segment checks:
  - New vs repeat customers.
  - Discount-heavy vs full-price buyers.
  - High-return vs low-return customers.
  - Category and country cohorts.
  - Paid acquisition vs organic acquisition.
- Threshold policy:
  - Select action bands by expected margin net of action cost, not by RMSE alone.
  - Keep a holdout for each action band to measure incremental effect.

## 7. Explainability Plan

- Global explanation:
  - SHAP summary for top features.
  - Decile-level calibration and captured-margin chart.
- Local explanation:
  - Reason codes such as "high gross margin history", "premium category preference", "recent high-intent browsing", "high return-cost risk", "discount-sensitive low margin".
- Guardrail:
  - Do not use protected or sensitive attributes.
  - Do not let service teams see raw behavioral surveillance details; expose business-safe reason codes only.

## 8. Deployment/Scoring Plan

- Scoring cadence: weekly, after order/refund/customer-service data closes.
- Output table/API:
  - `user_id`
  - `predicted_90d_gross_margin`
  - `prediction_decile`
  - `recommended_action`
  - `reason_code`
  - `eligibility_flags`
  - `model_version`
- Consumer workflow:
  - CRM uses top deciles for VIP benefits and personalized retention.
  - Paid media uses expected margin caps for remarketing audience bids.
  - Customer service uses high-value flags only where service policies permit.
- Human review requirement:
  - Finance approves action cost assumptions.
  - CRM validates action bands before launch.
- Non-claim:
  - This is a modeling design, not training code or a deployed scoring service.

## 9. Monitoring Plan

- Data drift:
  - Feature missing rates and distribution shifts for order, behavior, refund, and marketing fields.
  - Share of users with negative or zero net margin.
- Score distribution:
  - Predicted margin deciles.
  - Top-decile population size and expected margin share.
  - Distribution by category, country, and acquisition channel.
- Model quality:
  - MAE/RMSE by scoring cohort.
  - Calibration by decile.
  - Top-decile captured margin.
  - False-positive and false-negative value cost.
- Business KPI:
  - Incremental gross margin after action cost.
  - VIP/service capacity utilization.
  - Remarketing ROAS using predicted margin caps.
  - Return/refund rate among high-score users.
- Alert threshold:
  - Top-decile captured margin drops by more than 20% vs trailing average.
  - High-score users show elevated refund or service compensation cost.
  - Model calibration error grows across two consecutive scoring cohorts.

## 10. Business Action Mapping

| Score band | Segment | Action | Expected effect | Guardrail |
|---|---|---|---|---|
| Top 5% predicted margin | High-value, low service risk | VIP service, early access, premium retention | Maximize high-margin retention | Cap benefit cost and keep holdout |
| 5%-20% | Medium-high value or rising intent | Personalized bundles, paid remarketing, loyalty nudges | Grow repeat margin | Bid cap below expected margin |
| 20%-50% | Uncertain value | Low-cost content and email nurture | Learn with low cost | Avoid expensive perks |
| Bottom 50% or negative margin risk | Low expected margin or high return risk | No paid retargeting; service recovery only when justified | Reduce wasted spend | Manual review for strategic accounts |

## 11. Risks And Non-goals

- Known gaps:
  - Net gross margin needs reliable product cost, return cost, discount, and service compensation data.
  - New customers have sparse history; cold-start features may be weak.
  - High predicted value can be confounded by future marketing actions if holdouts are missing.
- Required data not yet available:
  - Fully reconciled gross margin by order line.
  - Finalized refund/return cost allocation.
  - Action-cost table for VIP benefits and remarketing bids.
- Non-goals:
  - No historical LTV dashboard.
  - No training code.
  - No real-time deployment.
  - No inventory replenishment or SKU selection.
- Next validation step:
  - Build a closed historical cohort with 90-day labels.
  - Run baseline segment model before GBDT.
  - Compare top-decile captured margin and calibration.
  - Launch action-band holdout before using the score for budget allocation.

## Trial Verdict

Pass.

This trial exercises a numeric regression task rather than classification/uplift. It forces label definition, target-window discipline, margin-aware metrics, segment checks, action-cost guardrails, and non-deployment boundaries.
