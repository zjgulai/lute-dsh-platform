---
title: Cross Border Product Selection SKU Expanded Output Example
doc_type: analysis
module: cross-border-product-selection
topic: sku-expanded-output-example
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# SKU Expanded Output Example

## Input

```text
ASIN list: B000000001, B000000002
Goal: extract SKU-level product data for cross-border product selection.
```

## Expected CSV Shape

| run_id | asin | sku_id | product_title | variant_attributes | price | rating | review_count | image_url | image_status | extraction_status |
|---|---|---|---|---|---|---|---|---|---|---|
| run_20260531_01 | B000000001 | B000000001_black_m | Product A | color=black;size=M | 29.99 | 4.5 | 1200 | https://example.com/a.jpg | valid | ok |
| run_20260531_01 | B000000001 | B000000001_white_m | Product A | color=white;size=M | 31.99 | 4.5 | 1200 | https://example.com/b.jpg | valid | ok |

## Failure Example

If the listing page exposes one ASIN but the detail page is inaccessible, output must stop and report:

```text
failed_asins:
- asin: B000000002
  reason: detail_page_inaccessible
```

Do not generate placeholder SKU rows.
