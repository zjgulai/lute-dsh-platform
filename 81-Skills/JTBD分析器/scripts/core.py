#!/usr/bin/env python3

"""
JTBD Analyzer - Jobs-to-be-Done 分析核心逻辑

从用户评价/访谈中提取任务、购买标准、切换触发因素，计算机会矩阵并生成报告。
"""

from __future__ import annotations

import csv
import json
import math
import re
from pathlib import Path
from typing import Any

def _check_sample_size(data: dict, min_rows: int = 30) -> dict:
    """Check if sample size is sufficient for analysis."""
    items = data.get("data", [])
    actual = len(items) if isinstance(items, list) else 0
    return {
        "is_sufficient": actual >= min_rows,
        "actual_rows": actual,
        "min_required": min_rows,
    }


# ──────────────────────────────────────────────
# Default JTBD Categories
# ──────────────────────────────────────────────

JTBD_CATEGORIES: dict[str, list[str]] = {
    "functional": [
        "use",
        "function",
        "work",
        "perform",
        "操作",
        "使用",
        "功能",
        "运行",
        "效果",
        "性能",
        "performance",
        "operate",
        "task",
        "完成",
        "方便",
        "快捷",
        "speed",
        "fast",
        "slow",
        "efficient",
    ],
    "emotional": [
        "feel",
        "happy",
        "safe",
        "worried",
        "confident",
        "感觉",
        "开心",
        "安心",
        "焦虑",
        "放心",
        "满意",
        "满意",
        "喜欢",
        "喜欢",
        "frustrated",
        "annoyed",
        "delight",
        "disappointed",
        "relief",
        "trust",
    ],
    "social": [
        "social",
        "friends",
        "family",
        "impress",
        "status",
        "别人",
        "朋友",
        "家人",
        "同事",
        "推荐",
        "分享",
        "面子",
        "品味",
        "reputation",
        "recommend",
        "share",
        "trendy",
        "fashion",
        "professional",
        "image",
        "identity",
    ],
    "consumption_chain": [
        "buy",
        "install",
        "maintain",
        "dispose",
        "store",
        "购买",
        "收货",
        "安装",
        "维护",
        "处理",
        "退换",
        "开箱",
        "设置",
        "setup",
        "unbox",
        "purchase",
        "delivery",
        "shipping",
        "return",
        "replace",
        "clean",
        "storage",
    ],
}


# ──────────────────────────────────────────────
# Job Extraction
# ──────────────────────────────────────────────


def _map_to_category_keyword(text: str, categories: dict[str, list[str]]) -> list[tuple[str, str, str]]:
    """
    Map text phrases to JTBD categories.

    Returns list of (category, matched_word, context_snippet) tuples.
    """
    text_lower = text.lower()
    results: list[tuple[str, str, str]] = []

    for category, keywords in categories.items():
        for kw in keywords:
            if kw in text_lower:
                # Grab context around the match
                idx = text_lower.index(kw)
                start = max(0, idx - 30)
                end = min(len(text), idx + len(kw) + 30)
                snippet = text[start:end].strip()
                results.append((category, kw, snippet))

    return results


def _categorize_job_type(category: str) -> str:
    """Map internal category name to job type label."""
    mapping = {
        "functional": "functional_job",
        "emotional": "emotional_job",
        "social": "social_job",
        "consumption_chain": "consumption_chain",
    }
    return mapping.get(category, "functional_job")


