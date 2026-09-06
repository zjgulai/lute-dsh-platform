#!/usr/bin/env python3
"""
CRO Optimization - 自包含 CLI 助手（无 skills._shared 依赖）。

用于把转化率优化（CRO）的 LIFT 框架与 A/B 测试样本量计算做成确定性工具，
供 LLM 在需要精确计算时调用。

Usage:
    python run.py --input "提升注册页转化率" --output result.json
    python run.py --sample-size --baseline 0.03 --mde 0.006
    python run.py --help
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def lift_checklist() -> dict:
    """LIFT 六杠杆优先级清单。"""
    return {
        "framework": "LIFT",
        "priority": [
            {"level": "P0", "lever": "Value Proposition", "question": "用户 5 秒内能否理解「为什么选你」"},
            {"level": "P0", "lever": "Clarity", "question": "信息和下一步行动是否清晰"},
            {"level": "P1", "lever": "Relevance", "question": "页面与流量来源意图是否匹配"},
            {"level": "P1", "lever": "Anxiety", "question": "用户有何顾虑未消除"},
            {"level": "P2", "lever": "Urgency", "question": "是否有合理紧迫感"},
            {"level": "P2", "lever": "Distraction", "question": "有无干扰元素"},
        ],
    }


def sample_size(baseline: float, mde: float) -> dict:
    """按基线转化率与最小可检测效应估算每变体所需访问量（近似公式）。"""
    if not (0 < baseline < 1):
        raise ValueError("baseline 须在 (0,1) 之间")
    if not (0 < mde < 1):
        raise ValueError("mde 须在 (0,1) 之间")
    n = 16 * baseline * (1 - baseline) / (mde / 2) ** 2
    return {
        "baseline": baseline,
        "mde": mde,
        "formula": "n ≈ 16 * p0 * (1 - p0) / (MDE/2)^2",
        "per_variant_visits": round(n),
        "note": "95% 置信、80% 功效近似；样本不足的结论不可信",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="CRO Optimization 自包含 CLI")
    parser.add_argument("--input", default=None, help="输入文本或 JSON/文本文件路径")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--sample-size", action="store_true", help="计算 A/B 测试样本量")
    parser.add_argument("--baseline", type=float, default=None, help="基线转化率（如 0.03）")
    parser.add_argument("--mde", type=float, default=None, help="最小可检测效应（如 0.006）")
    args = parser.parse_args()

    if args.sample_size:
        if args.baseline is None or args.mde is None:
            print("错误：--sample-size 需要 --baseline 与 --mde", file=sys.stderr)
            sys.exit(2)
        try:
            result = sample_size(args.baseline, args.mde)
        except ValueError as e:
            print(f"错误：{e}", file=sys.stderr)
            sys.exit(2)
    else:
        result = {"task": args.input or "", "checklist": lift_checklist()}

    output = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"[ok] 已写入 {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
