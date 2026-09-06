#!/usr/bin/env python3
"""Regression tests for price provider diagnostics."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import types
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
PACKAGE_NAME = "price_monitor_scripts_under_test"


def load_script_module(module_name: str) -> types.ModuleType:
    if PACKAGE_NAME not in sys.modules:
        package = types.ModuleType(PACKAGE_NAME)
        package.__path__ = [str(SCRIPTS_DIR)]  # type: ignore[attr-defined]
        sys.modules[PACKAGE_NAME] = package

    full_name = f"{PACKAGE_NAME}.{module_name}"
    if full_name in sys.modules:
        return sys.modules[full_name]

    spec = importlib.util.spec_from_file_location(
        full_name,
        SCRIPTS_DIR / f"{module_name}.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[full_name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


BASE_PROVIDER = load_script_module("base_provider")
AMAZON_PROVIDER = load_script_module("amazon_provider")
EBAY_PROVIDER = load_script_module("ebay_provider")
MONITOR = load_script_module("monitor")


class FailingProvider(BASE_PROVIDER.BasePriceProvider):
    def fetch_price(self, product_id: str, **kwargs: Any) -> None:
        raise BASE_PROVIDER.ProviderError("boom")

    def fetch_prices(self, product_ids: List[str], **kwargs: Any) -> Dict[str, Optional[object]]:
        return {product_id: None for product_id in product_ids}


def make_config(name: str) -> Any:
    return BASE_PROVIDER.ProviderConfig(
        name=name,
        type=BASE_PROVIDER.ProviderType.API,
    )


class ProviderLoggingTests(unittest.TestCase):
    def test_base_provider_reports_primary_and_fallback_failures_via_logging(self):
        primary = FailingProvider(make_config("primary"))
        fallback = FailingProvider(make_config("fallback"))

        with self.assertLogs(f"{PACKAGE_NAME}.base_provider", level="WARNING") as logs:
            result = primary.fetch_with_fallback("sku-1", fallback_providers=[fallback])

        self.assertIsNone(result)
        self.assertIn("Primary provider primary failed: boom", "\n".join(logs.output))
        self.assertIn("Fallback provider fallback failed: boom", "\n".join(logs.output))

    def test_monitor_reports_provider_failure_via_logging(self):
        monitor = MONITOR.PriceMonitor({"failing": FailingProvider(make_config("failing"))})

        with self.assertLogs(f"{PACKAGE_NAME}.monitor", level="WARNING") as logs:
            result = monitor.fetch_price("sku-1")

        self.assertIsNone(result)
        self.assertIn("Provider failing failed: boom", "\n".join(logs.output))

    def test_base_provider_does_not_swallow_unexpected_exceptions(self):
        class BuggyProvider(BASE_PROVIDER.BasePriceProvider):
            def fetch_price(self, product_id: str, **kwargs: Any) -> None:
                raise TypeError("programming bug")

            def fetch_prices(self, product_ids: List[str], **kwargs: Any) -> Dict[str, Optional[object]]:
                return {product_id: None for product_id in product_ids}

        provider = BuggyProvider(make_config("buggy"))

        with self.assertRaisesRegex(TypeError, "programming bug"):
            provider.fetch_with_fallback("sku-1")

    def test_monitor_does_not_swallow_unexpected_exceptions(self):
        class BuggyProvider(BASE_PROVIDER.BasePriceProvider):
            def fetch_price(self, product_id: str, **kwargs: Any) -> None:
                raise TypeError("programming bug")

            def fetch_prices(self, product_ids: List[str], **kwargs: Any) -> Dict[str, Optional[object]]:
                return {product_id: None for product_id in product_ids}

        monitor = MONITOR.PriceMonitor({"buggy": BuggyProvider(make_config("buggy"))})

        with self.assertRaisesRegex(TypeError, "programming bug"):
            monitor.fetch_price("sku-1")

    def test_unimplemented_marketplace_placeholders_raise_provider_unavailable(self):
        amazon = AMAZON_PROVIDER.AmazonProvider(make_config("amazon"))
        ebay = EBAY_PROVIDER.EbayProvider(make_config("ebay"))

        with self.assertRaises(BASE_PROVIDER.ProviderUnavailableError):
            amazon._fetch_via_api("ASIN1", "US")
        with self.assertRaises(BASE_PROVIDER.ProviderUnavailableError):
            ebay._fetch_via_api("ITEM1", "US")

    def test_ebay_keyword_search_without_credentials_raises_provider_unavailable(self):
        ebay = EBAY_PROVIDER.EbayProvider(make_config("ebay"))

        with self.assertRaisesRegex(BASE_PROVIDER.ProviderUnavailableError, "not configured"):
            ebay.search_by_keyword("wireless speaker")

    def test_ebay_keyword_search_placeholder_raises_provider_unavailable(self):
        config = BASE_PROVIDER.ProviderConfig(
            name="ebay",
            type=BASE_PROVIDER.ProviderType.API,
            config={
                "app_id": "app",
                "cert_id": "cert",
                "dev_id": "dev",
            },
        )
        ebay = EBAY_PROVIDER.EbayProvider(config)

        with self.assertRaisesRegex(BASE_PROVIDER.ProviderUnavailableError, "requires an implemented"):
            ebay.search_by_keyword("wireless speaker")

    def test_unconfigured_marketplace_providers_do_not_write_stdout(self):
        amazon = AMAZON_PROVIDER.AmazonProvider(make_config("amazon"))
        ebay = EBAY_PROVIDER.EbayProvider(make_config("ebay"))

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertLogs(f"{PACKAGE_NAME}.amazon_provider", level="WARNING"):
                self.assertIsNone(amazon.fetch_price("ASIN1", use_api=False))
            with self.assertLogs(f"{PACKAGE_NAME}.ebay_provider", level="WARNING"):
                self.assertIsNone(ebay.fetch_price("ITEM1"))

        self.assertEqual("", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
