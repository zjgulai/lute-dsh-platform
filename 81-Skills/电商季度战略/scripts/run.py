#!/usr/bin/env python3
"""
电商季度战略 CLI (E-Commerce Quarterly Strategy Command Line)

基于订单 CSV 生成季度战略复盘报告，支持文本和 JSON 输出格式。

Usage:
    # 生成 2026 年 Q1 季度报告
    python scripts/run.py --input orders.csv --year 2026 --quarter 1

    # 指定年度目标进行对标分析
    python scripts/run.py --input orders.csv --year 2026 --quarter 1 \\
        --annual-target '{"total_revenue": 50000000, "total_orders": 120000}'

    # JSON 格式输出到文件
    python scripts/run.py --input orders.csv --year 2026 --quarter 1 --format json --output report.json

    # 指定环比对比季度
    python scripts/run.py --input orders.csv --year 2026 --quarter 1 --prev-year 2025 --prev-quarter 4

Example:
    python scripts/run.py --input ./data/orders_2026q1.csv --year 2026 --quarter 1 --format json
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

from .core import generate_quarterly_report

logger = logging.getLogger("ecom-quarterly-strategy")

# ═══════════════════════════════════════════════════════
# CLI Argument Parsing
# ═══════════════════════════════════════════════════════


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="ecom-quarterly-strategy",
        description="电商季度战略分析工具 -- 输入订单 CSV，输出季度 KPI 报告、月度趋势、年度预测与战略建议",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --input orders.csv --year 2026 --quarter 1
  %(prog)s --input orders.csv --year 2026 --quarter 1 --format json --output report.json
  %(prog)s --input orders.csv --year 2026 --quarter 1 --annual-target '{"total_revenue":50000000}'
  %(prog)s --input orders.csv --year 2026 --quarter 1 --prev-year 2025 --prev-quarter 4
  %(prog)s --input orders.csv --year 2026 --quarter 1 --verbose
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
        "-q", "--quarter",
        type=int,
        default=None,
        help="季度 (1-4)。默认当前季度",
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
        "-a", "--annual-target",
        default=None,
        help="年度目标的 JSON 字符串，如 '{\"total_revenue\": 50000000}'",
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
        help="环比对比年份 (默认: 上季度)",
    )
    report_group.add_argument(
        "--prev-quarter",
        type=int,
        default=None,
        help="环比对比季度 (1-4, 默认: 上季度)",
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
    将季度战略报告格式化为可读文本。

    Args:
        report: generate_quarterly_report 返回的字典

    Returns:
        str: 格式化文本
    """
    lines: list[str] = []
    period = report.get("period", "")
    lines.append(f"季度战略报告 | {period}")
    lines.append("=" * 48)
    lines.append("")

    # 警告
    if "warning" in report:
        lines.append(f"[警告] {report['warning']}")
        lines.append("")

    # KPI 概览
    kpis = report.get("kpis", {})
    lines.append("[季度概览]")
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

    # 年度目标完成度
    attainment = kpis.get("attainment", {})
    if attainment:
        lines.append("[年度目标完成度]")
        for metric, data in attainment.items():
            metric_label = {
                "total_revenue": "销售额年度目标",
                "total_orders": "订单量年度目标",
                "avg_order_value": "客单价年度目标",
                "unique_customers": "客户数年度目标",
            }.get(metric, metric)
            status_icon = "✅" if data.get("status") == "exceeded" else ("⚠️" if data.get("status") == "warning" else "❌")
            lines.append(f"  {status_icon} {metric_label}: ¥{data.get('actual', 0):,.2f} / ¥{data.get('target', 0):,.2f} ({data.get('rate', 0):.1f}%)")
        lines.append("")

    # 月度趋势
    monthly = report.get("monthly_breakdown", [])
    if monthly:
        lines.append("[三月趋势]")
        for m in monthly:
            month_num = m.get("month", "")
            rev = m.get("total_revenue", 0)
            ord_cnt = m.get("total_orders", 0)
            share = m.get("share_pct", {}).get("revenue", 0)
            mom = m.get("mom_change_pct")
            mom_str = ""
            if isinstance(mom, dict) and "total_revenue" in mom:
                mom_str = f" (环比 {mom['total_revenue']:+.1f}%)"
            month_label = {1: "1月", 2: "2月", 3: "3月", 4: "4月", 5: "5月", 6: "6月",
                           7: "7月", 8: "8月", 9: "9月", 10: "10月", 11: "11月", 12: "12月"}.get(month_num, f"{month_num}月")
            lines.append(f"  {month_label}: ¥{rev:,.0f} ({share:.1f}%){mom_str}")
        lines.append("")

    # 环比对比
    qoq = report.get("qoq_comparison", {})
    if qoq and "warning" not in qoq:
        changes = qoq.get("changes", {})
        lines.append("[季度环比]")
        lines.append(f"  上期: {qoq.get('previous_period', '')}")
        lines.append(f"  本期: {qoq.get('current_period', '')}")
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
        signals = qoq.get("signals", [])
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

    # 增长驱动
    drivers = report.get("growth_drivers", [])
    if drivers:
        lines.append("[增长驱动]")
        for d in drivers:
            icon = "✅" if d.get("direction") == "up" else ("⚠️" if d.get("direction") == "warning" else "📊")
            lines.append(f"  {icon} {d.get('label', '')} ({d.get('strength', '')})")
            for ev in d.get("evidence", []):
                lines.append(f"    - {ev}")
        lines.append("")

    # 年度预测
    proj = report.get("annual_projection", {})
    if proj and "attainment" in proj:
        lines.append("[年度预测]")
        lines.append(f"  置信度: {proj.get('confidence', 'low')}")
        lines.append(f"  已过月数: {proj.get('elapsed_months', 0)}")
        lines.append(f"  剩余月数: {proj.get('remaining_months', 0)}")
        for metric, data in proj.get("attainment", {}).items():
            metric_label = {
                "total_revenue": "销售额",
                "total_orders": "订单量",
            }.get(metric, metric)
            status_icon = "✅" if data.get("status") == "exceeded" else ("🟢" if data.get("status") == "on_track" else "🔴")
            lines.append(f"  {status_icon} {metric_label}: 预测 ¥{data.get('projected', 0):,.0f} / 目标 ¥{data.get('target', 0):,.0f} ({data.get('rate', 0):.1f}%)")
        lines.append("")

    # 战略建议
    recs = report.get("recommendations", [])
    if recs:
        lines.append("[战略建议]")
        for rec in recs:
            lines.append(f"  P{rec.get('priority', 0)}. [{rec.get('category', '').upper()}] {rec.get('title', '')}")
            lines.append(f"     {rec.get('content', '')}")
            for action in rec.get("actions", []):
                lines.append(f"     - {action}")
        lines.append("")

    # 样本检查
    sample_check = report.get("sample_check", {})
    if sample_check:
        lines.append("[样本检查]")
        lines.append(f"  {sample_check.get('message', '')}")
        lines.append("")

    lines.append("=" * 48)
    lines.append(f"报告生成时间: {report.get('generated_at', '')}")
    return "\n".join(lines)


