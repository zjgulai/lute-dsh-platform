#!/usr/bin/env python3
"""
Company Research — 公司调研 skill 的自包含 CLI 封装。

Company-level research, due diligence, and source-backed company profiles.

本脚本自包含，不依赖 skills._shared 外部模块。
用法：
    python run.py --input "Describe the task..." --output result.json
    python run.py --input input.json --format json
"""

from __future__ import annotations

import argparse
import json
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


def read_input(input_arg: str) -> str:
    """Read input text, or the content of a file path if it exists."""
    input_path = Path(input_arg)
    if input_path.exists():
        return input_path.read_text(encoding="utf-8")
    return input_arg


def main() -> None:
    parser = argparse.ArgumentParser(description="Company Research CLI（公司调研）")
    parser.add_argument("--input", required=True, help="Input text or path to JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument("--format", choices=["json", "text"], default="json",
                        help="Output format (default: json)")
    args = parser.parse_args()

    input_text = read_input(args.input)
    body = load_skill_prompt()

    # 本封装仅组装 prompt 并回显指令正文；实际 LLM 调用由上层 agent 完成。
    payload = {
        "skill": "公司调研",
        "instructions": body,
        "input": input_text,
        "note": "请按 SKILL.md 的七步工作流与输出模板生成可追溯、带 confidence 的公司研究报告。",
    }

    output = json.dumps(payload, indent=2, ensure_ascii=False) if args.format == "json" else body

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
