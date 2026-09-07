#!/usr/bin/env python3
"""Tier 1.2: 应用 workflow/触发词建议（subagent 产出 → 主模型审核 → 本脚本统一应用）。
用法: python3 skillopt-tier1-apply.py [--apply] [--report-only]
红线：只改 SKILL.md frontmatter；skip=true 不碰；每项建议机械校验后才落盘。
"""
import os, re, json, sys, glob

APPLY = "--apply" in sys.argv
SUG_DIR = "/tmp/skillopt-t1-sug"
ROOT = os.path.expanduser("~/.dsh/skills")

suggestions = []
for f in sorted(glob.glob(os.path.join(SUG_DIR, "sug-*.json"))):
    data = json.load(open(f, encoding="utf-8"))
    suggestions.extend(data)

applied = {"workflow": [], "triggers": [], "skipped": 0, "invalid": []}

for sug in suggestions:
    name = sug.get("name", "")
    f = os.path.join(ROOT, name, "SKILL.md")
    if sug.get("skip") is True:
        applied["skipped"] += 1
        continue
    if not os.path.isfile(f):
        applied["invalid"].append((name, "file missing"))
        continue
    text = open(f, encoding="utf-8").read()
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    if not m:
        applied["invalid"].append((name, "no frontmatter"))
        continue
    fm = m.group(1)
    new_fm = fm
    changed = []

    # workflow 插入（追加到 frontmatter 末尾，user-invocable 后）
    wf = sug.get("workflow")
    if wf and not re.search(r"^workflow:", fm, re.M):
        steps = [s.strip() for s in wf.split("；") if s.strip()]
        if len(steps) <= 5:
            esc = wf.replace("\\", "\\\\").replace('"', '\\"')
            new_fm = new_fm.rstrip() + "\n" + f'workflow: "{esc}"'
            changed.append("workflow")

    # 触发词追加到 description 值结尾（引号内）
    trig = sug.get("addTriggers")
    if trig:
        desc_m = re.search(r'^(description:\s*")(.*)("\s*)$', new_fm, re.M)
        if desc_m and "触发词" not in desc_m.group(2):
            items = [t.strip() for t in trig.split(",") if t.strip()]
            if 3 <= len(items) <= 8:
                tail = " 触发词：" + "、".join(items) + "。"
                new_desc = desc_m.group(2).rstrip() + tail
                new_fm = new_fm.replace(desc_m.group(0), desc_m.group(1) + new_desc + desc_m.group(3), 1)
                changed.append("triggers")

    if not changed:
        continue
    applied["workflow" if "workflow" in changed else "triggers"].append((name, changed))
    if APPLY:
        new_text = text.replace(fm, new_fm, 1)
        open(f, "w", encoding="utf-8").write(new_text)

print(json.dumps({
    "mode": "apply" if APPLY else "dry-run",
    "total_suggestions": len(suggestions),
    "workflow_applied": len(applied["workflow"]),
    "triggers_applied": len(applied["triggers"]),
    "skipped_official": applied["skipped"],
    "invalid": applied["invalid"],
    "workflow_list": applied["workflow"],
    "trigger_list": applied["triggers"]
}, ensure_ascii=False, indent=1))
