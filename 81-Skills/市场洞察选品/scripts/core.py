"""
cbec-market-insight-selector - Market Opportunity Assessment core logic.

Scores product/market opportunities across 5 dimensions (brand synergy, VoC
strength, demand momentum, channel fit, life cycle position), classifies
opportunity mode, and generates actionable assessments.
"""

from __future__ import annotations

import math
from typing import Any


# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────

_OPPORTUNITY_DIMENSIONS = {
    "brand_synergy": {
        "label": "Brand Synergy",
        "weight": 0.30,
        "rubric": {
            1: "No alignment with brand positioning or values",
            3: "Weak alignment; overlaps in 1-2 areas",
            5: "Moderate alignment; fits brand tone but not core differentiator",
            7: "Strong alignment; reinforces brand positioning",
            10: "Perfect alignment; natural brand extension, strengthens core narrative",
        },
    },
    "voc_strength": {
        "label": "Voice of Customer Strength",
        "weight": 0.25,
        "rubric": {
            1: "No customer signals detected",
            3: "Anecdotal mentions; less than 5 related queries",
            5: "Moderate signal; 10+ customer requests or complaints",
            7: "Strong signal; frequent mentions, clear pain point identified",
            10: "Overwhelming signal; viral discussion, high search intent confirmed",
        },
    },
    "demand_momentum": {
        "label": "Demand Momentum",
        "weight": 0.20,
        "rubric": {
            1: "Declining trend; no growth in search or sales",
            3: "Flat demand; stable but not growing",
            5: "Slight growth; 5-15% YoY increase",
            7: "Strong growth; 15-30% YoY increase",
            10: "Explosive growth; 30%+ YoY, high media attention",
        },
    },
    "channel_fit": {
        "label": "Channel Fit",
        "weight": 0.15,
        "rubric": {
            1: "No existing channel supports this opportunity",
            3: "Requires new channel setup to execute",
            5: "Fits existing channels but needs adaptation",
            7: "Good fit for current channel mix with minor changes",
            10: "Perfect fit; ready to launch on existing channels",
        },
    },
    "life_cycle_position": {
        "label": "Life Cycle Position",
        "weight": 0.10,
        "rubric": {
            1: "Mature/declining stage; market saturation",
            3: "Late growth stage; increasing competition",
            5: "Growth stage; competitive but expanding",
            7: "Early growth stage; first-mover advantage available",
            10: "Introduction stage; minimal competition, market-creating opportunity",
        },
    },
}


# ──────────────────────────────────────────────
# Score Validation
# ──────────────────────────────────────────────


def _validate_evidence(evidence: dict) -> list[str]:
    """Validate evidence dict has all required dimensions with valid scores."""
    errors: list[str] = []
    for dim_key, dim_info in _OPPORTUNITY_DIMENSIONS.items():
        score = evidence.get(dim_key)
        if score is None:
            errors.append(f"Missing score for dimension '{dim_key}' ({dim_info['label']}).")
        elif not isinstance(score, (int, float)):
            errors.append(f"Invalid score type for '{dim_key}': expected number, got {type(score).__name__}.")
        elif score < 1 or score > 10:
            errors.append(f"Score for '{dim_key}' ({score}) is out of range [1-10].")
    return errors


# ──────────────────────────────────────────────
# Opportunity Score
# ──────────────────────────────────────────────


