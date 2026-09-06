---
title: VOC Clustering Boundary Plan Trial
doc_type: analysis
module: da-ecommerce-ml-modeling-advisor
topic: voc-clustering-boundary
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# VOC Clustering Boundary Plan Trial

## Trial Metadata

- Skill: `da-ecommerce-ml-modeling-advisor`
- Trial type: real business modeling-plan scenario
- Scenario: VOC theme clustering with downstream churn/repurchase prediction boundary
- Data context: review, support ticket, order, and user tables are assumed; no production customer data is stored in this repo
- Outcome: pass; the plan separates unsupervised clustering from supervised prediction, rejects GBDT-as-clustering, defines stability metrics, and shows how cluster features can feed later labeled models.

## User Request

```text
我们有 Amazon 评论、官网评论、客服工单和退款原因，想把用户声音聚类成几个“问题人群”，再判断哪些人群更容易流失或复购。有人建议直接用 GBDT 来聚类。请给我一份建模方案，重点说明该怎么分群、怎么验证稳定性，以及什么时候才能接 GBDT。
```

## 1. Business Decision

- Decision owner: VOC, retention, product, and customer service teams.
- Business action: convert unstructured VOC into stable customer/problem segments, then decide which segments need product fixes, support recovery, retention offers, or downstream prediction.
- Target population: users or review/ticket authors with review text, ticket text, refund reason, or complaint theme linked to user/order identifiers.
- Success KPI: cluster stability, interpretability, and downstream action lift; not cluster count alone.

## 2. Modeling Task Definition

- Primary task type: unsupervised text clustering / segmentation.
- Secondary task type: supervised prediction only after labels exist.
- Clustering unit:
  - `voc_event_id` for raw theme discovery.
  - `user_id` after aggregating user-level VOC themes.
- Prediction unit for downstream models: `user_id`.
- Prediction time for downstream models: after VOC observation window closes and before retention/product action.
- Exclusions: spam reviews, duplicated syndicated reviews, unrelated support tickets, bot-like accounts, deleted or consent-restricted data.

## 3. Label And Time Window

### Clustering Phase

- No supervised label is required.
- Observation window: last 6-12 months of VOC text, segmented by channel and product category.
- Cluster target: latent themes or user problem segments inferred from text embeddings and structured complaint fields.
- Leakage risks:
  - Do not use future churn/repurchase labels while forming clusters.
  - Do not force clusters to match management's expected categories before inspecting data.
  - Do not merge channels blindly if Amazon reviews, site reviews, and support tickets have different sampling bias.

### Downstream Prediction Phase

- Label examples:
  - Churn: no valid paid order or no active behavior in the next 90 days.
  - Repurchase: valid paid order in the next 30/60/90 days.
  - Support escalation: repeat ticket or refund request in the next 30 days.
- Performance window: starts after VOC observation window.
- Cluster-derived features:
  - dominant_voc_cluster
  - cluster_confidence
  - cluster_entropy
  - negative_theme_count
  - product_issue_cluster_flag

## 4. Data Source And Feature Plan

| Source | Example fields | Feature direction | Risk |
|---|---|---|---|
| Amazon reviews | review_text, star_rating, review_date, verified_purchase | external product experience themes | marketplace sampling bias |
| Website reviews | review_text, product_id, user_id, rating | owned-site sentiment and fit/quality themes | lower volume |
| Support tickets | ticket_text, issue_type, resolution_time, escalation_flag | service friction and recovery signals | agent wording bias |
| Refund reasons | refund_reason, return_category, return_cost | post-purchase failure modes | label contamination if future refunds leak |
| Orders | product_category, order_date, margin, discount | user/product context | future order leakage |
| User profile | lifecycle_stage, acquisition_channel, country | segment context | stale profile |

## 5. Model Candidate Plan

- Clustering baseline:
  - Text normalization and language/channel split.
  - Sentence/document embeddings for VOC text.
  - KMeans for controllable cluster count.
  - HDBSCAN for density-based discovery when cluster count is unknown.
  - Bagging or repeated sampling to evaluate cluster stability.
- Topic/labeling support:
  - TF-IDF/keyphrase extraction per cluster.
  - Representative comments per cluster.
  - Human review for cluster naming and merge/split decisions.
- Downstream prediction candidates after labels exist:
  - Logistic Regression baseline for churn/repurchase/support escalation.
  - LightGBM/XGBoost/CatBoost using cluster features plus user/order/behavior features.
- Why these models:
  - Clustering is unsupervised, so GBDT is not the primary clustering method.
  - GBDT is appropriate later when there is a supervised label and cluster features become predictors.
- Why not more complex models:
  - No deep topic model until simple embeddings + clustering fail on interpretability/stability.
  - No stacking until downstream supervised baselines prove insufficient.

