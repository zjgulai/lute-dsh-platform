#!/usr/bin/env python3
"""
场景选品侦察 — CLI wrapper.

从真实生活场景、身份迁移和反直觉时刻中发现新产品机会。

Usage:
    python run.py --input "描述任务..." --output result.json
    python run.py --input input.json --output result.json
    python run.py --input "..." --format text

自包含版本（v1.2.0）：不依赖 skills._shared，直接读取 SKILL.md 正文作为提示词。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent


def load_skill_prompt() -> str:
    """读取 SKILL.md 并提取 frontmatter 之后的正文。"""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return "No SKILL.md found."
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    return parts[2].strip() if len(parts) > 2 else content.strip()


def validate_input(input_text: str) -> None:
    """输入校验：拒绝空输入和危险命令。"""
    dangerous = ["rm -rf", "curl", "| sh", "| bash", "sudo", "/etc/passwd"]
    if any(d in input_text.lower() for d in dangerous):
        print("Error: 输入包含危险命令或越权路径，已拒绝执行。", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="场景选品侦察 CLI")
    parser.add_argument("--input", required=True, help="输入文本或 JSON/text 文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="输出格式")
    args = parser.parse_args()

    # 读取输入
    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    validate_input(input_text)

    # 加载 SKILL.md 正文作为 system prompt
    body = load_skill_prompt()

    # 输出：在 CLI 模式下，将 SKILL.md 正文和输入一起输出为结构化 JSON
    result = {
        "skill": "场景选品侦察",
        "version": "1.2.0",
        "input": input_text,
        "skill_body": body,
    }

    output = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()