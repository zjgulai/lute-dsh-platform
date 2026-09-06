---
name: "customer-voice-analyzer"
title: "客户声音分析"
description: "- Mines customer reviews into 6 actionable dimensions — personas, scenarios, pros, cons, unmet needs, and buying motives. Use when analyzing Amazon product reviews to identify product flaws, extract high-converting marketing hooks, or find iteration opportunities."
workflow: "Complete this in three steps:\n1. Multi-Variant Review Scraping (collect balanced 1-5 star reviews from top-selling variants)\n2. 6-Dimensional Semantic Mapping (categorize into personas, scenarios, pros, cons, unmet needs, motives)\n3. Quantitative Ranking (rank by mention frequency, output iteration gaps and copy hooks)"
enabled: "true"
disable-model-invocation: true
---


# Customer Voice Analyzer

Transform raw customer reviews for $ARGUMENTS into structured business intelligence. Perform deep-dive semantic analysis of competitor reviews (parent + child ASINs) to answer: **"How should I improve my product, and what should my copy say?"**

---

## Core Workflow

### Step 1: Multi-Variant Review Scraping

Identify the top-selling variants of a competitor ASIN and extract a balanced sample of reviews across all star ratings.

**Process:**
1. Identify the parent ASIN and its top 3-5 child variants (by sales volume or review count)
2. For each variant, collect reviews across the full rating spectrum: 1-star, 2-star, 3-star, 4-star, 5-star
3. Aim for 100-200 reviews total; ensure balanced representation (don't over-sample 5-star)
4. Record: review text, star rating, variant purchased, verified purchase status, review date

**Why balanced sampling matters:** 5-star reviews reveal validated selling points; 1-2 star reviews expose critical flaws; 3-star reviews often contain the richest "wish list" insights — what nearly satisfied the customer but fell short.

---

### Step 2: 6-Dimensional Semantic Mapping

Categorize every piece of feedback into six intelligence buckets:

| Dimension | What It Captures | Example |
|-----------|-----------------|---------|
| **User Persona** | Who is buying? Demographics, experience level, buyer context | "Beginner gardeners", "Grandparents buying gifts", "Professional chefs" |
| **Usage Scenarios** | Where/when/how is it used? Real-world contexts | "Home gym", "Winter camping", "Daily commute", "Kids' birthday party" |
| **Positive Highlights (Pros)** | Validated selling points customers love | "Surprisingly quiet motor", "Fits perfectly in carry-on" |
| **Negative Pain Points (Cons)** | Critical flaws, technical complaints, quality issues | "Lid leaks after 2 weeks", "Instructions are incomprehensible" |
| **Unmet Expectations** | Features users wish they had — the iteration roadmap | "Wish it came in larger sizes", "Would be perfect if it had a timer" |
| **Buying Motives** | What triggered "Add to Cart" — the conversion hooks | "Saw it on TikTok", "Needed a gift under $30", "Switched from Brand X" |

**Tagging process:** Read each review and assign one or more dimension tags. A single review often contributes to multiple dimensions (e.g., a 3-star review might reveal a persona, a usage scenario, and an unmet expectation simultaneously).

---

### Step 3: Quantitative Ranking

Rank all findings within each dimension by mention frequency to separate signal from noise.

**For each dimension, compute:**
- **Finding** = Specific insight (e.g., "Lid leaks")
- **Mention Count** = Number of reviews mentioning this finding
- **Mention Rate %** = Mention Count / Total Reviews × 100%
- **Key Quote** = Most representative verbatim review excerpt

**Prioritization logic:**
- Cons with >10% mention rate = critical product flaw, must fix
- Pros with >15% mention rate = validated selling point, amplify in marketing
- Unmet Expectations with >5% mention rate = iteration opportunity worth exploring
- Buying Motives with high frequency = use as ad hooks and listing copy angles

---

## Output Format

### Dimension Tables (1-6)

One table per dimension, ranked by mention frequency:

| Rank | Finding | Mention Count | Mention Rate % | Key Quote |
|------|---------|---------------|----------------|-----------|
| 1 | [Finding] | [N] | [X]% | "[Verbatim quote]" |
| 2 | [Finding] | [N] | [X]% | "[Verbatim quote]" |
| ... | ... | ... | ... | ... |

### The "Iteration Gap" Analysis

```
Product: [ASIN / Product Name]
Reviews Analyzed: [N] reviews across [N] variants

TOP PRODUCT IMPROVEMENT OPPORTUNITIES:
1. [Pain point] — Mention rate: X% — Fix: [Specific recommendation]
2. [Unmet need] — Mention rate: X% — Fix: [Specific recommendation]
3. ...

CORE COPYWRITING HOOKS (from validated Pros + Motives):
1. [Hook] — Based on: [Pro/Motive with X% mention rate]
2. [Hook] — Based on: [Pro/Motive with X% mention rate]
3. ...

PERSONA-SCENARIO MATRIX:
- Primary buyer: [Persona] using product for [Scenario]
- Secondary buyer: [Persona] using product for [Scenario]
```

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Only reading 5-star reviews | 3-star reviews contain the richest "almost satisfied" insights; 1-2 star reviews reveal deal-breakers |
| Treating all mentions equally | A flaw mentioned by 30% of reviewers is fundamentally different from one mentioned by 2% — always quantify |
| Ignoring variant differences | Different variants (size, color, model) may have completely different pain points — analyze per-variant when relevant |
| Extracting findings without quotes | Always pair findings with verbatim quotes — they serve as ready-made copy and provide credibility |
| Over-indexing on vocal minorities | A single passionate 1-star rant ≠ a systematic product flaw; look for patterns across multiple reviews |

---

## Quick Reference

**6 Dimensions:** User Persona, Usage Scenarios, Pros, Cons, Unmet Expectations, Buying Motives

**Sample Size:** 100-200 reviews across all star ratings, balanced sampling

**Key Thresholds:**
- Cons >10% mention rate = critical flaw
- Pros >15% mention rate = validated selling point
- Unmet Expectations >5% = iteration opportunity

**Core Output:** Dimension tables (ranked by mention frequency) + Iteration Gap Analysis (product improvements + copywriting hooks)
