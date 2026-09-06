#!/usr/bin/env python3
"""
营销内容套件 - 多渠道营销内容生成 CLI（自包含，无外部共享库依赖）。

读取 SKILL.md 正文作为生成指导，根据输入产出多渠道营销内容骨架。
支持 --input（文本或文件路径）、--output、--format json/text。

Usage:
    python run.py --input "产品: 蓝牙音箱\n渠道: Facebook, Email" --format json
    python run.py --input input.txt --output result.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent


def load_skill_body() -> str:
    """读取 SKILL.md 正文（frontmatter 之后）。"""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return ""
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    return parts[2].strip() if len(parts) > 2 else content.strip()


def parse_input(raw: str) -> dict:
    """从自由文本输入解析产品/受众/渠道/调性。"""
    data: dict = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if not val:
            continue
        kl = key.lower()
        if "产品" in key or "product" in kl:
            data["product"] = val
        elif "受众" in key or "audience" in kl:
            data["audience"] = val
        elif "渠道" in key or "channel" in kl:
            data["channels"] = [c.strip() for c in val.replace("，", ",").split(",") if c.strip()]
        elif "调性" in key or "tone" in kl:
            data["tone"] = val
    return data


def generate(raw: str) -> dict:
    """根据输入生成多渠道营销内容骨架。"""
    info = parse_input(raw)
    product = info.get("product", "")
    audience = info.get("audience", "")
    channels = info.get("channels", [])
    tone = info.get("tone", "")

    if not product:
        return {"error": "缺少产品信息：请在输入里提供「产品: xxx」，例如「产品: 蓝牙音箱」。", "package": None}

    if not channels:
        channels = ["广告", "社媒", "邮件"]
        note = "未指定渠道，默认给出广告 + 社媒 + 邮件三件套。"
    else:
        note = f"已按指定渠道生成：{'、'.join(channels)}。"

    package = {
        "产品": product,
        "受众": audience or "（未提供，建议补全以精准投放）",
        "调性": tone or "（未提供，默认专业、亲切）",
        "说明": note,
        "内容": {},
    }

    for ch in channels:
        if ch.lower() in ("facebook", "google", "ad", "ads", "广告"):
            package["内容"]["广告"] = {
                "标题": f"{product}，为你的每一天加分",
                "正文": "核心卖点 + 使用场景 + 一句话行动号召。",
                "CTA": "立即购买",
            }
        elif ch.lower() in ("instagram", "tiktok", "小红书", "social", "社媒"):
            package["内容"]["社媒帖子"] = {
                "视觉描述": f"{product} 使用场景特写",
                "文案": f"一句带场景的种草文案，突出 {product} 的核心卖点。",
                "Hashtags": "#新品 #好物推荐",
            }
        elif ch.lower() in ("email", "邮件"):
            package["内容"]["邮件序列"] = ["欢迎邮件", "产品故事", "限时优惠", "用户证言"]
        elif ch.lower() in ("landing", "落地页"):
            package["内容"]["落地页"] = {
                "主标题": f"{product}，一句话核心卖点",
                "支撑点": ["卖点1", "卖点2", "卖点3"],
                "CTA": "立即购买",
            }
        else:
            package["内容"][ch] = f"为「{ch}」渠道生成与 {product} 相关的营销内容骨架。"

    return {"error": None, "package": package}


def main() -> None:
    parser = argparse.ArgumentParser(description="营销内容套件 CLI")
    parser.add_argument("--input", required=True, help="输入文本或文本/JSON 文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="输出格式（默认 json）")
    args = parser.parse_args()

    input_path = Path(args.input)
    if input_path.exists():
        raw = input_path.read_text(encoding="utf-8")
    else:
        raw = args.input

    if not raw.strip():
        print("Error: 输入为空，请提供产品/渠道信息。", file=sys.stderr)
        sys.exit(1)

    result = generate(raw)
    if result["error"]:
        print(f"Error: {result['error']}", file=sys.stderr)
        sys.exit(1)

    package = result["package"]
    if args.format == "json":
        output = json.dumps(package, ensure_ascii=False, indent=2)
    else:
        lines = [f"产品：{package.get('产品')}", f"受众：{package.get('受众')}", f"调性：{package.get('调性')}", package.get("说明", "")]
        for ch, content in package.get("内容", {}).items():
            lines.append(f"\n【{ch}】")
            if isinstance(content, dict):
                for k, v in content.items():
                    lines.append(f"  {k}: {v}")
            elif isinstance(content, list):
                for item in content:
                    lines.append(f"  - {item}")
            else:
                lines.append(f"  {content}")
        output = "\n".join(lines)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"已写入: {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
