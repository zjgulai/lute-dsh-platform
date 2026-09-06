#!/usr/bin/env python3
"""
cbec-tech-pack-generator - CLI entry point.

Usage:
    python run.py --spec spec.json
    python run.py --spec spec.json --material-type silicone --category feeding --output techpack.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import generate_tech_pack


def _load_json(path: str) -> Any:
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
    product = data.get("product", {})
    dfm = data.get("dfm_findings", [])
    compliance = data.get("compliance_checklist", [])
    bom = data.get("bom", {})
    qa = data.get("qa_template", [])
    risk = data.get("manufacturing_risk_summary", {})

    lines.append("=" * 60)
    lines.append(f"Tech Pack: {product.get('name', 'Unnamed')}")
    lines.append("=" * 60)
    lines.append(f"Material: {product.get('material', '?')}")
    lines.append(f"Category: {product.get('category', '?')}")
    lines.append("")

    # DFM
    lines.append(f"--- DFM Review ({len(dfm)} checks) ---")
    high_count = sum(1 for f in dfm if f.get("severity") == "high" and f.get("status") == "flagged")
    lines.append(f"  High-risk issues: {high_count}")
    for f in dfm:
        status_char = "!" if f.get("status") == "flagged" else "."
        lines.append(f"  [{status_char}] [{f['severity'].upper()}] {f.get('issue', '?')}: {f.get('spec_value', '')}")
        lines.append(f"    Fix: {f.get('fix', '')}")
    lines.append("")

    # Compliance
    lines.append(f"--- Compliance Checklist ({len(compliance)} items) ---")
    high_comp = sum(1 for c in compliance if c.get("severity") == "high")
    lines.append(f"  High-severity checks: {high_comp}")
    for c in compliance:
        lines.append(f"  [{c.get('severity', '?').upper()}] {c.get('section', '?')}: {c.get('check', '?')}")
        lines.append(f"    Requirement: {c.get('requirement', '')}")
    lines.append("")

    # BOM
    lines.append(f"--- Bill of Materials ---")
    for item in bom.get("bom", []):
        cost = item.get("estimated_cost", 0) * item.get("quantity", 1)
        lines.append(f"  {item.get('component_name', '?')}: {item.get('quantity', 1)}x {item.get('material', '?')} (est. ${cost})")
    lines.append(f"  Total est. cost: ${bom.get('total_estimated_cost', 0)}")
    lines.append(f"  Assembly sequence: {' -> '.join(bom.get('assembly_sequence', []))}")
    if bom.get("top_risk_components"):
        lines.append(f"  Risk components: {', '.join(bom['top_risk_components'])}")
    lines.append("")

    # QA template
    lines.append(f"--- Factory QA Questions ({len(qa)} questions) ---")
    for q in qa[:8]:
        lines.append(f"  - {q}")
    lines.append("")

    # Risk summary
    lines.append("--- Manufacturing Risk Summary ---")
    lines.append("  Most likely manufacturing risks:")
    for r in risk.get("most_likely_manufacturing_risk", []):
        lines.append(f"    - {r}")
    lines.append("  Priority for prototype validation:")
    for p in risk.get("priority_prototype_validation", []):
        lines.append(f"    - {p}")
    lines.append("  Priority for compliance confirmation:")
    for p in risk.get("priority_compliance_confirmation", []):
        lines.append(f"    - {p}")

    output = "\n".join(lines)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="CBEC Tech Pack Generator")
    parser.add_argument("--spec", required=True, help="Path to product spec JSON")
    parser.add_argument(
        "--material-type",
        choices=["injection_mold", "silicone", "textile", "small_appliance", "wood"],
        help="Material type for DFM review (default: from spec)",
    )
    parser.add_argument("--category", default="general", help="Product category for compliance checks")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--no-dfm", action="store_true",
        help="Skip DFM review",
    )
    parser.add_argument(
        "--no-compliance", action="store_true",
        help="Skip compliance checklist",
    )
    args = parser.parse_args()

    spec = _load_json(args.spec)
    print(f"Loaded spec for: {spec.get('name', spec.get('product_name', 'Unnamed'))}", file=sys.stderr)

    config = {
        "material_type": args.material_type or spec.get("material", "injection_mold"),
        "category": args.category or spec.get("category_type", "general"),
        "include_dfm": not args.no_dfm,
        "include_compliance": not args.no_compliance,
    }

    report = generate_tech_pack(spec, config)
    print(f"Tech pack generated: {len(report.get('dfm_findings', []))} DFM findings, "
          f"{len(report.get('compliance_checklist', []))} compliance checks, "
          f"{len(report.get('bom', {}).get('bom', []))} BOM items", file=sys.stderr)

    if args.format == "json":
        _output_json(report, args.output)
    else:
        _output_text(report, args.output)


if __name__ == "__main__":
    main()
