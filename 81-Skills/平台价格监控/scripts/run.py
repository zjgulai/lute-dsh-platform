#!/usr/bin/env python3
"""
Unified CLI entry point for Ecommerce Platform Price Monitor.

Orchestrates the full monitoring pipeline:
  load config -> create provider -> run monitor -> output alerts
"""

import argparse
import json
import sys
from typing import Any, Optional

from .base_provider import BasePriceProvider, PriceData, ProviderConfig, ProviderType
from .amazon_provider import AmazonProvider
from .ebay_provider import EbayProvider
from .monitor import PriceMonitor


MOCK_PRODUCTS = [
    {"id": "B08N5WRWNW", "platform": "amazon", "price": 24.99, "currency": "USD"},
    {"id": "B07PW9VBKZ", "platform": "amazon", "price": 39.99, "currency": "USD"},
    {"id": "B08D3N5NML", "platform": "amazon", "price": 15.49, "currency": "USD"},
    {"id": "324567890123", "platform": "ebay",   "price": 22.50, "currency": "USD"},
    {"id": "123456789012", "platform": "ebay",   "price": 45.00, "currency": "USD"},
]


def create_mock_provider(name: str) -> BasePriceProvider:
    """Create a simple mock provider for testing without API keys."""
    from datetime import datetime

    class MockProvider(BasePriceProvider):
        def fetch_price(self, product_id: str, **kwargs) -> Optional[PriceData]:
            for mp in MOCK_PRODUCTS:
                if mp["id"] == product_id and mp["platform"] == name:
                    return PriceData(
                        product_id=product_id,
                        platform=name,
                        price=mp["price"],
                        currency=mp["currency"],
                        availability="in_stock",
                        timestamp=datetime.now(),
                        source="mock",
                    )
            # Default mock data
            return PriceData(
                product_id=product_id,
                platform=name,
                price=19.99,
                currency="USD",
                availability="in_stock",
                timestamp=datetime.now(),
                source="mock",
            )

        def fetch_prices(self, product_ids: list[str], **kwargs) -> dict[str, Optional[PriceData]]:
            results = {}
            for pid in product_ids:
                results[pid] = self.fetch_price(pid, **kwargs)
            return results

    return MockProvider(ProviderConfig(
        name=name,
        type=ProviderType.MOCK,
        priority=50,
    ))


def create_provider_factory(platform: str, use_mock: bool) -> Optional[BasePriceProvider]:
    """Provider factory: real or mock depending on config."""
    if platform == 'amazon':
        return AmazonProvider() if not use_mock else create_mock_provider('amazon')
    elif platform == 'ebay':
        return EbayProvider() if not use_mock else create_mock_provider('ebay')
    return None


def print_alerts(alerts: list[dict], verbose: bool) -> None:
    """Print alerts in a human-readable format."""
    if not alerts:
        print("No price change alerts.")
        return

    print(f"\nPrice Change Alerts ({len(alerts)})")
    print("=" * 55)
    for alert in alerts:
        direction = "UP" if alert['direction'] == 'up' else "DOWN"
        print(f"  {alert['product_id']:14s}  {alert['platform']:8s}  "
              f"${alert['old_price']:.2f} -> ${alert['new_price']:.2f}  "
              f"{direction} {abs(alert['change_pct'])*100:.1f}%  "
              f"{alert['timestamp'].strftime('%m-%d %H:%M')}")


def print_summary(monitor: PriceMonitor, verbose: bool) -> None:
    """Print a summary of monitoring stats."""
    stats = monitor.get_stats()

    print(f"\nPrice Monitor Summary")
    print("=" * 50)
    print(f"Providers:     {', '.join(stats['providers'].keys())}")
    print(f"Monitored:     {stats['monitored_products']} products")
    print(f"Records:       {stats['total_records']}")
    print(f"Alerts:        {stats['alerts_count']}")

    for name, status in stats['providers'].items():
        print(f"  {name}: type={status['type']}, enabled={status['enabled']}, "
              f"cache={status['cache_size']} items")


