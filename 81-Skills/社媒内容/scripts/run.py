#!/usr/bin/env python3
"""
社媒内容 (Social Content) - CLI wrapper.

Multi-platform social media content creation and calendars.

Usage:
    python3 run.py --input "Create a weekly content calendar for..." --output result.json
    python3 run.py --input input.json --format json

自包含：不依赖 skills._shared，可直接独立运行。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent


def load_skill_prompt() -> str:
    """读取 SKILL.md 正文（frontmatter 之后的部分）。"""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return "No SKILL.md found."
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    body = parts[2].strip() if len(parts) > 2 else content.strip()
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description="社媒内容 CLI")
    parser.add_argument("--input", required=True,
                        help="输入文本或 JSON/文本文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--format", choices=["json", "text"], default="json",
                        help="输出格式（默认 json）")
    args = parser.parse_args()

    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    if not input_text.strip():
        print("Error: 输入为空，无法生成内容。请提供产品信息、平台与需求。",
              file=sys.stderr)
        sys.exit(1)

    body = load_skill_prompt()
    payload = {
        "task": input_text,
        "instructions": body,
        "hint": "按 SKILL.md 的核心工作流生成平台适配的社媒内容",
    }
    output = (json.dumps(payload, indent=2, ensure_ascii=False)
              if args.format == "json" else body)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()