#!/usr/bin/env python3
"""Skill评估师自包含结构验证脚本（无外部仓库依赖）。

验证 SKILL.md 的 frontmatter 合规性与目录结构，输出基础的合规检查结果。
六维度深度评估由 Skill评估师 的正文流程完成，本脚本只做机器可检的静态前置验证。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def parse_frontmatter(text: str):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if not m:
        return None, text
    fm_raw = m.group(1)
    body = m.group(2)
    fm = {}
    for line in fm_raw.splitlines():
        line = line.rstrip()
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, body


def check_name(name: str, dirname: str) -> list[str]:
    """name 与目录一致；ASCII 要求 kebab-case；中文/Unicode 字母 kebab 记 na。"""
    errors = []
    if name != dirname:
        errors.append(f"name({name}) 与目录名({dirname}) 不一致")
    if re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name):
        pass  # ASCII kebab-case 合规
    elif re.fullmatch(r"[\u4e00-\u9fffA-Za-z0-9-]+", name):
        pass  # Unicode 字母（含中文）+ 数字 + 连字符，kebab 记 na
    else:
        errors.append(f"name({name}) 含非法字符")
    return errors


def check_dir_structure(root: Path) -> list[str]:
    """检查必要目录存在性与引用有效性。"""
    errors = []
    if not (root / "SKILL.md").exists():
        errors.append("缺少 SKILL.md")
    for d in ("references", "scripts", "examples", "tests"):
        if (root / d).exists() and not any((root / d).iterdir()):
            errors.append(f"{d}/ 为空目录")
    return errors


def check_security(root: Path) -> list[str]:
    """扫描 scripts/ 中的危险命令与硬编码密钥。"""
    errors = []
    dangerous = ("rm -rf /", "curl http|sh", "curl http | sh", ":(){ :|:& };:", "wget http|sh")
    key_patterns = (r"AKIA[0-9A-Z]{16}", r"sk-[A-Za-z0-9]{20,}", r"-----BEGIN.*PRIVATE KEY-----")
    for script in (root / "scripts").glob("*.py") if (root / "scripts").exists() else []:
        if script.name == "run.py":
            continue  # 跳过自身，避免检测串自我误报
        text = script.read_text(encoding="utf-8", errors="ignore")
        for d in dangerous:
            if d in text:
                errors.append(f"{script.name} 含危险命令: {d}")
        for p in key_patterns:
            if re.search(p, text):
                errors.append(f"{script.name} 疑似含硬编码密钥")
    return errors


def main() -> int:
    if len(sys.argv) < 2:
        root = Path.cwd()
    else:
        root = Path(sys.argv[1]).resolve()
    if not root.is_dir():
        print(f"❌ 路径不存在或不是目录: {root}")
        return 2

    skmd = root / "SKILL.md"
    if not skmd.exists():
        print(f"❌ 未找到 SKILL.md: {skmd}")
        return 2

    text = skmd.read_text(encoding="utf-8")
    fm, body = parse_frontmatter(text)

    errors: list[str] = []
    if fm is None:
        errors.append("SKILL.md 缺少 YAML frontmatter")
    else:
        name = fm.get("name", "")
        errors += check_name(name, root.name)
        desc = fm.get("description", "")
        if not desc:
            errors.append("缺少 description")
        elif len(desc) > 1024:
            errors.append(f"description 超长({len(desc)}>1024)")
        if not fm.get("license"):
            errors.append("缺少 license")
        if not fm.get("last_updated"):
            errors.append("缺少 last_updated")
        if not fm.get("version"):
            errors.append("缺少 version")
        if len(body) > 5000:
            errors.append(f"正文超长({len(body)}>5000)")

    errors += check_dir_structure(root)
    errors += check_security(root)

    if errors:
        print("❌ 静态验证未通过：")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(f"✅ 静态验证通过：{root.name}")
    if fm:
        print(f"   name={fm.get('name')}, version={fm.get('version')}, complexity={fm.get('complexity', '未声明')}")
        print(f"   description={len(fm.get('description', ''))} chars, body={len(body)} chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())