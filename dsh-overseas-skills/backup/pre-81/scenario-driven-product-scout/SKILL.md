---
name: "scenario-driven-product-scout"
title: "场景驱动选品"
description: "- Discovers product ideas using the \\\"Three Shopping Moments\\\" framework (Calendar / Life / Everyday) combined with 20 differentiation strategies. Generates beginner-friendly product concepts with positioning, keywords, variants, and validation steps. Use when brainstorming products for Etsy, POD, or e-commerce, or when planning seasonal product lines. 边界：节日/场景的创意发散；需要数据验证的选品走 product-selection 或 market-insight-product-selection"
workflow: "Complete this in five steps:\n1. Scenario Selection — Pick at least one suitable Shopping Moment; state recommendation rationale; choose 1–2 Sub-moments; clarify Buyer intent (gift-giving / personal use / decor upgrade / organization / emotional value).\n2. Keyword Discovery — Output at least 3 trends: Primary keyword, Features, Maturity Stage, Data source, Audience.\n3. Strategy & Product Search — Combine moment + trends; give 3 product strategies. Each strategy must include: Strategy name, Product overview (must have), User story with moment/user group/buying motivation (must have), Estimated pricing & cost (must have); plus optional Strategy type, Differentiation advantage, Competition analysis, Decision recommendation. Search for actual products under each strategy and present in a product display table (≥2–3 products per strategy).\n4. Recommend Strategy & Products — Pick one strategy from Step 3, reference its product list (no re-search), and provide recommendation rationale (rationale analysis, sub-moment analysis, buyer intent analysis).\n5. Validate and Test — Demand, competition, profitability, trend durability (see template when generating reports)."
enabled: "true"
whenToUse: "节日/场景的创意发散；需要数据验证的选品走 product-selection 或 market-insight-product-selection"
disable-model-invocation: false
user-invocable: true
---


# Scenario-Driven Product Scout

Discover winning product opportunities for $ARGUMENTS using the Three Shopping Moments framework combined with 20 proven product selection strategies. Moves beyond random guessing or simple trend-following with a systematic, data-driven methodology.

> **Scope:** For Amazon FBA product selection, use `market-viability-logic-auditor`. For general market research without specific platform focus, use other tools.

**Template Compliance:** Before generating reports, read the corresponding template using `read_file` and follow its structure exactly. Do not skip, reorder, or add sections.

**Required depth:** In Step 1 always provide recommendation rationale, sub-moment(s), and buyer intent; in Step 3 every strategy **must** include Product overview, User story (moment/user group/buying motivation), and Estimated pricing & cost — these three fields are mandatory and must never be omitted; also present **actual products** (≥2–3 per strategy, no duplicates across strategies) in a product display table under each strategy; in Step 4 reference the chosen strategy's product list from Step 3 (do not re-search or re-list) and always include rationale analysis, sub-moment analysis, and buyer intent analysis.

| Report Type | Template File |
|------------|--------------|
| Product Validation | `${CLAUDE_SKILL_DIR}/templates/product-validation-checklist.md` |
| Seasonal Planning | `${CLAUDE_SKILL_DIR}/templates/seasonal-planning-template.md` |

---

## Core Workflow

### Step 1: Choose a Shopping Moment

Select **at least one** shopping moment that fits the user's context. For each chosen moment, provide recommendation rationale, sub-moments, and buyer intent.

**Recommended Shopping Moments:** Calendar | Life | Everyday

- **Recommendation rationale:** Explain why this moment suits the user (e.g., experience level, timing, category focus, resource fit).
- **Sub-moment:** Under the chosen moment, select **at least 1–2** sub-scenarios.  
  Example for **Calendar → Christmas**:
  - Host/Party (party setup & hosting)
  - Family cozy (at-home atmosphere)
  - Gift exchange (gift-giving occasions)
  - Last-minute gifting (late-stage buyers)
  For other moments (Life / Everyday), pick the relevant sub-scenarios from [shopping-moments.md](references/shopping-moments.md).
