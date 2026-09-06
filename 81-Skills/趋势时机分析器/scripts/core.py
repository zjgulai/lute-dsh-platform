"""
cbec-trend-timing-analyzer - Trend Timing Analyzer core logic.

Aggregates public and private trend signals, analyzes competitor activity,
scores timing tiers (category/sub-trend/channel), estimates market windows,
and generates timing recommendations.
"""

from __future__ import annotations

import math
from typing import Any


# ──────────────────────────────────────────────
# Aggregate Trend Signals
# ──────────────────────────────────────────────


def aggregate_trend_signals(
    public_data: dict | None = None,
    private_data: dict | None = None,
) -> dict:
    """
    Combine public trend signals with private leading indicators.

    Public signals: search_volume, bsr, ads_homogeneity, social_mentions.
    Private signals: dtc_pageviews, cart_adds, cs_queries, community_discussions.

    Args:
        public_data: dict with optional keys:
            - 'search_volume': dict with 'current', 'trend' (rising/stable/declining), 'growth_pct'
            - 'bsr': dict with 'avg_rank', 'trend'
            - 'ads_homogeneity': float (0-1, how similar ad copy is across competitors)
            - 'social_mentions': dict with 'count', 'trend'
        private_data: dict with optional keys:
            - 'dtc_pageviews': dict with 'current', 'prior', 'change_pct'
            - 'cart_adds': dict with 'current', 'prior', 'change_pct'
            - 'cs_queries': dict with 'count', 'trend'
            - 'community_discussions': dict with 'count', 'trend'

    Returns:
        dict with:
            - 'has_public_data': bool
            - 'has_private_data': bool
            - 'signals_quality': str ('private+public' | 'public_only' | 'minimal')
            - 'public': dict with aggregated public signals
            - 'private': dict with aggregated private signals
            - 'combined_assessment': dict with overall trend direction
    """
    public = public_data or {}
    private = private_data or {}

    has_public = bool(public)
    has_private = bool(private)

    if has_public and has_private:
        quality = "private+public"
    elif has_public:
        quality = "public_only"
    else:
        quality = "minimal"

    # Aggregate public signals
    search_vol = public.get("search_volume", {})
    bsr = public.get("bsr", {})
    ads_homo = public.get("ads_homogeneity", 0.5)
    social = public.get("social_mentions", {})

    # Aggregate private signals
    dtc_pv = private.get("dtc_pageviews", {})
    cart = private.get("cart_adds", {})
    cs = private.get("cs_queries", {})
    community = private.get("community_discussions", {})

    # Combined trend direction
    trend_signals = []
    if public.get("search_volume", {}).get("trend") == "rising":
        trend_signals.append("public_search_rising")
    if bsr.get("trend") == "rising":
        trend_signals.append("bsr_improving")
    if ads_homo and ads_homo > 0.7:
        trend_signals.append("high_ad_homogeneity")
    if social.get("trend") == "rising":
        trend_signals.append("social_rising")
    if dtc_pv.get("change_pct", 0) > 20:
        trend_signals.append("dtc_pageview_surge")
    if cart.get("change_pct", 0) > 15:
        trend_signals.append("cart_add_increase")
    if cs.get("trend") == "rising":
        trend_signals.append("cs_query_increase")
    if community.get("trend") == "rising":
        trend_signals.append("community_interest_rising")

    # Overall assessment
    positive_signals = sum(1 for s in trend_signals if s not in ("high_ad_homogeneity",))
    total_weight = min(1.0, positive_signals * 0.15 + (1 - ads_homo) * 0.1)

    return {
        "has_public_data": has_public,
        "has_private_data": has_private,
        "signals_quality": quality,
        "public": {
            "search_volume": search_vol,
            "bsr": bsr,
            "ads_homogeneity": ads_homo,
            "social_mentions": social,
        },
        "private": {
            "dtc_pageviews": dtc_pv,
            "cart_adds": cart,
            "cs_queries": cs,
            "community_discussions": community,
        },
        "combined_signals": trend_signals,
        "combined_assessment": {
            "signal_count": len(trend_signals),
            "positive_bias": round(total_weight, 2),
            "direction": "positive" if total_weight > 0.4 else "neutral" if total_weight > 0.1 else "negative",
            "note": "Based on public signals only" if not has_private else (
                "Combined public + private signals" if has_private and has_public else "Limited signal data"
            ),
        },
    }


# ──────────────────────────────────────────────
# Analyze Competitor Signals
# ──────────────────────────────────────────────


