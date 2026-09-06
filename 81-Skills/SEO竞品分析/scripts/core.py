"""
seo-competitor-analyzer - Competitor SEO analysis core logic.

Analyzes keyword gaps, compares on-page features, scores backlink
opportunities, and generates comprehensive competitor SEO reports.
"""

from __future__ import annotations

import math
import re
from typing import Any


# ──────────────────────────────────────────────
# Keyword Gap Analysis
# ──────────────────────────────────────────────


def analyze_keyword_gap(
    own_keywords: list[dict],
    competitor_keywords: list[dict],
) -> dict:
    """
    Analyze keyword overlap between own site and a competitor.

    Each keyword entry should have a 'keyword' key and optionally a 'volume',
    'position', and 'url' key.

    Args:
        own_keywords: list of dicts with at minimum {'keyword': str}
        competitor_keywords: list of dicts with at minimum {'keyword': str}

    Returns:
        dict with:
            - 'missing_keywords': keywords competitor ranks for but own site does not
            - 'shared_keywords': keywords both rank for
            - 'unique_keywords': keywords only own site ranks for
            - 'overlap_percentage': float (0-100)
            - 'total_own': int
            - 'total_competitor': int
    """
    own_set = {kw.get("keyword", "").strip().lower() for kw in own_keywords if kw.get("keyword")}
    comp_set = {kw.get("keyword", "").strip().lower() for kw in competitor_keywords if kw.get("keyword")}

    missing = list(comp_set - own_set)
    shared = list(own_set & comp_set)
    unique = list(own_set - comp_set)

    total_unique = len(own_set | comp_set)
    overlap_pct = round((len(shared) / total_unique * 100), 2) if total_unique > 0 else 0.0

    # Enrich missing keywords with competitor data
    comp_lookup = {}
    for kw in competitor_keywords:
        key = kw.get("keyword", "").strip().lower()
        if key:
            comp_lookup[key] = kw

    enriched_missing = [
        {
            "keyword": kw,
            "competitor_volume": comp_lookup.get(kw, {}).get("volume"),
            "competitor_position": comp_lookup.get(kw, {}).get("position"),
        }
        for kw in missing
    ]

    enriched_shared = [
        {
            "keyword": kw,
            "competitor_volume": comp_lookup.get(kw, {}).get("volume"),
            "competitor_position": comp_lookup.get(kw, {}).get("position"),
        }
        for kw in shared
    ]

    enriched_unique = [
        {"keyword": kw} for kw in unique
    ]

    return {
        "missing_keywords": sorted(enriched_missing, key=lambda x: x.get("competitor_volume", 0) or 0, reverse=True),
        "shared_keywords": sorted(enriched_shared, key=lambda x: x.get("competitor_volume", 0) or 0, reverse=True),
        "unique_keywords": enriched_unique,
        "overlap_percentage": overlap_pct,
        "total_own": len(own_set),
        "total_competitor": len(comp_set),
        "total_unique_keywords": total_unique,
    }


# ──────────────────────────────────────────────
# Page Feature Comparison
# ──────────────────────────────────────────────


def _count_tags(html: str, tag: str) -> int:
    """Count occurrences of an HTML tag."""
    import re
    return len(re.findall(rf"<{tag}[>\s]", html, re.IGNORECASE))


def _extract_meta(html: str, name: str) -> str | None:
    """Extract meta tag content by name."""
    import re
    match = re.search(
        rf'<meta\s+name=["\']{name}["\']\s+content=["\']([^"\']*)["\']',
        html, re.IGNORECASE,
    )
    if match:
        return match.group(1)
    # Try reversed attribute order
    match = re.search(
        rf'<meta\s+content=["\']([^"\']*)["\']\s+name=["\']{name}["\']',
        html, re.IGNORECASE,
    )
    return match.group(1) if match else None


def _count_images(html: str) -> int:
    """Count img tags."""
    import re
    return len(re.findall(r"<img[>\s]", html, re.IGNORECASE))


