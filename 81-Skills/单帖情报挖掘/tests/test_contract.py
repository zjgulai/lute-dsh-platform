#!/usr/bin/env python3
"""Deterministic, no-network contract tests for single-post mining."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import sys
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


RUN = load_module(RUN_PATH, "single_post_contract")
FRONTMATTER = load_frontmatter()


class SuccessfulPipeline:
    def __init__(self, **_kwargs: object) -> None:
        pass

    def run(self, _messages: list[dict], template: object) -> object:
        del template
        return types.SimpleNamespace(
            success=True,
            content="unused",
            parsed_json={"post_type": "complaint", "insights": []},
            error=None,
        )


class FailedPipeline:
    def __init__(self, **_kwargs: object) -> None:
        pass

    def run(self, _messages: list[dict], template: object) -> object:
        del template
        return types.SimpleNamespace(
            success=False,
            content="",
            parsed_json=None,
            error="fixture provider failure",
        )


class SinglePostContractTests(unittest.TestCase):
    def assert_output_conforms(self, output: object) -> None:
        schema = FRONTMATTER["output_schema"]
        self.assertEqual(validate_json_schema(output, schema), [])

    def test_json_stdout_conforms_without_provider_call(self) -> None:
        stdout = io.StringIO()
        contract_input = {"input": "A complaint post and its comments"}
        self.assertEqual(
            validate_json_schema(contract_input, FRONTMATTER["input_schema"]), []
        )
        argv = ["run.py", "--input", contract_input["input"]]
        with mock.patch.object(RUN, "LLMPipeline", SuccessfulPipeline), mock.patch.object(
            sys, "argv", argv
        ), contextlib.redirect_stdout(stdout):
            RUN.main()

        output = json.loads(stdout.getvalue())
        self.assert_output_conforms(output)
        self.assertEqual(output["post_type"], "complaint")

    def test_local_input_and_output_file_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "post.txt"
            output_path = Path(temp_dir) / "analysis.json"
            input_path.write_text("A local fixture post", encoding="utf-8")
            argv = [
                "run.py",
                "--input",
                str(input_path),
                "--output",
                str(output_path),
            ]
            with mock.patch.object(RUN, "LLMPipeline", SuccessfulPipeline), mock.patch.object(
                sys, "argv", argv
            ):
                RUN.main()

            output = json.loads(output_path.read_text(encoding="utf-8"))

        self.assert_output_conforms(output)

    def test_provider_failure_exits_nonzero_without_retrying_network(self) -> None:
        stderr = io.StringIO()
        argv = ["run.py", "--input", "fixture post"]
        with mock.patch.object(RUN, "LLMPipeline", FailedPipeline), mock.patch.object(
            sys, "argv", argv
        ), contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            RUN.main()

        self.assertEqual(raised.exception.code, 1)
        self.assertIn("fixture provider failure", stderr.getvalue())

    def test_missing_input_is_rejected_before_pipeline_creation(self) -> None:
        stderr = io.StringIO()
        with mock.patch.object(sys, "argv", ["run.py"]), mock.patch.object(
            RUN, "LLMPipeline", side_effect=AssertionError("pipeline constructed")
        ), contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            RUN.main()

        self.assertEqual(raised.exception.code, 2)
        self.assertIn("--input", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