def run_pipeline(
    platform: str,
    product_ids: list[str],
    output_file: str,
    output_format: str,
    use_mock: bool,
    threshold: float,
    verbose: bool,
) -> int:
    """Run the full monitoring pipeline."""

    # Step 1: Create provider
    if verbose:
        print(f"[1/4] Creating {'mock ' if use_mock else ''}provider for: {platform}")

    provider = create_provider_factory(platform, use_mock)
    if not provider:
        print(f"Error: unknown platform '{platform}'. Supported: amazon, ebay")
        return 1

    if verbose:
        print(f"  Provider: {provider.config.name} ({provider.config.type.value})")

    # Step 2: Initialize monitor
    if verbose:
        print(f"[2/4] Initializing price monitor")

    monitor = PriceMonitor({platform: provider})

    # Step 3: Fetch prices (two rounds to detect changes)
    if verbose:
        print(f"[3/4] Fetching prices for {len(product_ids)} products (round 1)")

    prices1 = monitor.fetch_prices(product_ids)
    for pid, price in prices1.items():
        if price:
            if verbose:
                print(f"  {pid}: ${price.price:.2f} ({price.currency})")
        else:
            print(f"  {pid}: no data returned")

    # Second round to generate change alerts
    if verbose:
        print(f"  Fetching prices (round 2)")

    prices2 = monitor.fetch_prices(product_ids)
    alerts = monitor.monitor_changes(product_ids, threshold=threshold)

    if verbose:
        print(f"  Found {len(alerts)} price changes")

    # Step 4: Output results
    if verbose:
        print(f"[4/4] Outputting results")

    # Save to file
    if output_format == 'json':
        export_data = monitor.export_data('json')
        with open(output_file, 'w') as f:
            f.write(export_data)
    elif output_format == 'csv':
        export_data = monitor.export_data('csv')
        with open(output_file, 'w') as f:
            f.write(export_data)

    if verbose:
        print(f"  Saved to {output_file}")

    # Print alerts and summary
    print_alerts(alerts, verbose)
    print_summary(monitor, verbose)

    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Ecommerce Platform Price Monitor - unified CLI pipeline"
    )
    parser.add_argument('--platform', choices=['amazon', 'ebay', 'all'],
                        default='amazon', help='Platform to monitor (default: amazon)')
    parser.add_argument('--input', help='Input file with product IDs (one per line)')
    parser.add_argument('--product', '-p', action='append', dest='products',
                        help='Product ID to monitor (can be specified multiple times)')
    parser.add_argument('--output', default='price_alerts.json',
                        help='Output file (default: price_alerts.json)')
    parser.add_argument('--format', choices=['json', 'csv'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Show detailed step-by-step output')
    parser.add_argument('--mock', action='store_true',
                        help='Use mock provider (no API keys needed)')
    parser.add_argument('--threshold', type=float, default=0.05,
                        help='Price change threshold (decimal, default: 0.05)')

    args = parser.parse_args(argv)

    # Collect product IDs
    product_ids: list[str] = []
    if args.products:
        product_ids.extend(args.products)
    if args.input:
        try:
            with open(args.input, 'r') as f:
                for line in f:
                    pid = line.strip()
                    if pid:
                        product_ids.append(pid)
        except OSError as exc:
            print(f"Error reading input file: {exc}")
            return 1

    if not product_ids:
        # Default to mock products if none specified
        if args.mock or args.platform != 'all':
            product_ids = [mp["id"] for mp in MOCK_PRODUCTS
                           if mp["platform"] == args.platform or args.platform == 'all']
        if not product_ids:
            print("Error: specify product IDs via --product or --input")
            return 1

    if args.platform == 'all':
        # Run amazon first, then ebay
        print("Running multi-platform monitor (all platforms)...")
        for plat in ['amazon', 'ebay']:
            pid_subset = [mp["id"] for mp in MOCK_PRODUCTS if mp["platform"] == plat]
            rc = run_pipeline(plat, pid_subset, args.output, args.format,
                              args.mock, args.threshold, args.verbose)
            if rc != 0:
                return rc
        return 0

    return run_pipeline(args.platform, product_ids, args.output, args.format,
                        args.mock, args.threshold, args.verbose)


if __name__ == '__main__':
    sys.exit(main())
