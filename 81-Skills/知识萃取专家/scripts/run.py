#!/usr/bin/env python3
"""知识萃取专家 - 三阶段萃取 CLI 包装器。

深度书籍分析与知识萃取，实现从信息输入到行为转化的完整闭环。

用法:
    python scripts/run.py --input "分析《原子习惯》的核心论点" --output result.json
    python scripts/run.py --input input.json --model gpt-4o --format json
环境变量:
    OPENAI_API_KEY   OpenAI API 密钥（或用 --api-key 传入）
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

SKILL_DIR = Path(__file__).resolve().parent.parent

DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions"


class ExtractionError(Exception):
    """萃取过程中的错误。"""


def load_skill_prompt() -> str:
    """读取 SKILL.md 并提取 frontmatter 之后的正文。"""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return "No SKILL.md found."
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    body = parts[2].strip() if len(parts) > 2 else content.strip()
    return body


def _call_llm(messages: list[dict], model: str, api_key: str) -> str:
    """调用 OpenAI Chat Completions 接口，返回模型文本内容（自包含，无外部依赖）。"""
    if not api_key:
        raise ExtractionError("缺少 API 密钥：请设置 OPENAI_API_KEY 环境变量或用 --api-key 传入")
    payload = json.dumps({"model": model, "messages": messages}).encode("utf-8")
    req = urllib.request.Request(
        DEFAULT_API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        raise ExtractionError(f"API 请求失败 HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}")
    except urllib.error.URLError as e:
        raise ExtractionError(f"网络错误: {e.reason}")
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise ExtractionError(f"响应解析失败: {e}")


def build_messages(input_text: str) -> list[dict]:
    """根据输入构建对话消息。"""
    body = load_skill_prompt()
    system_prompt = (
        "你是一名双引擎知识萃取专家，同时具备严谨的结构化分析能力（研究员视角）"
        "与强大的认知行为转化能力（教练视角）。"
        "严格按照三阶段流程执行：阶段一结构真相还原 → 阶段二思维模型与场景迁移 → 阶段三行为转化与内化设计，"
        "最后输出价值判定（3 句话）。\n\n"
        f"{body}"
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Task:\n{input_text}"},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="知识萃取专家 CLI")
    parser.add_argument("--input", required=True, help="输入文本，或 JSON/文本文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径（缺省打印到 stdout）")
    parser.add_argument("--model", default="gpt-4o", help="模型名（默认 gpt-4o）")
    parser.add_argument("--api-key", default=None, help="OpenAI API 密钥（默认取环境变量 OPENAI_API_KEY）")
    parser.add_argument(
        "--format", choices=["json", "text"], default="json",
        help="输出格式（默认 json）",
    )
    args = parser.parse_args()

    # 读取输入
    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    api_key = args.api_key or os.environ.get("OPENAI_API_KEY")
    messages = build_messages(input_text)

    try:
        content = _call_llm(messages, args.model, api_key or "")
    except ExtractionError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    # 输出
    if args.format == "json":
        output = json.dumps({"result": content}, indent=2, ensure_ascii=False)
    else:
        output = content

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
