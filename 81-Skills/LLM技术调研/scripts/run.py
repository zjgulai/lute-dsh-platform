#!/usr/bin/env python3
"""
LLM Tech Research - Research pipeline CLI wrapper.

Track Cursor, Claude Code, and LLM tool practices research.

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
from pathlib import Path
from typing import Any

SKILL_DIR = Path(__file__).resolve().parent.parent


# --- Minimal self-contained prompt utilities (no skills._shared dependency) ---

class PromptTemplate:
    """Minimal prompt template with role/instructions/input placeholders."""

    def __init__(self, system: str, user: str, output_format: str = "text"):
        self.system = system
        self.user = user
        self.output_format = output_format

    def render(self, role: str, instructions: str, input_text: str) -> list[dict]:
        system_msg = self.system.format(role=role, instructions=instructions)
        user_msg = self.user.format(input_text=input_text)
        return [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ]


class PipelineResult:
    """Result object mirroring the old LLMPipeline result shape."""

    def __init__(self, success: bool, content: str = "", parsed_json: Any = None,
                 error: str = ""):
        self.success = success
        self.content = content
        self.parsed_json = parsed_json
        self.error = error


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
    is_json = "json" in body.lower() or "JSON" in body
    return PromptTemplate(
        system="{role}\n\n{instructions}",
        user="Task:\n{input_text}",
        output_format="json" if is_json else "text",
    )


def run_research(input_text: str, api_key: str | None = None,
                 model: str = "gpt-4o") -> PipelineResult:
    """Run the research pipeline locally (self-contained).

    This implementation does NOT require skills._shared. It renders the
    prompt from SKILL.md and returns a placeholder PipelineResult. To perform
    actual LLM inference, wire in an OpenAI-compatible client here using
    `api_key` / `model`.
    """
    template = build_template()
    body = load_skill_prompt()
    messages = template.render(
        role="LLM Tech Research",
        instructions=body,
        input_text=input_text,
    )

    # No external pipeline available in self-contained mode: report structured
    # guidance instead of raising an ImportError.
    if not api_key and not os.environ.get("OPENAI_API_KEY"):
        return PipelineResult(
            success=False,
            error=("未配置 API Key。请设置 OPENAI_API_KEY 环境变量，"
                   "或将本脚本接入 OpenAI 兼容客户端后执行真实推理。"),
        )

    # Placeholder: a real deployment should call the LLM here.
    return PipelineResult(
        success=True,
        content=f"[研究请求已接收] {input_text}",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="LLM Tech Research CLI")
    parser.add_argument("--input", required=True, help="Input text or path to JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument("--model", default="gpt-4o", help="Model name (default: gpt-4o)")
    parser.add_argument("--api-key", default=None, help="OpenAI API key (default: env OPENAI_API_KEY)")
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

    result = run_research(input_text, api_key=args.api_key, model=args.model)

    if not result.success:
        print(f"Error: {result.error}", file=sys.stderr)
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
