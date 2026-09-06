#!/usr/bin/env python3
"""
Cross-Border Product Selection — CLI entry point.

Supports ASIN validation, variant expansion, SKU validation gating,
and CSV/JSON output formatting from pre-extracted product data.
"""

from __future__ import annotations

import argparse
import importlib
import json
import logging
import sys
from pathlib import Path

# ── Load core module from the hyphenated directory ───────
# The skill directory is "cross-border-product-selection" which is not a
# valid Python package name.  We load it via importlib using the file path.
_THIS_DIR = Path(__file__).resolve().parent
_SKILLS_ROOT = _THIS_DIR.parent.parent.parent  # skills/

if str(_SKILLS_ROOT) not in sys.path:
    sys.path.insert(0, str(_SKILLS_ROOT))

# Map hyphenated directory to underscore module name for importlib
_CORE_MODULE_PATH = _THIS_DIR / "core.py"
_spec = importlib.util.spec_from_file_location("cross_border_product_selection_core", _CORE_MODULE_PATH)
_core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_core)

extract_asins_from_list = _core.extract_asins_from_list
extract_asin_from_url = _core.extract_asin_from_url
expand_variants = _core.expand_variants
format_sku_csv = _core.format_sku_csv
format_sku_json = _core.format_sku_json
process_products = _core.process_products
validate_asin = _core.validate_asin
validate_product_data = _core.validate_product_data

logger = logging.getLogger("cross-border-product-selection")


# ═══════════════════════════════════════════════════════════
# Argument Parser
# ═══════════════════════════════════════════════════════════


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Cross-Border Product Selection — SKU validation & formatting pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  # Validate individual ASINs\n"
            "  %(prog)s --asin-list B0XXXXXXXX,B0YYYYYYYY\n\n"
            "  # Process pre-extracted product data from file\n"
            "  %(prog)s --product-data products.json --output results.csv\n\n"
            "  # Validate ASINs from a file and output JSON\n"
            "  %(prog)s --asin-file asins.txt --format json --strict\n\n"
            "  # Expand variants only (from product JSON)\n"
            "  %(prog)s --product-data product.json --expand-variants --output expanded.csv"
        ),
    )

    # Source options (mutually exclusive groups)
    source_group = parser.add_mutually_exclusive_group()
    source_group.add_argument(
        "--asin-list",
        type=str,
        help="Comma-separated list of ASINs or Amazon URLs",
    )
    source_group.add_argument(
        "--asin-file",
        type=str,
        help="File path with one ASIN or Amazon URL per line",
    )
    source_group.add_argument(
        "--product-data",
        type=str,
        help="JSON file containing pre-extracted product data (list or single product)",
    )

    # Output options
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="",
        help="Output file path (default: stdout)",
    )
    parser.add_argument(
        "--format", "-f",
        type=str,
        choices=["csv", "json"],
        default="csv",
        help="Output format (default: csv)",
    )

    # Processing options
    parser.add_argument(
        "--expand-variants",
        action="store_true",
        help="Expand variant combinations into individual SKU records",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Raise gate failures as errors (fail on any validation issue)",
    )
    parser.add_argument(
        "--source-type",
        type=str,
        choices=["asin_list", "category_page", "ranking_page", "keyword_search", "detail_page"],
        default="asin_list",
        help="Source type for the run summary (default: asin_list)",
    )
    parser.add_argument(
        "--run-id",
        type=str,
        default="",
        help="Custom run ID (auto-generated if omitted)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable debug logging",
    )

    # Query-only modes
    parser.add_argument(
        "--validate-asin",
        type=str,
        default="",
        help="Validate a single ASIN string and exit",
    )
    parser.add_argument(
        "--extract-url",
        type=str,
        default="",
        help="Extract ASIN from a single Amazon URL and exit",
    )

    return parser


# ═══════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════


def _load_source(args: argparse.Namespace):
    """Load source data from the CLI arguments.

    Returns (source_list, source_type_hint, run_notes).
    """
    source: list = []
    notes: list[str] = []

    if args.asin_list:
        raw = [a.strip() for a in args.asin_list.split(",") if a.strip()]
        asins = extract_asins_from_list(raw)
        source = asins
        notes.append(f"Parsed {len(asins)} valid ASINs from --asin-list ({len(raw)} raw items)")

    elif args.asin_file:
        path = Path(args.asin_file)
        if not path.exists():
            logger.error("ASIN file not found: %s", path)
            sys.exit(1)
        raw = [line.strip() for line in path.read_text().splitlines() if line.strip()]
        asins = extract_asins_from_list(raw)
        source = asins
        notes.append(f"Parsed {len(asins)} valid ASINs from {path.name} ({len(raw)} raw lines)")

    elif args.product_data:
        path = Path(args.product_data)
        if not path.exists():
            logger.error("Product data file not found: %s", path)
            sys.exit(1)
        data = json.loads(path.read_text())
        if isinstance(data, dict):
            source = [data]
        elif isinstance(data, list):
            source = data
        else:
            logger.error("Product data must be a JSON object or array")
            sys.exit(1)
        notes.append(f"Loaded {len(source)} product record(s) from {path.name}")

    else:
        logger.error("No source provided. Use --asin-list, --asin-file, or --product-data")
        sys.exit(1)

    return source, notes


