#!/usr/bin/env python3
"""
seo-content-optimizer - CLI entry point.

Usage:
    python run.py --content article.html --keywords '["keyword1","keyword2"]' --output report.json
    python run.py --content article.html --keywords kw.json --site-links links.json --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import generate_content_optimization_report


def _load_json(path: str | None) -> Any:
    if not path:
        return None
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return json.loads(path_obj.read_text(encoding="utf-8"))


def _load_text(path: str) -> str:
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return path_obj.read_text(encoding="utf-8")


def _parse_keywords(value: str) -> list[str]:
    """Parse keywords from a JSON array string or a file path."""
    if not value:
        return []
    # Try as file path first
    try:
        data = _load_json(value)
        if isinstance(data, list):
            return data
        return []
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    # Try as inline JSON array
    try:
        data = json.loads(value)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass
    # Fallback: comma-separated
    return [k.strip() for k in value.split(",") if k.strip()]


def _output_json(data: dict, output_path: str | None) -> None:
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    if output_path:
        Path(output_path).write_text(payload)
    else:
        print(payload)


def _output_text(data: dict, output_path: str | None) -> None:
    lines: list[str] = []
    summary = data.get("summary", {})
    fixes = data.get("priority_fixes", {})
    density = data.get("keyword_density", {})
    headings = data.get("heading_structure", {})
    readability = data.get("readability", {})
    internal = data.get("internal_linking", {})

    lines.append("=" * 60)
    lines.append("SEO Content Optimization Report")
    lines.append("=" * 60)
    lines.append(f"Word Count: {summary.get('total_word_count', 0)}")
    lines.append(f"Keyword Density: {summary.get('keyword_density_pct', 0)}%")
    lines.append(f"Readability: {summary.get('readability_score', 0)} "
                 f"({summary.get('readability_interpretation', 'N/A')})")
    lines.append(f"Internal Links: {summary.get('internal_links_count', 0)}")
    lines.append(f"H1 Count: {summary.get('h1_count', 0)}")
    lines.append("")

    # Priority fixes
    lines.append("--- Critical Fixes ---")
    for fix in fixes.get("critical", []):
        lines.append(f"  [SEV {fix.get('severity', 0)}/10] {fix.get('issue', '')}")
        lines.append(f"    {fix.get('details', '')}")
        lines.append(f"    -> {fix.get('recommendation', '')}")
    if not fixes.get("critical"):
        lines.append("  No critical issues found.")
    lines.append("")

    lines.append("--- Important Fixes ---")
    for fix in fixes.get("important", []):
        lines.append(f"  [SEV {fix.get('severity', 0)}/10] {fix.get('issue', '')}")
        lines.append(f"    {fix.get('details', '')}")
        lines.append(f"    -> {fix.get('recommendation', '')}")
    if not fixes.get("important"):
        lines.append("  No important issues found.")
    lines.append("")

    lines.append("--- Nice-to-Have Improvements ---")
    for fix in fixes.get("nice_to_have", []):
        lines.append(f"  [SEV {fix.get('severity', 0)}/10] {fix.get('issue', '')}")
    if not fixes.get("nice_to_have"):
        lines.append("  No nice-to-have improvements.")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="SEO Content Optimizer")
    parser.add_argument("--content", required=True, help="Path to content file (HTML or text)")
    parser.add_argument("--keywords", required=True, help="JSON array of keywords or file path or comma-separated")
    parser.add_argument("--site-links", help="Path to site links JSON for internal link analysis")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    content = _load_text(args.content)
    keywords = _parse_keywords(args.keywords)

    if not content.strip():
        print("Error: content file is empty", file=sys.stderr)
        sys.exit(1)

    if not keywords:
        print("Error: at least one keyword is required", file=sys.stderr)
        sys.exit(1)

    config = {}
    site_links = _load_json(args.site_links)
    if site_links:
        config["site_links"] = site_links

    report = generate_content_optimization_report(content, keywords, config)
    print(f"Content optimization: {report['summary']['critical_fixes']} critical, "
          f"{report['summary']['important_fixes']} important, "
          f"{report['summary']['nice_to_have_fixes']} nice-to-have fixes",
          file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
