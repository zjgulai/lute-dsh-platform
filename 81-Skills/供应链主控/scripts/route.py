#!/usr/bin/env python3
"""
scm-main-hub - Intent routing for supply chain skill orchestration.

Routes user intent to the appropriate supply chain management sub-skill
based on keyword matching and routing rules configuration.

Usage:
    python route.py --intent "inventory forecast" --output routed.json
    python route.py --intent "evaluate supplier" --domain scm --format text
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from pathlib import Path
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent.parent
# LAYOUT_DIR removed: self-contained version, no external dependency

# Intent-to-skill mapping for supply chain domain
INTENT_MAP: dict[str, list[dict[str, Any]]] = {
    "inventory_forecast": [
        {"skill": "scm-inventory-forecaster", "confidence": 0.9, "description": "库存预测与补货建议"},
        {"skill": "scm-logistics-optimizer", "confidence": 0.5, "description": "物流路线优化"},
    ],
    "supplier_eval": [
        {"skill": "scm-supplier-evaluator", "confidence": 0.9, "description": "供应商评估与准入"},
    ],
    "logistics_tracking": [
        {"skill": "scm-logistics-tracker", "confidence": 0.9, "description": "物流跟踪与监控"},
    ],
    "logistics_optimization": [
        {"skill": "scm-logistics-optimizer", "confidence": 0.9, "description": "物流路线与成本优化"},
    ],
    "supply_chain_analysis": [
        {"skill": "scm-inventory-forecaster", "confidence": 0.6, "description": "供应链库存分析"},
        {"skill": "scm-logistics-optimizer", "confidence": 0.5, "description": "供应链物流优化"},
    ],
}


def load_routing_rules() -> dict[str, Any]:
    """Return routing rules (self-contained, no external file dependency)."""
    # Inline routing rules instead of loading external layout/routing_rules.yaml
    return {
        "domain": "scm",
        "managed_skills": [
            "scm-inventory-forecaster",
            "scm-supplier-evaluator",
            "scm-logistics-optimizer",
            "scm-logistics-tracker",
        ],
    }


def route_intent(user_input: str, domain: str = "scm") -> dict[str, Any]:
    """Route user intent to the most appropriate sub-skill.

    Args:
        user_input: Natural language intent description.
        domain: Business domain (default: scm).

    Returns:
        dict with recommended skill, confidence, and alternative suggestions.
    """
    input_lower = user_input.lower()

    intent_keywords: dict[str, list[str]] = {
        "inventory_forecast": ["库存", "inventory", "补货", "replenish", "forecast", "安全库存"],
        "supplier_eval": ["供应商", "supplier", "vendor", "准入", "评估", "审核", "audit"],
        "logistics_tracking": ["物流", "跟踪", "track", "shipment", "货运", "delivery", "包裹"],
        "logistics_optimization": ["路线", "route", "optimize", "运输", "成本", "时效", "运费"],
        "supply_chain_analysis": ["供应链", "supply chain", "scm", "整体", "综述", "全局"],
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
    parser = argparse.ArgumentParser(description="SCM Main Hub - Intent Router")
    parser.add_argument("--intent", required=True, help="User intent or natural language input")
    parser.add_argument("--domain", default="scm", help="Business domain for routing")
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
        lines = ["SCM Hub Routing Result"]
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
