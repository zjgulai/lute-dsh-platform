#!/usr/bin/env python3
"""
cbec-product-data-analyzer - CLI entry point.

Usage:
    python run.py --input products.json --source junglescout
    python run.py --input products.csv --source helium10 --scenarios scenarios.json --output report.json
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any

from .core import generate_product_analysis_report


def _load_input(path: str) -> list[dict]:
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File not found: {path}")

    suffix = path_obj.suffix.lower()

    if suffix == ".json":
        data = json.loads(path_obj.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("products", "items", "data", "results", "asins"):
                val = data.get(key, [])
                if isinstance(val, list) and val:
                    return val
        return []

    elif suffix == ".csv":
        rows: list[dict] = []
        with open(path_obj, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(dict(row))
        return rows

    else:
        raise ValueError(f"Unsupported input format: {suffix}. Use CSV or JSON.")


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
    analysis = data.get("competitive_analysis", {})
    dims = analysis.get("dimensions", {})
    scenarios = data.get("scenarios", [])
    memo = data.get("decision_memo", {})

    lines.append("=" * 60)
    lines.append("Product Data Analysis Report")
    lines.append("=" * 60)
    lines.append(f"Category: {summary.get('category', 'N/A')}")
    lines.append(f"Source: {summary.get('source', 'N/A')}")
    lines.append(f"Products: {summary.get('products_analyzed', 0)}")
    lines.append(f"Recommendation: {summary.get('recommendation', '?')} "
                 f"(confidence: {summary.get('confidence', '?')})")
    if summary.get("sample_sufficiency"):
        ss = summary["sample_sufficiency"]
        lines.append(f"Sample: {'Sufficient' if ss.get('is_sufficient') else 'Insufficient'} ({ss.get('actual_rows', 0)} rows)")
    lines.append(f"Scenarios: {summary.get('scenarios_simulated', 0)}")
    lines.append("")

    # 8D Dimensions
    lines.append("--- Competitive Analysis (8 Dimensions) ---")
    for dim_key, dim_data in dims.items():
        if "demand_trend" in dim_key:
            lines.append(f"  {dim_key}: direction={dim_data.get('direction', '?')}, "
                         f"search_vol={dim_data.get('avg_search_volume', '?')}")
        elif "price_band" in dim_key:
            lines.append(f"  {dim_key}: avg=${dim_data.get('avg', 0)}, "
                         f"range=${dim_data.get('min', 0)}-${dim_data.get('max', 0)}")
        elif "review_velocity" in dim_key:
            lines.append(f"  {dim_key}: avg_reviews={dim_data.get('avg_reviews_per_product', 0)}")
        elif "listing_quality" in dim_key:
            lines.append(f"  {dim_key}: avg_rating={dim_data.get('avg_rating', 0)}")
        elif "brand_concentration" in dim_key:
            lines.append(f"  {dim_key}: total={dim_data.get('total_brands', 0)} brands, "
                         f"top3={dim_data.get('top3_share_pct', 0)}% share")
        elif "seasonality" in dim_key:
            lines.append(f"  {dim_key}: cv={dim_data.get('coefficient_of_variation', 0)}, "
                         f"level={dim_data.get('seasonality_level', '?')}")
        elif "margin_estimate" in dim_key:
            lines.append(f"  {dim_key}: avg={dim_data.get('avg_margin', 0):.0%}, "
                         f"quality={dim_data.get('margin_quality', '?')}")
        elif "entry_barrier" in dim_key:
            lines.append(f"  {dim_key}: level={dim_data.get('barrier_level', '?')}, "
                         f"score={dim_data.get('total_score', 0)}/{dim_data.get('max_possible_score', 9)}")
    lines.append(f"  Overall: {analysis.get('overall_assessment', '')}")
    lines.append("")

    # Scenarios
    if scenarios:
        lines.append("--- Scenario Simulations ---")
        for s in scenarios:
            lines.append(f"  [{s.get('risk_level', '?').upper()}] {s.get('scenario', '?')}: "
                         f"{s.get('expected_outcome', '')[:100]}")
            lines.append(f"    Momcozy fit: {s.get('momcozy_fit_score', 0)}")
        lines.append("")

    # Decision memo
    lines.append("--- Decision Memo ---")
    lines.append(f"  Recommendation: {memo.get('recommendation', '?')} "
                 f"(confidence: {memo.get('confidence', '?')})")
    lines.append(f"  Signals: {memo.get('go_signals', 0)} Go vs {memo.get('no_go_signals', 0)} No-Go")
    lines.append("  Evidence:")
    for e in memo.get("evidence", []):
        lines.append(f"    - {e}")
    lines.append("  Next Steps:")
    for ns in memo.get("next_steps", []):
        lines.append(f"    - {ns}")
    if memo.get("rejected_approaches"):
        lines.append("  Rejected Approaches:")
        for ra in memo["rejected_approaches"]:
            lines.append(f"    - {ra}")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="CBEC Product Data Analyzer")
    parser.add_argument("--input", required=True, help="Path to data file (CSV or JSON)")
    parser.add_argument(
        "--source",
        choices=["junglescout", "helium10", "sorftime", "csv"],
        default="csv",
        help="Data source tool (default: csv)",
    )
    parser.add_argument("--scenarios", help="Path to scenarios JSON")
    parser.add_argument("--category", default="unknown", help="Category name")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    products = _load_input(args.input)
    print(f"Loaded {len(products)} products from {args.input} (source: {args.source})", file=sys.stderr)

    scenarios_def = _load_json(args.scenarios) or []
    if isinstance(scenarios_def, dict):
        scenarios_def = scenarios_def.get("scenarios", [scenarios_def])

    config = {
        "source": args.source,
        "scenarios": scenarios_def,
        "category": args.category,
    }

    report = generate_product_analysis_report(products, config)
    print(f"Analysis complete: {report['summary']['recommendation']} "
          f"({report['summary']['confidence']})", file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
