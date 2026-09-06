"""
cbec-product-attribute-analyzer - Product Attribute Analyzer core logic.

Applies 3D labels (structure, design, market), computes sales-weighted shares,
identifies blank attribute combinations with demand cross-validation, and
computes attribute elasticity across price tiers.
"""

from __future__ import annotations

import math
import re
from typing import Any

from skills._shared.data_validator import check_sample_size


# ──────────────────────────────────────────────
# Tagging Dictionaries
# ──────────────────────────────────────────────

STRUCTURE_TAGS: dict[str, list[str]] = {
    "shape": ["round", "square", "oval", "rectangle", "curved", "flat", "triangular", "circular",
              "圆形", "方形", "椭圆", "扁平", "弯曲", "三角形"],
    "form_factor": ["portable", "wearable", "handheld", "desktop", "wall-mounted", "clip-on",
                    "portable", "wearable", "折叠", "便携", "手持", "台式", "壁挂", "夹式"],
    "material": ["silicone", "plastic", "wood", "metal", "glass", "textile", "fabric", "ceramic",
                 "rubber", "stainless", "cotton", "bamboo", "leather",
                 "硅胶", "塑料", "木材", "金属", "玻璃", "纺织", "陶瓷", "橡胶", "不锈钢", "棉", "竹"],
}

DESIGN_TAGS: list[str] = {
    "color": ["white", "black", "pink", "blue", "green", "gray", "beige", "brown", "red", "purple",
              "透明", "白色", "黑色", "粉色", "蓝色", "绿色", "灰色", "米色"],
    "pattern": ["striped", "dot", "floral", "solid", "mesh", "transparent", "translucent",
                "条纹", "圆点", "花卉", "纯色", "网眼", "透明"],
    "feature": ["adjustable", "removable", "rechargeable", "waterproof", "breathable", "insulated",
                "quiet", "noise-reducing", "anti-leak", "hands-free", "washable", "foldable",
                "可调节", "可拆卸", "可充电", "防水", "透气", "静音", "免提", "可洗", "可折叠"],
}

MARKET_TAGS: dict[str, list[str]] = {
    "price_tier": ["budget", "premium", "luxury", "value", "affordable", "高端", "平价", "经济", "豪华"],
    "target_age": ["baby", "infant", "toddler", "kids", "adult", "elderly",
                   "婴儿", "幼儿", "儿童", "成人", "老人"],
    "usage_scenario": ["home", "travel", "office", "outdoor", "night", "hospital",
                       "家用", "旅行", "办公", "户外", "夜间", "医院"],
}


# ──────────────────────────────────────────────
# Auto-Tagging
# ──────────────────────────────────────────────


def _detect_tags(text: str, tag_dict: dict[str, list[str]]) -> dict[str, list[str]]:
    """Detect which tags from each dimension apply to a text string."""
    text_lower = text.lower()
    result: dict[str, list[str]] = {}
    for dimension, keywords in tag_dict.items():
        matches: list[str] = []
        for kw in keywords:
            if kw in text_lower:
                matches.append(kw)
        if matches:
            result[dimension] = matches
    return result


def _auto_tag_product(product: dict) -> dict:
    """
    Auto-detect 3D tags for a single product.

    Scans product name, description, and specs for matching keywords across
    structure, design, and market dimensions.
    """
    search_text = " ".join([
        product.get("name", ""),
        product.get("title", ""),
        product.get("description", ""),
        product.get("specs", "") if isinstance(product.get("specs"), str) else " ".join(product.get("specs", {})),
    ])

    structure = _detect_tags(search_text, STRUCTURE_TAGS)
    design = _detect_tags(search_text, DESIGN_TAGS)
    market = _detect_tags(search_text, MARKET_TAGS)

    return {
        "structure": structure or {"_unmarked": True},
        "design": design or {"_unmarked": True},
        "market": market or {"_unmarked": True},
    }


# ──────────────────────────────────────────────
# Tag Products
# ──────────────────────────────────────────────


def tag_products(products: list[dict], dimensions: list[str] | None = None) -> list[dict]:
    """
    Apply 3D labels (structure/shape/material, design/color/pattern/feature,
    market/price_tier/target_age) to each product.

    Supports three dimensions: structure, design, market. Auto-detects tags
    from product name, description, and specs. Products with insufficient info
    are marked with '_unmarked'.

    Args:
        products: list of product dicts. Each should have 'name' and optionally
                  'title', 'description', 'specs', 'sales', 'price', 'rating',
                  'asin', 'reviews'.
        dimensions: subset of ['structure', 'design', 'market'] to apply.
                    Defaults to all three.

    Returns:
        list of product dicts enriched with 'tags' key containing 3D labels.
    """
    if not products:
        return []

    dims = dimensions or ["structure", "design", "market"]
    result: list[dict] = []

    for product in products:
        enriched = dict(product)
        tags = _auto_tag_product(product)
        enriched["tags"] = {d: tags.get(d, {"_unmarked": True}) for d in dims}
        result.append(enriched)

    return result


