---
name: "ai-product-designer"
title: "AI产品设计师"
description: "Product development workflow with design image generation. Use ONLY when the user explicitly asks for design images (设计图/产品设计/visualize product): create 3 distinct design proposals with generated images, compare them, then optionally match suppliers. SKIP for trend analysis, product recommendations, or attribute research."
workflow_closed: "Complete this in six steps:\n1. Demand Understanding (restate user goals)\n2. Market Analysis (search-first by default; only skip if user explicitly waives external search/market research)\n3. Design Proposals (3 distinct proposals with actual generated images)\n4. Proposal Comparison (comparison table + recommendation)\n5. Sourcing & Supplier Matching (optional, per-proposal)\n6. Summary & Action Plan (phased timeline)"
enabled: "true"
disable-model-invocation: true
---


# AI Product Designer

A comprehensive workflow for end-to-end product conceptualization: from market analysis to design proposals to supplier matching.

## Core Principles

1. **Demand First**: Always restate user goals & constraints before proceeding
2. **Actual Image Generation**: Call image generation/edit tools to create real images, not placeholder text
3. **Differentiation**: Generate 3 distinct proposals (Entry-level / Premium / Innovative)
4. **Visual Consistency**: ALL proposals must have one hero product image
5. **Complete Analysis**: Each proposal MUST include Positioning & Value paragraph + Key Specs table
6. **Per-Proposal Analysis**: Evaluate each proposal individually, especially for sourcing
7. **Actionability**: End with clear recommendations and phased action plan

---

## How to Use

Read this guide FIRST before any image generation or web search when the user wants to design a new product.

## Dependencies

- `image-prompt-guide` - For generating product visuals (White BG Product Images)
- `tariff-search` - For cost estimation (if cross-border)
- `fetch-product-supplier-info` - For supplier matching
- `market-insight-product-selection` - For deep market analysis in Step 2 (when needed)

---

## Steps

### Step 1: Demand Understanding
- **Input**: User query
- **Action**: Restate goals, constraints, and product category
- **Output**: Confirmed interpretation of user needs

### Step 2: Market Analysis & Strategy (Search-first by Default)
- **Input**: Any product development request where market context could change the recommendation (this includes requests with detailed specs).
- **Skip only if (must be explicit in user query)**:
  - User explicitly requests **no external search / no market research**, OR
  - User explicitly states they already have **validated market data** and only want **execution/design output**.
- **Action**:
  - Run external search + platform/social/trend checks to collect **enough evidence** before proposing strategies.
  - **Data Sources (use ≥3 source types)**:
    - Web search (market intel, news, phenomena)
    - Sales platforms (Amazon/Alibaba/etc.)
    - Trend data (Google Trends / platform search trends)
    - Community signals (YouTube/Reddit reviews & sentiment)
  - **Deep search (multi-round)**: Broad queries → drill into entities (brands/tech/pain points/suppliers) → continue until saturation/verification.
  - **Cross-verification**: Verify key claims with **2+ sources** when possible.
  - **Contrarian checks**: When you form a strong conclusion, search for opposing evidence (risks, complaints, competitor strengths).
  - **Stop conditions (saturation detection)**: stop when either (a) no new entities/data for 2 consecutive rounds, (b) key unknowns are filled, or (c) key claims are verified.
- **Output**:
  - Feasibility verdict (Yes / Cautious / No + "Why now?")
  - Trend trajectory (seasonality, sales peaks)
  - Consumer pain points (from negative review analysis)
  - Competitive gaps (category opportunities)
  - **Design Strategies** (Output exactly 3; each must be evidence-backed):
    ```
    Strategy [N]: [Title]
    - Core Concept: [Direction, e.g., "Eco-Minimalism"]
    - Reason and Evidence: [Why this strategy works and supporting data/case]
    ```
- **Reference**: For the full deep-search protocol, read `market-insight-product-selection` skill:
  `read_file('skills/market-insight-product-selection/SKILL.md')`

### Step 3: Design Proposals (3 Required)
- **Input**: User needs + market insights
- **Action**: Generate 3 distinct proposals (Entry-level / Premium / Innovative)
- **Output**: Per proposal (structured format):
  1. **Title**: Proposal X: [Memorable Theme Name] — Create a catchy, evocative title (e.g., "Proposal 1: Urban Stealth Fortress", "Proposal 2: Nomad Life Essential")
  2. **Positioning & Value**: Three concise points (1-2 sentences each):
     - **Positioning**: [Target user] + [Product positioning] — e.g., "A minimalist storage tool for students"
     - **User Value**: [Design approach] + [Specific pain point solved] — what design solves what problem
     - **Business Value**: [Commercial opportunity: volume driver/hero/entry SKU] + [Production risks/barriers]
  3. **Visual**: One hero product image
     - **MUST call image generation tool** — no placeholder text
     - White BG Product Image required for all 3 proposals
  4. **Key Specs**: Table format with **at least 5 relevant fields**, adapted by product category:
     | Category | Recommended Fields |
     |----------|-------------------|
     | Apparel | Materials, Size Range, Fit/Silhouette, Craft/Details, Target Cost, MOQ |
     | Bags/Gear | Materials, Dimensions, Structure/Compartments, Hardware, Craft, Target Cost |
     | Electronics | Core Features, Specs/Parameters, Materials, Certifications, Target Cost, MOQ |
     | Furniture | Materials, Dimensions, Load Capacity, Assembly, Craft, Target Cost |
     | Beauty | Key Ingredients, Capacity, Packaging, Certifications, Target Cost, Shelf Life |

