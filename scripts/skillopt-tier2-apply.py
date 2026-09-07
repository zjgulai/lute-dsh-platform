#!/usr/bin/env python3
"""Tier 2: 应用 executive 有界编辑（edits.json）。
每技能 ≤5 处；replace 用精确锚点 count==1 才落笔；add 插入到指定位置前。
用法: python3 skillopt-tier2-apply.py [--apply] [--rollback <skill>]
回滚: 还原 SKILL.md.bak（Tier1.1 备份是编辑前基线——若需回滚到 Tier1 后状态，见 docs 说明）
"""
import os, re, sys, json

APPLY = "--apply" in sys.argv
ROOT = os.path.expanduser("~/.dsh/skills")
edits = json.load(open("/tmp/skillopt-tier2/edits.json", encoding="utf-8"))

results = {}
for skill, ops in edits.items():
    f = os.path.join(ROOT, skill, "SKILL.md")
    if not os.path.isfile(f):
        results[skill] = {"error": "missing file"}
        continue
    text = open(f, encoding="utf-8").read()
    new_text = text
    log = []
    fail = []
    for op in ops:
        if op["op"] == "replace":
            old = op["target"]
            cnt = new_text.count(old)
            if op.get("replace_all"):
                if cnt < 1:
                    fail.append({"op": op["op"], "target": old[:60], "count": cnt})
                    continue
                new_text = new_text.replace(old, op["with"])
            else:
                if cnt != 1:
                    fail.append({"op": op["op"], "target": old[:60], "count": cnt})
                    continue
                new_text = new_text.replace(old, op["with"], 1)
            log.append(f"replace: {old[:40]}...")
        elif op["op"] == "add":
            anchor = op.get("where", "")
            heading = op["before"].strip().split("\n")[0].strip()
            if heading and heading in new_text:
                log.append(f"add: {heading[:30]} (已存在，幂等跳过)")
                continue
            if anchor not in new_text:
                fail.append({"op": "add", "where": anchor[:60], "error": "anchor not found"})
                continue
            new_text = new_text.replace(anchor, op["before"] + "\n" + anchor, 1)
            log.append(f"add: before {anchor[:30]}")
    results[skill] = {"applied": log, "failed": fail}
    if APPLY and not fail:
        # 快照（保留 Tier1 后基线）
        snap = f + ".t1"
        if not os.path.exists(snap):
            open(snap, "wb").write(open(f, "rb").read())
        open(f, "w", encoding="utf-8").write(new_text)
    elif APPLY and fail:
        results[skill]["error"] = "skipped due to anchor failures (no partial apply)"

print(json.dumps({"mode": "apply" if APPLY else "dry-run", "results": results}, ensure_ascii=False, indent=1))
