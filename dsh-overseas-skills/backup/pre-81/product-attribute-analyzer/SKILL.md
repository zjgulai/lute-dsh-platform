---
name: "product-attribute-analyzer"
title: "产品属性分析器"
description: "- Profiles product attributes across top sellers using 3-D tagging (structural/fit, material/process, design elements), calculates sales-weighted market share from real sales data, and outputs quantitative analysis plus pie-chart visualizations per dimension. Use when defining manufacturing specs, identifying mainstream product configurations, or spotting design trends in an Amazon category."
workflow: "Complete this in five steps:\n1. Data Collection (sales + listing data from Amazon/Helium 10 or equivalent — required for quantitative analysis)\n2. Attribute Tagging (apply 3-D labeling: Structural/Fit, Material/Process, Design Elements)\n3. Quantitative Analysis (sales volume, market share %, ASIN counts, attribute combinations)\n4. Visualization (pie charts per dimension + text summary)\n5. Market Portrait (dominant combinations, market favorite archetype, gaps and opportunities)"
enabled: "true"
disable-model-invocation: false
user-invocable: true
---


# Product Attribute Analyzer

Batch-scan top-selling products for $ARGUMENTS, apply a 3-dimensional tagging system, and calculate **sales-weighted market share** from **real sales and product-attribute data**. Output includes **quantitative analysis** (numbers, percentages, distributions) and **visualizations** (pie charts by dimension + text summaries). The result is a data-driven "Market Portrait" that shows which product configurations dominate the category.

**Required:** Analysis must be **quantitative** (based on sales data and product attributes). Web search or qualitative description alone is not sufficient — use marketplace/sales data sources (e.g. Amazon Best Sellers, Helium 10, Jungle Scout, or equivalent) and report actual figures (sales volume, market share %, counts). Always produce **quantitative summary tables first**, then **pie charts** for each dimension with a short **text summary** per chart. The quantitative tables are mandatory and must precede any visualization.

---

## Core Workflow

### Step 1: Data Collection (Sales + Product Attributes)

**Use sales and listing data** — not web search alone — to enable quantitative analysis. Collect the Top 3–5 pages of search results or Best Sellers for the target keyword (50–100 ASINs). For each ASIN, record:

- Product title, main image link, price  
- **Estimated monthly sales** (required; e.g. Helium 10 X-Ray, Jungle Scout, Amazon Best Sellers / Movers & Shakers)  
- Review count, rating  

**Data sources:** Amazon Best Sellers, search results with sales-estimate tools (Helium 10, Jungle Scout, etc.), or other marketplace APIs. Minimum 50 ASINs for meaningful statistics. Exclude listings with zero or unknown sales.

Without real sales (or reliable proxy) per ASIN, market share and pie charts cannot be computed; do not rely on qualitative web search only.

---

### Step 2: Attribute Tagging (The 3-D Labeling)

For every ASIN, assign tags based on its title and main image across three dimensions:

**Dimension 1: Structural / Fit** — Physical shape, silhouette, fit.
Example: V-neck / Crew-neck / Turtleneck; Loose-fit / Slim-fit / Oversized; 12oz / 20oz / 40oz

**Dimension 2: Material / Process** — What it's made of and how.
Example: Cotton / Polyester / Merino wool; Waffle-knit / Ribbed / Cable-knit; Stainless steel / Double-wall vacuum

**Dimension 3: Design Elements** — Visual and aesthetic attributes.
Example: Solid color / Striped / Color-block; Hollow-out / Lace trim; Minimalist / Bohemian

**Tagging Principles:**
- Standardize tag names upfront — create a tag dictionary before starting (e.g., always "V-neck", never "V collar")
- Each ASIN gets at least one tag per dimension
- Tags must be observable from the title and/or main image
- When multiple tags apply in one dimension, assign the primary/dominant one

---

### Step 3: Quantitative Analysis (MANDATORY — must output tables before any chart)

For each tag and each dimension, compute and report via a **markdown table**. This table is a hard prerequisite for Step 4 — **never skip it or replace it with a chart**.

**Required table per dimension** (output one table per dimension, e.g. "Structural / Fit Distribution"):

