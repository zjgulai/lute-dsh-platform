#!/usr/bin/env python3
"""
seo-multilingual - CLI entry point.

Usage:
    python run.py --markets markets.json --pages pages.json --default-locale en --output plan.json
    python run.py --markets markets.json --output architecture.json --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:  # 包内运行：python -m scripts.run
    from .core import (
        generate_hreflang_tags,
        validate_hreflang_config,
        suggest_site_architecture,
        generate_multilingual_seo_plan,
    )
except ImportError:  # 独立运行：python scripts/run.py（自包含，无需 skills._shared）
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from core import (
        generate_hreflang_tags,
        validate_hreflang_config,
        suggest_site_architecture,
        generate_multilingual_seo_plan,
    )


def _load_json(path: str | None) -> Any:
    if not path:
        return None
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return json.loads(path_obj.read_text(encoding="utf-8"))


def _output_json(data: dict, output_path: str | None) -> None:
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    if output_path:
        Path(output_path).write_text(payload)
    else:
        print(payload)


def _output_text(data: dict, output_path: str | None) -> None:
    lines: list[str] = []
    summary = data.get("summary", {})
    architecture = data.get("architecture", {})
    hreflang = data.get("hreflang", {})
    validation = data.get("hreflang_validation", [])
    priority = data.get("content_localization_priority", [])
    checklist = data.get("technical_checklist", [])

    lines.append("=" * 60)
    lines.append("Multilingual SEO Plan")
    lines.append("=" * 60)
    lines.append(f"Markets: {summary.get('markets_count', 0)}")
    lines.append(f"Pages: {summary.get('pages_count', 0)}")
    lines.append(f"Architecture: {summary.get('architecture', 'N/A')}")
    lines.append(f"Hreflang Entries: {summary.get('hreflang_entries', 0)}")
    lines.append(f"x-default: {'Present' if summary.get('x_default_present') else 'Missing'}")
    lines.append(f"Validation Issues: {summary.get('validation_issues', 0)}")
    lines.append("")

    # Architecture
    lines.append("--- Architecture Recommendation ---")
    arch_summary = architecture.get("summary", {})
    lines.append(f"  Recommended: {arch_summary.get('architecture', 'N/A')}")
    lines.append(f"  Note: {arch_summary.get('note', '')}")
    lines.append("")

    if architecture.get("recommendations"):
        lines.append("--- URL Patterns ---")
        for rec in architecture.get("recommendations", []):
            lines.append(f"  {rec.get('locale', '')}: {rec.get('recommended_url_pattern', '')}")

    lines.append("")

    # Hreflang
    lines.append("--- Hreflang Tags ---")
    hreflang_html = hreflang.get("html", "")
    if hreflang_html:
        lines.append(hreflang_html)
    else:
        lines.append("  No hreflang tags generated.")

    lines.append("")

    # Validation issues
    if validation:
        lines.append("--- Hreflang Validation ---")
        for issue in validation:
            sev = issue.get("severity", "info")
            marker = "ERROR" if sev == "error" else "WARN"
            lines.append(f"  [{marker}] {issue.get('message', '')}")
    lines.append("")

    # Content priority
    if priority:
        lines.append("--- Content Localization Priority ---")
        for p in priority[:10]:
            lines.append(f"  [{p.get('priority_tier', '?').upper()}] "
                         f"{p.get('locale', '')}: {p.get('title', '')[:60]}")
    lines.append("")

    # Technical checklist
    if checklist:
        lines.append("--- Technical Checklist ---")
        for item in checklist:
            status = "[x]" if item.get("done") else "[ ]"
            lines.append(f"  {status} {item.get('item', '')}")
        lines.append("")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="SEO Multilingual Optimizer")
    parser.add_argument("--markets", required=True, help="Path to target markets JSON")
    parser.add_argument("--pages", help="Path to pages JSON (array of {url, locale} dicts)")
    parser.add_argument("--default-locale", default="", help="Default locale (e.g., en, en-US)")
    parser.add_argument("--site-url", help="Base site URL (e.g., https://example.com)")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    markets = _load_json(args.markets)
    if not markets:
        print("Error: markets data must be provided", file=sys.stderr)
        sys.exit(1)

    pages = _load_json(args.pages) or []

    config = {
        "default_locale": args.default_locale,
        "site_url": args.site_url or "",
    }

    report = generate_multilingual_seo_plan(markets, pages, config)
    print(f"Multilingual plan: {report['summary']['markets_count']} markets, "
          f"architecture={report['summary']['architecture']}, "
          f"{report['summary']['hreflang_entries']} hreflang entries",
          file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