def _count_internal_links(html: str, domain: str) -> int:
    """Count internal links pointing to the given domain."""
    import re
    links = re.findall(r'<a\s[^>]*href=["\']([^"\']*)["\']', html, re.IGNORECASE)
    if not domain:
        return len(links)
    return sum(1 for link in links if domain in link or link.startswith("/"))


def _has_schema(html: str) -> bool:
    """Check if page has structured data (JSON-LD or microdata)."""
    import re
    return bool(
        re.search(r'<script[^>]*type=["\']application/ld\+json["\']', html, re.IGNORECASE)
        or re.search(r'itemscope|itemtype=["\']http', html, re.IGNORECASE)
    )


_EXTRACT_H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.IGNORECASE | re.DOTALL)
_EXTRACT_H2 = re.compile(r"<h2[^>]*>(.*?)</h2>", re.IGNORECASE | re.DOTALL)
_EXTRACT_H3 = re.compile(r"<h3[^>]*>(.*?)</h3>", re.IGNORECASE | re.DOTALL)
_TAG_CLEAN = re.compile(r"<[^>]+>")
_TITLE_EXTRACT = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


def _strip_html(text: str) -> str:
    return _TAG_CLEAN.sub("", text).strip()


def _extract_features_from_html(html: str) -> dict:
    """Extract page features from raw HTML."""
    title_match = _TITLE_EXTRACT.search(html)
    title = _strip_html(title_match.group(1)) if title_match else ""

    meta_desc = _extract_meta(html, "description")

    h1_count = _count_tags(html, "h1")
    h2_count = _count_tags(html, "h2")
    h3_count = _count_tags(html, "h3")

    body_match = re.search(r"<body[^>]*>(.*?)</body>", html, re.IGNORECASE | re.DOTALL)
    body_text = _strip_html(body_match.group(1) if body_match else html)
    word_count = len(body_text.split()) if body_text else 0

    return {
        "title": title,
        "title_length": len(title),
        "meta_description_present": meta_desc is not None,
        "meta_description_length": len(meta_desc) if meta_desc else 0,
        "h1_count": h1_count,
        "h2_count": h2_count,
        "h3_count": h3_count,
        "word_count": word_count,
        "image_count": _count_images(html),
        "schema_present": _has_schema(html),
    }


def compare_page_features(
    own_page: dict | str,
    competitor_pages: list[dict | str],
) -> dict:
    """
    Compare on-page features between own page and competitor pages.

    Each page entry can be a raw HTML string or a dict with key 'html' and
    optionally 'url' or 'label'. An optional 'domain' key enables internal
    link detection.

    Args:
        own_page: own page HTML string or dict with 'html' key.
        competitor_pages: list of competitor pages (same format as own_page).

    Returns:
        dict with:
            - 'own_features': extracted features of own page
            - 'competitor_features': list of competitor feature dicts
            - 'comparison': dict with best/worst/avg per metric
    """
    own_html = own_page if isinstance(own_page, str) else own_page.get("html", "")
    own_domain = own_page.get("domain", "") if isinstance(own_page, dict) else ""
    own_features = _extract_features_from_html(own_html)
    if own_domain:
        own_features["internal_link_count"] = _count_internal_links(own_html, own_domain)

    comp_features: list[dict] = []
    for i, page in enumerate(competitor_pages):
        html = page if isinstance(page, str) else page.get("html", "")
        domain = page.get("domain", "") if isinstance(page, dict) else ""
        label = page.get("label", f"competitor_{i + 1}") if isinstance(page, dict) else f"competitor_{i + 1}"
        url = page.get("url", "") if isinstance(page, dict) else ""
        feat = _extract_features_from_html(html)
        if domain:
            feat["internal_link_count"] = _count_internal_links(html, domain)
        feat["label"] = label
        feat["url"] = url
        comp_features.append(feat)

    # Build comparison
    numeric_keys = ["title_length", "h1_count", "h2_count", "h3_count",
                     "word_count", "image_count", "meta_description_length"]
    if "internal_link_count" in own_features:
        numeric_keys.append("internal_link_count")

    comparison: dict[str, Any] = {}
    for key in numeric_keys:
        comp_vals = [f.get(key, 0) or 0 for f in comp_features]
        own_val = own_features.get(key, 0) or 0
        comparison[key] = {
            "own": own_val,
            "avg_competitor": round(sum(comp_vals) / len(comp_vals), 1) if comp_vals else 0,
            "best_competitor": max(comp_vals) if comp_vals else 0,
            "worst_competitor": min(comp_vals) if comp_vals else 0,
            "delta_vs_avg": round(own_val - (sum(comp_vals) / len(comp_vals) if comp_vals else 0), 1),
        }

    boolean_keys = ["meta_description_present", "schema_present"]
    for key in boolean_keys:
        comp_vals = [f.get(key, False) for f in comp_features]
        own_val = own_features.get(key, False)
        comparison[key] = {
            "own": own_val,
            "competitor_count_true": sum(comp_vals),
            "competitor_total": len(comp_vals),
        }

    return {
        "own_features": own_features,
        "competitor_features": comp_features,
        "comparison": comparison,
    }