def analyze_competitor_signals(signals: list[dict] | None = None) -> list[dict]:
    """
    Detect competitor activity from signal data.

    Analyzes patent filings, hiring patterns, ad copy shifts, and new product
    launches from competitor activity data.

    Args:
        signals: list of competitor signal dicts, each with:
            - 'type': str ('patent', 'hiring', 'ad_shift', 'new_product')
            - 'competitor': str
            - 'description': str
            - 'date': str
            - 'confidence': float (0-1)
            - 'relevance': float (0-1)

    Returns:
        list of signal dicts sorted by relevance descending, enriched with
        signal_category label and action_urgency.
    """
    if not signals:
        return []

    _TYPE_LABELS = {
        "patent": "Technology/Patent Filing",
        "hiring": "Talent/Hiring Pattern",
        "ad_shift": "Advertising/Positioning Shift",
        "new_product": "New Product Launch/Pre-announcement",
    }

    results: list[dict] = []
    for signal in signals:
        signal_type = signal.get("type", "unknown")
        confidence = float(signal.get("confidence", 0.5))
        relevance = float(signal.get("relevance", 0.5))

        # Compute action urgency
        urgency_score = confidence * 0.4 + relevance * 0.6
        if urgency_score >= 0.7:
            urgency = "high"
        elif urgency_score >= 0.4:
            urgency = "medium"
        else:
            urgency = "low"

        results.append({
            "type": signal_type,
            "type_label": _TYPE_LABELS.get(signal_type, signal_type),
            "competitor": signal.get("competitor", "unknown"),
            "description": signal.get("description", ""),
            "date": signal.get("date", ""),
            "confidence": confidence,
            "relevance": relevance,
            "urgency_score": round(urgency_score, 2),
            "action_urgency": urgency,
        })

    results.sort(key=lambda x: x["urgency_score"], reverse=True)
    return results


# ──────────────────────────────────────────────
# Score Timing Tier
# ──────────────────────────────────────────────


def score_timing_tier(trend_data: dict) -> dict:
    """
    Score timing recommendation across 3 layers.

    Layers:
        - category_timing: enter_now | hold_observe | avoid
        - sub_trend_timing: same options
        - channel_timing: amazon_first | dtc_first | both

    Args:
        trend_data: dict from aggregate_trend_signals.

    Returns:
        dict with timing_tiers per layer, each containing:
            - 'verdict': str
            - 'confidence': str (high/medium/low)
            - 'reasons': list[str]
    """
    combined = trend_data.get("combined_assessment", {})
    direction = combined.get("direction", "neutral")
    signal_count = combined.get("signal_count", 0)
    ads_homo = trend_data.get("public", {}).get("ads_homogeneity", 0.5)
    has_private = trend_data.get("has_private_data", False)

    tiers = {}

    # --- Category Timing ---
    cat_reasons: list[str] = []
    if direction == "positive" and signal_count >= 3:
        cat_verdict = "enter_now"
        cat_confidence = "medium"
        cat_reasons.append(f"{signal_count} positive signals detected")
        if has_private:
            cat_confidence = "high"
            cat_reasons.append("Confirmed by private leading indicators")
    elif direction == "positive" and signal_count >= 1:
        cat_verdict = "hold_observe"
        cat_confidence = "low"
        cat_reasons.append("Early positive signals, insufficient to confirm trend")
        cat_reasons.append("Need more private indicators before committing")
    elif direction == "negative":
        cat_verdict = "avoid"
        cat_confidence = "medium"
        cat_reasons.append("Negative signal direction")
    else:
        cat_verdict = "hold_observe"
        cat_confidence = "low"
        cat_reasons.append("Mixed or insufficient signals")

    tiers["category_timing"] = {
        "verdict": cat_verdict,
        "confidence": cat_confidence,
        "reasons": cat_reasons,
    }

    # --- Sub-trend Timing (slightly more aggressive) ---
    sub_reasons: list[str] = []
    if signal_count >= 2:
        sub_verdict = "enter_now"
        sub_confidence = "medium"
        sub_reasons.append("Sub-trend signals more forward-looking than category average")
        sub_reasons.append("Lower competitive intensity than mature category segments")
    elif signal_count >= 1:
        sub_verdict = "hold_observe"
        sub_confidence = "low"
        sub_reasons.append("Interest emerging but insufficient to validate sub-trend")
    else:
        sub_verdict = "avoid"
        sub_confidence = "low"
        sub_reasons.append("No sub-trend signals detected")

    tiers["sub_trend_timing"] = {
        "verdict": sub_verdict,
        "confidence": sub_confidence,
        "reasons": sub_reasons,
    }

    # --- Channel Timing ---
    channel_reasons: list[str] = []
    if ads_homo > 0.7:
        channel_verdict = "dtc_first"
        channel_reasons.append("High Amazon ad homogeneity suggests DTC differentiation opportunity")
        channel_reasons.append("Direct channel allows more distinctive positioning")
    elif has_private:
        channel_verdict = "both"
        channel_reasons.append("Private data supports multi-channel readiness")
    else:
        channel_verdict = "amazon_first"
        channel_reasons.append("Amazon provides market validation with lower setup cost")
        channel_reasons.append("DTC strategy requires more data to validate")

    tiers["channel_timing"] = {
        "verdict": channel_verdict,
        "confidence": "medium" if signal_count >= 2 else "low",
        "reasons": channel_reasons,
    }

    return {
        "tiers": tiers,
        "overall_verdict": cat_verdict,
        "overall_confidence": cat_confidence,
        "has_private_data": has_private,
    }


