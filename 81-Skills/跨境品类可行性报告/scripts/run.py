#!/usr/bin/env python3
"""
cbec-category-sourcing-report - CLI entry point.

Usage:
    python run.py --category "wearable breast pump"
    python run.py --category "baby bottle" --products products.json --suppliers suppliers.json --output report.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    from .core import (
        aggregate_market_data,
        analyze_price_segments,
        evaluate_supply_chain,
        generate_category_report,
    )
except ImportError:
    # Self-contained fallback: run as standalone script
    from core import (
        aggregate_market_data,
        analyze_price_segments,
        evaluate_supply_chain,
        generate_category_report,
    )


def _load_json(path: str) -> Any:
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
    market = data.get("market_data", {})
    price_data = data.get("price_segments", [])
    supply = data.get("supply_chain", {})
    gates = data.get("gate_checks", {})

    lines.append("=" * 60)
    lines.append(f"Category Sourcing Report: {summary.get('category', 'N/A')}")
    lines.append("=" * 60)
    lines.append(f"Verdict: {summary.get('overall_verdict', 'N/A')}")
    lines.append(f"Gates: {summary.get('gates_passed', 0)}/{summary.get('gates_total', 5)} passed")
    failed = summary.get("failed_gates", [])
    if failed:
        lines.append(f"Failed Gates: {', '.join(failed)}")
    lines.append(f"Growth Stage: {summary.get('growth_stage', 'unknown')}")
    lines.append(f"Margin Opportunity: {summary.get('margin_opportunity', 'N/A')}")
    if summary.get("apac_first_note"):
        lines.append(f"APAC Note: {summary['apac_first_note']}")
    if summary.get("downgrade_flags"):
        for flag in summary["downgrade_flags"]:
            lines.append(f"  [FLAG] {flag}")
    lines.append("")

    # Market data
    lines.append("--- Market Data ---")
    lines.append(f"  Sources: {market.get('source_count', 0)} ({'single' if market.get('data_sources_single') else 'multiple'})")
    ms = market.get("market_size", {})
    lines.append(f"  Market Size: ${ms.get('avg', 0)}M (${ms.get('min', 0)}M-${ms.get('max', 0)}M)")
    cagr = market.get("cagr", {})
    lines.append(f"  CAGR: {cagr.get('avg', 0):.1%}")
    rs = market.get("regional_split", {})
    lines.append(f"  Regional Split: NA {rs.get('NA', 0)}% / EU {rs.get('EU', 0)}% / APAC {rs.get('APAC', 0)}%")
    if market.get("disclaimer"):
        lines.append(f"  Disclaimer: {market['disclaimer']}")
    lines.append("")

    # Price segments
    lines.append("--- Price Segments ---")
    for seg in price_data:
        lines.append(
            f"  {seg['segment']} ({seg['price_range']}): "
            f"{seg['share_pct']}% share, {seg['product_count']} products, "
            f"rating {seg['avg_rating']}, margin {seg['margin_estimate']:.0%}"
        )
    lines.append("")

    # Supply chain
    lines.append("--- Supply Chain ---")
    lines.append(f"  Suppliers: {supply.get('total_suppliers', 0)}")
    lines.append(f"  OEM/ODM Coverage: {supply.get('oem_odm_coverage_pct', 0)}%")
    lines.append(f"  Avg MOQ: {supply.get('avg_moq', 0)}")
    lines.append(f"  Certification Rate: {supply.get('certification_rate', 0)}%")
    ltr = supply.get("lead_time_range", {})
    lines.append(f"  Lead Time: {ltr.get('min', 0)}-{ltr.get('max', 0)} days (avg {ltr.get('avg', 0)})")
    lines.append(f"  Geographic: {supply.get('geographic_concentration', 'unknown')}")
    if supply.get("disclaimer"):
        lines.append(f"  Disclaimer: {supply['disclaimer']}")
    for s in supply.get("top_suppliers", [])[:3]:
        lines.append(f"    - {s.get('name', '?')} (rating: {s.get('rating', 0)}, MOQ: {s.get('moq', 0)})")
    lines.append("")

    # Gates
    lines.append("--- Gate Checks ---")
    for g in gates.get("gates", []):
        status = "PASS" if g["passed"] else "FAIL"
        lines.append(f"  [{status}] {g['gate']}: {g['name']} = {g['value']} (threshold: {g['threshold']})")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="CBEC Category Sourcing Report")
    parser.add_argument("--category", required=True, help="Category name")
    parser.add_argument("--products", help="Path to products JSON file")
    parser.add_argument("--suppliers", help="Path to suppliers JSON file")
    parser.add_argument("--market-data", help="Path to existing market data JSON (optional)")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    # Load or construct market data
    if args.market_data:
        sources = _load_json(args.market_data)
        if not isinstance(sources, list):
            sources = [sources]
    else:
        sources = []

    market_data = aggregate_market_data(args.category, sources)
    print(f"Market data aggregated from {market_data['source_count']} sources", file=sys.stderr)

    # Load and analyze products for price segments
    products = []
    if args.products:
        products = _load_json(args.products)
        if isinstance(products, dict):
            for key in ("products", "items", "data"):
                val = products.get(key, [])
                if isinstance(val, list):
                    products = val
                    break
        print(f"Loaded {len(products)} products from {args.products}", file=sys.stderr)

    price_data = analyze_price_segments(products)

    # Load suppliers
    suppliers = []
    if args.suppliers:
        suppliers = _load_json(args.suppliers)
        if isinstance(suppliers, dict):
            for key in ("suppliers", "vendors", "data"):
                val = suppliers.get(key, [])
                if isinstance(val, list):
                    suppliers = val
                    break
        print(f"Loaded {len(suppliers)} suppliers from {args.suppliers}", file=sys.stderr)

    supply_data = evaluate_supply_chain(args.category, suppliers)

    report = generate_category_report(args.category, market_data, price_data, supply_data)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
