#!/usr/bin/env python3
"""
Unified CLI entry point for Amazon Sorftime Research.

Orchestrates the full data pipeline:
  validate input -> fetch (if needed) -> validate output -> print results
"""

import argparse
import importlib.util
import sys
from pathlib import Path
from typing import Optional

# 自包含加载同目录脚本（文件名含连字符，无法直接 import）
_HERE = Path(__file__).resolve().parent


def _load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, _HERE / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_fetch_mod = _load_module("fetch_amazon_data", "fetch-amazon-data.py")
_validate_mod = _load_module("validate_data", "validate-data.py")

fetch_main = _fetch_mod.main
DataFetchError = _fetch_mod.DataFetchError
validate_csv = _validate_mod.validate_csv


STD_FIELDS = ['asin', 'title', 'category', 'price', 'rating', 'review_count', 'bsr']


def run_pipeline(input_file: str, output_file: str, verbose: bool) -> int:
    """Run validate -> fetch -> re-validate -> report."""
    if verbose:
        print(f"[1/4] Validating input: {input_file}")

    in_errors, in_warnings = validate_csv(input_file)
    if in_errors:
        print(f"Input validation FAILED ({len(in_errors)} errors):")
        for e in in_errors:
            print(f"  - {e}")
        return 1

    if verbose:
        print(f"  Input OK ({len(in_warnings)} warnings)" if in_warnings else "  Input OK")

    # Step 2: fetch (read CSV, canonicalize fields)
    if verbose:
        print(f"[2/4] Fetching/reading data from: {input_file}")

    exit_code = fetch_main(['--input', input_file, '--output', output_file, '--validate'])
    if exit_code != 0:
        if verbose:
            print("Fetch step reported errors.")
        return exit_code

    if verbose:
        print("  Fetch complete.")

    # Step 3: validate output
    if verbose:
        print(f"[3/4] Validating output: {output_file}")

    out_errors, out_warnings = validate_csv(output_file)
    if verbose:
        if out_warnings:
            for w in out_warnings:
                print(f"  Warning: {w}")

    # Step 4: print results summary
    if verbose:
        print("[4/4] Results summary")

    with open(output_file, 'r') as f:
        import csv
        rows = list(csv.DictReader(f))

    print(f"\nResults")
    print("=" * 40)
    print(f"Input file:  {input_file}")
    print(f"Output file: {output_file}")
    print(f"Records:     {len(rows)}")
    print(f"Warnings:    {len(out_warnings)}")

    if out_errors:
        print(f"Errors:      {len(out_errors)}")
        for e in out_errors:
            print(f"  - {e}")
        return 1

    if rows:
        print(f"Status:      OK")
        if verbose:
            print(f"\nFirst 3 rows:")
            for r in rows[:3]:
                print(f"  ASIN={r.get('asin','')}  Price={r.get('price','')}  "
                      f"Rating={r.get('rating','')}  Category={r.get('category','')}")
    else:
        print("Status:      Empty dataset (no records)")
        return 1

    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Amazon Sorftime Research - unified CLI pipeline"
    )
    parser.add_argument('--input', required=True, help='Input CSV file')
    parser.add_argument('--output', required=True, help='Output CSV file')
    parser.add_argument('--format', choices=['csv'], default='csv',
                        help='Data format (default: csv)')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Show detailed step-by-step output')
    parser.add_argument('--validate-only', action='store_true',
                        help='Only validate the input file, skip fetch')
    parser.add_argument('--strict', action='store_true',
                        help='Treat warnings as errors')

    args = parser.parse_args(argv)

    if args.validate_only:
        errors, warnings = validate_csv(args.input)
        print(f"Validation results for: {args.input}")
        if errors:
            for e in errors:
                print(f"  ERROR: {e}")
        if warnings:
            for w in warnings:
                print(f"  WARNING: {w}")
        if not errors and not warnings:
            print("  All validations passed.")
        if errors or (args.strict and warnings):
            return 1
        return 0

    return run_pipeline(args.input, args.output, args.verbose)


if __name__ == '__main__':
    sys.exit(main())