# ──────────────────────────────────────────────
# Backlink Opportunity Scoring
# ──────────────────────────────────────────────


def score_backlink_opportunities(
    competitor_backlinks: list[dict],
) -> list[dict]:
    """
    Score and classify competitor backlink opportunities.

    Args:
        competitor_backlinks: list of dicts, each with:
            - 'domain': str (linking domain)
            - 'dr': float (Domain Rating 0-100) — optional, default 30
            - 'relevance_score': float (0-1) — optional, default 0.5
            - 'dofollow': bool — optional, default True
            - 'url': str — optional
            - 'anchor': str — optional

    Returns:
        list of enriched dicts sorted by composite score descending,
        each with:
            - 'domain', 'dr', 'relevance_score', 'dofollow_ratio'
            - 'composite_score': float (0-100)
            - 'value_tier': 'high' | 'medium' | 'low'
    """
    if not competitor_backlinks:
        return []

    scored: list[dict] = []
    for bl in competitor_backlinks:
        dr = float(bl.get("dr", 30))
        relevance = float(bl.get("relevance_score", 0.5))
        dofollow = bool(bl.get("dofollow", True))

        # Composite score: DR weight 40%, Relevance weight 40%, Dofollow weight 20%
        dr_score = min(dr, 100) * 0.4
        relevance_score = min(relevance, 1.0) * 100 * 0.4
        dofollow_score = 100 * 0.2 if dofollow else 0
        composite = round(dr_score + relevance_score + dofollow_score, 1)

        if composite >= 70:
            tier = "high"
        elif composite >= 40:
            tier = "medium"
        else:
            tier = "low"

        scored.append({
            "domain": bl.get("domain", "unknown"),
            "dr": dr,
            "relevance_score": relevance,
            "dofollow": dofollow,
            "url": bl.get("url", ""),
            "anchor": bl.get("anchor", ""),
            "composite_score": composite,
            "value_tier": tier,
        })

    scored.sort(key=lambda x: x["composite_score"], reverse=True)
    return scored


# ──────────────────────────────────────────────
# Full Report
# ──────────────────────────────────────────────


