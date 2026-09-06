#!/usr/bin/env python3
"""CLI entry point for Amazon Competitor Monitor.

Loads competitor monitoring data from a JSON file and produces a
structured report covering price changes, listing changes, buy box
analysis, and priority alerts.
"""

import argparse
import json
import sys

try:
    from .core import generate_competitor_monitor_report
except ImportError:  # 直接以脚本方式运行时（python3 scripts/run.py）回退到同级模块导入
    from core import generate_competitor_monitor_report


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments.

    Args:
        argv: Argument list; defaults to sys.argv[1:].

    Returns:
        Parsed namespace with input, output, format, threshold fields.
    """
    parser = argparse.ArgumentParser(
        description="Amazon Competitor Monitor - Analyze price changes, listing changes, "
        "and buy box shifts across ASINs."
    )
    parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="Path to JSON file containing monitoring data. "
        "Expected keys: current_prices, previous_prices, "
        "current_listings, previous_listings, buy_box_history.",
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
        "--threshold",
        "-t",
        type=float,
        default=5.0,
        help="Price change percentage threshold for alerts (default: 5.0).",
    )
    parser.add_argument(
        "--max-alerts",
        type=int,
        default=10,
        help="Maximum number of priority alerts to include (default: 10).",
    )
    return parser.parse_args(argv)


def format_text_report(report: dict) -> str:
    """Format a competitor monitor report as human-readable text.

    Args:
        report: Report dict from generate_competitor_monitor_report.

    Returns:
        Formatted text string.
    """
    summary = report.get("summary", {})
    lines = [
        "=" * 70,
        "AMAZON COMPETITOR MONITOR REPORT",
        "=" * 70,
        "",
        f"Generated at: {report.get('generated_at', 'N/A')}",
        "",
        "--- Summary ---",
        f"  ASINs Tracked:            {summary.get('total_asins_tracked', 0)}",
        f"  ASINs with Price Change:  {summary.get('asins_with_price_change', 0)}",
        f"  ASINs with Listing Change:{summary.get('asins_with_listing_change', 0)}",
        f"  Buy Box Shifts:           {summary.get('total_buy_box_shifts', 0)}",
        f"  Total Alerts:             {summary.get('total_alerts', 0)}",
        f"  High Severity:            {summary.get('high_severity_alerts', 0)}",
        "",
    ]

    # Price changes
    pcs = report.get("price_changes", [])
    if pcs:
        lines.append(f"--- Price Changes ({len(pcs)} total) ---")
        for pc in pcs[:20]:
            direction = pc.get("direction", "?")
            symbol = "+++" if direction == "up" else "---" if direction == "down" else "NEW"
            pct = pc.get("change_pct")
            pct_str = f"{pct:+.1f}%" if pct is not None else "N/A"
            lines.append(
                f"  {symbol} {pc.get('asin', 'N/A')}: "
                f"${pc.get('old_price', '?')} -> ${pc.get('new_price', '?')} "
                f"({pct_str}) [{pc.get('severity', '?')}]"
            )

    # Alerts
    alerts = report.get("priority_alerts", [])
    if alerts:
        lines.append("")
        lines.append(f"--- Priority Alerts ({len(alerts)} total) ---")
        for alert in alerts:
            lines.append(
                f"  [{alert.get('severity', '?').upper()}] "
                f"{alert.get('message', '')}"
            )

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

        config = {
            "price_change_threshold": args.threshold,
            "max_alerts": args.max_alerts,
            "alert_on_buy_box_loss": True,
        }

        report = generate_competitor_monitor_report(data, config)

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
