#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""validate-skill.py - Skill优化器 结构/规范自检脚本（自包含，无外部依赖）

按 Universal Skill Schema 检查 SKILL.md 的结构与规范合规性。
用法:
    python3 scripts/validate-skill.py <skill_dir>
退出码: 0=通过  1=存在 error  2=用法错误
"""
import re
import sys
from pathlib import Path

REQ_FILES = {"SKILL.md"}
REC_FILES = {"README.md"}


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except Exception as e:
        sys.stderr.write(f"[error] 无法读取 {p}: {e}\n")
        sys.exit(1)


def _check_frontmatter(text: str, errors: list, warnings: list):
    m = re.match(r"\A---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not m:
        errors.append("SKILL.md 缺少 YAML frontmatter（--- ... ---）")
        return
    fm = m.group(1)
    name_m = re.search(r"^name:\s*(.+)$", fm, re.M)
    if not name_m:
        errors.append("frontmatter 缺少 name 字段")
    else:
        name = name_m.group(1).strip().strip('"\'')
        if "_" in name:
            warnings.append(f"name 含下划线（建议连字符/中文/Unicode 字母）: {name}")
    desc_m = re.search(r"^description:\s*(.+)$", fm, re.M)
    if not desc_m:
        errors.append("frontmatter 缺少 description 字段")
    ver_m = re.search(r'^version:\s*"?([\d.]+)"?\s*$', fm, re.M)
    if not ver_m:
        warnings.append("frontmatter 缺少 version 字段")
    if not re.search(r'^complexity:\s*"?(minimal|standard|complex)"?\s*$', fm, re.M):
        warnings.append("frontmatter 缺少/非法 complexity（minimal|standard|complex）")
    if not re.search(r"^license:\s*\S+\s*$", fm, re.M):
        warnings.append("frontmatter 缺少 license 字段")
    if "<" in fm or ">" in fm:
        warnings.append("frontmatter 含尖括号 < > 字符")


def main() -> int:
    if len(sys.argv) != 2:
        sys.stderr.write("用法: python3 scripts/validate-skill.py <skill_dir>\n")
        return 2
    root = Path(sys.argv[1])
    if not root.is_dir():
        sys.stderr.write(f"[error] 目录不存在: {root}\n")
        return 2

    errors: list = []
    warnings: list = []

    for f in REQ_FILES:
        if not (root / f).exists():
            errors.append(f"缺少必需文件: {f}")
    for f in REC_FILES:
        if not (root / f).exists():
            warnings.append(f"缺少推荐文件: {f}")

    skill_md = root / "SKILL.md"
    if skill_md.exists():
        text = _read(skill_md)
        _check_frontmatter(text, errors, warnings)
        body = text.split("---", 2)[-1] if text.count("---") >= 2 else text
        for pat in ("你应该", "你可以", "你需要"):
            if pat in body:
                warnings.append(f"正文含第二人称「{pat}」，建议改祈使语态")

    if errors:
        print("[ERROR]")
        for e in errors:
            print(f"  - {e}")
    if warnings:
        print("[WARNING]")
        for w in warnings:
            print(f"  - {w}")
    if not errors and not warnings:
        print("[OK] 结构检查通过")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
