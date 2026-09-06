#!/usr/bin/env python3
"""品牌声音提取器 - 自包含 CLI 脚手架。

从品牌现有内容样本提取品牌声音指南的脚手架：
- 读取 SKILL.md 的六段式输出结构，打印成可填写的模板；
- 接收 --input 内容样本（文件路径或文本），标注为待分析素材；
- 不依赖 skills._shared 等外部包，任何环境可直接运行。

用法：
    python3 scripts/run.py --help
    python3 scripts/run.py --input "周末露营，带上XYZ就对了"
    python3 scripts/run.py --input ./样本.txt --output 指南.md
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent

OUTPUT_SECTIONS = [
    ("品牌人格画像", ["年龄", "性格", "角色"]),
    ("语调四维度（每维 1-10 分 + 题面依据）", [
        "正式 ↔ 随意",
        "严肃 ↔ 幽默",
        "尊重 ↔ 挑战",
        "理性 ↔ 感性",
    ]),
    ("用词规范", ["✅ 使用", "❌ 避免"]),
    ("句式偏好", ["长短句倾向", "语气词/标点习惯"]),
    ("禁忌清单", ["绝对不能说"]),
    ("应用示例", ["改写前后对照"]),
]


def load_body() -> str:
    """读取 SKILL.md 正文（frontmatter 之后）。"""
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return ""
    content = skill_md.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    return parts[2].strip() if len(parts) > 2 else content.strip()


def render_template(input_text: str | None) -> str:
    lines = ["# 品牌声音指南", ""]
    for section, items in OUTPUT_SECTIONS:
        lines.append(f"## {section}")
        lines.extend(f"- {item}：" for item in items)
        lines.append("")
    if input_text:
        lines.append("## 待分析素材")
        lines.append("```")
        lines.append(input_text.strip())
        lines.append("```")
        lines.append("")
        lines.append("> 请基于上述素材，为每个结论标注对应原文依据（主张须对应题面）。")
    else:
        lines.append("> 请提供品牌内容样本与品牌定位后再填写。")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="品牌声音提取器 CLI 脚手架（自包含，无外部依赖）"
    )
    parser.add_argument("--input", default=None, help="输入：品牌内容样本（文本或文件路径）")
    parser.add_argument("--output", default=None, help="输出文件路径（默认打印到 stdout）")
    args = parser.parse_args()

    input_text: str | None = None
    if args.input:
        p = Path(args.input)
        if p.exists() and p.is_file():
            input_text = p.read_text(encoding="utf-8")
        else:
            input_text = args.input
        if not input_text.strip():
            print("错误：输入内容为空。", file=sys.stderr)
            sys.exit(1)

    output = render_template(input_text)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"已写入 {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
