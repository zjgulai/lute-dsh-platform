#!/usr/bin/env python3
"""
电商CSV预处理 CLI (E-Commerce CSV Processor Command Line)

预处理原始电商订单CSV: 字段映射、数据清洗、格式标准化、异常检测。

Usage:
    # 自动检测平台并处理
    python scripts/run.py --input raw_orders.csv --output clean_orders.csv

    # 强制指定平台
    python scripts/run.py --input taobao_orders.csv --output clean.csv --platform taobao

    # 使用自定义字段映射
    python scripts/run.py --input orders.csv --output clean.csv --config mapping.yaml

    # 仅生成质量报告 (不输出文件)
    python scripts/run.py --input orders.csv --report-only

    # 多文件批量处理
    python scripts/run.py --input taobao.csv jd.csv pdd.csv --output merged.csv

Example:
    python scripts/run.py --input ./data/orders_202603.csv --output ./data/clean.csv \\
        --platform taobao --encoding gbk
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional

import pandas as pd

try:
    from skills._shared.ecom_kpi import DEFAULT_FIELD_MAP, TAOBAO_FIELD_MAP
except ImportError:
    DEFAULT_FIELD_MAP = {}
    TAOBAO_FIELD_MAP = {}

from .core import (
    PLATFORM_FIELD_MAPS,
    detect_encoding,
    detect_platform_format,
    generate_quality_report,
    load_csv,
    map_fields,
    process_csv,
    standardize_data_types,
)

logger = logging.getLogger("ecom-csv-processor")

# ═══════════════════════════════════════════════════════
# CLI Argument Parsing
# ═══════════════════════════════════════════════════════


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="ecom-csv-processor",
        description="电商订单CSV预处理工具 -- 字段映射、清洗、标准化、异常检测",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --input orders.csv --output clean.csv
  %(prog)s --input taobao.csv --output clean.csv --platform taobao --encoding gbk
  %(prog)s --input orders.csv --report-only
  %(prog)s --input a.csv b.csv c.csv --output merged.csv
        """,
    )

    # 输入输出
    io_group = parser.add_argument_group("Input / Output")
    io_group.add_argument(
        "-i", "--input",
        nargs="+",
        required=True,
        help="输入CSV文件路径 (支持多个文件进行合并)",
    )
    io_group.add_argument(
        "-o", "--output",
        default=None,
        help="输出CSV文件路径 (不提供则仅生成报告)",
    )
    io_group.add_argument(
        "--encoding",
        default=None,
        help="强制指定文件编码 (默认: 自动检测)",
    )

    # 处理选项
    process_group = parser.add_argument_group("Processing Options")
    process_group.add_argument(
        "-p", "--platform",
        default=None,
        choices=list(PLATFORM_FIELD_MAPS.keys()) + [None],
        help="强制指定平台字段映射 (默认: 自动检测)",
    )
    process_group.add_argument(
        "--field-map",
        default=None,
        nargs="+",
        metavar="ORIG:STD",
        help="自定义字段映射, 格式: 原始列名:标准列名, 如 '订单编号:order_id 金额:amount'",
    )
    process_group.add_argument(
        "--dedup-key",
        default="order_id",
        help="去重主键列名 (默认: order_id)",
    )
    process_group.add_argument(
        "--keep-duplicates",
        action="store_true",
        default=False,
        help="输出时保留重复行 (默认: 移除)",
    )

    # 输出控制
    output_group = parser.add_argument_group("Output Control")
    output_group.add_argument(
        "--report-only",
        action="store_true",
        default=False,
        help="只生成质量报告, 不输出CSV",
    )
    output_group.add_argument(
        "--report-format",
        default="text",
        choices=["text", "json"],
        help="质量报告输出格式 (默认: text)",
    )
    output_group.add_argument(
        "--verbose", "-v",
        action="store_true",
        default=False,
        help="输出详细日志信息",
    )

    return parser


# ═══════════════════════════════════════════════════════
# Report Formatting
# ═══════════════════════════════════════════════════════


def format_report_text(report: dict) -> str:
    """
    将质量报告格式化为可读文本。

    Args:
        report: generate_quality_report 返回的字典

    Returns:
        str: 格式化文本
    """
    lines: list[str] = []
    lines.append("=" * 48)
    lines.append("  电商订单数据质量报告")
    lines.append("=" * 48)
    lines.append("")

    # 基本信息
    lines.append("[基本信息]")
    lines.append(f"  总记录数:  {report.get('total_rows', 0):,}")
    lines.append(f"  总字段数:  {report.get('total_columns', 0)}")
    lines.append(f"  检测平台:  {report.get('detected_platform', 'unknown')}")
    lines.append(f"  有效记录:  {report.get('valid_rows', 0):,} ({report.get('valid_pct', 0)}%)")
    lines.append("")

    # 重复 & 异常
    lines.append("[数据质量]")
    dup = report.get("duplicate_rows", 0)
    anm = report.get("anomaly_rows", 0)
    lines.append(f"  重复记录:  {dup:,}" + (" (已标记)" if dup > 0 else ""))
    lines.append(f"  异常记录:  {anm:,}" + (" (建议复核)" if anm > 0 else ""))

    # 异常明细
    anomaly_detail = report.get("anomaly_detail", {})
    if anomaly_detail:
        lines.append("")
        lines.append("  异常分类:")
        for reason, count in sorted(anomaly_detail.items(), key=lambda x: -x[1]):
            lines.append(f"    - {reason}: {count}")

    lines.append("")

    # 缺失统计
    missing = report.get("missing_values", {})
    if missing:
        lines.append("[缺失统计]")
        for field, count in sorted(missing.items(), key=lambda x: -x[1]):
            total = report.get("total_rows", 1)
            pct = count / max(total, 1) * 100
            lines.append(f"  - {field}: {count:,} ({pct:.1f}%)")
        lines.append("")

    # 金额异常
    neg = report.get("negative_amounts", 0)
    zero = report.get("zero_amounts", 0)
    if neg or zero:
        lines.append("[金额异常]")
        if neg:
            lines.append(f"  - 负金额:      {neg}")
        if zero:
            lines.append(f"  - 零金额:      {zero}")
        lines.append("")

    # 建议
    suggestions = report.get("suggestions", [])
    if suggestions:
        lines.append("[改进建议]")
        for i, suggestion in enumerate(suggestions, 1):
            lines.append(f"  {i}. {suggestion}")
        lines.append("")

    lines.append("=" * 48)
    return "\n".join(lines)


