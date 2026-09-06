#!/usr/bin/env python3
"""
cbec-product-attribute-analyzer - CLI entry point.

Usage:
    python run.py --input products.json
    python run.py --input products.json --output report.json --format json
    python run.py --input products.json --dimensions '["structure","design"]'
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import generate_attribute_report


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
            for key in ("products", "items", "data", "asins"):
                val = data.get(key, [])
                if isinstance(val, list) and val:
                    return val
        return []
    else:
        raise ValueError(f"Unsupported input format: {suffix}. Use JSON.")


def _output_json(data: dict, output_path: str | None) -> None:
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    if output_path:
        Path(output_path).write_text(payload)
    else:
        print(payload)


def _output_text(data: dict, output_path: str | None) -> None:
    lines: list[str] = []
    summary = data.get("summary", {})

    lines.append("=" * 60)
    lines.append("Product Attribute Analysis Report")
    lines.append("=" * 60)
    lines.append(f"Products Analyzed: {summary.get('total_products', 0)}")
    lines.append(f"Fully Tagged: {summary.get('fully_tagged', 0)}")
    lines.append(f"Tagging Coverage: {summary.get('tagging_coverage_pct', 0)}%")
    lines.append(f"Dimensions: {', '.join(summary.get('dimensions_analyzed', []))}")
    lines.append(f"Blank Combinations Found: {summary.get('blank_combinations_found', 0)}")
    lines.append(f"Opportunity Candidates: {summary.get('opportunity_candidates', 0)}")
    if summary.get("sample_sufficiency"):
        ss = summary["sample_sufficiency"]
        lines.append(f"Sample: {'Sufficient' if ss.get('is_sufficient') else 'Insufficient'} ({ss.get('actual_rows', 0)} rows)")
    lines.append("")

    # Sales-weighted shares per dimension
    shares = data.get("sales_weighted_shares", {})
    for dim, share_data in shares.items():
        lines.append(f"--- {dim.capitalize()} Sales-Weighted Share ---")
        for attr in share_data.get("attributes", [])[:8]:
            lines.append(
                f"  {attr['attribute']}: {attr['sales_share_pct']}% share "
                f"(ASINs: {attr['asin_count']}, avg price: ${attr['avg_price']}, "
                f"rating: {attr['avg_rating']})"
            )
        lines.append("")

    # Blank combinations
    blanks = data.get("blank_combinations", {})
    raw_blanks = blanks.get("raw", [])
    validated = blanks.get("demand_validated")
    display = validated or raw_blanks
    if display:
        lines.append(f"--- Blank Combinations ({len(display)}) ---")
        for combo in display[:8]:
            lines.append(
                f"  [{combo.get('classification', '?')}] {combo.get('combination', '')}: "
                f"ASIN share {combo.get('asin_share_pct', 0)}%, "
                f"efficiency {combo.get('sales_efficiency', 0)}x"
            )
        lines.append("")

    # Elasticity
    elasticity = data.get("attribute_elasticity", {})
    lines.append(f"--- Attribute Elasticity: '{elasticity.get('attribute', '?')}' ---")
    for t in elasticity.get("tiers", []):
        lines.append(
            f"  {t['tier']} ({t['price_range']}): presence {t['attribute_presence_pct']}%, "
            f"value gap {t['value_gap']}, "
            f"indicator: {t['price_premium_indicator']}"
        )

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="CBEC Product Attribute Analyzer")
    parser.add_argument("--input", required=True, help="Path to products JSON file")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--dimensions", default='["structure","design","market"]',
        help='JSON array of dimensions to analyze (default: all three)',
    )
    parser.add_argument(
        "--blank-dim1", default="structure",
        help="First dimension for blank combo analysis (default: structure)",
    )
    parser.add_argument(
        "--blank-dim2", default="design",
        help="Second dimension for blank combo analysis (default: design)",
    )
    parser.add_argument(
        "--elasticity-attr", default="quiet",
        help="Attribute to analyze for price elasticity (default: quiet)",
    )
    parser.add_argument(
        "--search-signals", help="Path to search signals JSON for demand validation",
    )
    parser.add_argument(
        "--voc-data", help="Path to VoC data JSON for demand validation",
    )
    args = parser.parse_args()

    products = _load_input(args.input)
    print(f"Loaded {len(products)} products from {args.input}", file=sys.stderr)

    dimensions = json.loads(args.dimensions)
    config: dict[str, Any] = {
        "dimensions": dimensions,
        "blank_dim1": args.blank_dim1,
        "blank_dim2": args.blank_dim2,
        "elasticity_attribute": args.elasticity_attr,
    }

    if args.search_signals:
        config["search_signals"] = json.loads(Path(args.search_signals).read_text())
        print(f"Loaded search signals from {args.search_signals}", file=sys.stderr)
    if args.voc_data:
        config["voc_data"] = json.loads(Path(args.voc_data).read_text())
        print(f"Loaded VoC data from {args.voc_data}", file=sys.stderr)

    report = generate_attribute_report(products, config)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
