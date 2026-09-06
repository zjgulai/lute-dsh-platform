#!/usr/bin/env python3
"""
Semantic Document Chunker - CLI entry point.

Usage:
    python run.py --input document.md --output chunks.json --format json
    python run.py --input document.md --max-tokens 4000 --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import os as _os, sys as _sys
_SCRIPT_DIR = _os.path.dirname(_os.path.abspath(__file__))
_sys.path.insert(0, _SCRIPT_DIR)
from core import chunk_document


def _output_json(data: dict, output_path: str | None) -> None:
    if output_path:
        Path(output_path).write_text(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False))


def _output_text(data: dict, output_path: str | None) -> None:
    lines: list[str] = []

    meta = data.get("metadata", {})
    lines.append("=" * 60)
    lines.append("Semantic Document Chunker Report")
    lines.append("=" * 60)
    lines.append(f"Total chunks: {meta.get('total_chunks', 0)}")
    lines.append(f"Total tokens: {meta.get('total_tokens', 0)}")
    lines.append(f"Total chars: {meta.get('total_chars', 0)}")
    lines.append(f"Max tokens setting: {meta.get('max_tokens_setting', 'N/A')}")
    lines.append(
        f"Average chunk tokens: {meta.get('avg_chunk_tokens', 'N/A')}"
    )
    lines.append(f"Headers found: {meta.get('header_count', 0)}")
    lines.append("")

    lines.append("--- Chunks ---")
    for chunk in data.get("chunks", []):
        lines.append(
            f"  Chunk #{chunk['index']:3d} "
            f"(~{chunk.get('token_estimate', 0):5d} tokens)"
        )
        lines.append(f"    Path: {chunk.get('header_path', 'N/A')}")
        content_preview = chunk.get("content", "")[:80].replace("\n", " ")
        lines.append(f"    Preview: {content_preview}...")
        lines.append("")

    lines.append("--- Header Tree ---")

    def _render_tree(node: dict, indent: int = 0) -> list[str]:
        tree_lines: list[str] = []
        prefix = "  " * indent
        if node.get("level", 0) > 0:
            tree_lines.append(
                f"{prefix}H{node['level']}: {node.get('text', '')} "
                f"(pos={node.get('char_start', 0)})"
            )
        for child in node.get("children", []):
            tree_lines.extend(_render_tree(child, indent + 1))
        return tree_lines

    lines.extend(_render_tree(data.get("header_tree", {})))
    lines.append("")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Semantic Document Chunker")
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to markdown input file",
    )
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=8000,
        help="Maximum tokens per chunk (default: 8000)",
    )
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="json",
        help="Output format (default: json)",
    )
    args = parser.parse_args()

    # Read input
    print(f"Reading input: {args.input}", file=sys.stderr)
    with open(args.input) as f:
        content = f.read()
    print(f"  Content length: {len(content)} chars", file=sys.stderr)

    # Build config
    config = {"max_tokens": args.max_tokens}

    # Chunk document
    result = chunk_document(content, config)

    # Output
    if args.format == "json":
        _output_json(result, args.output)
    else:
        _output_text(result, args.output)


if __name__ == "__main__":
    main()
