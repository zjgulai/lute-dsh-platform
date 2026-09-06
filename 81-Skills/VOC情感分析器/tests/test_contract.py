#!/usr/bin/env python3
"""Deterministic contract tests for da-voc-sentiment-analyzer."""

from __future__ import annotations

import importlib.util
import types
import unittest
from pathlib import Path

import yaml

from skills._shared.json_schema_validator import validate_json_schema


SKILL_DIR = Path(__file__).resolve().parents[1]
CORE_PATH = SKILL_DIR / "scripts" / "core.py"


def load_module(path: Path, name: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_frontmatter() -> dict:
    content = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    return yaml.safe_load(content.split("---", 2)[1])


CORE = load_module(CORE_PATH, "da_voc_contract")
FRONTMATTER = load_frontmatter()


class VocSentimentContractTests(unittest.TestCase):
    def assert_output_conforms(self, output: object) -> None:
        schema = FRONTMATTER["output_schema"]
        self.assertEqual(validate_json_schema(output, schema), [])

    def test_process_accepts_review_array_and_conforms_output(self) -> None:
        contract_input = {
            "reviews": [
                {"text": "Excellent battery life", "rating": 5},
                {"text": "Battery failed after one week", "rating": 1},
            ],
            "top_n": 3,
            "min_reviews": 1,
        }
        self.assertEqual(
            validate_json_schema(contract_input, FRONTMATTER["input_schema"]), []
        )
        output = CORE.process(contract_input)

        self.assert_output_conforms(output)
        self.assertEqual(output["metadata"]["total_reviews"], 2)

    def test_process_accepts_csv_text_boundary(self) -> None:
        output = CORE.process(
            {
                "reviews": "text,rating\nGreat comfort,5\nPoor battery,1\n",
                "min_reviews": 1,
            }
        )

        self.assert_output_conforms(output)
        self.assertEqual(output["metadata"]["total_reviews"], 2)

    def test_process_rejects_missing_or_unknown_input(self) -> None:
        with self.assertRaisesRegex(ValueError, "reviews"):
            CORE.process({})
        with self.assertRaisesRegex(ValueError, "unsupported input fields"):
            CORE.process({"reviews": [], "reviews_data": []})


if __name__ == "__main__":
    unittest.main()