def calculate_opportunity_score(evidence: dict) -> dict:
    """
    Calculate weighted opportunity score across 5 dimensions.

    Dimensions and weights:
        - brand_synergy (30%)
        - voc_strength (25%)
        - demand_momentum (20%)
        - channel_fit (15%)
        - life_cycle_position (10%)

    Each dimension scored 1-10.

    Args:
        evidence: dict with integer/float scores for each dimension key:
            {'brand_synergy': 7, 'voc_strength': 8, 'demand_momentum': 6,
             'channel_fit': 9, 'life_cycle_position': 5}

    Returns:
        dict with:
            - 'dimensions': list of scored dimension dicts
            - 'weighted_score': float (1-10)
            - 'score_pct': float (0-100 percentage)
            - 'max_possible': float
            - 'validation_errors': list[str]
    """
    errors = _validate_evidence(evidence)

    if errors:
        return {
            "dimensions": [],
            "weighted_score": 0,
            "score_pct": 0,
            "max_possible": 10,
            "validation_errors": errors,
        }

    dimensions: list[dict] = []
    weighted_sum = 0
    total_weight = 0

    for dim_key, dim_info in _OPPORTUNITY_DIMENSIONS.items():
        score = evidence[dim_key]
        weight = dim_info["weight"]
        weighted_sum += score * weight
        total_weight += weight

        # Find rubric tier
        rubric_tier = max(
            (level for level in dim_info["rubric"] if level <= score),
            default=1,
        )

        dimensions.append({
            "dimension": dim_key,
            "label": dim_info["label"],
            "score": score,
            "weight": weight,
            "weighted_contribution": round(score * weight, 3),
            "rubric": dim_info["rubric"][rubric_tier],
        })

    weighted_score = round(weighted_sum / max(total_weight, 0.01), 2)
    score_pct = round((weighted_score / 10) * 100, 1)

    return {
        "dimensions": dimensions,
        "weighted_score": weighted_score,
        "score_pct": score_pct,
        "max_possible": 10,
        "validation_errors": [],
    }


# ──────────────────────────────────────────────
# Opportunity Mode Classification
# ──────────────────────────────────────────────


def classify_opportunity_mode(score: float) -> dict:
    """
    Classify opportunity into action mode based on weighted score.

    Args:
        score: weighted score from calculate_opportunity_score (1-10).

    Returns:
        dict with:
            - 'mode': str (quick_validation | strategic_planning | defer)
            - 'description': str
            - 'recommended_action': str
            - 'time_horizon': str
            - 'resource_level': str
            - 'risk_level': str
    """
    if not isinstance(score, (int, float)):
        return {
            "mode": "unknown",
            "description": "Invalid score provided.",
            "recommended_action": "Review score calculation.",
            "time_horizon": "N/A",
            "resource_level": "N/A",
            "risk_level": "N/A",
        }

    if score > 6:
        return {
            "mode": "quick_validation",
            "description": "High-priority opportunity. Proceed to rapid validation.",
            "recommended_action": "Create minimum viable product (MVP). Run small-scale test. Validate demand within 2-4 weeks.",
            "time_horizon": "Short-term (1-3 months to launch)",
            "resource_level": "High - allocate dedicated team",
            "risk_level": "Low - strong signals across dimensions",
        }
    elif score >= 4:
        return {
            "mode": "strategic_planning",
            "description": "Moderate opportunity. Develop detailed plan before committing resources.",
            "recommended_action": "Conduct deeper market research. Build business case. Define success metrics before launch.",
            "time_horizon": "Medium-term (3-6 months to launch)",
            "resource_level": "Medium - part of quarterly planning",
            "risk_level": "Medium - requires more validation",
        }
    else:
        return {
            "mode": "defer",
            "description": "Low-priority opportunity. Monitor but do not allocate resources now.",
            "recommended_action": "Add to observation list. Re-score in 3-6 months when market conditions may change.",
            "time_horizon": "Long-term (6+ months)",
            "resource_level": "Minimal - monitoring only",
            "risk_level": "High - insufficient positive signals",
        }


# ──────────────────────────────────────────────
# Opportunity Assessment
# ──────────────────────────────────────────────


