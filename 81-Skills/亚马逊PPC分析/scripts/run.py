#!/usr/bin/env python3
"""
Amazon PPC Analyzer - CLI entry point.

Usage:
    python run.py --search-term-report report.csv --campaign-data campaign.json
    python run.py --search-term-report report.csv --target-acos 0.25 --output report.json --format json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

def check_sample_size(data, min_rows: int = 10) -> dict:
    payload = data.get("data", data) if isinstance(data, dict) else data
    n = len(payload) if hasattr(payload, "__len__") else 0
    return {"is_sufficient": n >= min_rows, "row_count": n, "min_rows": min_rows}


try:
    from .core import (
        generate_ppc_audit_report,
        parse_search_term_report,
    )
except ImportError:  # 直接以脚本运行时（非包）降级为绝对导入
    from core import (
        generate_ppc_audit_report,
        parse_search_term_report,
    )


def _load_campaign_data(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def _output_json(data: dict, output_path: str | None) -> None:
    if output_path:
        Path(output_path).write_text(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False))


def _output_text(data: dict, output_path: str | None) -> None:
    lines: list[str] = []

    hs = data.get("health_score", {})
    lines.append("=" * 60)
    lines.append(f"PPC Health Score: {hs.get('overall_score', 'N/A')}/100 — {hs.get('rating', 'N/A')}")
    lines.append("=" * 60)
    for dim_name, dim_data in (hs.get("dimensions") or {}).items():
        lines.append(f"  {dim_name}: {dim_data.get('score', 0):.1f}/100 (weight: {dim_data.get('weight', 0):.0%})")
    lines.append("")

    summary = data.get("summary", {})
    lines.append("--- Summary ---")
    for k, v in summary.items():
        lines.append(f"  {k}: {v}")
    lines.append("")

    wasted = data.get("wasted_spend", [])
    lines.append(f"--- Wasted Spend ({len(wasted)} candidates, ${summary.get('wasted_spend_total', 0):.2f}) ---")
    for c in wasted[:10]:
        lines.append(f"  [{c['spend']:.2f}] {c['keyword']} — ACOS {c.get('acos', 0):.1%}")
    if len(wasted) > 10:
        lines.append(f"  ... and {len(wasted) - 10} more")
    lines.append("")

    negs = data.get("negative_keywords", [])
    lines.append(f"--- Negative Keyword Suggestions ({len(negs)}) ---")
    for kw in negs[:20]:
        lines.append(f"  - {kw}")
    if len(negs) > 20:
        lines.append(f"  ... and {len(negs) - 20} more")
    lines.append("")

    bids = data.get("bid_adjustments", [])
    high = [b for b in bids if b.get("priority") == "high"]
    lines.append(f"--- High Priority Bid Adjustments ({len(high)}) ---")
    for b in high[:10]:
        lines.append(
            f"  [{b['action']}] {b['keyword']}: ${b['current_bid']:.2f} -> ${b['suggested_bid']:.2f} — {b.get('reason', '')}"
        )
    if len(high) > 10:
        lines.append(f"  ... and {len(high) - 10} more")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Amazon PPC Analyzer")
    parser.add_argument("--search-term-report", required=True, help="Path to Amazon Search Term Report CSV")
    parser.add_argument("--campaign-data", help="Path to campaign data JSON (optional)")
    parser.add_argument("--target-acos", type=float, default=0.30, help="Target ACoS (default: 0.30)")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    # Parse search term report
    print(f"Parsing search term report: {args.search_term_report}", file=sys.stderr)
    parsed = parse_search_term_report(args.search_term_report)
    print(f"  Rows parsed: {parsed['row_count']}", file=sys.stderr)

    # Sample size check
    sample_check = check_sample_size({"data": parsed["data"]}, min_rows=10)
    print(f"  Sample sufficient: {sample_check['is_sufficient']}", file=sys.stderr)

    # Load campaign data
    campaign_data: dict = {"target_acos": args.target_acos}
    if args.campaign_data:
        campaign_data.update(_load_campaign_data(args.campaign_data))

    # Generate audit
    config = {"target_acos": args.target_acos}
    report = generate_ppc_audit_report(parsed["data"], campaign_data, config)

    # Output
    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
