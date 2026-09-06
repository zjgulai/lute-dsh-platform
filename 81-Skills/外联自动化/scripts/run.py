#!/usr/bin/env python3
"""外联自动化 - 自包含 CLI。

读取 SKILL.md 正文作为系统指令，渲染外联任务 prompt，并可通过 OpenAI 兼容
API 生成外联序列（只生成触达资产，不发送消息）。无 skills._shared 依赖。

用法:
    python run.py --input "描述任务..." --render-only
    python run.py --input task.txt --model gpt-4o-mini --output result.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent


def load_skill_body() -> str:
    """读取 SKILL.md 正文（frontmatter 之后）。"""
    content = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    parts = content.split("---", 2)
    return parts[2].strip() if len(parts) > 2 else content.strip()


def render_prompt(task: str) -> list[dict]:
    """渲染外联任务 prompt（system + user），返回 messages 列表。"""
    body = load_skill_body()
    system = "你是 GTM 外联自动化专家。只生成可审核的触达资产与执行表，不自动发送消息。\n\n" + body
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "Task:\n" + task},
    ]


def call_llm(messages: list[dict], api_key: str, model: str,
             base_url: str = "https://api.openai.com/v1") -> str:
    """用 stdlib 直连 OpenAI 兼容 chat/completions，无第三方依赖。"""
    payload = json.dumps({"model": model, "messages": messages, "temperature": 0.4}).encode("utf-8")
    req = urllib.request.Request(
        base_url + "/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"LLM 调用失败: HTTP {exc.code} {detail}") from exc
    except (KeyError, IndexError, ValueError) as exc:
        raise RuntimeError(f"LLM 响应格式异常: {exc}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="外联自动化 CLI（自包含）")
    parser.add_argument("--input", required=True, help="任务描述文本，或文本/JSON 文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--model", default="gpt-4o-mini", help="模型名（默认 gpt-4o-mini）")
    parser.add_argument("--api-key", default=None, help="OpenAI 兼容 API key（默认读 OPENAI_API_KEY）")
    parser.add_argument("--render-only", action="store_true", help="只渲染 prompt，不调用 LLM")
    args = parser.parse_args()

    inp = Path(args.input)
    task = inp.read_text(encoding="utf-8") if inp.exists() else args.input
    messages = render_prompt(task)

    if args.render_only:
        out = json.dumps(messages, ensure_ascii=False, indent=2)
    else:
        api_key = args.api_key or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            print("Error: 需要 --api-key 或环境变量 OPENAI_API_KEY（或加 --render-only）", file=sys.stderr)
            sys.exit(2)
        out = call_llm(messages, api_key, args.model)

    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
        print(f"[ok] 已写入 {args.output}", file=sys.stderr)
    else:
        print(out)


if __name__ == "__main__":
    main()
