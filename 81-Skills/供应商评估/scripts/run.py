#!/usr/bin/env python3
"""
scm-supplier-evaluator CLI

供应商评估命令行工具：单供应商评分、多供应商排名、验厂清单生成、1688店铺评估。
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

# ── Load core module from the same directory (self-contained) ───────
_THIS_DIR = Path(__file__).resolve().parent
_CORE_MODULE_PATH = _THIS_DIR / "core.py"
_spec = importlib.util.spec_from_file_location(
    "scm_supplier_evaluator_core", _CORE_MODULE_PATH
)
_core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_core)

score_supplier = _core.score_supplier
rank_suppliers = _core.rank_suppliers
generate_audit_checklist = _core.generate_audit_checklist
assess_1688_shop = _core.assess_1688_shop
generate_evaluation_report = _core.generate_evaluation_report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="供应商评估与排名工具 (Supplier Evaluator)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  # 单供应商评分\n"
            "  %(prog)s --supplier '{\"name\":\"ACME Ltd\",\"quality_capability\":85,"
            '"production_capacity":70,"price_competitiveness":60}\'\n\n'
            "  # 多供应商排名\n"
            "  %(prog)s --suppliers \'[{\"name\":\"S1\",\"quality_capability\":80,...},"
            '{"name":"S2","quality_capability":65,...}]\'\n\n'
            "  # 生成验厂清单\n"
            "  %(prog)s --audit-checklist --supplier-type factory --risk-level medium\n\n"
            "  # 1688 店铺评估\n"
            "  %(prog)s --assess-1688 "
            '\'{"years_operating":5,"transaction_level":"3A",'
            '"return_rate":0.02,"dispute_rate":0.005}\'\n'
        ),
    )
    parser.add_argument(
        "--supplier", "-s",
        type=str,
        help="单供应商 JSON 画像",
    )
    parser.add_argument(
        "--suppliers", "-sl",
        type=str,
        help="多供应商 JSON 数组",
    )
    parser.add_argument(
        "--weights", "-w",
        type=str,
        help='自定义权重 JSON: {"quality_capability":0.3,"price_competitiveness":0.2,...}',
    )
    parser.add_argument(
        "--supplier-type", "-st",
        choices=["factory", "trader", "agent"],
        default="factory",
        help="供应商类型 (默认 factory)",
    )
    parser.add_argument(
        "--risk-level", "-rl",
        choices=["low", "medium", "high"],
        default="medium",
        help="风险等级 (默认 medium)",
    )
    parser.add_argument(
        "--audit-checklist",
        action="store_true",
        help="仅生成验厂清单 (不评分)",
    )
    parser.add_argument(
        "--assess-1688",
        type=str,
        help='1688 店铺数据 JSON: {"years_operating":...,"transaction_level":"...",...}',
    )
    parser.add_argument(
        "--full-report",
        action="store_true",
        help="生成完整评估报告 (含验厂清单和风险标记)",
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

    try:
        # 1. Audit checklist only mode
        if args.audit_checklist:
            checklist = generate_audit_checklist(args.supplier_type, args.risk_level)
            result = {
                "supplier_type": args.supplier_type,
                "risk_level": args.risk_level,
                "checklist": checklist,
                "total_items": len(checklist),
            }
            _output_result(result, args.format, args.output)
            return 0

        # 2. 1688 shop assessment
        if args.assess_1688:
            shop_data = _parse_json_arg(args.assess_1688, "--assess-1688")
            result = assess_1688_shop(shop_data)
            _output_result(result, args.format, args.output)
            return 0

        # Parse weights (optional)
        weights = _parse_json_arg(args.weights, "--weights")

        # 3. Full report mode
        if args.full_report:
            supplier = _parse_json_arg(args.supplier, "--supplier")
            if not supplier:
                print("错误: --full-report 需要 --supplier 参数", file=sys.stderr)
                return 1
            config = {
                "weights": weights,
                "supplier_type": args.supplier_type,
                "risk_level": args.risk_level,
                "include_audit_checklist": True,
            }
            result = generate_evaluation_report(supplier, config)
            _output_result(result, args.format, args.output)
            return 0

        # 4. Multi-supplier ranking
        suppliers_raw = _parse_json_arg(args.suppliers, "--suppliers")
        if suppliers_raw:
            result = rank_suppliers(suppliers_raw, weights)
            _output_result(result, args.format, args.output)
            return 0

        # 5. Single supplier scoring
        single_raw = _parse_json_arg(args.supplier, "--supplier")
        if single_raw:
            result = score_supplier(single_raw, weights)
            _output_result(result, args.format, args.output)
            return 0

        # If nothing matched, show help
        parser.print_help()
        return 1

    except (ValueError, KeyError) as e:
        print(f"错误: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