## 6. Validation Plan

- Clustering validation:
  - Silhouette score or density-based validity where applicable.
  - Cluster stability under bootstrap/re-sampling.
  - Top keywords and representative comments reviewed by humans.
  - Cluster size distribution and small-cluster audit.
  - Channel consistency: compare Amazon, owned-site, and support-ticket clusters.
- Business validation:
  - Do clusters map to actionable product/service issues?
  - Are clusters stable across product categories and time windows?
  - Can teams assign a clear owner to each cluster?
- Downstream prediction validation:
  - Time split by VOC observation date.
  - AUC/PR-AUC for churn/repurchase classification only after labels are defined.
  - Precision@TopK/Recall@TopK for intervention lists.
  - Lift or incremental retention by cluster-based action group.
- Boundary gate:
  - If no supervised label exists, do not use GBDT.
  - If clusters are unstable or uninterpretable, do not feed them into downstream prediction.

## 7. Explainability Plan

- Cluster explanation:
  - Cluster name.
  - Top terms/keyphrases.
  - Representative VOC snippets.
  - Dominant product/category/channel.
  - Common failure mode and recommended owner.
- User-level explanation:
  - Dominant cluster.
  - Confidence/entropy.
  - Example triggering VOC themes.
- Downstream model explanation:
  - SHAP or feature importance showing whether VOC clusters improve churn/repurchase prediction.
  - Compare model with and without cluster features.

## 8. Deployment/Scoring Plan

- Clustering cadence:
  - Monthly retraining or refresh for VOC theme discovery.
  - Weekly assignment of new VOC events to existing clusters if cluster definitions remain stable.
- Output tables:
  - `voc_event_cluster_assignments`
  - `user_voc_segment_features`
  - `cluster_dictionary`
  - `cluster_stability_report`
- Consumer workflow:
  - Product team receives product issue clusters.
  - Customer service receives recovery clusters.
  - CRM receives only user-level cluster features after privacy/consent review.
- Human review:
  - Cluster names and merge/split decisions require VOC/product owner review before operational use.

## 9. Monitoring Plan

- Data drift:
  - VOC volume by channel, language, product, and rating.
  - Embedding distribution shift.
  - New terms or product issues not represented in existing clusters.
- Cluster quality:
  - Stability score by month.
  - Share of unassigned/noise points.
  - Cluster size concentration.
  - Human label agreement.
- Downstream quality:
  - Predictive lift of cluster features.
  - Churn/repurchase Precision@TopK by cluster.
  - Intervention response by cluster.
- Alert threshold:
  - Large cluster disappears or splits sharply.
  - Noise/unassigned share exceeds threshold.
  - Cluster features lose downstream predictive contribution for two consecutive cohorts.

## 10. Business Action Mapping

| Segment | Signal | Action | Expected effect | Guardrail |
|---|---|---|---|---|
| Fit/size confusion cluster | Fit complaints, returns, low confidence in size choice | Improve size guide, targeted fit education | Lower return rate | Do not coupon before product-content fix |
| Durability concern cluster | Quality complaints, repeated service contacts | Product QA review and proactive support | Reduce churn and negative reviews | Escalate product issue owner |
| Price sensitivity cluster | Price complaints, coupon mentions, low margin | Low-cost nurture or value messaging | Avoid blanket discounting | Test holdout before incentives |
| Service recovery cluster | Delivery delay, unresolved support, refund friction | Human service recovery | Preserve high-value users | Avoid automated offers for legal/compliance issues |

## 11. Risks And Non-goals

- Known gaps:
  - Text sources have sampling bias; VOC writers are not the full customer base.
  - Cluster names can become subjective without human review.
  - Translation or multilingual embeddings may distort themes.
- Required data not yet available:
  - Stable user linkage across reviews, tickets, refunds, and orders.
  - Language and channel metadata.
  - Churn/repurchase labels for downstream supervised phase.
- Non-goals:
  - No GBDT clustering.
  - No production NLP pipeline implementation.
  - No direct customer targeting before consent and review.
  - No replacement for `da-voc-sentiment-analyzer` when the task is only sentiment/theme reporting.
- Next validation step:
  - Run sample embedding + KMeans/HDBSCAN comparison.
  - Human-review cluster labels.
  - Measure stability across bootstrap samples and monthly windows.
  - Only then test whether cluster features improve churn/repurchase prediction.

## Trial Verdict

Pass.

This trial exercises the RED boundary where GBDT must not be used as the unsupervised clustering method. It keeps clustering, interpretation, and downstream supervised prediction separate, and it defines the gate conditions under which cluster features can enter a GBDT-style model.
