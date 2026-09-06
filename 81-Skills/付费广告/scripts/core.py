"""
mkt-paid-ads - Paid Ads performance analysis core logic.

Calculates multi-platform ad health scores, allocates budgets,
analyzes audience performance, and generates comprehensive ad audit reports.
"""

from __future__ import annotations

import math
from typing import Any


# ──────────────────────────────────────────────
# Platform Default Weights
# ──────────────────────────────────────────────

_PLATFORM_METRICS = {
    "google": {
        "metrics": ["qs", "is", "ctr", "cpc"],
        "labels": {
            "qs": "Quality Score",
            "is": "Impression Share",
            "ctr": "Click-Through Rate",
            "cpc": "Cost Per Click",
        },
        "default_weights": {"qs": 0.30, "is": 0.25, "ctr": 0.25, "cpc": 0.20},
        "ideal": {"qs": 10, "is": 100, "ctr": 10, "cpc": 0},
        "lower_is_better": ["cpc"],
    },
    "meta": {
        "metrics": ["ctr", "cpm", "roas", "frequency"],
        "labels": {
            "ctr": "Click-Through Rate",
            "cpm": "Cost Per Mille",
            "roas": "Return on Ad Spend",
            "frequency": "Ad Frequency",
        },
        "default_weights": {"ctr": 0.20, "cpm": 0.20, "roas": 0.35, "frequency": 0.25},
        "ideal": {"ctr": 5, "cpm": 0, "roas": 5, "frequency": 1},
        "lower_is_better": ["cpm", "frequency"],
    },
    "tiktok": {
        "metrics": ["ctr", "cpm", "roas", "vtr"],
        "labels": {
            "ctr": "Click-Through Rate",
            "cpm": "Cost Per Mille",
            "roas": "Return on Ad Spend",
            "vtr": "View-Through Rate",
        },
        "default_weights": {"ctr": 0.25, "cpm": 0.15, "roas": 0.30, "vtr": 0.30},
        "ideal": {"ctr": 3, "cpm": 0, "roas": 3, "vtr": 50},
        "lower_is_better": ["cpm"],
    },
}


# ──────────────────────────────────────────────
# Ad Health Score
# ──────────────────────────────────────────────


def _score_metric(value: float, ideal: float, lower_better: bool) -> float:
    """Score a single metric from 0-100 based on distance from ideal."""
    if ideal == 0 and value == 0:
        return 100
    if ideal == 0:
        # For metrics where ideal is 0 (costs), higher = worse
        ratio = min(value / 100, 1.0) if value > 0 else 0
        score = 100 - (ratio * 100)
    else:
        if lower_better:
            ratio = min(value / ideal, 2.0)
            if ratio <= 1.0:
                score = 100
            else:
                score = max(0, 100 - (ratio - 1.0) * 100)
        else:
            ratio = min(value / ideal, 3.0)
            score = min(100, ratio * 100 / 1.5)

    return max(0, min(100, round(score, 1)))