def format_report_json(report: dict[str, Any]) -> str:
    """将季度战略报告格式化为 JSON 字符串。"""
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
        # 确定年份
        now = datetime.now()
        year = args.year if args.year else now.year

        # 确定季度
        if args.quarter:
            quarter = args.quarter
        else:
            quarter = (now.month - 1) // 3 + 1

        if quarter < 1 or quarter > 4:
            logger.error("季度必须为 1-4，收到 %d", quarter)
            return 1

        logger.info("报告周期: %d 年 Q%d", year, quarter)

        # 解析年度目标
        annual_target: Optional[dict[str, float]] = None
        if args.annual_target:
            try:
                annual_target = json.loads(args.annual_target)
                logger.info("年度目标已加载: %s", annual_target)
            except json.JSONDecodeError as e:
                logger.error("年度目标 JSON 解析失败: %s", e)
                return 1

        # 环比周期
        prev_period = None
        if args.prev_year is not None and args.prev_quarter is not None:
            prev_period = (args.prev_year, args.prev_quarter)
            logger.info("环比周期: %d 年 Q%d", args.prev_year, args.prev_quarter)

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
        if annual_target:
            config["annual_target"] = annual_target
        if prev_period:
            config["prev_period"] = prev_period

        # 生成报告
        report = generate_quarterly_report(df, year, quarter, config)

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
        logger.info("季度战略报告生成完成, 耗时: %.2f 秒", elapsed)

        return 0

    except FileNotFoundError as e:
        logger.error("文件未找到: %s", e)
        return 1
    except ValueError as e:
        logger.error("参数错误: %s", e)
        return 1
    except Exception as e:
        logger.exception("季度战略报告生成失败: %s", e)
        return 1


# ═══════════════════════════════════════════════════════
# Script Entry
# ═══════════════════════════════════════════════════════

if __name__ == "__main__":
    sys.exit(main())
