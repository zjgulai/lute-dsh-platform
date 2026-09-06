#!/usr/bin/env python3
"""
Unified CLI entry point for Social Sentiment Tracker.

Orchestrates the full data pipeline:
  convert format -> collect (mock mode) -> analyze -> output
"""

import argparse
import csv
import importlib.util
import sys
import types
from pathlib import Path
from typing import Optional


SCRIPT_DIR = Path(__file__).resolve().parent


def _load_sibling_module(filename: str, module_name: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(module_name, SCRIPT_DIR / filename)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load sibling module: {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


_FORMAT_CONVERTER = _load_sibling_module(
    "format-converter.py", "da_social_format_converter"
)
_SOCIAL_COLLECTOR = _load_sibling_module(
    "social-data-collector.py", "da_social_data_collector"
)
convert_file = _FORMAT_CONVERTER.convert_file
fetch_twitter = _SOCIAL_COLLECTOR.fetch_twitter
fetch_reddit = _SOCIAL_COLLECTOR.fetch_reddit
save_to_csv = _SOCIAL_COLLECTOR.save_to_csv
CollectorError = _SOCIAL_COLLECTOR.CollectorError


STD_FIELDS = ['platform', 'date', 'mention', 'author', 'sentiment', 'engagement', 'content']


def analyze_sentiment(data: list[dict], verbose: bool) -> list[dict]:
    """Basic sentiment analysis based on keyword matching."""
    positive_kw = ['good', 'great', 'excellent', 'amazing', 'love', 'best',
                   'happy', 'recommend', 'awesome', 'fantastic', 'positive']
    negative_kw = ['bad', 'terrible', 'awful', 'hate', 'worst', 'poor',
                   'disappointed', 'horrible', 'negative', 'ugly', 'broken']

    for row in data:
        engagement = row.get('engagement', 0)
        try:
            row['engagement'] = int(engagement or 0)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid engagement value: {engagement!r}") from exc
        for field in ('platform', 'date', 'mention', 'author', 'content'):
            row[field] = str(row.get(field, ''))
        content = row.get('content', '').lower()
        if row.get('sentiment'):
            continue  # preserve existing sentiment

        pos_count = sum(1 for kw in positive_kw if kw in content)
        neg_count = sum(1 for kw in negative_kw if kw in content)

        if pos_count > neg_count:
            row['sentiment'] = 'positive'
        elif neg_count > pos_count:
            row['sentiment'] = 'negative'
        else:
            row['sentiment'] = 'neutral'

    if verbose:
        pos = sum(1 for r in data if r['sentiment'] == 'positive')
        neg = sum(1 for r in data if r['sentiment'] == 'negative')
        neu = sum(1 for r in data if r['sentiment'] == 'neutral')
        print(f"  Sentiment breakdown: {pos} positive, {neg} negative, {neu} neutral")

    return data


def format_report(data: list[dict], output_file: str, verbose: bool) -> str:
    """Build a human-readable report without performing output I/O."""
    if not data:
        return "No records collected."

    platforms = {}
    for r in data:
        p = r.get('platform', 'unknown')
        platforms.setdefault(p, []).append(r)

    lines = [
        "Social Sentiment Report",
        "=" * 50,
        f"Source:      {output_file}",
        f"Records:     {len(data)}",
        f"Platforms:   {', '.join(sorted(platforms.keys())) or 'none'}",
    ]

    for platform, rows in sorted(platforms.items()):
        sentiments = [r.get('sentiment', '') for r in rows]
        pos = sentiments.count('positive')
        neg = sentiments.count('negative')
        total_eng = sum(int(r.get('engagement', 0) or 0) for r in rows)
        avg_eng = total_eng / len(rows) if rows else 0
        lines.extend([
            "",
            f"  {platform}:",
            f"    Posts:     {len(rows)}",
            f"    Positive:  {pos}",
            f"    Negative:  {neg}",
            f"    Neutral:   {sentiments.count('neutral')}",
            f"    Avg Eng:   {avg_eng:.1f}",
        ])

    if verbose and data:
        lines.extend(["", "  Top posts by engagement:"])
        sorted_data = sorted(data, key=lambda r: int(r.get('engagement', 0) or 0), reverse=True)
        for r in sorted_data[:5]:
            lines.append(
                f"    [{r.get('platform','?'):8s}] {r.get('engagement',0):>5d}  "
                f"({r.get('sentiment','?'):8s}) {r.get('content','')[:60]}"
            )

    return "\n".join(lines)


def print_report(data: list[dict], output_file: str, verbose: bool) -> str:
    """Print and return the human-readable report."""
    report = format_report(data, output_file, verbose)
    print(report)
    return report


def run_pipeline(
    input_file: Optional[str],
    output_file: str,
    source_format: Optional[str],
    platform: Optional[str],
    query: Optional[str],
    subreddit: Optional[str],
    days: int,
    verbose: bool,
) -> dict[str, object]:
    """Run convert -> collect (mock) -> analyze -> output."""

    collected = []

    # Step 1: Convert from external format if requested
    if source_format and input_file:
        if verbose:
            print(f"[1/4] Converting {source_format} format from {input_file}")

        convert_file(source_format, input_file, output_file)

        with open(output_file, 'r') as f:
            collected = list(csv.DictReader(f))

        if verbose:
            print(f"  Converted {len(collected)} records.")

    # Step 2: Collect mock data if --platform is given
    elif platform:
        if verbose:
            print(f"[1/4] Collecting mock data via {platform}")

        mock_records = []
        platform_lower = platform.lower()

        if platform_lower in ('twitter', 'all'):
            mock_tweets = [
                {"platform": "twitter", "date": "2026-06-01", "mention": "@user1",
                 "author": "user1", "sentiment": "positive", "engagement": 42,
                 "content": "This product is really good and I love it"},
                {"platform": "twitter", "date": "2026-06-02", "mention": "@user2",
                 "author": "user2", "sentiment": "negative", "engagement": 15,
                 "content": "Terrible experience with this, very disappointed"},
                {"platform": "twitter", "date": "2026-06-03", "mention": "@user3",
                 "author": "user3", "sentiment": "neutral", "engagement": 7,
                 "content": "Just saw the new product, not sure what to think"},
                {"platform": "twitter", "date": "2026-06-04", "mention": "@user4",
                 "author": "user4", "sentiment": "positive", "engagement": 88,
                 "content": "Amazing quality and fast shipping, highly recommend"},
                {"platform": "twitter", "date": "2026-06-05", "mention": "@user5",
                 "author": "user5", "sentiment": "negative", "engagement": 3,
                 "content": "Customer support was awful, want a refund"},
            ]
            mock_records.extend(mock_tweets)

        if platform_lower in ('reddit', 'all'):
            sr = subreddit or "general"
            mock_reddit = [
                {"platform": "reddit", "date": "2026-06-01", "mention": f"r/{sr}",
                 "author": "redditor1", "sentiment": "positive", "engagement": 120,
                 "content": "Best purchase I have made this year, great value"},
                {"platform": "reddit", "date": "2026-06-02", "mention": f"r/{sr}",
                 "author": "redditor2", "sentiment": "negative", "engagement": 45,
                 "content": "Poor build quality, broke after one week"},
                {"platform": "reddit", "date": "2026-06-03", "mention": f"r/{sr}",
                 "author": "redditor3", "sentiment": "positive", "engagement": 67,
                 "content": "Excellent customer service, went above and beyond"},
            ]
            mock_records.extend(mock_reddit)

        collected = mock_records

        if verbose:
            print(f"  Generated {len(collected)} mock records.")

    else:
        raise ValueError("either input/format or platform is required")

    # Step 3: Analyze sentiment
    if verbose:
        print(f"[2/4] Analyzing sentiment for {len(collected)} records")

    collected = analyze_sentiment(collected, verbose)

    # Step 4: Save output
    if verbose:
        print(f"[3/4] Saving output to {output_file}")

    save_to_csv(collected, output_file)

    # Step 5: Print report
    if verbose:
        print("[4/4] Generating report")

    report_text = print_report(collected, output_file, verbose)

    return {
        "output_file": output_file,
        "records": collected,
        "report_text": report_text,
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Social Sentiment Tracker - unified CLI pipeline"
    )
    parser.add_argument('--input', help='Input CSV file (raw format)')
    parser.add_argument('--output', required=True, help='Output CSV file (standardized)')
    parser.add_argument('--format',
                        choices=['brandwatch', 'sprout', 'hootsuite', 'mention', 'brand24'],
                        help='Source format for conversion')
    parser.add_argument('--platform', choices=['twitter', 'reddit', 'all'],
                        help='Platform to collect mock data from (no API keys needed)')
    parser.add_argument('--query', help='Search query for collection')
    parser.add_argument('--subreddit', help='Subreddit for Reddit collection')
    parser.add_argument('--days', type=int, default=7,
                        help='Days to look back (default: 7)')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Show detailed step-by-step output')

    args = parser.parse_args(argv)

    try:
        run_pipeline(
            input_file=args.input,
            output_file=args.output,
            source_format=args.format,
            platform=args.platform,
            query=args.query,
            subreddit=args.subreddit,
            days=args.days,
            verbose=args.verbose,
        )
    except (CollectorError, ValueError) as exc:
        print(f"Error: {exc}")
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
