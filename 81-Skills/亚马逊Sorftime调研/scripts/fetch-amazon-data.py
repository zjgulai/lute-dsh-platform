#!/usr/bin/env python3
"""
Amazon数据获取脚本
支持多数据源: CSV, SP-API, Keepa, Web
"""

import argparse
import csv
import json
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Optional, Union


CsvPath = Union[str, Path]
Row = dict[str, Any]


class DataFetchError(RuntimeError):
    pass


def load_requests() -> Any:
    try:
        import requests
    except ImportError as exc:
        raise DataFetchError("requests required. Install: pip install requests") from exc
    return requests


def load_boto3() -> Any:
    try:
        import boto3
    except ImportError as exc:
        raise DataFetchError("boto3 required. Install: pip install boto3") from exc
    return boto3


def load_yaml() -> Any:
    try:
        import yaml
    except ImportError as exc:
        raise DataFetchError("PyYAML required for YAML config. Install: pip install pyyaml") from exc
    return yaml


def load_config(config_file: Optional[CsvPath]) -> dict[str, Any]:
    if not config_file:
        raise DataFetchError("--config required for this source")

    config_path = Path(config_file)
    try:
        with config_path.open(encoding='utf-8') as f:
            if config_path.suffix.lower() == '.json':
                data = json.load(f)
            else:
                yaml_module = load_yaml()
                try:
                    data = yaml_module.safe_load(f)
                except yaml_module.YAMLError as exc:
                    raise DataFetchError(f"Invalid YAML config: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise DataFetchError(f"Invalid JSON config: {exc}") from exc
    except OSError as exc:
        raise DataFetchError(f"Unable to read config file: {exc}") from exc

    if not isinstance(data, dict):
        raise DataFetchError("Config file must contain a key-value object")

    return data


def row_text(row: Row, field: str) -> str:
    value = row.get(field, "")
    return "" if value is None else str(value).strip()


def parse_number(row: Row, field: str, row_number: int, errors: list[str]) -> Optional[Decimal]:
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


def validate_non_negative_int(row: Row, field: str, row_number: int, errors: list[str]) -> None:
    number = parse_number(row, field, row_number, errors)
    if number is None:
        return

    if not number.is_finite() or number != number.to_integral_value() or number < 0:
        errors.append(f"Row {row_number}: Invalid {field} value")


def fetch_from_csv(input_file: CsvPath) -> list[Row]:
    """从现有CSV读取数据"""
    with open(input_file, 'r', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def fetch_from_sp_api(category: Optional[str], config_file: Optional[CsvPath], boto3_module: Any = None) -> list[Row]:
    """从Amazon SP-API获取数据"""
    if not category:
        raise DataFetchError("--category required for sp-api source")

    if boto3_module is None:
        load_boto3()
    load_config(config_file)

    raise DataFetchError("sp-api source is not implemented; use csv or keepa")


def fetch_from_keepa(asins: list[str], config_file: Optional[CsvPath], requests_module: Any = None) -> list[Row]:
    """从Keepa API获取数据"""
    if not asins:
        raise DataFetchError("--asins required for keepa source")

    if requests_module is None:
        load_requests()
    config = load_config(config_file)

    api_key = config.get('api_key')
    if not api_key:
        raise DataFetchError("Keepa API key not found in config")

    raise DataFetchError("keepa source is not implemented; use csv")


def validate_data(data: list[Row]) -> list[str]:
    """验证数据完整性"""
    required_text_fields = ['asin', 'title', 'category']

    errors = []
    for i, row in enumerate(data, 1):
        for field in required_text_fields:
            if not row_text(row, field):
                errors.append(f"Row {i}: Missing required field '{field}'")

        price = parse_number(row, 'price', i, errors)
        if price is not None and price <= 0:
            errors.append(f"Row {i}: Price must be greater than zero")

        rating = parse_number(row, 'rating', i, errors)
        if rating is not None and (
            not rating.is_finite() or not (Decimal('1.0') <= rating <= Decimal('5.0'))
        ):
            errors.append(f"Row {i}: Rating {rating} out of range")

        validate_non_negative_int(row, 'review_count', i, errors)
        validate_non_negative_int(row, 'bsr', i, errors)

    return errors


def save_to_csv(data: list[Row], output_file: CsvPath) -> None:
    """保存数据到CSV"""
    if not data:
        print("Warning: No data to save")
        return

    fieldnames = list(data[0].keys())
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

    print(f"Saved {len(data)} records to {output_file}")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='Fetch Amazon product data')
    parser.add_argument('--source', choices=['csv', 'sp-api', 'keepa', 'web'],
                        default='csv', help='Data source')
    parser.add_argument('--input', help='Input file (for csv source)')
    parser.add_argument('--category', help='Category to fetch')
    parser.add_argument('--asins', help='Comma-separated ASINs (for keepa)')
    parser.add_argument('--config', help='Config file path')
    parser.add_argument('--output', required=True, help='Output CSV file')
    parser.add_argument('--validate', action='store_true',
                        help='Validate data after fetching')

    args = parser.parse_args(argv)

    try:
        # 获取数据
        if args.source == 'csv':
            if not args.input:
                raise DataFetchError("--input required for csv source")
            data = fetch_from_csv(args.input)

        elif args.source == 'sp-api':
            data = fetch_from_sp_api(args.category, args.config)

        elif args.source == 'keepa':
            asins = [asin.strip() for asin in (args.asins or "").split(",") if asin.strip()]
            data = fetch_from_keepa(asins, args.config)

        elif args.source == 'web':
            raise DataFetchError("web source is not implemented; use csv, sp-api, or keepa")

        # 验证数据
        if args.validate:
            errors = validate_data(data)
            if errors:
                print("\nValidation errors:")
                for error in errors[:10]:  # 只显示前10个错误
                    print(f"  - {error}")
                if len(errors) > 10:
                    print(f"  ... and {len(errors) - 10} more")
                return 1

        # 保存数据
        save_to_csv(data, args.output)
    except (DataFetchError, OSError, csv.Error) as exc:
        print(f"Error: {exc}")
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
