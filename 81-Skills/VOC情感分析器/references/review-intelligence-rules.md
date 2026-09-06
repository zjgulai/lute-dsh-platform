---
title: Review Intelligence Rules
doc_type: workflow
module: da-voc-sentiment-analyzer
topic: review-intelligence
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# Review Intelligence Rules

## Scope

Use this mode for batch review analysis when the user needs structured sentiment, complaints, praise, feature requests, priority, and recommendations.

Do not use this mode for cross-platform purchase-decision journey reconstruction. Route that to `cbec-customer-voice-analyzer`.

## Input Checklist

Ask for or infer:

- product or business name
- review sources
- date range
- sample size
- whether this is own product, competitor product, or category research
- known issues to validate

Do not require unavailable tool names such as `AskUserQuestion`. Use normal clarification or explicit assumptions.

## Analysis Layers

| Layer | Required Output |
|---|---|
| Collection summary | source, count, date range, rating coverage, known gaps |
| Sentiment overview | positive / neutral / negative, trend, emotional intensity |
| Aspect sentiment | sentiment by feature/theme |
| Issue discovery | top complaints ranked by frequency and severity |
| Praise discovery | top praise and recurring pros |
| Feature requests | missing or desired capabilities |
| Competitor mentions | competitor names, comparison reason, migration signal |
| Priority matrix | critical / important / nice-to-have |
| Action plan | owner, action, expected impact, evidence |

## Ranking Rules

Frequency alone is not enough. Rank issues using:

- frequency
- severity
- recency
- revenue or conversion impact
- safety or trust impact
- representative quote strength

## Output Template

```text
1. Sample Summary
2. Sentiment Overview
3. Aspect-Based Sentiment
4. Top Complaints
5. Top Praise
6. Feature Requests
7. Competitor Mentions
8. Priority Matrix
9. Action Plan
10. Notes
```

## Common Mistakes

- Treating scraping as automatically allowed. Only use public or authorized sources.
- Summarizing reviews without aspect-level sentiment.
- Mixing feature requests with complaints.
- Ranking only by frequency and ignoring severity.
- Producing generic recommendations without evidence or expected impact.
