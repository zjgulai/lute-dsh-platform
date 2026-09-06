#!/usr/bin/env python3
"""Deterministic contract tests for cbec-customer-voice-analyzer."""

from __future__ import annotations

import importlib.util
import types
import unittest
from pathlib import Path

import yaml


def _check_required(instance: object, schema: object) -> list:
    """Minimal field-level validation: check required keys present (self-contained)."""
    issues = []
    if not isinstance(schema, dict) or not isinstance(instance, dict):
        return issues
    for key in schema.get("required", []):
        if key not in instance:
            issues.append(f"missing required field: {key}")
    return issues


def validate_json_schema(instance: object, schema: object) -> list:
    return _check_required(instance, schema)


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


CORE = load_module(CORE_PATH, "cbec_customer_voice_contract")
FRONTMATTER = load_frontmatter()


class CustomerVoiceContractTests(unittest.TestCase):
    def assert_output_conforms(self, output: object) -> None:
        schema = FRONTMATTER["output_schema"]
        self.assertEqual(validate_json_schema(output, schema), [])

    def test_process_accepts_flat_feedback_and_conforms_output(self) -> None:
        contract_input = {
            "feedback": [
                {
                    "text": "I love the comfort but the pump is noisy",
                    "rating": 4,
                    "brand": "Momcozy",
                }
            ],
            "config": {"brands": ["Momcozy"], "themes": ["comfort", "noise"]},
        }
        self.assertEqual(
            validate_json_schema(contract_input, FRONTMATTER["input_schema"]), []
        )
        output = CORE.process(contract_input)

        self.assert_output_conforms(output)
        self.assertEqual(output["summary"]["total_samples"], 1)

    def test_process_accepts_grouped_feedback_boundary(self) -> None:
        output = CORE.process(
            {
                "feedback": {
                    "reddit": [
                        {"text": "Should I get Momcozy or Elvie?", "rating": 0}
                    ],
                    "amazon": [],
                },
                "config": {"min_occurrence": 1},
            }
        )

        self.assert_output_conforms(output)
        self.assertEqual(output["aggregation"]["total_samples"], 1)

    def test_process_rejects_missing_or_unknown_input(self) -> None:
        with self.assertRaisesRegex(ValueError, "feedback"):
            CORE.process({})
        with self.assertRaisesRegex(ValueError, "unsupported input fields"):
            CORE.process({"feedback": [], "unexpected": True})


if __name__ == "__main__":
    unittest.main()
