#!/usr/bin/env python3
"""
JTBD Analyzer - CLI entry point.

Usage:
    python run.py --input reviews.csv
    python run.py --input reviews.json --output jtbd_report.json --format json
    python run.py --input reviews.json --categories custom_categories.json
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any

try:
    from .core import JTBD_CATEGORIES, generate_jtbd_report
except ImportError:
    from core import JTBD_CATEGORIES, generate_jtbd_report


def _load_reviews(path: str) -> list[str]:
    """Load reviews from CSV or JSON."""
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File not found: {path}")

    suffix = path_obj.suffix.lower()

    if suffix == ".csv":
        reviews: list[str] = []
        with open(path_obj, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            # Try common column names for review text
            possible_columns = [
                "review",
                "review_text",
                "review text",
                "comment",
                "content",
                "text",
                "body",
                "评价",
                "评论",
                "内容",
            ]
            fieldnames = [c.strip().lower() for c in (reader.fieldnames or [])]
            col = None
            for candidate in possible_columns:
                if candidate in fieldnames:
                    col = candidate
                    break

            if col:
                for row in reader:
                    text = row.get(col, "").strip()
                    if text:
                        reviews.append(text)
            else:
                # Fallback: read first column
                for row in reader:
                    vals = list(row.values())
                    if vals and vals[0].strip():
                        reviews.append(vals[0].strip())

        return reviews

    elif suffix == ".json":
        data = json.loads(path_obj.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [str(item) if not isinstance(item, str) else item for item in data]
        elif isinstance(data, dict):
            # Try common keys
            for key in ("reviews", "comments", "data", "texts"):
                val = data.get(key, [])
                if isinstance(val, list):
                    return [str(v) for v in val if v]
        return []

    else:
        # Treat as plain text — one review per line
        lines = path_obj.read_text(encoding="utf-8").strip().split("\n")
        return [line.strip() for line in lines if line.strip()]


def _load_categories(path: str | None) -> dict[str, list[str]] | None:
    """Load custom JTBD categories from JSON."""
    if not path:
        return None
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return data
    return None


def _output_json(data: dict, output_path: str | None) -> None:
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    if output_path:
        Path(output_path).write_text(payload)
    else:
        print(payload)


def _output_text(data: dict, output_path: str | None) -> None:
    lines: list[str] = []

    summary = data.get("summary", {})
    lines.append("=" * 60)
    lines.append("JTBD Analysis Report")
    lines.append("=" * 60)
    lines.append(f"Reviews Analyzed: {summary.get('total_reviews_analyzed', 0)}")
    lines.append(f"Jobs Identified: {summary.get('total_jobs_identified', 0)}")
    lines.append(f"High Priority Opportunities: {summary.get('high_priority_opportunities', 0)}")
    lines.append(f"Medium Priority: {summary.get('medium_priority_opportunities', 0)}")
    if summary.get("sample_sufficiency"):
        ss = summary["sample_sufficiency"]
        lines.append(f"Sample: {ss.get('is_sufficient', False)} ({ss.get('actual_rows', 0)} rows)")
    lines.append("")

    # Key insight
    insight = summary.get("key_insight", "")
    if insight:
        lines.append(f"Key Insight: {insight}")
        lines.append("")

    # Jobs
    jobs = data.get("jobs", [])
    lines.append(f"--- Jobs ({len(jobs)}) ---")
    for job in jobs[:10]:
        lines.append(f"  [{job['job_type']}] freq={job['frequency']} — {', '.join(job['matched_phrases'][:3])}")
    if len(jobs) > 10:
        lines.append(f"  ... and {len(jobs) - 10} more")
    lines.append("")

    # Hiring criteria
    criteria = data.get("hiring_criteria", {})
    lines.append(f"--- Hiring Criteria --- Top: {', '.join(criteria.get('top_criteria', []))}")
    for c in criteria.get("criteria", []):
        lines.append(f"  {c['name']}: {c['frequency']} mentions")
    if criteria.get("recommendation"):
        lines.append(f"  >> {criteria['recommendation']}")
    lines.append("")

    # Switching triggers
    triggers = data.get("switching_triggers", {})
    lines.append(f"--- Switching Triggers ---")
    lines.append(f"  Push factors: {triggers.get('push_count', 0)}")
    lines.append(f"  Pull factors: {triggers.get('pull_count', 0)}")
    for t in (triggers.get("triggers") or [])[:5]:
        lines.append(f"  [{t['trigger_type']}] {', '.join(t['matched_phrases'][:2])} (intensity: {t['intensity']})")
    lines.append("")

    # Opportunity matrix
    opps = data.get("opportunity_matrix", [])
    lines.append(f"--- Opportunity Matrix ({len(opps)} items) ---")
    for opp in opps[:8]:
        lines.append(
            f"  [{opp['priority']}] {opp['category']}/{opp['job_type']}: "
            f"{opp['opportunity_score']:.2f} (importance={opp['importance']:.2f}, "
            f"satisfaction={opp['satisfaction']:.2f})"
        )
    if len(opps) > 8:
        lines.append(f"  ... and {len(opps) - 8} more")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="JTBD Analyzer")
    parser.add_argument(
        "--input",
        required=True,
        help="Path to reviews file (CSV, JSON, or TXT)",
    )
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--categories",
        help="Path to custom JTBD categories JSON (override default keyword mappings)",
    )
    parser.add_argument(
        "--importance-weight",
        type=float,
        default=0.6,
        help="Importance weight for opportunity formula (default: 0.6)",
    )
    parser.add_argument(
        "--satisfaction-weight",
        type=float,
        default=0.4,
        help="Satisfaction weight for opportunity formula (default: 0.4)",
    )
    args = parser.parse_args()

    reviews = _load_reviews(args.input)
    print(f"Loaded {len(reviews)} reviews from {args.input}", file=sys.stderr)

    categories = _load_categories(args.categories)
    if categories:
        print(f"Using custom JTBD categories: {list(categories.keys())}", file=sys.stderr)

    config = {
        "jtbd_categories": categories,
        "importance_weight": args.importance_weight,
        "satisfaction_weight": args.satisfaction_weight,
    }

    report = generate_jtbd_report(reviews, config)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
