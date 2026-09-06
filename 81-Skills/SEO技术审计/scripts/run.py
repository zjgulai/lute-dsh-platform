#!/usr/bin/env python3
"""
seo-technical-audit - CLI entry point.

Usage:
    python run.py --site-data site_metrics.json --sitemap sitemap.json --output audit.json
    python run.py --site-data site_metrics.json --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import generate_technical_audit_report


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
    speed = data.get("page_speed_audit", {})
    mobile = data.get("mobile_friendly_check", {})
    robots = data.get("robots_analysis", {})
    index_issues = data.get("index_issues", [])
    health = data.get("overall_health", {})
    fixes = data.get("priority_fixes", [])

    lines.append("=" * 60)
    lines.append("Technical SEO Audit Report")
    lines.append("=" * 60)
    lines.append(f"URL: {summary.get('url', 'N/A')}")
    lines.append(f"Overall Health: {health.get('score', 0)}/100 ({health.get('label', 'N/A')})")
    lines.append(f"  Speed Score: {summary.get('speed_score', 0)}/100")
    lines.append(f"  Mobile Score: {summary.get('mobile_score', 0)}/100")
    lines.append(f"  Crawl Score: {summary.get('crawl_score', 0)}/100")
    lines.append(f"  Index Score: {summary.get('index_score', 0)}/100")
    lines.append(f"Priority Fixes: {summary.get('priority_fixes_count', 0)}")
    lines.append("")

    # Page speed
    lines.append("--- Page Speed ---")
    for metric, result in speed.get("metrics", {}).items():
        lines.append(f"  {metric.upper()}: {result.get('value', '?')} ({result.get('rating', '?')})")
    lines.append(f"  Overall: {speed.get('overall_score', 0)}/100 ({speed.get('overall_rating', 'N/A')})")
    lines.append("")

    # Mobile
    lines.append("--- Mobile Friendliness ---")
    for check in mobile.get("checks", []):
        status_char = "+" if check.get("status") == "pass" else "!" if check.get("status") == "warning" else "X"
        lines.append(f"  [{status_char}] {check.get('check', '')}: {check.get('status', '')}")
    lines.append(f"  Score: {mobile.get('overall_score', 0)}/100")
    lines.append("")

    # Robots.txt
    lines.append("--- Robots.txt ---")
    lines.append(f"  Sitemap Referenced: {robots.get('sitemap_referenced', False)}")
    lines.append(f"  Score: {robots.get('score', 0)}/100")
    for issue in robots.get("issues", []):
        lines.append(f"  ! {issue}")
    lines.append("")

    # Index issues
    if index_issues:
        lines.append("--- Index Issues ---")
        for issue in index_issues:
            lines.append(f"  [{issue.get('severity', 'medium')}] {issue.get('type', '')}: {issue.get('count', 0)} URLs")
    lines.append("")

    # Priority fixes
    lines.append("--- Priority Fixes ---")
    for fix in fixes[:10]:
        lines.append(f"  [{fix.get('priority', 'medium').upper()}] [{fix.get('category', '')}] {fix.get('action', '')}")
    if len(fixes) > 10:
        lines.append(f"  ... and {len(fixes) - 10} more fixes")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="SEO Technical Audit")
    parser.add_argument("--site-data", required=True, help="Path to site data JSON (speed, mobile, robots metrics)")
    parser.add_argument("--sitemap", help="Path to sitemap entries JSON and indexed URLs")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    site_data = _load_json(args.site_data)
    if not site_data:
        print("Error: site-data must be provided", file=sys.stderr)
        sys.exit(1)

    # Merge sitemap/index data if provided separately
    if args.sitemap:
        sitemap_data = _load_json(args.sitemap)
        if sitemap_data:
            if "sitemap_entries" not in site_data and "sitemap_entries" in sitemap_data:
                site_data["sitemap_entries"] = sitemap_data["sitemap_entries"]
            if "indexed_urls" not in site_data and "indexed_urls" in sitemap_data:
                site_data["indexed_urls"] = sitemap_data["indexed_urls"]

    report = generate_technical_audit_report(site_data)
    print(f"Technical audit for {report['summary']['url']}: "
          f"health={report['summary']['overall_health_pct']}% ({report['summary']['health_label']})",
          file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
