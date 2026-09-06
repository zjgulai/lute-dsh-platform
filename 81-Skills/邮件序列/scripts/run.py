#!/usr/bin/env python3
"""
邮件序列 - 自包含 CLI 包装器（Email Sequence）。

生成邮件营销序列（欢迎/弃购挽回/复购激活/节日促销）的结构化脚手架，
供上层 Agent 在真实模型会话中填充内容。不依赖 skills._shared，可独立运行。

用法:
    python run.py --scenario cart_abandonment --product "母婴订阅盒" --length 3 --output result.json
    python run.py --input input.json --format json
    python run.py --help
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SKILL_DIR = Path(__file__).resolve().parent.parent

SCENARIOS = ("welcome", "cart_abandonment", "re_engagement", "holiday_promotion")


def load_skill_prompt() -> str:
    """读取 SKILL.md 并提取 frontmatter 之后的正文。"""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return "No SKILL.md found."
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    return parts[2].strip() if len(parts) > 2 else content.strip()


def build_scaffold(scenario: str, product: str, length: int, audience: str = "") -> dict[str, Any]:
    """生成邮件序列脚手架（结构化，供 LLM 填充）。"""
    if scenario not in SCENARIOS:
        raise ValueError(f"scenario 必须是 {SCENARIOS} 之一，收到: {scenario}")
    if not product:
        raise ValueError("缺产品/服务信息：请用 --product 提供产品名称与核心卖点")
    if length < 1 or length > 10:
        raise ValueError(f"序列长度 length 需在 1-10 之间，收到: {length}")
    timing_map = {
        "welcome": ["立即", "1天后", "3天后", "7天后", "14天后"],
        "cart_abandonment": ["1小时后", "24小时后", "72小时后"],
        "re_engagement": ["当天", "3天后", "7天后", "14天后"],
        "holiday_promotion": ["预热", "倒计时", "当天", "节后"],
    }
    return {
        "skill": "邮件序列",
        "scenario": scenario,
        "product": product,
        "audience": audience,
        "sequence_length": length,
        "timing": (timing_map.get(scenario, []) + ["(自定义)"])[:length],
        "emails": [
            {
                "index": i + 1,
                "timing": "",
                "subject": "",
                "goal": "",
                "body": "",
                "cta": "",
            }
            for i in range(length)
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="邮件序列 CLI")
    parser.add_argument("--scenario", default=None,
                        help=f"场景类型: {', '.join(SCENARIOS)}")
    parser.add_argument("--product", default=None, help="产品/服务信息")
    parser.add_argument("--length", type=int, default=3, help="序列长度（默认 3）")
    parser.add_argument("--audience", default="", help="目标受众")
    parser.add_argument("--input", default=None, help="JSON 输入文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="输出格式")
    args = parser.parse_args()

    try:
        if args.input:
            data = json.loads(Path(args.input).read_text(encoding="utf-8"))
            scenario = data.get("scenario", args.scenario)
            product = data.get("product", args.product)
            length = int(data.get("length", args.length))
            audience = data.get("audience", args.audience)
        else:
            scenario, product, length, audience = args.scenario, args.product, args.length, args.audience

        if not scenario or not product:
            print("错误：缺场景类型或产品信息。请用 --scenario 与 --product 提供。", file=sys.stderr)
            parser.print_help(sys.stderr)
            sys.exit(2)

        scaffold = build_scaffold(scenario, product, length, audience)
    except ValueError as e:
        print(f"错误：{e}", file=sys.stderr)
        sys.exit(2)

    output = json.dumps(scaffold, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"[ok] 已写入 {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