- **Buyer intent:** Clarify which intent(s) the product will serve:
  - Gift-giving
  - Personal use
  - Decor upgrade
  - Organization / storage
  - Emotional value

**Calendar Moments** — Time-based shopping driven by seasons and holidays:
- Highly plannable with predictable demand peaks
- Requires 2-3 months advance preparation
- Examples: Christmas decorations, Valentine's gifts, summer beach accessories
- Best for: Sellers who can plan ahead and manage seasonal inventory

**Life Moments** — Shopping driven by major life events:
- High emotional value and willingness to pay premium
- Strong gift-giving component
- Examples: Wedding supplies, baby shower gifts, graduation memorabilia
- Best for: Sellers offering personalization and custom products

**Everyday Moments** — Ongoing daily life needs and interests:
- Year-round stable demand without seasonality
- Interest and lifestyle-driven purchases
- Examples: Self-care products, home decor, hobby supplies, pet accessories
- Best for: Sellers building long-term sustainable businesses

**How to Choose:** New sellers often start with Everyday Moments (stable demand), while experienced sellers layer in Calendar Moments (higher volume but requires planning).

For detailed breakdown of each moment with examples and timelines, see [shopping-moments.md](references/shopping-moments.md).

---

### Step 2: Identify Trend Keywords

Output **at least 3** trend entries. For each trend, include the following fields.

| Field | Description | Example |
|-------|-------------|---------|
| **Primary keyword** | Main trend/search term | Dramatic Romantic |
| **Features** | Visual/style traits that define the trend | ballet, theatrical, jewel tones, velvet ribbon |
| **Maturity Stage** | Where the trend sits in its lifecycle | Emerging / Peaking / Saturated |
| **Data source** | Where the trend was observed | Etsy Trend Report, eRank Trend Buzz, Google Trends |
| **Audience** | Who buys into this trend (age, taste, price band) | Women 25–45, premium romantic aesthetic, AOV $30–80 |

**Primary Source: Etsy Trend Report**
- Official annual trend report published by Etsy
- Access via Etsy Seller Handbook or official blog
- Lists rising search terms and consumer behavior trends

**How to Use Trend Keywords:**
1. Review the Etsy Trend Report for your product category
2. Identify 3–5 trending keywords relevant to your chosen shopping moment
3. Cross-reference with eRank to verify actual search volume
4. Combine broad trends with specific moments

**Secondary Sources:**
- eRank Trend Buzz: Real-time trending searches on Etsy
- Google Trends: Validate trend longevity and seasonality
- Etsy search autocomplete: Reveals high-frequency searches

For detailed tool usage instructions, see [tools-guide.md](references/tools-guide.md).

---

### Step 3: Apply Product Selection Strategies & Product Search

**Combine the chosen moment and trends from Step 1 and Step 2.** Give **three** product strategies. For each strategy, include:

| Field | Required | Description |
|-------|----------|-------------|
| **Strategy name** | Yes | Name of the strategy / concept |
| **Strategy type** | | Which of the 20 strategies (see below) are used, can combine 2–3 |
| **Product overview** | **Must have** | What the product is, its form factor, key materials/features, and how it leverages the chosen moment + trends |
| **User story** | **Must have** | Describe in one paragraph: (1) the moment/scenario — when and where the purchase happens; (2) the user group — demographics, interests, lifestyle; (3) the buying motivation — why they buy now (gift, self-reward, necessity, emotional trigger) |
| **Differentiation advantage** | | What makes this product stand out from existing offerings (unique design, material, personalization, bundle, etc.) |
| **Estimated pricing & cost** | **Must have** | Estimated retail price, base/production cost, platform fees, and approximate profit per unit |
| **Competition analysis** | | Number of competing listings, price range of top sellers, identified gaps or weaknesses |
| **Decision recommendation** | | Actionable suggestion: pursue / test cautiously / deprioritize, with brief rationale |
| **Product list** | Yes | Search for actual products matching this strategy and present in a product display table (see format below) |

