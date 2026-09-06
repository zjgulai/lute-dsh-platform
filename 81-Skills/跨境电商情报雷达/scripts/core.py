"""
cbec-intelligence-radar - Intelligence Radar core logic.

Classifies items by role, scores hot skills across 5 dimensions, generates
structured briefings, deduplicates against archive, and produces daily/weekly
intelligence briefs.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any


# ──────────────────────────────────────────────
# Role Taxonomy
# ──────────────────────────────────────────────

_ROLE_TAXONOMY: dict[str, dict] = {
    "sales_operations": {
        "keywords": ["listing", "keyword", "ppc", "advertising", "campaign", "buy box",
                     "listing", "关键词", "广告", "竞价"],
        "label": "Sales Operations",
    },
    "data_insights": {
        "keywords": ["analytics", "data", "analysis", "insight", "research", "market research",
                     "选品", "分析", "评论", "趋势", "数据"],
        "label": "Data Insights",
    },
    "product_planning": {
        "keywords": ["product design", "tech pack", "concept", "sku", "category",
                     "概念设计", "tech pack", "品类"],
        "label": "Product Planning",
    },
    "brand_marketing": {
        "keywords": ["content", "copy", "social media", "brand", "a+ content",
                     "文案", "社媒", "品牌", "营销"],
        "label": "Brand Marketing",
    },
    "supply_chain": {
        "keywords": ["inventory", "supplier", "logistics", "fba", "warehouse",
                     "库存", "供应商", "物流", "仓储"],
        "label": "Supply Chain",
    },
    "gtm": {
        "keywords": ["go-to-market", "launch", "icp", "channel", "outreach",
                     "上市", "推广", "渠道"],
        "label": "GTM",
    },
}


def _detect_role(name: str, description: str = "") -> str:
    """Detect the most likely role for an item based on name and description."""
    text = (name + " " + description).lower()
    best_role = "data_insights"  # Default
    best_score = 0

    for role_id, role_info in _ROLE_TAXONOMY.items():
        score = sum(1 for kw in role_info["keywords"] if kw in text)
        if score > best_score:
            best_score = score
            best_role = role_id

    return best_role


# ──────────────────────────────────────────────
# Classify by Role
# ──────────────────────────────────────────────


def classify_by_role(items: list[dict], taxonomy: dict | None = None) -> dict:
    """
    Assign items to one of 6 role categories.

    Roles: sales_operations, data_insights, product_planning, brand_marketing,
    supply_chain, gtm.

    Args:
        items: list of item dicts. Each should have at minimum 'name' and
               optionally 'description', 'type'.
        taxonomy: optional custom role taxonomy dict. Defaults to built-in.

    Returns:
        dict with role keys, each containing:
            - 'label': str
            - 'count': int
            - 'items': list of classified item dicts (with 'classified_role' added)
            - 'no_classification': True if empty
    """
    tax = taxonomy or _ROLE_TAXONOMY
    if not items:
        return {
            role_id: {"label": info["label"], "count": 0, "items": []}
            for role_id, info in tax.items()
        }

    # Also track unclassified
    classified: dict[str, list[dict]] = {
        role_id: [] for role_id in tax
    }

    for item in items:
        name = item.get("name", "")
        description = item.get("description", "")
        role = _detect_role(name, description)
        enriched = dict(item)
        enriched["classified_role"] = role
        enriched["classified_role_label"] = tax.get(role, {}).get("label", role)
        classified[role].append(enriched)

    result: dict[str, dict] = {}
    for role_id, role_info in tax.items():
        role_items = classified[role_id]
        result[role_id] = {
            "label": role_info["label"],
            "count": len(role_items),
            "items": role_items,
        }

    return result


# ──────────────────────────────────────────────
# Score Hot Skills
# ──────────────────────────────────────────────


def score_hot_skills(skills: list[dict]) -> dict:
    """
    Score skills on 5 dimensions for "hotness" ranking.

    Dimensions:
        - update_freshness: +5 (recent update within 3 days)
        - star_growth: +4 (star growth exceeds 2x average)
        - community_heat: +3 (mentioned across 3+ platforms)
        - case_study: +3 (quantified efficiency improvement)
        - platform_rank: +3 (listed on ProductHunt/SkillsMP)

    Maximum theoretical score: 18.

    Args:
        skills: list of skill dicts. Each should have:
            - 'name': str
            - 'last_updated': str (date)
            - 'star_growth_pct': float
            - 'platform_mentions': int
            - 'has_case_study': bool
            - 'platform_listed': bool

    Returns:
        dict with:
            - 'scored': list[dict] sorted by total_score descending
            - 'scores': dict with per-dimension totals
            - 'top_hot_skills': list of top 3 skill names
    """
    if not skills:
        return {
            "scored": [],
            "scores": {
                "update_freshness": 0, "star_growth": 0, "community_heat": 0,
                "case_study": 0, "platform_rank": 0, "total_possible": 18,
            },
            "top_hot_skills": [],
        }

    today = datetime.now()
    scored: list[dict] = []

    for skill in skills:
        score = 0
        reasons: list[str] = []

        # D1: Update freshness (+5)
        last_updated = skill.get("last_updated", "")
        if last_updated:
            try:
                update_date = datetime.strptime(last_updated, "%Y-%m-%d")
                days_since = (today - update_date).days
                if days_since <= 3:
                    score += 5
                    reasons.append(f"Updated {days_since}d ago (+5)")
            except (ValueError, TypeError):
                pass

        # D2: Star growth (+4)
        star_growth = skill.get("star_growth_pct", 0)
        if isinstance(star_growth, (int, float)) and star_growth >= 200:
            score += 4
            reasons.append(f"Star growth {star_growth:.0f}% (+4)")

        # D3: Community heat (+3)
        mentions = skill.get("platform_mentions", 0)
        if mentions >= 3:
            score += 3
            reasons.append(f"Mentioned on {mentions} platforms (+3)")

        # D4: Case study (+3)
        if skill.get("has_case_study"):
            score += 3
            reasons.append("Case study available (+3)")

        # D5: Platform rank (+3)
        if skill.get("platform_listed"):
            score += 3
            reasons.append("Platform listed (+3)")

        scored.append({
            "name": skill.get("name", "unknown"),
            "description": skill.get("description", ""),
            "total_score": score,
            "reasons": reasons,
            "dimensions": {
                "update_freshness": 5 if "Updated" in str(reasons) else 0,
                "star_growth": 4 if "Star" in str(reasons) else 0,
                "community_heat": 3 if "platform" in str(reasons) else 0,
                "case_study": 3 if "Case" in str(reasons) else 0,
                "platform_rank": 3 if "Platform" in str(reasons) else 0,
            },
        })

    scored.sort(key=lambda x: x["total_score"], reverse=True)
    top_hot_skills = [s["name"] for s in scored[:3]]

    dim_totals: dict[str, int] = {
        "update_freshness": sum(s["dimensions"]["update_freshness"] for s in scored),
        "star_growth": sum(s["dimensions"]["star_growth"] for s in scored),
        "community_heat": sum(s["dimensions"]["community_heat"] for s in scored),
        "case_study": sum(s["dimensions"]["case_study"] for s in scored),
        "platform_rank": sum(s["dimensions"]["platform_rank"] for s in scored),
        "total_possible": 18,
    }

    return {
        "scored": scored,
        "scores": dim_totals,
        "top_hot_skills": top_hot_skills,
    }


# ──────────────────────────────────────────────
# Generate Briefing
# ──────────────────────────────────────────────


def generate_briefing(data: dict, template_type: str = "daily") -> str:
    """
    Generate a 7-section markdown intelligence briefing.

    Sections: header, today_hot, by_role, trends, signals, archive, footer.

    Args:
        data: dict containing briefing data with keys:
            - 'date': str
            - 'top_hot_skills': list
            - 'scored_skills': list
            - 'by_role': dict (from classify_by_role)
            - 'trends': list
            - 'signals': list
            - 'archive_count': int
            - 'keywords': list
        template_type: 'daily' or 'weekly'.

    Returns:
        str: formatted markdown briefing.
    """

    date_str = data.get("date", datetime.now().strftime("%Y-%m-%d"))
    briefing_type = "Daily" if template_type == "daily" else "Weekly"
    hot_skills = data.get("top_hot_skills", [])
    scored = data.get("scored_skills", data.get("hot_scores", {}).get("scored", []))
    by_role = data.get("by_role", {})
    trends = data.get("trends", [])
    signals = data.get("signals", [])
    archive_count = data.get("archive_count", 0)
    keywords = data.get("keywords", [])

    lines: list[str] = []
    lines.append(f"# Cross-Border Claude Skills {briefing_type} Briefing")
    lines.append(f"**Date**: {date_str} | **Type**: {briefing_type} | "
                 f"**Focus**: Cross-Border E-Commerce")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Section 1: Today's Hot
    lines.append("## Today's Hot Skills")
    lines.append("")
    if hot_skills:
        for rank, skill_name in enumerate(hot_skills, 1):
            skill_info = next(
                (s for s in scored if s.get("name") == skill_name),
                {"total_score": 0, "reasons": []}
            )
            lines.append(f"### {rank}. {skill_name}")
            lines.append(f"   **Score**: {skill_info.get('total_score', 0)}/18")
            for reason in skill_info.get("reasons", []):
                lines.append(f"   - {reason}")
            lines.append("")
    else:
        lines.append("No hot skills detected in this period.")
        lines.append("")

    # Section 2: By Role
    lines.append("## Role-Specific Dynamics")
    lines.append("")
    for role_id, role_data in by_role.items():
        label = role_data.get("label", role_id)
        count = role_data.get("count", 0)
        if count == 0:
            lines.append(f"### {label}")
            lines.append("(No updates in this period)")
            lines.append("")
        else:
            lines.append(f"### {label} ({count} items)")
            for item in role_data.get("items", [])[:5]:
                item_name = item.get("name", item.get("title", "?"))
                desc = item.get("description", "")
                lines.append(f"- **{item_name}**: {desc[:100]}")
            lines.append("")

    # Section 3: Trends
    lines.append("## Emerging Trends")
    lines.append("")
    if trends:
        for trend in trends[:5]:
            lines.append(f"- {trend}")
    else:
        lines.append("No significant trends detected in this period.")
    lines.append("")

    # Section 4: Signals & Risks
    lines.append("## Signals & Risks")
    lines.append("")
    if signals:
        for signal in signals[:5]:
            lines.append(f"- {signal}")
    else:
        lines.append("No notable signals.")
    lines.append("")

    # Section 5: Archive
    lines.append("## Archive")
    lines.append("")
    lines.append(f"- {archive_count} items in archive")
    lines.append(f"- Freshness threshold: last 7 days")
    lines.append("")

    # Section 6: Footer
    lines.append("---")
    lines.append("")
    lines.append("### Retrieval Keywords")
    lines.append("")
    if keywords:
        lines.append(f"Keywords: {', '.join(keywords)}")
    else:
        lines.append("Keywords: cross-border e-commerce, claude skills, intelligence radar")
    lines.append("")
    lines.append("### Limitations")
    lines.append("- Data sources: as specified in search strategy")
    lines.append("- Dynamic age: > 7 days considered stale")
    lines.append("- Auto-generated, may miss context-specific signals")
    lines.append("")

    return "\n".join(lines)


# ──────────────────────────────────────────────
# Dedup and Freshness
# ──────────────────────────────────────────────


def apply_dedup_and_freshness(
    items: list[dict], existing_archive: list[dict] | None = None
) -> list[dict]:
    """
    Deduplicate items against an existing archive and check freshness.

    Uses name-based dedup with a 7-day freshness threshold.

    Args:
        items: new items to filter. Each should have 'name' and optionally
               'date' or 'last_updated'.
        existing_archive: list of archived item dicts with at least 'name'.

    Returns:
        list of deduplicated, fresh-only items.
    """
    if not items:
        return []

    archive = existing_archive or []
    archive_names: set[str] = set()
    for a in archive:
        name = a.get("name", "").strip().lower()
        if name:
            archive_names.add(name)

    today = datetime.now()
    fresh_threshold_days = 7
    fresh_items: list[dict] = []

    for item in items:
        name = item.get("name", "").strip().lower()
        if not name:
            continue

        # Dedup check
        if name in archive_names:
            continue

        # Freshness check
        date_str = item.get("date", item.get("last_updated", ""))
        if date_str:
            try:
                item_date = datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
                days_old = (today - item_date).days
                if days_old > fresh_threshold_days:
                    continue  # Stale
            except (ValueError, TypeError):
                pass  # No date = assume fresh

        fresh_items.append(item)
        archive_names.add(name)  # Prevent duplicate in same batch

    return fresh_items


# ──────────────────────────────────────────────
# Generate Intelligence Brief
# ──────────────────────────────────────────────


def generate_intelligence_brief(
    sources: dict | None = None,
    config: dict | None = None,
) -> dict:
    """
    Full intelligence briefing pipeline.

    Pipeline:
        1. De-duplicate and freshness filter
        2. Classify by role
        3. Score hot skills
        4. Generate markdown briefing

    Args:
        sources: dict with keys:
            - 'items': list of skill/item dicts
            - 'archive': optional list of archived items for dedup
        config: optional dict with:
            - 'template': 'daily' or 'weekly' (default 'daily')
            - 'date': str (default today)

    Returns:
        dict with complete intelligence brief including markdown output.
    """
    config = config or {}
    template_type = config.get("template", "daily")
    date_str = config.get("date", datetime.now().strftime("%Y-%m-%d"))

    sources = sources or {}
    items = sources.get("items", [])
    archive = sources.get("archive", [])

    # Step 1: Dedup + freshness
    fresh_items = apply_dedup_and_freshness(items, archive)
    stale_count = len(items) - len(fresh_items) if items else 0

    # Step 2: Classify by role
    by_role = classify_by_role(fresh_items)

    # Step 3: Score hot skills
    hot_scores = score_hot_skills(fresh_items)

    # Build briefing data
    briefing_data = {
        "date": date_str,
        "top_hot_skills": hot_scores.get("top_hot_skills", []),
        "scored_skills": hot_scores.get("scored", []),
        "hot_scores": hot_scores,
        "by_role": by_role,
        "trends": sources.get("trends", []),
        "signals": sources.get("signals", []),
        "archive_count": len(archive),
        "keywords": sources.get("keywords", [
            "cross-border e-commerce", "claude skills",
            "跨境电商", "Claude Skills",
        ]),
    }

    markdown = generate_briefing(briefing_data, template_type)

    total_items = len(fresh_items)
    total_classified = sum(role_data["count"] for role_data in by_role.values())
    empty_roles = [role_id for role_id, rd in by_role.items() if rd["count"] == 0]

    summary = {
        "date": date_str,
        "template": template_type,
        "total_items_processed": total_items,
        "stale_items_removed": stale_count,
        "total_classified": total_classified,
        "empty_roles": empty_roles,
        "top_hot_skills": hot_scores.get("top_hot_skills", []),
    }

    return {
        "summary": summary,
        "by_role": by_role,
        "hot_scores": hot_scores,
        "fresh_items": fresh_items,
        "briefing_markdown": markdown,
        "config_used": {
            "template": template_type,
            "date": date_str,
        },
    }
