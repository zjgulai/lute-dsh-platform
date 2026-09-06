#!/usr/bin/env python3
"""Regression tests for SEO audit engine diagnostics."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import types
import unittest
from pathlib import Path
from typing import Any, Optional


ENGINES_DIR = Path(__file__).resolve().parents[1] / "references" / "audit_engines"
PACKAGE_NAME = "seo_audit_engines_under_test"


def load_engine_module(module_name: str) -> types.ModuleType:
    if PACKAGE_NAME not in sys.modules:
        package = types.ModuleType(PACKAGE_NAME)
        package.__path__ = [str(ENGINES_DIR)]  # type: ignore[attr-defined]
        sys.modules[PACKAGE_NAME] = package

    full_name = f"{PACKAGE_NAME}.{module_name}"
    if full_name in sys.modules:
        return sys.modules[full_name]

    spec = importlib.util.spec_from_file_location(
        full_name,
        ENGINES_DIR / f"{module_name}.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[full_name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


BASE_ENGINE = load_engine_module("base_engine")
PSI_ENGINE = load_engine_module("psi_engine")
LIGHTHOUSE_ENGINE = load_engine_module("lighthouse_engine")
CUSTOM_CRAWLER = load_engine_module("custom_crawler")
FACTORY = load_engine_module("factory")


class FailingEngine(BASE_ENGINE.BaseAuditEngine):
    def audit(self, url: str, **kwargs: Any) -> Optional[object]:
        raise BASE_ENGINE.AuditEngineError("boom")

    def is_available(self) -> bool:
        return True


def make_config(name: str) -> Any:
    return BASE_ENGINE.AuditConfig(name=name)


class AuditEngineLoggingTests(unittest.TestCase):
    def test_base_engine_reports_primary_and_fallback_failures_via_logging(self):
        primary = FailingEngine(make_config("primary"))
        fallback = FailingEngine(make_config("fallback"))

        with self.assertLogs(f"{PACKAGE_NAME}.base_engine", level="WARNING") as logs:
            result = primary.audit_with_fallback("https://example.com", [fallback])

        self.assertIsNone(result)
        self.assertIn("Primary engine primary failed: boom", "\n".join(logs.output))
        self.assertIn("Fallback engine fallback failed: boom", "\n".join(logs.output))

    def test_base_engine_does_not_swallow_unexpected_exceptions(self):
        class BuggyEngine(BASE_ENGINE.BaseAuditEngine):
            def audit(self, url: str, **kwargs: Any) -> Optional[object]:
                raise TypeError("programming bug")

            def is_available(self) -> bool:
                return True

        engine = BuggyEngine(make_config("buggy"))

        with self.assertRaisesRegex(TypeError, "programming bug"):
            engine.audit_with_fallback("https://example.com")

    def test_custom_crawler_does_not_swallow_unexpected_analysis_errors(self):
        crawler = CUSTOM_CRAWLER.CustomCrawlerEngine(make_config("custom_crawler"))
        crawler._analyze_page = lambda *args, **kwargs: (_ for _ in ()).throw(TypeError("programming bug"))

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self) -> bytes:
                return b"<html></html>"

        original_urlopen = CUSTOM_CRAWLER.request.urlopen
        CUSTOM_CRAWLER.request.urlopen = lambda *args, **kwargs: FakeResponse()
        try:
            with self.assertRaisesRegex(TypeError, "programming bug"):
                crawler.audit("https://example.com")
        finally:
            CUSTOM_CRAWLER.request.urlopen = original_urlopen

    def test_psi_engine_does_not_swallow_unexpected_parse_errors(self):
        psi = PSI_ENGINE.PageSpeedInsightsEngine(
            BASE_ENGINE.AuditConfig(
                name="pagespeed_insights",
                config={"api_key": "token"},
            )
        )
        psi._parse_report = lambda *args, **kwargs: (_ for _ in ()).throw(TypeError("programming bug"))

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self) -> bytes:
                return b'{"lighthouseResult": {}}'

        original_urlopen = PSI_ENGINE.request.urlopen
        PSI_ENGINE.request.urlopen = lambda *args, **kwargs: FakeResponse()
        try:
            with self.assertRaisesRegex(TypeError, "programming bug"):
                psi.audit("https://example.com")
        finally:
            PSI_ENGINE.request.urlopen = original_urlopen

    def test_unconfigured_remote_engines_do_not_write_stdout(self):
        psi = PSI_ENGINE.PageSpeedInsightsEngine(make_config("pagespeed_insights"))
        lighthouse = LIGHTHOUSE_ENGINE.LighthouseEngine(make_config("lighthouse"))
        lighthouse.is_available = lambda: False

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertLogs(f"{PACKAGE_NAME}.psi_engine", level="WARNING"):
                self.assertIsNone(psi.audit("https://example.com"))
            with self.assertLogs(f"{PACKAGE_NAME}.lighthouse_engine", level="WARNING"):
                self.assertIsNone(lighthouse.audit("https://example.com"))

        self.assertEqual("", stdout.getvalue())

    def test_unknown_engine_lookup_does_not_write_stdout(self):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertLogs(f"{PACKAGE_NAME}.factory", level="WARNING") as logs:
                result = FACTORY.get_audit_engine("missing-engine")

        self.assertIsNone(result)
        self.assertIn("Unknown audit engine missing-engine", "\n".join(logs.output))
        self.assertEqual("", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
