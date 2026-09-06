#!/usr/bin/env python3
"""
Knowledge Similarity Analyzer - CLI entry point.

Usage:
    python run.py --input skus.json --output similarity.json --format json
    python run.py --input skus.json --thresholds '{"high": 0.9}' --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import (
    DEFAULT_THRESHOLDS,
    analyze_batch,
    analyze_pair,
    extract_similarity_features,
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


def _load_thresholds(path_or_str: str) -> dict[str, float]:
    """Load thresholds from a JSON string or file path."""
    try:
        return json.loads(path_or_str)
    except (json.JSONDecodeError, TypeError):
        try:
            with open(path_or_str) as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return dict(DEFAULT_THRESHOLDS)


def _output_json(data: dict[str, Any], output_path: str | None) -> None:
    if output_path:
        Path(output_path).write_text(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False))


def _output_text(data: dict[str, Any], output_path: str | None) -> None:
    lines: list[str] = []

    summary = data.get("summary", {})
    lines.append("=" * 60)
    lines.append("Knowledge Similarity Analysis Report")
    lines.append("=" * 60)
    lines.append(f"Total SKUs: {summary.get('total_skus', 0)}")
    lines.append(f"Total pairs analyzed: {summary.get('total_pairs_analyzed', 0)}")
    lines.append("")
    lines.append("--- Relationship Breakdown ---")
    lines.append(f"  DUPLICATE:   {summary.get('duplicate_pairs', 0)}")
    lines.append(f"  CONFLICT:    {summary.get('conflict_pairs', 0)}")
    lines.append(f"  RELATED:     {summary.get('related_pairs', 0)}")
    lines.append(f"  INDEPENDENT: {summary.get('independent_pairs', 0)}")
    lines.append("")
    lines.append(f"Duplicate groups: {summary.get('duplicate_groups', 0)}")
    lines.append(f"Conflict groups:  {summary.get('conflict_groups', 0)}")
    lines.append("")

    avg_sim = summary.get("average_similarities", {})
    lines.append("--- Average Similarities ---")
    lines.append(f"  Anchor:  {avg_sim.get('anchor', 0):.4f}")
    lines.append(f"  Logic:   {avg_sim.get('logic', 0):.4f}")
    lines.append(f"  Outcome: {avg_sim.get('outcome', 0):.4f}")
    lines.append(f"  Combined:{avg_sim.get('combined', 0):.4f}")
    lines.append("")

    # Show duplicate groups
    dup_groups = data.get("duplicate_groups", [])
    if dup_groups:
        lines.append(f"--- Duplicate Groups ({len(dup_groups)}) ---")
        for i, group in enumerate(dup_groups, 1):
            lines.append(f"  Group {i}: {', '.join(group)}")
        lines.append("")

    # Show conflict groups
    conf_groups = data.get("conflict_groups", [])
    if conf_groups:
        lines.append(f"--- Conflict Groups ({len(conf_groups)}) ---")
        for i, group in enumerate(conf_groups, 1):
            lines.append(f"  Group {i}: {', '.join(group)}")
        lines.append("")

    # Show detailed pairs (limit to 50)
    pairs = data.get("pairs", [])
    display_pairs = pairs[:50]
    lines.append(f"--- Pair Details (showing {len(display_pairs)} of {len(pairs)}) ---")
    for p in display_pairs:
        sim = p["similarities"]
        lines.append(
            f"  [{p['relationship']:12s}] "
            f"{p['sku1_id']:30s} vs {p['sku2_id']:30s} "
            f"(A={sim['anchor']:.3f} L={sim['logic']:.3f} O={sim['outcome']:.3f})"
        )
    if len(pairs) > 50:
        lines.append(f"  ... and {len(pairs) - 50} more pairs")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Knowledge Similarity Analyzer")
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to JSON input file (array of SKUs)",
    )
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument(
        "--thresholds",
        default=json.dumps(DEFAULT_THRESHOLDS),
        help="JSON string or file path with thresholds (default: %(default)s)",
    )
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--pair",
        nargs=2,
        metavar=("SKU1_IDX", "SKU2_IDX"),
        help="Analyze a specific pair by index (0-based)",
    )
    parser.add_argument(
        "--max-pairs",
        type=int,
        default=0,
        help="Maximum number of pairs to analyze (0 = unlimited, default: 0)",
    )
    args = parser.parse_args()

    # Load input
    print(f"Loading input: {args.input}", file=sys.stderr)
    skus = _load_skus(args.input)
    print(f"  SKUs loaded: {len(skus)}", file=sys.stderr)

    # Load thresholds
    thresholds = _load_thresholds(args.thresholds)
    print(f"  Thresholds: {thresholds}", file=sys.stderr)

    # Build config
    config = {
        "thresholds": thresholds,
        "max_pairs": args.max_pairs,
    }

    # Analyze
    if args.pair:
        idx1, idx2 = int(args.pair[0]), int(args.pair[1])
        if idx1 >= len(skus) or idx2 >= len(skus):
            print(f"Error: SKU indices out of range (max: {len(skus) - 1})", file=sys.stderr)
            sys.exit(1)
        result = analyze_pair(skus[idx1], skus[idx2], config)
        result = {"pairs": [result], "summary": {"total_pairs_analyzed": 1}}
    else:
        result = analyze_batch(skus, config)

    # Output
    if args.format == "json":
        _output_json(result, args.output)
    else:
        _output_text(result, args.output)


if __name__ == "__main__":
    main()