def calculate_ad_health_score(
    platform_metrics: dict[str, dict[str, float]],
    weights: dict[str, dict[str, float]] | None = None,
) -> dict:
    """
    Calculate multi-platform ad health scores.

    Args:
        platform_metrics: dict mapping platform name to metric dict:
            - 'google': {'qs': float, 'is': float, 'ctr': float, 'cpc': float}
            - 'meta': {'ctr': float, 'cpm': float, 'roas': float, 'frequency': float}
            - 'tiktok': {'ctr': float, 'cpm': float, 'roas': float, 'vtr': float}
        weights: optional custom weight overrides per platform.
            Defaults to _PLATFORM_METRICS weights.

    Returns:
        dict with:
            - 'platforms': dict of per-platform health with scores, metrics, ratings
            - 'weighted_overall': float (0-100)
            - 'simple_average': float (0-100)
            - 'overall_rating': str
    """
    if not platform_metrics:
        return {
            "platforms": {},
            "weighted_overall": 0,
            "simple_average": 0,
            "overall_rating": "no_data",
        }

    platform_scores: dict[str, Any] = {}
    weighted_total = 0
    weight_sum = 0

    for platform, metrics in platform_metrics.items():
        config = _PLATFORM_METRICS.get(platform)
        if not config:
            continue

        platform_weight = 1.0
        if weights and platform in weights:
            weight_config = weights[platform]
            if "platform_weight" in weight_config:
                platform_weight = weight_config["platform_weight"]

        metric_weights = weights.get(platform, config["default_weights"]) if weights else config["default_weights"]

        scored_metrics: dict[str, Any] = {}
        metric_score_sum = 0
        metric_weight_sum = 0

        for metric_key in config["metrics"]:
            raw_value = metrics.get(metric_key, 0)
            ideal = config["ideal"].get(metric_key, 50)
            lower_better = metric_key in config["lower_is_better"]

            score = _score_metric(raw_value, ideal, lower_better)
            mw = metric_weights.get(metric_key, 0.25)

            scored_metrics[metric_key] = {
                "label": config["labels"].get(metric_key, metric_key),
                "value": raw_value,
                "score": score,
                "weight": mw,
                "rating": "good" if score >= 80 else "fair" if score >= 50 else "poor",
            }
            metric_score_sum += score * mw
            metric_weight_sum += mw

        platform_score = round(metric_score_sum / max(metric_weight_sum, 0.01), 1)

        if platform_score >= 80:
            rating = "good"
        elif platform_score >= 50:
            rating = "fair"
        else:
            rating = "poor"

        platform_scores[platform] = {
            "metrics": scored_metrics,
            "composite_score": platform_score,
            "rating": rating,
            "weight": platform_weight,
        }

        weighted_total += platform_score * platform_weight
        weight_sum += platform_weight

    weighted_overall = round(weighted_total / max(weight_sum, 0.01), 1)
    simple_avg = round(
        sum(p["composite_score"] for p in platform_scores.values()) / max(len(platform_scores), 1),
        1,
    )

    if weighted_overall >= 80:
        overall_rating = "good"
    elif weighted_overall >= 50:
        overall_rating = "fair"
    else:
        overall_rating = "poor"

    return {
        "platforms": platform_scores,
        "weighted_overall": weighted_overall,
        "simple_average": simple_avg,
        "overall_rating": overall_rating,
    }


# ──────────────────────────────────────────────
# Budget Allocation
# ──────────────────────────────────────────────


