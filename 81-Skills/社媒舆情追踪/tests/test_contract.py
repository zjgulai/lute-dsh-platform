#!/usr/bin/env python3
"""Deterministic contract tests for the social sentiment pipeline."""

from __future__ import annotations

import importlib.util
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

import yaml

from skills._shared.json_schema_validator import validate_json_schema


SKILL_DIR = Path(__file__).resolve().parents[1]
RUN_PATH = SKILL_DIR / "scripts" / "run.py"


def load_module(path: Path, name: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_frontmatter() -> dict:
    content = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    return yaml.safe_load(content.split("---", 2)[1])


RUN = load_module(RUN_PATH, "social_sentiment_contract")
FRONTMATTER = load_frontmatter()


class SocialSentimentContractTests(unittest.TestCase):
    def assert_output_conforms(self, output: object) -> None:
        schema = FRONTMATTER["output_schema"]
        self.assertEqual(validate_json_schema(output, schema), [])

    def test_mock_pipeline_conforms_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "social.csv"
            contract_input = {
                "output": str(output_path),
                "platform": "reddit",
                "query": "brand",
                "subreddit": "voc",
                "days": 7,
                "verbose": False,
            }
            self.assertEqual(
                validate_json_schema(contract_input, FRONTMATTER["input_schema"]), []
            )
            with mock.patch.object(
                RUN, "fetch_twitter", side_effect=AssertionError("network call")
            ), mock.patch.object(
                RUN, "fetch_reddit", side_effect=AssertionError("network call")
            ):
                output = RUN.run_pipeline(
                    input_file=None,
                    output_file=str(output_path),
                    source_format=None,
                    platform="reddit",
                    query="brand",
                    subreddit="voc",
                    days=7,
                    verbose=False,
                )

            self.assertTrue(output_path.is_file())

        self.assert_output_conforms(output)
        self.assertEqual(len(output["records"]), 3)
        self.assertTrue(all(row["platform"] == "reddit" for row in output["records"]))

    def test_pipeline_rejects_missing_source(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir, self.assertRaisesRegex(
            ValueError, "input/format or platform"
        ):
            RUN.run_pipeline(
                input_file=None,
                output_file=str(Path(temp_dir) / "social.csv"),
                source_format=None,
                platform=None,
                query=None,
                subreddit=None,
                days=7,
                verbose=False,
            )

    def test_cli_contract_returns_zero_and_writes_declared_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "social.csv"
            with mock.patch.object(
                RUN, "fetch_twitter", side_effect=AssertionError("network call")
            ), mock.patch.object(
                RUN, "fetch_reddit", side_effect=AssertionError("network call")
            ):
                exit_code = RUN.main(
                    [
                        "--platform",
                        "reddit",
                        "--query",
                        "brand",
                        "--output",
                        str(output_path),
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertTrue(output_path.is_file())


if __name__ == "__main__":
    unittest.main()
