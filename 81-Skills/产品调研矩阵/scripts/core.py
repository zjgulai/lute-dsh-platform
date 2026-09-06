"""
Product Research Matrix - 产品选品矩阵分析

多维度产品/品类评估矩阵：需求、竞争、利润、门槛、差异化、趋势、
运营适配性、风险画像。
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


# ──────────────────────────────────────────────
# Default Dimensions
# ──────────────────────────────────────────────

_DEFAULT_DIMENSIONS = [
    {
        "name": "demand_size",
        "label": "Demand Size",
        "description": "Market demand volume and stability",
        "weight": 0.20,
        "min_score": 1,
        "max_score": 10,
        "rubric": {
            1: "Very low demand, declining trend",
            3: "Low demand, niche only",
            5: "Moderate demand, stable",
            7: "High demand, growing",
            10: "Very high demand, strong growth trajectory",
        },
        "risk_flags": {"low": "Declining demand trend", "high": "Highly seasonal with short windows"},
    },
    {
        "name": "competition_intensity",
        "label": "Competition Intensity",
        "description": "Number and strength of competitors",
        "weight": 0.15,
        "min_score": 1,
        "max_score": 10,
        "rubric": {
            1: "Highly saturated, dominated by major brands",
            3: "Many competitors, strong price pressure",
            5: "Moderate competition, differentiation possible",
            7: "Few competitors, fragmented market",
            10: "Very few or no direct competitors, blue ocean",
        },
        "risk_flags": {"low": "Highly saturated with price wars", "high": "Risk of new entrants copying quickly"},
    },
    {
        "name": "margin_potential",
        "label": "Margin Potential",
        "description": "Profit margin potential after COGS, fees, and marketing",
        "weight": 0.15,
        "min_score": 1,
        "max_score": 10,
        "rubric": {
            1: "Very low margins (<10%), high COGS",
            3: "Low margins (10-20%)",
            5: "Moderate margins (20-30%)",
            7: "Good margins (30-40%)",
            10: "Excellent margins (>40%)",
        },
        "risk_flags": {
            "low": "Commodity pricing, tight margins",
            "high": "Raw material price volatility",
        },
    },
    {
        "name": "entry_barriers",
        "label": "Entry Barriers",
        "description": "Difficulty to enter the market",
        "weight": 0.10,
        "min_score": 1,
        "max_score": 10,
        "rubric": {
            1: "Very high barriers (patents, regulations, $100K+)",
            3: "High barriers (certification, capital intensive)",
            5: "Moderate barriers (technical knowledge needed)",
            7: "Low barriers (easy to source, simple to sell)",
            10: "Very low barriers (open market, simple logistics)",
        },
        "risk_flags": {"low": "Regulatory or compliance risks", "high": "Quality control challenges"},
    },
    {
        "name": "differentiation_space",
        "label": "Differentiation Space",
        "description": "Room for product differentiation",
        "weight": 0.12,
        "min_score": 1,
        "max_score": 10,
        "rubric": {
            1: "Completely commoditized, no differentiation possible",
            3: "Limited differentiation (mostly price-based)",
            5: "Moderate differentiation (features, design)",
            7: "Good differentiation (innovation, branding)",
            10: "Wide open for innovation and unique positioning",
        },
        "risk_flags": {
            "low": "Easily copied features, no IP protection",
            "high": "Innovation requires R&D investment",
        },
    },
    {
        "name": "trend_momentum",
        "label": "Trend Momentum",
        "description": "Market trend direction and duration",
        "weight": 0.10,
        "min_score": 1,
        "max_score": 10,
        "rubric": {
            1: "Declining market, fading trend",
            3: "Flat or slightly declining",
            5: "Stable, mature market",
            7: "Growing market with momentum",
            10: "High-growth emerging category",
        },
        "risk_flags": {
            "low": "Fad risk, short trend cycle",
            "high": "Fast-evolving with risk of disruption",
        },
    },
    {
        "name": "operational_fit",
        "label": "Operational Fit",
        "description": "How well the product fits current operations and supply chain",
        "weight": 0.10,
        "min_score": 1,
        "max_score": 10,
        "rubric": {
            1: "Complete operational mismatch",
            3: "Poor fit, major changes needed",
            5: "Moderate fit, some adaptation needed",
            7: "Good fit, minor adjustments needed",
            10: "Perfect fit with existing operations",
        },
        "risk_flags": {
            "low": "Complex logistics, fragile supply chain",
            "high": "Supplier concentration risk",
        },
    },
    {
        "name": "risk_profile",
        "label": "Risk Profile",
        "description": "Overall business risk assessment",
        "weight": 0.08,
        "min_score": 1,
        "max_score": 10,
        "rubric": {
            1: "Multiple unmitigable risks",
            3: "Significant risks, difficult to mitigate",
            5: "Moderate risks, manageable",
            7: "Low risks, well-understood",
            10: "Minimal risks, robust business model",
        },
        "risk_flags": {
            "low": "Product liability, safety concerns",
            "high": "IP infringement risk or patent cliffs",
        },
    },
]


def define_evaluation_dimensions(config: list[dict] | None = None) -> list[dict]:
    """
    Return evaluation dimensions for product opportunity analysis.

    Each dimension has: name, label, description, weight, min/max_score, rubric, and risk_flags.

    Default 8 dimensions cover: demand_size, competition_intensity, margin_potential,
    entry_barriers, differentiation_space, trend_momentum, operational_fit, risk_profile.

    Args:
        config: Optional list of dimension overrides. Each dict can override any field.
                Set 'weight' to customize importance. Provide only the dimensions to
                override; dimensions not in config use defaults.

    Returns:
        list of dimension dicts
    """
    if not config:
        return deepcopy(_DEFAULT_DIMENSIONS)

    config_map = {d["name"]: d for d in config if "name" in d}
    result = deepcopy(_DEFAULT_DIMENSIONS)

    for i, dim in enumerate(result):
        override = config_map.get(dim["name"])
        if override:
            result[i].update(override)

    return result


# ──────────────────────────────────────────────
# Scoring
# ──────────────────────────────────────────────


def _validate_score(score: float, dim: dict) -> float:
    """Clamp score to dimension range."""
    return max(float(dim.get("min_score", 1)), min(float(dim.get("max_score", 10)), score))


def _get_rubric_description(score: float, dim: dict) -> str:
    """Get the rubric description for a given score."""
    rubric = dim.get("rubric", {})
    # Find closest score key
    score_key = int(round(score))
    keys = sorted(rubric.keys())
    closest = min(keys, key=lambda k: abs(k - score_key))
    return rubric.get(closest, "")


def _check_risk_flags(candidate: dict, dim: dict) -> list[str]:
    """Check for applicable risk flags based on candidate data."""
    flags: list[str] = []
    risk_flags = dim.get("risk_flags", {})

    # Basic heuristic: if the candidate has a 'risks' key with matching text
    candidate_risks = (candidate.get("risks") or "").lower()
    candidate_notes = (candidate.get("notes") or "").lower()

    for flag_type, flag_text in risk_flags.items():
        flag_keywords = flag_text.lower().split()
        if any(kw in candidate_risks or kw in candidate_notes for kw in flag_keywords):
            flags.append(flag_text)

    return flags


def score_product_opportunity(candidate: dict, dimensions: list[dict]) -> dict:
    """
    Score a single product candidate across all evaluation dimensions.

    Args:
        candidate: dict with:
            - 'name': str (required)
            - 'scores': dict of dimension_name -> numeric score (1-10)
            - 'risks': str (optional, free text for risk flag detection)
            - 'notes': str (optional, free text for context)
            - 'data': dict (optional, supporting data by dimension)
        dimensions: list of dimension dicts (from define_evaluation_dimensions)

    Returns:
        dict with:
            - 'candidate_name': str
            - 'dimension_scores': list[dict] per dimension
            - 'weighted_score': float (weighted composite, 1-10)
            - 'risk_flags': list[str]
            - 'score_breakdown': dict
    """
    name = candidate.get("name", "Unknown")
    raw_scores = candidate.get("scores", {})

    dim_scores: list[dict] = []
    weighted_sum = 0.0
    weight_sum = 0.0
    risk_flags: list[str] = []

    for dim in dimensions:
        dim_name = dim["name"]
        raw = raw_scores.get(dim_name, dim.get("min_score", 5))
        score = _validate_score(raw, dim)
        weight = dim.get("weight", 1.0)

        risk_flags.extend(_check_risk_flags(candidate, dim))

        dim_scores.append(
            {
                "name": dim_name,
                "label": dim.get("label", dim_name),
                "score": score,
                "weight": weight,
                "weighted_contribution": round(score * weight, 2),
                "rubric": _get_rubric_description(score, dim),
                "description": dim.get("description", ""),
            }
        )

        weighted_sum += score * weight
        weight_sum += weight

    weighted_score = weighted_sum / weight_sum if weight_sum > 0 else 0.0

    return {
        "candidate_name": name,
        "dimension_scores": dim_scores,
        "weighted_score": round(weighted_score, 2),
        "risk_flags": list(set(risk_flags)),
        "score_breakdown": {
            "raw_sum": round(weighted_sum, 2),
            "weight_sum": round(weight_sum, 2),
            "dimension_count": len(dimensions),
        },
    }


# ──────────────────────────────────────────────
# Ranking
# ──────────────────────────────────────────────


def rank_opportunities(candidates: list[dict], dimensions: list[dict]) -> list[dict]:
    """
    Rank multiple product candidates by weighted composite score.

    Args:
        candidates: list of candidate dicts (see score_product_opportunity)
        dimensions: list of dimension dicts

    Returns:
        list of scored candidates sorted by weighted_score descending
    """
    scored = [score_product_opportunity(c, dimensions) for c in candidates]

    scored.sort(key=lambda x: x["weighted_score"], reverse=True)

    # Add rank
    for rank, s in enumerate(scored, 1):
        s["rank"] = rank

    return scored


# ──────────────────────────────────────────────
# Full Matrix
# ──────────────────────────────────────────────


def _identify_top_opportunities(ranked: list[dict]) -> list[dict]:
    """Extract top candidates (score >= 7 or top 3)."""
    top = []
    for s in ranked[:3]:
        if s["weighted_score"] >= 5.0:
            top.append(
                {
                    "rank": s["rank"],
                    "candidate": s["candidate_name"],
                    "score": s["weighted_score"],
                    "key_strengths": [
                        d["label"]
                        for d in s["dimension_scores"]
                        if d["score"] >= 7
                    ],
                    "key_weaknesses": [
                        d["label"]
                        for d in s["dimension_scores"]
                        if d["score"] <= 4
                    ],
                }
            )
    return top


def generate_opportunity_matrix(candidates: list[dict], dimensions: list[dict]) -> dict:
    """
    Full opportunity matrix: top opportunities, risk flags, recommendation summary.

    Args:
        candidates: list of candidate product dicts
        dimensions: list of evaluation dimension dicts

    Returns:
        dict with:
            - 'matrix_name': str
            - 'dimensions': list[dict] (used dimensions)
            - 'ranked_opportunities': list[dict] (full scored + ranked)
            - 'top_opportunities': list[dict] (highlights)
            - 'risk_summary': dict
            - 'recommendation_summary': dict
    """
    ranked = rank_opportunities(candidates, dimensions)
    top_opps = _identify_top_opportunities(ranked)

    # Risk summary
    all_risk_flags: list[str] = []
    for s in ranked:
        all_risk_flags.extend(s.get("risk_flags", []))
    risk_counts: dict[str, int] = {}
    for flag in all_risk_flags:
        risk_counts[flag] = risk_counts.get(flag, 0) + 1
    top_risks = sorted(risk_counts.items(), key=lambda x: x[1], reverse=True)

    # Recommendation summary
    if top_opps:
        top_score = top_opps[0]["score"]
        if top_score >= 8.0:
            recommendation = "Strong Go — High opportunity with manageable risks"
        elif top_score >= 6.5:
            recommendation = "Conditional Go — Promising but requires due diligence on weaknesses"
        else:
            recommendation = "Consider with Caution — Low composite score, review risk factors"
    else:
        recommendation = "Not Recommended — No candidates meet minimum threshold"

    best_candidate = top_opps[0]["candidate"] if top_opps else "N/A"

    return {
        "matrix_name": "Product Opportunity Matrix",
        "dimensions_used": [{"name": d["name"], "label": d["label"], "weight": d["weight"]} for d in dimensions],
        "ranked_opportunities": ranked,
        "top_opportunities": top_opps,
        "risk_summary": {
            "total_risk_flags": len(all_risk_flags),
            "unique_risk_types": len(top_risks),
            "top_risks": [{"risk": r, "count": c} for r, c in top_risks[:5]],
            "high_risk_candidates": [
                {"name": s["candidate_name"], "score": s["weighted_score"], "risks": s["risk_flags"]}
                for s in ranked
                if len(s.get("risk_flags", [])) >= 2
            ],
        },
        "recommendation_summary": {
            "recommendation": recommendation,
            "best_candidate": best_candidate,
            "total_candidates_analyzed": len(candidates),
            "average_score": round(sum(s["weighted_score"] for s in ranked) / len(ranked), 2) if ranked else 0.0,
            "highest_score": ranked[0]["weighted_score"] if ranked else 0.0,
            "lowest_score": ranked[-1]["weighted_score"] if ranked else 0.0,
        },
    }
