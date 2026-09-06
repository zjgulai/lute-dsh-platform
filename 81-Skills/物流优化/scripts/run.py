#!/usr/bin/env python3
"""
scm-logistics-optimizer CLI

物流优化命令行工具：承运商对比、TCO 分析、运输模式优化，
支持 JSON 输入输出与多种格式导出。
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
    "scm_logistics_optimizer_core", _CORE_MODULE_PATH
)
_core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_core)

compare_shipping_options = _core.compare_shipping_options
calculate_tco = _core.calculate_tco
optimize_mode_split = _core.optimize_mode_split
score_carrier_performance = _core.score_carrier_performance
generate_logistics_plan = _core.generate_logistics_plan


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="物流优化与承运商评估工具 (Logistics Optimizer)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  # 完全物流方案\n"
            "  %(prog)s --origin 深圳 --dest 洛杉矶 "
            '--cargo \'{"weight_kg":500,"volume_cbm":2.5,"value_usd":8500}\' '
            '--carriers \'[{"name":"DHL","transit_days":5,"cost_per_kg":8},'
            '{"name":"海运","transit_days":25,"cost_per_kg":1.5}]\'\n\n'
            "  # TCO 计算\n"
            "  %(prog)s --tco-only --annual-volume 10000 --monthly-shipments 200\n"
        ),
    )
    parser.add_argument(
        "--origin", "-o",
        default="",
        help="始发地",
    )
    parser.add_argument(
        "--dest", "-d",
        default="",
        help="目的地",
    )
    parser.add_argument(
        "--cargo", "-c",
        type=str,
        default='{"weight_kg": 100, "volume_cbm": 0.5, "value_usd": 1000}',
        help='货物 JSON: {"weight_kg":..., "volume_cbm":..., "value_usd":...}',
    )
    parser.add_argument(
        "--carriers", "-cr",
        type=str,
        help='承运商 JSON 数组: [{"name":"...","transit_days":...,"cost_per_kg":...}]',
    )
    parser.add_argument(
        "--routes", "-rt",
        type=str,
        help='运输路线 JSON (用于模式优化): [{"mode":"sea","cost_per_unit":...,"transit_days":...,"max_capacity":...}]',
    )
    parser.add_argument(
        "--annual-volume",
        type=float,
        default=1000.0,
        help="年货量 (单数)",
    )
    parser.add_argument(
        "--monthly-shipments",
        type=float,
        default=20.0,
        help="月发货频次",
    )
    parser.add_argument(
        "--warehousing-cost",
        type=float,
        default=1000.0,
        help="月仓储成本",
    )
    parser.add_argument(
        "--customs-rate",
        type=float,
        default=0.0,
        help="关税率 (如 0.1 = 10%)",
    )
    parser.add_argument(
        "--max-budget",
        type=float,
        help="最大预算约束",
    )
    parser.add_argument(
        "--max-transit-days",
        type=float,
        help="最大运输天数约束",
    )
    parser.add_argument(
        "--tco-only",
        action="store_true",
        help="仅计算 TCO",
    )
    parser.add_argument(
        "--carrier-score",
        type=str,
        help='历史数据 JSON 文件路径，用于承运商绩效评分',
    )
    parser.add_argument(
        "--output", "-out",
        help="输出文件路径 (默认 stdout)",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["json", "yaml", "csv"],
        default="json",
        help="输出格式, 默认 json",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="输出详细信息",
    )
    return parser.parse_args(argv)


def _output_result(result: Any, fmt: str, output_path: str | None) -> None:
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


def _parse_json_arg(raw: str | None, name: str) -> Any:
    """解析 JSON 字符串参数。"""
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"错误: {name} 参数 JSON 格式无效: {e}", file=sys.stderr)
        sys.exit(1)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    cargo = _parse_json_arg(args.cargo, "--cargo")
    carriers = _parse_json_arg(args.carriers, "--carriers") or []
    routes = _parse_json_arg(args.routes, "--routes")

    constraints = {}
    if args.max_budget is not None:
        constraints["max_budget"] = args.max_budget
    if args.max_transit_days is not None:
        constraints["max_transit_days"] = args.max_transit_days

    try:
        # Carrier performance scoring mode
        if args.carrier_score:
            score_path = Path(args.carrier_score)
            if not score_path.exists():
                print(f"错误: 文件不存在: {args.carrier_score}", file=sys.stderr)
                return 1
            with open(score_path, encoding="utf-8") as f:
                hist_data = json.load(f)
            result = score_carrier_performance(hist_data)
            _output_result(result, args.format, args.output)
            return 0

        # TCO-only mode
        if args.tco_only:
            route_input = {
                "transport_cost_per_unit": 0,
                "warehousing_cost_per_month": args.warehousing_cost,
                "customs_duty_rate": args.customs_rate,
                "avg_unit_value": cargo.get("value_usd", 100),
            }
            result = calculate_tco(route_input, args.annual_volume, args.monthly_shipments)
            _output_result(result, args.format, args.output)
            return 0

        # Mode split optimization
        if routes and not carriers:
            total_volume = cargo.get("volume_cbm", 1)
            result = optimize_mode_split(total_volume, routes, constraints)
            _output_result(result, args.format, args.output)
            return 0

        # Full logistics plan
        config = {
            "carriers": carriers,
            "annual_volume": args.annual_volume,
            "monthly_shipments": args.monthly_shipments,
            "warehousing_cost": args.warehousing_cost,
            "customs_rate": args.customs_rate,
            "constraints": constraints,
            "routes": routes or [],
        }
        result = generate_logistics_plan(args.origin, args.dest, cargo, config)
        _output_result(result, args.format, args.output)

    except (ValueError, KeyError) as e:
        print(f"错误: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
