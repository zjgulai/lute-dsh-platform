#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase A-4：把 10 个批次的判定合并成入库产物 `manifest/role-assignments.json`。

只接受**通过 `validate-assignments.py` 的批次**；合并前会再跑一次校验，任一批次不合格即拒绝写盘。
每条挂载都带 `source`：`skill-map`（继承既有 151 责任名人工映射）或 `assigned`（本轮判定新增）。

用法：python3 merge-assignments.py            # 校验 + 合并 + 写盘
      python3 merge-assignments.py --dry-run  # 只报告，不写
"""
import json
import os
import subprocess
import sys
import collections

ROOT = "/Users/lute/project/Magpie-Horch"
BASE = os.path.join(ROOT, ".scratch/overseas-skills-refactor")
EV = os.path.join(BASE, "evidence")
ASG = os.path.join(BASE, "assignments")
PKG = os.path.join(ROOT, "packages/capabilities/dsh-overseas-skills")
OUT = os.path.join(PKG, "manifest", "role-assignments.json")
DRY = "--dry-run" in sys.argv

# 1) 先跑机械校验，红了就不写盘
check = subprocess.run([sys.executable, os.path.join(BASE, "validate-assignments.py")], capture_output=True, text=True)
print(check.stdout.strip())
if check.returncode != 0:
    print(check.stderr.strip())
    sys.exit("✗ 校验未通过，拒绝合并")

batches = sorted(f[:-5] for f in os.listdir(os.path.join(EV, "batches")) if f.endswith(".json"))
by_name, order = {}, []
for bid in batches:
    inp = json.load(open(os.path.join(EV, "batches", f"{bid}.json")))
    out = json.load(open(os.path.join(ASG, f"{bid}.json")))
    for s, a in zip(inp["skills"], out["assignments"]):
        assert s["name"] == a["name"], (bid, s["name"], a["name"])
        existing = {(e["role"], e["responsibility"]) for e in s["existing"] if e["role"]}
        roles = []
        for r in a["roles"]:
            entry = {
                "id": r["id"],
                "responsibility": r.get("responsibility", ""),
                "source": "skill-map" if (r["id"], r.get("responsibility", "")) in existing else "assigned",
                "confidence": r["confidence"],
            }
            # 证据一并入库：归位判定是**判断**，不给证据就无法复核（.scratch 不是家）。
            if r.get("from_skill"):
                entry["evidence"] = {"from_skill": r["from_skill"], "from_role": r["from_role"]}
            if r.get("note"):
                entry["note"] = r["note"]
            roles.append(entry)
        roles.sort(key=lambda x: x["id"])
        record = {
            "catalog": s["catalog"],
            "scenario": s["scenario"],
            "sub": s["sub"],
            "roles": roles,
            "no_role_kind": a.get("no_role_kind"),
            "no_role_reason": a.get("no_role_reason"),
        }
        drops = a.get("drop_reasons") or []
        if drops:
            record["dropped"] = sorted(
                [{"id": d["id"], "reason": d.get("reason", "")} for d in drops if isinstance(d, dict) and d.get("id")],
                key=lambda x: x["id"],
            )
        by_name[s["name"]] = record
        order.append(s["name"])

# 2) 统计
stat = collections.Counter()
per_role = collections.Counter()
for rec in by_name.values():
    stat["技能"] += 1
    stat[f"目录:{rec['catalog']}"] += 1
    if rec["roles"]:
        stat["有岗"] += 1
        for r in rec["roles"]:
            stat[f"来源:{r['source']}"] += 1
            per_role[r["id"]] += 1
    else:
        stat["无岗"] += 1
        stat[f"无岗:{rec['no_role_kind']}"] += 1

payload = {
    "_meta": {
        "purpose": "出海技能（222）+ AI全栈（29）→ 《AI组织变革》50 岗位的归位判定；页面「出海技能」四层下钻的数据源。",
        "vocabulary": "岗位/责任名取自材料 docs/05-agents/role-catalog.json 与 docs/04-organization/organization-graph.json（151 条责任名，一名唯一属一岗）。",
        "relation_to_skill_map": "与 scripts/role-presets/skill-map.json 的关系：该文件是**接线**（责任名→技能供给，喂 50 个 preset）；本文件是**归位**（技能→岗位，喂页面）。source=skill-map 的条目即从前者继承。",
        "generated": "2026-09-12 十批语义判定 + 机械校验（.scratch/overseas-skills-refactor/validate-assignments.py）",
    },
    "coverage": {
        "skills": stat["技能"],
        "with_roles": stat["有岗"],
        "without_roles": stat["无岗"],
        "role_ids_with_supply": len(per_role),
    },
    "skills": {name: by_name[name] for name in order},
}

print(f"\n技能 {stat['技能']}（海外 {stat['目录:overseas']} / AI全栈 {stat['目录:fs']}）")
print(f"有岗 {stat['有岗']} / 无岗 {stat['无岗']}；挂载 {stat['来源:skill-map'] + stat['来源:assigned']}"
      f"（继承 {stat['来源:skill-map']} + 新判定 {stat['来源:assigned']}）")
print("无岗分类：" + ", ".join(f"{k.split(':')[1]}={v}" for k, v in stat.items() if k.startswith("无岗:")))
print(f"有供给的岗位 {len(per_role)}/50；零供给 {sorted(set(json.load(open(os.path.join(EV, 'roles.json')))[i]['id'] for i in range(50)) - set(per_role))}")

if DRY:
    print("（--dry-run，未写盘）")
else:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(payload, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"✓ 写入 {OUT}（{os.path.getsize(OUT)} 字节）")
