#!/usr/bin/env python3
"""
社媒数据格式转换器
支持: Brandwatch, Sprout Social, Hootsuite, Mention, Brand24
"""

import argparse
import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path
import sys
from typing import Any, Optional, Union


CsvPath = Union[str, Path]
CsvRow = dict[str, Any]
StandardRow = dict[str, Any]


class ConversionError(RuntimeError):
    pass


def row_text(row: CsvRow, field: str) -> str:
    value = row.get(field, "")
    return "" if value is None else str(value)


def parse_engagement(value: object, field: str) -> int:
    if value is None:
        return 0

    text = str(value).strip().replace(",", "")
    if not text:
        return 0

    try:
        number = Decimal(text)
    except InvalidOperation as exc:
        raise ConversionError(f"Invalid engagement value for {field}: {value!r}") from exc

    if not number.is_finite() or number != number.to_integral_value() or number < 0:
        raise ConversionError(f"Invalid engagement value for {field}: {value!r}")

    return int(number)


def convert_brandwatch(input_file: CsvPath) -> list[StandardRow]:
    """转换Brandwatch格式"""
    results = []
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            content = row_text(row, "Title") or row_text(row, "Content")
            results.append({
                "platform": row_text(row, "Platform").lower(),
                "date": row_text(row, "Date")[:10],
                "mention": row_text(row, "Author"),
                "author": row_text(row, "Author"),
                "sentiment": row_text(row, "Sentiment").lower(),
                "engagement": parse_engagement(row.get("Engagement"), "Engagement"),
                "content": content[:200]
            })
    return results


def convert_sprout(input_file: CsvPath) -> list[StandardRow]:
    """转换Sprout Social格式"""
    results = []
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            results.append({
                "platform": row_text(row, "Network").lower(),
                "date": row_text(row, "Date"),
                "mention": row_text(row, "Message ID"),
                "author": row_text(row, "Author"),
                "sentiment": "",  # Sprout需要单独导出情感分析
                "engagement": parse_engagement(row.get("Total Engagements"), "Total Engagements"),
                "content": row_text(row, "Text")[:200]
            })
    return results


def convert_hootsuite(input_file: CsvPath) -> list[StandardRow]:
    """转换Hootsuite格式"""
    results = []
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            results.append({
                "platform": row_text(row, "Network").lower(),
                "date": row_text(row, "Date"),
                "mention": row_text(row, "Post ID"),
                "author": row_text(row, "Username"),
                "sentiment": "",
                "engagement": parse_engagement(row.get("Engagements"), "Engagements"),
                "content": row_text(row, "Message")[:200]
            })
    return results


def convert_mention(input_file: CsvPath) -> list[StandardRow]:
    """转换Mention格式"""
    results = []
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sentiment = row_text(row, "Sentiment").lower()
            if sentiment not in ["positive", "negative", "neutral"]:
                sentiment = ""

            results.append({
                "platform": row_text(row, "Source").lower(),
                "date": row_text(row, "Published At"),
                "mention": row_text(row, "Title URL"),
                "author": row_text(row, "Author Name"),
                "sentiment": sentiment,
                "engagement": 0,  # Mention不直接提供
                "content": row_text(row, "Title")[:200]
            })
    return results


def convert_brand24(input_file: CsvPath) -> list[StandardRow]:
    """转换Brand24格式"""
    results = []
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            results.append({
                "platform": row_text(row, "Source").lower(),
                "date": row_text(row, "Published"),
                "mention": row_text(row, "Link"),
                "author": row_text(row, "Author"),
                "sentiment": row_text(row, "Sentiment").lower(),
                "engagement": parse_engagement(row.get("Interactions"), "Interactions"),
                "content": row_text(row, "Snippet")[:200]
            })
    return results


def save_to_csv(data: list[StandardRow], output_file: CsvPath) -> None:
    """保存为标准格式"""
    if not data:
        print("Warning: No data to save")
        return

    fieldnames = ["platform", "date", "mention", "author", "sentiment", "engagement", "content"]

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

    print(f"Converted {len(data)} records to {output_file}")


def convert_file(source_format: str, input_file: CsvPath, output_file: CsvPath) -> int:
    converters = {
        'brandwatch': convert_brandwatch,
        'sprout': convert_sprout,
        'hootsuite': convert_hootsuite,
        'mention': convert_mention,
        'brand24': convert_brand24
    }

    data = converters[source_format](input_file)
    save_to_csv(data, output_file)
    return len(data)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='Convert social media data formats')
    parser.add_argument('--input', required=True, help='Input CSV file')
    parser.add_argument('--format', required=True,
                        choices=['brandwatch', 'sprout', 'hootsuite', 'mention', 'brand24'],
                        help='Source format')
    parser.add_argument('--output', required=True, help='Output CSV file')

    args = parser.parse_args(argv)

    print(f"Converting from {args.format} format...")

    try:
        convert_file(args.format, args.input, args.output)
        print("Conversion complete!")
    except (ConversionError, OSError, csv.Error) as e:
        print(f"Error: {e}")
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