def allocate_budget(
    platforms: list[dict],
    total_budget: float,
    target_roas: float = 3.0,
) -> dict:
    """
    Allocate budget across platforms based on efficiency and ROAS.

    Uses a proportional + adjusted algorithm: base proportional allocation
    adjusted by ROAS efficiency vs target.

    Args:
        platforms: list of dicts, each with:
            - 'name': str (platform name)
            - 'current_budget': float (current spend)
            - 'current_roas': float (current return)
            - 'efficiency_score': float (0-1, optional, default 0.5)
            - 'min_budget': float (minimum budget, optional)
            - 'max_budget': float (maximum budget, optional)
        total_budget: total budget to allocate.
        target_roas: target ROAS threshold.

    Returns:
        dict with:
            - 'allocations': list of per-platform allocation dicts
            - 'allocation_summary': dict with totals
            - 'expected_roas': float
    """
    if not platforms:
        return {
            "allocations": [],
            "allocation_summary": {"total_allocated": 0, "remaining": total_budget},
            "expected_roas": 0,
        }

    # Calculate efficiency factor for each platform
    platform_data: list[dict] = []
    total_efficiency = 0

    for p in platforms:
        name = p.get("name", "unknown")
        current_budget = float(p.get("current_budget", 0))
        current_roas = float(p.get("current_roas", 1.0))
        efficiency = float(p.get("efficiency_score", 0.5))

        # ROAS efficiency: how well this platform performs vs target
        roas_factor = min(current_roas / max(target_roas, 0.01), 2.0) if target_roas > 0 else 1.0

        # Combined efficiency score (50% user efficiency, 50% ROAS performance)
        combined_efficiency = efficiency * 0.5 + (roas_factor / 2.0)
        total_efficiency += combined_efficiency

        platform_data.append({
            "name": name,
            "current_budget": current_budget,
            "current_roas": current_roas,
            "efficiency_score": efficiency,
            "combined_efficiency": combined_efficiency,
            "min_budget": float(p.get("min_budget", 0)),
            "max_budget": float(p.get("max_budget", total_budget)),
        })

    # Allocate proportionally based on combined efficiency
    allocations: list[dict] = []
    total_allocated = 0

    # First pass: proportional allocation
    proportional_allocs: list[dict] = []
    for pd in platform_data:
        if total_efficiency > 0:
            share = pd["combined_efficiency"] / total_efficiency
        else:
            share = 1.0 / len(platform_data)

        raw_alloc = total_budget * share
        raw_alloc = max(raw_alloc, pd["min_budget"])
        raw_alloc = min(raw_alloc, pd["max_budget"])
        proportional_allocs.append({
            **pd,
            "raw_allocation": raw_alloc,
        })
        total_allocated += raw_alloc

    # Second pass: rescale if over/under budget
    if total_allocated > total_budget:
        scale = total_budget / max(total_allocated, 0.01)
        total_allocated = 0
        for pa in proportional_allocs:
            pa["raw_allocation"] = round(pa["raw_allocation"] * scale, 2)
            total_allocated += pa["raw_allocation"]
    elif total_allocated < total_budget:
        # Distribute remainder proportionally to highest efficiency platforms
        remainder = total_budget - total_allocated
        proportional_allocs.sort(key=lambda x: x["combined_efficiency"], reverse=True)
        remainder_distributed = 0
        for i, pa in enumerate(proportional_allocs):
            if i < len(proportional_allocs) - 1:
                extra = remainder * (pa["combined_efficiency"] / total_efficiency) if total_efficiency > 0 else remainder / len(proportional_allocs)
                capped = min(pa["raw_allocation"] + extra, pa["max_budget"])
                extra_actual = capped - pa["raw_allocation"]
                pa["raw_allocation"] = round(capped, 2)
                remainder_distributed += extra_actual
        # Last platform gets what's left
        if proportional_allocs:
            last = proportional_allocs[-1]
            last["raw_allocation"] = round(total_budget - (total_allocated + remainder_distributed) + last["raw_allocation"], 2)

    # Build final allocations
    final_allocated = 0
    for pa in proportional_allocs:
        alloc_val = round(pa["raw_allocation"], 2)
        change = alloc_val - pa["current_budget"]
        change_pct = round((change / max(pa["current_budget"], 0.01)) * 100, 1) if pa["current_budget"] > 0 else 100.0

        allocations.append({
            "platform": pa["name"],
            "current_budget": pa["current_budget"],
            "allocated_budget": alloc_val,
            "change": round(change, 2),
            "change_pct": change_pct,
            "current_roas": pa["current_roas"],
            "efficiency_score": round(pa["combined_efficiency"], 3),
        })
        final_allocated += alloc_val

    # Expected ROAS (weighted by allocation)
    expected_roas = 0
    if final_allocated > 0:
        for a in allocations:
            weight = a["allocated_budget"] / final_allocated
            expected_roas += a["current_roas"] * weight
    expected_roas = round(expected_roas, 2)

    return {
        "allocations": sorted(allocations, key=lambda x: x["allocated_budget"], reverse=True),
        "allocation_summary": {
            "total_budget": total_budget,
            "total_allocated": round(final_allocated, 2),
            "remaining": round(total_budget - final_allocated, 2),
            "target_roas": target_roas,
        },
        "expected_roas": expected_roas,
    }


