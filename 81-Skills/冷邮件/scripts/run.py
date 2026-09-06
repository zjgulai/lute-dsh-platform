#!/usr/bin/env python3
"""
冷邮件 - 自包含 CLI 包装器（Cold Email）。

生成个性化冷邮件 / 跟进序列 / 回复模板的结构化脚手架，
供上层 Agent 在真实模型会话中填充内容。不依赖 skills._shared，可独立运行。

用法:
    python run.py --customer "跨境电商独立站卖家" --value "多平台订单库存统一管理" --goal "约15分钟演示" --output result.json
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


def load_skill_prompt() -> str:
    """读取 SKILL.md 并提取 frontmatter 之后的正文。"""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return "No SKILL.md found."
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    return parts[2].strip() if len(parts) > 2 else content.strip()


def build_scaffold(customer: str, value: str, goal: str, contact: str = "") -> dict[str, Any]:
    """生成冷邮件脚手架（结构化，供 LLM 填充）。"""
    return {
        "skill": "冷邮件",
        "target_customer": customer,
        "value_proposition": value,
        "outreach_goal": goal,
        "contact_info": contact,
        "deliverables": {
            "cold_email": {
                "subject": "",
                "opening": "",
                "pain_point": "",
                "value_proof": "",
                "cta": "",
            },
            "follow_up_sequence": [
                {"day": 3, "angle": "补充案例/数据", "body": ""},
                {"day": 7, "angle": "换角度重提价值", "body": ""},
                {"day": 14, "angle": "社会证明", "body": ""},
                {"day": 21, "angle": "最后机会", "body": ""},
            ],
            "reply_templates": {
                "interest": "",
                "objection": "",
                "meeting_booking": "",
                "polite_rejection": "",
            },
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="冷邮件 CLI（自包含脚手架）")
    parser.add_argument("--input", default=None, help="输入文本或 JSON 文件路径")
    parser.add_argument("--customer", default=None, help="目标客户画像（行业/职位/痛点）")
    parser.add_argument("--value", default=None, help="价值主张（能为对方带来什么）")
    parser.add_argument("--goal", default=None, help="外联目的（约见/合作/邀约）")
    parser.add_argument("--contact", default="", help="联系人信息（姓名/公司/职位，可选）")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="输出格式")
    args = parser.parse_args()

    customer = args.customer
    value = args.value
    goal = args.goal

    if args.input:
        input_path = Path(args.input)
        if input_path.exists():
            raw = input_path.read_text(encoding="utf-8")
            if args.input.endswith(".json"):
                try:
                    data = json.loads(raw)
                    customer = customer or data.get("target_customer") or data.get("customer")
                    value = value or data.get("value_proposition") or data.get("value")
                    goal = goal or data.get("outreach_goal") or data.get("goal")
                except json.JSONDecodeError as e:
                    print(f"Error: 输入 JSON 解析失败: {e}", file=sys.stderr)
                    sys.exit(1)
            else:
                if not customer:
                    customer = raw.strip()
        elif not customer:
            customer = args.input

    # 输入校验：缺关键参数时提示追问，而非硬编
    missing = []
    if not customer:
        missing.append("目标客户画像")
    if not value:
        missing.append("价值主张")
    if not goal:
        missing.append("外联目的")
    if missing:
        print(f"Error: 缺少 {'、'.join(missing)}。请提供目标客户画像、价值主张与外联目的后再运行。",
              file=sys.stderr)
        sys.exit(2)

    result = build_scaffold(customer, value, goal, args.contact)

    if args.format == "text":
        lines = [f"冷邮件脚手架：{customer}"]
        lines.append(f"价值主张：{value}")
        lines.append(f"外联目的：{goal}")
        lines.append("交付物：个性化冷邮件 + 3-5 封跟进序列 + 回复模板")
        output = "\n".join(lines)
    else:
        output = json.dumps(result, indent=2, ensure_ascii=False)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
