#!/usr/bin/env python3
"""CLI entry point for SCM Logistics Tracker.

Loads shipment tracking data from a JSON file and produces a
comprehensive tracking report.
"""

import argparse
import json
import sys

from .core import generate_tracking_report


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments.

    Args:
        argv: Argument list; defaults to sys.argv[1:].

    Returns:
        Parsed namespace with input, output, and format fields.
    """
    parser = argparse.ArgumentParser(
        description="SCM Logistics Tracker - Generate tracking reports from shipment data."
    )
    parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="Path to JSON file containing shipment tracking data (list of dicts). "
        "Each shipment should have 'tracking_number' and optionally 'tracking_history'.",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Path to write the output report. If omitted, prints to stdout.",
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=["json", "text"],
        default="json",
        help="Output format: 'json' (default) or 'text' for human-readable summary.",
    )
    parser.add_argument(
        "--no-estimates",
        action="store_true",
        help="Skip delivery date estimation.",
    )
    return parser.parse_args(argv)


def format_text_report(report: dict) -> str:
    """Format a tracking report dict as a human-readable text summary.

    Args:
        report: Report dict produced by generate_tracking_report.

    Returns:
        Formatted text string.
    """
    summary = report.get("summary", {})
    lines = [
        "=" * 60,
        "SCM LOGISTICS TRACKER REPORT",
        "=" * 60,
        "",
        f"Generated at: {report.get('generated_at', 'N/A')}",
        "",
        "--- Summary ---",
        f"  Total Shipments:  {summary.get('total_shipments', 0)}",
        f"  In Transit:       {summary.get('in_transit', 0)}",
        f"  Delivered:        {summary.get('delivered', 0)}",
        f"  Exceptions:       {summary.get('exceptions', 0)}",
        "",
    ]

    # Per-shipment detail
    shipments = report.get("shipments", [])
    if shipments:
        lines.append("--- Shipment Details ---")
        for s in shipments:
            tn = s.get("tracking_number", "N/A")
            carrier = s.get("carrier", "")
            status = s.get("status", "unknown")
            est = s.get("estimated_delivery", "N/A")
            cnt = s.get("event_count", 0)
            lines.append(f"  [{tn}] {carrier} - {status} ({cnt} events, ETA: {est})")

    # Estimated delivery dates
    dates = report.get("estimated_delivery_dates", {})
    if dates:
        lines.append("")
        lines.append("--- Estimated Delivery Dates ---")
        for tn, est in dates.items():
            lines.append(f"  {tn}: {est}")

    # Exception summary
    exc = report.get("exception_summary", {})
    if exc.get("total_exceptions", 0) > 0:
        lines.append("")
        lines.append("--- Exception Summary ---")
        lines.append(f"  Total: {exc['total_exceptions']}")
        lines.append(f"  By Severity: {exc.get('by_severity', {})}")
        lines.append(f"  By Type:     {exc.get('by_type', {})}")

    lines.append("")
    lines.append("=" * 60)
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

        if isinstance(data, dict):
            # Single shipment wrapped in a dict
            shipments = [data]
        elif isinstance(data, list):
            shipments = data
        else:
            print("Error: Input must be a JSON object or array.", file=sys.stderr)
            return 1

        config = {
            "include_delivery_estimates": not args.no_estimates,
            "alert_on_exceptions": True,
        }

        report = generate_tracking_report(shipments, config)

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
        print(f"Error: Invalid JSON in input file: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
