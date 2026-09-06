---
title: Coupon Uplift Modeling Plan Trial
doc_type: analysis
module: da-ecommerce-ml-modeling-advisor
topic: coupon-uplift-modeling
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# Coupon Uplift Modeling Plan Trial

## Trial Metadata

- Skill: `da-ecommerce-ml-modeling-advisor`
- Trial type: real business modeling-plan scenario
- Scenario: DTC e-commerce coupon response / uplift targeting
- Data context: user-provided warehouse tables are assumed; no production customer data is stored in this repo
- Outcome: pass; the plan defines treatment/control, uplift label, leakage risks, incremental metrics, action bands, and explicitly rejects AUC-only or direct deployment claims.

## User Request

```text
我们是 DTC 电商品牌，有订单、站内行为、邮件/短信触达、优惠券发放和售后数据。现在优惠券成本太高，想用模型判断哪些用户值得发 10% off coupon，哪些用户不该发。请给我一份建模方案，不要写训练代码，也不要只做经营复盘。
```

## 1. Business Decision

- Decision owner: CRM / retention marketing team.
- Business action: decide whether a user should receive a 10% off coupon in the next retention campaign.
- Target population: opted-in users with at least one paid order or high-intent browsing behavior in the last 180 days.
- Success KPI: incremental gross margin from coupon targeting, not raw coupon redemption rate.

## 2. Modeling Task Definition

- Task type: treatment response / uplift modeling.
- Prediction unit: `user_id`.
- Prediction time: campaign selection day before coupon exposure.
- Treatment: receives 10% off coupon through email/SMS/push.
- Control: eligible users held out from coupon exposure or receiving non-discount content.
- Exclusions: users without marketing consent, users already in active discount flows, suspected resellers, fraud/risk holds, users with unresolved service disputes.

## 3. Label And Time Window

- Observation window: 180 days before campaign selection.
- Treatment window: coupon exposure day to exposure day + 7 days.
- Performance window: exposure day to exposure day + 14 days.
- Positive business outcome: incremental paid order or incremental gross margin attributable to coupon exposure.
- Negative outcome: no incremental order, order that would likely happen without coupon, margin loss due to unnecessary discount, or elevated return/refund risk.
- Leakage risks:
  - Do not use coupon redemption, post-exposure clicks, post-exposure carts, or post-exposure orders as features.
  - Do not train on historical coupon recipients only; that learns redemption propensity, not uplift.
  - Do not mix random holdout and manually selected coupon audiences without a bias flag.

## 4. Data Source And Feature Plan

| Source | Example fields | Feature direction | Risk |
|---|---|---|---|
| User | lifecycle_stage, country, acquisition_channel, consent_status | user profile and eligibility | stale consent state |
| Order | recency, frequency, monetary, gross_margin, discount_history | price sensitivity and natural purchase propensity | margin leakage |
| Product | preferred_category, price_band, replenishment_cycle | category-specific response | sparse category history |
| Behavior | views_30d, cart_adds_14d, search_terms, product_revisits | current purchase intent | post-exposure leakage |
| Marketing | last_campaign_type, email_opens, sms_clicks, coupon_exposure_count | channel responsiveness | treatment assignment bias |
| Aftersales | refund_count, return_rate, complaint_count, delivery_delay_flag | discount abuse and service friction | punishing service-failed users |
| VOC | price complaint themes, fit/quality sentiment, feature requests | reason code enrichment | sampling bias |

## 5. Model Candidate Plan

- Baseline: logistic regression for purchase propensity in treatment and control groups, mainly to audit feature direction and calibration.
- Primary candidates:
  - Two-model uplift: separate treatment and control response models, then score `P(order|treatment) - P(order|control)`.
  - Uplift tree / causal forest: compare against two-model approach if randomized holdout volume is sufficient.
  - LightGBM or CatBoost response models: useful for tabular nonlinearity and categorical fields such as channel, category, country, and lifecycle stage.
- Why these models:
  - Coupon targeting is not ordinary classification; the decision depends on incremental effect.
  - GBDT-style models are useful inside response estimation, but the business score must be uplift or incremental margin.
- Why not more complex models:
  - No stacking until randomized holdout and uplift metrics prove single-model approaches are insufficient.
  - No deep learning unless there is high-volume sequence behavior data and a clear incremental lift gain.

## 6. Validation Plan

