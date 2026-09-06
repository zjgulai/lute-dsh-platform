---
title: Allbirds Tree Runner Detail Page Trial
doc_type: analysis
module: cross-border-product-selection
topic: detail-page-sku-trial
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# Allbirds Tree Runner Detail Page Trial

## Trial Metadata

- Skill: `cross-border-product-selection`
- Trial type: real public detail page extraction
- Source platform: Allbirds Shopify storefront
- Source URL: `https://www.allbirds.com/products/womens-tree-runners-jet-black-white`
- Structured detail source: `https://www.allbirds.com/products/womens-tree-runners-jet-black-white.js`
- Retrieval date: 2026-05-31
- Run ID: `run_20260531_allbirds_tree_runner_01`
- Outcome: pass with schema adjustment; non-Amazon detail pages need `product_id` instead of mandatory `asin`.

## User Request

```text
请从这个公开商品详情页提取 SKU 级选品数据，展开所有尺码变体，输出 JSON 和 SKU-expanded CSV，并验证图片 URL 不是拼接出来的。
```

## Run Summary

| Field | Value |
|---|---|
| source_type | detail_page |
| detail_pages | 1 |
| products | 1 |
| sku_rows | 7 |
| failed_product_ids | 0 |
| image_verification | HTTP HEAD 200, content-type image/png |
| rating/review_count | null; product detail JSON did not expose these fields |

## Product-Level JSON

```json
{
  "run_id": "run_20260531_allbirds_tree_runner_01",
  "source_type": "detail_page",
  "products": [
    {
      "product_id": "4870547963984",
      "asin": null,
      "detail_url": "https://www.allbirds.com/products/womens-tree-runners-jet-black-white",
      "product_title": "Women's Tree Runner - Jet Black (White Sole)",
      "brand": "Allbirds",
      "rating": null,
      "review_count": null,
      "selling_points": [
        "Breathable and lightweight sneaker",
        "Made with responsibly sourced eucalyptus tree fiber",
        "Designed for everyday casual wear, walking, and warmer weather"
      ],
      "specs": {
        "type": "Shoes",
        "gender": "womens",
        "material": "tree",
        "color": "Jet Black (White Sole)",
        "carbon_score": "4.52"
      },
      "variants": [
        {"sku_id": "33179620868176", "sku": "TR3WJBW050", "size": "5", "price_usd": 100.0, "available": true},
        {"sku_id": "33179620900944", "sku": "TR3WJBW060", "size": "6", "price_usd": 100.0, "available": true},
        {"sku_id": "33179620933712", "sku": "TR3WJBW070", "size": "7", "price_usd": 100.0, "available": true},
        {"sku_id": "33179620966480", "sku": "TR3WJBW080", "size": "8", "price_usd": 100.0, "available": true},
        {"sku_id": "33179620999248", "sku": "TR3WJBW090", "size": "9", "price_usd": 100.0, "available": true},
        {"sku_id": "33179621032016", "sku": "TR3WJBW100", "size": "10", "price_usd": 100.0, "available": true},
        {"sku_id": "33179621064784", "sku": "TR3WJBW110", "size": "11", "price_usd": 100.0, "available": true}
      ]
    }
  ],
  "validation": {
    "detail_page_first": "pass",
    "sku_expansion": "pass",
    "sku_count": 7,
    "image_url_source": "extracted from product JSON featured_image",
    "image_status": "valid",
    "image_head_status": 200,
    "image_content_type": "image/png"
  },
  "notes": [
    "No ASIN exists because this is a non-Amazon product detail page; use product_id.",
    "rating and review_count are null because the product detail JSON did not expose review statistics.",
    "Image URL was extracted from page structured product JSON, not constructed from SKU or product id."
  ]
}
```

## SKU-Expanded CSV