**Product display table format** — present **at least 2–3 actual products** per strategy:

| Product Title | Image | Price | Sales Volume (Latest Month) | Source |
|---------------|-------|-------|-----------------------------|--------|
| [Title as link](url) | [Image URL] | $XX.XX | [Number or N/A] | Etsy / TIKTOK / Printify |

**Deduplication rule:** Each strategy must use **distinct search keywords and angles** derived from its own strategy type + product description. If a product has already appeared under a previous strategy, do **not** list it again — replace it with a different product. Across all three strategies, every product row must be unique (no duplicate URLs or titles).

**Where to search for products:**
- **Etsy** — Search by trend keywords + moment. Note top listings: title (as link), main image link, price, sales volume if available.
- **TikTok Shop / social commerce** — For trending products, note title, image, price, latest-month sales volume, source (e.g. TIKTOK).
- **Google / shopping** — Broader product discovery; identify real SKUs, brands, or POD categories.
- **POD catalogs** (e.g. Printify, Printful) — Search for product types; note base products and price ranges.

Use one or more of the 20 product selection strategies below to shape each concept.

**Based on Existing Products (5 strategies):**
- Complementary: Create accessories for popular products
- Alternative: Offer better solutions to replace existing products
- Upgraded: Add features or improve quality of basic products
- Simplified: Remove complexity for ease of use
- Bundled: Package related products as complete solutions

**Based on Market Demand (5 strategies):**
- Problem-Solving: Address specific pain points
- Trend-Following: Capitalize on rising trends
- Seasonal: Align with seasonal needs
- Holiday-Themed: Target specific holidays
- Nostalgic: Evoke memories and emotional connections

**Based on Target Audience (5 strategies):**
- Niche Audience: Serve specific small groups (left-handed, twins, etc.)
- Profession-Specific: Design for occupational needs
- Hobby-Based: Cater to enthusiast communities
- Lifestyle-Oriented: Align with lifestyle choices (minimalism, sustainability)
- Identity-Based: Express identity and belonging (LGBTQ+, cultural, fandom)

**Based on Product Innovation (5 strategies):**
- Functional Innovation: Add new functionality
- Material Innovation: Use new or eco-friendly materials
- Design Innovation: Stand out through unique aesthetics
- Personalized: Offer customization options
- Sustainable: Emphasize environmental responsibility

**Strategy Combination:** Combine 2-3 strategies for stronger differentiation. Example: Seasonal + Personalized + Sustainable = "Custom-name reusable Christmas gift wrap bags"

For detailed explanations with examples, see [product-strategies.md](references/product-strategies.md).

---

### Step 4: Recommend Strategy & Products

From the three strategies and their product lists in Step 3, pick **one** recommended strategy. Do **not** re-search or re-list products — directly reference the chosen strategy's product list from Step 3.

**Output:**

- **Strategy name:** The chosen strategy/concept name.
- **Recommended products:** Reference the product list already presented under this strategy in Step 3 (do not duplicate the table). If needed, highlight which 2–3 products are the strongest picks and add a brief "Why it fits" note for each.
- **Recommendation rationale:** Must include:
  - **Rationale analysis:** Why this strategy is the best fit (vs. the other two) given resources, timing, and risk.
  - **Sub-moment analysis:** How the chosen sub-moment(s) from Step 1 support this product (e.g., Host/Party vs. Gift exchange).
  - **Buyer intent analysis:** How the product aligns with the stated buyer intent(s) (gift-giving / personal use / decor upgrade / organization / emotional value) and who acts on it.

---

### Step 5: Validate and Test

Before investing resources, systematically validate your product idea.

**A. Market Demand Validation (using eRank)**
- Search volume: Aim for 1,000-10,000 monthly searches
- Competition level: Low to Medium is ideal
- Identify 1 main keyword + 2-3 long-tail keywords
- Check trend direction (rising, stable, or declining)

**B. Competition Analysis (using Etsy search)**
- Analyze 3-5 top-selling competitors
- Note their pricing, design approach, and customer reviews
- Identify gaps: What are customers complaining about in reviews?
- Find differentiation opportunities

