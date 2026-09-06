#!/usr/bin/env python3
"""
电商日报 CLI (E-Commerce Daily Report Command Line)

基于订单 CSV 生成日报/周报报告，支持文本和 JSON 两种输出格式。

Usage:
    # 生成昨日日报
    python scripts/run.py --input orders.csv --date 2026-04-08

    # 输出 JSON 格式
    python scripts/run.py --input orders.csv --date 2026-04-08 --format json

    # 输出到文件
    python scripts/run.py --input orders.csv --date 2026-04-08 --output report.json

    # 指定环比对比日期
    python scripts/run.py --input orders.csv --date 2026-04-08 --prev-date 2026-04-07

Example:
    python scripts/run.py --input ./data/orders_20260408.csv --date 2026-04-08 --format json
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

from .core import generate_daily_report

logger = logging.getLogger("ecom-daily-report")

# ═══════════════════════════════════════════════════════
# CLI Argument Parsing
# ═══════════════════════════════════════════════════════


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="ecom-daily-report",
        description="电商日报生成工具 -- 输入订单 CSV，输出日常经营报告与异常预警",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --input orders.csv --date 2026-04-08
  %(prog)s --input orders.csv --date 2026-04-08 --format json --output report.json
  %(prog)s --input orders.csv --date 2026-04-08 --prev-date 2026-04-01 --top-n 5
  %(prog)s --input orders.csv --date 2026-04-08 --verbose
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
        "-d", "--date",
        default=None,
        help="报告目标日期 (YYYY-MM-DD)。默认昨日",
    )
    io_group.add_argument(
        "-o", "--output",
        default=None,
        help="输出文件路径 (默认 stdout)",
    )
    io_group.add_argument(
        "--encoding",
        default=None,
        help="CSV 文件编码 (默认: 自动检测)",
    )

    # 报告选项
    report_group = parser.add_argument_group("Report Options")
    report_group.add_argument(
        "-f", "--format",
        default="text",
        choices=["text", "json"],
        help="输出格式 (默认: text)",
    )
    report_group.add_argument(
        "--prev-date",
        default=None,
        help="环比对比日期 (YYYY-MM-DD)。默认昨日",
    )
    report_group.add_argument(
        "--top-n",
        type=int,
        default=10,
        help="SKU 排行数量 (默认: 10)",
    )
    report_group.add_argument(
        "--no-quality",
        action="store_true",
        default=False,
        help="不包含数据质量报告",
    )

    # 日志
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        default=False,
        help="输出详细日志信息",
    )

    return parser


# ═══════════════════════════════════════════════════════
# CSV Loading
# ═══════════════════════════════════════════════════════


def load_csv(file_path: str, encoding: Optional[str] = None) -> pd.DataFrame:
    """
    加载订单 CSV 文件。

    Args:
        file_path: CSV 文件路径
        encoding: 文件编码。为 None 时自动检测。

    Returns:
        pd.DataFrame: 解析后的 DataFrame

    Raises:
        FileNotFoundError: 文件不存在
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"文件不存在: {file_path}")

    # 自动检测编码
    if encoding is None:
        encoding = _detect_encoding(path)

    logger.info("加载 CSV: %s (编码: %s)", file_path, encoding)

    try:
        df = pd.read_csv(path, encoding=encoding)
    except UnicodeDecodeError:
        logger.warning("编码 %s 解析失败, 尝试 gbk 回退", encoding)
        df = pd.read_csv(path, encoding="gbk")

    # 自动检测标准列
    df = _normalize_columns(df)

    if "order_date" not in df.columns:
        raise ValueError("CSV 中未找到 order_date 列，请确保数据包含订单日期字段")

    # 转换日期
    df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")

    # 转换金额
    if "order_amount" in df.columns:
        df["order_amount"] = pd.to_numeric(df["order_amount"], errors="coerce").fillna(0.0)
    else:
        raise ValueError("CSV 中未找到 order_amount 列，请确保数据包含订单金额字段")

    return df


