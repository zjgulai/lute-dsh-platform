"""
cbec-product-data-analyzer - Product Data Analyzer core logic.

Normalizes data from multiple tools (JungleScout, Helium10, Sorftime, CSV),
runs 8D competitive analysis, scenario simulation, decision memo generation,
and full product analysis reporting.
"""

from __future__ import annotations

import json
import math
from typing import Any


def check_sample_size(data: Any, min_rows: int = 30) -> dict:
    """自包含样本量检查：替代 skills._shared.data_validator.check_sample_size。

    返回结构与原 shared 函数对齐，仅做行数判定。
    """
    rows = data.get("data", data) if isinstance(data, dict) else data
    if isinstance(rows, list):
        actual_rows = len(rows)
    elif isinstance(rows, dict):
        actual_rows = len(rows)
    else:
        actual_rows = 0
    return {
        "is_sufficient": actual_rows >= min_rows,
        "actual_rows": actual_rows,
        "min_required_rows": min_rows,
    }


# ──────────────────────────────────────────────
# Source-Specific Field Mappings
# ──────────────────────────────────────────────

_FIELD_MAPS: dict[str, dict[str, str]] = {
    "junglescout": {
        "title": "name",
        "asin": "asin",
        "price": "price",
        "reviews": "review_count",
        "rating": "rating",
        "bsr": "bsr",
        "monthly_sales": "monthly_sales",
        "category": "category",
        "brand": "brand",
        "seller": "seller",
        "fba_fees": "fba_fees",
        "est_margin": "margin_estimate",
        "search_volume": "search_volume",
        "trend": "demand_trend",
        "image_url": "image",
    },
    "helium10": {
        "product_title": "name",
        "asin": "asin",
        "price": "price",
        "number_of_reviews": "review_count",
        "review_rating": "rating",
        "bsr": "bsr",
        "estimated_sales": "monthly_sales",
        "category": "category",
        "brand": "brand",
        "seller_name": "seller",
        "estimated_fba_fee": "fba_fees",
        "margin": "margin_estimate",
        "search_volume_exact": "search_volume",
        "trend": "demand_trend",
    },
    "sorftime": {
        "产品标题": "name",
        "ASIN": "asin",
        "价格": "price",
        "评论数量": "review_count",
        "评分": "rating",
        "BSR排名": "bsr",
        "月销量": "monthly_sales",
        "类目": "category",
        "品牌": "brand",
        "卖家": "seller",
        "FBA费用": "fba_fees",
        "利润率": "margin_estimate",
        "月搜索量": "search_volume",
        "趋势": "demand_trend",
    },
}

_COMMON_FIELDS = [
    "name", "asin", "price", "review_count", "rating", "bsr",
    "monthly_sales", "category", "brand", "seller", "fba_fees",
    "margin_estimate", "search_volume", "demand_trend",
]


# ──────────────────────────────────────────────
# Normalize Fields
# ──────────────────────────────────────────────


def normalize_fields(data: list[dict], source: str) -> list[dict]:
    """
    Normalize product data from a specific source tool to a unified schema.

    Supports: junglescout, helium10, sorftime, csv.

    Args:
        data: list of product dicts from the source tool.
        source: one of 'junglescout', 'helium10', 'sorftime', 'csv'.

    Returns:
        list of normalized product dicts with standardized field names.
        Unknown source returns data unchanged with warning note.
    """
    if not data:
        return []

    source = source.lower().strip()
    field_map = _FIELD_MAPS.get(source, {})

    if not field_map and source != "csv":
        # Attempt heuristic match or return as-is with note
        return [
            {
                **_apply_heuristic_normalization(item),
                "_source_source": source,
                "_normalization": "heuristic",
            }
            for item in data
        ]

    normalized: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        record: dict[str, Any] = {}
        for source_key, value in item.items():
            std_key = field_map.get(source_key, source_key)
            record[std_key] = value

        # Ensure all common fields exist (even if null)
        for field in _COMMON_FIELDS:
            if field not in record:
                record[field] = None

        record["_source_source"] = source
        record["_normalization"] = "mapped"
        normalized.append(record)

    return normalized


