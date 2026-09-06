#!/usr/bin/env python3
"""
电商经营复盘 CLI (E-Commerce Business Review Command Line)

基于订单 CSV 生成经营复盘报告，支持 KPI 树、趋势对比、红绿信号和行动建议。

Usage:
    # 生成 30 天复盘
    python scripts/run.py --input orders.csv --period 2026-01-01,2026-01-31

    # 带对比周期
    python scripts/run.py --input orders.csv \\
        --period 2026-01-01,2026-01-31 \\
        --comparison-period 2025-12-01,2025-12-31

    # 输出 JSON
    python scripts/run.py --input orders.csv --period 2026-01-01,2026-01-31 --format json

    # 输出 Markdown 报告到文件
    python scripts/run.py --input orders.csv --period 2026-01-01,2026-01-31 \\
        --format markdown --output REVIEW.md

Example:
    python scripts/run.py --input ./data/orders_q1.csv --period 2026-01-01,2026-03-31 --format markdown
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from .core import generate_review_report

logger = logging.getLogger("da-ecom-insights")

# ═══════════════════════════════════════════════════════
# CLI Argument Parsing
# ═══════════════════════════════════════════════════════


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="da-ecom-insights",
        description="电商经营复盘工具 -- 输入订单 CSV，生成 KPI 树拆解、红绿信号、归因与行动建议",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --input orders.csv --period 2026-01-01,2026-01-31
  %(prog)s --input orders.csv --period 2026-01-01,2026-03-31 --comparison-period 2025-10-01,2025-12-31
  %(prog)s --input orders.csv --period 2026-01-01,2026-01-31 --format json --output report.json
  %(prog)s --input orders.csv --period 2026-01-01,2026-01-31 --format markdown --output REVIEW.md
  %(prog)s --input orders.csv --period 2026-01-01,2026-01-31 --window-days 90
        """,
    )

    # 输入输出
    io_group = parser.add_argument_group("Input / Output")
    io_group.add_argument(
        "-i", "--input",
        required=True,
        help="订单 CSV 文件路径",
    )
    io_group.add_argument(
        "-p", "--period",
        required=True,
        help="分析周期，格式: start_date,end_date (YYYY-MM-DD,YYYY-MM-DD)",
    )
    io_group.add_argument(
        "--comparison-period",
        default=None,
        help="对比周期，格式: start_date,end_date (YYYY-MM-DD,YYYY-MM-DD)",
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
        help="CSV 文件编码 (默认 utf-8)",
    )

    # 分析参数
    analysis_group = parser.add_argument_group("Analysis Options")
    analysis_group.add_argument(
        "--window-days",
        type=int,
        default=30,
        help="KPI 树分析窗口天数 (默认 30)",
    )
    analysis_group.add_argument(
        "--top-n",
        type=int,
        default=5,
        help="SKU 排行返回数量 (默认 5)",
    )
    analysis_group.add_argument(
        "--revenue-drop-threshold",
        type=float,
        default=-0.20,
        help="销售额红色信号阈值 (默认 -0.20 = 下降20%%)",
    )
    analysis_group.add_argument(
        "--aov-drop-threshold",
        type=float,
        default=-0.10,
        help="客单价红色信号阈值 (默认 -0.10 = 下降10%%)",
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


def load_csv(filepath: str, encoding: str = "utf-8") -> pd.DataFrame:
    """
    加载 CSV 文件为 DataFrame。

    Args:
        filepath: CSV 文件路径
        encoding: 文件编码

    Returns:
        pd.DataFrame

    Raises:
        FileNotFoundError: 文件不存在
        ValueError: 无法解析 CSV
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"文件不存在: {filepath}")

    data = pd.read_csv(path, encoding=encoding)

    if data.empty:
        raise ValueError(f"CSV 为空: {filepath}")

    # 自动检测并转换日期列
    for col in data.columns:
        if "date" in col.lower() or "time" in col.lower():
            try:
                data[col] = pd.to_datetime(data[col], errors="coerce")
            except Exception:
                pass

    return data


def parse_period(period_str: str) -> tuple[str, str]:
    """
    解析周期参数。

    Args:
        period_str: "start,end" 格式

    Returns:
        (start_date, end_date)

    Raises:
        ValueError: 格式无效
    """
    parts = period_str.split(",")
    if len(parts) != 2:
        raise ValueError(f"周期格式无效: {period_str}，应为 start_date,end_date")

    start, end = parts[0].strip(), parts[1].strip()
    # 验证日期格式
    datetime.strptime(start, "%Y-%m-%d")
    datetime.strptime(end, "%Y-%m-%d")
    return start, end


# ═══════════════════════════════════════════════════════
# Output Formatting
# ═══════════════════════════════════════════════════════


def format_text(report: dict[str, Any]) -> str:
    """文本格式输出。"""
    lines: list[str] = []
    meta = report.get("metadata", {})
    lines.append("=" * 60)
    lines.append(f"  电商经营复盘报告")
    lines.append(f"  Period: {meta.get('period', 'N/A')}")
    lines.append(f"  Generated: {meta.get('generated_at', 'N/A')}")
    lines.append("=" * 60)
    lines.append("")

    # 数据质量
    dq = report.get("data_quality", {})
    lines.append(f"[数据质量] 行数: {dq.get('total_rows', 'N/A')}, "
                 f"平台: {dq.get('detected_platform', 'N/A')}, "
                 f"可用: {dq.get('is_ready', 'N/A')}")
    lines.append("")

    # KPI 树
    kt = report.get("kpi_tree", {})
    ps = kt.get("polar_star", {})
    lines.append(f"[北极星] GMV: {ps.get('gmv', 'N/A')} | "
                 f"Revenue: {ps.get('revenue', 'N/A')} | "
                 f"Orders: {ps.get('total_orders', 'N/A')}")

    gf = kt.get("growth_factors", {})
    orders_info = gf.get("orders", {})
    lines.append(f"[增长因子] Orders: {orders_info.get('total', 0)} "
                 f"(New: {orders_info.get('new_customer_orders', 0)}, "
                 f"Repeat: {orders_info.get('repeat_customer_orders', 0)}) | "
                 f"AOV: {gf.get('aov', 'N/A')}")

    cq = kt.get("customer_quality", {})
    lines.append(f"[客户质量] Unique: {cq.get('unique_customers', 'N/A')} | "
                 f"Repeat: {cq.get('repeat_purchase_rate', 'N/A')}")
    lines.append("")

    # 趋势
    trend = report.get("trend", {})
    changes = trend.get("changes", {})
    if changes:
        lines.append("[环比变化]")
        for metric, pct in changes.items():
            if isinstance(pct, float):
                icon = "+" if pct > 0 else ""
                lines.append(f"  {metric}: {icon}{pct:.1%}")
        lines.append("")

    # 信号
    signals = report.get("signals", [])
    if signals:
        lines.append("[红绿信号]")
        for sig in signals:
            icon = "RED" if sig.get("severity") == "red" else "GREEN"
            lines.append(f"  {icon}: {sig.get('message', '')}")
        lines.append("")

    # 归因
    attrs = report.get("attribution", [])
    if attrs:
        lines.append("[归因分析]")
        for attr in attrs:
            lines.append(f"  {attr.get('factor', '')} ({attr.get('direction', '')}): "
                         f"{attr.get('description', '')}")
        lines.append("")

    # 行动
    actions = report.get("action_plan", [])
    if actions:
        lines.append("[行动建议]")
        for act in actions:
            lines.append(f"  #{act.get('priority', '?')} {act.get('action', '')} "
                         f"[{act.get('expected_impact', 'N/A')}/{act.get('effort', 'N/A')}]")
        lines.append("")

    lines.append("=" * 60)
    return "\n".join(lines)


def format_json(report: dict[str, Any]) -> str:
    """JSON 格式输出。"""
    # 确保所有 numpy 类型可 JSON 序列化
    class NumpyEncoder(json.JSONEncoder):
        def default(self, obj):
            import numpy as np
            if isinstance(obj, (np.integer,)):
                return int(obj)
            elif isinstance(obj, (np.floating,)):
                return float(obj)
            elif isinstance(obj, (np.ndarray,)):
                return obj.tolist()
            elif isinstance(obj, (np.bool_,)):
                return bool(obj)
            elif isinstance(obj, pd.Timestamp):
                return str(obj)
            return super().default(obj)

    return json.dumps(report, indent=2, ensure_ascii=False, cls=NumpyEncoder)


def format_markdown(report: dict[str, Any]) -> str:
    """Markdown 格式输出（直接返回 review_markdown 字段）。"""
    md = report.get("review_markdown", "")
    if md:
        return md
    # 回退到文本格式
    return format_text(report)


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
        # 1. 解析参数
        period_start, period_end = parse_period(args.period)

        comparison_config = {}
        if args.comparison_period:
            comp_start, comp_end = parse_period(args.comparison_period)
            comparison_config["comparison_start"] = comp_start
            comparison_config["comparison_end"] = comp_end

        # 2. 加载数据
        logger.info(f"加载 CSV: {args.input}")
        start_time = time.time()
        df = load_csv(args.input, encoding=args.encoding)
        logger.info(f"加载完成: {len(df)} 行, 耗时 {time.time() - start_time:.1f}s")

        # 3. 配置
        config = {
            "window_days": args.window_days,
            "top_n": args.top_n,
            "thresholds": {
                "revenue_drop_red": args.revenue_drop_threshold,
                "aov_drop_red": args.aov_drop_threshold,
            },
            **comparison_config,
        }

        # 4. 生成报告
        logger.info(f"生成报告, 周期: {period_start} ~ {period_end}")
        report = generate_review_report(df, period_start, period_end, config=config)

        # 5. 格式化输出
        if args.format == "json":
            output = format_json(report)
        elif args.format == "markdown":
            output = format_markdown(report)
        else:
            output = format_text(report)

        # 6. 输出
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
