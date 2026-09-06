#!/usr/bin/env python3
"""
mkt-main-hub - Intent routing for marketing skill orchestration.

Routes user intent to the appropriate marketing sub-skill
based on keyword matching and routing rules configuration.

Usage:
    python route.py --intent "ad creative for Facebook" --output routed.json
    python route.py --intent "write email sequence" --domain mkt --format text
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import yaml
from pathlib import Path
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent.parent
LAYOUT_DIR = SKILL_DIR.parent.parent / "layout"

# Intent-to-skill mapping for marketing domain
INTENT_MAP: dict[str, list[dict[str, Any]]] = {
    "ad_creative": [
        {"skill": "广告创意", "confidence": 0.9, "description": "广告创意文案与概念"},
        {"skill": "营销文案", "confidence": 0.5, "description": "营销文案写作"},
    ],
    "paid_ads": [
        {"skill": "付费广告", "confidence": 0.9, "description": "付费广告优化与审计"},
    ],
    "copywriting": [
        {"skill": "营销文案", "confidence": 0.9, "description": "销售文案与品牌故事"},
    ],
    "launch_strategy": [
        {"skill": "上市策略", "confidence": 0.9, "description": "产品发布与GTM策略"},
    ],
    "email_sequence": [
        {"skill": "邮件序列", "confidence": 0.9, "description": "邮件营销序列"},
        {"skill": "冷邮件", "confidence": 0.6, "description": "冷邮件外联"},
    ],
    "social_content": [
        {"skill": "社媒内容", "confidence": 0.9, "description": "社交媒体内容"},
    ],
    "cold_email": [
        {"skill": "冷邮件", "confidence": 0.9, "description": "冷邮件外联与跟进"},
    ],
    "competitor_alternatives": [
        {"skill": "竞品替代分析", "confidence": 0.9, "description": "竞品替代方案与差异化"},
    ],
    "cro_optimization": [
        {"skill": "CRO优化", "confidence": 0.9, "description": "转化率优化"},
    ],
    "brand_voice": [
        {"skill": "品牌声音提取器", "confidence": 0.9, "description": "品牌声音提取"},
    ],
    "content_suite": [
        {"skill": "营销内容套件", "confidence": 0.9, "description": "多渠道营销内容生成"},
    ],
    "video_analysis": [
        {"skill": "爆款视频分析器", "confidence": 0.9, "description": "视频内容分析优化"},
    ],
}


def load_routing_rules() -> dict[str, Any]:
    """Load routing rules from the shared layout configuration."""
    rules_path = LAYOUT_DIR / "routing_rules.yaml"
    if not rules_path.exists():
        return {}
    with open(rules_path) as f:
        return yaml.safe_load(f)


def route_intent(user_input: str, domain: str = "mkt") -> dict[str, Any]:
    """Route user intent to the most appropriate sub-skill.

    Args:
        user_input: Natural language intent description.
        domain: Business domain (default: mkt).

    Returns:
        dict with recommended skill, confidence, and alternative suggestions.
    """
    input_lower = user_input.lower()

    intent_keywords: dict[str, list[str]] = {
        "ad_creative": ["广告", "ad", "creative", "创意", "投放", "facebook ad", "tiktok ad"],
        "paid_ads": ["付费", "paid", "ppc", "cpc", "roas", "投放优化", "广告优化"],
        "copywriting": ["文案", "copy", "copywriting", "品牌故事", "landing page", "销售文案"],
        "launch_strategy": ["发布", "launch", "gtm", "go to market", "冷启动", "growth"],
        "email_sequence": ["邮件", "email", "sequence", "欢迎", "弃购", "cart", "automation"],
        "social_content": ["社媒", "social", "instagram", "tiktok", "linkedin", "twitter"],
        "cold_email": ["冷邮件", "cold email", "b2b外联", "outreach", "销售开发"],
        "competitor_alternatives": ["竞品", "competitor", "替代", "alternative", "差异化"],
        "cro_optimization": ["cro", "转化", "conversion", "landing page优化", "a/b test"],
        "brand_voice": ["品牌", "brand voice", "tone", "品牌指南", "guideline"],
        "content_suite": ["内容", "content", "营销内容", "campaign", "多渠道"],
        "video_analysis": ["视频", "video", "tiktok", "viral", "reels", "shorts"],
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

    all_skills = [s["skill"] for subs in INTENT_MAP.values() for s in subs]
    all_skills = list(dict.fromkeys(all_skills))
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
    parser = argparse.ArgumentParser(description="Marketing Main Hub - Intent Router")
    parser.add_argument("--intent", required=True, help="User intent or natural language input")
    parser.add_argument("--domain", default="mkt", help="Business domain for routing")
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
        lines = ["Marketing Hub Routing Result"]
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
