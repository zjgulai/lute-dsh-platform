---
name: cross-border-selection
title: "跨境选品"
description: "- Cross-border e-commerce product selection workflow - Scrape product data from platforms like Amazon and save as local files. Use cases: (1) User requests Amazon product data scraping (2) User requests product selection analysis (3) \\\"Help me select products\\\", \\\"Scrape competitor data\\\", \\\"Analyze best-selling products\\\" 边界：聚焦抓取亚马逊等平台数据辅助选品；跨平台全流程走 product-selection"
disable-model-invocation: false
user-invocable: true
whenToUse: "聚焦抓取亚马逊等平台数据辅助选品；跨平台全流程走 product-selection"
---


# Cross-Border E-commerce Product Selection

Scrape product data from e-commerce platforms like Amazon and save as local JSON/CSV files for analysis.

## ⚠️ NEVER DO

- ❌ Construct image URLs from ASIN → **Must use three-tier extraction mechanism**
- ❌ Skip HTTP HEAD verification and use images directly → **Must verify link validity first**
- ❌ Use mock data or placeholders → **Must use real data**
- ❌ **Only scrape data from listing pages** → **Must enter each product detail page**
- ❌ **Create only 1 record per product** → **Must expand by SKU variant, each SKU as a separate row**
- ❌ **Missing key fields** → **Must fully extract 11 core fields (rating, sales, selling points, specs, etc.)**

## Intent Decision Tree

```
User request → Determine scraping target (keyword search / rankings / specified ASIN list)
               ↓
        Extract product ASIN list (listing page)
               ↓
        [Key Step] For each ASIN:
            ├─ Navigate to detail page https://www.amazon.com/dp/{ASIN}
            ├─ Wait for page load (3 seconds)
            ├─ Extract complete data (title, price, rating, reviews, sales, selling points, images)
            ├─ Extract SKU variants (size/color combinations and corresponding prices)
            └─ Close current tab
               ↓
        Data organization → Expand by SKU → One record per SKU
               ↓
        Save as local files (JSON + CSV)
               ↓
        Verify → Record count = Sum of (SKU count per product)
```

## HARD-GATE Mechanism

**Pre-execution Checklist:**

### Phase 1: Preparation
1. ✅ Confirmed target website URL is accessible
2. ✅ Prepared required field mapping table (11 fields)

### Phase 2: Data Scraping
3. ✅ Visited each product's detail page (not listing page)
4. ✅ Extracted complete data (rating, sales, selling points, specs)
5. ✅ Extracted SKU variant information (size/color/price)

### Phase 3: Data Validation
6. ✅ Record count = Sum of (SKU count per product)
7. ✅ Each SKU has an independent price
8. ✅ All required fields have values (no empty values)

### Phase 4: Save
9. ✅ Image links verified via HTTP HEAD (if applicable)
10. ✅ Data saved as JSON and CSV files

**If any condition is not met → Stop and inform the user**

## Core Workflow

### Step 1: Determine Output Path

```
Output directory: ${project}/amazon_selection/{keyword_or_category}_{date}/
Files:
  - products.json   → Complete structured data (with nested variants)
  - products.csv    → Flat table expanded by SKU (for Excel analysis)
```

### Step 2: Data Scraping (❗Must visit detail pages)

**⚠️ Critical Error Example:** First execution only scraped from listing pages, resulting in missing rating, sales, selling points, specs, and other key fields.

**✅ Correct Approach:**

```javascript
// For each ASIN, navigate to the detail page
await use_browser(action='navigate', url=`https://www.amazon.com/dp/${asin}`);
await use_browser(action='wait_for', timeMs=3000);

// Extract complete data
const data = {
    asin: 'B0XXXX',
    title: document.querySelector('#productTitle')?.textContent.trim(),
    price: document.querySelector('.a-price .a-offscreen')?.textContent.trim(),
    rating: extractRating(),
    reviewCount: extractReviewCount(),
    sales: extractSales(),
    bulletPoints: extractBulletPoints(),
    mainImage: document.querySelector('#landingImage')?.dataset.oldHires
};

