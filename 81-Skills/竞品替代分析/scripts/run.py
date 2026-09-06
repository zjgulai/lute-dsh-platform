#!/usr/bin/env python3
"""
竞品替代分析 - 自包含 CLI 包装器（Competitor Alternatives）。

生成竞品对比矩阵 / 差异化定位声明 / 竞争话术的辅助脚本。
不依赖 skills._shared，可独立运行；无 LLM 调用时输出结构化脚手架，
供上层 Agent 在真实模型会话中填充内容。

用法:
    python run.py --product "产品名" --competitors "竞品A,竞品B" --output result.json
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


def build_scaffold(product: str, competitors: list[str], audience: str = "") -> dict[str, Any]:
    """生成竞品对比矩阵脚手架（结构化，供 LLM 填充）。"""
    matrix = {"维度": ["目标客群", "定价", "核心功能1", "核心功能2", "差异化能力", "适用场景"]}
    matrix["我们"] = ["" for _ in matrix["维度"]]
    for c in competitors:
        matrix[str(c)] = ["" for _ in matrix["维度"]]
    return {
        "skill": "竞品替代分析",
        "product": product,
        "competitors": competitors,
        "target_audience": audience,
        "deliverables": {
            "comparison_matrix": matrix,
            "positioning_statement": "",
            "talk_track": [],
            "alternative_to_copy": "",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="竞品替代分析 CLI（自包含脚手架）")
    parser.add_argument("--input", default=None, help="输入文本或 JSON/text 文件路径")
    parser.add_argument("--product", default=None, help="自身产品名")
    parser.add_argument("--competitors", default=None, help="竞品列表，逗号分隔")
    parser.add_argument("--audience", default="", help="目标客群（可选）")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="输出格式")
    args = parser.parse_args()

    product = args.product
    competitors: list[str] = []

    if args.input:
        input_path = Path(args.input)
        if input_path.exists():
            raw = input_path.read_text(encoding="utf-8")
            if args.input.endswith(".json"):
                try:
                    data = json.loads(raw)
                    product = product or data.get("product")
                    competitors = competitors or data.get("competitors", [])
                except json.JSONDecodeError as e:
                    print(f"Error: 输入 JSON 解析失败: {e}", file=sys.stderr)
                    sys.exit(1)
            else:
                if not product:
                    product = raw.strip()
        elif not product:
            product = args.input

    if args.competitors:
        competitors = [c.strip() for c in args.competitors.split(",") if c.strip()]

    # 输入校验：缺产品名或竞品列表时提示追问，而非硬编
    if not product or not competitors:
        missing = []
        if not product:
            missing.append("自身产品名")
        if not competitors:
            missing.append("竞品列表")
        print(f"Error: 缺少 {'、'.join(missing)}。请提供自身产品与至少一个竞品后再运行。",
              file=sys.stderr)
        sys.exit(2)

    result = build_scaffold(product, competitors, args.audience)

    if args.format == "text":
        lines = [f"竞品替代分析脚手架：{product}"]
        lines.append(f"竞品：{', '.join(competitors)}")
        lines.append("对比维度：目标客群 / 定价 / 核心功能 / 差异化能力 / 适用场景")
        output = "\n".join(lines)
    else:
        output = json.dumps(result, indent=2, ensure_ascii=False)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
