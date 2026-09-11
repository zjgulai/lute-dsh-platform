---
name: "trend-stage-timing-analyzer"
title: "趋势阶段时机分析器"
description: "- Determines whether a product is in early growth, peak momentum, or saturation by analyzing ad libraries (TikTok, Facebook), Google Trends, and marketplace traction. Use when validating product timing for Shopify, DTC, or dropshipping, or when assessing ad saturation and trend momentum."
workflow: "Complete this in five steps:\n0. Inputs & Assumptions (required) — Extract user inputs; state assumptions if missing (product category, target market).\n1. Determine Product Type (trending vs. best-selling)\n2. Multi-Channel Product Research (ads, e-commerce, tools, YouTube)\n3. Validate Keyword Heat with Google Trends\n4. Timing Verdict (Early Growth / Peak Momentum / Saturation)"
enabled: "true"
disable-model-invocation: true
---


# Trend-Stage Timing Analyzer

Analyze the lifecycle stage and market entry timing for $ARGUMENTS. Determine whether the product is in early growth, peak momentum, or saturation — and whether entry is viable.

> **Scope:** For Etsy/POD product discovery, use `scenario-driven-product-scout`. For Amazon FBA viability, use `market-viability-logic-auditor`. For Etsy listing SEO, use `etsy-seo-optimizer`.

**Template Compliance:** Before generating the product research report, read the template at `${CLAUDE_SKILL_DIR}/templates/product-research-report.md` using `read_file` and follow its structure exactly. Include every section, fill all placeholders with actual data, and do not skip, reorder, or add sections.

**Required:** Always complete Step 0 (Inputs & Assumptions) before proceeding. State product category and target market explicitly; if the user did not provide them, list assumptions clearly.

---

## Core Workflow

### Step 0: Inputs & Assumptions (Required)

Before any analysis, capture user inputs and state assumptions for any missing data. This step is **mandatory**.

**User inputs extracted**
- Pull from the user message or $ARGUMENTS: product name or niche, region, platform (e.g. Shopify, DTC), and any other explicit constraints or goals.

**Assumptions (if missing)**

When the user does not specify the following, state your assumptions clearly so the rest of the analysis is scoped correctly:

| Item | Description | Example assumption |
|------|-------------|---------------------|
| **Product category** | The vertical or category the product belongs to (e.g. home, beauty, pet, electronics). | "Assuming home decor / seasonal decor if not specified." |
| **Target market** | Primary geography or customer segment (e.g. US, UK, EU, age group). | "Assuming US as primary target market unless stated otherwise." |

- **Product category:** Needed to choose research channels, keywords, and competitors. If missing, infer from product description or state a default (e.g. "general consumer goods") and note it.
- **Target market:** Needed for Google Trends region, ad library filters, and marketplace choice. If missing, state the assumed market (e.g. "United States") and note it.

Do not proceed to Step 1 until inputs are listed and assumptions for product category and target market are explicit.

---

### Step 1: Determine Product Type

Identify the target product type — this determines the analysis strategy and resource investment.

**Trending Products**
- Go viral rapidly via hot events, social media buzz
- Shorter lifecycle (3-6 months)
- Best for: Sellers with fast response capability and higher risk tolerance
- Examples: TikTok-viral gadgets, event-related products

**Best-Selling Products**
- Meet practical/essential needs with stable, sustained demand
- Longer lifecycle but more intense competition
- Best for: Sellers focused on long-term brand building
- Examples: Home goods, fitness equipment, pet supplies, beauty products

| Dimension | Trending Products | Best-Selling Products |
|-----------|------------------|----------------------|
| Capital requirement | Medium (fast turnover) | Higher (long-term investment) |
| Time investment | High (continuous monitoring) | Medium (stable operations) |
| Risk tolerance | High (potential dead stock) | Medium (competition pressure) |
| Marketing approach | Primarily paid ads | SEO + content + ads |
| Supply chain needs | Flexible and fast | Stable and reliable |

---

### Step 2: Multi-Channel Product Research

Select appropriate research channels based on product type. Use multiple channels for cross-validation.

#### Method 1: Ad Platform Research

Discover products being validated in the market by analyzing competitor ad placements.

**Primary platforms:** TikTok Creative Center (trending products) | Facebook Ad Library (established products)

**Key signals:**

| Signal | What to Check | How to Interpret |
|--------|---------------|-----------------|
| **Ad count** | Active ads for product keyword | <20 = early; 20-100 = growing; 100+ = saturated |
| **Advertiser count** | Distinct advertisers running ads | <10 = early growth; 10-50 = peak; 50+ = saturation |
| **Creative diversity** | Variety of ad formats | High diversity = peak momentum; repetitive = saturation |
| **Ad longevity** | How long top ads run | 30+ days = proven ROI; new ads only = early stage |
| **Landing page quality** | Sophistication of pages | Basic = early; polished branded = mature market |

For detailed methods, see [ad-platforms.md](references/ad-platforms.md).

#### Method 2: E-commerce Platform Research

Discover market-validated products through platform rankings.

**Primary platforms:** Amazon (Best Sellers, Movers & Shakers) | AliExpress (hot-selling lists) | eBay (Trending) | Etsy (Bestseller)

**Key signals:**

| Signal | Source | Stage Indicator |
|--------|--------|----------------|
| **Sales velocity** | Amazon Best Sellers, AliExpress orders | Rapid growth = early; steady = peak; declining = saturation |
| **Competitor count** | Amazon page 1, Shopify stores | <10 serious = early; 10-30 = peak; 30+ = saturated |
| **Review velocity** | Rate of new reviews | Accelerating = growth; steady = peak; slowing = decline |
| **Price compression** | Price range across sellers | Wide margins = early; narrowing = peak; price war = saturation |
| **Supply chain signals** | AliExpress/Alibaba supplier count | Few suppliers = early; many with low MOQ = saturated |