// Extract SKU variants
const variants = extractVariants(); // See references/scraping-guide.md
```

**Required Fields (11 core fields):**

| # | Field Name | Data Source | Extraction Method |
|---|-----------|-------------|-------------------|
| 1 | Product SKU | Detail page variant selector | Size + Color combination |
| 2 | Parent ASIN | Detail page | `[data-asin]` |
| 3 | Product Title | Detail page | `#productTitle` |
| 4 | SKU Price | Detail page variant price | `.a-price .a-offscreen` |
| 5 | Product Rating ⭐ | **Detail page only** | `[data-hook="rating"]` |
| 6 | Review Count | **Detail page only** | `#acrCustomerReviewText` |
| 7 | Sales Volume | **Detail page only** | `#averageCustomerReviews` |
| 8 | Product Selling Points | **Detail page only** | `#feature-bullets .a-list-item` |
| 9 | Product Specs | **Detail page only** | `#productDetails_todgyTable` |
| 10 | Product Image Link | Detail page | `#landingImage` |
| 11 | Detail Page Link | Browser URL | Current page URL |

### Step 3: Expand Records by SKU

**❌ Wrong approach:** Create only 1 record per product

**✅ Correct approach:**

```python
# Create an independent record for each SKU
rows = []
for product in products:
    if product.get("variants"):
        for variant in product["variants"]:
            sku_name = f"{variant.get('size', '')} - {variant.get('color', '')}".strip(" - ")
            rows.append({
                "sku": sku_name,
                "parent_asin": product["asin"],
                "title": product["title"],
                "price": variant.get("price", product["price"]),
                "rating": product["rating"],
                "reviews": product["review_count"],
                "sales": product["sales"],
                "bullet_points": product["bullet_points_text"],
                "specifications": product["specifications_text"],
                "image_url": product["main_image"],
                "product_url": product["product_url"]
            })
    else:
        # Products without variants also need one record
        rows.append({
            "sku": "Default",
            "parent_asin": product["asin"],
            "title": product["title"],
            "price": product["price"],
            "rating": product["rating"],
            "reviews": product["review_count"],
            "sales": product["sales"],
            "bullet_points": product["bullet_points_text"],
            "specifications": product["specifications_text"],
            "image_url": product["main_image"],
            "product_url": product["product_url"]
        })
```

### Step 4: Save as Local Files

```python
import json
import csv
import os
from datetime import datetime

# Create output directory
output_dir = f"amazon_selection/{keyword}_{datetime.now().strftime('%Y%m%d')}"
os.makedirs(output_dir, exist_ok=True)

# 1. Save JSON (complete structured data with nested variants)
with open(f"{output_dir}/products.json", "w", encoding="utf-8") as f:
    json.dump(products, f, ensure_ascii=False, indent=2)

# 2. Save CSV (expanded by SKU, for Excel analysis)
csv_fields = ["sku", "parent_asin", "title", "price", "rating", "reviews",
              "sales", "bullet_points", "specifications", "image_url", "product_url"]

with open(f"{output_dir}/products.csv", "w", encoding="utf-8-sig", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=csv_fields)
    writer.writeheader()
    writer.writerows(rows)

print(f"✅ Data saved to {output_dir}/")
print(f"   - products.json ({len(products)} products)")
print(f"   - products.csv ({len(rows)} SKU records)")
```

## Key Standards

### Image Handling

**Recommended Approach:** Save image URLs to JSON/CSV fields
- Advantage: Simple and direct, 100% reliable
- Validation: Use HTTP HEAD request to confirm link validity

### SKU Variant Handling Standards

**Must extract variant information:**
- Size (e.g. 35"x22")
- Color (e.g. Green Flower)
- Price (independent price for that variant)
- Stock status (optional)

