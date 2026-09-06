#!/usr/bin/env python3
"""
Semantic Bucketer CLI - 语义分桶器命令行工具

CLI interface for grouping Knowledge Units (SKUs) into buckets
based on tag overlap using the Union-Find algorithm.

Usage:
    python scripts/run.py --input skus.json --output buckets.json
    python scripts/run.py --input skus.json --threshold 0.3 --max-bucket-size 16
    python scripts/run.py --input skus.json --feature-fields tags category --pretty

Examples:
    # Basic usage with defaults (threshold=0.5, max_bucket_size=32)
    python scripts/run.py --input skus.json --output result.json

    # Tight threshold for fine-grained buckets
    python scripts/run.py --input skus.json --threshold 0.8 --output tight.json

    # Custom feature fields with dot notation
    python scripts/run.py --input skus.json --feature-fields context.applicable_objects domain_tags
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# 自包含：从同目录 core.py 导入
from core import bucket_and_report


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments.

    Args:
        argv: Argument list (defaults to sys.argv[1:]).

    Returns:
        Parsed arguments namespace.
    """
    parser = argparse.ArgumentParser(
        description="Semantic Bucketer - Group SKUs by tag overlap using Union-Find.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    parser.add_argument(
        "--input",
        "-i",
        type=str,
        required=True,
        help="Path to input JSON file containing a list of SKU dictionaries.",
    )

    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default="",
        help="Path to output JSON file. If omitted, prints to stdout.",
    )

    parser.add_argument(
        "--threshold",
        "-t",
        type=float,
        default=0.5,
        help="Overlap threshold (0.0-1.0) for bucketing. Default: 0.5.",
    )

    parser.add_argument(
        "--max-bucket-size",
        "-m",
        type=int,
        default=32,
        dest="max_bucket_size",
        help="Maximum bucket size before recursive refinement. Default: 32.",
    )

    parser.add_argument(
        "--no-refine",
        action="store_false",
        dest="refine_large",
        help="Disable recursive splitting of oversized buckets.",
    )

    parser.add_argument(
        "--feature-fields",
        "-f",
        type=str,
        nargs="+",
        default=None,
        dest="feature_fields",
        help="Feature field paths to extract (space-separated). "
        "Supports dot notation for nested fields. "
        "Default: applicable_objects domain_tags logic_type",
    )

    parser.add_argument(
        "--pretty",
        "-p",
        action="store_true",
        help="Pretty-print JSON output with indentation.",
    )

    parser.add_argument(
        "--quiet",
        "-q",
        action="store_true",
        help="Suppress diagnostic output (only output JSON).",
    )

    return parser.parse_args(argv)


def load_skus(path: str) -> list[dict[str, Any]]:
    """Load SKU list from a JSON file.

    Args:
        path: Path to JSON file. The file should contain either:
              - A list of SKU dicts directly, or
              - A dict with a "skus" key containing the list.

    Returns:
        List of SKU dictionaries.

    Raises:
        FileNotFoundError: If the input file does not exist.
        json.JSONDecodeError: If the file contains invalid JSON.
        ValueError: If the JSON structure is not as expected.
    """
    filepath = Path(path)
    if not filepath.exists():
        raise FileNotFoundError(f"Input file not found: {path}")

    with filepath.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        skus = data.get("skus")
        if skus is not None and isinstance(skus, list):
            return skus

    raise ValueError(
        f"Input JSON must be a list of SKUs or a dict with 'skus' key. "
        f"Got {type(data).__name__}."
    )


def write_output(data: dict[str, Any], path: str, pretty: bool) -> None:
    """Write results to a file or stdout.

    Args:
        data: Result dict to serialize.
        path: Output file path. If empty, writes to stdout.
        pretty: Whether to pretty-print with indentation.
    """
    json_kwargs: dict[str, Any] = {"ensure_ascii": False}
    if pretty:
        json_kwargs["indent"] = 2
        json_kwargs["sort_keys"] = True

    serialized = json.dumps(data, **json_kwargs)

    if path:
        Path(path).write_text(serialized + "\n", encoding="utf-8")
    else:
        sys.stdout.write(serialized + "\n")


def main(argv: list[str] | None = None) -> int:
    """Main entry point for the CLI.

    Args:
        argv: Command-line arguments (defaults to sys.argv[1:]).

    Returns:
        Exit code: 0 on success, 1 on error.
    """
    args = parse_args(argv)

    # ── Validate threshold ───────────────────────────────────────────────
    if not 0.0 <= args.threshold <= 1.0:
        if not args.quiet:
            print(
                f"Error: threshold must be between 0.0 and 1.0, got {args.threshold}.",
                file=sys.stderr,
            )
        return 1

    # ── Load SKUs ────────────────────────────────────────────────────────
    try:
        skus = load_skus(args.input)
    except (FileNotFoundError, json.JSONDecodeError, ValueError) as e:
        if not args.quiet:
            print(f"Error loading input: {e}", file=sys.stderr)
        return 1

    if not args.quiet:
        print(f"Loaded {len(skus)} SKU(s) from {args.input}.", file=sys.stderr)

    # ── Build config ─────────────────────────────────────────────────────
    config: dict[str, Any] = {
        "threshold": args.threshold,
        "max_bucket_size": args.max_bucket_size,
        "refine_large": args.refine_large,
    }
    if args.feature_fields is not None:
        config["feature_fields"] = args.feature_fields

    if not args.quiet:
        print(
            f"Bucketing with: threshold={args.threshold}, "
            f"max_size={args.max_bucket_size}, "
            f"refine={args.refine_large}",
            file=sys.stderr,
        )
        if args.feature_fields:
            print(f"Feature fields: {args.feature_fields}", file=sys.stderr)

    # ── Run bucketing ────────────────────────────────────────────────────
    try:
        result = bucket_and_report(skus, config)
    except Exception as e:
        if not args.quiet:
            print(f"Error during bucketing: {e}", file=sys.stderr)
        return 1

    # ── Report summary ───────────────────────────────────────────────────
    stats = result["statistics"]
    if not args.quiet:
        print(
            f"Done: {stats['total_buckets']} bucket(s), "
            f"{stats['total_skus']} SKU(s), "
            f"{stats['singletons']} singleton(s), "
            f"avg size {stats['avg_bucket_size']}",
            file=sys.stderr,
        )

    # ── Write output ─────────────────────────────────────────────────────
    try:
        write_output(result, args.output, args.pretty)
    except (OSError, IOError) as e:
        if not args.quiet:
            print(f"Error writing output: {e}", file=sys.stderr)
        return 1

    if not args.quiet and args.output:
        print(f"Output written to {args.output}.", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
