#!/usr/bin/env python3
"""
ICP Profiler - self-contained CLI wrapper.

Define and profile Ideal Customer Personas for targeted marketing.
This script is self-contained: it does not depend on skills._shared.
It renders the SKILL.md instructions into a prompt template and, when an
OpenAI-compatible API key is present, calls the chat-completions endpoint;
otherwise it prints the rendered prompt and a clear guidance message.

Usage:
    python run.py --input "Describe the task..." --output result.json
    python run.py --input input.json --model gpt-4o --format json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
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


def build_messages(input_text: str) -> list[dict]:
    """Build chat messages from the SKILL.md instructions and user input."""
    body = load_skill_prompt()
    system = (
        "You are an ICP Profiler. Define and profile Ideal Customer Personas "
        "for targeted marketing, sales and product decisions.\n\n"
        f"{body}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Task:\n{input_text}"},
    ]


def call_api(api_key: str, model: str, messages: list[dict]) -> str:
    """Call an OpenAI-compatible chat-completions endpoint."""
    url = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1") + "/chat/completions"
    payload = json.dumps({"model": model, "messages": messages}).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


def main() -> None:
    parser = argparse.ArgumentParser(description="ICP Profiler CLI")
    parser.add_argument("--input", required=True, help="Input text or path to JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument("--model", default="gpt-4o", help="Model name (default: gpt-4o)")
    parser.add_argument("--api-key", default=None, help="API key (default: env OPENAI_API_KEY)")
    parser.add_argument(
        "--format", choices=["json", "text"], default="json",
        help="Output format (default: json)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    input_text = input_path.read_text(encoding="utf-8") if input_path.exists() else args.input

    messages = build_messages(input_text)
    api_key = args.api_key or os.environ.get("OPENAI_API_KEY")

    if not api_key:
        output = (
            "No API key provided (set --api-key or OPENAI_API_KEY). "
            "Rendered prompt is ready below.\n\n"
            + "\n".join(f"[{m['role']}]\n{m['content']}" for m in messages)
        )
    else:
        try:
            content = call_api(api_key, args.model, messages)
            output = content if args.format == "text" else json.dumps(
                {"result": content}, indent=2, ensure_ascii=False
            )
        except Exception as exc:  # noqa: BLE001 - surface a clear error to the caller
            print(f"Error: {exc}", file=sys.stderr)
            sys.exit(1)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
