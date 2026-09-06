#!/usr/bin/env python3
"""
seo-main-hub - Intent routing for SEO/GEO skill orchestration.

Routes user intent to the appropriate SEO sub-skill
based on keyword matching and routing rules configuration.

Usage:
    python route.py --intent "technical audit my site" --output routed.json
    python route.py --intent "optimize content" --domain seo --format text
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
# 优先读取本 Skill 的 references/routing_rules.yaml；兼容旧 layout/ 路径（缺失时回退为空配置）
REFERENCES_RULES = SKILL_DIR / "references" / "routing_rules.yaml"
LAYOUT_DIR = SKILL_DIR.parent.parent / "layout"

# Intent-to-skill mapping for SEO/GEO domain
INTENT_MAP: dict[str, list[dict[str, Any]]] = {
    "technical_audit": [
        {"skill": "seo-technical-audit", "confidence": 0.9, "description": "技术SEO审计"},
    ],
    "content_optimization": [
        {"skill": "seo-content-optimizer", "confidence": 0.9, "description": "SEO内容优化"},
    ],
    "competitor_analysis": [
        {"skill": "seo-competitor-analyzer", "confidence": 0.9, "description": "SEO竞品分析"},
    ],
    "geo_optimization": [
        {"skill": "seo-geo-optimizer", "confidence": 0.9, "description": "GEO/AI搜索优化"},
    ],
    "multilingual_seo": [
        {"skill": "seo-multilingual", "confidence": 0.9, "description": "多语言SEO优化"},
    ],
    "seo_strategy": [
        {"skill": "seo-competitor-analyzer", "confidence": 0.6, "description": "竞品SEO策略"},
        {"skill": "seo-content-optimizer", "confidence": 0.6, "description": "内容策略优化"},
    ],
}


def load_routing_rules() -> dict[str, Any]:
    """Load routing rules from the references/routing_rules.yaml (preferred) or legacy layout/."""
    # 优先读取 references/
    if REFERENCES_RULES.exists():
        with open(REFERENCES_RULES) as f:
            return yaml.safe_load(f)
    # 兼容旧 layout/ 路径
    rules_path = LAYOUT_DIR / "routing_rules.yaml"
    if not rules_path.exists():
        return {}
    with open(rules_path) as f:
        return yaml.safe_load(f)


def route_intent(user_input: str, domain: str = "seo") -> dict[str, Any]:
    """Route user intent to the most appropriate sub-skill.

    Args:
        user_input: Natural language intent description.
        domain: Business domain (default: seo).

    Returns:
        dict with recommended skill, confidence, and alternative suggestions.
    """
    input_lower = user_input.lower()

    intent_keywords: dict[str, list[str]] = {
        "technical_audit": ["技术", "technical", "audit", "诊断", "site audit", "crawl", "速度", "core web"],
        "content_optimization": ["内容", "content", "优化", "optimize", "页面", "on-page", "title", "meta"],
        "competitor_analysis": ["竞品", "competitor", "backlink", "外链", "关键词差距", "keyword gap"],
        "geo_optimization": ["geo", "ai搜索", "generative", "llm", "chatgpt", "perplexity", "sge"],
        "multilingual_seo": ["多语言", "multilingual", "hreflang", "国际化", "i18n", "translation"],
        "seo_strategy": ["seo策略", "seo方案", "整体", "全面", "综合", "strategy"],
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
    parser = argparse.ArgumentParser(description="SEO Main Hub - Intent Router")
    parser.add_argument("--intent", required=True, help="User intent or natural language input")
    parser.add_argument("--domain", default="seo", help="Business domain for routing")
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
        lines = ["SEO Hub Routing Result"]
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