### Step 4: Proposal Comparison
- **Input**: 3 completed proposals
- **Action**: Compare across dimensions, recommend winner
- **Output**: 
  - **Comparison Table**: Positioning, Key Differentiator, Material/Craft, Cost Range, Time to Market, Advantages (2-3 pts), Risks (2-3 pts), Strategic Role
  - **Primary Recommendation**: Core Winning Point + vs Proposal A/B + Strategic Fit
  - **Alternative**: Best if [different priority]

### Step 5: Sourcing & Supplier Matching (Optional)
- **Input**: User requests suppliers ("Find manufacturers", "Who can make this?")
- **Action**: Analyze sourcing for EACH proposal SEPARATELY
- **Output**: For EACH proposal:
  - Required Capabilities (specific factory type for THIS proposal)
  - Certifications (based on THIS proposal's needs)
  - MOQ Compatibility
  - Recommended Suppliers (1-2 suited for THIS specific proposal)
  - Key Inquiry Points & Negotiation Focus
- **Cross-Proposal Comparison**: Supplier Type, Lead Time, MOQ, Best For
- **Final Recommendation**: Which sourcing path offers best balance
- **Prompt at end**: "Would you like me to find suppliers for any of these designs?"

### Step 6: Next Step
- **Input**: All proposals presented
- **Action**: Provide 3-4 actionable next steps as conversational guidance
- **Output**: 
  - Use "**Next Step**" as heading
  - List 3-4 concise follow-up actions the user can choose from
  - Focus on specific actions: refine details, explore variations, match suppliers, create execution plan
  - Use conversational tone: "To move this project forward, I can help you with..."

---

## Output Format

### Proposal Structure

```
### Proposal [N]: [Memorable Theme Name]

**Positioning & Value**

1. **Positioning**: [Target user + product positioning in one sentence]
2. **User Value**: [Design approach + specific pain point solved]
3. **Business Value**: [Commercial opportunity + production risks/barriers]

**Hero Visual**

Here is the hero product image for this proposal:

[Call image generation tool → actual product image displayed]

**Key Specs**

| Field | Content |
|-------|---------|
| Materials | [Primary materials with grades/specs] |
| Dimensions | [Size/capacity appropriate to product] |
| Core Features | [Key features, differentiators] |
| Structure | [Components, compartments, assembly] |
| Craft/Details | [Craft techniques, finishing, QC points] |
| Target Cost | BOM $[X-Y] / Retail $[X-Y] |
| MOQ/Lead Time | [Minimum order quantity, production timeline] |
```

**Note**: Include **at least 5 fields** from the following, adapted by product category:
- Apparel: Materials, Size Range, Fit/Silhouette, Craft/Details, Target Cost, MOQ
- Bags/Gear: Materials, Dimensions, Structure/Compartments, Hardware, Craft, Target Cost
- Electronics: Core Features, Specs/Parameters, Materials, Certifications, Target Cost
- Furniture: Materials, Dimensions, Load Capacity, Assembly, Craft, Target Cost
- Beauty: Key Ingredients, Capacity, Packaging, Certifications, Target Cost, Shelf Life

### Comparison Table

| Dimension | Proposal 1 | Proposal 2 | Proposal 3 |
|-----------|------------|------------|------------|
| Positioning | ... | ... | ... |
| Key Differentiator | ... | ... | ... |
| Material/Craft | ... | ... | ... |
| Cost Range | $X-Y | $X-Y | $X-Y |
| Time to Market | X weeks | ... | ... |
| Advantages | 2-3 pts | 2-3 pts | 2-3 pts |
| Risks | 2-3 pts | 2-3 pts | 2-3 pts |
| Strategic Role | Hero/Cash-cow/Test | ... | ... |

### Recommendation

**Primary Pick**: [Proposal Name]

| Element | Content |
|---------|---------|
| **Core Winning Point** | The unique "killer feature" (1 sentence) |
| **vs Proposal A** | Why this beats A on [specific dimension] |
| **vs Proposal B** | Why this beats B on [specific dimension] |
| **Strategic Fit** | Why this aligns with brand's goals |

**Alternative**: [Proposal Name] — Best if [different priority]

### Next Step

To move this project forward, I can help you with:

1. **Deep Dive**: Refine a specific proposal's technical details (e.g., finalize internal structure, create detailed BOM) or generate high-fidelity scenario renders.
2. **Explore Variations**: Keep the current analysis framework and generate more differentiated design directions.
3. **Supplier Matching**: Lock in a specific proposal and let me find and screen matching production suppliers.
4. **Execution Plan**: Finalize your chosen proposal and I'll create a concrete action plan from tooling to first batch delivery.

---

## Checklist

✅ **Must Have**:
- [ ] Demand restatement
- [ ] 3 distinct proposals (differentiated positioning, not just color swaps)
- [ ] **Memorable title per proposal** (Proposal X: [Theme Name], catchy and evocative)
- [ ] **Positioning & Value in 3 points**: (1) Positioning, (2) User Value, (3) Business Value — each 1-2 sentences
- [ ] **Actual generated product image per proposal** (call image tool for all 3, not placeholder text)
- [ ] **Key Specs table with at least 5 fields** (adapted by product category)
- [ ] Comparison table + primary recommendation
- [ ] **Next Step section** with 3-4 actionable follow-up options

✅ **Conditional**:
- [ ] Market Analysis (search-first by default; only skip if user explicitly waives external search/market research)
- [ ] Sourcing - per proposal separately (when user requests)

❌ **Avoid**:
- Writing "[Conceptualizing: ...]" instead of calling image tools
- **Positioning & Value as long paragraph** (use 3-point structure instead)
- **Missing any of the 3 value points** (Positioning, User Value, Business Value — all required)
- **Key Specs table with fewer than 5 fields** (adapt fields to product category, but always at least 5)
- **Mixing languages** (e.g., English headers with Chinese content, or vice versa — pick ONE language and stick to it)
- **Complex phased action plans** (use simple Next Step guidance instead)
- Vague "all proposals are good" (must have clear winner)
- Bulk sourcing analysis (analyze separately)
- Over-engineering simple products

---

## Example

### ❌ WRONG Example (What NOT to do):

```
Proposal 1: Basic Ceramic Mug

**Value**:
- Target: Young professionals
- Positioning: Entry-level
- User Value: Comfortable morning ritual
- Business Value: Low cost, high margin

Visual Assets:
- White BG Product: [Conceptualizing: A minimalist ceramic mug]
```
**Problems**: 
- Title not memorable (should be like "Proposal 1: Morning Comfort Ritual")
- Positioning & Value uses bullet points instead of flowing prose
- No actual image generated
- Missing Key Specs table

---

### ✅ CORRECT Example (What TO do):

```
### Proposal 1: Nomad Life Essential — Urban Stealth Gear

**Positioning & Value**

1. **Positioning**: A minimalist anti-theft backpack for students and young commuters in crowded urban environments.
2. **User Value**: Charcoal-black color scheme with hidden-compartment design creates "visual stealth," solving security anxiety and belongings protection during daily commutes.
3. **Business Value**: Simple craft with standard materials, ideal as a volume-driving SKU for quick market capture; low production barriers but thin margins due to competitive pricing.

**Hero Visual**

[Image generation tool called → actual product image displayed]

**Key Specs**

| Field | Content |
|-------|---------|
| Materials | 600D recycled polyester + PU waterproof coating |
| Dimensions | 45×30×15cm (25L capacity) |
| Structure | Main compartment + hidden back panel pocket + side mesh pockets |
| Core Features | Hidden back-panel zipper, RFID passport sleeve, quick-release strap buckle, reflective safety strip |
| Hardware | YBS zippers, adjustable chest strap with whistle buckle |
| Craft/Details | Reinforced stitching at stress points + heat-sealed inner seams for water resistance |
| Target Cost | BOM $12-18 / Retail $49-59 |
| MOQ/Lead Time | MOQ 500pcs / Lead time 25-30 days |

[Same structure for Proposal 2 and Proposal 3]

---

### Next Step

To move this project forward, I can help you with:

1. **Deep Dive**: Refine a specific proposal's technical details (e.g., finalize internal structure, create detailed BOM) or generate high-fidelity scenario renders.
2. **Explore Variations**: Keep the current analysis framework and generate more differentiated design directions.
3. **Supplier Matching**: Lock in a specific proposal and let me find and screen matching production suppliers.
4. **Execution Plan**: Finalize your chosen proposal and I'll create a concrete action plan from tooling to first batch delivery.
```
**Correct**: 
- Memorable title (Nomad Life Essential — Urban Stealth Gear)
- **3-point Positioning & Value** structure (concise, 1-2 sentences each)
- Actual generated image
- Key Specs table with **8 fields** (minimum 5 required)
- **Next Step** section with actionable follow-ups