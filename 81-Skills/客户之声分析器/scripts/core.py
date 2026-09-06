"""
cbec-customer-voice-analyzer - Customer Voice Analyzer core logic.

Aggregates multi-platform feedback, labels by decision stage, builds competitor
VoC matrix, extracts pain point patterns, and routes insights to downstream skills.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

def check_sample_size(df, min_rows=30):
    """Check if data sample is sufficient for statistical inference."""
    from collections.abc import Sized
    actual = len(df) if isinstance(df, Sized) else 0
    return {
        'is_sufficient': actual >= min_rows,
        'actual_rows': actual,
        'min_required': min_rows,
        'message': (
            f'数据充足 ({actual} 行 >= {min_rows})'
            if actual >= min_rows else
            f'数据不足 ({actual} 行 < {min_rows} 行最低要求), 分析结论置信度降低'
        ),
    }


# ──────────────────────────────────────────────
# Decision Stage Keywords
# ──────────────────────────────────────────────

_STAGE_KEYWORDS: dict[str, list[str]] = {
    "cognitive_trigger": [
        "first time", "looking for", "need a", "considering", "researching",
        "any recommend", "推荐", "第一次", "想买", "求推荐", "最近想",
        "thinking about", "what to buy", "suggest", "recommendation",
        "should I get", "looking at", "interested in",
    ],
    "comparison_hesitation": [
        "vs", "versus", "compare", "difference", "犹豫", "对比", "不知道选",
        "纠结", "which one", "better than", "or", "between", "confused",
        "undecided", "deciding", "not sure", "price difference",
    ],
    "usage_friction": [
        "difficult", "hard to", "frustrating", "annoying", "uncomfortable",
        "painful", "heavy", "loud", "noisy", "bulky", "complicated",
        "不容易", "不好用", "麻烦", "不舒服", "太重", "太吵", "不好",
        "too much", "leak", "leaking", "broke", "broken", "issue",
        "problem", "doesn't work", "not working", "failed", "error",
    ],
    "value_confirmation": [
        "love", "amazing", "great", "perfect", "best", "happy", "worth",
        "recommend", "game changer", "life saver", "convenient",
        "满意", "很好", "推荐", "值得", "方便", "超好用", "惊喜",
        "highly recommend", "would buy again", "glad I bought",
    ],
    "churn_signal": [
        "return", "refund", "switched to", "moving to", "replaced with",
        "退货", "退款", "换了", "换成", "不如", "退了", "差评",
        "disappointed", "waste of", "regret", "not worth", "overpriced",
        "stopped using", "gave up", "switched away",
    ],
}

# Platform-specific source labels
_PLATFORM_NAMES = {
    "amazon": "Amazon Reviews",
    "reddit": "Reddit",
    "tiktok": "TikTok Comments",
    "youtube": "YouTube Comments",
    "facebook": "Facebook Groups",
    "shopify": "Shopify DTC Reviews",
    "qanda": "Amazon Q&A",
    "cs_ticket": "Customer Service Tickets",
}


# ──────────────────────────────────────────────
# Helper Functions
# ──────────────────────────────────────────────


def _detect_platform(source_key: str) -> str:
    """Normalize source key to platform name."""
    key = source_key.lower().strip()
    return _PLATFORM_NAMES.get(key, key.capitalize())


def _get_sentiment_score(text: str) -> float:
    """Rough sentiment score -1 to 1 based on keyword presence."""
    text_lower = text.lower()
    positive_words = [
        "love", "great", "amazing", "perfect", "best", "excellent", "wonderful",
        "happy", "satisfied", "方便", "很好", "满意", "超好用", "惊喜", "值得",
    ]
    negative_words = [
        "bad", "terrible", "awful", "poor", "hate", "worst", "disappointed",
        "frustrating", "annoying", "不好", "差", "麻烦", "太重", "太吵", "不值",
    ]
    pos_count = sum(1 for w in positive_words if w in text_lower)
    neg_count = sum(1 for w in negative_words if w in text_lower)
    total = pos_count + neg_count
    if total == 0:
        return 0.0
    return round((pos_count - neg_count) / total, 2)


# ──────────────────────────────────────────────
# Aggregate VoC Samples
# ──────────────────────────────────────────────


def aggregate_voc_samples(sources: dict) -> dict:
    """
    Normalize feedback from multiple platforms into uniform records.

    Each source entry should be a list of feedback records. Supported platforms
    include amazon, reddit, tiktok, youtube, facebook, shopify, qanda, cs_ticket.

    Args:
        sources: dict mapping platform name -> list of feedback dicts.
            Each feedback dict should have at minimum 'text', and optionally
            'rating', 'date', 'brand', 'author'.

    Returns:
        dict with:
            - 'total_samples': int
            - 'source_breakdown': dict[platform -> count]
            - 'records': list of normalized feedback dicts:
                - 'source': str
                - 'text': str
                - 'rating': float (normalized to 1-5)
                - 'date': str
                - 'brand': str
                - 'sentiment_score': float
    """
    if not sources:
        return {"total_samples": 0, "source_breakdown": {}, "records": []}

    records: list[dict] = []
    source_breakdown: dict[str, int] = {}

    for platform_key, feedback_list in sources.items():
        if not isinstance(feedback_list, list):
            continue
        platform_name = _detect_platform(platform_key)
        count = 0
        for item in feedback_list:
            if not item or not item.get("text"):
                continue
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            rating = float(item.get("rating", 0) or 0)
            # Normalize rating to 1-5 scale regardless of input format
            if rating > 5:
                rating = rating / 10 * 5  # Assume 1-10 scale
            rating = max(0, min(5, rating))

            sentiment = _get_sentiment_score(text)
            records.append({
                "source": platform_name,
                "text": text,
                "rating": round(rating, 1),
                "date": str(item.get("date", "")),
                "brand": str(item.get("brand", "unknown")),
                "sentiment_score": sentiment,
            })
            count += 1

        if count > 0:
            source_breakdown[platform_name] = count

    return {
        "total_samples": len(records),
        "source_breakdown": source_breakdown,
        "records": records,
    }


# ──────────────────────────────────────────────
# Label Decision Stage
# ──────────────────────────────────────────────


def label_decision_stage(feedback: dict | list[dict]) -> list[dict]:
    """
    Classify feedback records into decision journey stages.

    Stages: cognitive_trigger (awareness), comparison_hesitation (consideration),
    usage_friction (experience), value_confirmation (satisfaction),
    churn_signal (defection).

    Args:
        feedback: either a single dict or list of dicts with 'text' key.

    Returns:
        list of enriched feedback dicts with 'stage' and 'stage_details'.
    """
    if isinstance(feedback, dict):
        records = [feedback]
    else:
        records = feedback

    if not records:
        return []

    results: list[dict] = []
    for record in records:
        text = str(record.get("text", "")).lower()
        enriched = dict(record)

        # Score against each stage
        stage_scores: dict[str, int] = {}
        for stage, keywords in _STAGE_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in text)
            if score > 0:
                stage_scores[stage] = score

        if stage_scores:
            best_stage = max(stage_scores, key=lambda stage: stage_scores[stage])
            enriched["stage"] = best_stage
            enriched["stage_details"] = {
                "primary_stage": best_stage,
                "confidence": round(stage_scores[best_stage] / max(sum(stage_scores.values()), 1), 2),
                "all_stages": stage_scores,
            }
        else:
            enriched["stage"] = "unlabeled"
            enriched["stage_details"] = {
                "primary_stage": "unlabeled",
                "confidence": 0.0,
                "all_stages": {},
            }

        results.append(enriched)

    return results


# ──────────────────────────────────────────────
# Build Competitor VoC Matrix
# ──────────────────────────────────────────────


def build_competitor_voc_matrix(
    feedback: list[dict], brands: list[str], themes: list[str]
) -> dict:
    """
    Build a brand x theme matrix with sentiment scores.

    Cross-tabulates the specified brands and themes, computing aggregate
    sentiment and mention frequency for each cell.

    Args:
        feedback: list of labeled feedback dicts.
        brands: list of brand names to include (e.g., ['Momcozy', 'Elvie', 'Willow']).
        themes: list of theme keywords to analyze (e.g., ['noise', 'fit', 'clean']).

    Returns:
        dict with:
            - 'matrix': list of dicts (one per brand x theme):
                - 'brand': str
                - 'theme': str
                - 'mention_count': int
                - 'avg_sentiment': float
                - 'positive_pct': float
                - 'negative_pct': float
                - 'neutral_pct': float
            - 'brands_analyzed': list[str]
            - 'themes_analyzed': list[str]
            - 'total_mentions': int
            - 'common_pains': list[dict] — themes where ALL brands are negative
            - 'momcozy_advantages': list[str] — themes where Momcozy scores highest
    """
    if not feedback or not brands or not themes:
        return {
            "matrix": [],
            "brands_analyzed": brands or [],
            "themes_analyzed": themes or [],
            "total_mentions": 0,
            "common_pains": [],
            "momcozy_advantages": [],
        }

    # Build cells
    matrix: dict[tuple[str, str], dict] = {}
    for brand in brands:
        for theme in themes:
            # Find feedback mentioning this brand and theme
            mentions: list[float] = []
            for fb in feedback:
                text = str(fb.get("text", "")).lower()
                brand_in = brand.lower() in text
                theme_in = theme.lower() in text
                if brand_in and theme_in:
                    mentions.append(fb.get("sentiment_score", 0))

            if mentions:
                pos = sum(1 for s in mentions if s > 0.2)
                neg = sum(1 for s in mentions if s < -0.2)
                neu = len(mentions) - pos - neg
                matrix[(brand, theme)] = {
                    "mention_count": len(mentions),
                    "avg_sentiment": round(sum(mentions) / len(mentions), 2),
                    "positive_pct": round(pos / len(mentions) * 100, 1),
                    "negative_pct": round(neg / len(mentions) * 100, 1),
                    "neutral_pct": round(neu / len(mentions) * 100, 1),
                }

    # Convert to list
    matrix_list = [
        {
            "brand": brand,
            "theme": theme,
            "mention_count": matrix.get((brand, theme), {}).get("mention_count", 0),
            "avg_sentiment": matrix.get((brand, theme), {}).get("avg_sentiment", 0.0),
            "positive_pct": matrix.get((brand, theme), {}).get("positive_pct", 0.0),
            "negative_pct": matrix.get((brand, theme), {}).get("negative_pct", 0.0),
            "neutral_pct": matrix.get((brand, theme), {}).get("neutral_pct", 0.0),
        }
        for brand in brands
        for theme in themes
    ]

    total_mentions = sum(cell["mention_count"] for cell in matrix_list)

    # Common pains: themes where ALL brands have avg_sentiment < 0
    common_pains: list[dict] = []
    for theme in themes:
        brand_sents = {
            brand: matrix.get((brand, theme), {}).get("avg_sentiment", 0)
            for brand in brands
        }
        mentioned_sentiments = [
            sentiment
            for brand, sentiment in brand_sents.items()
            if matrix.get((brand, theme))
        ]
        all_negative = bool(mentioned_sentiments) and all(
            sentiment < 0 for sentiment in mentioned_sentiments
        )
        if all_negative:
            common_pains.append({
                "theme": theme,
                "brand_sentiments": brand_sents,
                "industry_opportunity": True,
            })

    # Momcozy advantages
    momcozy_advantages: list[str] = []
    if "Momcozy" in brands:
        for theme in themes:
            mom_sent = matrix.get(("Momcozy", theme), {}).get("avg_sentiment", 0)
            other_sents = [
                matrix.get((b, theme), {}).get("avg_sentiment", 0)
                for b in brands if b != "Momcozy" and matrix.get((b, theme))
            ]
            if mom_sent > 0 and other_sents and mom_sent >= max(other_sents):
                momcozy_advantages.append(theme)

    return {
        "matrix": matrix_list,
        "brands_analyzed": brands,
        "themes_analyzed": themes,
        "total_mentions": total_mentions,
        "common_pains": common_pains,
        "momcozy_advantages": momcozy_advantages,
    }


# ──────────────────────────────────────────────
# Extract Pain Point Patterns
# ──────────────────────────────────────────────


def extract_pain_point_patterns(
    feedback: list[dict], min_occurrence: int = 3
) -> list[dict]:
    """
    Find recurring pain patterns across feedback.

    Detects common negative themes by analyzing feedback texts for recurring
    complaint patterns at the phrase level.

    Args:
        feedback: list of labeled feedback dicts with 'text', 'stage', 'brand'.
        min_occurrence: minimum times a pattern must appear (default 3).

    Returns:
        list of pain pattern dicts sorted by intensity descending:
            - 'pattern': str (keyword/phrase)
            - 'stage': str (most common decision stage)
            - 'brands_affected': list[str]
            - 'occurrence_count': int
            - 'intensity': float (0-1)
            - 'suggested_fix': str
    """
    if not feedback:
        return []

    # Common patterns to look for
    pattern_map: dict[str, list[str]] = {
        "leak": ["leak", "leaking", "leaked", "漏", "漏奶", "漏水"],
        "noise": ["noisy", "loud", "noise", "吵", "噪音", "响"],
        "pain": ["painful", "pain", "hurt", "sore", "uncomfortable", "痛", "疼", "不舒服"],
        "fit": ["too big", "too small", "doesn't fit", "wrong size", "不合适", "太大", "太小"],
        "clean": ["hard to clean", "difficult to clean", "cleaning", "wash", "clean",
                  "难洗", "不好洗", "清洗"],
        "battery": ["battery", "charge", "dies", "charging", "电池", "续航", "充电"],
        "suction": ["suction", "weak", "not strong enough", "power", "吸力", "不够力"],
        "assembly": ["assembly", "assemble", "put together", "parts", "装", "组装"],
        "durability": ["broke", "broken", "stop working", "durability", "坏", "寿命", "耐用"],
        "price": ["too expensive", "overpriced", "not worth", "expensive", "贵", "不值"],
    }

    pattern_results: list[dict] = []
    for pattern_name, keywords in pattern_map.items():
        matches = []
        brands_found: set[str] = set()
        stages_found: list[str] = []

        for fb in feedback:
            text = str(fb.get("text", "")).lower()
            if any(kw in text for kw in keywords):
                matches.append(fb)
                brand = fb.get("brand", "")
                if brand and brand != "unknown":
                    brands_found.add(brand)
                stage = fb.get("stage", "")
                if stage:
                    stages_found.append(stage)

        if len(matches) >= min_occurrence:
            most_common_stage = Counter(stages_found).most_common(1)
            stage_label = most_common_stage[0][0] if most_common_stage else "unknown"
            sentiment_vals = [m.get("sentiment_score", 0) for m in matches]
            avg_sentiment = sum(sentiment_vals) / len(sentiment_vals) if sentiment_vals else 0
            intensity = round(min(1.0, abs(avg_sentiment) * 1.5 + len(matches) * 0.01), 2)

            # Suggest fix based on pattern
            suggested_fix = _suggest_fix(pattern_name)

            pattern_results.append({
                "pattern": pattern_name,
                "stage": stage_label,
                "brands_affected": sorted(brands_found),
                "occurrence_count": len(matches),
                "intensity": intensity,
                "avg_sentiment": round(avg_sentiment, 2),
                "suggested_fix": suggested_fix,
            })

    pattern_results.sort(key=lambda x: x["intensity"], reverse=True)
    return pattern_results


def _suggest_fix(pattern: str) -> str:
    """Map pain pattern to suggested fix."""
    fixes = {
        "leak": "Review seal design and flange fit. Consider anti-leak baffle or sizing guide improvement.",
        "noise": "Evaluate motor/bearing noise isolation. Consider vibration dampening materials.",
        "pain": "Review ergonomic design. Add cushioning or adjustable positioning features.",
        "fit": "Review sizing options. Consider expanding size range or adding adjustable components.",
        "clean": "Simplify disassembly design. Consider dishwasher-safe materials. Add cleaning guide to packaging.",
        "battery": "Upgrade battery capacity or add fast-charge support. Consider power-saving mode.",
        "suction": "Evaluate motor performance. Consider multiple suction levels or automatic adjustment.",
        "assembly": "Reduce part count. Improve snap-fit design. Add visual assembly instructions.",
        "durability": "Review stress points and material selection. Strengthen weak joints. Extend warranty.",
        "price": "Reassess value communication. Consider bundle options or entry-tier version.",
    }
    return fixes.get(pattern, "Investigate root cause. Consider design or process improvement.")


# ──────────────────────────────────────────────
# Route Insights to Skills
# ──────────────────────────────────────────────


def route_insights_to_skills(
    matrix: dict, patterns: list[dict]
) -> dict:
    """
    Map VoC findings to downstream skills for action.

    Routes pain patterns and competitive insights to appropriate CBEC skills:
    listing_optimization, product_design, competitive_strategy, customer_service.

    Args:
        matrix: dict from build_competitor_voc_matrix.
        patterns: list from extract_pain_point_patterns.

    Returns:
        dict with routing per downstream skill:
            - 'product_design': list[dict] — pain patterns for design team
            - 'listing_optimization': list[dict] — hesitation points for copy
            - 'competitive_strategy': list[dict] — industry gaps for strategy
            - 'customer_service': list[dict] — FAQ items for CS team
    """
    routing: dict[str, list[dict]] = {
        "product_design": [],
        "listing_optimization": [],
        "competitive_strategy": [],
        "customer_service": [],
    }

    # Route pain patterns
    for p in patterns:
        if p["stage"] in ("usage_friction",):
            routing["product_design"].append({
                "source": "pain_pattern",
                "pattern": p["pattern"],
                "intensity": p["intensity"],
                "suggested_fix": p["suggested_fix"],
            })
        elif p["stage"] in ("comparison_hesitation",):
            routing["listing_optimization"].append({
                "source": "pain_pattern",
                "pattern": p["pattern"],
                "concern": f"Customers hesitate due to {p['pattern']} concerns",
            })
        elif p["stage"] in ("churn_signal",):
            routing["competitive_strategy"].append({
                "source": "pain_pattern",
                "pattern": p["pattern"],
                "brands_affected": p["brands_affected"],
            })
        else:
            routing["customer_service"].append({
                "source": "pain_pattern",
                "pattern": p["pattern"],
                "stage": p["stage"],
                "suggested_fix": p["suggested_fix"],
            })

    # Route matrix insights
    for pain in matrix.get("common_pains", []):
        routing["competitive_strategy"].append({
            "source": "voc_matrix",
            "insight": f"Industry-wide pain on '{pain['theme']}' — all brands negative",
            "opportunity": True,
        })

    for advantage in matrix.get("momcozy_advantages", []):
        routing["listing_optimization"].append({
            "source": "voc_matrix",
            "insight": f"Momcozy advantage on '{advantage}' — use in copy",
            "differentiator": True,
        })

    return routing


# ──────────────────────────────────────────────
# Full Report
# ──────────────────────────────────────────────


def generate_voc_report(feedback: dict | list[dict], config: dict | None = None) -> dict:
    """
    Full VoC analysis pipeline.

    Pipeline:
        1. Aggregate multi-platform samples
        2. Label decision stages
        3. Build competitor VoC matrix
        4. Extract pain point patterns
        5. Route insights to skills

    Args:
        feedback: either a dict of {source: [records]} or a flat list of records.
        config: optional dict with:
            - 'brands': list[str] — brands to include in matrix
            - 'themes': list[str] — themes to analyze
            - 'min_occurrence': int — min occurrences for pain patterns

    Returns:
        dict with complete VoC analysis.
    """
    config = config or {}
    brands = config.get("brands", ["Momcozy", "Elvie", "Willow", "Medela", "Haakaa"])
    themes = config.get("themes", ["noise", "fit", "clean", "leak", "battery", "suction", "comfort", "durability", "price"])
    min_occurrence = config.get("min_occurrence", 3)

    # Step 1: Aggregate
    if isinstance(feedback, dict):
        aggregated = aggregate_voc_samples(feedback)
        records = aggregated["records"]
    elif isinstance(feedback, list):
        records = list(feedback)
        aggregated = {
            "total_samples": len(records),
            "source_breakdown": {"direct_input": len(records)},
            "records": records,
        }
    else:
        raise ValueError("feedback must be an array or source-to-array object")

    sample_check = check_sample_size(records, min_rows=30)

    # Step 2: Label stages
    labeled = label_decision_stage(records)

    # Step 3: Build matrix
    matrix = build_competitor_voc_matrix(labeled, brands, themes)

    # Step 4: Extract pain patterns
    patterns = extract_pain_point_patterns(labeled, min_occurrence)

    # Step 5: Route
    routing = route_insights_to_skills(matrix, patterns)

    # Summary
    stage_counts: dict[str, int] = {}
    for fb in labeled:
        stage = fb.get("stage", "unlabeled")
        stage_counts[stage] = stage_counts.get(stage, 0) + 1

    summary = {
        "total_samples": aggregated["total_samples"],
        "source_breakdown": aggregated["source_breakdown"],
        "stage_distribution": stage_counts,
        "top_pain_patterns": [p["pattern"] for p in patterns[:3]],
        "common_industry_pains": len(matrix.get("common_pains", [])),
        "momcozy_advantages": matrix.get("momcozy_advantages", []),
        "insights_routed": sum(len(v) for v in routing.values()),
        "sample_sufficiency": sample_check,
    }

    return {
        "aggregation": aggregated,
        "labeled_feedback": labeled,
        "competitor_voc_matrix": matrix,
        "pain_patterns": patterns,
        "routing": routing,
        "summary": summary,
        "config_used": {
            "brands": brands,
            "themes": themes,
            "min_occurrence": min_occurrence,
        },
    }


def _validate_feedback_record(record: object, location: str) -> None:
    if not isinstance(record, dict):
        raise ValueError(f"{location} must be an object")
    text = record.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"{location}.text must be a non-empty string")
    if "rating" in record:
        rating = record["rating"]
        if isinstance(rating, bool) or not isinstance(rating, (int, float)):
            raise ValueError(f"{location}.rating must be a number")
        if not 0 <= rating <= 10:
            raise ValueError(f"{location}.rating must be between 0 and 10")
    for field in ("date", "brand", "author"):
        if field in record and not isinstance(record[field], str):
            raise ValueError(f"{location}.{field} must be a string")


def _validate_process_input(params: object) -> tuple[dict | list[dict], dict]:
    if not isinstance(params, dict):
        raise ValueError("input must be an object")
    unknown = sorted(set(params) - {"feedback", "config"})
    if unknown:
        raise ValueError(f"unsupported input fields: {', '.join(unknown)}")
    if "feedback" not in params:
        raise ValueError("feedback is required")

    feedback = params["feedback"]
    if isinstance(feedback, list):
        for index, record in enumerate(feedback):
            _validate_feedback_record(record, f"feedback[{index}]")
    elif isinstance(feedback, dict):
        for source, records in feedback.items():
            if not isinstance(records, list):
                raise ValueError(f"feedback.{source} must be an array")
            for index, record in enumerate(records):
                _validate_feedback_record(record, f"feedback.{source}[{index}]")
    else:
        raise ValueError("feedback must be an array or source-to-array object")

    config = params.get("config", {})
    if not isinstance(config, dict):
        raise ValueError("config must be an object")
    unknown_config = sorted(set(config) - {"brands", "themes", "min_occurrence"})
    if unknown_config:
        raise ValueError(
            f"unsupported config fields: {', '.join(unknown_config)}"
        )
    for field in ("brands", "themes"):
        if field not in config:
            continue
        values = config[field]
        if (
            not isinstance(values, list)
            or not values
            or any(not isinstance(value, str) or not value for value in values)
        ):
            raise ValueError(f"config.{field} must be a non-empty string array")
    if "min_occurrence" in config:
        min_occurrence = config["min_occurrence"]
        if (
            isinstance(min_occurrence, bool)
            or not isinstance(min_occurrence, int)
            or min_occurrence < 1
        ):
            raise ValueError("config.min_occurrence must be an integer >= 1")

    return feedback, config


def process(params: dict) -> dict:
    """Validate the typed contract and run the deterministic VoC pipeline."""
    feedback, config = _validate_process_input(params)
    return generate_voc_report(feedback, config)
