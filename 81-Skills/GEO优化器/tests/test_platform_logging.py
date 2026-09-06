#!/usr/bin/env python3
"""Regression tests for GEO platform adapter diagnostics."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import types
import unittest
from pathlib import Path
from typing import Any, Optional


PLATFORMS_DIR = Path(__file__).resolve().parents[1] / "references" / "platforms"
PACKAGE_NAME = "seo_geo_platforms_under_test"


def load_platform_module(module_name: str) -> types.ModuleType:
    if PACKAGE_NAME not in sys.modules:
        package = types.ModuleType(PACKAGE_NAME)
        package.__path__ = [str(PLATFORMS_DIR)]  # type: ignore[attr-defined]
        sys.modules[PACKAGE_NAME] = package

    full_name = f"{PACKAGE_NAME}.{module_name}"
    if full_name in sys.modules:
        return sys.modules[full_name]

    spec = importlib.util.spec_from_file_location(
        full_name,
        PLATFORMS_DIR / f"{module_name}.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[full_name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


BASE_PLATFORM = load_platform_module("base_platform")
GOOGLE_SGE = load_platform_module("google_sge")
BING_COPILOT = load_platform_module("bing_copilot")
CHECKER = load_platform_module("checker")
FACTORY = load_platform_module("factory")


class FailingAdapter(BASE_PLATFORM.BasePlatformAdapter):
    def check_visibility(self, url: str, query: str, **kwargs: Any) -> Optional[object]:
        raise BASE_PLATFORM.PlatformError("boom")

    def is_available(self) -> bool:
        return True


def make_config(name: str) -> Any:
    return BASE_PLATFORM.PlatformConfig(
        name=name,
        type=BASE_PLATFORM.PlatformType.GOOGLE_SGE,
    )


class PlatformLoggingTests(unittest.TestCase):
    def test_unknown_adapter_lookup_does_not_write_stdout(self):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertLogs(f"{PACKAGE_NAME}.factory", level="WARNING") as logs:
                result = FACTORY.get_platform_adapter("missing-adapter")

        self.assertIsNone(result)
        self.assertIn("Unknown platform adapter missing-adapter", "\n".join(logs.output))
        self.assertEqual("", stdout.getvalue())

    def test_checker_reports_adapter_failures_via_logging(self):
        checker = CHECKER.GEOChecker({"google_sge": FailingAdapter(make_config("google_sge"))})

        with self.assertLogs(f"{PACKAGE_NAME}.checker", level="WARNING") as logs:
            result = checker.check_all("https://example.com", "best baby monitor")

        self.assertIsNone(result["google_sge"])
        self.assertIn("Error checking google_sge: boom", "\n".join(logs.output))

    def test_checker_does_not_swallow_unexpected_adapter_exceptions(self):
        class BuggyAdapter(BASE_PLATFORM.BasePlatformAdapter):
            def check_visibility(self, url: str, query: str, **kwargs: Any) -> Optional[object]:
                raise TypeError("programming bug")

            def is_available(self) -> bool:
                return True

        checker = CHECKER.GEOChecker({"google_sge": BuggyAdapter(make_config("google_sge"))})

        with self.assertRaisesRegex(TypeError, "programming bug"):
            checker.check_all("https://example.com", "best baby monitor")

    def test_coverage_summary_does_not_swallow_unexpected_exceptions(self):
        class BuggyCoverageAdapter(BASE_PLATFORM.BasePlatformAdapter):
            def check_visibility(self, url: str, query: str, **kwargs: Any) -> Optional[object]:
                return None

            def is_available(self) -> bool:
                return True

            def get_sge_coverage(self, url: str) -> dict[str, Any]:
                raise TypeError("programming bug")

        checker = CHECKER.GEOChecker({"google_sge": BuggyCoverageAdapter(make_config("google_sge"))})

        with self.assertRaisesRegex(TypeError, "programming bug"):
            checker.get_coverage_summary("https://example.com")

    def test_coverage_summary_reports_expected_platform_errors(self):
        class FailingCoverageAdapter(BASE_PLATFORM.BasePlatformAdapter):
            def check_visibility(self, url: str, query: str, **kwargs: Any) -> Optional[object]:
                return None

            def is_available(self) -> bool:
                return True

            def get_sge_coverage(self, url: str) -> dict[str, Any]:
                raise BASE_PLATFORM.PlatformError("service unavailable")

        checker = CHECKER.GEOChecker({"google_sge": FailingCoverageAdapter(make_config("google_sge"))})

        summary = checker.get_coverage_summary("https://example.com")

        self.assertEqual("service unavailable", summary["platforms"]["google_sge"]["error"])

    def test_unimplemented_platform_placeholders_raise_platform_unavailable(self):
        google = GOOGLE_SGE.GoogleSGEAdapter(make_config("google_sge"))
        bing = BING_COPILOT.BingCopilotAdapter(make_config("bing_copilot"))

        with self.assertRaises(BASE_PLATFORM.PlatformUnavailableError):
            google._fetch_via_search_console("https://example.com", "query")
        with self.assertRaises(BASE_PLATFORM.PlatformUnavailableError):
            bing._fetch_via_bing_api("https://example.com", "query")

    def test_unknown_platform_lookup_does_not_write_stdout(self):
        checker = CHECKER.GEOChecker({})

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertLogs(f"{PACKAGE_NAME}.checker", level="WARNING") as logs:
                result = checker.check_platform("missing-platform", "https://example.com", "query")

        self.assertIsNone(result)
        self.assertIn("Unknown platform missing-platform", "\n".join(logs.output))
        self.assertEqual("", stdout.getvalue())

    def test_unconfigured_adapters_do_not_write_stdout(self):
        google = GOOGLE_SGE.GoogleSGEAdapter(make_config("google_sge"))
        bing = BING_COPILOT.BingCopilotAdapter(make_config("bing_copilot"))

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertLogs(f"{PACKAGE_NAME}.google_sge", level="WARNING"):
                self.assertIsNone(google.check_visibility("https://example.com", "query"))
            with self.assertLogs(f"{PACKAGE_NAME}.bing_copilot", level="WARNING"):
                self.assertIsNone(bing.check_visibility("https://example.com", "query"))

        self.assertEqual("", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