def _detect_encoding(path: Path, sample_bytes: int = 8192) -> str:
    """检测文件编码。"""
    raw = path.read_bytes()[:sample_bytes]
    for enc in ("utf-8", "gbk", "gb2312"):
        try:
            raw.decode(enc)
            return enc
        except (UnicodeDecodeError, LookupError):
            continue
    return "gbk"


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    尝试将常见中英文列名映射为标准列名。

    映射规则:
    - "订单编号"/"订单号"/"order_id"/"Name" → "order_id"
    - "订单金额"/"金额"/"实付金额"/"amount"/"Total" → "order_amount"
    - "订单日期"/"日期"/"创建时间"/"下单时间"/"date"/"Created at" → "order_date"
    - "客户"/"会员"/"customer"/"buyer-email"/"Email" → "customer_id"
    - "商品名称"/"商品标题"/"product"/"sku" → "product_name"
    - "商品编码"/"SKU"/"SKU ID"/"sku_id" → "product_id"
    - "数量"/"quantity"/"qty" → "quantity"
    """
    COLUMN_ALIASES: dict[str, list[str]] = {
        "order_id": ["订单编号", "订单号", "order_id", "Name", "order-id", "京东订单号", "订单ID"],
        "order_amount": ["订单金额", "金额", "实付金额", "amount", "Total", "item-price", "总金额", "支付金额", "order_amount"],
        "order_date": ["订单日期", "日期", "创建时间", "下单时间", "date", "Created at", "purchase-date", "订单创建时间", "付款时间"],
        "customer_id": ["客户", "会员", "customer", "buyer-email", "Email", "买家会员名", "收货人", "买家昵称"],
        "product_name": ["商品名称", "商品标题", "product", "sku", "Lineitem name", "商品", "SKU"],
        "product_id": ["商品编码", "SKU ID", "sku_id", "sku id", "商品编号", "商品ID", "asin", "Lineitem sku"],
        "quantity": ["数量", "quantity", "qty", "购买数量", "Lineitem quantity"],
        "is_paid": ["is_paid", "订单状态", "是否支付", "支付状态"],
    }

    renamed: dict[str, str] = {}
    for col in df.columns:
        col_stripped = col.strip()
        for std_name, aliases in COLUMN_ALIASES.items():
            if col_stripped in aliases:
                renamed[col] = std_name
                break

    if renamed:
        df = df.rename(columns=renamed)
        logger.info("列名映射完成: %d 列已转换", len(renamed))

    return df


# ═══════════════════════════════════════════════════════
# Report Formatting
# ═══════════════════════════════════════════════════════


def format_report_text(report: dict[str, Any]) -> str:
    """
    将日报报告格式化为可读文本。

    Args:
        report: generate_daily_report 返回的字典

    Returns:
        str: 格式化文本
    """
    lines: list[str] = []
    date = report.get("date", "")
    lines.append(f"日报 | {date}")
    lines.append("=" * 48)
    lines.append("")

    # 警告
    if "warning" in report:
        lines.append(f"[警告] {report['warning']}")
        lines.append("")

    # 核心摘要
    summary = report.get("summary", {})
    lines.append("[核心指标]")
    lines.append(f"  销售额:    ¥{summary.get('total_revenue', 0):,.2f}")
    lines.append(f"  订单量:    {summary.get('total_orders', 0):,}")
    lines.append(f"  客单价:    ¥{summary.get('avg_order_value', 0):.2f}")
    lines.append(f"  客户数:    {summary.get('unique_customers', 0):,}")
    lines.append(f"  转化率:    {summary.get('conversion_rate', 'N/A')}")
    lines.append(f"  复购率:    {summary.get('repeat_purchase_rate', 'N/A')}")
    lines.append(f"  件单价:    {summary.get('avg_items_per_order', 0):.1f}")
    lines.append(f"  退款率:    {summary.get('refund_rate', 'N/A')}")
    lines.append("")

    # 环比对比
    comparison = report.get("comparison")
    if comparison and "warning" not in comparison:
        changes = comparison.get("changes", {})
        lines.append("[环比变化]")
        for metric, change_str in changes.items():
            metric_label = {
                "total_orders": "订单量",
                "total_revenue": "销售额",
                "unique_customers": "客户数",
                "avg_order_value": "客单价",
                "conversion_rate": "转化率",
                "repeat_purchase_rate": "复购率",
            }.get(metric, metric)
            lines.append(f"  {metric_label}: {change_str}")
        lines.append("")

    # 红绿信号
    signals = report.get("signals", [])
    if signals:
        lines.append("[信号预警]")
        for sig in signals:
            icon = "\U0001f534" if sig["severity"] == "red" else "\U0001f7e2"
            lines.append(f"  {icon} {sig['message']}")
        lines.append("")

    # 时段分布
    hourly = report.get("hourly_distribution", {})
    if hourly.get("hours"):
        hours_dict = hourly["hours"]
        lines.append("[时段分布]")
        peak_hour = hourly.get("peak_hour")
        peak_orders = hourly.get("peak_orders")
        if peak_hour is not None:
            lines.append(f"  峰值时段: {peak_hour}:00 ({peak_orders} 单)")
        off_peak = hourly.get("off_peak_rate", 0)
        lines.append(f"  凌晨占比 (0-6时): {off_peak:.1%}")

        # 柱状图简化表示
        hour_bars = []
        for h in range(0, 24, 3):
            count = hours_dict.get(str(h), 0)
            bar_len = max(1, int(count / max(hourly.get("peak_orders", 1), 1) * 20))
            hour_bars.append(f"  {h:02d}:00 {'#' * bar_len} ({count})")
        lines.append("  时段分布简图:")
        lines.extend(hour_bars)
        lines.append("")

    # Top SKU
    top_skus = report.get("top_skus", [])
    if top_skus:
        lines.append("[Top SKU]")
        for i, sku in enumerate(top_skus[:10], 1):
            lines.append(f"  {i}. {sku.get('product', 'N/A')}: "
                         f"¥{sku.get('revenue', 0):,.2f} ({sku.get('share_pct', '0%')})")
        lines.append("")

    # 异常预警
    anomalies = report.get("anomalies", [])
    if anomalies:
        lines.append("[异常预警]")
        for anom in anomalies:
            icon = "⚠️" if anom.get("severity") == "warning" else "ℹ️"
            lines.append(f"  {icon} {anom.get('message', '')}")
        lines.append("")

    # 样本量检查
    sample_check = report.get("sample_check", {})
    if sample_check:
        lines.append("[样本检查]")
        lines.append(f"  {sample_check.get('message', '')}")
        lines.append("")

    lines.append("=" * 48)
    lines.append(f"报告生成时间: {report.get('generated_at', '')}")
    return "\n".join(lines)


def format_report_json(report: dict[str, Any]) -> str:
    """将日报报告格式化为 JSON 字符串。"""
    serializable = _make_serializable(report)
    return json.dumps(serializable, ensure_ascii=False, indent=2)


def _make_serializable(obj: Any) -> Any:
    """递归地将对象转换为 JSON 可序列化格式。"""
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_make_serializable(v) for v in obj]
    elif isinstance(obj, (int, float)):
        if isinstance(obj, float) and (obj != obj):  # NaN check
            return None
        return obj
    elif isinstance(obj, str):
        return obj
    elif obj is None:
        return None
    else:
        return str(obj)


# ═══════════════════════════════════════════════════════
# Main Entry Point
# ═══════════════════════════════════════════════════════


def main(argv: Optional[list[str]] = None) -> int:
    """
    CLI 主入口。

    Args:
        argv: 命令行参数列表。为 None 时使用 sys.argv[1:]。

    Returns:
        int: 退出码 (0 = 成功, 1 = 错误)
    """
    parser = build_parser()
    args = parser.parse_args(argv)

    # 日志级别
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    start_time = time.time()

    try:
        # 确定日期
        if args.date:
            target_date = args.date
        else:
            target_date = str((datetime.now() - timedelta(days=1)).date())
            logger.info("未指定日期, 使用昨日: %s", target_date)

        # 确定环比日期
        prev_date = args.prev_date
        if prev_date is None:
            prev_date = str((pd.Timestamp(target_date) - timedelta(days=1)).date())

        # 检查输入文件
        input_path = Path(args.input)
        if not input_path.exists():
            logger.error("文件不存在: %s", args.input)
            return 1

        # 加载数据
        df = load_csv(str(input_path), encoding=args.encoding)

        logger.info("数据加载完成: %d 行 x %d 列", len(df), len(df.columns))

        # 构建配置
        config = {
            "top_n": args.top_n,
            "prev_date": prev_date,
            "include_quality_report": not args.no_quality,
        }

        # 生成报告
        report = generate_daily_report(df, target_date, config)

        # 输出
        if args.format == "json":
            output_str = format_report_json(report)
        else:
            output_str = format_report_text(report)

        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(output_str, encoding="utf-8")
            logger.info("报告已写入: %s", out_path)
            print(f"报告已保存至: {out_path}")
        else:
            print(output_str)

        elapsed = time.time() - start_time
        logger.info("日报生成完成, 耗时: %.2f 秒", elapsed)

        return 0

    except FileNotFoundError as e:
        logger.error("文件未找到: %s", e)
        return 1
    except ValueError as e:
        logger.error("参数错误: %s", e)
        return 1
    except Exception as e:
        logger.exception("日报生成失败: %s", e)
        return 1


# ═══════════════════════════════════════════════════════
# Script Entry
# ═══════════════════════════════════════════════════════

if __name__ == "__main__":
    sys.exit(main())
