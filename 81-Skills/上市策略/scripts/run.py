#!/usr/bin/env python3
"""Launch Strategy - standalone CLI scaffold (self-contained, no external deps).

Generates a product-launch strategy scaffold from a JSON/text input.
Usage:
    python run.py --input '{"product": "...", "market": "...", "date": "..."}'
    python run.py --input input.json --output result.json
    python run.py --help
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent


def load_skill_body() -> str:
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return ""
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    return parts[2].strip() if len(parts) > 2 else content.strip()


def parse_input(raw: str) -> dict:
    """Accept a JSON string or a path to a JSON/text file; return a dict."""
    p = Path(raw)
    if p.exists() and p.is_file():
        raw = p.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # 纯文本：当成产品描述，尽力提取
        return {"product": raw.strip()[:500], "market": "", "date": "", "budget": ""}
    if isinstance(data, dict):
        return data
    raise ValueError("输入必须是 JSON 对象或纯文本")


def build_scaffold(data: dict) -> dict:
    product = str(data.get("product", "") or data.get("产品", "") or "")
    market = str(data.get("market", "") or data.get("市场", "") or "")
    date = str(data.get("date", "") or data.get("时间", "") or "")
    budget = str(data.get("budget", "") or data.get("预算", "") or "")

    missing = [k for k, v in (("product", product), ("market", market),
                              ("date", date), ("budget", budget)) if not v]
    if missing:
        return {
            "status": "need_clarify",
            "missing": missing,
            "message": f"缺少必要信息：{', '.join(missing)}。请补充后重新运行。",
        }

    return {
        "status": "ok",
        "product": product,
        "market": market,
        "launch_date": date,
        "budget": budget,
        "timeline": [
            {"phase": "T-4周 预热期", "actions": ["着陆页+等候名单", "社媒预热", "KOL确认"]},
            {"phase": "T-2周 早鸟期", "actions": ["种子用户内测", "PR稿件准备"]},
            {"phase": "Launch Day 发布日", "actions": ["全渠道同步发布", "邮件序列触发"]},
            {"phase": "T+2周 放大期", "actions": ["数据复盘", "广告扩量", "反馈收集"]},
        ],
        "growth_experiments": [
            {"name": "落地页主文案 A/B", "metric": "waitlist 转化率"},
            {"name": "新用户激活引导", "metric": "首周激活率"},
            {"name": "邀请得权益老带新", "metric": "K因子/获客成本"},
        ],
        "note": "以上为策略脚手架，需结合具体产品与竞争环境细化。",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="上市策略 · 发布策略脚手架（自包含 CLI）")
    parser.add_argument("--input", required=True, help="输入 JSON 字符串或 JSON/文本文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径（可选）")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="输出格式")
    args = parser.parse_args()

    try:
        data = parse_input(args.input)
        result = build_scaffold(data)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if args.format == "text":
        output = json.dumps(result, ensure_ascii=False, indent=2)
    else:
        output = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"[ok] 已写入 {args.output}")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