**C. Profitability Check (using Printify)**
- Calculate base cost (production + shipping)
- Add Etsy fees: $0.20 listing + 6.5% transaction + 3% + $0.25 payment processing
- Set retail price based on competitor analysis
- Target minimum $10 profit per sale for sustainable business

**D. Trend Validation (using Google Trends)**
- Verify the trend is not just a short-term spike
- Check seasonality patterns if applicable
- Compare search interest across target markets

**Testing Strategy:**
1. Create 1-2 product variants using POD platform (low risk)
2. Optimize listing with validated keywords
3. Monitor first 2 weeks: views, favorites, sales
4. Success criteria: At least 1 sale or 5%+ favorite rate
5. If successful, expand variants and related products
6. If unsuccessful, optimize or pivot to next idea

Read the full validation template at `${CLAUDE_SKILL_DIR}/templates/product-validation-checklist.md` before generating validation output.

---

## Best Practices

### Timing and Planning

**For Calendar Moments:**
- Start product development 2-3 months before the target date
- Major holidays (Christmas): Start 3-4 months early
- Monitor Etsy Trend Report in January to plan the entire year
- Use the seasonal planning template at `${CLAUDE_SKILL_DIR}/templates/seasonal-planning-template.md`

**For Life Moments:**
- Year-round opportunities with less timing pressure
- Focus on personalization and quick turnaround

**For Everyday Moments:**
- Consistent year-round effort
- Build product lines and series for repeat purchases

### Product Development Approach

**Look Book Thinking:**
- Create themed collections and bundles, not isolated items
- Show how products work together in complete scenes
- Increases average order value and perceived value

**POD Testing Strategy:**
- Start with lowest-cost print provider to test demand
- Once validated, upgrade to higher-quality provider
- Test multiple designs simultaneously; order samples to verify quality

**Differentiation Over Imitation:**
- Study competitors to understand the market
- Identify gaps and pain points from reviews
- Combine multiple strategies for stronger positioning

### Keyword and SEO Optimization

**Title:** Lead with primary keyword, use all 140 characters, include 2-3 secondary keywords naturally.

**Tags:** Use all 13, mix broad and long-tail, update based on performance data.

**Description:** Lead with benefits, address common questions, include specs and care info.

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Chasing every trend | Trends reported publicly are often saturated; use as inspiration, add differentiation |
| Ignoring profitability | Calculate full costs before launching; aim for minimum $10 profit |
| Skipping validation | Always validate with data and small-scale testing first |
| Missing time windows | Use seasonal planning template and set calendar reminders |
| Over-reliance on tools | Combine data with qualitative research and intuition |
| Neglecting product quality | Always order samples and test before scaling |

---

## Example Walkthrough

**Step 1 — Choose a Shopping Moment**  
- Recommended: Everyday Moments → Self-Care  
- Recommendation rationale: Stable demand, no seasonal pressure, good for beginner testing  
- Sub-moment: Self-Care → Meditation & Mindfulness  
- Buyer intent: Personal use, Emotional value  

**Step 2 — Identify Trend Keywords**  
- Primary: "Libra zodiac vibes"; Features: zodiac, meditation, journal aesthetic; Stage: Peaking; Data source: Etsy Trend Report; Audience: Women 25–35, AOV $15–30  