| Attribute Tag | ASIN Count | Total Monthly Sales | Market Share % | Avg Sales / ASIN |
|---------------|-----------|--------------------:|---------------:|-----------------:|
| [Tag A]       | [n]       | [sum]              | [x.x%]        | [avg]            |
| [Tag B]       | [n]       | [sum]              | [x.x%]        | [avg]            |
| ...           | ...       | ...                | ...            | ...              |
| **Total**     | **[N]**   | **[total]**        | **100%**       | **[avg]**        |

Then compute **attribute combinations** (e.g. "Loose-fit + V-neck + Solid color") and output a separate table:

| Rank | Attribute Combination | ASIN Count | Total Monthly Sales | Market Share % |
|-----:|----------------------|-----------|--------------------:|---------------:|
| 1    | [Combo A]            | [n]       | [sum]              | [x.x%]        |
| 2    | [Combo B]            | [n]       | [sum]              | [x.x%]        |
| ...  | ...                  | ...       | ...                | ...            |

Use **sales-weighted** share, not listing-weighted. A tag on 15% of listings might capture 40% of sales (undersupplied opportunity); a tag on 30% of listings might drive only 10% of sales (oversupplied, avoid).

> **CRITICAL:** The tables above are the analytical foundation. They MUST appear in the output BEFORE any pie chart. If you find yourself producing a pie chart without the corresponding quantitative table above it, STOP and output the table first.

---

### Step 4: Visualization — Pie Charts + Text Summary

**Prerequisite:** Step 3 quantitative tables must already be present in the output. Do not produce pie charts without the corresponding quantitative table appearing first.

Produce **one pie chart per dimension** showing the **sales-weighted share** (or share of total ASIN count if sales are unavailable) for each attribute in that dimension.

**Chart design:** Follow [chart-design-guide.md](chart-design-guide.md) for visual style, palettes, and chart-type choices. **All charts MUST be generated using Python code** (Matplotlib / Seaborn) — **never use Mermaid or any other markdown-rendered chart syntax**, as they render poorly and lack visual quality. In particular:
- **Pie charts:** Use `plt.pie()` (Matplotlib); limit to 3–5 slices; use `explode` to highlight the largest segment.
- Save each chart as a `.png` file (`plt.savefig('chart_name.png', dpi=150, bbox_inches='tight', facecolor='white')`) and embed it in the output with `![title](chart_name.png)`.
- Apply `sns.set_theme(style='whitegrid', palette='husl')` for consistent professional styling.

**Required charts:**

1. **Structural / Fit** — Pie chart of market share by attribute (e.g. V-neck, Crew-neck, Loose-fit, Slim-fit).  
2. **Material / Process** — Pie chart of market share by attribute (e.g. Cotton, Waffle-knit, Ribbed).  
3. **Design Elements** — Pie chart of market share by attribute (e.g. Solid color, Striped, Minimalist).  

**Optional:** A fourth pie chart for **Top Attribute Combinations** (e.g. top 5–8 combinations by sales share).

**Per chart:** Add a **short text summary** (2–4 sentences) that states the main takeaway (e.g. "V-neck and crew-neck together account for 70% of sales; loose-fit dominates fit with 45%.").

*Summary example:* V-neck and crew-neck capture 70% of category sales; mock-neck and turtleneck are smaller but non-trivial segments.

---

### Step 5: Market Portrait (Synthesis)

Synthesize the quantitative results and charts into an actionable market profile:

1. **Dominant Attribute Combinations** — Top 3–5 combinations by sales volume (with %)
2. **Per-Dimension Champions** — Ranked attributes per dimension with shares (e.g. V-neck 42% > Crew-neck 28% > Mock-neck 15%)
3. **"Market Favorite" Archetype** — One-sentence description of the configuration that captures the most sales
4. **Emerging Trends** — Attributes with small current share but rising sales velocity (if observable from data)
5. **Gaps and Opportunities** — Combinations with strong demand but few competing listings (undersupplied)

---

## Output Format

**Strict ordering: 1 → 2 → 3 → 4. Never skip or reorder. Section 2 (quantitative tables) is MANDATORY before Section 3 (pie charts).**

### 1. Attribute Data Table (raw data)

