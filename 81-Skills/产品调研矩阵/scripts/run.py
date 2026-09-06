#!/usr/bin/env python3
"""
Product Research Matrix - CLI entry point.

Usage:
    python run.py --candidates candidates.json
    python run.py --candidates candidates.json --dimensions custom_dims.json --output matrix.json --format json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .core import define_evaluation_dimensions, generate_opportunity_matrix


def _load_json(path: str) -> dict | list:
    with open(path) as f:
        return json.load(f)


def _output_json(data: dict, output_path: str | None) -> None:
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    if output_path:
        Path(output_path).write_text(payload)
    else:
        print(payload)


def _output_text(data: dict, output_path: str | None) -> None:
    lines: list[str] = []

    lines.append("=" * 60)
    lines.append(f"{data.get('matrix_name', 'Product Opportunity Matrix')}")
    lines.append("=" * 60)
    lines.append("")

    rec = data.get("recommendation_summary", {})
    lines.append(f"Recommendation: {rec.get('recommendation', 'N/A')}")
    lines.append(f"Best Candidate: {rec.get('best_candidate', 'N/A')}")
    lines.append(f"Average Score: {rec.get('average_score', 'N/A')}")
    lines.append(f"Candidates Analyzed: {rec.get('total_candidates_analyzed', 0)}")
    lines.append("")

    lines.append("--- Rankings ---")
    for s in (data.get("ranked_opportunities") or []):
        flags = ""
        if s.get("risk_flags"):
            flags = f" [RISKS: {len(s['risk_flags'])}]"
        lines.append(f"  #{s['rank']} {s['candidate_name']}: {s['weighted_score']}/10{flags}")
        best_dims = [d for d in s.get("dimension_scores", []) if d["score"] >= 7]
        worst_dims = [d for d in s.get("dimension_scores", []) if d["score"] <= 4]
        if best_dims:
            lines.append(f"     Strengths: {', '.join(d['label'] for d in best_dims)}")
        if worst_dims:
            lines.append(f"     Weaknesses: {', '.join(d['label'] for d in worst_dims)}")
    lines.append("")

    top = data.get("top_opportunities", [])
    if top:
        lines.append("--- Top Opportunities ---")
        for opp in top:
            lines.append(f"  #{opp['rank']} {opp['candidate']} ({opp['score']}/10)")
            if opp.get("key_strengths"):
                lines.append(f"     Strengths: {', '.join(opp['key_strengths'])}")
            if opp.get("key_weaknesses"):
                lines.append(f"     Weaknesses: {', '.join(opp['key_weaknesses'])}")
        lines.append("")

    risks = data.get("risk_summary", {})
    if risks.get("top_risks"):
        lines.append("--- Top Risks ---")
        for r in risks["top_risks"]:
            lines.append(f"  {r['risk']} (seen {r['count']} times)")
        if risks.get("high_risk_candidates"):
            lines.append("  High-risk candidates:")
            for hc in risks["high_risk_candidates"]:
                lines.append(f"    {hc['name']} ({hc['score']}/10)")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Product Research Matrix")
    parser.add_argument("--candidates", required=True, help="Path to candidates JSON array")
    parser.add_argument("--dimensions", help="Path to custom dimensions JSON (override weights, rubrics)")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    candidates_raw = _load_json(args.candidates)
    if isinstance(candidates_raw, dict):
        # Support both array and object with 'candidates' key
        candidates = candidates_raw.get("candidates", [candidates_raw])
    else:
        candidates = candidates_raw

    dimensions = define_evaluation_dimensions()
    if args.dimensions:
        custom_dims = _load_json(args.dimensions)
        if isinstance(custom_dims, list):
            dimensions = define_evaluation_dimensions(custom_dims)
        elif isinstance(custom_dims, dict):
            # Single dimension override or file with 'dimensions' key
            dims_list = custom_dims.get("dimensions", [custom_dims])
            dimensions = define_evaluation_dimensions(dims_list)

    print(f"Analyzing {len(candidates)} candidates across {len(dimensions)} dimensions", file=sys.stderr)

    matrix = generate_opportunity_matrix(candidates, dimensions)

    if args.format == "json":
        _output_json(matrix, args.output)
    else:
        _output_text(matrix, args.output)


if __name__ == "__main__":
    main()