# ──────────────────────────────────────────────
# Sales-Weighted Share
# ──────────────────────────────────────────────


def _get_sales(product: dict) -> float:
    """Extract sales volume from a product dict, defaulting to 1.0."""
    return float(product.get("sales", product.get("sales_volume", 1)))


def sales_weighted_share(products: list[dict], dimension: str) -> dict:
    """
    Compute share by sales volume (NOT ASIN count).

    For a given dimension ('structure', 'design', 'market'), computes each
    attribute value's ASIN count, sales-weighted share, average price, and
    average rating.

    Args:
        products: list of tagged product dicts (from tag_products).
        dimension: one of 'structure', 'design', 'market'.

    Returns:
        dict with:
            - 'dimension': str
            - 'total_products': int
            - 'total_sales': float
            - 'attributes': list[dict] sorted by sales_share_pct descending:
                - 'attribute': str
                - 'asin_count': int
                - 'sales_share_pct': float
                - 'avg_price': float
                - 'avg_rating': float
                - 'avg_reviews': float
    """
    if not products:
        return {"dimension": dimension, "total_products": 0, "total_sales": 0, "attributes": []}

    # Aggregate by attribute within the dimension
    agg: dict[str, dict] = {}
    total_sales = 0.0

    for product in products:
        tags = product.get("tags", {}).get(dimension, {})
        if not tags or "_unmarked" in tags:
            continue

        sales_val = _get_sales(product)
        total_sales += sales_val
        price = float(product.get("price", 0) or 0)
        rating = float(product.get("rating", 0) or 0)
        reviews = float(product.get("reviews", 0) or 0)

        # Each sub-dimension key is the attribute name
        for attr, _ in tags.items():
            if attr == "_unmarked":
                continue
            if attr not in agg:
                agg[attr] = {
                    "asin_count": 0,
                    "total_sales": 0.0,
                    "prices": [],
                    "ratings": [],
                    "reviews": [],
                }
            agg[attr]["asin_count"] += 1
            agg[attr]["total_sales"] += sales_val
            agg[attr]["prices"].append(price)
            agg[attr]["ratings"].append(rating)
            agg[attr]["reviews"].append(reviews)

    attributes = sorted(
        [
            {
                "attribute": attr,
                "asin_count": v["asin_count"],
                "sales_share_pct": round(v["total_sales"] / total_sales * 100, 2) if total_sales > 0 else 0.0,
                "avg_price": round(sum(v["prices"]) / len(v["prices"]), 2) if v["prices"] else 0.0,
                "avg_rating": round(sum(v["ratings"]) / len(v["ratings"]), 2) if v["ratings"] else 0.0,
                "avg_reviews": round(sum(v["reviews"]) / len(v["reviews"]), 2) if v["reviews"] else 0.0,
            }
            for attr, v in agg.items()
        ],
        key=lambda x: x["sales_share_pct"],
        reverse=True,
    )

    return {
        "dimension": dimension,
        "total_products": len(products),
        "total_sales": round(total_sales, 2),
        "attributes": attributes,
    }


# ──────────────────────────────────────────────
# Identify Blank Combinations
# ──────────────────────────────────────────────


def _get_dimension_tags(product: dict, dim: str) -> list[str]:
    """Get list of non-unmarked tag keys for a dimension."""
    tags = product.get("tags", {}).get(dim, {})
    if "_unmarked" in tags:
        return []
    return list(tags.keys())


