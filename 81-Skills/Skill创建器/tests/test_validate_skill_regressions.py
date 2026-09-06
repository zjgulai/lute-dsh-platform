#!/usr/bin/env python3
"""Regression tests for validate-skill.py behavior that protects release gates."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR_PATH = REPO_ROOT / "skills/lute-skills-creator/scripts/validate-skill.py"


def load_validator_module():
    spec = importlib.util.spec_from_file_location("validate_skill", VALIDATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


VALIDATOR_MODULE = load_validator_module()


class ValidateSkillRegressionTests(unittest.TestCase):
    def write_skill(self, root: Path, body: str, complexity: str = "complex") -> Path:
        skill_dir = root / "fixture-skill"
        skill_dir.mkdir()
        (skill_dir / "SKILL.md").write_text(
            f"""---
name: fixture-skill
description: This skill should be used when testing validator regression behavior.
complexity: {complexity}
---

# Fixture Skill

{body}
""",
            encoding="utf-8",
        )
        return skill_dir

    def validate(self, skill_dir: Path):
        validator = VALIDATOR_MODULE.SkillValidator(skill_dir)
        validator.validate(json_mode=True)
        return validator

    def test_complex_skill_missing_references_is_reported_after_frontmatter_parse(self):
        with tempfile.TemporaryDirectory() as tmp:
            skill_dir = self.write_skill(Path(tmp), "Plain body.")

            validator = self.validate(skill_dir)

        warning_messages = [warning.message for warning in validator.warnings]
        self.assertIn("Missing recommended directory for complex skill: references/", warning_messages)

    def test_missing_local_file_reference_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            skill_dir = self.write_skill(Path(tmp), "Read `references/missing.md` before use.")
            (skill_dir / "references").mkdir()

            validator = self.validate(skill_dir)

        warning_messages = [warning.message for warning in validator.warnings]
        self.assertIn("Referenced file not found: references/missing.md", warning_messages)

    def test_plain_phrase_and_repo_path_are_not_treated_as_local_resource_references(self):
        with tempfile.TemporaryDirectory() as tmp:
            skill_dir = self.write_skill(
                Path(tmp),
                "Analyze scripts/structure as prose. Run `layout/scripts/sync_skills.py` from repo root.",
            )
            (skill_dir / "references").mkdir()
            (skill_dir / "references" / ".gitkeep").write_text("", encoding="utf-8")

            validator = self.validate(skill_dir)

        warning_messages = [warning.message for warning in validator.warnings]
        self.assertNotIn("Referenced file not found: scripts/structure", warning_messages)
        self.assertNotIn("Referenced file not found: scripts/sync_skills.py", warning_messages)


if __name__ == "__main__":
    unittest.main()
