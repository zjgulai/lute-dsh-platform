#!/usr/bin/env python3
"""
seo-competitor-analyzer - CLI entry point.

Usage:
    python run.py --own own_keywords.json --competitors comp_keywords.json --output report.json
    python run.py --own own_data.json --competitors comp1.json,comp2.json --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:  # 支持 python -m scripts.run 与 python scripts/run.py 两种调用方式
    from .core import generate_seo_competitor_report
except ImportError:  # 直接 python run.py 时退化为平级导入
    from core import generate_seo_competitor_report


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
    gap = data.get("keyword_gap_analysis", {})
    backlinks = data.get("backlink_opportunities", [])
    actions = data.get("priority_actions", [])

    lines.append("=" * 60)
    lines.append("SEO Competitor Analysis Report")
    lines.append("=" * 60)
    lines.append(f"Competitor: {summary.get('competitor', 'N/A')}")
    lines.append(f"Keyword Overlap: {summary.get('keyword_overlap_pct', 0)}%")
    lines.append(f"Missing Keywords: {summary.get('missing_keywords_count', 0)}")
    lines.append(f"Shared Keywords: {summary.get('shared_keywords_count', 0)}")
    lines.append(f"Unique (own only): {summary.get('unique_keywords_count', 0)}")
    lines.append(f"Backlink Opportunities: {summary.get('backlink_opportunities_total', 0)} "
                 f"({summary.get('high_value_backlinks', 0)} high value)")
    lines.append("")

    # Gap analysis
    lines.append("--- Keyword Gap ---")
    missing = gap.get("missing_keywords", [])
    for kw in missing[:10]:
        vol = kw.get("competitor_volume", "?")
        pos = kw.get("competitor_position", "?")
        lines.append(f"  MISSING: {kw['keyword']} (vol={vol}, pos={pos})")
    if not missing:
        lines.append("  No missing keywords identified.")
    lines.append("")

    # Priority actions
    lines.append("--- Priority Actions ---")
    for action in actions:
        lines.append(f"  [{action.get('priority', 'info').upper()}] {action.get('action', '')}")
        lines.append(f"    {action.get('details', '')}")
    if not actions:
        lines.append("  No priority actions identified.")
    lines.append("")

    # Backlink opportunities
    lines.append("--- Top Backlink Opportunities ---")
    high_val = [b for b in backlinks if b.get("value_tier") == "high"]
    for b in high_val[:10]:
        lines.append(f"  [{b.get('value_tier', '?')}] {b.get('domain', '?')} "
                     f"(DR={b.get('dr', 0)}, score={b.get('composite_score', 0)})")
    if not high_val:
        lines.append("  No high-value backlinks found.")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="SEO Competitor Analyzer")
    parser.add_argument("--own", required=True, help="Path to own data JSON (keywords + page + domain)")
    parser.add_argument("--competitors", required=True, help="Path to competitor data JSON or comma-separated paths")
    parser.add_argument("--competitor-name", help="Override competitor name")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    own_data = _load_json(args.own)
    if not own_data:
        print("Error: own data must be provided", file=sys.stderr)
        sys.exit(1)

    competitor_data = _load_json(args.competitors)
    if not competitor_data:
        print("Error: competitor data must be provided", file=sys.stderr)
        sys.exit(1)

    config = {}
    if args.competitor_name:
        config["competitor_name"] = args.competitor_name

    report = generate_seo_competitor_report(own_data, competitor_data, config)
    print(f"Analysis for {report['summary']['competitor']}: "
          f"{report['summary']['missing_keywords_count']} missing keywords, "
          f"{report['summary']['high_value_backlinks']} high-value backlinks",
          file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
