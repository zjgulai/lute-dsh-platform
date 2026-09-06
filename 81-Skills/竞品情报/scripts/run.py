#!/usr/bin/env python3
"""
Competitor Intelligence - LLM Pipeline CLI wrapper (self-contained).

Gather and analyze competitive intelligence from multiple public sources.

Usage:
    python3 run.py --input "Gather competitive intel on company X..." --output result.json
    python3 run.py --input input.json --format json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


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


def render_prompt(input_text: str) -> str:
    """Build a self-contained prompt from SKILL.md body + user input."""
    body = load_skill_prompt()
    return (
        "Role: Competitor Intelligence analyst.\n\n"
        f"Instructions:\n{body}\n\n"
        f"Task:\n{input_text}\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Competitor Intelligence CLI")
    parser.add_argument("--input", required=True, help="Input text or path to JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path (optional)")
    parser.add_argument("--format", choices=["json", "text"], default="text",
                        help="Output format (default: text)")
    args = parser.parse_args()

    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    if not input_text or not input_text.strip():
        print("Error: empty input. Provide competitor list / market / analysis dimensions.",
              file=sys.stderr)
        sys.exit(1)

    prompt = render_prompt(input_text)
    output = json.dumps({"prompt": prompt}, ensure_ascii=False, indent=2) if args.format == "json" else prompt

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"Prompt written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()