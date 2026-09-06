#!/usr/bin/env python3
"""
Skills Manager - CLI wrapper.

Manage Claude Skills with project-level switching and context governance.

Usage:
    python run.py --input "Describe the task..." --output result.json
    python run.py --input input.json --model gpt-4o --format json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any


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


def build_messages(instructions: str, input_text: str) -> list[dict[str, str]]:
    """Build messages for the OpenAI-compatible chat API."""
    return [
        {"role": "system", "content": f"Skills Manager\n\n{instructions}"},
        {"role": "user", "content": f"Task:\n{input_text}"},
    ]


def call_openai(
    messages: list[dict[str, str]],
    model: str,
    api_key: str,
    response_format: str | None = None,
) -> dict[str, Any]:
    """Call OpenAI-compatible chat completions API directly."""
    url = "https://api.openai.com/v1/chat/completions"
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
    }
    if response_format == "json_object":
        body["response_format"] = {"type": "json_object"}

    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {error_body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error: {e.reason}") from e


def try_parse_json(content: str) -> Any | None:
    """Try to parse JSON from content; return None on failure."""
    if not content:
        return None
    # Try direct parse
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    # Try extracting from markdown code block
    m = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", content, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Skills Manager CLI")
    parser.add_argument("--input", required=True, help="Input text or path to JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument("--model", default="gpt-4o", help="Model name (default: gpt-4o)")
    parser.add_argument("--api-key", default=None, help="OpenAI API key (default: env OPENAI_API_KEY)")
    parser.add_argument(
        "--format", choices=["json", "text"], default="json",
        help="Output format (default: json)",
    )
    args = parser.parse_args()

    # Resolve API key
    api_key = args.api_key or os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        print("Error: No API key provided. Set --api-key or OPENAI_API_KEY env var.", file=sys.stderr)
        sys.exit(1)

    # Read input
    input_path = Path(args.input)
    if input_path.exists():
        input_text = input_path.read_text(encoding="utf-8")
    else:
        input_text = args.input

    if not input_text.strip():
        print("Error: Input is empty.", file=sys.stderr)
        sys.exit(1)

    instructions = load_skill_prompt()
    messages = build_messages(instructions, input_text)

    # Determine response format
    fmt = "json_object" if args.format == "json" else None

    try:
        result = call_openai(messages, args.model, api_key, response_format=fmt)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    choice = result.get("choices", [{}])[0]
    content = choice.get("message", {}).get("content", "")

    if not content:
        print("Error: Empty response from API.", file=sys.stderr)
        sys.exit(1)

    # Format output
    output = content
    parsed = try_parse_json(content)
    if parsed is not None:
        output = json.dumps(parsed, indent=2, ensure_ascii=False)
    elif args.format == "json":
        output = json.dumps({"result": content}, indent=2, ensure_ascii=False)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()