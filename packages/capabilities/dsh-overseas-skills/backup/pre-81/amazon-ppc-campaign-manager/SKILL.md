---
name: amazon-ppc-campaign-manager
title: "亚马逊PPC广告管理"
description: "- Plan, structure, and optimize Amazon Sponsored Products, Sponsored Brands, and Sponsored Display ad campaigns. Use this skill whenever the user asks about setting up their first PPC campaign, structuring ads for product launches, diagnosing high ACoS or low sales velocity, optimizing bids/budgets/keywords, or understanding the link between PPC and organic ranking."
disable-model-invocation: true
---


# Amazon PPC Campaign Manager

## Amazon PPC Ad Types


| Ad Type                | Best For                                  | Placement                             |
| ---------------------- | ----------------------------------------- | ------------------------------------- |
| **Sponsored Products** | Individual ASINs, driving sales rank      | Search results + product detail pages |
| **Sponsored Brands**   | Brand awareness, showcasing product range | Top of search results                 |
| **Sponsored Display**  | Retargeting, competitor conquesting       | On and off Amazon                     |


---

## Core Campaign Structure Framework

### The 3-Campaign Launch Blueprint (for new products)

**Campaign 1: Exact Match — Core Terms**

- Target: 5-10 highest-priority exact match keywords
- Goal: Drive rank for proven terms, control spend
- Bid: Start at suggested bid, adjust based on conversion data
- Budget: 60% of total daily budget

**Campaign 2: Broad Match — Discovery**

- Target: 10-20 broad match terms
- Goal: Discover converting long-tail variations
- Bid: 20-30% lower than exact match bids
- Budget: 25% of total daily budget
- Action: Weekly search term report review → harvest winners to Exact campaign

**Campaign 3: Auto Campaign — Harvesting**

- Target: Amazon-determined targeting (all match types)
- Goal: Surface unexpected keyword opportunities
- Bid: Lowest bids (minimize waste)
- Budget: 15% of total daily budget
- Action: Mine search term report weekly → add performers to manual campaigns, add irrelevant terms to negative keyword list

---

## Key Metrics & Benchmarks


| Metric    | Definition               | Healthy Range                                   |
| --------- | ------------------------ | ----------------------------------------------- |
| **ACoS**  | Ad spend ÷ Ad revenue    | Category-dependent; typically 15-35%            |
| **TACoS** | Ad spend ÷ Total revenue | Target <15% at scale; <25% during launch        |
| **CTR**   | Clicks ÷ Impressions     | >0.3% for Sponsored Products                    |
| **CVR**   | Orders ÷ Clicks          | >5-10% (varies by category and price point)     |
| **ROAS**  | Ad revenue ÷ Ad spend    | Inverse of ACoS; target ≥3x for most categories |


**Break-even ACoS formula:**
Break-even ACoS = Profit margin % (before ads)
Example: If your margin is 30%, you break even at 30% ACoS.
Target ACoS should be below break-even for profitable campaigns.

---

## Bid Optimization Rules

**When to increase bids (+10-20%):**

- Keyword converts well (CVR above category average) but impression share is low
- Keyword is ranking page 2-3 organically and you want to accelerate rank

**When to decrease bids (-10-20%):**

- ACoS has been above break-even for 14+ days with no rank improvement
- Keyword drives clicks but zero or very low conversions (CVR <2%)

**When to pause keywords:**

- 50+ clicks with zero orders
- ACoS consistently >2x your break-even ACoS for 30 days

---

## The Honeymoon Period Strategy

New ASINs receive an algorithmic boost in the first 30-90 days.
This window is critical — use it aggressively:

1. **Days 1-7**: Auto campaign + broad match to gather initial data
2. **Days 8-30**: Launch exact match campaigns for top converting terms from week 1
3. **Days 31-90**: Shift budget toward top performers, optimize bids daily
4. **After 90 days**: Reduce launch budgets, sustain rank with lower-ACoS campaigns

---

## Negative Keyword Strategy

Negative keywords prevent wasted spend on irrelevant searches.

**Always add as negatives:**

- Competitor brand names (unless intentional conquest strategy)
- Terms with 30+ clicks and zero orders
- Product types outside your category (e.g., if selling yoga mats, negate "yoga pants")

**Negative match types:**

- Negative Exact: Block only that precise search term
- Negative Phrase: Block any search containing that phrase

---

## PPC → Organic Ranking Connection

Every PPC sale for a specific keyword sends a ranking signal to Amazon's algorithm.
The more PPC-driven sales for keyword X, the higher your organic rank for keyword X.

**Practical implication:**

- Prioritize PPC spend on keywords where you want to improve organic rank
- Track keyword rank weekly using Seller Central Brand Analytics
- Once organic rank reaches page 1 for a term, you can reduce PPC bids for it
- TACoS will naturally decrease as organic sales grow

---

## Campaign Audit Checklist (Run Weekly)

- Review Search Term Report — harvest new exact match winners
- Add new negative keywords for irrelevant high-spend terms
- Adjust bids on top 20 keywords based on 7-day ACoS
- Check budget — is any campaign hitting daily budget cap before 6pm?
- Review impression share — are core terms getting enough visibility?
- Check for duplicate keywords across campaigns (causes internal bidding competition)

---

## Common Mistakes


| Mistake                                     | Impact                        | Fix                                      |
| ------------------------------------------- | ----------------------------- | ---------------------------------------- |
| Setting and forgetting campaigns            | ACoS creeps up, budget wasted | Weekly optimization cadence              |
| Running only auto campaigns                 | Limited control, high waste   | Always pair with manual exact match      |
| Pausing campaigns during slow periods       | Loses ranking signals         | Reduce bids by 30-50% instead of pausing |
| Targeting too many keywords in one campaign | Diluted budget, data noise    | Max 10-15 keywords per ad group          |
| Ignoring Search Term Report                 | Missing converting long-tails | Review weekly, harvest into exact match  |


