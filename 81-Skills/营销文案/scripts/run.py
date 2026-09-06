#!/usr/bin/env python3
"""
营销文案 - LLM Pipeline CLI wrapper.

Marketing copywriting for sales, brand, and landing pages.

Usage:
    python3 run.py --input "Write copy for a new SaaS landing page..." --output result.json
    python3 run.py --input input.json --model gpt-4o --format json
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


def build_prompt(user_input: str) -> dict:
    """Build a prompt from the SKILL.md instructions and user input."""
    body = load_skill_prompt()
    return {
        "system": f"你是营销文案专家。\n\n{body}",
        "user": f"任务：\n{user_input}",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="营销文案 CLI")
    parser.add_argument("--input", required=True, help="Input text or path to JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument("--model", default="gpt-4o", help="Model name (default: gpt-4o)")
    parser.add_argument(
        "--format", choices=["json", "text"], default="json",
        help="Output format (default: json)",
    )
    args = parser.parse_args()

    # Read input
    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    prompt = build_prompt(input_text)

    output = json.dumps(prompt, indent=2, ensure_ascii=False)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()