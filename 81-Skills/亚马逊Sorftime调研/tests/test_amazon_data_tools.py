#!/usr/bin/env python3
"""Regression tests for Amazon data helper scripts."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import tempfile
import types
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
VALIDATE_PATH = SKILL_ROOT / "scripts" / "validate-data.py"
FETCH_PATH = SKILL_ROOT / "scripts" / "fetch-amazon-data.py"


def load_module(name: str, path: Path) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


VALIDATE = load_module("validate_data", VALIDATE_PATH)
FETCH = load_module("fetch_amazon_data", FETCH_PATH)


class AmazonDataToolTests(unittest.TestCase):
    def write_csv(self, root: Path, rows: str) -> Path:
        csv_path = root / "amazon.csv"
        csv_path.write_text(
            "asin,title,category,price,rating,review_count,bsr\n" + rows,
            encoding="utf-8",
        )
        return csv_path

    def test_validate_csv_reports_invalid_numeric_fields_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = self.write_csv(
                Path(tmpdir),
                "B08N5WRWNW,Speaker,Electronics,n/a,4.5,many,NaN\n",
            )

            errors, warnings = VALIDATE.validate_csv(csv_path)

        self.assertIn("Row 1: Invalid price value", errors)
        self.assertIn("Row 1: Invalid review_count value", errors)
        self.assertIn("Row 1: Invalid bsr value", errors)
        self.assertEqual([], warnings)

    def test_validate_csv_handles_empty_numeric_fields(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = self.write_csv(
                Path(tmpdir),
                "B08N5WRWNW,Speaker,Electronics,,4.5,12,10\n",
            )

            errors, _warnings = VALIDATE.validate_csv(csv_path)

        self.assertIn("Row 1: Missing required field 'price'", errors)

    def test_validate_main_returns_error_for_missing_input_file(self):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            exit_code = VALIDATE.main(["--input", "/tmp/does-not-exist-amazon.csv"])

        self.assertEqual(1, exit_code)
        self.assertIn("Error:", stdout.getvalue())

    def test_fetch_csv_missing_input_returns_error_code(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "out.csv"
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = FETCH.main(["--source", "csv", "--output", str(output)])

        self.assertEqual(1, exit_code)
        self.assertIn("--input required", stdout.getvalue())

    def test_fetch_web_source_returns_error_code(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "out.csv"
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = FETCH.main(["--source", "web", "--output", str(output)])

        self.assertEqual(1, exit_code)
        self.assertIn("web source is not implemented", stdout.getvalue())
        self.assertFalse(output.exists())

    def test_keepa_requires_api_key_without_system_exit(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config = Path(tmpdir) / "keepa.json"
            config.write_text(json.dumps({"domain": 1}), encoding="utf-8")

            with self.assertRaisesRegex(FETCH.DataFetchError, "API key"):
                FETCH.fetch_from_keepa(["B08N5WRWNW"], config, requests_module=object())

    def test_sp_api_configured_source_raises_not_implemented(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config = Path(tmpdir) / "sp-api.json"
            config.write_text(json.dumps({"client_id": "client"}), encoding="utf-8")

            with self.assertRaisesRegex(FETCH.DataFetchError, "sp-api source is not implemented"):
                FETCH.fetch_from_sp_api("speakers", config, boto3_module=object())

    def test_keepa_configured_source_raises_not_implemented(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config = Path(tmpdir) / "keepa.json"
            config.write_text(json.dumps({"api_key": "key"}), encoding="utf-8")

            with self.assertRaisesRegex(FETCH.DataFetchError, "keepa source is not implemented"):
                FETCH.fetch_from_keepa(["B08N5WRWNW"], config, requests_module=object())

    def test_fetch_validate_stops_before_saving_invalid_csv_data(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            source = self.write_csv(root, "B08N5WRWNW,Speaker,Electronics,n/a,4.5,12,10\n")
            output = root / "out.csv"

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = FETCH.main([
                    "--source", "csv",
                    "--input", str(source),
                    "--output", str(output),
                    "--validate",
                ])

            self.assertEqual(1, exit_code)
            self.assertIn("Validation errors", stdout.getvalue())
            self.assertFalse(output.exists())

    def test_fetch_csv_success_writes_output(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            source = self.write_csv(root, "B08N5WRWNW,Speaker,Electronics,29.99,4.5,12,10\n")
            output = root / "out.csv"

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = FETCH.main([
                    "--source", "csv",
                    "--input", str(source),
                    "--output", str(output),
                    "--validate",
                ])

            self.assertEqual(0, exit_code)
            self.assertTrue(output.exists())


if __name__ == "__main__":
    unittest.main()