def _write_output(output_str: str, path_str: str):
    """Write *output_str* to file or stdout."""
    if path_str:
        Path(path_str).write_text(output_str)
        logger.info("Output written to %s", path_str)
    else:
        sys.stdout.write(output_str)
        if not output_str.endswith("\n"):
            sys.stdout.write("\n")


# ═══════════════════════════════════════════════════════════
# Main Entry
# ═══════════════════════════════════════════════════════════


def main():
    parser = build_parser()
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    # ── Quick exit modes ──────────────────────────────────
    if args.validate_asin:
        result = validate_asin(args.validate_asin)
        output = json.dumps({
            "asin": args.validate_asin,
            "valid": result,
        }, indent=2)
        _write_output(output, args.output)
        return

    if args.extract_url:
        asin = extract_asin_from_url(args.extract_url)
        output = json.dumps({
            "url": args.extract_url,
            "extracted_asin": asin,
        }, indent=2)
        _write_output(output, args.output)
        return

    # ── Load source ───────────────────────────────────────
    source, source_notes = _load_source(args)

    # ── Quick exit: expand variants only (no full pipeline) ─
    if args.expand_variants and args.product_data:
        # Source is already a list of dicts
        all_skus: list[dict] = []
        for product in source:
            skus = expand_variants(product)
            all_skus.extend(skus)

        if args.format == "json":
            output_str = format_sku_json(all_skus)
        else:
            output_str = format_sku_csv(all_skus)

        summary = {
            "products_count": len(source),
            "sku_count": len(all_skus),
        }
        logger.info("Expanded %d variant(s) from %d product(s)", len(all_skus), len(source))
        _write_output(output_str, args.output)

        # If no output file, also write summary to stderr
        if not args.output:
            logger.info("Validation summary: %s", json.dumps(summary, indent=2))
        return

    # ── Full pipeline ─────────────────────────────────────
    config = {
        "run_id": args.run_id if args.run_id else None,
        "source_type": args.source_type,
        "strict": args.strict,
        "output_format": args.format,
    }

    result = process_products(source, config)

    # ── Write output ──────────────────────────────────────
    output_content = result.get("output", "")
    _write_output(output_content, args.output)

    # ── Print run summary to stderr (or stdout if no output file) ─
    summary = result["validation_summary"]
    run_id = result["run_id"]
    status = result["status"]
    notes = result.get("notes", [])

    # Build a human-readable summary
    summary_lines = [
        f"Run ID: {run_id}",
        f"Status: {status}",
        f"Source type: {args.source_type}",
        f"Products: {summary['products_count']}",
        f"SKU rows: {summary['sku_count']}",
        f"Passed: {summary['passed_count']}",
        f"Failed: {summary['failed_count']}",
    ]
    if summary["errors"]:
        summary_lines.append("Errors:")
        for e in summary["errors"]:
            summary_lines.append(f"  - {e}")
    if summary["warnings"]:
        summary_lines.append("Warnings:")
        for w in summary["warnings"]:
            summary_lines.append(f"  - {w}")

    summary_text = "\n".join(summary_lines)

    if args.output:
        # Write summary to a sidecar file
        out_path = Path(args.output)
        summary_path = out_path.with_name(f"{out_path.stem}_summary{out_path.suffix}")
        summary_path.write_text(summary_text)
        logger.info("Summary written to %s", summary_path)
        # Also print to stderr so the user sees it
        print(summary_text, file=sys.stderr)
    else:
        # Print summary after the output data
        print(f"\n{'='*40}", file=sys.stderr)
        print("Run Summary:", file=sys.stderr)
        print(summary_text, file=sys.stderr)

    # ── Exit code ─────────────────────────────────────────
    if status == "failure":
        sys.exit(1)
    elif status == "partial" and args.strict:
        sys.exit(1)


if __name__ == "__main__":
    main()