- Split strategy:
  - Use time-based train/validation/test split by campaign date.
  - Keep a randomized holdout in each future campaign for unbiased measurement.
  - If historical treatment was non-random, mark offline uplift estimates as biased and validate with prospective A/B test.
- Offline metrics:
  - AUUC / Qini coefficient.
  - Uplift@TopK.
  - Treatment/control conversion gap by score decile.
  - Calibration of treatment and control response probabilities.
- Business metrics:
  - Incremental gross margin.
  - Coupon cost per incremental order.
  - Incremental revenue net of discount and return cost.
  - Unnecessary discount rate for users likely to buy without coupon.
- Segment checks:
  - New vs returning users.
  - Category preference.
  - Country/region.
  - High-margin vs low-margin products.
  - Prior discount-heavy vs full-price buyers.
- Threshold/TopK policy:
  - Select thresholds by incremental margin and channel capacity, not by AUC.
  - Keep a no-coupon control group in every score band.

## 7. Explainability Plan

- Global explanation:
  - SHAP or feature importance for treatment and control response models.
  - Decile-level uplift chart with margin contribution.
- Local explanation:
  - Business-readable reason codes: "high intent but low natural purchase probability", "discount-sensitive repeat buyer", "likely natural buyer, suppress coupon", "high return risk, suppress coupon".
- Guardrail:
  - Do not show raw model scores to CRM operators without action reason and margin implication.

## 8. Deployment/Scoring Plan

- Scoring cadence: before each retention campaign, usually daily or weekly.
- Output table/API:
  - `user_id`
  - `uplift_score`
  - `expected_incremental_margin`
  - `recommended_action`
  - `reason_code`
  - `eligibility_flags`
- Consumer workflow:
  - CRM tool pulls only eligible users and action bands.
  - Marketing keeps random holdout by band.
- Human review requirement:
  - CRM owner reviews suppression rules and budget impact before launch.
- Non-claim:
  - This is a modeling and scoring design, not a production training or deployment implementation.

## 9. Monitoring Plan

- Data drift:
  - Missing rates for behavior, order, and campaign fields.
  - Consent status distribution.
  - Campaign mix and coupon exposure history.
- Score distribution:
  - Uplift score deciles and expected margin distribution.
  - Share of users in coupon / no-coupon / content-only actions.
- Model quality:
  - Prospective uplift by score decile.
  - Treatment/control conversion and gross margin gap.
  - Return/refund rate by action band.
- Business KPI:
  - Incremental gross margin.
  - Coupon budget usage.
  - Incremental orders.
  - Margin leakage from unnecessary coupons.
- Alert threshold:
  - Top-decile uplift falls below control by two campaigns.
  - Coupon cost per incremental order exceeds gross margin threshold.
  - Feature missing rate increases by more than 10 percentage points.

## 10. Business Action Mapping

| Score band | Segment | Action | Expected effect | Guardrail |
|---|---|---|---|---|
| Top 5% uplift | High intent, low natural conversion | Send 10% coupon | Highest incremental margin | Keep 10-20% holdout |
| 5%-20% uplift | Moderate intent or discount-sensitive repeat buyers | Send lower-cost incentive or free shipping | Moderate incremental orders | Cap discount budget |
| 20%-50% uplift | Likely natural buyers or low margin | Content-only recommendation | Avoid unnecessary discount | Suppress coupon |
| Negative uplift | High return risk, low margin, or discount abuse signal | No coupon; service recovery or nurture if needed | Reduce margin leakage | Manual review for VIP users |

## 11. Risks And Non-goals

- Known gaps:
  - Historical coupon assignment may be biased if campaigns targeted only high-value users.
  - Review/VOC features may overrepresent users who leave feedback.
  - Uplift estimates require ongoing randomized holdout to stay credible.
- Required data not yet available:
  - Reliable campaign exposure logs.
  - Randomized holdout flags.
  - Gross margin and return cost by order.
- Non-goals:
  - No training code.
  - No production deployment.
  - No campaign copywriting.
  - No inventory replenishment or SKU selection.
- Next validation step:
  - Run one shadow scoring cycle on historical campaigns.
  - Launch a prospective A/B test with score bands and randomized holdout.
  - Compare incremental margin, not only coupon redemption.

## Trial Verdict

Pass.

This trial exercises a different task from repurchase prediction. The output keeps the task at modeling-plan level, forces treatment/control framing, rejects AUC-only success, maps model scores to CRM actions, and preserves the boundary against BI reporting, inventory forecasting, product selection, and production deployment.
