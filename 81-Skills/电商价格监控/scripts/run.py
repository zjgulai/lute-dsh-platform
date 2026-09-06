#!/usr/bin/env python3
"""CLI entry point for E-Commerce Price Monitor.

Loads cross-platform price data from a JSON file and produces a
comprehensive price monitoring report with aggregation, trend
analysis, alerts, and recommendations.
"""

import argparse
import json
import sys

from .core import generate_price_report


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments.

    Args:
        argv: Argument list; defaults to sys.argv[1:].

    Returns:
        Parsed namespace with input, output, format, threshold fields.
    """
    parser = argparse.ArgumentParser(
        description="E-Commerce Price Monitor - Cross-platform price aggregation, "
        "trend detection, alerting, and reporting."
    )
    parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="Path to JSON file containing price monitoring data. "
        "Format: { 'product_id': { 'platform': { 'price': ... } } } "
        "Optionally include 'price_history': { 'product_id': [...] } "
        "for trend analysis.",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Path to write the output report. Omit to print to stdout.",
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=["json", "text"],
        default="json",
        help="Output format: 'json' (default) or 'text' for human-readable summary.",
    )
    parser.add_argument(
        "--price-drop-threshold",
        type=float,
        default=10.0,
        help="Percentage drop threshold for competitor price alerts (default: 10.0).",
    )
    parser.add_argument(
        "--promo-threshold",
        type=float,
        default=15.0,
        help="Minimum discount percentage to flag as a promotion (default: 15.0).",
    )
    parser.add_argument(
        "--map-prices",
        default=None,
        help="Path to JSON file mapping product_id -> MAP (minimum advertised price).",
    )
    parser.add_argument(
        "--no-trends",
        action="store_true",
        help="Skip trend analysis.",
    )
    parser.add_argument(
        "--no-alerts",
        action="store_true",
        help="Skip alert generation.",
    )
    return parser.parse_args(argv)


def format_text_report(report: dict) -> str:
    """Format a price monitoring report as human-readable text.

    Args:
        report: Report dict from generate_price_report.

    Returns:
        Formatted text string.
    """
    summary = report.get("summary", {})
    lines = [
        "=" * 70,
        "E-COMMERCE PRICE MONITOR REPORT",
        "=" * 70,
        "",
        f"Generated at: {report.get('generated_at', 'N/A')}",
        "",
        "--- Summary ---",
        f"  Products Analyzed:           {summary.get('total_products', 0)}",
        f"  Platform Instances:          {summary.get('total_platform_instances', 0)}",
        f"  Products with Trend Data:    {summary.get('products_with_trend_analysis', 0)}",
        f"  Alerts Generated:            {summary.get('alerts_generated', 0)}",
        "",
    ]

    alert_breakdown = summary.get("alert_breakdown", {})
    if alert_breakdown:
        lines.append("--- Alert Breakdown ---")
        for atype, count in alert_breakdown.items():
            lines.append(f"  {atype}: {count}")

    # Competitor price analysis
    cpa = report.get("competitor_price_analysis", {})
    if cpa:
        lines.append("")
        lines.append(f"--- Cross-Platform Price Analysis ({len(cpa)} products) ---")
        for pid, analysis in sorted(cpa.items())[:15]:
            lines.append(
                f"  [{pid}] Platforms: {analysis.get('platform_count', 0)} | "
                f"Min: ${analysis.get('min_price', '?')} | "
                f"Max: ${analysis.get('max_price', '?')} | "
                f"Avg: ${analysis.get('avg_price', '?')} | "
                f"Spread: ${analysis.get('price_spread', 'N/A')}"
            )

    # Trend analysis summary
    trends = report.get("trend_analysis", {})
    if trends:
        lines.append("")
        lines.append(f"--- Trend Analysis ({len(trends)} products) ---")
        for pid, trend in sorted(trends.items())[:10]:
            direction = trend.get("trend_direction", "?")
            volatility = trend.get("volatility_score", 0)
            pred = trend.get("prediction", {})
            pred_price = pred.get("predicted_price", "N/A")
            conf = pred.get("confidence", "?")
            lines.append(
                f"  [{pid}] {direction.upper()} "
                f"(volatility: {volatility:.3f}, "
                f"prediction: ${pred_price}, confidence: {conf})"
            )

    # Alerts
    alerts = report.get("alerts", [])
    if alerts:
        lines.append("")
        lines.append(f"--- Alerts ({len(alerts)} total) ---")
        for alert in alerts[:20]:
            lines.append(
                f"  [{alert.get('severity', '?').upper()}] "
                f"{alert.get('type', '?')}: {alert.get('message', '')}"
            )

    # Recommendations
    recommendations = report.get("recommendations", [])
    if recommendations:
        lines.append("")
        lines.append("--- Recommendations ---")
        for rec in recommendations:
            lines.append(f"  * {rec}")

    lines.append("")
    lines.append("=" * 70)
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Main entry point.

    Args:
        argv: Command-line arguments.

    Returns:
        Exit code (0 on success, 1 on error).
    """
    args = parse_args(argv)

    try:
        with open(args.input, "r") as f:
            data = json.load(f)

        # Load MAP prices if provided
        map_prices = {}
        if args.map_prices:
            try:
                with open(args.map_prices, "r") as f:
                    map_prices = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError) as e:
                print(f"Warning: Could not load MAP prices file: {e}", file=sys.stderr)

        config = {
            "thresholds": {
                "price_drop_pct": args.price_drop_threshold,
                "promotion_discount_pct": args.promo_threshold,
                "map_prices": map_prices,
            },
            "include_trends": not args.no_trends,
            "include_alerts": not args.no_alerts,
        }

        report = generate_price_report(data, config)

        if args.format == "text":
            output = format_text_report(report)
        else:
            output = json.dumps(report, indent=2, default=str)

        if args.output:
            with open(args.output, "w") as f:
                f.write(output)
            print(f"Report written to {args.output}")
        else:
            print(output)

        return 0

    except FileNotFoundError:
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
