#!/usr/bin/env python3
"""
市场可行性审计 - 自包含 CLI（无 skills._shared 依赖）。

Audit product-market viability with Go/No-Go assessment for Momcozy.

Usage:
    python run.py --input "Describe the task..." --output result.json
    python run.py --input input.json --format json
"""
from __future__ import annotations

import argparse
import json
import os
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
    return parts[2].strip() if len(parts) > 2 else content.strip()


def read_input(input_arg: str) -> str:
    """Read input text from a file path or treat the argument as literal text."""
    input_path = Path(input_arg)
    if input_path.exists():
        return input_path.read_text(encoding="utf-8")
    return input_arg


def build_prompt(input_text: str) -> dict:
    """Build a self-contained structured prompt for external LLM execution."""
    body = load_skill_prompt()
    return {
        "role": "市场可行性审计",
        "instructions": body,
        "task": input_text,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="市场可行性审计 CLI (self-contained)")
    parser.add_argument("--input", required=True, help="Input text or path to a JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument("--format", choices=["json", "text"], default="json",
                        help="Output format (default: json)")
    args = parser.parse_args()

    input_text = read_input(args.input)
    if not input_text.strip():
        print("Error: empty input. Provide a task description or a file path.", file=sys.stderr)
        raise SystemExit(2)

    prompt = build_prompt(input_text)

    # 自包含：无 API key 时返回结构化提示词供外部 LLM 执行，保证可独立运行。
    output = json.dumps({"prompt": prompt}, ensure_ascii=False, indent=2)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