# ──────────────────────────────────────────────
# Audience Performance Analysis
# ──────────────────────────────────────────────


def _compute_saturation_index(impressions: float, frequency: float, unique_reach: float) -> float:
    """Estimate audience saturation (0-100). Higher = more saturated."""
    if unique_reach <= 0:
        return 0
    return round(min(frequency * (impressions / max(unique_reach, 1)) * 0.1, 100), 1)


def _classify_audience(roas: float, cpa: float, conversion_rate: float, saturation: float) -> str:
    """Classify audience status."""
    if roas > 3 and conversion_rate > 0.05 and saturation < 40:
        return "winning"
    elif saturation > 70:
        return "oversaturated"
    elif roas < 1.0 and conversion_rate < 0.01:
        return "declining"
    elif conversion_rate > 0.03 and saturation < 30:
        return "underexplored"
    return "stable"


def analyze_audience_performance(audience_data: list[dict]) -> list[dict]:
    """
    Analyze and rank audience segments by performance.

    Args:
        audience_data: list of dicts, each with:
            - 'name': str
            - 'spend': float
            - 'revenue': float (or 'conversions' * 'aov')
            - 'impressions': int
            - 'clicks': int
            - 'conversions': int
            - 'frequency': float (optional, default 1.0)
            - 'unique_reach': int (optional)
            - 'aov': float (optional, average order value)

    Returns:
        list of ranked audience dicts with computed metrics and classification.
    """
    if not audience_data:
        return []

    results: list[dict] = []
    for aud in audience_data:
        name = aud.get("name", "unknown")
        spend = float(aud.get("spend", 0))
        revenue = float(aud.get("revenue", 0))
        impressions = int(aud.get("impressions", 0))
        clicks = int(aud.get("clicks", 0))
        conversions = int(aud.get("conversions", 0))
        frequency = float(aud.get("frequency", 1.0))
        unique_reach = int(aud.get("unique_reach", 0))
        aov = float(aud.get("aov", 0))

        # Compute metrics
        roas = round(revenue / max(spend, 0.01), 2)
        cpa = round(spend / max(conversions, 1), 2)
        conversion_rate = round(conversions / max(clicks, 1), 4)
        ctr = round(clicks / max(impressions, 1) * 100, 2)

        # Saturation index
        saturation = _compute_saturation_index(impressions, frequency, unique_reach)

        # Status classification
        status = _classify_audience(roas, cpa, conversion_rate, saturation)

        results.append({
            "name": name,
            "spend": spend,
            "revenue": revenue,
            "roas": roas,
            "cpa": cpa,
            "conversion_rate": conversion_rate,
            "ctr": ctr,
            "impressions": impressions,
            "clicks": clicks,
            "conversions": conversions,
            "frequency": frequency,
            "audience_saturation_index": saturation,
            "status": status,
        })

    # Sort by ROAS descending
    results.sort(key=lambda x: x["roas"], reverse=True)

    return results


# ──────────────────────────────────────────────
# Full Audit Report
# ──────────────────────────────────────────────