def identify_blank_combinations(
    products: list[dict], dim1: str, dim2: str
) -> list[dict]:
    """
    Find attribute combinations with low supply (<5% ASIN share) but high
    demand signals. Classifies each into pseudo_opportunity, difficulty_barrier,
    or attackable_white_space.

    Analyzes cross-dimension combinations (e.g., structure × design) to find
    pairs where few ASINs exist but individual ASIN sales efficiency is high.

    Args:
        products: list of tagged product dicts (from tag_products).
        dim1: first dimension ('structure', 'design', 'market').
        dim2: second dimension for cross analysis.

    Returns:
        list of dicts sorted by opportunity score descending:
            - 'combination': str (dim1 × dim2)
            - 'dim1_value': str
            - 'dim2_value': str
            - 'asin_count': int
            - 'asin_share_pct': float
            - 'avg_sales_per_asin': float
            - 'sales_efficiency': float (avg sales / overall avg sales)
            - 'classification': str
            - 'reasoning': str
    """
    if not products:
        return []

    # Build combination map
    combo_map: dict[tuple[str, str], list[dict]] = {}
    for product in products:
        tags1 = _get_dimension_tags(product, dim1)
        tags2 = _get_dimension_tags(product, dim2)
        if not tags1 or not tags2:
            continue
        for t1 in tags1:
            for t2 in tags2:
                key = (t1, t2)
                if key not in combo_map:
                    combo_map[key] = []
                combo_map[key].append(product)

    total_products = len(products)
    overall_avg_sales = sum(_get_sales(p) for p in products) / max(total_products, 1)

    results: list[dict] = []
    for (t1, t2), prods in combo_map.items():
        asin_count = len(prods)
        asin_share = asin_count / max(total_products, 1) * 100
        total_sales_for_combo = sum(_get_sales(p) for p in prods)
        avg_sales_per_asin = total_sales_for_combo / max(asin_count, 1)
        sales_efficiency = avg_sales_per_asin / max(overall_avg_sales, 0.01)

        # Low supply threshold: < 5% ASIN share
        if asin_share >= 5.0:
            continue

        # Classify based on sales efficiency
        if sales_efficiency < 0.5:
            classification = "pseudo_opportunity"
            reasoning = f"Very low sales efficiency ({sales_efficiency:.2f}x). Few ASINs and each performs poorly. Likely no real demand."
        elif sales_efficiency < 0.8:
            classification = "difficulty_barrier"
            reasoning = f"Moderate sales efficiency ({sales_efficiency:.2f}x). Some ASINs sell but most struggle. Supply constraints or high entry cost suspected."
        else:
            classification = "attackable_white_space"
            reasoning = f"High sales efficiency ({sales_efficiency:.2f}x). Few ASINs but each sells well. Real demand with insufficient supply."

        results.append({
            "combination": f"{t1} x {t2}",
            f"{dim1}_value": t1,
            f"{dim2}_value": t2,
            "asin_count": asin_count,
            "asin_share_pct": round(asin_share, 2),
            "avg_sales_per_asin": round(avg_sales_per_asin, 2),
            "sales_efficiency": round(sales_efficiency, 2),
            "classification": classification,
            "reasoning": reasoning,
        })

    results.sort(key=lambda x: x["sales_efficiency"], reverse=True)
    return results


# ──────────────────────────────────────────────
# Cross-Validate Demand
# ──────────────────────────────────────────────