def generate_opportunity_assessment(
    evidence: dict,
    config: dict | None = None,
) -> dict:
    """
    Generate a full opportunity assessment report.

    Pipeline:
        1. Calculate weighted opportunity score
        2. Classify opportunity mode
        3. Identify top strengths and risks
        4. Recommend next steps

    Args:
        evidence: dict with 5 dimension scores:
            - 'brand_synergy': int (1-10)
            - 'voc_strength': int (1-10)
            - 'demand_momentum': int (1-10)
            - 'channel_fit': int (1-10)
            - 'life_cycle_position': int (1-10)
            Also optional: 'opportunity_name' (str), 'category' (str)
        config: optional dict with:
            - 'threshold_quick': float (default 6.0)
            - 'threshold_strategic': float (default 4.0)
            - 'context_notes': str

    Returns:
        dict with full opportunity assessment.
    """
    config = config or {}
    threshold_quick = config.get("threshold_quick", 6.0)
    threshold_strategic = config.get("threshold_strategic", 4.0)
    context_notes = config.get("context_notes", "")
    opportunity_name = evidence.get("opportunity_name", config.get("opportunity_name", "Unnamed Opportunity"))
    category = evidence.get("category", config.get("category", ""))

    # Step 1: Calculate score
    scoring = calculate_opportunity_score(evidence)

    if scoring["validation_errors"]:
        return {
            "opportunity_name": opportunity_name,
            "scoring": scoring,
            "classification": {
                "mode": "error",
                "description": "Cannot classify due to validation errors.",
                "recommended_action": "Fix validation errors and re-run.",
                "time_horizon": "N/A",
                "resource_level": "N/A",
                "risk_level": "N/A",
            },
            "top_strengths": [],
            "top_risks": [],
            "recommended_next_step": "Fix input validation errors.",
            "summary": {},
        }

    weighted_score = scoring["weighted_score"]

    # Classify using custom thresholds
    if weighted_score > threshold_quick:
        classification = classify_opportunity_mode(weighted_score + 2)  # bump to high range
    elif weighted_score >= threshold_strategic:
        classification = classify_opportunity_mode(5)  # mid-range
    else:
        classification = classify_opportunity_mode(3)  # low range

    # Step 2: Top strengths (highest scoring dimensions)
    sorted_dims = sorted(scoring["dimensions"], key=lambda x: x["score"], reverse=True)
    top_strengths = []
    for dim in sorted_dims:
        if dim["score"] >= 7:
            top_strengths.append({
                "dimension": dim["label"],
                "score": dim["score"],
                "detail": dim["rubric"],
            })

    # Step 3: Top risks (lowest scoring dimensions)
    top_risks = []
    for dim in reversed(sorted_dims):
        if dim["score"] <= 5:
            top_risks.append({
                "dimension": dim["label"],
                "score": dim["score"],
                "detail": dim["rubric"],
                "mitigation_suggestion": _suggest_mitigation(dim["dimension"], dim["score"]),
            })

    # Step 4: Recommended next step
    if weighted_score > threshold_quick:
        next_step = (
            f"Initiate quick validation for '{opportunity_name}': "
            f"create MVP, run small-scale ad test, validate with 50+ customer interviews."
        )
    elif weighted_score >= threshold_strategic:
        next_step = (
            f"Develop strategic plan for '{opportunity_name}': "
            f"commission deeper market sizing, build competitive matrix, "
            f"address risk areas before committing budget."
        )
    else:
        next_step = (
            f"Defer '{opportunity_name}' for now. "
            f"Add to opportunity backlog and re-score quarterly. "
            f"Monitor competitor moves and VoC signals."
        )

    summary = {
        "opportunity_name": opportunity_name,
        "category": category,
        "weighted_score": weighted_score,
        "score_pct": scoring["score_pct"],
        "mode": classification["mode"],
        "top_strengths_count": len(top_strengths),
        "top_risks_count": len(top_risks),
        "time_horizon": classification["time_horizon"],
        "resource_level": classification["resource_level"],
        "risk_level": classification["risk_level"],
    }

    return {
        "opportunity_name": opportunity_name,
        "category": category,
        "scoring": scoring,
        "classification": classification,
        "top_strengths": top_strengths,
        "top_risks": top_risks,
        "context_notes": context_notes,
        "recommended_next_step": next_step,
        "summary": summary,
    }


def _suggest_mitigation(dimension: str, score: int) -> str:
    """Suggest mitigation for low-scoring dimensions."""
    mitigations = {
        "brand_synergy": "Revisit brand positioning. Consider sub-brand or strategic partnership to bridge the gap.",
        "voc_strength": "Conduct targeted VoC research: surveys, focus groups, social listening campaigns.",
        "demand_momentum": "Analyze search trends and category growth reports. Identify adjacent high-growth segments.",
        "channel_fit": "Evaluate channel partnership options. Consider pilot on marketplace or DTC test.",
        "life_cycle_position": "Differentiate through unique value proposition. Target underserved sub-segments.",
    }
    return mitigations.get(dimension, "Reassess strategic fit and develop mitigation plan.")
