#!/usr/bin/env python3
"""
mkt-paid-ads - CLI entry point.

Usage:
    python run.py --platform-data metrics.json --total-budget 50000 --target-roas 4 --output audit.json
    python run.py --platform-data metrics.json --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    from .core import generate_ad_audit_report
except ImportError:
    import core as _core
    generate_ad_audit_report = _core.generate_ad_audit_report


def _load_json(path: str | None) -> Any:
    if not path:
        return None
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return json.loads(path_obj.read_text(encoding="utf-8"))


def _output_json(data: dict, output_path: str | None) -> None:
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    if output_path:
        Path(output_path).write_text(payload)
    else:
        print(payload)


def _output_text(data: dict, output_path: str | None) -> None:
    lines: list[str] = []
    summary = data.get("summary", {})
    health = data.get("ad_health_scores", {})
    budget = data.get("budget_reallocation", {})
    audiences = data.get("audience_performance", {})
    actions = data.get("priority_actions", [])

    lines.append("=" * 60)
    lines.append("Paid Ads Audit Report")
    lines.append("=" * 60)
    lines.append(f"Overall Health: {summary.get('overall_health', 0)}/100 ({summary.get('overall_rating', 'N/A')})")
    lines.append(f"Platforms: {', '.join(summary.get('platforms_analyzed', ['N/A']))}")
    lines.append(f"Budget: ${summary.get('total_budget', 0):,.2f}")
    lines.append(f"Expected ROAS: {summary.get('expected_roas', 0)}x")
    lines.append(f"Winning Audiences: {summary.get('winning_audiences', 0)}")
    lines.append(f"Oversaturated: {summary.get('oversaturated_audiences', 0)}")
    lines.append(f"Declining: {summary.get('declining_audiences', 0)}")
    lines.append(f"Underexplored: {summary.get('underexplored_audiences', 0)}")
    lines.append("")

    # Health scores per platform
    lines.append("--- Platform Health ---")
    for platform, info in health.get("platforms", {}).items():
        lines.append(f"  {platform.upper()}: {info.get('composite_score', 0)}/100 ({info.get('rating', 'N/A')})")
        for metric_key, metric_info in info.get("metrics", {}).items():
            lines.append(f"    {metric_info.get('label', metric_key)}: {metric_info.get('value', '?')} "
                         f"(score: {metric_info.get('score', 0)}, rating: {metric_info.get('rating', '?')})")
    lines.append("")

    # Budget allocation
    lines.append("--- Budget Reallocation ---")
    for alloc in budget.get("allocations", []):
        change_str = f"+${alloc.get('change', 0):.2f}" if alloc.get('change', 0) >= 0 else f"-${abs(alloc.get('change', 0)):.2f}"
        lines.append(f"  {alloc.get('platform', '').upper()}: "
                     f"${alloc.get('current_budget', 0):.2f} -> ${alloc.get('allocated_budget', 0):.2f} "
                     f"({change_str}, {alloc.get('change_pct', 0)}%) "
                     f"[ROAS: {alloc.get('current_roas', '?')}x]")
    lines.append("")

    # Audience status
    lines.append("--- Audience Status ---")
    for aud in audiences.get("ranked_audiences", [])[:10]:
        lines.append(f"  [{aud.get('status', '?').upper()}] {aud.get('name', '?')}: "
                     f"ROAS={aud.get('roas', 0)}x, CPA=${aud.get('cpa', 0):.2f}, "
                     f"Conv={aud.get('conversion_rate', 0):.2%}, "
                     f"Saturation={aud.get('audience_saturation_index', 0)}")
    lines.append("")

    # Priority actions
    lines.append("--- Priority Actions ---")
    for action in actions[:10]:
        lines.append(f"  [{action.get('priority', 'medium').upper()}] "
                     f"[{action.get('platform', '').upper()}] {action.get('action', '')}")
    if len(actions) > 10:
        lines.append(f"  ... and {len(actions) - 10} more actions")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Paid Ads Audit Analyzer")
    parser.add_argument("--platform-data", required=True, help="Path to platform data JSON")
    parser.add_argument("--total-budget", type=float, help="Total advertising budget")
    parser.add_argument("--target-roas", type=float, default=3.0, help="Target ROAS (default: 3.0)")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    platform_data = _load_json(args.platform_data)
    if not platform_data:
        print("Error: platform-data must be provided", file=sys.stderr)
        sys.exit(1)

    # Override budget/ROAS from CLI if provided
    if args.total_budget is not None:
        platform_data["total_budget"] = args.total_budget
    if args.target_roas != 3.0:
        platform_data["target_roas"] = args.target_roas

    report = generate_ad_audit_report(platform_data)
    print(f"Ad audit: health={report['summary']['overall_health']}%, "
          f"platforms={len(report['summary']['platforms_analyzed'])}, "
          f"actions={report['summary']['priority_actions_count']}",
          file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
