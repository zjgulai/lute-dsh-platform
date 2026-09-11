---
name: ecommerce-seo-optimizer
title: "电商SEO优化器"
description: "- Optimize product pages for organic search using meta tag frameworks, JSON-LD structured data, and technical crawl management. 边界：店铺/商品页级技术 SEO；单页体检走 seo-page-audit"
disable-model-invocation: true
whenToUse: "店铺/商品页级技术 SEO；单页体检走 seo-page-audit"
---


# Optimize Ecommerce Product Page SEO

## Overview

Ecommerce SEO focuses on the technical and content foundations that help search engines understand and rank your product pages. The primary goal is to achieve "Rich Results" in Google Search—where your price, availability, and star ratings appear directly on the Search Engine Results Page (SERP).

Success depends on three pillars: **Content Relevance** (titles and descriptions), **Technical Clarity** (canonicals and sitemaps), and **Structured Data** (JSON-LD).

## When to Use This Skill

- When launching new products that need to compete for organic keywords.
- When products are indexed but not showing price or review stars in search results.
- When managing large catalogs where "Faceted Navigation" (filters) creates duplicate content risks.
- When optimizing for Core Web Vitals to improve search ranking and mobile conversion.

## 1. Content Optimization Framework

The highest-ROI SEO work is optimizing the elements users see first in search results.

### Product Title Tag Format
- **Rule**: `[Brand] [Product Name] [Key Attribute/Color] - [Store Name]`
- **Example**: "North Face Men's Denali Fleece Jacket Black - Outdoor Gear Co."
- **Why**: Includes the brand for trust, the product name for the core keyword, and attributes for "long-tail" searches (e.g., color/material).

### Meta Description Format
- **Rule**: 150–160 characters. Include price/value, key benefit, and a clear Call to Action (CTA).
- **Example**: "Shop North Face Denali jackets starting at $179. Durable, recycled fleece for ultimate warmth. Free shipping on orders over $99. Order yours today!"

### Image SEO
- **Filename**: `brand-product-name-color-view.jpg` (e.g., `nike-air-max-white-side.jpg`). Avoid generic names like `IMG_001.jpg`.
- **Alt Text**: Descriptive but concise. `[Product Name] - [Color/Angle]`. This helps your products rank in **Google Image Search**, a major traffic driver for fashion and home goods.

## 2. JSON-LD Structured Data

Structured data tells Google exactly what your product is. Use the JSON-LD format (recommended by Google over Microdata).

### Recommended Product Schema Implementation
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Organic Cotton T-Shirt",
  "image": ["https://store.com/images/tshirt-front.jpg"],
  "description": "Premium 100% organic cotton tee in navy blue.",
  "sku": "TSH-NVY-ORG-S",
  "brand": { "@type": "Brand", "name": "EcoWear" },
  "offers": {
    "@type": "Offer",
    "url": "https://store.com/products/organic-tshirt",
    "priceCurrency": "USD",
    "price": "29.00",
    "availability": "https://schema.org/InStock",
    "priceValidUntil": "2026-12-31"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "124"
  }
}
```
**Validation**: Use the **Google Rich Results Test** to verify that your implementation is correct and eligible for search enhancements.

## 3. Technical Crawl and Canonical Strategy

### Canonical URL Handling
Canonical tags tell search engines which version of a URL is the "master" copy. This prevents duplicate content issues from URL parameters.

- **Variant Strategy**: If you have multiple colors/sizes of a product, decide whether to canonicalize all variants to a single "Hero" product or allow each to be indexed.
  - *Recommendation*: Canonicalize minor variants (sizes) to the base product. For major variants (colors) with high search volume, allow indexing but ensure unique titles/descriptions.

```html
<!-- Example: /products/blue-widget?variant=123 should canonical back to the base -->
<link rel="canonical" href="https://yourstore.com/products/blue-widget" />
```

### Managing Faceted Navigation at Scale
Faceted navigation (filters for size, color, price) can create millions of URLs that waste "crawl budget."
- **3+ Filters**: If a user selects 3 or more filters, the resulting page should be set to `noindex, follow`.
- **Sorting**: Pages sorted by "Price: Low to High" should always canonical back to the main collection URL.
- **Empty Pages**: Ensure that a filter combo with zero products returns a `404` or `noindex` status to avoid indexing "thin content" pages.

### Robots.txt Best Practices
Explicitly block crawlers from non-revenue pages to focus their attention on products:
- `Disallow: /cart`
- `Disallow: /checkout`
- `Disallow: /account`
- `Disallow: /search` (Internal search result pages should NEVER be indexed).

## 4. Performance and Core Web Vitals

Google uses site speed as a ranking factor. Targets for ecommerce:
- **LCP (Largest Contentful Paint)**: < 2.5s (Your hero product image should load quickly).
- **CLS (Cumulative Layout Shift)**: < 0.1 (Ensure the page doesn't "jump" as images or fonts load).
- **Optimization Tip**: Use modern image formats (WebP) and ensure your platform's CDN (Content Delivery Network) is active for global users.

## Diagnostic Questions

1.  **Does your sitemap update automatically?** Check `yourstore.com/sitemap.xml`.
2.  **Are you using self-referencing canonicals?** Every product page should point to itself as the primary source to prevent tracking parameters from creating duplicates.
3.  **Are your review stars showing in Google?** If not, check if your review platform is correctly injecting `AggregateRating` schema into your product page.
4.  **How do you handle out-of-stock items?**
    - *Temporary*: Keep the page live (200 status), show "Out of Stock," and offer an "Email when back" signup.
    - *Permanent*: 301 redirect the URL to the most relevant current product or category.
