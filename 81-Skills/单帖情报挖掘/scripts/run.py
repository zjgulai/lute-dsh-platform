#!/usr/bin/env python3
"""
Single Post Intelligence Mining - LLM Pipeline CLI wrapper.

Single post intelligence mining for Reddit, forums, and social media.

Usage:
    python run.py --input "Analyze this Reddit post about..." --output result.json
    python run.py --input input.json --model gpt-4o --format json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import request as urllib_request

SKILL_DIR = Path(__file__).resolve().parent.parent


# ── 自包含 PromptTemplate 与 LLMPipeline ──

@dataclass
class PromptTemplate:
    system: str
    user: str
    output_format: str = "json"

    def render(self, **kwargs) -> list[dict]:
        return [
            {"role": "system", "content": self.system.format(**kwargs)},
            {"role": "user", "content": self.user.format(**kwargs)},
        ]


@dataclass
class LLMResult:
    success: bool
    content: str = ""
    parsed_json: dict | None = None
    error: str = ""


class LLMPipeline:
    def __init__(self, api_key: str | None = None, model: str = "gpt-4o"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model = model

    def run(self, messages: list[dict], template: PromptTemplate | None = None) -> LLMResult:
        if not self.api_key:
            return LLMResult(success=False, error="OPENAI_API_KEY not set")
        try:
            req = urllib_request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=json.dumps({"model": self.model, "messages": messages, "temperature": 0.3}).encode(),
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            )
            resp = urllib_request.urlopen(req, timeout=120)
            body = json.loads(resp.read().decode())
            content = body["choices"][0]["message"]["content"]
            parsed = None
            if template and template.output_format == "json":
                try:
                    parsed = json.loads(content)
                except json.JSONDecodeError:
                    pass
            return LLMResult(success=True, content=content, parsed_json=parsed)
        except Exception as e:
            return LLMResult(success=False, error=str(e))


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Single Post Intelligence Mining CLI")
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

    template = build_template()
    body = load_skill_prompt()
    pipeline = LLMPipeline(api_key=args.api_key, model=args.model)

    messages = template.render(
        role="Single Post Intelligence Mining",
        instructions=body,
        input_text=input_text,
    )
    result = pipeline.run(messages, template=template)

    if not result.success:
        print(f"Error: {result.error}", file=sys.stderr)
        sys.exit(1)

    output = result.content
    if result.parsed_json:
        output = json.dumps(result.parsed_json, indent=2, ensure_ascii=False)
    elif args.format == "json":
        output = json.dumps({"result": result.content}, indent=2, ensure_ascii=False)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