def generate_ad_audit_report(
    platform_data: dict,
    config: dict | None = None,
) -> dict:
    """
    Generate a comprehensive paid ads audit report.

    Pipeline:
        1. Ad health scores (all platforms)
        2. Budget analysis and reallocation
        3. Audience performance analysis
        4. Priority actions

    Args:
        platform_data: dict with keys:
            - 'platform_metrics': dict for health scoring
            - 'platforms': list[dict] for budget allocation
            - 'audiences': list[dict] for audience analysis
            - 'total_budget': float (optional)
            - 'target_roas': float (optional)
        config: optional dict with:
            - 'weights': custom metric weights
            - 'budget_weights': custom platform weights

    Returns:
        dict with full ad audit report.
    """
    config = config or {}
    total_budget = platform_data.get("total_budget", platform_data.get("budget", 0))
    target_roas = platform_data.get("target_roas", 3.0)

    # Step 1: Health scores
    health = calculate_ad_health_score(
        platform_data.get("platform_metrics", {}),
        config.get("weights"),
    )

    # Step 2: Budget allocation
    budget_allocation = allocate_budget(
        platform_data.get("platforms", []),
        float(total_budget),
        float(target_roas),
    )

    # Step 3: Audience performance
    audiences = analyze_audience_performance(
        platform_data.get("audiences", []),
    )

    # Step 4: Priority actions
    priority_actions: list[dict] = []

    # From health scores
    for platform, info in health.get("platforms", {}).items():
        if info.get("rating") == "poor":
            for metric_key, metric_info in info.get("metrics", {}).items():
                if metric_info.get("rating") == "poor":
                    priority_actions.append({
                        "priority": "high",
                        "category": "health",
                        "platform": platform,
                        "action": f"Poor {metric_info.get('label', metric_key)} on {platform.upper()} "
                                  f"({metric_info.get('value', '?')}). Needs improvement.",
                    })

    # From budget
    for alloc in budget_allocation.get("allocations", []):
        change_pct = alloc.get("change_pct", 0)
        if change_pct > 50:
            priority_actions.append({
                "priority": "medium",
                "category": "budget",
                "platform": alloc.get("platform", ""),
                "action": f"Increase budget for {alloc['platform'].upper()} by {change_pct}% "
                          f"(ROAS: {alloc.get('current_roas', '?')}).",
            })
        elif change_pct < -30:
            priority_actions.append({
                "priority": "medium",
                "category": "budget",
                "platform": alloc.get("platform", ""),
                "action": f"Reduce budget for {alloc['platform'].upper()} by {abs(change_pct)}% "
                          f"(underperforming ROAS: {alloc.get('current_roas', '?')}).",
            })

    # From audience analysis
    winning = [a for a in audiences if a.get("status") == "winning"]
    oversaturated = [a for a in audiences if a.get("status") == "oversaturated"]
    declining = [a for a in audiences if a.get("status") == "declining"]
    underexplored = [a for a in audiences if a.get("status") == "underexplored"]

    if winning:
        priority_actions.append({
            "priority": "high",
            "category": "audience",
            "platform": "all",
            "action": f"Scale winning audiences: {', '.join(a['name'] for a in winning[:3])}. "
                      f"Increase budget while monitoring saturation.",
        })
    if oversaturated:
        priority_actions.append({
            "priority": "high",
            "category": "audience",
            "platform": "all",
            "action": f"Refresh oversaturated audiences: {', '.join(a['name'] for a in oversaturated[:3])}. "
                      f"Rotate creative or narrow targeting.",
        })
    if underexplored:
        priority_actions.append({
            "priority": "medium",
            "category": "audience",
            "platform": "all",
            "action": f"Test underexplored audiences: {', '.join(a['name'] for a in underexplored[:3])}. "
                      f"Small budget increment recommended.",
        })

    summary = {
        "overall_health": health.get("weighted_overall", 0),
        "overall_rating": health.get("overall_rating", "no_data"),
        "platforms_analyzed": list(health.get("platforms", {}).keys()),
        "total_budget": total_budget,
        "expected_roas": budget_allocation.get("expected_roas", 0),
        "winning_audiences": len(winning),
        "oversaturated_audiences": len(oversaturated),
        "declining_audiences": len(declining),
        "underexplored_audiences": len(underexplored),
        "priority_actions_count": len(priority_actions),
    }

    return {
        "ad_health_scores": health,
        "budget_reallocation": budget_allocation,
        "audience_performance": {
            "ranked_audiences": audiences,
            "winning": winning,
            "oversaturated": oversaturated,
            "declining": declining,
            "underexplored": underexplored,
        },
        "priority_actions": sorted(priority_actions, key=lambda x: (
            0 if x["priority"] == "high" else 1
        )),
        "summary": summary,
    }
