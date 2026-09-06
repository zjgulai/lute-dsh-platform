#!/usr/bin/env python3
"""
数据验证脚本
检查CSV数据完整性和格式
"""

import argparse
import csv
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional, Union


CsvPath = Union[str, Path]


def row_text(row: dict[str, object], field: str) -> str:
    value = row.get(field, "")
    return "" if value is None else str(value).strip()


def parse_decimal(row: dict[str, object], field: str, row_number: int, errors: list[str]) -> Optional[Decimal]:
    value = row_text(row, field)
    if not value:
        errors.append(f"Row {row_number}: Missing required field '{field}'")
        return None

    try:
        number = Decimal(value.replace(",", ""))
    except InvalidOperation:
        errors.append(f"Row {row_number}: Invalid {field} value")
        return None

    if not number.is_finite():
        errors.append(f"Row {row_number}: Invalid {field} value")
        return None

    return number


def validate_non_negative_int(row: dict[str, object], field: str, row_number: int, errors: list[str]) -> None:
    number = parse_decimal(row, field, row_number, errors)
    if number is None:
        return

    if not number.is_finite() or number != number.to_integral_value() or number < 0:
        errors.append(f"Row {row_number}: Invalid {field} value")


def validate_csv(input_file: CsvPath) -> tuple[list[str], list[str]]:
    """验证CSV文件"""
    errors = []
    warnings = []

    required_fields = ['asin', 'title', 'category', 'price', 'rating', 'review_count', 'bsr']

    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            errors.append("CSV header row is missing")
            return errors, warnings

        # 检查必需字段
        missing_fields = set(required_fields) - set(reader.fieldnames)
        if missing_fields:
            errors.append(f"Missing required fields: {', '.join(missing_fields)}")

        # 检查数据
        for i, row in enumerate(reader, 1):
            # ASIN格式检查
            asin = row_text(row, 'asin')
            if not asin:
                errors.append(f"Row {i}: Missing required field 'asin'")
            elif not asin.startswith('B'):
                errors.append(f"Row {i}: Invalid ASIN format '{asin}'")

            # 价格检查
            price = parse_decimal(row, 'price', i, errors)
            if price is not None:
                if price <= 0:
                    warnings.append(f"Row {i}: Price is zero or negative")

            # 评分检查
            rating = parse_decimal(row, 'rating', i, errors)
            if rating is not None:
                if not rating.is_finite() or not (Decimal('1.0') <= rating <= Decimal('5.0')):
                    warnings.append(f"Row {i}: Rating {rating} out of range")

            validate_non_negative_int(row, 'review_count', i, errors)
            validate_non_negative_int(row, 'bsr', i, errors)

    return errors, warnings


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='Validate Amazon data CSV')
    parser.add_argument('--input', required=True, help='Input CSV file')
    parser.add_argument('--strict', action='store_true',
                        help='Treat warnings as errors')

    args = parser.parse_args(argv)

    try:
        errors, warnings = validate_csv(args.input)
    except (OSError, csv.Error) as exc:
        print(f"Error: {exc}")
        return 1

    print(f"\nValidation Results for: {args.input}")
    print("=" * 50)

    if errors:
        print(f"\n❌ Errors ({len(errors)}):")
        for error in errors:
            print(f"  - {error}")

    if warnings:
        print(f"\n⚠️  Warnings ({len(warnings)}):")
        for warning in warnings:
            print(f"  - {warning}")

    if not errors and not warnings:
        print("\n✅ All validations passed!")
        return 0

    if errors or (args.strict and warnings):
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
