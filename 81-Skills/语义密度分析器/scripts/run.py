#!/usr/bin/env python3
"""
Semantic Density Analyzer - CLI entry point.

Usage:
    python run.py --input chunks.json --output report.json --format json
    python run.py --input chunks.json --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from .core import analyze_density_report, calculate_base_score
except ImportError:
    from core import analyze_density_report, calculate_base_score


def _load_input(path: str) -> list[dict]:
    """Load and parse JSON input file."""
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "chunks" in data:
        return data["chunks"]
    msg = f"Input must be a JSON array of chunks or dict with 'chunks' key"
    raise ValueError(msg)


def _output_json(data: dict, output_path: str | None) -> None:
    if output_path:
        Path(output_path).write_text(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False))


def _output_text(data: dict, output_path: str | None) -> None:
    lines: list[str] = []

    dist = data.get("distribution", {})
    lines.append("=" * 60)
    lines.append("Semantic Density Analysis Report")
    lines.append("=" * 60)
    lines.append(f"Total chunks analyzed: {dist.get('count', 0)}")
    lines.append(f"Distribution: mean={dist.get('mean', 0):.4f}, "
                 f"median={dist.get('median', 0):.4f}, "
                 f"std={dist.get('std', 0):.4f}")
    lines.append(f"Range: [{dist.get('min', 0):.4f} - {dist.get('max', 0):.4f}]")
    lines.append(f"Quartiles: Q1={dist.get('q1', 0):.4f}, Q3={dist.get('q3', 0):.4f}")
    lines.append("")

    lines.append("--- Top Quartile ---")
    top = data.get("top_quartile", [])
    for chunk_id in top[:10]:
        lines.append(f"  {chunk_id}")
    lines.append("")

    lines.append("--- Bottom Quartile ---")
    bottom = data.get("bottom_quartile", [])
    for chunk_id in bottom[:10]:
        lines.append(f"  {chunk_id}")
    lines.append("")

    lines.append("--- Ranked Chunks (sorted by density) ---")
    for item in data.get("ranked", []):
        scores = item["scores"]
        lines.append(
            f"  #{item['rank']:3d} [{item['id']}] "
            f"composite={scores['composite']:.4f} "
            f"(logic={scores['logic']:.4f}, entity={scores['entity']:.4f}, "
            f"struct={scores['struct']:.4f}, lang={scores['language']})"
        )

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Semantic Density Analyzer")
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to JSON input file (array of chunks with id, content, language)",
    )
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--language",
        default="zh",
        help="Default language for chunks without language field (default: zh)",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=5,
        help="Number of top-density chunks to include (default: 5)",
    )
    parser.add_argument(
        "--bottom-k",
        type=int,
        default=5,
        help="Number of bottom-density chunks to include (default: 5)",
    )
    args = parser.parse_args()

    # Load input
    print(f"Loading input: {args.input}", file=sys.stderr)
    chunks = _load_input(args.input)
    print(f"  Chunks loaded: {len(chunks)}", file=sys.stderr)

    # Build config
    config = {
        "language": args.language,
        "top_k": args.top_k,
        "bottom_k": args.bottom_k,
    }

    # Analyze
    report = analyze_density_report(chunks, config)

    # Output
    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
