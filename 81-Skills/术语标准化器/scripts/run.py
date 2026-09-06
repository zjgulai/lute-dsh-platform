#!/usr/bin/env python3
"""
Taxonomy Normalizer - CLI entry point.

Usage:
    python run.py --input skus.json --output normalized.json --format json
    python run.py --input skus.json --fields tags,applicable_objective --strategy flexible
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import (
    apply_normalization,
    collect_terms,
    detect_conflicts,
    detect_equivalents,
    generate_normalization_report,
    normalize_case,
)


def _load_skus(path: str) -> list[dict[str, Any]]:
    """Load and parse JSON input file of SKUs."""
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "skus" in data:
        return data["skus"]
    msg = "Input must be a JSON array of SKUs or dict with 'skus' key"
    raise ValueError(msg)


def _output_json(data: dict[str, Any], output_path: str | None) -> None:
    if output_path:
        Path(output_path).write_text(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False))


def _output_text(data: dict[str, Any], output_path: str | None) -> None:
    lines: list[str] = []

    before = data.get("before", {})
    after = data.get("after", {})
    lines.append("=" * 60)
    lines.append("Taxonomy Normalization Report")
    lines.append("=" * 60)
    lines.append(f"Before: {before.get('total_unique_terms', 0)} unique terms")
    lines.append(f"After:  {after.get('total_standardized_terms', 0)} standardized terms")
    lines.append(f"Reduction: {after.get('reduction', 0)} "
                 f"({after.get('reduction_pct', 0)}%)")
    lines.append("")

    lines.append("--- Per-field Breakdown ---")
    for field in before.get("per_field", {}):
        before_field = before["per_field"].get(field, {})
        after_field = after["per_field"].get(field, {})
        lines.append(f"  {field}:")
        lines.append(f"    Before: {before_field.get('total_count', 0)} terms")
        lines.append(f"    After:  {after_field.get('standardized_count', 0)} terms")
    lines.append("")

    conflicts = data.get("conflicts", [])
    if conflicts:
        lines.append(f"--- Conflicts ({len(conflicts)}) ---")
        for conflict in conflicts:
            lines.append(f"  [{conflict['type']}] {conflict['description']}")
        lines.append("")

    merge_suggestions = data.get("merge_suggestions", [])
    if merge_suggestions:
        lines.append(
            f"--- Merge Suggestions ({len(merge_suggestions)}) ---"
        )
        for suggestion in merge_suggestions[:30]:
            lines.append(
                f"  Merge '{suggestion['standard']}' <- {suggestion['variants']}"
            )
        if len(merge_suggestions) > 30:
            lines.append(f"  ... and {len(merge_suggestions) - 30} more")
        lines.append("")

    lines.append("--- Mappings ---")
    for standard, variants in data.get("mappings", {}).items():
        if variants:
            lines.append(f"  '{standard}' <- {variants}")
        else:
            lines.append(f"  '{standard}' (no variants)")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Taxonomy Normalizer")
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to JSON input file (array of SKUs)",
    )
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument(
        "--fields",
        default="tags",
        help="Comma-separated field names to normalize (default: tags)",
    )
    parser.add_argument(
        "--strategy",
        choices=["strict", "flexible"],
        default="flexible",
        help="Matching strategy (default: flexible)",
    )
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply normalization to SKUs and output normalized SKUs",
    )
    args = parser.parse_args()

    # Load input
    print(f"Loading input: {args.input}", file=sys.stderr)
    skus = _load_skus(args.input)
    print(f"  SKUs loaded: {len(skus)}", file=sys.stderr)

    # Parse fields
    fields = [f.strip() for f in args.fields.split(",") if f.strip()]
    print(f"  Fields to normalize: {fields}", file=sys.stderr)

    # Build config
    config = {"strategy": args.strategy}

    # Collect terms
    terms = collect_terms(skus, fields)
    total_terms = sum(len(v) for v in terms.values())
    print(f"  Terms collected: {total_terms}", file=sys.stderr)

    # Process each field
    all_mappings: dict[str, list[str]] = {}

    for field, field_terms in terms.items():
        normalized = normalize_case(field_terms)
        field_mappings = detect_equivalents(normalized, args.strategy)
        for std, vars_list in field_mappings.items():
            all_mappings[std] = vars_list

    if args.apply:
        # Apply normalization and output normalized SKUs
        normalized_skus = apply_normalization(skus, all_mappings)
        if args.format == "json":
            _output_json({"skus": normalized_skus}, args.output)
        else:
            lines = [f"Normalized {len(skus)} SKUs\n"]
            for sku in normalized_skus:
                lines.append(json.dumps(sku, indent=2, ensure_ascii=False))
            output = "\n".join(lines)
            if args.output:
                Path(args.output).write_text(output)
            else:
                print(output)
    else:
        # Generate and output report
        report = generate_normalization_report(terms, all_mappings, config)

        if args.format == "json":
            _output_json(report, args.output)
        else:
            _output_text(report, args.output)


if __name__ == "__main__":
    main()
