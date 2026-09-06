#!/usr/bin/env python3
"""
Etsy SEO Optimizer - 自包含 CLI 封装。

把用户输入按 SKILL.md 的入口策略框架整理成结构化输出，供 LLM 或人工回填使用。
不依赖 skills._shared 或外部包，仅使用 Python 标准库。

Usage:
    python3 run.py --input "Describe the task..." --output result.json
    python3 run.py --input input.json --format json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

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


def build_placeholder(input_text: str) -> Dict[str, Any]:
    """根据输入生成入口策略占位结构，等待 LLM 或人工回填具体内容。"""
    return {
        "input": input_text,
        "listing_role": {
            "product": "",
            "etsy_role": "",  # 搜索入口型 / 品牌触点型 / 定制实验型 / Pinterest 承接型
            "primary_goal": "",
        },
        "keyword_structure": {
            "category_words": [],
            "scene_words": [],
            "gift_words": [],
            "brand_words": [],
        },
        "title_tag_strategy": {
            "title_direction": "",
            "tag_split": "",
            "front_anchor": "",
            "back_expansion": "",
        },
        "traffic_synergy": {
            "pinterest_fit": False,
            "reason": "",
            "private_domain_fit": False,
            "how_to_guide": "",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Etsy SEO Optimizer CLI（自包含）")
    parser.add_argument("--input", required=True, help="Input text or path to JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument(
        "--format", choices=["json", "text"], default="json",
        help="Output format (default: json)",
    )
    args = parser.parse_args()

    # 读取输入
    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    # 生成入口策略占位结构（本 CLI 不自带 LLM，只负责标准化结构）
    output_data = build_placeholder(input_text)

    if args.format == "json":
        output = json.dumps(output_data, indent=2, ensure_ascii=False)
    else:
        output = "\n".join(
            f"{k}: {v}" for k, v in output_data.items() if not isinstance(v, dict)
        )

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