def extract_jobs_from_reviews(
    reviews: list[str],
    jtbd_categories: dict[str, list[str]] | None = None,
) -> list[dict]:
    """
    Extract JTBD job statements from review/feedback text.

    Parses each review and maps phrases to JTBD categories: functional_job,
    emotional_job, social_job, consumption_chain.

    Args:
        reviews: list of review text strings
        jtbd_categories: optional custom category -> keywords mapping.
                         Defaults to JTBD_CATEGORIES (supports English and Chinese).

    Returns:
        list of job dicts with:
            - 'job_type': str
            - 'category': str
            - 'matched_phrase': str
            - 'context': str (surrounding text snippet)
            - 'evidence_level': str ('direct' | 'inferred')
            - 'frequency': int (how many reviews matched this job)
    """
    categories = jtbd_categories or JTBD_CATEGORIES

    # Collect all matches
    match_records: list[dict] = []
    for review in reviews:
        if not review or not review.strip():
            continue

        matches = _map_to_category_keyword(review, categories)
        for cat, kw, snippet in matches:
            job_type = _categorize_job_type(cat)
            match_records.append({
                "job_type": job_type,
                "category": cat,
                "matched_phrase": kw,
                "context": snippet,
                "evidence_level": "direct",
            })

    # Deduplicate and aggregate by job_type + category
    job_map: dict[tuple[str, str], dict] = {}
    for record in match_records:
        key = (record["job_type"], record["category"])
        if key not in job_map:
            job_map[key] = {
                "job_type": record["job_type"],
                "category": record["category"],
                "contexts": [],
                "frequency": 0,
                "matched_phrases": set(),
                "evidence_level": "direct",
            }
        job_map[key]["frequency"] += 1
        job_map[key]["matched_phrases"].add(record["matched_phrase"])
        if record["context"] not in job_map[key]["contexts"]:
            job_map[key]["contexts"].append(record["context"])

    # Build result
    result = []
    for key, job in job_map.items():
        result.append({
            "job_type": job["job_type"],
            "category": job["category"],
            "frequency": job["frequency"],
            "unique_mentions": len(job["matched_phrases"]),
            "sample_contexts": job["contexts"][:3],
            "matched_phrases": sorted(job["matched_phrases"]),
            "evidence_level": job["evidence_level"],
        })

    # Sort by frequency descending
    result.sort(key=lambda x: x["frequency"], reverse=True)
    return result


# ──────────────────────────────────────────────
# Hiring Criteria
# ──────────────────────────────────────────────


_HIRING_CRITERIA_KEYWORDS = {
    "price": [
        "price",
        "cost",
        "cheap",
        "expensive",
        "affordable",
        "value",
        "worth",
        "价格",
        "便宜",
        "贵",
        "划算",
        "性价比",
        "budget",
    ],
    "quality": [
        "quality",
        "durable",
        "reliable",
        "built",
        "material",
        "sturdy",
        "strong",
        "quality",
        "质量",
        "耐用",
        "牢固",
        "材质",
        "做工",
        "craftsmanship",
    ],
    "convenience": [
        "convenient",
        "easy",
        "simple",
        "quick",
        "fast",
        "方便",
        "简单",
        "快捷",
        "省事",
        "轻松",
        "portable",
        "lightweight",
    ],
    "brand": [
        "brand",
        "trust",
        "reputation",
        "famous",
        "popular",
        "known",
        "品牌",
        "信任",
        "口碑",
        "知名",
        "大牌",
        "reputable",
    ],
    "features": [
        "feature",
        "function",
        "capability",
        "spec",
        "option",
        "mode",
        "setting",
        "功能",
        "特点",
        "特性",
        "参数",
        "规格",
        "模式",
        "选项",
        "support",
    ],
}