# ──────────────────────────────────────────────
# Estimate Market Window
# ──────────────────────────────────────────────


def estimate_market_window(trend_data: dict) -> dict:
    """
    Estimate market entry/peak/decline windows and first-mover advantage.

    Args:
        trend_data: dict from aggregate_trend_signals.

    Returns:
        dict with:
            - 'optimal_entry_window': str
            - 'peak_window': str
            - 'decline_window': str
            - 'first_mover_advantage': str
            - 'estimated_months_to_peak': int
    """
    combined = trend_data.get("combined_assessment", {})
    direction = combined.get("direction", "neutral")
    search_vol = trend_data.get("public", {}).get("search_volume", {})
    growth_pct = search_vol.get("growth_pct", 0) if isinstance(search_vol, dict) else 0

    if direction == "positive" and growth_pct > 30:
        optimal = "0-6 months (early growth phase)"
        peak = "12-24 months"
        decline = "36+ months"
        months_to_peak = 18
        first_mover = "Significant (12-18 month lead possible before saturation)"
    elif direction == "positive":
        optimal = "0-12 months (growth phase opening)"
        peak = "18-30 months"
        decline = "48+ months"
        months_to_peak = 24
        first_mover = "Moderate (6-12 month lead window)"
    elif direction == "neutral":
        optimal = "3-9 months (wait for clearer signals)"
        peak = "24-36 months"
        decline = "48+ months"
        months_to_peak = 30
        first_mover = "Limited (trend still forming, early entry may not pay off)"
    else:
        optimal = "Not recommended (declining/negative trend)"
        peak = "Unknown"
        decline = "Unknown"
        months_to_peak = 0
        first_mover = "None (avoid this trend)"

    return {
        "optimal_entry_window": optimal,
        "peak_window": peak,
        "decline_window": decline,
        "first_mover_advantage_remaining": first_mover,
        "estimated_months_to_peak": months_to_peak,
    }


# ──────────────────────────────────────────────
# Full Report
# ──────────────────────────────────────────────


def generate_timing_report(
    trend_data: dict | None = None,
    config: dict | None = None,
) -> dict:
    """
    Full trend timing analysis pipeline.

    Pipeline:
        1. Aggregate trend signals
        2. Analyze competitor signals
        3. Score timing tiers
        4. Estimate market windows

    Args:
        trend_data: dict containing 'public_data', 'private_data', and
                    'competitor_signals' keys. If None, empty analysis is returned.
        config: optional dict with:
            - 'category': str
            - 'sub_trend': str

    Returns:
        dict with complete timing analysis.
    """
    config = config or {}
    category = config.get("category", "unknown")
    sub_trend = config.get("sub_trend", category)
    trend_data = trend_data or {}

    # Step 1: Signals
    aggregated = aggregate_trend_signals(
        trend_data.get("public_data"),
        trend_data.get("private_data"),
    )

    # Step 2: Competitor
    competitor = analyze_competitor_signals(
        trend_data.get("competitor_signals")
    )

    # Step 3: Timing tiers
    timing = score_timing_tier(aggregated)

    # Step 4: Market window
    window = estimate_market_window(aggregated)

    # Summary
    competitor_count = len(competitor)
    high_urgency = sum(1 for c in competitor if c.get("action_urgency") == "high")

    summary = {
        "category": category,
        "sub_trend": sub_trend,
        "overall_timing": timing.get("overall_verdict", "hold_observe"),
        "confidence": timing.get("overall_confidence", "low"),
        "signal_quality": aggregated.get("signals_quality", "minimal"),
        "total_signals": aggregated.get("combined_assessment", {}).get("signal_count", 0),
        "competitor_signals_found": competitor_count,
        "high_urgency_competitor_signals": high_urgency,
        "optimal_entry": window.get("optimal_entry_window", "unknown"),
    }

    return {
        "category": category,
        "sub_trend": sub_trend,
        "aggregated_signals": aggregated,
        "competitor_analysis": competitor,
        "timing_tiers": timing,
        "market_window": window,
        "summary": summary,
        "has_private_data": aggregated.get("has_private_data", False),
        "private_data_note": (
            ""
            if aggregated.get("has_private_data")
            else "Current assessment based on public signals only. Private leading indicators would improve confidence."
        ),
    }
