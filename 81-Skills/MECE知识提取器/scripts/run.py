#!/usr/bin/env python3
"""
MECE Knowledge Extractor - CLI entry point.

Usage:
    python run.py --input chunks.json --output skus.json --format json
    python run.py --input chunks.json --density-file density.json --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import (
    build_extraction_prompt,
    estimate_target_count,
    parse_sku_response,
    process_extraction_results,
)


def _load_input(path: str) -> list[dict[str, Any]]:
    """Load and parse JSON input file of chunks."""
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "chunks" in data:
        return data["chunks"]
    msg = "Input must be a JSON array of chunks or dict with 'chunks' key"
    raise ValueError(msg)


def _load_density(path: str | None) -> dict[str, Any]:
    """Load optional density data."""
    if not path:
        return {}
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, dict):
        return data
    return {}


def _output_json(data: dict[str, Any], output_path: str | None) -> None:
    if output_path:
        Path(output_path).write_text(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False))


def _output_text(data: dict[str, Any], output_path: str | None) -> None:
    lines: list[str] = []

    summary = data.get("summary", {})
    lines.append("=" * 60)
    lines.append("MECE Knowledge Extractor Report")
    lines.append("=" * 60)
    lines.append(f"Total SKUs extracted: {summary.get('total_skus', 0)}")
    lines.append(
        f"Valid: {summary.get('valid_count', 0)} / "
        f"Invalid: {summary.get('invalid_count', 0)}"
    )
    lines.append(f"Pass rate: {summary.get('pass_rate', 0)}%")
    lines.append("")

    lines.append("--- Validation Results ---")
    for sku in data.get("validated_skus", []):
        status = "PASS" if sku["is_valid"] else "FAIL"
        lines.append(f"  [{status}] {sku['sku_id']}")
        for err in sku.get("errors", []):
            lines.append(f"    ERROR: {err}")
        for warn in sku.get("warnings", []):
            lines.append(f"    WARN: {warn}")

    if data.get("errors"):
        lines.append(f"\n--- Errors ({len(data['errors'])}) ---")
        for err_item in data["errors"]:
            for err in err_item.get("errors", []):
                lines.append(f"  [{err_item['sku_id']}] {err}")

    if data.get("warnings"):
        lines.append(f"\n--- Warnings ({len(data['warnings'])}) ---")
        for warn_item in data["warnings"]:
            for warn in warn_item.get("warnings", []):
                lines.append(f"  [{warn_item['sku_id']}] {warn}")

    if "prompts" in data:
        lines.append("\n--- Generated Prompts ---")
        for prompt_item in data["prompts"]:
            chunk_id = prompt_item.get("chunk_id", "?")
            count = prompt_item.get("target_count", 0)
            lines.append(f"\n  Chunk {chunk_id} (target: {count} SKUs):")
            lines.append(f"  {'-' * 40}")
            prompt_text = prompt_item.get("prompt", "")
            for prompt_line in prompt_text.split("\n"):
                lines.append(f"  {prompt_line}")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="MECE Knowledge Extractor")
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to JSON input file (array of chunks with id, content)",
    )
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument(
        "--density-file",
        help="Path to density analysis JSON (optional, enables density-adjusted estimation)",
    )
    parser.add_argument(
        "--schema-version",
        default="v2",
        help="Schema version for validation (default: v2)",
    )
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--generate-prompts",
        action="store_true",
        help="Generate extraction prompts without calling LLM",
    )
    parser.add_argument(
        "--language",
        default="zh",
        help="Prompt language: zh or en (default: zh)",
    )
    parser.add_argument(
        "--sku-response",
        help="Path to file containing LLM response text to parse (optional)",
    )
    args = parser.parse_args()

    # Load input
    print(f"Loading input: {args.input}", file=sys.stderr)
    chunks = _load_input(args.input)
    print(f"  Chunks loaded: {len(chunks)}", file=sys.stderr)

    # Load density data
    density_data = _load_density(args.density_file)
    print(f"  Density data: {'loaded' if density_data else 'not provided'}", file=sys.stderr)

    # If --sku-response is provided, just parse the response
    if args.sku_response:
        with open(args.sku_response) as f:
            response_text = f.read()
        raw_skus = parse_sku_response(response_text)
        result = process_extraction_results(raw_skus)
        if args.format == "json":
            _output_json(result, args.output)
        else:
            _output_text(result, args.output)
        return

    # Build config
    config = {
        "schema_version": args.schema_version,
        "language": args.language,
    }

    # Process each chunk
    all_prompts: list[dict[str, Any]] = []
    all_skus: list[dict[str, Any]] = []

    for chunk in chunks:
        # Estimate target count
        chunk_density = density_data.get(chunk.get("id", ""), {}) if density_data else None
        target_count = estimate_target_count(chunk, chunk_density)

        # Build prompt
        prompt = build_extraction_prompt(chunk, target_count, config)

        chunk_id = chunk.get("id", chunk.get("index", "unknown"))
        all_prompts.append({
            "chunk_id": chunk_id,
            "target_count": target_count,
            "prompt": prompt,
        })

        # If --generate-prompts, we stop here (no SKU response to parse)
        if not args.generate_prompts:
            # In a real workflow, the prompt would be sent to an LLM
            # Here we record that the prompt is ready
            pass

    if args.generate_prompts:
        result: dict[str, Any] = {
            "summary": {
                "total_chunks": len(chunks),
                "total_estimated_skus": sum(p["target_count"] for p in all_prompts),
                "max_per_chunk": max(p["target_count"] for p in all_prompts) if all_prompts else 0,
                "min_per_chunk": min(p["target_count"] for p in all_prompts) if all_prompts else 0,
            },
            "prompts": all_prompts,
        }
    else:
        # Validate any passed SKUs
        result = process_extraction_results(all_skus)
        result["prompts"] = all_prompts

    # Output
    if args.format == "json":
        _output_json(result, args.output)
    else:
        _output_text(result, args.output)


if __name__ == "__main__":
    main()
