#!/usr/bin/env python3
"""
ecom-main-hub - Intent routing for e-commerce data skill orchestration.

Routes user intent to the appropriate e-commerce data analysis sub-skill
based on self-contained intent mapping and natural language intent matching.

Usage:
    python route.py --intent "daily report" --output routed.json
    python route.py --intent "analyze orders" --domain data --format text
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent.parent
# 自包含：路由规则内联，不依赖外部 layout/routing_rules.yaml
_ROUTING_RULES = {
    "daily_report": {"skill": "ecom-daily-report"},
    "monthly_review": {"skill": "ecom-monthly-review"},
    "quarterly_strategy": {"skill": "ecom-quarterly-strategy"},
    "promo_analysis": {"skill": "ecom-promo-analysis"},
    "csv_processing": {"skill": "ecom-csv-processor"},
}

# Intent-to-skill mapping for e-commerce domain
INTENT_MAP: dict[str, list[dict[str, Any]]] = {
    "daily_report": [
        {"skill": "ecom-daily-report", "confidence": 0.9, "description": "每日经营日报"},
        {"skill": "ecom-csv-processor", "confidence": 0.6, "description": "CSV数据处理"},
    ],
    "monthly_review": [
        {"skill": "ecom-monthly-review", "confidence": 0.9, "description": "月度经营复盘"},
    ],
    "quarterly_strategy": [
        {"skill": "ecom-quarterly-strategy", "confidence": 0.9, "description": "季度战略规划"},
    ],
    "promo_analysis": [
        {"skill": "ecom-promo-analysis", "confidence": 0.9, "description": "大促分析"},
    ],
    "price_monitor": [
        {"skill": "ecom-platform-price-monitor", "confidence": 0.9, "description": "平台价格监控"},
    ],
    "csv_processing": [
        {"skill": "ecom-csv-processor", "confidence": 0.9, "description": "CSV订单数据处理"},
    ],
    "review": [
        {"skill": "ecom-monthly-review", "confidence": 0.7, "description": "经营复盘分析"},
        {"skill": "ecom-daily-report", "confidence": 0.5, "description": "日报生成"},
    ],
    "data_analysis": [
        {"skill": "ecom-daily-report", "confidence": 0.6, "description": "数据报表生成"},
        {"skill": "ecom-monthly-review", "confidence": 0.6, "description": "数据复盘分析"},
    ],
}


def load_routing_rules() -> dict[str, Any]:
    """Return the self-contained routing rules (no external dependency)."""
    return dict(_ROUTING_RULES)


def route_intent(user_input: str, domain: str = "ecommerce") -> dict[str, Any]:
    """Route user intent to the most appropriate sub-skill.

    Args:
        user_input: Natural language intent description.
        domain: Business domain (ecommerce, scm, mkt, seo).

    Returns:
        dict with recommended skill, confidence, and alternative suggestions.
    """
    input_lower = user_input.lower()

    # Keyword-based matching
    intent_keywords: dict[str, list[str]] = {
        "daily_report": ["日报", "daily", "今天", "昨天", "今日", "昨日"],
        "monthly_review": ["月报", "月度", "monthly", "本月", "上月", "复盘"],
        "quarterly_strategy": ["季度", "quarterly", "战略", "规划", "策略"],
        "promo_analysis": ["促销", "大促", "promo", "活动", "prime day", "黑五"],
        "price_monitor": ["价格", "price", "调价", "比价"],
        "csv_processing": ["csv", "订单", "order", "导入", "upload", "处理"],
    }

    best_intent = None
    best_score = 0.0

    for intent, keywords in intent_keywords.items():
        score = sum(1 for kw in keywords if kw in input_lower) / max(len(keywords), 1)
        if score > best_score:
            best_score = score
            best_intent = intent

    if best_intent and best_score > 0.05:
        suggestions = INTENT_MAP.get(best_intent, [])
        return {
            "routed": True,
            "primary": suggestions[0]["skill"] if suggestions else None,
            "confidence": best_score,
            "intent": best_intent,
            "suggestions": suggestions,
            "alternatives": [s["skill"] for s in suggestions[1:]] if len(suggestions) > 1 else [],
        }

    # Fallback: show all available sub-skills
    all_skills = [s["skill"] for subs in INTENT_MAP.values() for s in subs]
    all_skills = list(dict.fromkeys(all_skills))  # deduplicate preserving order
    return {
        "routed": False,
        "primary": None,
        "confidence": 0.0,
        "intent": None,
        "suggestions": [],
        "alternatives": all_skills,
        "message": "No specific intent matched. Available sub-skills listed as alternatives.",
    }


def list_managed_skills() -> list[str]:
    """Return the list of sub-skills managed by this hub."""
    all_skills: list[str] = []
    for subs in INTENT_MAP.values():
        for s in subs:
            if s["skill"] not in all_skills:
                all_skills.append(s["skill"])
    return all_skills


def main() -> None:
    parser = argparse.ArgumentParser(description="E-Commerce Main Hub - Intent Router")
    parser.add_argument("--intent", required=True, help="User intent or natural language input")
    parser.add_argument("--domain", default="ecommerce", help="Business domain for routing")
    parser.add_argument("--output", help="Output file path for routing result")
    parser.add_argument(
        "--format", choices=["json", "text"], default="json",
        help="Output format (default: json)",
    )
    args = parser.parse_args()

    result = route_intent(args.intent, args.domain)

    if args.format == "json":
        payload = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output:
            Path(args.output).write_text(payload)
        else:
            print(payload)
    else:
        lines = ["E-Commerce Hub Routing Result"]
        lines.append("=" * 40)
        if result["routed"]:
            lines.append(f"Intent: {result['intent']}")
            lines.append(f"Primary Skill: {result['primary']}")
            lines.append(f"Confidence: {result['confidence']:.2%}")
            if result["alternatives"]:
                lines.append(f"Alternatives: {', '.join(result['alternatives'])}")
        else:
            lines.append(result.get("message", "No route found."))
            lines.append(f"Available: {', '.join(result['alternatives'])}")
        output_text = "\n".join(lines)
        if args.output:
            Path(args.output).write_text(output_text)
        else:
            print(output_text)


if __name__ == "__main__":
    main()