**Naming convention:**
- Format: `"Size - Color"`
- Example: `"35\"x22\" - Green Flower"`

## Output Standards

✅ Concise output: Only show product list + file save status
❌ Hide technical step details

**Example Output:**
```markdown
✅ Successfully scraped 5 products with 21 SKU variants:

1. B0F6LQHT1M - Dog Beds for Large Dogs
   - 9 SKUs: 30"x20"/35"x22"/41"x28" x 3 colors
   - Price range: $26.99 - $41.39
   - Rating: 4.6⭐ (207 reviews)
   - Sales: 200+ customers purchased in the past month

2. B0FH673NKN - JOEJOY Donut Dog Bed
   - 4 SKUs: XS/S/M/L
   - Price: Starting at $29.99
   - Rating: 4.8⭐ (267 reviews)
   - Sales: 300+ customers purchased in the past month

...

✅ Data saved to amazon_selection/dog_bed_20260320/
   📄 products.json (5 products with complete data)
   📊 products.csv (21 SKU records, can be opened in Excel)
```

## Data Integrity Validation Checklist

After execution, the following must be verified:

### Record Count Validation
- [ ] Total record count = Sum of all products' SKU counts
- [ ] Each product has the correct number of records

### Field Completeness Validation
- [ ] Product SKU: Not empty, format "Size - Color"
- [ ] Parent ASIN: Not empty, 10 characters
- [ ] Product Title: Not empty, length > 20
- [ ] SKU Price: Not empty, format "\$XX.XX"
- [ ] Product Rating: Not empty, numeric format (e.g. 4.6)
- [ ] Review Count: Not empty, numeric format (e.g. 207)
- [ ] Sales: Not empty (e.g. "200+ customers purchased in the past month", or "Not found")
- [ ] Product Selling Points: Not empty, contains at least 3 points
- [ ] Product Specs: Not empty, includes material information
- [ ] Product Image Link: Not empty, valid http(s) URL
- [ ] Detail Page Link: Not empty, valid Amazon product link

### Data Accuracy Validation
- [ ] Randomly check 3 records against Amazon page data
- [ ] All prices are real scraped values, not estimates or placeholders
- [ ] All ratings and review counts are real data

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Invalid image link | Use curl HEAD request to verify |
| **Only scraping from listing pages** | **❗Must navigate to detail page https://www.amazon.com/dp/{ASIN}** |
| **Missing rating/sales/selling points** | **These fields only exist on detail pages, not on listing pages** |
| **Only 1 record per product** | **Must extract SKU variants, each SKU as a separate row** |
| **Insufficient record count** | **Check if SKU variant extraction was missed** |
| Page load failure | Increase wait time, or try web_fetch as a fallback |
| Blocked by Amazon anti-scraping | Increase request intervals, change User-Agent |

## References

- `references/scraping-guide.md` - Detailed scraping scripts and JavaScript code (including detail page extraction)

## Remember

1. **Output path** — Save to `${project}/amazon_selection/{keyword}_{date}/`
2. **Image validation** — HEAD request first, mark "To be supplemented" on failure
3. **Concise output** — Only show results, hide technical details
4. **❗Detail page first** — Must visit detail pages, listing page data is incomplete
5. **❗SKU expansion** — Each SKU variant as a separate row, do not merge
6. **❗Complete fields** — All 11 core fields are mandatory (rating, sales, selling points, specs)
7. **Dual format output** — Save both JSON (structured) and CSV (for Excel analysis)

## Version History

- **v5.0 (2026-03-20)**: Removed DingTalk table dependency, switched to local file storage (JSON + CSV)
- v4.0 (2026-03-14): Added mandatory requirements for "must visit detail pages" and "must expand by SKU"
- v3.0: Added three-tier image extraction mechanism and HTTP HEAD verification
- v2.0: Added field type considerations
- v1.0: Initial version
