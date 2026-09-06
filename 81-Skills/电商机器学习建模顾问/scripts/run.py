#!/usr/bin/env python3
"""
E-commerce ML Modeling Advisor - Skill CLI wrapper.

Turn e-commerce prediction problems into ML modeling plans.

Usage:
    python run.py --help
    python run.py --input "Describe the task..." --output result.json
    python run.py --input input.json --model gpt-4o --format json
"""

from __future__ import annotations

import argparse
import json
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
    # Split on frontmatter delimiters
    parts = content.split("---", 2)
    body = parts[2].strip() if len(parts) > 2 else content.strip()
    return body


def build_prompt(user_input: str) -> dict:
    """Build a prompt dict from SKILL.md instructions and user input."""
    body = load_skill_prompt()
    return {
        "system": f"E-commerce ML Modeling Advisor\n\n{body}",
        "user": f"Task:\n{user_input}",
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="E-commerce ML Modeling Advisor CLI",
        epilog="This CLI outputs the skill prompt for use with a local or remote LLM pipeline.",
    )
    parser.add_argument(
        "--input", required=True,
        help="Input text or path to JSON/text file describing the ML modeling task",
    )
    parser.add_argument(
        "--output", default=None,
        help="Output file path (default: stdout)",
    )
    parser.add_argument(
        "--model", default="gpt-4o",
        help="Model name for reference (default: gpt-4o)",
    )
    parser.add_argument(
        "--format", choices=["json", "text"], default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--api-key", default=None,
        help="OpenAI API key (default: env OPENAI_API_KEY)",
    )
    args = parser.parse_args()

    # Read input
    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    prompt = build_prompt(input_text)

    if args.format == "json":
        output = json.dumps(
            {
                "model": args.model,
                "messages": [
                    {"role": "system", "content": prompt["system"]},
                    {"role": "user", "content": prompt["user"]},
                ],
            },
            indent=2,
            ensure_ascii=False,
        )
    else:
        output = f"{prompt['system']}\n\n---\n\n{prompt['user']}"

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"Prompt written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()