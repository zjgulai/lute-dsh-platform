#!/usr/bin/env python3
"""
亚马逊Listing专家 - 独立 CLI 封装。

读取 SKILL.md 正文作为指令，让任意 LLM 客户端按「心理说服链」方法论
产出 Amazon 母婴 Listing。自包含，不依赖 skills._shared。

用法:
    python3 scripts/run.py --input "帮我重写这款奶瓶的 Listing" --output result.json
    python3 scripts/run.py --input input.json --format json
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
        return "未找到 SKILL.md。"
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    return parts[2].strip() if len(parts) > 2 else content.strip()


def build_messages(body: str, input_text: str) -> list:
    """构造 messages（role=亚马逊Listing专家 + 正文指令 + 用户任务）。"""
    return [
        {"role": "system", "content": "你是亚马逊 Listing 专家。\n\n" + body},
        {"role": "user", "content": "Task:\n" + input_text},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="亚马逊Listing专家 CLI")
    parser.add_argument("--input", required=True, help="输入文本或 JSON/文本文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径（默认打印到 stdout）")
    parser.add_argument("--format", choices=["json", "text"], default="json",
                        help="输出格式（默认 json）")
    args = parser.parse_args()

    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    body = load_skill_prompt()
    messages = build_messages(body, input_text)

    # 自包含模式：无外部 LLM 客户端时，输出构造好的 prompt（供任意客户端调用）。
    # 有外部客户端时，可在此接入其 API。此处保持零依赖、可独立运行。
    output = json.dumps({
        "messages": messages,
        "output_format": args.format,
        "note": "将 messages 交给任意 LLM 客户端即可按方法论产出 Listing 方案。",
    }, ensure_ascii=False, indent=2)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"[ok] 已写入 {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