def _apply_heuristic_normalization(item: dict) -> dict:
    """Heuristic normalization for unknown source formats."""
    result: dict[str, Any] = {}
    for key, value in item.items():
        key_lower = key.lower().strip()
        # Try to match common variations
        if key_lower in ("name", "title", "product", "product_title", "产品标题", "商品名称"):
            result["name"] = value
        elif key_lower in ("asin", "sku", "产品id"):
            result["asin"] = value
        elif key_lower in ("price", "售价", "价格"):
            result["price"] = _safe_float(value)
        elif key_lower in ("review_count", "reviews", "评论数", "review_num"):
            result["review_count"] = _safe_float(value)
        elif key_lower in ("rating", "评分", "review_rating"):
            result["rating"] = _safe_float(value)
        elif key_lower in ("bsr", "排名", "bsr排名"):
            result["bsr"] = _safe_float(value)
        elif key_lower in ("monthly_sales", "sales", "月销量", "estimated_sales"):
            result["monthly_sales"] = _safe_float(value)
        else:
            result[key] = value

    for field in _COMMON_FIELDS:
        if field not in result:
            result[field] = None

    return result


def _safe_float(value: Any) -> float | None:
    """Safely convert value to float."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


# ──────────────────────────────────────────────
# 8D Competitive Analysis
# ──────────────────────────────────────────────


def run_8d_analysis(data: list[dict]) -> dict:
    """
    Analyze 8 competitive dimensions from product data.

    Dimensions:
        - demand_trend: overall market demand direction
        - price_band: price distribution
        - review_velocity: review accumulation rate
        - listing_quality: rating and review health
        - brand_concentration: market share concentration
        - seasonality: sales variation pattern
        - margin_estimate: estimated profit margin
        - entry_barrier: difficulty to enter

    Args:
        data: list of normalized product dicts.

    Returns:
        dict with 8 dimension analysis results and an overall assessment.
    """
    if not data:
        return {
            "dimensions": {f"D{i+1}_{d}": {"status": "no_data"} for i, d in enumerate([
                "demand_trend", "price_band", "review_velocity", "listing_quality",
                "brand_concentration", "seasonality", "margin_estimate", "entry_barrier",
            ])},
            "overall_assessment": "No data available for analysis.",
        }

    # D1: Demand Trend
    trends = [d.get("demand_trend") for d in data if d.get("demand_trend")]
    search_volumes = [d.get("search_volume", 0) or 0 for d in data]
    avg_search = sum(search_volumes) / len(search_volumes) if search_volumes else 0
    rising_trends = sum(1 for t in trends if t and "rising" in str(t).lower())
    demand_direction = "growing" if rising_trends > len(trends) * 0.4 else (
        "stable" if rising_trends > len(trends) * 0.1 else "declining"
    )
    demand_trend = {
        "direction": demand_direction,
        "avg_search_volume": round(avg_search, 0),
        "rising_signal_pct": round(rising_trends / max(len(trends), 1) * 100, 1),
        "signal_strength": "high" if rising_trends > 10 else "medium" if rising_trends > 3 else "low",
    }

    # D2: Price Band
    prices = [d.get("price", 0) or 0 for d in data]
    valid_prices = [p for p in prices if p > 0]
    price_band = {
        "min": min(valid_prices) if valid_prices else 0,
        "max": max(valid_prices) if valid_prices else 0,
        "avg": round(sum(valid_prices) / len(valid_prices), 2) if valid_prices else 0,
        "median": _median(valid_prices) if valid_prices else 0,
        "distribution": _price_distribution(valid_prices) if valid_prices else {},
        "product_count": len(valid_prices),
    }

    # D3: Review Velocity
    review_counts = [d.get("review_count", 0) or 0 for d in data]
    valid_reviews = [r for r in review_counts if r > 0]
    review_velocity = {
        "avg_reviews_per_product": round(sum(valid_reviews) / len(valid_reviews), 1) if valid_reviews else 0,
        "median_reviews": _median(valid_reviews) if valid_reviews else 0,
        "total_reviews_analyzed": sum(valid_reviews),
        "products_with_reviews": len(valid_reviews),
    }

    # D4: Listing Quality
    ratings = [d.get("rating", 0) or 0 for d in data if d.get("rating")]
    listing_quality = {
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else 0,
        "rating_distribution": _rating_distribution(ratings) if ratings else {},
        "products_with_ratings": len(ratings),
    }

    # D5: Brand Concentration
    brands = [d.get("brand", "") for d in data if d.get("brand")]
    brand_counts: dict[str, int] = {}
    for b in brands:
        brand_counts[b] = brand_counts.get(b, 0) + 1
    sorted_brands = sorted(brand_counts.items(), key=lambda x: x[1], reverse=True)
    top_brand_share = (sorted_brands[0][1] / len(data) * 100) if sorted_brands else 0
    top3_brand_share = sum(c for _, c in sorted_brands[:3]) / max(len(data), 1) * 100

    brand_concentration = {
        "total_brands": len(brand_counts),
        "top_brand": sorted_brands[0][0] if sorted_brands else "",
        "top_brand_share_pct": round(top_brand_share, 1),
        "top3_share_pct": round(top3_brand_share, 1),
        "concentration_level": "high" if top3_brand_share > 70 else (
            "moderate" if top3_brand_share > 40 else "low"
        ),
    }

    # D6: Seasonality (proxy using sales distribution)
    monthly_sales = [d.get("monthly_sales", 0) or 0 for d in data]
    valid_sales = [s for s in monthly_sales if s > 0]
    if valid_sales:
        mean_sales = sum(valid_sales) / len(valid_sales)
        variance = sum((s - mean_sales) ** 2 for s in valid_sales) / len(valid_sales)
        cv = math.sqrt(variance) / mean_sales if mean_sales > 0 else 0
        seasonality = {
            "avg_monthly_sales": round(mean_sales, 0),
            "coefficient_of_variation": round(cv, 2),
            "seasonality_level": "high" if cv > 1.0 else "moderate" if cv > 0.5 else "low",
        }
    else:
        seasonality = {"avg_monthly_sales": 0, "coefficient_of_variation": 0, "seasonality_level": "unknown"}

    # D7: Margin Estimate
    margins = [d.get("margin_estimate", 0) or 0 for d in data if d.get("margin_estimate")]
    margin_estimate = {
        "avg_margin": round(sum(margins) / len(margins), 2) if margins else 0,
        "min_margin": min(margins) if margins else 0,
        "max_margin": max(margins) if margins else 0,
        "margin_quality": "good" if (sum(margins) / len(margins) if margins else 0) >= 0.3 else "tight",
    }

    # D8: Entry Barrier (composite score)
    entry_barrier_factors = []
    # High review count = higher barrier
    median_reviews = _median(valid_reviews) if valid_reviews else 0
    if median_reviews > 200:
        entry_barrier_factors.append({"factor": "review_count", "score": 3, "detail": f"Median {median_reviews:.0f} reviews"})
    elif median_reviews > 50:
        entry_barrier_factors.append({"factor": "review_count", "score": 2, "detail": f"Median {median_reviews:.0f} reviews"})
    else:
        entry_barrier_factors.append({"factor": "review_count", "score": 1, "detail": f"Median {median_reviews:.0f} reviews"})

    # High brand concentration = higher barrier
    if brand_concentration["concentration_level"] == "high":
        entry_barrier_factors.append({"factor": "brand_concentration", "score": 3, "detail": "Top 3 brands dominate"})
    elif brand_concentration["concentration_level"] == "moderate":
        entry_barrier_factors.append({"factor": "brand_concentration", "score": 2, "detail": "Moderate brand concentration"})
    else:
        entry_barrier_factors.append({"factor": "brand_concentration", "score": 1, "detail": "Low brand concentration"})

    # Low margin = higher barrier
    avg_margin = sum(margins) / len(margins) if margins else 0
    if avg_margin < 0.20:
        entry_barrier_factors.append({"factor": "margin", "score": 3, "detail": f"Avg margin {avg_margin:.0%}"})
    elif avg_margin < 0.35:
        entry_barrier_factors.append({"factor": "margin", "score": 2, "detail": f"Avg margin {avg_margin:.0%}"})
    else:
        entry_barrier_factors.append({"factor": "margin", "score": 1, "detail": f"Avg margin {avg_margin:.0%}"})

    total_barrier_score = sum(f["score"] for f in entry_barrier_factors)
    entry_barrier = {
        "factors": entry_barrier_factors,
        "total_score": total_barrier_score,
        "barrier_level": "high" if total_barrier_score >= 8 else "moderate" if total_barrier_score >= 5 else "low",
        "max_possible_score": 9,
    }

    # Overall assessment
    dimensions = {
        "D1_demand_trend": demand_trend,
        "D2_price_band": price_band,
        "D3_review_velocity": review_velocity,
        "D4_listing_quality": listing_quality,
        "D5_brand_concentration": brand_concentration,
        "D6_seasonality": seasonality,
        "D7_margin_estimate": margin_estimate,
        "D8_entry_barrier": entry_barrier,
    }

    overall = (
        f"Market shows {demand_direction} demand with {price_band['avg']:.2f} average price. "
        f"Brand concentration is {brand_concentration['concentration_level']}. "
        f"Entry barrier: {entry_barrier['barrier_level']} ({total_barrier_score}/9). "
        f"Margin quality: {margin_estimate['margin_quality']}."
    )

    return {
        "dimensions": dimensions,
        "overall_assessment": overall,
    }


def _median(values: list[float]) -> float:
    """Compute median of a list of numbers."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    if n % 2 == 0:
        return (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
    return float(sorted_vals[n // 2])


def _price_distribution(prices: list[float]) -> dict:
    """Compute price distribution across 4 tiers."""
    tiers = {"budget_under_15": 0, "value_15_35": 0, "premium_35_80": 0, "luxury_over_80": 0}
    for p in prices:
        if p < 15:
            tiers["budget_under_15"] += 1
        elif p < 35:
            tiers["value_15_35"] += 1
        elif p < 80:
            tiers["premium_35_80"] += 1
        else:
            tiers["luxury_over_80"] += 1
    total = len(prices)
    return {k: {"count": v, "pct": round(v / total * 100, 1)} for k, v in tiers.items()}


def _rating_distribution(ratings: list[float]) -> dict:
    """Compute rating distribution across 3 bands."""
    bands = {"low_under_3.5": 0, "medium_3.5_4.2": 0, "high_over_4.2": 0}
    for r in ratings:
        if r < 3.5:
            bands["low_under_3.5"] += 1
        elif r < 4.2:
            bands["medium_3.5_4.2"] += 1
        else:
            bands["high_over_4.2"] += 1
    total = len(ratings)
    return {k: {"count": v, "pct": round(v / total * 100, 1)} for k, v in bands.items()}


# ──────────────────────────────────────────────
# Scenario Simulation
# ──────────────────────────────────────────────


def scenario_simulate(data: list[dict], scenarios: list[dict]) -> list[dict]:
    """
    Run counterfactual scenario simulations.

    Simulates what-if scenarios: price changes, competitor entry, demand shifts.

    Args:
        data: list of normalized product dicts.
        scenarios: list of scenario dicts, each with:
            - 'name': str
            - 'type': str ('price_change', 'competitor_entry', 'demand_shift')
            - 'params': dict with scenario-specific parameters

    Returns:
        list of scenario result dicts:
            - 'scenario': str
            - 'type': str
            - 'expected_outcome': str
            - 'risk_level': str
            - 'key_metrics': dict
            - 'momcozy_fit_score': float (0-1)
    """
    if not data or not scenarios:
        return []

    avg_price = sum(d.get("price", 0) or 0 for d in data) / max(len(data), 1)
    avg_reviews = sum(d.get("review_count", 0) or 0 for d in data) / max(len(data), 1)
    avg_rating = sum(d.get("rating", 0) or 0 for d in data) / max(len(data), 1)

    results: list[dict] = []
    for scenario in scenarios:
        scenario_type = scenario.get("type", "unknown")
        params = scenario.get("params", {})
        name = scenario.get("name", scenario_type)

        if scenario_type == "price_change":
            new_price = params.get("new_price", avg_price)
            price_diff_pct = (new_price - avg_price) / max(avg_price, 0.01) * 100
            # Price increase reduces volume, improves margin
            if price_diff_pct > 0:
                expected_volume_change = max(-50, -price_diff_pct * 0.8)  # Elasticity proxy
                expected_margin_change = price_diff_pct * 0.3
                outcome = f"Price up {price_diff_pct:.0f}%. Volume may drop {abs(expected_volume_change):.0f}% but margin improves."
                risk = "medium" if price_diff_pct > 20 else "low"
                momcozy_fit = max(0, 1 - abs(price_diff_pct) / 100)
            else:
                expected_volume_change = min(80, -price_diff_pct * 0.5)
                expected_margin_change = price_diff_pct * 0.3
                outcome = f"Price down {abs(price_diff_pct):.0f}%. Volume may increase {expected_volume_change:.0f}% but margin erodes."
                risk = "medium" if abs(price_diff_pct) > 15 else "low"
                momcozy_fit = max(0, 1 - abs(price_diff_pct) / 80)

            results.append({
                "scenario": name,
                "type": scenario_type,
                "description": f"Change price from ${avg_price:.2f} to ${new_price:.2f}",
                "expected_outcome": outcome,
                "risk_level": risk,
                "key_metrics": {
                    "current_avg_price": round(avg_price, 2),
                    "new_price": new_price,
                    "price_change_pct": round(price_diff_pct, 1),
                    "estimated_volume_change_pct": round(expected_volume_change, 1),
                    "estimated_margin_change_pct": round(expected_margin_change, 1),
                },
                "momcozy_fit_score": round(momcozy_fit, 2),
            })

        elif scenario_type == "competitor_entry":
            competitor_strength = params.get("competitor_strength", 0.5)
            # Strong competitor = higher risk
            outcome = (
                f"New competitor at strength {competitor_strength:.0%}. "
                f"May lose {competitor_strength * 30:.0f}-{competitor_strength * 50:.0f}% market share in first 6 months."
            )
            risk = "high" if competitor_strength > 0.7 else "medium"
            momcozy_fit = max(0, 1 - competitor_strength * 0.8)

            results.append({
                "scenario": name,
                "type": scenario_type,
                "description": f"Competitor entry at strength {competitor_strength:.0%}",
                "expected_outcome": outcome,
                "risk_level": risk,
                "key_metrics": {
                    "competitor_strength": competitor_strength,
                    "estimated_share_loss_pct": round(competitor_strength * 40, 1),
                    "review_defense_needed": avg_reviews > 50,
                },
                "momcozy_fit_score": round(momcozy_fit, 2),
            })

        elif scenario_type == "demand_shift":
            shift_magnitude = params.get("shift_magnitude", 0.2)
            shift_direction = params.get("direction", "positive")
            if shift_direction == "positive":
                outcome = f"Demand grows {shift_magnitude * 100:.0f}%. Opportunity for early movers with good listings."
                risk = "low"
                momcozy_fit = 0.7 + shift_magnitude * 0.3
            else:
                outcome = f"Demand contracts {shift_magnitude * 100:.0f}%. Only strong brands with loyal following may survive."
                risk = "high"
                momcozy_fit = max(0.1, 0.5 - shift_magnitude * 0.5)

            results.append({
                "scenario": name,
                "type": scenario_type,
                "description": f"Demand shifts {shift_direction} by {shift_magnitude * 100:.0f}%",
                "expected_outcome": outcome,
                "risk_level": risk,
                "key_metrics": {
                    "shift_direction": shift_direction,
                    "shift_magnitude_pct": round(shift_magnitude * 100, 1),
                    "current_avg_rating": round(avg_rating, 2),
                    "avg_review_count": round(avg_reviews, 0),
                },
                "momcozy_fit_score": round(momcozy_fit, 2),
            })

        else:
            results.append({
                "scenario": name,
                "type": scenario_type,
                "description": scenario.get("description", f"Unknown scenario type: {scenario_type}"),
                "expected_outcome": "Insufficient data for simulation.",
                "risk_level": "unknown",
                "key_metrics": {},
                "momcozy_fit_score": 0.5,
            })

    return results


# ──────────────────────────────────────────────
# Decision Memo
# ──────────────────────────────────────────────


def generate_decision_memo(analysis: dict, scenarios: list[dict]) -> dict:
    """
    Generate a Go/No-Go decision memo based on 8D analysis and scenarios.

    Args:
        analysis: dict from run_8d_analysis.
        scenarios: scenario results from scenario_simulate.

    Returns:
        dict with:
            - 'recommendation': str ('Go' | 'No-Go' | 'Conditional Go')
            - 'confidence': str (high/medium/low)
            - 'evidence': list[str]
            - 'next_steps': list[str]
            - 'rejected_approaches': list[str]
    """
    dims = analysis.get("dimensions", {})
    demand = dims.get("D1_demand_trend", {})
    margin = dims.get("D7_margin_estimate", {})
    barrier = dims.get("D8_entry_barrier", {})
    concentration = dims.get("D5_brand_concentration", {})

    evidence: list[str] = []
    next_steps: list[str] = []
    rejected: list[str] = []

    # Evaluate signals
    go_signals = 0
    no_go_signals = 0

    # Demand
    if demand.get("direction") == "growing":
        go_signals += 2
        evidence.append(f"Growing demand trend ({demand.get('rising_signal_pct', 0)}% rising signals)")
    elif demand.get("direction") == "declining":
        no_go_signals += 2
        evidence.append("Declining demand trend")
    else:
        evidence.append("Stable demand trend")

    # Margin
    avg_margin = margin.get("avg_margin", 0)
    if avg_margin >= 0.30:
        go_signals += 2
        evidence.append(f"Healthy margins (avg {avg_margin:.0%})")
    elif avg_margin >= 0.20:
        go_signals += 1
        evidence.append(f"Moderate margins (avg {avg_margin:.0%})")
    else:
        no_go_signals += 1
        evidence.append(f"Tight margins (avg {avg_margin:.0%})")

    # Barrier
    barrier_level = barrier.get("barrier_level", "high")
    if barrier_level == "low":
        go_signals += 1
        evidence.append("Low entry barrier")
    elif barrier_level == "high":
        no_go_signals += 2
        evidence.append(f"High entry barrier (score {barrier.get('total_score', 0)}/9)")
    else:
        evidence.append(f"Moderate entry barrier (score {barrier.get('total_score', 0)}/9)")

    # Brand concentration
    if concentration.get("concentration_level") == "low":
        go_signals += 1
        evidence.append("Fragmented market with no dominant brand")
    elif concentration.get("concentration_level") == "high":
        no_go_signals += 1
        evidence.append(f"High brand concentration (top brand {concentration.get('top_brand_share_pct', 0)}%)")

    # Scenario fit
    avg_fit = sum(s.get("momcozy_fit_score", 0.5) for s in scenarios) / max(len(scenarios), 1) if scenarios else 0.5
    if avg_fit >= 0.6:
        go_signals += 1
        evidence.append(f"Good scenario fit (avg score {avg_fit:.2f})")
    elif avg_fit < 0.4:
        no_go_signals += 1
        evidence.append(f"Poor scenario fit (avg score {avg_fit:.2f})")

    # Determine recommendation
    if go_signals >= no_go_signals + 3:
        recommendation = "Go"
        confidence = "high"
    elif go_signals >= no_go_signals + 1:
        recommendation = "Conditional Go"
        confidence = "medium"
    elif go_signals >= no_go_signals:
        recommendation = "Conditional Go"
        confidence = "low"
    else:
        recommendation = "No-Go"
        confidence = "medium"

    # Next steps
    if recommendation == "Go":
        next_steps = [
            "Proceed with detailed product scoping",
            "Validate with private DTC data if available",
            "Prepare first-round supplier RFQ",
            "Define SKU variants within target price band",
        ]
    elif recommendation == "Conditional Go":
        next_steps = [
            "Conduct deeper competitive positioning analysis",
            "Validate demand through lower-cost test (e.g., Kickstarter, pre-order)",
            "Run ads on similar keywords to CTR test demand",
            "If private data exists, cross-validate margin assumptions",
        ]
        rejected = ["Full-scale launch without validation", "Price war entry strategy"]
    else:
        next_steps = [
            "Revisit after 3-6 months with updated data",
            "Monitor for market structure changes (e.g., competitor exit)",
            "Consider adjacent sub-category instead",
        ]
        rejected = ["Direct entry into this market at current conditions"]

    return {
        "recommendation": recommendation,
        "confidence": confidence,
        "evidence": evidence,
        "next_steps": next_steps,
        "rejected_approaches": rejected,
        "go_signals": go_signals,
        "no_go_signals": no_go_signals,
    }


# ──────────────────────────────────────────────
# Full Report
# ──────────────────────────────────────────────


def generate_product_analysis_report(
    data: list[dict], config: dict | None = None
) -> dict:
    """
    Full product data analysis pipeline.

    Pipeline:
        1. Normalize data from source
        2. Run 8D competitive analysis
        3. Scenario simulation
        4. Decision memo generation

    Args:
        data: raw product data list.
        config: optional dict with:
            - 'source': str (junglescout/helium10/sorftime/csv)
            - 'scenarios': list[dict] — scenario definitions
            - 'category': str

    Returns:
        dict with complete analysis report.
    """
    config = config or {}
    source = config.get("source", "csv")
    scenarios_def = config.get("scenarios", [])
    category = config.get("category", "unknown")

    # Step 1: Normalize
    normalized = normalize_fields(data, source)
    sample_check = check_sample_size({"data": normalized}, min_rows=30)

    # Step 2: 8D Analysis
    analysis = run_8d_analysis(normalized)

    # Step 3: Scenarios
    scenarios_results = scenario_simulate(normalized, scenarios_def)

    # Step 4: Decision memo
    memo = generate_decision_memo(analysis, scenarios_results)

    summary = {
        "category": category,
        "source": source,
        "products_analyzed": len(normalized),
        "recommendation": memo.get("recommendation", "Unknown"),
        "confidence": memo.get("confidence", "low"),
        "sample_sufficiency": sample_check,
        "scenarios_simulated": len(scenarios_results),
    }

    return {
        "normalized_data": normalized,
        "competitive_analysis": analysis,
        "scenarios": scenarios_results,
        "decision_memo": memo,
        "summary": summary,
        "config_used": {
            "source": source,
            "category": category,
            "scenarios_count": len(scenarios_def),
        },
    }
