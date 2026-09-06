#!/usr/bin/env python3
"""
cbec-intelligence-radar - CLI entry point.

Usage:
    python run.py --sources sources.json
    python run.py --sources sources.json --template weekly --archive-dir ./archive --output briefing.md
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import generate_intelligence_brief


def _load_json(path: str) -> Any:
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return json.loads(path_obj.read_text(encoding="utf-8"))


def _load_archive(archive_dir: str) -> list[dict]:
    """Load all JSON files in archive directory as archived items."""
    archive_path = Path(archive_dir)
    if not archive_path.exists() or not archive_path.is_dir():
        print(f"Archive directory not found: {archive_dir}", file=sys.stderr)
        return []

    items: list[dict] = []
    for f in sorted(archive_path.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, list):
                items.extend(data)
            elif isinstance(data, dict):
                items.append(data)
        except (json.JSONDecodeError, OSError) as e:
            print(f"  Skipping {f.name}: {e}", file=sys.stderr)

    print(f"Loaded {len(items)} archived items from {archive_dir}", file=sys.stderr)
    return items


def _output_briefing(data: dict, output_format: str, output_path: str | None) -> None:
    if output_format == "json":
        payload = json.dumps(data, indent=2, ensure_ascii=False)
        if output_path:
            Path(output_path).write_text(payload)
        else:
            print(payload)
    else:
        # Text output outputs the markdown
        markdown = data.get("briefing_markdown", "No briefing generated.")
        if output_path:
            Path(output_path).write_text(markdown)
        else:
            print(markdown)


def main() -> None:
    parser = argparse.ArgumentParser(description="CBEC Intelligence Radar")
    parser.add_argument("--sources", help="Path to sources JSON file")
    parser.add_argument(
        "--template", choices=["daily", "weekly"], default="daily",
        help="Briefing template type (default: daily)",
    )
    parser.add_argument("--archive-dir", help="Directory with archived items for dedup")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format. 'text' outputs markdown briefing (default: text). "
             "'json' outputs full data.",
    )
    parser.add_argument("--date", help="Briefing date (YYYY-MM-DD, default: today)")
    args = parser.parse_args()

    sources = {}
    if args.sources:
        sources = _load_json(args.sources)
        if isinstance(sources, list):
            sources = {"items": sources}
        print(f"Loaded sources: {len(sources.get('items', []))} items", file=sys.stderr)

    if args.archive_dir:
        sources["archive"] = _load_archive(args.archive_dir)

    config: dict[str, Any] = {
        "template": args.template,
    }
    if args.date:
        config["date"] = args.date

    report = generate_intelligence_brief(sources, config)
    summary = report.get("summary", {})
    print(f"Briefing generated: {summary.get('total_items_processed', 0)} items, "
          f"{summary.get('stale_items_removed', 0)} stale removed, "
          f"top: {', '.join(summary.get('top_hot_skills', []))}", file=sys.stderr)

    _output_briefing(report, args.format, args.output)


if __name__ == "__main__":
    main()