def generate_seo_competitor_report(
    own_data: dict,
    competitor_data: dict,
    config: dict | None = None,
) -> dict:
    """
    Generate a comprehensive SEO competitor analysis report.

    Pipeline:
        1. Keyword gap analysis (own vs competitor)
        2. Page feature comparison
        3. Backlink opportunity scoring

    Args:
        own_data: dict with keys:
            - 'keywords': list[dict]
            - 'page': dict (HTML string or features)
            - 'domain': str (optional, for internal link detection)
        competitor_data: dict with keys:
            - 'keywords': list[dict]
            - 'pages': list[dict]
            - 'backlinks': list[dict]
            - 'name': str (competitor name)
        config: optional dict with:
            - 'competitor_name': str override

    Returns:
        dict with full competitor analysis report.
    """
    config = config or {}
    comp_name = config.get("competitor_name", competitor_data.get("name", "Competitor"))

    # Step 1: Keyword gap
    keyword_gap = analyze_keyword_gap(
        own_data.get("keywords", []),
        competitor_data.get("keywords", []),
    )

    # Step 2: Page features
    own_page = own_data.get("page", {})
    if isinstance(own_page, dict) and "domain" not in own_page and own_data.get("domain"):
        own_page["domain"] = own_data["domain"]
    page_comparison = compare_page_features(
        own_page,
        competitor_data.get("pages", []),
    )

    # Step 3: Backlink opportunities
    backlinks = score_backlink_opportunities(
        competitor_data.get("backlinks", []),
    )

    # Count by tier
    high_value = [b for b in backlinks if b["value_tier"] == "high"]
    medium_value = [b for b in backlinks if b["value_tier"] == "medium"]

    # Priority actions
    priority_actions: list[dict] = []

    # Missing keywords with volume
    missing_with_volume = [
        k for k in keyword_gap.get("missing_keywords", [])
        if k.get("competitor_volume") and k["competitor_volume"] > 100
    ]
    if missing_with_volume:
        priority_actions.append({
            "priority": "high",
            "action": "Target missing keywords with content creation",
            "details": f"{len(missing_with_volume)} keywords above 100 search volume not currently targeted",
            "keywords": [k["keyword"] for k in missing_with_volume[:10]],
        })

    # Low word count vs competitors
    word_comp = page_comparison.get("comparison", {}).get("word_count", {})
    if word_comp.get("delta_vs_avg", 0) < -200:
        priority_actions.append({
            "priority": "medium",
            "action": "Increase page content depth",
            "details": f"Word count is {abs(word_comp['delta_vs_avg'])} below competitor average",
        })

    # Missing schema
    schema_comp = page_comparison.get("comparison", {}).get("schema_present", {})
    if not schema_comp.get("own", False) and schema_comp.get("competitor_count_true", 0) > 0:
        priority_actions.append({
            "priority": "high",
            "action": "Add structured data markup",
            "details": f"{schema_comp['competitor_count_true']}/{schema_comp['competitor_total']} competitors use schema markup",
        })

    # Missing meta description
    meta_comp = page_comparison.get("comparison", {}).get("meta_description_present", {})
    if not meta_comp.get("own", False) and meta_comp.get("competitor_count_true", 0) > 0:
        priority_actions.append({
            "priority": "high",
            "action": "Add meta description",
            "details": "Competitors with meta descriptions outrank for shared keywords",
        })

    # Backlink opportunities
    if high_value:
        priority_actions.append({
            "priority": "high",
            "action": "Pursue high-value backlink opportunities",
            "details": f"{len(high_value)} high-value backlink prospects identified",
            "domains": [b["domain"] for b in high_value[:5]],
        })
    if medium_value:
        priority_actions.append({
            "priority": "medium",
            "action": "Build relationships with medium-value linking domains",
            "details": f"{len(medium_value)} medium-value prospects to engage",
        })

    summary = {
        "competitor": comp_name,
        "keyword_overlap_pct": keyword_gap.get("overlap_percentage", 0),
        "missing_keywords_count": len(keyword_gap.get("missing_keywords", [])),
        "shared_keywords_count": len(keyword_gap.get("shared_keywords", [])),
        "unique_keywords_count": len(keyword_gap.get("unique_keywords", [])),
        "backlink_opportunities_total": len(backlinks),
        "high_value_backlinks": len(high_value),
        "priority_actions_count": len(priority_actions),
    }

    return {
        "competitor": comp_name,
        "keyword_gap_analysis": keyword_gap,
        "page_feature_comparison": page_comparison,
        "backlink_opportunities": backlinks,
        "top_opportunities": {
            "missing_keywords_top": missing_with_volume[:10],
            "high_value_backlinks_top": high_value[:5],
        },
        "priority_actions": priority_actions,
        "summary": summary,
    }