def identify_hiring_criteria(jobs: list[dict], reviews: list[str]) -> dict:
    """
    Identify what criteria customers use to 'hire' a product.

    Analyzes review text against common hiring criteria: price, quality,
    convenience, brand, features.

    Args:
        jobs: list of job dicts from extract_jobs_from_reviews
        reviews: original review text list for full-text analysis

    Returns:
        dict with:
            - 'criteria': list[dict] per criterion with frequency and evidence
            - 'top_criteria': list[str] ranked by importance
            - 'recommendation': str
    """
    # Aggregate review text
    all_text = " ".join(reviews).lower()

    criteria_results: list[dict] = []
    for criterion, keywords in _HIRING_CRITERIA_KEYWORDS.items():
        frequency = 0
        evidence_phrases: list[str] = []

        for kw in keywords:
            count = all_text.count(kw)
            if count > 0:
                frequency += count
                # Extract context
                idx = all_text.index(kw)
                start = max(0, idx - 25)
                end = min(len(all_text), idx + len(kw) + 25)
                snippet = all_text[start:end].strip()
                if snippet not in evidence_phrases:
                    evidence_phrases.append(snippet)

        criteria_results.append({
            "name": criterion,
            "frequency": frequency,
            "evidence_samples": evidence_phrases[:3],
        })

    # Sort by frequency
    criteria_results.sort(key=lambda x: x["frequency"], reverse=True)
    top_criteria = [c["name"] for c in criteria_results if c["frequency"] > 0][:3]

    recommendation = ""
    if criteria_results:
        primary = criteria_results[0]["name"] if criteria_results else "unknown"
        if primary == "price":
            recommendation = "Customers primarily hire on price. Consider competitive pricing or value-add positioning."
        elif primary == "quality":
            recommendation = "Customers prioritize quality. Focus communication on durability and craftsmanship."
        elif primary == "convenience":
            recommendation = "Customers hire for convenience. Emphasize ease of use and time savings."
        elif primary == "brand":
            recommendation = "Brand trust is the primary hiring criterion. Invest in brand building and social proof."
        elif primary == "features":
            recommendation = "Features drive the hiring decision. Highlight unique capabilities in messaging."

    return {
        "criteria": criteria_results,
        "top_criteria": top_criteria,
        "recommendation": recommendation,
    }


# ──────────────────────────────────────────────
# Switching Triggers
# ──────────────────────────────────────────────

_SWITCH_PUSH_KEYWORDS = [
    "not",
    "but",
    "however",
    "unfortunately",
    "disappointed",
    "frustrated",
    "broken",
    "failed",
    "stop",
    "quit",
    "不再",
    "但是",
    "可惜",
    "失望",
    "坏",
    "不行",
    "差",
    "差劲",
    "受不了",
    "难以",
    "困难",
    "问题",
    "issue",
    "problem",
    "difficult",
    "hard to",
    "waste",
    "disappoint",
]

_SWITCH_PULL_KEYWORDS = [
    "switched",
    "switching",
    "better than",
    "upgrade",
    "improve",
    "recommend",
    "love",
    "perfect",
    "amazing",
    "终于",
    "换",
    "换成",
    "比",
    "更好",
    "升级",
    "推荐",
    "惊艳",
    "完美",
    "impress",
    "game changer",
    "huge difference",
    "never going back",
]


def identify_switching_triggers(reviews: list[str]) -> list[dict]:
    """
    Identify push factors (dissatisfaction) and pull factors (attraction) driving
    customer switching behavior.

    Args:
        reviews: list of review text strings

    Returns:
        list of trigger dicts with:
            - 'trigger_type': 'push' | 'pull'
            - 'matched_phrase': str
            - 'context': str
            - 'intensity': float (0-1, based on emotional language density)
    """
    triggers: list[dict] = []

    for review in reviews:
        if not review.strip():
            continue

        text_lower = review.lower()

        # Push factors
        push_matches = []
        for kw in _SWITCH_PUSH_KEYWORDS:
            if kw in text_lower:
                idx = text_lower.index(kw)
                start = max(0, idx - 40)
                end = min(len(review), idx + len(kw) + 40)
                snippet = review[start:end].strip()
                push_matches.append(kw)

        if push_matches:
            triggers.append({
                "trigger_type": "push",
                "matched_phrases": push_matches[:3],
                "context": review[:200],
                "intensity": round(min(1.0, len(push_matches) * 0.15), 2),
            })

        # Pull factors
        pull_matches = []
        for kw in _SWITCH_PULL_KEYWORDS:
            if kw in text_lower:
                idx = text_lower.index(kw)
                start = max(0, idx - 40)
                end = min(len(review), idx + len(kw) + 40)
                snippet = review[start:end].strip()
                pull_matches.append(kw)

        if pull_matches:
            triggers.append({
                "trigger_type": "pull",
                "matched_phrases": pull_matches[:3],
                "context": review[:200],
                "intensity": round(min(1.0, len(pull_matches) * 0.15), 2),
            })

    # Deduplicate similar contexts
    seen_contexts: set[str] = set()
    deduped: list[dict] = []
    for t in triggers:
        context_key = t["context"][:100]
        if context_key not in seen_contexts:
            seen_contexts.add(context_key)
            deduped.append(t)

    # Sort by intensity descending
    deduped.sort(key=lambda x: x["intensity"], reverse=True)

    return deduped


