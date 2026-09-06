#!/usr/bin/env python3
"""
Bestseller Pattern Analyzer - standalone CLI (self-contained).

Deconstruct Amazon bestsellers to identify winning patterns and
generate a differentiation window report. This script does NOT depend on
any shared `skills._shared` package; it is fully self-contained.

Usage:
    python run.py --input "Describe the task..." --output result.json
    python run.py --input input.json --model gpt-4o --format json
    python run.py --help
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


SKILL_DIR = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# Minimal self-contained prompt/pipeline replacements (no external deps)
# ---------------------------------------------------------------------------

@dataclass
class PromptTemplate:
    system: str
    user: str
    output_format: str = "text"

    def render(self, **kwargs: str) -> list[dict[str, str]]:
        system = self.system.format(**kwargs)
        user = self.user.format(**kwargs)
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]


@dataclass
class PipelineResult:
    success: bool
    content: str = ""
    parsed_json: Optional[Any] = None
    error: str = ""


class LLMPipeline:
    """Minimal self-contained LLM runner.

    Attempts the OpenAI-compatible API when an API key is available; otherwise
    emits a clear diagnostic telling the user to provide a key. This keeps the
    script runnable without pulling in the shared `skills._shared` package.
    """

    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o") -> None:
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.model = model

    def run(self, messages: list[dict[str, str]], template: Optional[PromptTemplate] = None) -> PipelineResult:
        if not self.api_key:
            return PipelineResult(
                success=False,
                error=(
                    "未配置 OPENAI_API_KEY。请通过 --api-key 或环境变量 OPENAI_API_KEY 提供。"
                    "本脚本为自包含 CLI，不依赖 skills._shared。"
                ),
            )
        try:
            import urllib.request

            payload = json.dumps({"model": self.model, "messages": messages}).encode("utf-8")
            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                },
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            return PipelineResult(success=True, content=content)
        except Exception as exc:  # noqa: BLE001
            return PipelineResult(success=False, error=f"LLM 调用失败: {exc}")


# ---------------------------------------------------------------------------
# Skill prompt loading
# ---------------------------------------------------------------------------

def load_skill_prompt() -> str:
    """Read SKILL.md and extract the body after frontmatter."""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return "No SKILL.md found."
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    body = parts[2].strip() if len(parts) > 2 else content.strip()
    return body


def build_template() -> PromptTemplate:
    """Build the PromptTemplate from the SKILL.md instructions."""
    body = load_skill_prompt()
    return PromptTemplate(
        system="你是畅销款规律解码器。\n\n{instructions}",
        user="任务：\n{input_text}",
        output_format="text",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Bestseller Pattern Analyzer CLI（自包含）")
    parser.add_argument("--input", required=True, help="输入文本或 JSON/文本文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--model", default="gpt-4o", help="模型名（默认 gpt-4o）")
    parser.add_argument("--api-key", default=None, help="OpenAI API key（默认读 OPENAI_API_KEY）")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="输出格式")
    args = parser.parse_args()

    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    template = build_template()
    body = load_skill_prompt()
    pipeline = LLMPipeline(api_key=args.api_key, model=args.model)
    messages = template.render(instructions=body, input_text=input_text)

    result = pipeline.run(messages, template=template)
    if not result.success:
        print(f"错误：{result.error}", file=sys.stderr)
        sys.exit(1)

    output = result.content
    if args.format == "json":
        output = json.dumps({"result": result.content}, indent=2, ensure_ascii=False)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