| run_id | product_id | asin | sku_id | sku | detail_url | source_url | product_title | brand | variant_attributes | price | rating | review_count | image_url | image_status | extraction_status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| run_20260531_allbirds_tree_runner_01 | 4870547963984 | null | 33179620868176 | TR3WJBW050 | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | Women's Tree Runner - Jet Black (White Sole) | Allbirds | size=5;color=Jet Black (White Sole) | 100.00 USD | null | null | https://cdn.shopify.com/s/files/1/1104/4168/files/TR3MJBW080_SHOE_LEFT_GLOBAL_MENS_TREE_RUNNER_JET_BLACK_WHITE_c081cf2c-e25d-4bbf-aaff-7412be639de5.png?v=1751165490 | valid | ok |
| run_20260531_allbirds_tree_runner_01 | 4870547963984 | null | 33179620900944 | TR3WJBW060 | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | Women's Tree Runner - Jet Black (White Sole) | Allbirds | size=6;color=Jet Black (White Sole) | 100.00 USD | null | null | https://cdn.shopify.com/s/files/1/1104/4168/files/TR3MJBW080_SHOE_LEFT_GLOBAL_MENS_TREE_RUNNER_JET_BLACK_WHITE_c081cf2c-e25d-4bbf-aaff-7412be639de5.png?v=1751165490 | valid | ok |
| run_20260531_allbirds_tree_runner_01 | 4870547963984 | null | 33179620933712 | TR3WJBW070 | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | Women's Tree Runner - Jet Black (White Sole) | Allbirds | size=7;color=Jet Black (White Sole) | 100.00 USD | null | null | https://cdn.shopify.com/s/files/1/1104/4168/files/TR3MJBW080_SHOE_LEFT_GLOBAL_MENS_TREE_RUNNER_JET_BLACK_WHITE_c081cf2c-e25d-4bbf-aaff-7412be639de5.png?v=1751165490 | valid | ok |
| run_20260531_allbirds_tree_runner_01 | 4870547963984 | null | 33179620966480 | TR3WJBW080 | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | Women's Tree Runner - Jet Black (White Sole) | Allbirds | size=8;color=Jet Black (White Sole) | 100.00 USD | null | null | https://cdn.shopify.com/s/files/1/1104/4168/files/TR3MJBW080_SHOE_LEFT_GLOBAL_MENS_TREE_RUNNER_JET_BLACK_WHITE_c081cf2c-e25d-4bbf-aaff-7412be639de5.png?v=1751165490 | valid | ok |
| run_20260531_allbirds_tree_runner_01 | 4870547963984 | null | 33179620999248 | TR3WJBW090 | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | Women's Tree Runner - Jet Black (White Sole) | Allbirds | size=9;color=Jet Black (White Sole) | 100.00 USD | null | null | https://cdn.shopify.com/s/files/1/1104/4168/files/TR3MJBW080_SHOE_LEFT_GLOBAL_MENS_TREE_RUNNER_JET_BLACK_WHITE_c081cf2c-e25d-4bbf-aaff-7412be639de5.png?v=1751165490 | valid | ok |
| run_20260531_allbirds_tree_runner_01 | 4870547963984 | null | 33179621032016 | TR3WJBW100 | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | Women's Tree Runner - Jet Black (White Sole) | Allbirds | size=10;color=Jet Black (White Sole) | 100.00 USD | null | null | https://cdn.shopify.com/s/files/1/1104/4168/files/TR3MJBW080_SHOE_LEFT_GLOBAL_MENS_TREE_RUNNER_JET_BLACK_WHITE_c081cf2c-e25d-4bbf-aaff-7412be639de5.png?v=1751165490 | valid | ok |
| run_20260531_allbirds_tree_runner_01 | 4870547963984 | null | 33179621064784 | TR3WJBW110 | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | https://www.allbirds.com/products/womens-tree-runners-jet-black-white | Women's Tree Runner - Jet Black (White Sole) | Allbirds | size=11;color=Jet Black (White Sole) | 100.00 USD | null | null | https://cdn.shopify.com/s/files/1/1104/4168/files/TR3MJBW080_SHOE_LEFT_GLOBAL_MENS_TREE_RUNNER_JET_BLACK_WHITE_c081cf2c-e25d-4bbf-aaff-7412be639de5.png?v=1751165490 | valid | ok |

## Validation Report

| Gate | Result | Evidence |
|---|---|---|
| Access and scope | pass | Public product detail page and public product JSON endpoint |
| Detail page first | pass | Extraction used product detail URL and detail JSON, not listing page |
| SKU expansion | pass | 7 variants became 7 SKU rows |
| Required fields | pass with Notes | `rating` and `review_count` are null because source did not expose them |
| Image verification | pass | Image URL extracted from `featured_image`; HTTP HEAD returned 200 and `image/png` |
| Output integrity | pass | Product JSON parses; CSV row count equals SKU count |

## Sources

```text
[1] https://www.allbirds.com/products/womens-tree-runners-jet-black-white - public detail page
[2] https://www.allbirds.com/products/womens-tree-runners-jet-black-white.js - public product JSON detail data
[3] https://cdn.shopify.com/s/files/1/1104/4168/files/TR3MJBW080_SHOE_LEFT_GLOBAL_MENS_TREE_RUNNER_JET_BLACK_WHITE_c081cf2c-e25d-4bbf-aaff-7412be639de5.png?v=1751165490 - extracted image URL, HEAD 200
```

## Trial Notes

- This trial proves the Skill should support non-Amazon `detail_page` input in addition to ASIN workflows.
- `asin` cannot be mandatory for non-Amazon pages; `product_id` is the cross-platform key.
- Variant-specific images were not exposed at variant level, so every size row uses the product-level extracted featured image.
- The output did not infer rating or review count from unavailable fields.
