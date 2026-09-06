#!/usr/bin/env python3
"""
Multi-Platform Listing Generator - CLI entry point.

Usage:
    python run.py --product product.json --platforms amazon,shopify,ebay
    python run.py --product product.json --platforms walmart,etsy --output listings.json --format json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# 自包含导入：支持直接运行和包运行两种方式
try:
    from .core import generate_multi_platform_listings, get_platform_rules
except ImportError:
    from core import generate_multi_platform_listings, get_platform_rules


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
    lines.append(f"Product: {data.get('product_name', 'N/A')}")
    lines.append("=" * 60)

    summary = data.get("summary", {})
    lines.append(f"Platforms: {summary.get('total_platforms', 0)}")
    lines.append(f"Compliant: {summary.get('compliant_count', 0)}")
    lines.append(f"With Issues: {summary.get('issues_count', 0)}")
    lines.append("")

    for platform, listing in (data.get("listings") or {}).items():
        lines.append(f"--- {platform.upper()} ---")
        if "error" in listing:
            lines.append(f"  ERROR: {listing['error']}")
            lines.append("")
            continue

        lines.append(f"  Title: {listing.get('title', 'N/A')}")
        if "bullets" in listing:
            for i, b in enumerate(listing["bullets"], 1):
                lines.append(f"    {i}. {b[:80]}{'...' if len(b) > 80 else ''}")
        if "description" in listing:
            desc_preview = listing["description"][:120].replace("\n", " ")
            lines.append(f"  Description: {desc_preview}{'...' if len(listing['description']) > 120 else ''}")
        if "backend_keywords" in listing:
            lines.append(f"  Backend Keywords: {listing['backend_keywords'][:80]}{'...' if len(listing['backend_keywords']) > 80 else ''}")
        if "tags" in listing:
            lines.append(f"  Tags ({len(listing['tags'])}): {', '.join(listing['tags'][:8])}")
        if "materials" in listing:
            lines.append(f"  Materials: {', '.join(listing['materials'][:5])}")

        validation = (data.get("validations") or {}).get(platform, {})
        status = "COMPLIANT" if validation.get("is_compliant") else "ISSUES"
        lines.append(f"  Validation: {status}")
        lines.append("")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Multi-Platform Listing Generator")
    parser.add_argument("--product", help="Path to product description JSON")
    parser.add_argument(
        "--platforms",
        help="Comma-separated platform list (amazon,shopify,ebay,walmart,etsy)",
    )
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--list-rules",
        action="store_true",
        help="Print platform rules and exit",
    )
    args = parser.parse_args()

    if args.list_rules:
        for p in ["amazon", "shopify", "ebay", "walmart", "etsy"]:
            rules = get_platform_rules(p)
            print(f"\n{p}:")
            for k, v in rules.items():
                print(f"  {k}: {v}")
        return

    if not args.product:
        print("Error: --product is required", file=sys.stderr)
        sys.exit(1)
    if not args.platforms:
        print("Error: --platforms is required", file=sys.stderr)
        sys.exit(1)

    product = _load_json(args.product)
    platforms = [p.strip().lower() for p in args.platforms.split(",") if p.strip()]

    print(f"Generating listings for: {', '.join(platforms)}", file=sys.stderr)
    result = generate_multi_platform_listings(product, platforms)

    if args.format == "json":
        _output_json(result, args.output)
    else:
        _output_text(result, args.output)


if __name__ == "__main__":
    main()
