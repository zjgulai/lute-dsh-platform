#!/usr/bin/env python3
"""
scm-inventory-forecaster CLI

库存预测命令行工具：读取 CSV 历史数据，计算需求预测、安全库存、ROP、EOQ，
生成补货计划并输出 JSON/YAML/CSV 格式报告。
"""

from __future__ import annotations
import argparse
import importlib.util
import json
import sys
import csv
import io
from pathlib import Path
from typing import Any

# ── Load core module from the hyphenated directory ───────
_THIS_DIR = Path(__file__).resolve().parent
_SKILLS_ROOT = _THIS_DIR.parent.parent.parent  # skills/

if str(_SKILLS_ROOT) not in sys.path:
    sys.path.insert(0, str(_SKILLS_ROOT))

_CORE_MODULE_PATH = _THIS_DIR / "core.py"
_spec = importlib.util.spec_from_file_location(
    "scm_inventory_forecaster_core", _CORE_MODULE_PATH
)
_core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_core)

forecast_demand = _core.forecast_demand
calculate_safety_stock = _core.calculate_safety_stock
calculate_rop = _core.calculate_rop
calculate_eoq = _core.calculate_eoq
generate_replenishment_plan = _core.generate_replenishment_plan
_get_z_score = _core._get_z_score

# ── Local data quality check ───────
def _local_quality_report(df, required_fields, numeric_fields, date_field):
    """本地数据质量报告（替代 skills._shared.data_validator）"""
    report = {
        "total_rows": len(df),
        "missing_values": {col: int(df[col].isna().sum()) for col in required_fields},
        "numeric_stats": {},
    }
    for col in numeric_fields:
        if col in df.columns:
            report["numeric_stats"][col] = {
                "min": float(df[col].min()) if not df[col].isna().all() else None,
                "max": float(df[col].max()) if not df[col].isna().all() else None,
                "mean": float(df[col].mean()) if not df[col].isna().all() else None,
            }
    if date_field and date_field in df.columns:
        try:
            dates = pd.to_datetime(df[date_field], errors='coerce')
            report["date_range"] = {
                "start": str(dates.min().date()) if not dates.isna().all() else None,
                "end": str(dates.max().date()) if not dates.isna().all() else None,
            }
        except Exception:
            pass
    return report

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="库存预测与补货计划生成工具 (Inventory Forecaster)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  # 生成补货计划\n"
            "  %(prog)s --input sales_history.csv --product-id SKU-001 "
            "--lead-time 7 --periods 30\n\n"
            "  # 仅计算安全库存\n"
            "  %(prog)s --input sales_history.csv --product-id SKU-001 "
            "--lead-time 7 --safety-only\n\n"
            "  # 导出 JSON 格式\n"
            "  %(prog)s --input data.csv --product-id P001 --lead-time 10 "
            "--output report.json --format json\n"
        ),
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="输入 CSV 文件路径 (需包含 date 和 quantity 列)",
    )
    parser.add_argument(
        "--product-id", "-p",
        required=True,
        help="产品标识符",
    )
    parser.add_argument(
        "--lead-time", "-lt",
        type=float,
        required=True,
        help="补货周期 (天)",
    )
    parser.add_argument(
        "--service-level", "-sl",
        type=float,
        default=0.95,
        help="服务水平 (0~1), 默认 0.95",
    )
    parser.add_argument(
        "--periods", "-n",
        type=int,
        default=30,
        help="预测未来周期数, 默认 30",
    )
    parser.add_argument(
        "--method",
        choices=["moving_average", "weighted_moving_average", "exponential_smoothing"],
        default="moving_average",
        help="预测方法, 默认 moving_average",
    )
    parser.add_argument(
        "--alpha",
        type=float,
        default=0.3,
        help="指数平滑 alpha (仅 exponential_smoothing), 默认 0.3",
    )
    parser.add_argument(
        "--order-cost",
        type=float,
        default=100.0,
        help="每次订货成本, 默认 100",
    )
    parser.add_argument(
        "--holding-cost-pct",
        type=float,
        default=0.2,
        help="持有成本占单价百分比, 默认 0.2",
    )
    parser.add_argument(
        "--unit-price",
        type=float,
        default=100.0,
        help="单价, 默认 100",
    )
    parser.add_argument(
        "--current-stock",
        type=float,
        default=0.0,
        help="当前库存数量, 默认 0",
    )
    parser.add_argument(
        "--output", "-o",
        help="输出文件路径 (默认 stdout)",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["json", "yaml", "csv"],
        default="json",
        help="输出格式, 默认 json",
    )
    parser.add_argument(
        "--safety-only",
        action="store_true",
        help="仅计算安全库存 (不生成完整补货计划)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="输出详细信息",
    )
    return parser.parse_args(argv)


