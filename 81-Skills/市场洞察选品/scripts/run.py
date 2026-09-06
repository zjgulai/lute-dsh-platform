#!/usr/bin/env python3
"""
cbec-market-insight-selector - CLI entry point.

Usage:
    python run.py --evidence evidence.json --output assessment.json
    python run.py --evidence evidence.json --format text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import generate_opportunity_assessment


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
    scoring = data.get("scoring", {})
    classification = data.get("classification", {})
    strengths = data.get("top_strengths", [])
    risks = data.get("top_risks", [])

    lines.append("=" * 60)
    lines.append("Market Opportunity Assessment")
    lines.append("=" * 60)
    lines.append(f"Opportunity: {summary.get('opportunity_name', 'N/A')}")
    if summary.get("category"):
        lines.append(f"Category: {summary['category']}")
    lines.append(f"Weighted Score: {summary.get('weighted_score', 0)}/10 "
                 f"({summary.get('score_pct', 0)}%)")
    lines.append(f"Mode: {summary.get('mode', 'N/A')}")
    lines.append(f"Time Horizon: {summary.get('time_horizon', 'N/A')}")
    lines.append(f"Resource Level: {summary.get('resource_level', 'N/A')}")
    lines.append(f"Risk Level: {summary.get('risk_level', 'N/A')}")
    lines.append("")

    # Dimension scores
    lines.append("--- Dimension Scores ---")
    for dim in scoring.get("dimensions", []):
        bar = "=" * dim.get("score", 0) + "-" * (10 - dim.get("score", 0))
        lines.append(f"  {dim.get('label', '?'):25s} [{bar}] {dim.get('score', 0)}/10 "
                     f"(weight: {dim.get('weight', 0):.0%})")
    if scoring.get("validation_errors"):
        for err in scoring["validation_errors"]:
            lines.append(f"  ERROR: {err}")
    lines.append("")

    # Classification
    lines.append("--- Classification ---")
    lines.append(f"  Mode: {classification.get('mode', 'N/A')}")
    lines.append(f"  Description: {classification.get('description', '')}")
    lines.append(f"  Recommended: {classification.get('recommended_action', '')}")
    lines.append("")

    # Strengths
    if strengths:
        lines.append("--- Top Strengths ---")
        for s in strengths:
            lines.append(f"  + {s.get('dimension', '')} ({s.get('score', 0)}/10)")
            lines.append(f"    {s.get('detail', '')}")
    lines.append("")

    # Risks
    if risks:
        lines.append("--- Top Risks ---")
        for r in risks:
            lines.append(f"  ! {r.get('dimension', '')} ({r.get('score', 0)}/10)")
            lines.append(f"    {r.get('detail', '')}")
            lines.append(f"    Mitigation: {r.get('mitigation_suggestion', '')}")
    lines.append("")

    # Next step
    if data.get("context_notes"):
        lines.append(f"Context: {data['context_notes']}")
        lines.append("")

    lines.append("--- Recommended Next Step ---")
    lines.append(f"  {data.get('recommended_next_step', '')}")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="CBEC Market Insight Selector")
    parser.add_argument("--evidence", required=True, help="Path to evidence JSON with 5 dimension scores")
    parser.add_argument("--opportunity-name", help="Override opportunity name")
    parser.add_argument("--category", help="Override category")
    parser.add_argument("--context-notes", help="Additional context notes")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    evidence = _load_json(args.evidence)
    if not evidence:
        print("Error: evidence data must be provided", file=sys.stderr)
        sys.exit(1)

    config = {}
    if args.opportunity_name:
        config["opportunity_name"] = args.opportunity_name
    if args.category:
        config["category"] = args.category
    if args.context_notes:
        config["context_notes"] = args.context_notes

    report = generate_opportunity_assessment(evidence, config)
    validation_errors = report.get("scoring", {}).get("validation_errors", [])

    if validation_errors:
        for err in validation_errors:
            print(f"Validation error: {err}", file=sys.stderr)
        sys.exit(1)

    print(f"Opportunity '{report['summary']['opportunity_name']}': "
          f"score={report['summary']['weighted_score']}/10 "
          f"({report['summary']['mode']})",
          file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