For detailed methods, see [ecommerce-platforms.md](references/ecommerce-platforms.md).

#### Method 3: Third-Party Research Tools

**Free:** Google Trends (essential), TikTok Creative Center, Facebook Ad Library
**Paid:** Sell The Trend, Ecomhunt, Niche Scraper

For full tool list, see [tools-list.md](references/tools-list.md).

#### Method 4: YouTube Content Research

Search YouTube for "trending products [year]", "best dropshipping products". Prioritize recent videos (1-3 months), read comments, learn the selection logic rather than copying products directly.

---

### Step 3: Validate Keyword Heat with Google Trends

Visit https://trends.google.com/ and enter the product's core keywords (English for Western markets).

**Analysis Dimensions:**

1. **Time Trend**
   - Past 12 months: Judge current momentum (rising / stable / declining)
   - Past 5 years: Understand long-term trajectory and seasonal patterns

2. **Regional Distribution**
   - Verify target market has sufficient demand
   - Discover potential emerging markets

3. **Related Queries**
   - Discover adjacent product opportunities and long-tail keywords
   - Understand consumer search intent

4. **Seasonality**
   - Identify peak and off-peak selling seasons
   - Ensure you're entering at the right time

#### Lifecycle Stage Classification

| Stage | Google Trends Pattern | Entry Signal |
|-------|----------------------|--------------|
| **Early Growth** | Sharp upward slope in past 3-6 months; no prior historical peak; limited regional spread | Strong entry window — first-mover advantage |
| **Peak Momentum** | Near historical high; broad regional spread; mix of rising and established queries | Viable but narrowing — requires differentiation |
| **Saturation** | Declining from peak for 3+ months; OR flat with no growth; widespread but stagnant | Avoid entry — margins compressed, demand declining |

**Decision Criteria:**

**Trending Products:** Search volume rising past 3-6 months, currently upward/peak, regional heat matches target market.

**Best-Selling Products:** Search volume stable or rising over 1-2 years, clear seasonal patterns, long-term upward or flat.

**Warning Signals:** Declining 6+ months, heat past peak (trending), search volume too low.

#### Cross-Validation Rule

The final stage classification must be consistent across at least 2 of 3 signal sources (ads, trends, marketplace). If signals conflict, flag as "Mixed Signals — Further Research Needed".

---

## Timing Verdict

**Step 4:** Use the results from Steps 1–3 to assign the timing verdict below.

**Decision Matrix:**

| Verdict | Stage | Entry Recommendation |
|---------|-------|---------------------|
| **Go** | Early Growth | Low competition, rising demand, first-mover advantage |
| **Cautious** | Peak Momentum | Viable but requires clear differentiation; margins under pressure |
| **No-Go** | Saturation | Declining demand, compressed margins, high ad costs |

**Profitability Gate** (must pass regardless of stage):

| Metric | Minimum |
|--------|---------|
| Gross margin | ≥50% |
| Net profit per sale (after ads) | Positive |
| Ad cost ratio | <30% of selling price |

If Early Growth but fails profitability gate, downgrade to Cautious.

---

## Best Practices

### Building a Research Routine

**Daily** (15-30 min): Browse TikTok Creative Center and Facebook Ad Library; record 3-5 potential products.

**Weekly** (2-3 hours): Select 2-3 products from backlog; complete full research report; validate with Google Trends.

**Monthly** (1 hour): Review products researched; summarize lessons; adjust strategy.

### Product Portfolio Strategy

- 1-2 trending products (high risk, high reward — test quickly)
- 2-3 best-selling products (stable revenue — build long-term)
- Maintain relevance between products for cross-selling

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Surface-level data only | High Amazon sales may be brand-driven; analyze competitive landscape and entry barriers |
| Ignoring timing | Always verify current trend stage through Google Trends |
| Price-war trap | Target gross margins ≥50%; tiny margins can't cover ad costs |
| Supply chain issues | Verify supplier reliability and shipping times before committing |
| Blindly following recommendations | Learn selection logic, find your own differentiation angle |
| Confusing seasonal spikes with growth | Check 5-year Google Trends view for recurring patterns |
| Entering at peak without differentiation | Peak Momentum requires a clear product, brand, or audience angle |

---

## Quick Reference

**Lifecycle Stages:**
- Early Growth: Few ads, rising trends, low competition → best entry window
- Peak Momentum: Many ads, peak trends, moderate competition → needs differentiation
- Saturation: Repetitive ads, declining trends, price wars → avoid entry

**Step 0 (required):** User inputs extracted; assumptions stated for product category and target market if missing.

**Key Data Sources:**
- Ad libraries: TikTok Creative Center, Facebook Ad Library
- Trends: Google Trends (12-month + 5-year views)
- Marketplaces: Amazon, AliExpress, eBay, Etsy

**Profitability Thresholds:**
- Gross margin: ≥50%
- Ad cost ratio: <30% of selling price
- Cross-validate stage across ≥2 signal sources

---

## Additional Resources

- [ad-platforms.md](references/ad-platforms.md) — Ad platform research detailed guide
- [ecommerce-platforms.md](references/ecommerce-platforms.md) — E-commerce platform research methods
- [tools-list.md](references/tools-list.md) — Third-party research tool directory
- `${CLAUDE_SKILL_DIR}/templates/product-research-report.md` — Product research report template (read via `read_file`)
