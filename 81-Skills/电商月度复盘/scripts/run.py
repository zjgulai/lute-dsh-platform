#!/usr/bin/env python3
"""
电商月度复盘 CLI (E-Commerce Monthly Review Command Line)

基于订单 CSV 生成月度复盘报告，支持文本和 JSON 输出格式。

Usage:
    # 生成 2026 年 3 月月度报告
    python scripts/run.py --input orders.csv --year 2026 --month 3

    # 指定目标值进行 KPI 完成度分析
    python scripts/run.py --input orders.csv --year 2026 --month 3 \\
        --targets '{"total_revenue": 4000000, "total_orders": 10000}'

    # JSON 格式输出到文件
    python scripts/run.py --input orders.csv --year 2026 --month 3 --format json --output report.json

    # 指定环比周期
    python scripts/run.py --input orders.csv --year 2026 --month 3 --prev-year 2026 --prev-month 2

Example:
    python scripts/run.py --input ./data/orders_202603.csv --year 2026 --month 3 --format json
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

import pandas as pd

from .core import generate_monthly_report

logger = logging.getLogger("ecom-monthly-review")

# ═══════════════════════════════════════════════════════
# CLI Argument Parsing
# ═══════════════════════════════════════════════════════


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="ecom-monthly-review",
        description="电商月度复盘工具 -- 输入订单 CSV，输出月度 KPI 报告、趋势分析与问题诊断",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --input orders.csv --year 2026 --month 3
  %(prog)s --input orders.csv --year 2026 --month 3 --format json --output report.json
  %(prog)s --input orders.csv --year 2026 --month 3 --targets '{"total_revenue":4000000}'
  %(prog)s --input orders.csv --year 2026 --month 3 --prev-year 2026 --prev-month 2
  %(prog)s --input orders.csv --year 2026 --month 3 --verbose
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
        "-y", "--year",
        type=int,
        default=None,
        help="报告年份 (如 2026)。默认当前年份",
    )
    io_group.add_argument(
        "-m", "--month",
        type=int,
        default=None,
        help="报告月份 (1-12)。默认上月",
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
        "-t", "--targets",
        default=None,
        help="月度目标的 JSON 字符串，如 '{\"total_revenue\": 4000000}'",
    )
    report_group.add_argument(
        "--top-n",
        type=int,
        default=10,
        help="SKU 排行数量 (默认: 10)",
    )
    report_group.add_argument(
        "--prev-year",
        type=int,
        default=None,
        help="环比对比年份 (默认: 上个月)",
    )
    report_group.add_argument(
        "--prev-month",
        type=int,
        default=None,
        help="环比对比月份 (默认: 上个月)",
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
        ValueError: 缺少必要字段
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

    # 自动映射列名
    df = _normalize_columns(df)

    if "order_date" not in df.columns:
        raise ValueError("CSV 中未找到 order_date 列，请确保数据包含订单日期字段")

    if "order_amount" not in df.columns:
        raise ValueError("CSV 中未找到 order_amount 列，请确保数据包含订单金额字段")

    # 转换日期
    df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")

    # 转换金额
    df["order_amount"] = pd.to_numeric(df["order_amount"], errors="coerce").fillna(0.0)

    # 丢弃无法解析日期的行
    before = len(df)
    df = df.dropna(subset=["order_date"])
    if len(df) < before:
        logger.warning("丢弃了 %d 行无法解析日期的记录", before - len(df))

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
    - "订单编号"/"订单号"/"order_id"/"Name" -> "order_id"
    - "订单金额"/"金额"/"实付金额"/"amount"/"Total" -> "order_amount"
    - "订单日期"/"日期"/"创建时间"/"下单时间"/"date"/"Created at" -> "order_date"
    - "客户"/"会员"/"customer"/"buyer-email"/"Email" -> "customer_id"
    - "商品名称"/"商品标题"/"product"/"sku" -> "product_name"
    - "商品编码"/"SKU"/"sku_id" -> "product_id"
    - "数量"/"quantity"/"qty" -> "quantity"
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
    将月度复盘报告格式化为可读文本。

    Args:
        report: generate_monthly_report 返回的字典

    Returns:
        str: 格式化文本
    """
    lines: list[str] = []
    period = report.get("period", "")
    lines.append(f"月度复盘 | {period}")
    lines.append("=" * 48)
    lines.append("")

    # 警告
    if "warning" in report:
        lines.append(f"[警告] {report['warning']}")
        lines.append("")

    # KPI 概览
    kpis = report.get("kpis", {})
    lines.append("[KPI 概览]")
    lines.append(f"  销售额:    ¥{kpis.get('total_revenue', 0):,.2f}")
    lines.append(f"  订单量:    {kpis.get('total_orders', 0):,}")
    lines.append(f"  客单价:    ¥{kpis.get('avg_order_value', 0):.2f}")
    lines.append(f"  客户数:    {kpis.get('unique_customers', 0):,}")
    lines.append(f"  转化率:    {kpis.get('conversion_rate', 'N/A')}")
    lines.append(f"  复购率:    {kpis.get('repeat_purchase_rate', 'N/A')}")
    lines.append(f"  件单价:    {kpis.get('avg_items_per_order', 0):.1f}")
    lines.append(f"  退款率:    {kpis.get('refund_rate', 'N/A')}")
    lines.append(f"  数据天数:  {kpis.get('data_days', 0)}")
    lines.append("")

    # 目标完成度
    attainment = kpis.get("attainment", {})
    if attainment:
        lines.append("[目标完成度]")
        for metric, data in attainment.items():
            metric_label = {
                "total_revenue": "销售额目标",
                "total_orders": "订单量目标",
                "avg_order_value": "客单价目标",
                "unique_customers": "客户数目标",
            }.get(metric, metric)
            status_icon = "✅" if data.get("status") == "exceeded" else ("⚠️" if data.get("status") == "warning" else "❌")
            lines.append(f"  {status_icon} {metric_label}: ¥{data.get('actual', 0):,.2f} / ¥{data.get('target', 0):,.2f} ({data.get('rate', 0):.1f}%)")
        lines.append("")

    # 趋势概览
    trend = report.get("daily_trend", [])
    if trend:
        revenues = [d.get("revenue", 0) for d in trend]
        orders = [d.get("orders", 0) for d in trend]
        avg_rev = sum(revenues) / max(len(revenues), 1)
        avg_ord = sum(orders) / max(len(orders), 1)
        max_rev_day = max(trend, key=lambda d: d.get("revenue", 0))
        lines.append("[趋势概览]")
        lines.append(f"  日均销售额: ¥{avg_rev:,.2f}")
        lines.append(f"  日均订单量: {avg_ord:.1f}")
        lines.append(f"  峰值日: {max_rev_day.get('date', '')} (¥{max_rev_day.get('revenue', 0):,.2f})")

        # 变化方向判断
        if len(revenues) >= 7:
            first_week_avg = sum(revenues[:7]) / 7
            last_week_avg = sum(revenues[-7:]) / 7
            if last_week_avg > first_week_avg * 1.05:
                trend_dir = "上升"
            elif last_week_avg < first_week_avg * 0.95:
                trend_dir = "下降"
            else:
                trend_dir = "持平"
            lines.append(f"  月内趋势: {trend_dir}")
        lines.append("")

    # 工作日/周末对比
    ww = report.get("weekday_weekend", {})
    if ww:
        wd = ww.get("weekday", {})
        we = ww.get("weekend", {})
        wd_days = wd.get("days", 0)
        we_days = we.get("days", 0)
        if wd_days > 0 or we_days > 0:
            lines.append("[工作日 vs 周末]")
            lines.append(f"  工作日 ({wd_days}天): ¥{wd.get('total_revenue', 0):,.2f} ({wd.get('share_pct', {}).get('revenue', 0):.0f}%) | "
                         f"日均 ¥{wd.get('avg_daily_revenue', 0):,.2f}")
            lines.append(f"  周末   ({we_days}天): ¥{we.get('total_revenue', 0):,.2f} ({we.get('share_pct', {}).get('revenue', 0):.0f}%) | "
                         f"日均 ¥{we.get('avg_daily_revenue', 0):,.2f}")
            lines.append("")

    # 环比对比
    mom = report.get("mom_comparison", {})
    if mom and "warning" not in mom:
        changes = mom.get("changes", {})
        lines.append("[环比变化 (vs 上月)]")
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

        # 信号
        signals = mom.get("signals", [])
        if signals:
            lines.append("[红绿信号]")
            for sig in signals:
                icon = "\U0001f534" if sig.get("severity") == "red" else "\U0001f7e2"
                lines.append(f"  {icon} {sig.get('message', '')}")
            lines.append("")

    # Top SKU
    top_skus = report.get("top_skus", [])
    if top_skus:
        lines.append("[Top SKU]")
        for i, sku in enumerate(top_skus[:10], 1):
            lines.append(f"  {i}. {sku.get('product', 'N/A')}: "
                         f"¥{sku.get('revenue', 0):,.2f} ({sku.get('share_pct', '0%')})")
        lines.append("")

    # 问题诊断
    shortfalls = report.get("shortfalls", [])
    if shortfalls:
        lines.append("[问题诊断]")
        for sf in shortfalls:
            metric_label = {
                "total_revenue": "销售额",
                "total_orders": "订单量",
                "avg_order_value": "客单价",
                "unique_customers": "客户数",
            }.get(sf.get("metric", ""), sf.get("metric", ""))
            lines.append(f"  ⚠️ {metric_label}: 差距 {abs(sf.get('gap_pct', 0)):.1f}%")
            lines.append(f"    实际: {sf.get('actual', 0):,.2f} / 目标: {sf.get('target', 0):,.2f}")
            lines.append(f"    建议: {sf.get('diagnosis', '')}")
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
    """将月度复盘报告格式化为 JSON 字符串。"""
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
        # 确定年月
        now = datetime.now()
        year = args.year if args.year else now.year

        if args.month:
            month = args.month
        else:
            # 默认上月
            if now.month == 1:
                month = 12
                year = year - 1
            else:
                month = now.month - 1

        logger.info("报告周期: %d 年 %d 月", year, month)

        # 解析目标
        targets: Optional[dict[str, float]] = None
        if args.targets:
            try:
                targets = json.loads(args.targets)
                logger.info("月度目标已加载: %s", targets)
            except json.JSONDecodeError as e:
                logger.error("目标 JSON 解析失败: %s", e)
                return 1

        # 环比周期
        prev_period = None
        if args.prev_year is not None and args.prev_month is not None:
            prev_period = (args.prev_year, args.prev_month)
            logger.info("环比周期: %d 年 %d 月", args.prev_year, args.prev_month)

        # 检查输入文件
        input_path = Path(args.input)
        if not input_path.exists():
            logger.error("文件不存在: %s", args.input)
            return 1

        # 加载数据
        df = load_csv(str(input_path), encoding=args.encoding)

        logger.info("数据加载完成: %d 行 x %d 列", len(df), len(df.columns))

        # 构建配置
        config: dict[str, Any] = {
            "top_n": args.top_n,
            "include_quality_report": not args.no_quality,
        }
        if targets:
            config["targets"] = targets
        if prev_period:
            config["prev_period"] = prev_period

        # 生成报告
        report = generate_monthly_report(df, year, month, config)

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
        logger.info("月度复盘报告生成完成, 耗时: %.2f 秒", elapsed)

        return 0

    except FileNotFoundError as e:
        logger.error("文件未找到: %s", e)
        return 1
    except ValueError as e:
        logger.error("参数错误: %s", e)
        return 1
    except Exception as e:
        logger.exception("月度复盘报告生成失败: %s", e)
        return 1


# ═══════════════════════════════════════════════════════
# Script Entry
# ═══════════════════════════════════════════════════════

if __name__ == "__main__":
    sys.exit(main())