| Rank | ASIN | Product Title | Monthly Sales | Price | Structural/Fit | Material/Process | Design Elements |
|------|------|---------------|---------------|-------|----------------|------------------|-----------------|
| 1 | B0XXXXXX | [Title] | [Sales] | $XX | Loose-fit, V-neck | Waffle-knit, Cotton blend | Solid color |
| ... | ... | ... | ... | ... | ... | ... | ... |

### 2. Quantitative Summary Tables (MANDATORY — must appear before any chart)

Output **one markdown table per dimension** with columns: Attribute Tag | ASIN Count | Total Monthly Sales | Market Share % | Avg Sales / ASIN.

Then output **one combination table** with columns: Rank | Attribute Combination | ASIN Count | Total Monthly Sales | Market Share %.

These tables contain the actual numbers. They are the analytical core and must be present even if charts follow.

### 3. Visualization — Pie Charts (Python / Matplotlib)

**Only after Section 2 tables are output.** For each dimension (Structural/Fit, Material/Process, Design Elements), include:

- A **pie chart generated with Python code** (using `plt.pie()` from Matplotlib, styled per [chart-design-guide.md](chart-design-guide.md)) saved as `.png` and embedded via `![title](path)`.
- A **short text summary** (2–4 sentences) interpreting the chart.

Optionally add a pie chart for top attribute combinations.

**Do NOT use Mermaid, markdown-rendered charts, or any non-Python charting approach.**

### 4. Mainstream Configuration Summary

```
Category: [Category Name]
Sample Size: [N] ASINs analyzed

Market Favorite Configuration:
- Structural/Fit: [Dominant attributes with %]
- Material/Process: [Dominant attributes with %]
- Design Elements: [Dominant attributes with %]
- Dominant Combination: [Top combination with %]
- Price Sweet Spot: $[X] - $[Y]

Key Insight: [e.g., "Loose-fit V-neck Waffle-knit Solid-color sweaters account for 35% of total category sales, priced at $25-35."]
Emerging Trends: [Attributes with small but rising share]
Gaps/Opportunities: [Undersupplied attribute combinations]
```

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Relying on web search / qualitative only | Use sales and listing data (Helium 10, Jungle Scout, Best Sellers, etc.); report actual sales volume and market share % |
| Counting listings instead of sales | Always weight by actual sales volume — 10 listings generating 80% of sales matter more than 90 generating 20% |
| Inconsistent tagging | Define a tag dictionary upfront; never use "Crewneck" and "Round neck" for the same attribute |
| Overly broad categories | Narrow scope to specific sub-categories (e.g., "Women's Pullover Sweater" not "Sweaters") |
| Analyzing dimensions in isolation | The real value is in combinations — "Loose-fit V-neck Waffle-knit Solid" is a manufacturing spec |
| Copying the #1 product | The #1 may be an outlier; focus on patterns across Top 50-100 |
| Jumping to pie charts without quantitative tables | Always output the per-dimension summary tables (with sales volume, share %, ASIN count) BEFORE any pie chart — charts illustrate the tables, not replace them |
| Using Mermaid or markdown-rendered charts | Always generate charts with Python code (Matplotlib / Seaborn) per chart-design-guide.md; Mermaid renders poorly |

---

## Quick Reference

**Data requirement:** Use **sales data + product attributes** for **quantitative** analysis; web search alone is not sufficient.

**3-D Tagging Dimensions:**
- Structural / Fit: shape, silhouette, size, fit
- Material / Process: material composition, manufacturing technique, finish
- Design Elements: visual style, color, pattern, decorative details

**Key metrics per tag:** Sales Volume, Market Share %, ASIN Count, Average Sales per ASIN

**Output order:** Quantitative summary tables (per dimension + combinations) → Pie charts (per dimension, generated with Python/Matplotlib per chart-design-guide.md) + text summary per chart. Tables are mandatory; never skip to charts directly.

**Chart generation:** Always use Python code (Matplotlib / Seaborn) following [chart-design-guide.md](chart-design-guide.md). Never use Mermaid or markdown-rendered chart syntax.

**Sample size:** Top 50–100 ASINs with sales estimates.

**Core output:** Quantitative market share tables + pie charts by dimension + the "Market Favorite" archetype (dominant product configuration by sales volume).