**Step 3 — Apply Product Selection Strategies & Product Search**  
- Strategy 1: "Personalized Libra Zodiac Mindfulness Journal"
  - Strategy type: Niche Audience + Personalized
  - **Product overview:** A 6×9 hardcover journal featuring Libra zodiac art, affirmation prompts, and name customization on the cover. Leverages the "Libra zodiac vibes" trend within the Everyday → Meditation & Mindfulness sub-moment.
  - **User story:** A 28-year-old woman discovers her Libra season is approaching; she wants a self-care ritual tool that feels personal. She searches "Libra journal" on Etsy for herself (personal use) as an emotional self-reward during a stressful work period — the zodiac theme gives her a sense of identity connection.
  - Differentiation advantage: Name personalization + zodiac-specific affirmation prompts (most competitors offer generic journals).
  - **Estimated pricing & cost:** Retail $18.99; Printify base $9.50 + shipping $3.50; Etsy fees ~$2.00; profit ≈ $4.00/unit.
  - Competition analysis: ~1,200 "Libra journal" listings on Etsy; top sellers $14–$22; gap — few offer personalized covers + affirmation content.
  - Decision recommendation: Pursue — validated demand, clear personalization edge, low entry cost via POD.
  - Products: "Personalized Libra Zodiac Journal" $18.99 (Etsy); "Custom Zodiac Meditation Notebook" $16.50 (Etsy); Printify 6×9 hardcover journal ~$9.50 base (Printify).
- Strategy 2: Trend-Following + Design Innovation → "Dramatic Romantic Zodiac Wall Art" — …
- Strategy 3: Bundled + Lifestyle-Oriented → "Zodiac Self-Care Gift Set" — …

**Step 4 — Recommend Strategy & Products**  
- Strategy name: Personalized Libra Zodiac Mindfulness Journal  
- Recommended products: (refer to Strategy 1 product list above) — top picks: "Personalized Libra Zodiac Journal" (Etsy, $18.99) — best fit for name customization + zodiac niche; "Custom Zodiac Meditation Notebook" (Etsy, $16.50) — lower price entry point  
- Rationale analysis: Strong fit with Everyday + personal use/emotional value; Sub-moment analysis: Clear zodiac niche demand in meditation/mindfulness; Buyer intent analysis: Personal use + emotional value, with repeat and gifting potential  

**Step 5 — Validate:** eRank "Libra journal" 2,400/month, Medium competition → Printify cost $9.50 → Profit ~$8 → Expand if 1 sale or 5%+ favorite rate within 2 weeks

---

## Quick Reference

**Three Shopping Moments:** Calendar (seasons, holidays) | Life (weddings, babies, milestones) | Everyday (self-care, hobbies, home, pets)

**Step 1 outputs:** Recommendation rationale, Sub-moment(s) (e.g. Host/Party, Gift exchange), Buyer intent (gift-giving / personal use / decor upgrade / organization / emotional value)

**Step 2 outputs:** ≥3 trends — Primary keyword, Features, Maturity Stage, Data source, Audience

**Step 3 outputs:** 3 strategies — each with: Strategy name, **Product overview** (must have), **User story** with moment/user group/buying motivation (must have), **Estimated pricing & cost** (must have), plus optional Strategy type, Differentiation advantage, Competition analysis, Decision recommendation, Product list (≥2–3 products per strategy in table: Product Title | Image | Price | Sales Volume | Source)

**Step 4 outputs:** Strategy name, Recommended products (reference Step 3 product list, no re-search; highlight top picks with "Why it fits"), Recommendation rationale (rationale, sub-moment, buyer intent analysis)

**20 Strategies:** Existing Products (5) | Market Demand (5) | Target Audience (5) | Innovation (5)

**5-Step Process:** Choose moment → Identify keywords → Apply strategies & search products → Recommend strategy & products → Validate and test

**Key Metrics:** Search volume 1,000-10,000/month | Competition Low-Medium | Profit ≥$10/sale | Test: 1 sale or 5%+ favorite rate in 2 weeks

---

## Additional Resources

- [shopping-moments.md](references/shopping-moments.md) — Detailed breakdown of all three shopping moments
- [product-strategies.md](references/product-strategies.md) — Complete guide to all 20 strategies with examples
- [tools-guide.md](references/tools-guide.md) — Step-by-step instructions for eRank, Printify, and other tools
- `${CLAUDE_SKILL_DIR}/templates/product-validation-checklist.md` — Validation checklist (read via `read_file`)
- `${CLAUDE_SKILL_DIR}/templates/seasonal-planning-template.md` — Year-round seasonal planning (read via `read_file`)
