#!/usr/bin/env python3
"""Tier 1.1: frontmatter 机械补齐（enabled/user-invocable/title）+ 备份 + 规模报告。
红线：只改 SKILL.md 内容；目录结构/资源文件不动；每文件 .bak 一次性备份。
用法: python3 skillopt-tier1-frontmatter.py [--apply] [--report-only]
"""
import os, re, sys, json

APPLY = "--apply" in sys.argv
ROOTS = [os.path.expanduser("~/.dsh/skills")]
SIZE_LIMIT = 12 * 1024

def parse_fm(text):
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    if not m:
        return None, text
    return m.group(1), text

def has_key(fm, key):
    return bool(re.search(rf"^{key}:\s*\S", fm, re.M))

def add_key(fm, key, value):
    lines = fm.split("\n")
    lines.append(f'{key}: {value}')
    return "\n".join(lines)

report = {"total": 0, "fixed": [], "skipped_no_fm": [], "oversize": []}

for root in ROOTS:
    for d in sorted(os.listdir(root)):
        f = os.path.join(root, d, "SKILL.md")
        if not os.path.isfile(f):
            continue
        report["total"] += 1
        raw = open(f, "rb").read()
        if b"\x00" in raw[:4096]:
            report["skipped_no_fm"].append((f, "binary")); continue
        text = raw.decode("utf-8", errors="replace")
        fm, _ = parse_fm(text)
        if fm is None:
            report["skipped_no_fm"].append((f, "no frontmatter")); continue

        size = len(text.encode("utf-8"))
        if size > SIZE_LIMIT:
            report["oversize"].append((d, size))

        missing = []
        if not has_key(fm, "enabled"):
            missing.append(("enabled", '"true"'))
        if not has_key(fm, "user-invocable"):
            missing.append(("user-invocable", "true"))
        if not has_key(fm, "title"):
            nm = re.search(r'^name:\s*"([^"]+)"', fm, re.M)
            missing.append(("title", json.dumps(nm.group(1) if nm else d, ensure_ascii=False)))

        if not missing:
            continue
        report["fixed"].append((d, [k for k, _ in missing]))
        if not APPLY:
            continue
        # 备份（一次性）
        bak = f + ".bak"
        if not os.path.exists(bak):
            open(bak, "wb").write(raw)
        new_fm = fm
        for k, v in missing:
            new_fm = add_key(new_fm, k, v)
        new_text = text.replace(fm, new_fm, 1)
        open(f, "w", encoding="utf-8").write(new_text)

print(json.dumps({
    "mode": "apply" if APPLY else "dry-run",
    "total": report["total"],
    "fixed_count": len(report["fixed"]),
    "fixed": report["fixed"],
    "skipped": report["skipped_no_fm"],
    "oversize_gt_12kb": report["oversize"]
}, ensure_ascii=False, indent=1))
