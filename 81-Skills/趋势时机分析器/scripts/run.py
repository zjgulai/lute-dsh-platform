#!/usr/bin/env python3
"""
cbec-trend-timing-analyzer - CLI entry point.

Usage:
    python run.py --public-data public.json --private-data private.json
    python run.py --public-data public.json --competitor-signals competitors.json --output timing.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import generate_timing_report


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
    timing = data.get("timing_tiers", {})
    window = data.get("market_window", {})
    competitor = data.get("competitor_analysis", [])

    lines.append("=" * 60)
    lines.append("Trend Timing Analysis Report")
    lines.append("=" * 60)
    lines.append(f"Category: {summary.get('category', 'N/A')}")
    lines.append(f"Sub-trend: {summary.get('sub_trend', 'N/A')}")
    lines.append(f"Overall Timing: {summary.get('overall_timing', 'N/A')} "
                 f"(confidence: {summary.get('confidence', 'N/A')})")
    lines.append(f"Signal Quality: {summary.get('signal_quality', 'N/A')}")
    lines.append(f"Competitor Signals: {summary.get('competitor_signals_found', 0)} "
                 f"({summary.get('high_urgency_competitor_signals', 0)} high urgency)")
    lines.append(f"Optimal Entry: {summary.get('optimal_entry', 'N/A')}")
    if data.get("private_data_note"):
        lines.append(f"Note: {data['private_data_note']}")
    lines.append("")

    # Timing tiers
    lines.append("--- Timing Tiers ---")
    for tier_name, tier_data in timing.get("tiers", {}).items():
        lines.append(f"  {tier_name}: {tier_data.get('verdict', '?')} ({tier_data.get('confidence', '?')})")
        for reason in tier_data.get("reasons", []):
            lines.append(f"    - {reason}")
    lines.append("")

    # Market window
    lines.append("--- Market Window ---")
    lines.append(f"  Optimal Entry: {window.get('optimal_entry_window', '?')}")
    lines.append(f"  Peak Window: {window.get('peak_window', '?')}")
    lines.append(f"  Decline Window: {window.get('decline_window', '?')}")
    lines.append(f"  First-Mover Advantage: {window.get('first_mover_advantage_remaining', '?')}")
    lines.append(f"  Est. Months to Peak: {window.get('estimated_months_to_peak', '?')}")
    lines.append("")

    # Competitor signals
    if competitor:
        lines.append(f"--- Competitor Signals ({len(competitor)}) ---")
        for sig in competitor[:5]:
            lines.append(
                f"  [{sig.get('action_urgency', '?')}] {sig.get('type_label', '')} - "
                f"{sig.get('competitor', '?')}: {sig.get('description', '')[:80]}"
            )

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="CBEC Trend Timing Analyzer")
    parser.add_argument("--public-data", help="Path to public trend data JSON")
    parser.add_argument("--private-data", help="Path to private signal data JSON")
    parser.add_argument("--competitor-signals", help="Path to competitor signals JSON")
    parser.add_argument("--category", default="unknown", help="Category name")
    parser.add_argument("--sub-trend", help="Sub-trend name (defaults to category)")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    trend_data = {
        "public_data": _load_json(args.public_data),
        "private_data": _load_json(args.private_data),
        "competitor_signals": _load_json(args.competitor_signals),
    }

    config = {
        "category": args.category,
        "sub_trend": args.sub_trend or args.category,
    }

    report = generate_timing_report(trend_data, config)
    print(f"Timing analysis for {config['category']}: {report['summary']['overall_timing']}", file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
