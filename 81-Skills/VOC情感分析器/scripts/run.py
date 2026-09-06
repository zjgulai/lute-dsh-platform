#!/usr/bin/env python3
"""
VOC 情感分析 CLI (Voice of Customer Sentiment Analyzer Command Line)

基于 CSV/JSON 格式的产品评价数据，生成情感分布、维度情感、
痛点优先级、卖点提炼和行动建议报告。

Usage:
    # CSV 评价数据
    python scripts/run.py --input reviews.csv --format text

    # JSON 评价数据
    python scripts/run.py --input reviews.json --format json

    # 自定义维度关键词
    python scripts/run.py --input reviews.csv --aspect-keywords my_keywords.json

    # 指定痛点数量
    python scripts/run.py --input reviews.csv --top-n 15

    # 输出报告到文件
    python scripts/run.py --input reviews.csv --format json --output voc_report.json

Example:
    python scripts/run.py --input ./data/product_reviews.csv --format text --top-n 10
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from .core import (
    ASPECT_KEYWORDS,
    generate_voc_report,
    parse_reviews,
)

logger = logging.getLogger("da-voc-sentiment-analyzer")

# ═══════════════════════════════════════════════════════
# CLI Argument Parsing
# ═══════════════════════════════════════════════════════


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="da-voc-sentiment-analyzer",
        description="VOC 评价情感分析工具 -- 输入 CSV/JSON 评价数据，输出情感分布、痛点排序和行动建议",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --input reviews.csv
  %(prog)s --input reviews.csv --format json --output voc_report.json
  %(prog)s --input reviews.csv --aspect-keywords custom_aspects.json --top-n 15
  %(prog)s --input reviews.json --format json
        """,
    )

    # 输入输出
    io_group = parser.add_argument_group("Input / Output")
    io_group.add_argument(
        "-i", "--input",
        required=True,
        help="评价数据文件路径 (CSV 或 JSON)",
    )
    io_group.add_argument(
        "-o", "--output",
        default=None,
        help="输出文件路径 (默认 stdout)",
    )
    io_group.add_argument(
        "-f", "--format",
        default="text",
        choices=["text", "json", "markdown"],
        help="输出格式 (默认 text)",
    )
    io_group.add_argument(
        "--encoding",
        default="utf-8",
        help="输入文件编码 (默认 utf-8)",
    )

    # 分析参数
    analysis_group = parser.add_argument_group("Analysis Options")
    analysis_group.add_argument(
        "--aspect-keywords",
        default=None,
        help="自定义维度关键词 JSON 文件路径",
    )
    analysis_group.add_argument(
        "--top-n",
        type=int,
        default=10,
        help="痛点/赞美返回数量 (默认 10)",
    )
    analysis_group.add_argument(
        "--min-reviews",
        type=int,
        default=50,
        help="最小评价数量建议值 (默认 50)",
    )

    # 其他
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="启用详细日志输出",
    )

    return parser


# ═══════════════════════════════════════════════════════
# Input Loading
# ═══════════════════════════════════════════════════════


def load_input(filepath: str, encoding: str = "utf-8") -> tuple[str, str]:
    """
    加载输入文件并推断格式。

    Returns:
        (file_content, format): 文件内容和格式类型 ("csv" | "json")

    Raises:
        FileNotFoundError: 文件不存在
        ValueError: 无法识别的文件格式
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"文件不存在: {filepath}")

    content = path.read_text(encoding=encoding)
    if not content.strip():
        raise ValueError(f"文件为空: {filepath}")

    # 根据扩展名推断格式
    ext = path.suffix.lower()
    if ext == ".json":
        return content, "json"
    elif ext == ".csv":
        return content, "csv"
    elif ext == ".tsv":
        return content, "csv"
    else:
        # 尝试自动检测: JSON 以 { 或 [ 开头
        stripped = content.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            return content, "json"
        else:
            return content, "csv"


def load_aspect_keywords(filepath: str) -> dict[str, list[str]]:
    """
    加载自定义维度关键词 JSON 文件。

    JSON 格式:
    {
        "quality": ["质量", "材质", "quality", ...],
        "price": ["价格", "price", ...],
        ...
    }

    Args:
        filepath: JSON 文件路径

    Returns:
        dict: 维度关键词映射

    Raises:
        FileNotFoundError: 文件不存在
        ValueError: JSON 格式无效
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"关键词文件不存在: {filepath}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            keywords = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"关键词 JSON 解析失败: {e}")

    if not isinstance(keywords, dict):
        raise ValueError("关键词文件需为 JSON 对象 {dimension: [keywords...]}")
    for k, v in keywords.items():
        if not isinstance(v, list):
            raise ValueError(f"维度 '{k}' 的值应为关键词列表")
    return keywords


# ═══════════════════════════════════════════════════════
# Output Formatting
# ═══════════════════════════════════════════════════════


def format_text(report: dict[str, Any]) -> str:
    """文本格式输出（复用报告中的 report_text）。"""
    rt = report.get("report_text", "")
    if rt:
        return rt
    # 回退
    import json
    return json.dumps(report, indent=2, ensure_ascii=False)


def format_json(report: dict[str, Any]) -> str:
    """JSON 格式输出。"""
    return json.dumps(report, indent=2, ensure_ascii=False)


