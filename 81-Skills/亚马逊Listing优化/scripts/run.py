#!/usr/bin/env python3
"""
Amazon Listing Optimizer - CLI entry point.

Usage:
    python run.py --product-info product.json --listing-data listing.json
    python run.py --product-info product.json --listing-data listing.json --output audit.json --format json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .core import generate_listing_audit


def _load_json(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


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
    lines.append(f"Listing Audit: {summary.get('product_name', 'N/A')}")
    lines.append(f"Overall Score: {data.get('overall_score', 'N/A')}/100 — {summary.get('overall_rating', 'N/A')}")
    lines.append("=" * 60)
    lines.append("")

    sections = data.get("sections", {})
    for section_name, section_data in sections.items():
        score = section_data.get("score", section_data.get("overall_score", "N/A"))
        lines.append(f"[{section_name}] Score: {score}")

        if isinstance(section_data, dict):
            issues = section_data.get("issues", [])
            suggestions = section_data.get("suggestions", [])
            for i in issues:
                lines.append(f"  ! {i}")
            for s in suggestions:
                lines.append(f"  > {s}")

        lines.append("")

    priority = data.get("priority_actions", [])
    if priority:
        lines.append("--- Priority Actions ---")
        for action in priority:
            lines.append(f"  [{action['priority']}] {action['action']}")
        lines.append("")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Amazon Listing Optimizer")
    parser.add_argument("--product-info", required=True, help="Path to product info JSON")
    parser.add_argument("--listing-data", required=True, help="Path to listing data JSON (title, bullets, etc.)")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    product_info = _load_json(args.product_info)
    listing_data = _load_json(args.listing_data)

    print(f"Auditing listing for: {product_info.get('name', 'Unknown')}", file=sys.stderr)

    report = generate_listing_audit(product_info, listing_data)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