def _output_result(result: dict[str, Any], fmt: str, output_path: str | None) -> None:
    """将结果输出到 stdout 或文件。"""
    if fmt == "json":
        content = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    elif fmt == "yaml":
        try:
            import yaml
            content = yaml.dump(result, default_flow_style=False, allow_unicode=True)
        except ImportError:
            print("警告: yaml 库未安装，回退到 JSON 格式", file=sys.stderr)
            content = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    elif fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["key", "value"])
        _flatten_write_csv(writer, result, "")
        content = output.getvalue()
    else:
        content = str(result)

    if output_path:
        Path(output_path).write_text(content, encoding="utf-8")
        print(f"结果已写入: {output_path}")
    else:
        print(content)


def _flatten_write_csv(writer: csv.writer, data: dict | list, prefix: str) -> None:
    """递归展平字典/列表为 CSV 行。"""
    if isinstance(data, dict):
        for k, v in data.items():
            key_path = f"{prefix}.{k}" if prefix else k
            if isinstance(v, (dict, list)):
                _flatten_write_csv(writer, v, key_path)
            else:
                writer.writerow([key_path, v])
    elif isinstance(data, list):
        for i, item in enumerate(data):
            _flatten_write_csv(writer, item, f"{prefix}[{i}]")


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    # Load data
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"错误: 输入文件不存在: {args.input}", file=sys.stderr)
        return 1

    if not HAS_PANDAS:
        print("错误: 需要 pandas 库。请安装: pip install pandas", file=sys.stderr)
        return 1

    try:
        df = pd.read_csv(input_path)
    except Exception as e:
        print(f"错误: 无法读取 CSV 文件: {e}", file=sys.stderr)
        return 1

    # Validate columns
    if args.verbose:
        quality = _local_quality_report(
            df,
            required_fields=["date", "quantity"],
            numeric_fields=["quantity"],
            date_field="date",
        )
        print(f"数据质量报告: {json.dumps(quality, ensure_ascii=False, indent=2)}")

    required_cols = {"date", "quantity"}
    missing = required_cols - set(df.columns)
    if missing:
        print(
            f"错误: CSV 缺少必需列: {', '.join(missing)}",
            file=sys.stderr,
        )
        return 1

    history = df["quantity"].dropna().tolist()

    config = {
        "forecast_periods": args.periods,
        "forecast_method": args.method,
        "order_cost": args.order_cost,
        "holding_cost_percent": args.holding_cost_pct,
        "unit_price": args.unit_price,
        "current_stock": args.current_stock,
    }

    try:
        if args.safety_only:
            safety_stock = calculate_safety_stock(history, args.lead_time, args.service_level)
            avg_daily = (
                sum(history) / len(history)
                if history
                else 0
            )
            rop = calculate_rop(avg_daily, args.lead_time, safety_stock)
            result: dict[str, Any] = {
                "product_id": args.product_id,
                "safety_stock": safety_stock,
                "reorder_point": round(rop, 2),
                "lead_time": args.lead_time,
                "service_level": args.service_level,
                "avg_daily_demand": round(avg_daily, 2),
                "z_score": round(_get_z_score(args.service_level), 4),
            }
        else:
            result = generate_replenishment_plan(
                df=df,
                product_id=args.product_id,
                lead_time=args.lead_time,
                service_level=args.service_level,
                config=config,
            )
    except ValueError as e:
        print(f"错误: {e}", file=sys.stderr)
        return 1

    _output_result(result, args.format, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