def cross_validate_demand(
    combinations: list[dict],
    search_signals: dict | None = None,
    voc_data: dict | None = None,
) -> list[dict]:
    """
    Validate blank attribute combinations against four demand-side questions:

    1. Search volume trend - are users searching for this combination?
    2. VoC complaint frequency - are users complaining about lack of it?
    3. Review growth rate - is interest growing in related products?
    4. Price premium possibility - can this command a higher price?

    Args:
        combinations: list of blank combination dicts from
                      identify_blank_combinations.
        search_signals: dict mapping combination keys to search signal dict:
            {'trend': 'rising'|'stable'|'declining', 'volume': int,
             'related_queries': list[str]}
        voc_data: dict mapping combination keys to VoC data dict:
            {'complaint_frequency': int, 'diy_mentions': int,
             'review_growth_pct': float, 'avg_price_premium': float}

    Returns:
        list of combination dicts enriched with demand validation results
        and re-classified based on evidence.
    """
    if not combinations:
        return []

    search = search_signals or {}
    voc = voc_data or {}

    results: list[dict] = []

    for combo in combinations:
        combo_key = combo.get("combination", "")
        sig = search.get(combo_key, {})
        v = voc.get(combo_key, {})

        search_rising = sig.get("trend") == "rising" if sig.get("trend") else False
        search_volume = sig.get("volume", 0)
        complaint_freq = v.get("complaint_frequency", 0)
        diy_mentions = v.get("diy_mentions", 0)
        review_growth = v.get("review_growth_pct", 0)
        price_premium = v.get("avg_price_premium", 0)

        # Score demand evidence
        demand_score = 0.0
        if search_rising:
            demand_score += 1.0
        if search_volume > 50:
            demand_score += 1.0
        if complaint_freq > 10:
            demand_score += 1.5
        if diy_mentions > 5:
            demand_score += 1.0
        if review_growth > 10:
            demand_score += 1.0
        if price_premium > 0.15:
            demand_score += 0.5

        evidence_details = {
            "search_trend": sig.get("trend", "unknown"),
            "search_volume": search_volume,
            "complaint_frequency": complaint_freq,
            "diy_mentions": diy_mentions,
            "review_growth_pct": review_growth,
            "price_premium_pct": round(price_premium * 100, 2),
            "demand_score": round(demand_score, 2),
        }

        # Re-classify
        original = combo.get("classification", "pseudo_opportunity")
        if demand_score >= 4.0 and original == "attackable_white_space":
            new_classification = "confirmed_opportunity"
            reasoning = "Strong demand signals across multiple sources. High confidence."
        elif demand_score >= 2.5 and original in ("attackable_white_space", "difficulty_barrier"):
            new_classification = "opportunity_needs_validation"
            reasoning = "Moderate demand signals. Recommend deeper investigation before commitment."
        elif demand_score >= 2.0 and original == "difficulty_barrier":
            new_classification = "difficulty_barrier_with_demand"
            reasoning = "Demand exists but supply/technical barrier likely high. Verify production feasibility."
        elif demand_score <= 1.0 and original == "pseudo_opportunity":
            new_classification = "confirmed_pseudo_opportunity"
            reasoning = "No meaningful demand signal detected. Low confidence in opportunity."
        elif demand_score <= 1.5 and original == "attackable_white_space":
            new_classification = "opportunity_ambiguous"
            reasoning = "Supply gap exists but demand signal is weak. Needs primary research."
        else:
            new_classification = original
            reasoning = f"Demand score {demand_score:.1f} insufficient to change original classification."

        enriched = dict(combo)
        enriched.update({
            "evidence": evidence_details,
            "demand_score": round(demand_score, 2),
            "classification": new_classification,
            "reasoning": reasoning,
        })
        results.append(enriched)

    # Sort by demand_score descending
    results.sort(key=lambda x: x.get("demand_score", 0), reverse=True)
    return results


# ──────────────────────────────────────────────
# Attribute Elasticity
# ──────────────────────────────────────────────


def compute_attribute_elasticity(
    products: list[dict], attribute: str, price_tiers: dict | None = None
) -> dict:
    """
    Compute how an attribute's prevalence and value change across price bands.

    For a given attribute (e.g., 'quiet', 'portable'), analyzes its presence
    across budget (<$15), value ($15-35), premium ($35-80), and luxury (>$80)
    price bands, or custom tiers.

    Args:
        products: list of product dicts with 'price' and tagged data.
        attribute: the attribute name/tag to analyze.
        price_tiers: optional custom price bands dict:
            {'tier_name': [min, max]}. Defaults to 4 standard tiers.

    Returns:
        dict with:
            - 'attribute': str
            - 'tiers': list[dict] per tier:
                - 'tier': str
                - 'price_range': str
                - 'product_count': int
                - 'attribute_presence_pct': float
                - 'avg_rating_when_present': float
                - 'avg_rating_when_absent': float
                - 'value_gap': float (rating diff)
                - 'price_premium_indicator': str ('must_have'|'differentiator'|'baseline')
    """
    tiers = price_tiers or {
        "budget": [0, 15],
        "value": [15, 35],
        "premium": [35, 80],
        "luxury": [80, float("inf")],
    }

    if not products:
        return {"attribute": attribute, "tiers": []}

    tier_results: list[dict] = []

    for tier_name, (tier_min, tier_max) in tiers.items():
        tier_products = [
            p for p in products
            if tier_min <= float(p.get("price", 0) or 0) < tier_max
        ]
        if not tier_products:
            tier_results.append({
                "tier": tier_name,
                "price_range": f"${tier_min}-${tier_max}" if tier_max != float("inf") else f"${tier_min}+",
                "product_count": 0,
                "attribute_presence_pct": 0.0,
                "avg_rating_when_present": 0.0,
                "avg_rating_when_absent": 0.0,
                "value_gap": 0.0,
                "price_premium_indicator": "no_data",
            })
            continue

        # Check all tag dimensions for the attribute
        has_attr: list[dict] = []
        no_attr: list[dict] = []
        for p in tier_products:
            tags = p.get("tags", {})
            found = False
            for dim_tags in tags.values():
                if attribute in dim_tags:
                    found = True
                    break
            if found:
                has_attr.append(p)
            else:
                no_attr.append(p)

        presence_pct = len(has_attr) / max(len(tier_products), 1) * 100
        avg_rating_with = (
            sum(float(p.get("rating", 0) or 0) for p in has_attr) / max(len(has_attr), 1)
        ) if has_attr else 0.0
        avg_rating_without = (
            sum(float(p.get("rating", 0) or 0) for p in no_attr) / max(len(no_attr), 1)
        ) if no_attr else 0.0
        value_gap = avg_rating_with - avg_rating_without

        if presence_pct > 70 or value_gap < 0.1:
            indicator = "baseline"
        elif value_gap > 0.5:
            indicator = "must_have"
        elif value_gap > 0.2:
            indicator = "differentiator"
        else:
            indicator = "baseline"

        tier_results.append({
            "tier": tier_name,
            "price_range": f"${tier_min}-${tier_max}" if tier_max != float("inf") else f"${tier_min}+",
            "product_count": len(tier_products),
            "attribute_presence_pct": round(presence_pct, 2),
            "avg_rating_when_present": round(avg_rating_with, 2),
            "avg_rating_when_absent": round(avg_rating_without, 2),
            "value_gap": round(value_gap, 2),
            "price_premium_indicator": indicator,
        })

    return {"attribute": attribute, "tiers": tier_results}


