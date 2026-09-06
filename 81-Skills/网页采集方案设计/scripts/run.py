#!/usr/bin/env python3
"""
网页采集方案设计 - 采集字段审计辅助脚本。

读取一个网页样本（HTML 文件或纯文本），输出建议保留/剔除/待验证的字段清单，
辅助 Skill 的「样本审计」步骤。

Usage:
    python run.py --input sample.html --output result.json
    python run.py --input sample.txt --format text
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# 常见字段模式（启发式，仅辅助，非权威）
_FIELD_PATTERNS = {
    "title": r'(?i)<title[^>]*>(.*?)</title>',
    "heading": r'<h[1-6][^>]*>(.*?)</h[1-6]>',
    "link": r'href=["\'](.*?)["\']',
    "image": r'src=["\'](.*?)["\']',
    "time": r'(?i)(?:time|date)[^>]*>|datetime=["\'](.*?)["\']',
    "rating": r'(?i)(?:rating|score|star)["\']?\s*[:=]\s*["\']?([0-9.]+)',
    "price": r'(?i)(?:price|价)["]?\s*[:：=]\s*[¥￥$]?\s*([0-9,.]+)',
}


def audit(html: str) -> dict:
    """启发式审计页面中出现的字段类型，返回审计结论。"""
    found = {}
    for key, pattern in _FIELD_PATTERNS.items():
        matches = re.findall(pattern, html)
        if matches:
            found[key] = len(matches)
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description="网页采集字段审计辅助脚本")
    parser.add_argument("--input", required=True, help="输入 HTML/文本文件路径")
    parser.add_argument("--output", default=None, help="输出 JSON 文件路径（可选）")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="输出格式")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"错误：文件不存在 {input_path}", file=sys.stderr)
        return 1

    try:
        content = input_path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        print(f"错误：读取失败 {e}", file=sys.stderr)
        return 1

    result = audit(content)

    if args.format == "json":
        output = json.dumps({"文件名": input_path.name, "字段审计": result},
                            ensure_ascii=False, indent=2)
    else:
        lines = [f"{k}: {v}" for k, v in result.items()]
        output = "\n".join(lines) if lines else "未检测到常见字段"

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
