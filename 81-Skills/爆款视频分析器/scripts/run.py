#!/usr/bin/env python3
"""
Viral Video Analyzer - 自包含 CLI（无 skills._shared 依赖）。

分析视频脚本/主题的传播潜力，输出结构化优化建议。
无 API key 时降级为本地确定性分析（基于 references/analysis-framework.md）。

Usage:
    python run.py --input "主题: 榨汁杯带货, 平台: TikTok, 时长: 30秒"
    python run.py --input input.json --output result.json --format json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent


def load_skill_body() -> str:
    """读取 SKILL.md 正文（frontmatter 之后）。"""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return "No SKILL.md found."
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    return parts[2].strip() if len(parts) > 2 else content.strip()


def _field(text: str, keys: tuple[str, ...], default: str = "") -> str:
    """从输入文本提取字段（冒号分隔或关键词后置）。"""
    for key in keys:
        m = re.search(rf"{key}\s*[:：]\s*([^,\n]+)", text)
        if m:
            return m.group(1).strip()
    return default


def analyze(input_text: str) -> dict:
    """确定性分析：提取要素并套用 analysis-framework 输出建议。"""
    theme = _field(input_text, ("主题", "topic", "Theme", "Topic"))
    platform = _field(input_text, ("平台", "platform", "Platform"), default="TikTok")
    duration = _field(input_text, ("时长", "duration", "Duration"), default="30秒")

    if not input_text.strip():
        raise ValueError("输入为空：请提供脚本或主题")

    if not theme and len(input_text.strip()) < 10:
        raise ValueError("材料不足：未识别到主题/平台，请补充后重试")

    return {
        "主题": theme or "（未提供，已按通用脚本处理）",
        "平台": platform,
        "时长": duration,
        "结构优化": [
            "0-3秒: 悬念/冲突/结果前置钩子，砍掉自我介绍",
            "4-15秒: 痛点 + 卖点1，一个画面一个信息",
            "16-25秒: 场景演示 + 卖点2，每 2-3 秒一个变化",
            "26-30秒: 单一强 CTA（具体动作 + 参与理由）",
        ],
        "标题建议": [
            "结果/反常识 + 数字 + 目标人群",
            "痛点共鸣 + 具体利益点",
        ],
        "标签建议": ["#视频优化", "#爆款", "#" + (platform or "短视频")],
        "节奏要点": [
            "每 8-10 秒埋一个小钩子",
            "情绪峰值前置，把最精彩一帧放开头",
            "中段留 1 个小高潮防掉完播",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Viral Video Analyzer CLI（自包含）")
    parser.add_argument("--input", required=True, help="Input text or path to JSON/text file")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument("--model", default="local", help="Model name（保留参数，本地确定性分析无需 LLM）")
    parser.add_argument("--api-key", default=None, help="API key（可选；未提供时本地确定性分析）")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="Output format (default: json)")
    args = parser.parse_args()

    try:
        if not args.input or not args.input.strip():
            raise ValueError("输入为空：请提供脚本或主题")
        input_path = Path(args.input)
        if input_path.is_file():
            input_text = input_path.read_text(encoding="utf-8")
        else:
            input_text = args.input
        result = analyze(input_text)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:  # 错误恢复：任何异常都转为可读错误而非崩溃
        print(f"Error: 处理输入时发生异常：{e}", file=sys.stderr)
        sys.exit(1)

    if args.format == "json":
        output = json.dumps(result, indent=2, ensure_ascii=False)
    else:
        output = "\n".join(
            f"## {k}\n" + ("\n".join(f"- {v}" for v in val) if isinstance(val, list) else f"- {val}")
            for k, val in result.items()
        )

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"已写入 {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