# ──────────────────────────────────────────────
# Opportunity Matrix
# ──────────────────────────────────────────────

_JOB_IMPORTANCE_SIGNALS = {
    "high": ["very", "extremely", "always", "constantly", "every", "必须", "每次", "总是", "非常"],
    "low": ["sometimes", "occasionally", "偶尔", "有时"],
}

_JOB_SATISFACTION_SIGNALS = {
    "high": ["great", "perfect", "amazing", "love", "满意", "很好", "完美", "方便"],
    "low": ["bad", "poor", "difficult", "frustrating", "terrible", "差", "不好", "困难", "麻烦"],
}


def _estimate_job_importance(job: dict, reviews: list[str]) -> float:
    """Estimate job importance (0-1) based on frequency and language signals."""
    # Base: frequency relative to total reviews
    base_importance = min(1.0, job["frequency"] / max(len(reviews), 1) * 2)

    # Boost from language signals
    job_contexts = " ".join(job.get("sample_contexts", []))
    for signal_name, signals in _JOB_IMPORTANCE_SIGNALS.items():
        if signal_name == "high":
            for s in signals:
                if s in job_contexts:
                    base_importance = min(1.0, base_importance + 0.1)

    return round(base_importance, 2)


def _estimate_job_satisfaction(job: dict, reviews: list[str]) -> float:
    """Estimate current satisfaction level (0-1) for this job."""
    # Default: moderate satisfaction
    satisfaction = 0.5

    job_contexts = " ".join(job.get("sample_contexts", []))
    high_count = 0
    low_count = 0

    for s in _JOB_SATISFACTION_SIGNALS["high"]:
        if s in job_contexts:
            high_count += 1

    for s in _JOB_SATISFACTION_SIGNALS["low"]:
        if s in job_contexts:
            low_count += 1

    if high_count > low_count:
        satisfaction = 0.7 + (high_count - low_count) * 0.05
    elif low_count > high_count:
        satisfaction = 0.3 - (low_count - high_count) * 0.05

    return round(max(0.0, min(1.0, satisfaction)), 2)


def score_opportunity_matrix(
    jobs: list[dict],
    importance_weight: float = 0.6,
    satisfaction_weight: float = 0.4,
) -> list[dict]:
    """
    Calculate the JTBD opportunity matrix.

    Underserved jobs = high importance + low satisfaction -> high opportunity score.
    Formula: Opportunity = Importance + max(Importance - Satisfaction, 0)

    Args:
        jobs: list of job dicts from extract_jobs_from_reviews
        importance_weight: weight for importance in the opportunity formula (default 0.6)
        satisfaction_weight: weight for satisfaction in the opportunity formula (default 0.4)

    Returns:
        list of opportunity dicts sorted by opportunity_score descending:
            - 'job_type': str
            - 'category': str
            - 'importance': float (0-1)
            - 'satisfaction': float (0-1)
            - 'opportunity_score': float (0-2)
            - 'priority': str (High / Medium / Low)
    """
    opportunities: list[dict] = []

    for job in jobs:
        importance = _estimate_job_importance(job, [])
        satisfaction = _estimate_job_satisfaction(job, [])

        # JTBD opportunity algorithm
        gap = max(importance - satisfaction, 0)
        opportunity_score = importance * importance_weight + gap * satisfaction_weight

        opportunity_score = round(min(2.0, opportunity_score), 3)

        if opportunity_score >= 1.2:
            priority = "High"
        elif opportunity_score >= 0.7:
            priority = "Medium"
        else:
            priority = "Low"

        opportunities.append({
            "job_type": job["job_type"],
            "category": job["category"],
            "frequency": job["frequency"],
            "importance": importance,
            "satisfaction": satisfaction,
            "gap": round(gap, 2),
            "opportunity_score": opportunity_score,
            "priority": priority,
        })

    opportunities.sort(key=lambda x: x["opportunity_score"], reverse=True)
    return opportunities