# ──────────────────────────────────────────────
# Full Report
# ──────────────────────────────────────────────


def generate_attribute_report(products: list[dict], config: dict | None = None) -> dict:
    """
    Full product attribute analysis pipeline.

    Pipeline:
        1. Tag products with 3D labels
        2. Compute sales-weighted shares per dimension
        3. Identify blank combinations
        4. Cross-validate demand (if search/VoC data available)
        5. Compute attribute elasticity

    Args:
        products: list of product dicts.
        config: optional dict with:
            - 'dimensions': list[str] — which dimensions to analyze
            - 'search_signals': dict — search signal data for demand validation
            - 'voc_data': dict — voice of customer data
            - 'elasticity_attribute': str — attribute to analyze for elasticity
            - 'price_tiers': dict — custom price bands
            - 'blank_dim1': str — first dimension for blank combo analysis
            - 'blank_dim2': str — second dimension for blank combo analysis

    Returns:
        dict with complete attribute analysis report.
    """
    config = config or {}
    dimensions = config.get("dimensions", ["structure", "design", "market"])
    search_signals = config.get("search_signals")
    voc_data = config.get("voc_data")
    elasticity_attribute = config.get("elasticity_attribute", "quiet")
    price_tiers = config.get("price_tiers")
    blank_dim1 = config.get("blank_dim1", "structure")
    blank_dim2 = config.get("blank_dim2", "design")

    sample_check = check_sample_size({"data": products}, min_rows=50)

    # 1. Tag
    tagged = tag_products(products, dimensions)

    # 2. Sales-weighted shares
    shares = {}
    for dim in dimensions:
        shares[dim] = sales_weighted_share(tagged, dim)

    # 3. Blank combinations
    blank_combos = identify_blank_combinations(tagged, blank_dim1, blank_dim2)

    # 4. Cross-validate (if data available)
    validated_combos = []
    if search_signals or voc_data:
        validated_combos = cross_validate_demand(blank_combos, search_signals, voc_data)

    # 5. Attribute elasticity
    elasticity = compute_attribute_elasticity(tagged, elasticity_attribute, price_tiers)

    # Summary
    total_asins = len(tagged)
    tagged_count = sum(
        1 for p in tagged
        if all("_unmarked" not in p.get("tags", {}).get(d, {}) for d in dimensions)
    )

    attackable = [
        c for c in (validated_combos or blank_combos)
        if c.get("classification", "").startswith("attackable")
        or c.get("classification") == "confirmed_opportunity"
    ]

    summary = {
        "total_products": total_asins,
        "fully_tagged": tagged_count,
        "tagging_coverage_pct": round(tagged_count / max(total_asins, 1) * 100, 2),
        "dimensions_analyzed": dimensions,
        "blank_combinations_found": len(blank_combos),
        "opportunity_candidates": len(attackable),
        "sample_sufficiency": sample_check,
        "elasticity_attribute": elasticity_attribute,
    }

    return {
        "tagged_products": tagged,
        "sales_weighted_shares": shares,
        "blank_combinations": {
            "raw": blank_combos,
            "demand_validated": validated_combos or None,
        },
        "attribute_elasticity": elasticity,
        "summary": summary,
        "config_used": {
            "dimensions": dimensions,
            "blank_dim1": blank_dim1,
            "blank_dim2": blank_dim2,
            "elasticity_attribute": elasticity_attribute,
        },
    }
