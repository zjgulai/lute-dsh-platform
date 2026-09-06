---
title: E-Commerce ML Modeling Output Template
doc_type: workflow
module: da-ecommerce-ml-modeling-advisor
topic: output-template
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# Output Template

## 1. Business Decision

- Decision owner:
- Business action:
- Target population:
- Success KPI:

## 2. Modeling Task Definition

- Task type:
- Prediction unit:
- Prediction time:
- Exclusions:

## 3. Label And Time Window

- Observation window:
- Performance window:
- Positive label:
- Negative label:
- Leakage risks:

## 4. Data Source And Feature Plan

| Source | Example fields | Feature direction | Risk |
|---|---|---|---|
| User | lifecycle, country, acquisition channel | user profile | stale profile |
| Order | recency, frequency, monetary, category mix | RFM and category intent | leakage from future orders |
| Product | category, price band, brand, margin | product preference | sparse SKU history |
| Behavior | views, carts, searches, clicks | intent strength | bot/noise |
| Marketing | exposure, coupon, email, ad touch | treatment history | causal confusion |
| Aftersales | refunds, complaints, returns | service friction | label contamination |
| VOC | themes, sentiment, pain points | qualitative signals | sampling bias |

## 5. Model Candidate Plan

- Baseline:
- Candidate models:
- Why these models:
- Why not more complex models:

## 6. Validation Plan

- Split strategy:
- Offline metrics:
- Business metrics:
- Segment checks:
- Threshold/TopK policy:

## 7. Explainability Plan

- Global explanation:
- Local explanation:
- Business-readable reason codes:

## 8. Deployment/Scoring Plan

- Scoring cadence:
- Output table/API:
- Consumer workflow:
- Human review requirement:

## 9. Monitoring Plan

- Data drift:
- Score distribution:
- Model quality:
- Business KPI:
- Alert threshold:

## 10. Business Action Mapping

| Score band | Segment | Action | Expected effect | Guardrail |
|---|---|---|---|---|
| Top 5% |  |  |  |  |
| 5%-20% |  |  |  |  |
| 20%-50% |  |  |  |  |
| Bottom 50% |  |  |  |  |

## 11. Risks And Non-goals

- Known gaps:
- Required data not yet available:
- Non-goals:
- Next validation step:
