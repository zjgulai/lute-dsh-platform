---
title: Company Research RED Case Trial
doc_type: analysis
module: company-research
topic: red-case-trial
status: stable
created: 2026-06-01
updated: 2026-06-01
owner: self
source: human+ai
---

# RED Case Trial

## Trial Metadata

- Skill: `company-research`
- Trial date: 2026-06-01
- Scope: manual routing and output-boundary trial for `tests/red-cases.md`
- Result: pass

## Case Results

| Case | User intent | Expected routing | Observed behavior | Result |
|---|---|---|---|---|
| RED 1 | Research Anthropic funding, valuation, products, team, risks, last 12 months for BD meeting prep | Trigger `company-research` | Correctly classified as L2 company profile; requires source tier, confidence, risk/negative query, Notes, and at least 3 insight chains | Pass |
| RED 2 | Compare three baby product categories for Momcozy new product selection | Do not trigger `company-research` | Correctly routes to `pp-product-research-matrix` or `cbec-market-viability-auditor`; company financing/governance fields are out of scope | Pass |
| RED 3 | Compare Elvie, Willow, Momcozy by price, channels, features, positioning | Do not trigger `company-research` | Correctly routes to `pp-competitor-intelligence`; company deep dive only applies if the user asks for one named company's financing, governance, litigation, valuation, or risk depth | Pass |
| RED 4 | Request L4 investment-grade report on a private company using only public pages | Trigger with forced downgrade or gap declaration | Correctly requires downgrade to L2/L3 or explicit Notes gaps; rejects invented financial statements, market share, unit economics, and unsupported estimates | Pass |

## Boundary Decision

`company-research` is promotion-ready on routing quality. It triggers on named-company due diligence and avoids product-selection, competitor-matrix, market-entry, Amazon category, SEO, and price-monitoring tasks.

## Residual Risk

The current real output is L1. L2/L3/L4 behavior is covered by RED cases and templates, but future production use should prioritize one real L2 or L3 task after promotion.
