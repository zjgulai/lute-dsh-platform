---
name: seo-page-audit
title: "SEO页面审核"
description: "- Audit a single web page's SEO performance, providing a 0-100 score and prioritized technical and content recommendations. 边界：单个页面的 0-100 体检；找词与选题走 seo-keyword-research"
disable-model-invocation: true
whenToUse: "单个页面的 0-100 体检；找词与选题走 seo-keyword-research"
---


# SEO Page Audit

## Overview
A high-ranking page requires more than just good content; it needs a solid technical foundation and perfect on-page optimization. This framework performs a deep-dive audit of a single URL, scoring it across four critical SEO pillars to identify "quick wins" and structural barriers to ranking.

---

## The 4-Category Scoring System (100 Points Total)

### 1. Meta Tags & Header Information (25 Points)
- **Title Tag:** 30-60 characters, keyword-optimized, unique.
- **Meta Description:** 120-160 characters, compelling CTA, includes target keyword.
- **Canonical URL:** Correctly implemented to prevent duplicate content issues.
- **Social Metadata:** Presence of Open Graph (OG) and Twitter Card tags.
- **Language Attribute:** Correct `<html lang="...">` tag for geo-targeting.

### 2. Content Quality & Semantic Structure (25 Points)
- **H1 Tag:** Single, relevant H1 containing the primary keyword.
- **Header Hierarchy:** Logical nesting of H2, H3, and H4 tags (no skipped levels).
- **Word Count:** Minimum 300 words for thin content check (benchmark: 1000+ for competitive terms).
- **Image Alt Text:** Coverage percentage for all `<img>` tags.
- **Internal/External Linking:** Presence of relevant links to build authority and crawlability.

### 3. Technical SEO & Accessibility (25 Points)
- **Mobile Responsiveness:** Presence of the `viewport` meta tag.
- **HTTPS Security:** Valid SSL certificate (HTTPS protocol).
- **URL Hygiene:** Clean, descriptive URL structure without excessive parameters.
- **Schema Markup:** Presence of JSON-LD or Microdata (Article, Product, FAQ, etc.).
- **Crawlability:** Proper `robots` meta tags (no accidental `noindex`).

### 4. Performance & Resource Efficiency (25 Points)
- **HTML Payload:** Total size (Flag if >100KB).
- **Resource Count:** Number of external CSS and JS files (Flag if >20).
- **Inline Bloat:** Excessive inline CSS or JavaScript that delays rendering.
- **Image Optimization:** Presence of modern formats (WebP) or large uncompressed files.

---

## Audit Workflow
1. **Fetch:** Use `web_fetch` to retrieve the full HTML of the target URL.
2. **Analyze:** Parse the DOM to extract meta data, header structure, and technical signals.
3. **Score:** Apply the weighting criteria above to generate category scores.
4. **Report:** Synthesize findings into a prioritized Markdown report.

---

## Scoring Thresholds
- **90 - 100 (Excellent):** Optimized for competitive ranking. Maintain and monitor.
- **70 - 89 (Good):** Solid foundation. Focus on "Warnings" to reach top-tier status.
- **50 - 69 (Needs Work):** Significant barriers. Immediate action required on "Critical" items.
- **< 50 (Critical):** Likely penalized or un-crawlable. Requires fundamental rebuild.

---

## Output Contract (Markdown)
The audit must result in a structured report saved to the workspace:

```markdown
# SEO Audit Report: [URL]
**Date:** [YYYY-MM-DD]
**Overall Score:** [X/100]

## Executive Summary
[A 2-3 sentence overview of the page's SEO health and primary bottleneck.]

## Score Breakdown
| Category | Score | Status |
| :--- | :--- | :--- |
| Meta & Head | X/25 | ✅ / ⚠️ / ❌ |
| Content | X/25 | ✅ / ⚠️ / ❌ |
| Technical | X/25 | ✅ / ⚠️ / ❌ |
| Performance | X/25 | ✅ / ⚠️ / ❌ |

## Detailed Findings
### 🚨 Critical Issues (Fix Immediately)
- [Issue 1]: [Description]
- [Issue 2]: [Description]

### ⚠️ Warnings (Optimization Opportunities)
- [Issue 1]: [Description]

### ✅ Passed Checks
- [List of successful audits]

## Prioritized Recommendations
1. **High Impact:** [Step-by-step fix for critical issue]
2. **Medium Impact:** [Fix for warnings]
3. **Low Impact:** [Minor performance/meta tweaks]
```

---

## Expert Guidelines
- **Contextual Sensitivity:** A personal blog doesn't need the same Schema complexity as an E-commerce product page. Adjust "Criticality" based on site type.
- **Avoid Over-Correction:** Open Graph tags are for social sharing, not direct Google ranking. Don't mark missing OG tags as "Critical."
- **JavaScript Heaviness:** For Single Page Applications (SPAs), note if the content is hidden behind client-side rendering, as this affects indexing.
