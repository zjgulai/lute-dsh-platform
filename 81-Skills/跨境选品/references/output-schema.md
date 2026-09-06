---
title: Cross Border Product Selection Output Schema
doc_type: workflow
module: cross-border-product-selection
topic: output-schema
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# Output Schema

## Product JSON

```json
{
  "run_id": "string",
  "source_type": "asin_list|category_page|ranking_page|keyword_search|detail_page",
  "products": [
    {
      "product_id": "string",
      "asin": "string|null",
      "detail_url": "string",
      "product_title": "string",
      "brand": "string",
      "rating": "number|null",
      "review_count": "integer|null",
      "selling_points": ["string"],
      "specs": {"key": "value"},
      "variants": []
    }
  ],
  "validation": {},
  "notes": []
}
```

## SKU CSV Columns

| Column | Required | Notes |
|---|---|---|
| run_id | yes | Same across one run |
| product_id | yes | ASIN for Amazon, otherwise platform product id |
| asin | amazon-only | Required for Amazon inputs; null for non-Amazon pages |
| sku_id | yes | Stable variant key if available, else generated from ASIN + attributes |
| detail_url | yes | Detail page URL |
| source_url | yes | Listing/category/ASIN source |
| product_title | yes | Detail page title |
| brand | no | Required if visible |
| variant_attributes | yes | JSON string or normalized key-value text |
| price | yes | Variant price |
| rating | yes | Null only when page lacks rating and Notes explains |
| review_count | yes | Null only when page lacks reviews and Notes explains |
| image_url | yes | Extracted URL, not constructed from ASIN |
| image_status | yes | valid, invalid, image_unverified |
| extraction_status | yes | ok, failed, partial |

## Notes

Notes must include:

- failed_asins
- failed_product_ids
- inaccessible_pages
- missing_fields
- image_verification_failures
- legal_or_access_constraints