def format_markdown(report: dict[str, Any]) -> str:
    """Markdown 格式输出。"""
    lines: list[str] = []
    meta = report.get("metadata", {})
    lines.append("# VOC Sentiment Analysis Report")
    lines.append("")
    lines.append(f"**Total Reviews**: {meta.get('total_reviews', 0)}")
    lines.append(f"**Generated**: {meta.get('generated_at', 'N/A')}")
    lines.append("")

    # 情感分布
    sd = report.get("sentiment_distribution", {})
    lines.append("## Sentiment Distribution")
    lines.append("")
    lines.append("| Category | Count | Percentage |")
    lines.append("|----------|-------|------------|")
    lines.append(f"| Positive | {sd.get('positive', {}).get('count', 0)} | {sd.get('positive', {}).get('pct', '0%')} |")
    lines.append(f"| Neutral  | {sd.get('neutral', {}).get('count', 0)} | {sd.get('neutral', {}).get('pct', '0%')} |")
    lines.append(f"| Negative | {sd.get('negative', {}).get('count', 0)} | {sd.get('negative', {}).get('pct', '0%')} |")
    nps = sd.get("nps_score")
    if nps is not None:
        lines.append(f"| NPS Score | {nps} | |")
    avg_r = sd.get("avg_rating")
    if avg_r is not None:
        lines.append(f"| Avg Rating | {avg_r} | |")
    lines.append("")

    # 维度分析
    aa = report.get("aspect_analysis", {})
    lines.append("## Aspect-Based Sentiment")
    lines.append("")
    lines.append("| Aspect | Mentions | Positive | Negative | Score |")
    lines.append("|--------|----------|----------|----------|-------|")
    for aspect_name, data in sorted(aa.items(), key=lambda x: x[1].get("total_mentions", 0), reverse=True):
        total = data.get("total_mentions", 0)
        if total > 0:
            pos = data.get("positive_count", 0)
            neg = data.get("negative_count", 0)
            score = data.get("score", 0)
            lines.append(f"| {aspect_name} | {total} | {pos} | {neg} | {score:.2f} |")
    lines.append("")

    # 痛点
    pp = report.get("pain_points_and_praise", {})
    pain = pp.get("pain_points", [])
    if pain:
        lines.append("## Top Pain Points")
        lines.append("")
        lines.append("| # | Aspect | Frequency | Severity |")
        lines.append("|---|--------|-----------|----------|")
        for i, p in enumerate(pain[:5]):
            lines.append(f"| {i+1} | {p.get('aspect', '')} | {p.get('frequency', 0)} | {p.get('severity', 0):.2f} |")
        lines.append("")

    # 赞美
    praise = pp.get("praise_areas", [])
    if praise:
        lines.append("## Top Praise Areas")
        lines.append("")
        lines.append("| # | Aspect | Score |")
        lines.append("|---|--------|-------|")
        for i, p in enumerate(praise[:3]):
            lines.append(f"| {i+1} | {p.get('aspect', '')} | {p.get('score', 0):.2f} |")
        lines.append("")

    # 优先级矩阵
    pm = report.get("priority_matrix", [])
    if pm:
        lines.append("## Priority Matrix")
        lines.append("")
        lines.append("| Aspect | Priority | Recommendation |")
        lines.append("|--------|----------|----------------|")
        for item in pm:
            lines.append(f"| {item.get('aspect', '')} | **{item.get('priority', '')}** | {item.get('recommendation', '')} |")
        lines.append("")

    # 行动建议
    ap = report.get("action_plan", [])
    if ap:
        lines.append("## Action Plan")
        lines.append("")
        for act in ap:
            lines.append(f"{act.get('priority', '?')}. **{act.get('recommendation', '')}**")
        lines.append("")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════
# Main Entry Point
# ═══════════════════════════════════════════════════════


def main() -> int:
    """CLI 入口函数。返回退出码。"""
    parser = build_parser()
    args = parser.parse_args()

    # 日志级别
    log_level = logging.DEBUG if args.verbose else logging.WARNING
    logging.basicConfig(level=log_level, format="%(levelname)s: %(message)s")

    try:
        # 1. 加载数据
        logger.info(f"加载输入文件: {args.input}")
        start_time = time.time()
        content, source_format = load_input(args.input, encoding=args.encoding)
        logger.info(f"加载完成, 格式: {source_format}, 耗时 {time.time() - start_time:.1f}s")

        # 2. 解析评价
        reviews = parse_reviews(content, source_format=source_format)
        logger.info(f"解析出 {len(reviews)} 条评价记录")

        if not reviews:
            print("Warning: 未解析出有效评价记录", file=sys.stderr)
            return 1

        # 3. 加载自定义关键词
        aspect_keywords = None
        if args.aspect_keywords:
            logger.info(f"加载自定义关键词: {args.aspect_keywords}")
            aspect_keywords = load_aspect_keywords(args.aspect_keywords)

        # 4. 配置
        config = {
            "top_n": args.top_n,
            "min_reviews": args.min_reviews,
        }
        if aspect_keywords:
            config["aspect_keywords"] = aspect_keywords

        # 5. 生成报告
        logger.info("生成 VOC 分析报告")
        report = generate_voc_report(reviews, config=config)

        # 6. 格式化输出
        if args.format == "json":
            output = format_json(report)
        elif args.format == "markdown":
            output = format_markdown(report)
        else:
            output = format_text(report)

        # 7. 输出
        data_quality = report.get("data_quality", {})
        if data_quality.get("total_reviews", 0) < data_quality.get("min_reviews_required", 50):
            logger.warning(
                f"评价数不足 ({data_quality.get('total_reviews', 0)} < "
                f"{data_quality.get('min_reviews_required', 50)}), 分析置信度可能降低"
            )

        if args.output:
            out_path = Path(args.output)
            out_path.write_text(output, encoding="utf-8")
            logger.info(f"报告已保存: {out_path.resolve()}")
            print(f"Report written to {out_path.resolve()}")
        else:
            print(output)

        return 0

    except FileNotFoundError as e:
        logger.error(str(e))
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        logger.error(str(e))
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        logger.exception("运行出错")
        print(f"Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