# ──────────────────────────────────────────────
# Full JTBD Report
# ──────────────────────────────────────────────


def generate_jtbd_report(reviews: list[str], config: dict | None = None) -> dict:
    """
    Full JTBD analysis pipeline.

    Pipeline:
        1. Extract jobs from reviews
        2. Identify hiring criteria
        3. Identify switching triggers
        4. Score opportunity matrix
        5. Generate summary with key insights

    Args:
        reviews: list of review text strings
        config: optional dict with:
            - 'jtbd_categories': custom category keywords
            - 'importance_weight': float (default 0.6)
            - 'satisfaction_weight': float (default 0.4)
            - 'min_reviews': int (default 30)

    Returns:
        dict with complete JTBD analysis results
    """
    config = config or {}
    jtbd_categories = config.get("jtbd_categories")
    importance_weight = config.get("importance_weight", 0.6)
    satisfaction_weight = config.get("satisfaction_weight", 0.4)
    min_reviews = config.get("min_reviews", 30)

    # Sample size check
    sample_check = _check_sample_size({"data": reviews}, min_rows=min_reviews)

    # 1. Extract jobs
    jobs = extract_jobs_from_reviews(reviews, jtbd_categories)

    # 2. Hiring criteria
    criteria = identify_hiring_criteria(jobs, reviews)

    # 3. Switching triggers
    triggers = identify_switching_triggers(reviews)

    # 4. Opportunity matrix
    opportunities = score_opportunity_matrix(jobs, importance_weight, satisfaction_weight)

    # 5. Summary
    high_priority_opps = [o for o in opportunities if o["priority"] == "High"]
    medium_priority_opps = [o for o in opportunities if o["priority"] == "Medium"]

    summary = {
        "total_reviews_analyzed": len(reviews),
        "total_jobs_identified": len(jobs),
        "high_priority_opportunities": len(high_priority_opps),
        "medium_priority_opportunities": len(medium_priority_opps),
        "sample_sufficiency": sample_check,
        "top_hiring_criteria": criteria.get("top_criteria", []),
        "top_opportunity": opportunities[0] if opportunities else None,
        "key_insight": _generate_key_insight(criteria, opportunities, triggers),
    }

    return {
        "reviews_analyzed": len(reviews),
        "jobs": jobs,
        "hiring_criteria": criteria,
        "switching_triggers": {
            "total": len(triggers),
            "push_count": sum(1 for t in triggers if t["trigger_type"] == "push"),
            "pull_count": sum(1 for t in triggers if t["trigger_type"] == "pull"),
            "triggers": triggers[:10],
        },
        "opportunity_matrix": opportunities,
        "summary": summary,
        "config_used": {
            "importance_weight": importance_weight,
            "satisfaction_weight": satisfaction_weight,
            "min_reviews": min_reviews,
        },
    }


def _generate_key_insight(criteria: dict, opportunities: list[dict], triggers: list[dict]) -> str:
    """Generate a single key insight sentence from the analysis."""
    parts: list[str] = []
    top_opp = opportunities[0] if opportunities else None
    top_criteria = criteria.get("top_criteria", [])
    push_count = sum(1 for t in triggers if t["trigger_type"] == "push")
    pull_count = sum(1 for t in triggers if t["trigger_type"] == "pull")

    if top_opp:
        parts.append(
            f"Primary opportunity in {top_opp['category']} jobs "
            f"(importance: {top_opp['importance']:.2f}, satisfaction: {top_opp['satisfaction']:.2f})"
        )

    if top_criteria:
        parts.append(f"Customers hire based on: {', '.join(top_criteria)}")

    if push_count > 0 or pull_count > 0:
        parts.append(f"Detected {push_count} push factors and {pull_count} pull factors driving switching")

    return " | ".join(parts) if parts else "Analysis completed. Consider adding more data for deeper insights."
