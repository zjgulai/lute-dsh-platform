#!/usr/bin/env python3
"""
Ad Creative - Self-contained CLI wrapper.

Generate ad creative copy and concepts for multi-platform campaigns.
No external dependencies beyond Python stdlib.

Usage:
    python run.py --input "Describe the task..." --output result.json
    python run.py --input input.json --model gpt-4o --format json
    python run.py --help
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent.parent


def load_skill_prompt() -> str:
    """Read SKILL.md and extract the body after frontmatter."""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return "No SKILL.md found."
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    body = parts[2].strip() if len(parts) > 2 else content.strip()
    return body


def load_references() -> dict[str, str]:
    """Load reference files if they exist."""
    refs = {}
    ref_dir = SKILL_DIR / "references"
    if ref_dir.exists():
        for f in ref_dir.glob("*.md"):
            refs[f.stem] = f.read_text(encoding="utf-8")
    return refs


def build_system_prompt() -> str:
    """Build the system prompt from SKILL.md body and references."""
    body = load_skill_prompt()
    refs = load_references()
    ref_text = "\n\n".join(f"## {k}\n{v}" for k, v in refs.items())
    return f"{body}\n\n{ref_text}" if ref_text else body


def main() -> None:
    parser = argparse.ArgumentParser(description="Ad Creative CLI")
    parser.add_argument("--input", required=True, help="Input text or path to JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument("--model", default="gpt-4o", help="Model name (default: gpt-4o)")
    parser.add_argument(
        "--format", choices=["json", "text"], default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--prompt-only", action="store_true",
        help="Only output the assembled system prompt (for manual LLM use)",
    )
    args = parser.parse_args()

    # Read input
    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    system_prompt = build_system_prompt()

    if args.prompt_only:
        print(json.dumps({
            "system": system_prompt,
            "user": input_text,
            "model": args.model,
        }, indent=2, ensure_ascii=False))
        return

    # Self-contained mode: output the assembled prompt for manual or API use
    output = {
        "model": args.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": input_text},
        ],
        "note": "This is a self-contained prompt ready for LLM API call. "
                "The skill previously required skills._shared.llm_pipeline; "
                "now it assembles the full prompt and references locally.",
    }

    output_json = json.dumps(output, indent=2, ensure_ascii=False)

    if args.output:
        Path(args.output).write_text(output_json, encoding="utf-8")
        print(f"Output written to {args.output}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()