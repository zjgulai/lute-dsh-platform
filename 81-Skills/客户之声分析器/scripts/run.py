#!/usr/bin/env python3
"""
cbec-customer-voice-analyzer - CLI entry point.

Usage:
    python run.py --input feedback.json
    python run.py --input feedback.json --brands '["Momcozy","Elvie"]' --themes '["noise","leak"]' --output report.json
"""

from __future__ import annotations

import sys
from pathlib import Path
# Allow running from skill root directory
_skill_dir = Path(__file__).resolve().parents[1]
if str(_skill_dir) not in sys.path:
    sys.path.insert(0, str(_skill_dir))

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from scripts.core import generate_voc_report


def _load_input(path: str) -> dict[str, Any] | list[dict[str, Any]]:
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
    aggregation = data.get("aggregation", {})
    matrix = data.get("competitor_voc_matrix", {})
    patterns = data.get("pain_patterns", [])
    routing = data.get("routing", {})

    lines.append("=" * 60)
    lines.append("Customer Voice Analysis Report")
    lines.append("=" * 60)

    lines.append(f"Total Samples: {summary.get('total_samples', 0)}")
    lines.append(f"Source Breakdown: {summary.get('source_breakdown', {})}")
    lines.append(f"Stage Distribution: {summary.get('stage_distribution', {})}")
    lines.append(f"Top Pain Patterns: {', '.join(summary.get('top_pain_patterns', []))}")
    if summary.get("momcozy_advantages"):
        lines.append(f"Momcozy Advantages: {', '.join(summary['momcozy_advantages'])}")
    lines.append(f"Insights Routed: {summary.get('insights_routed', 0)}")
    lines.append("")

    # Decision stage distribution
    lines.append("--- Decision Stage Distribution ---")
    stages = summary.get("stage_distribution", {})
    for stage, count in sorted(stages.items(), key=lambda x: x[1], reverse=True):
        pct = count / max(summary.get("total_samples", 1), 1) * 100
        lines.append(f"  {stage}: {count} ({pct:.1f}%)")
    lines.append("")

    # Pain patterns
    lines.append(f"--- Pain Point Patterns ({len(patterns)}) ---")
    for p in patterns[:8]:
        lines.append(
            f"  [{p['stage']}] {p['pattern']}: {p['occurrence_count']} occurrences, "
            f"intensity {p['intensity']}, brands: {', '.join(p['brands_affected'][:3])}"
        )
        lines.append(f"    Fix: {p['suggested_fix']}")
    lines.append("")

    # Competitor matrix summary
    lines.append("--- Competitor VoC Matrix ---")
    lines.append(f"  Brands: {', '.join(matrix.get('brands_analyzed', []))}")
    lines.append(f"  Themes: {', '.join(matrix.get('themes_analyzed', []))}")
    if matrix.get("common_pains"):
        lines.append("  Common Industry Pains:")
        for pain in matrix["common_pains"]:
            lines.append(f"    - {pain['theme']}")
    if matrix.get("momcozy_advantages"):
        lines.append(f"  Momcozy Advantages: {', '.join(matrix['momcozy_advantages'])}")
    lines.append("")

    # Routing
    lines.append("--- Insight Routing ---")
    for skill, items in routing.items():
        lines.append(f"  {skill}: {len(items)} items")
        for item in items[:3]:
            lines.append(f"    - {item.get('insight', item.get('pattern', '?'))}")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="CBEC Customer Voice Analyzer")
    parser.add_argument("--input", required=True, help="Path to feedback JSON")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--brands", default='["Momcozy","Elvie","Willow","Medela","Haakaa"]',
        help='JSON array of brands to include in matrix',
    )
    parser.add_argument(
        "--themes", default='["noise","fit","clean","leak","battery","suction","comfort"]',
        help='JSON array of themes to analyze',
    )
    parser.add_argument(
        "--min-occurrence", type=int, default=3,
        help="Minimum occurrences for pain pattern detection (default: 3)",
    )
    args = parser.parse_args()

    feedback = _load_input(args.input)
    brands = json.loads(args.brands)
    themes = json.loads(args.themes)

    config = {
        "brands": brands,
        "themes": themes,
        "min_occurrence": args.min_occurrence,
    }

    report = generate_voc_report(feedback, config)
    print(f"Analyzed {report['summary']['total_samples']} samples from {len(report['summary']['source_breakdown'])} sources", file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
