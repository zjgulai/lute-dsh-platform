#!/usr/bin/env python3
"""Regression tests for supplier data source fallback diagnostics."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import types
import unittest
from pathlib import Path
from typing import Any


DATA_SOURCES_DIR = Path(__file__).resolve().parents[1] / "references" / "data_sources"
PACKAGE_NAME = "supplier_data_sources_under_test"


def load_data_source_module(module_name: str) -> types.ModuleType:
    if PACKAGE_NAME not in sys.modules:
        package = types.ModuleType(PACKAGE_NAME)
        package.__path__ = [str(DATA_SOURCES_DIR)]  # type: ignore[attr-defined]
        sys.modules[PACKAGE_NAME] = package

    full_name = f"{PACKAGE_NAME}.{module_name}"
    if full_name in sys.modules:
        return sys.modules[full_name]

    spec = importlib.util.spec_from_file_location(
        full_name,
        DATA_SOURCES_DIR / f"{module_name}.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[full_name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


BASE_SOURCE = load_data_source_module("base_source")
ALIBABA_1688 = load_data_source_module("alibaba_1688")
ENTERPRISE_REGISTRY = load_data_source_module("enterprise_registry")
FACTORY = load_data_source_module("factory")


class NullSource(BASE_SOURCE.BaseSupplierDataSource):
    def fetch_supplier_info(self, supplier_id: str, **kwargs: Any) -> None:
        return None


class FailingSource(BASE_SOURCE.BaseSupplierDataSource):
    def fetch_supplier_info(self, supplier_id: str, **kwargs: Any) -> None:
        raise BASE_SOURCE.DataSourceError("boom")


def make_config(name: str) -> Any:
    return BASE_SOURCE.DataSourceConfig(
        name=name,
        type=BASE_SOURCE.DataSourceType.LOCAL,
    )


class BaseSourceFallbackTests(unittest.TestCase):
    def test_fallback_exception_is_reported(self):
        primary = NullSource(make_config("primary"))
        fallback = FailingSource(make_config("fallback"))

        with self.assertLogs(f"{PACKAGE_NAME}.base_source", level="WARNING") as logs:
            result = primary.fetch_with_fallback("supplier-1", fallback_sources=[fallback])

        self.assertIsNone(result)
        self.assertIn("Fallback source fallback failed: boom", "\n".join(logs.output))

    def test_primary_exception_is_reported(self):
        primary = FailingSource(make_config("primary"))

        with self.assertLogs(f"{PACKAGE_NAME}.base_source", level="WARNING") as logs:
            result = primary.fetch_with_fallback("supplier-1")

        self.assertIsNone(result)
        self.assertIn("Primary source primary failed: boom", "\n".join(logs.output))

    def test_base_source_does_not_swallow_unexpected_exceptions(self):
        class BuggySource(BASE_SOURCE.BaseSupplierDataSource):
            def fetch_supplier_info(self, supplier_id: str, **kwargs: Any) -> None:
                raise TypeError("programming bug")

        source = BuggySource(make_config("buggy"))

        with self.assertRaisesRegex(TypeError, "programming bug"):
            source.fetch_with_fallback("supplier-1")

    def test_unimplemented_api_placeholders_raise_data_source_unavailable(self):
        alibaba = ALIBABA_1688.Alibaba1688Source(make_config("alibaba_1688"))
        enterprise = ENTERPRISE_REGISTRY.EnterpriseRegistrySource(make_config("enterprise_registry"))

        with self.assertRaises(BASE_SOURCE.DataSourceUnavailableError):
            alibaba._fetch_via_api("supplier-1")
        with self.assertRaises(BASE_SOURCE.DataSourceUnavailableError):
            enterprise._fetch_via_tianyancha("company-1")
        with self.assertRaises(BASE_SOURCE.DataSourceUnavailableError):
            enterprise._fetch_via_qichacha("company-1")

    def test_unconfigured_api_sources_do_not_write_stdout(self):
        alibaba = ALIBABA_1688.Alibaba1688Source(make_config("alibaba_1688"))
        enterprise = ENTERPRISE_REGISTRY.EnterpriseRegistrySource(make_config("enterprise_registry"))

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertLogs(f"{PACKAGE_NAME}.alibaba_1688", level="WARNING"):
                self.assertIsNone(alibaba.fetch_supplier_info("supplier-1"))
            with self.assertLogs(f"{PACKAGE_NAME}.enterprise_registry", level="WARNING"):
                self.assertIsNone(enterprise.fetch_supplier_info("company-1"))

        self.assertEqual("", stdout.getvalue())

    def test_unknown_data_source_lookup_does_not_write_stdout(self):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertLogs(f"{PACKAGE_NAME}.factory", level="WARNING") as logs:
                result = FACTORY.get_data_source("missing-source")

        self.assertIsNone(result)
        self.assertIn("Unknown data source missing-source", "\n".join(logs.output))
        self.assertEqual("", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