def format_report_json(report: dict) -> str:
    """将质量报告格式化为 JSON 字符串。"""
    serializable = _make_serializable(report)
    return json.dumps(serializable, ensure_ascii=False, indent=2)


def _make_serializable(obj):
    """递归地将对象转换为 JSON 可序列化格式。"""
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_make_serializable(v) for v in obj]
    elif isinstance(obj, (int, float)):
        if pd.isna(obj):
            return None
        return obj
    elif isinstance(obj, str):
        return obj
    elif obj is None:
        return None
    else:
        return str(obj)


# ═══════════════════════════════════════════════════════
# Configuration Loading
# ═══════════════════════════════════════════════════════


def parse_field_maps(mappings: list[str]) -> dict[str, str]:
    """
    解析 --field-map 参数为映射字典。

    Args:
        mappings: ["原始列:标准列", ...]

    Returns:
        dict: {原始列名: 标准列名}
    """
    field_map: dict[str, str] = {}
    for item in mappings:
        if ":" not in item:
            logger.warning("跳过无效映射: %s (格式应为 '原始:标准')", item)
            continue
        parts = item.split(":", 1)
        field_map[parts[0].strip()] = parts[1].strip()
    return field_map


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
        # 解析自定义映射
        custom_field_map = None
        if args.field_map:
            custom_field_map = parse_field_maps(args.field_map)
            logger.info("自定义字段映射: %s", custom_field_map)

        # 检查输出目录
        if args.output and not args.report_only:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)

        # 加载并处理每个输入文件
        input_paths = [Path(p) for p in args.input]
        all_dfs: list[pd.DataFrame] = []

        for path in input_paths:
            if not path.exists():
                logger.error("文件不存在: %s", path)
                return 1

            logger.info("处理文件: %s (大小: %.1f KB)", path, path.stat().st_size / 1024)

            result = process_csv(
                input_path=path,
                output_path=None,  # 等全部处理完再输出
                platform=args.platform,
                field_map=custom_field_map,
                encoding=args.encoding,
                dedup_key=args.dedup_key,
                remove_duplicates=not args.keep_duplicates,
            )

            all_dfs.append(result["data"])

            # 输出单个文件的质量报告
            report = result["report"]
            if args.report_format == "json":
                print("--- 质量报告 ---")
                print(format_report_json(report))
            else:
                print(format_report_text(report))

        # 合并多文件 (如果需要)
        output_df: Optional[pd.DataFrame] = None
        if len(all_dfs) == 1:
            output_df = all_dfs[0]
        elif len(all_dfs) > 1:
            logger.info("合并 %d 个文件...", len(all_dfs))
            combined = pd.concat(all_dfs, ignore_index=True)
            # 重新检测重复 (跨文件)
            from .core import detect_duplicates
            combined = detect_duplicates(combined, key=args.dedup_key)
            output_df = combined

            # 合并后的质量报告
            if output_df is not None:
                merged_report = generate_quality_report(output_df)
                print("\n--- 合并后质量报告 ---")
                if args.report_format == "json":
                    print(format_report_json(merged_report))
                else:
                    print(format_report_text(merged_report))

        # 输出文件
        if output_df is not None and args.output and not args.report_only:
            out_path = Path(args.output)
            out_enc = args.encoding or "utf-8-sig"

            # 移除标记列
            output_cols = [c for c in output_df.columns if not c.startswith("_")]
            save_df = output_df[output_cols].copy()

            save_df.to_csv(out_path, index=False, encoding=out_enc)
            logger.info("输出文件: %s (%d 行)", out_path, len(save_df))

            print(f"\n输出文件: {out_path}")
            print(f"行数: {len(save_df):,}")

        elapsed = time.time() - start_time
        logger.info("处理完成, 耗时: %.2f 秒", elapsed)

        return 0

    except FileNotFoundError as e:
        logger.error("文件未找到: %s", e)
        return 1
    except Exception as e:
        logger.exception("处理失败: %s", e)
        return 1


# ═══════════════════════════════════════════════════════
# Script Entry
# ═══════════════════════════════════════════════════════

if __name__ == "__main__":
    sys.exit(main())
