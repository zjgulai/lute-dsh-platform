#!/usr/bin/env python3
"""Regression tests for format-converter.py conversion errors."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import tempfile
import types
import unittest
from pathlib import Path


CONVERTER_PATH = Path(__file__).resolve().parents[1] / "scripts" / "format-converter.py"


def load_converter_module() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("format_converter", CONVERTER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


CONVERTER = load_converter_module()


class FormatConverterTests(unittest.TestCase):
    def test_parse_engagement_accepts_empty_and_grouped_integers(self):
        self.assertEqual(0, CONVERTER.parse_engagement("", "Engagement"))
        self.assertEqual(1234, CONVERTER.parse_engagement("1,234", "Engagement"))
        self.assertEqual(12, CONVERTER.parse_engagement("12.0", "Engagement"))

    def test_parse_engagement_rejects_invalid_values(self):
        with self.assertRaisesRegex(CONVERTER.ConversionError, "Total Engagements"):
            CONVERTER.parse_engagement("n/a", "Total Engagements")

        with self.assertRaisesRegex(CONVERTER.ConversionError, "Engagements"):
            CONVERTER.parse_engagement("-1", "Engagements")

    def test_sprout_blank_engagement_converts_to_zero(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "sprout.csv"
            source.write_text(
                "Network,Date,Message ID,Author,Total Engagements,Text\n"
                "Twitter,2026-06-01,msg-1,Alice,,hello\n",
                encoding="utf-8",
            )

            rows = CONVERTER.convert_sprout(source)

        self.assertEqual(1, len(rows))
        self.assertEqual(0, rows[0]["engagement"])
        self.assertEqual("hello", rows[0]["content"])

    def test_brandwatch_missing_optional_content_does_not_crash(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "brandwatch.csv"
            source.write_text(
                "Platform,Date,Author,Sentiment,Engagement,Title,Content\n"
                "Twitter,2026-06-01T10:00:00Z,Alice,Positive,5\n",
                encoding="utf-8",
            )

            rows = CONVERTER.convert_brandwatch(source)

        self.assertEqual(1, len(rows))
        self.assertEqual("", rows[0]["content"])
        self.assertEqual(5, rows[0]["engagement"])

    def test_main_returns_error_code_for_invalid_conversion(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "sprout.csv"
            output = Path(tmpdir) / "standard.csv"
            source.write_text(
                "Network,Date,Message ID,Author,Total Engagements,Text\n"
                "Twitter,2026-06-01,msg-1,Alice,n/a,hello\n",
                encoding="utf-8",
            )

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = CONVERTER.main([
                    "--input", str(source),
                    "--format", "sprout",
                    "--output", str(output),
                ])

        self.assertEqual(1, exit_code)
        self.assertIn("Invalid engagement value", stdout.getvalue())
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
