#!/usr/bin/env python3
"""Regression tests for convert-for-model.py error boundaries."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


CONVERTER_PATH = Path(__file__).resolve().parents[1] / "scripts" / "convert-for-model.py"


def load_converter_module():
    spec = importlib.util.spec_from_file_location("convert_for_model", CONVERTER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ConvertForModelRegressionTests(unittest.TestCase):
    def setUp(self):
        self.converter = load_converter_module()

    def run_main(self, argv: list[str]) -> int:
        original_argv = sys.argv
        sys.argv = ["convert-for-model.py", *argv]
        try:
            return self.converter.main()
        finally:
            sys.argv = original_argv

    def create_skill(self, root: Path) -> Path:
        skill_dir = root / "demo-skill"
        skill_dir.mkdir()
        (skill_dir / "SKILL.md").write_text(
            "---\n"
            "name: demo-skill\n"
            "description: Demo skill for conversion\n"
            "---\n"
            "Use this skill for demo conversions.\n",
            encoding="utf-8",
        )
        return skill_dir

    def test_output_path_filesystem_error_returns_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill_dir = self.create_skill(root)
            output_file = root / "not-a-directory"
            output_file.write_text("occupied", encoding="utf-8")

            stdout = io.StringIO()
            stderr = io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                result = self.run_main([
                    str(skill_dir),
                    "--target",
                    "gpt",
                    "--output",
                    str(output_file),
                    "--format",
                    "json",
                ])

            self.assertEqual(1, result)
            self.assertIn("Conversion failed", stdout.getvalue())

    def test_unexpected_conversion_shape_error_propagates(self):
        class BrokenConverter:
            frontmatter = {"name": "broken-skill"}
            body = "body"
            references: dict[str, str] = {}

            def __init__(self, skill_path: Path):
                self.skill_path = skill_path

            def convert_to_gpt(self) -> dict[str, Any]:
                return {}

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill_dir = self.create_skill(root)
            output_dir = root / "adapters"
            original_converter = self.converter.SkillConverter
            self.converter.SkillConverter = BrokenConverter
            try:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(KeyError):
                        self.run_main([
                            str(skill_dir),
                            "--target",
                            "gpt",
                            "--output",
                            str(output_dir),
                            "--format",
                            "json",
                        ])
            finally:
                self.converter.SkillConverter = original_converter


if __name__ == "__main__":
    unittest.main()
