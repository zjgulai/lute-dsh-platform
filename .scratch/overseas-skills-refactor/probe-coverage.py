#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""只读覆盖度探针：出海技能（222 海外 + 29 AI全栈）能不能挂到 AI组织变革的三层骨架上。

链路：
  技能 id →（scripts/role-presets/skill-map.json 反查）→ 151 条中文责任名
         →（role-catalog.json roles[].skills）→ 岗位 AGT-0xx
         →（organization-graph.json）→ 责任域 DOM-xx → 面 PLN-xx

不写任何文件，只打印计数与样例。
"""
import json
import os
import collections

ROOT = "/Users/lute/project/Magpie-Horch"
MAT = "/Users/lute/project/AI组织变革"
CATALOG = "/tmp/overseas-catalog.json"

cat = json.load(open(CATALOG))
skill_map = json.load(open(os.path.join(ROOT, "scripts/role-presets/skill-map.json")))
catalog_roles = json.load(open(os.path.join(MAT, "docs/05-agents/role-catalog.json")))
org = json.load(open(os.path.join(MAT, "docs/04-organization/organization-graph.json")))

# --- 责任名 → 岗位 ---
resp_to_role = {}
for r in catalog_roles["roles"]:
    for s in r["skills"]:
        resp_to_role.setdefault(s, []).append(r["id"])
dupes = {k: v for k, v in resp_to_role.items() if len(v) > 1}
print(f"责任名 {len(resp_to_role)} 条；一名多岗 {len(dupes)} 条 {list(dupes.items())[:5]}")

# --- 技能 id → 责任名 ---
skill_to_resp = collections.defaultdict(set)
for resp, rec in skill_map["skills"].items():
    for sid in rec.get("supply", []):
        skill_to_resp[sid].add(resp)
print(f"skill-map 覆盖技能 {len(skill_to_resp)} 个；责任名 {len(skill_map['skills'])} 条")

# --- 岗位 → 域/面 ---
role_meta = {}
for r in org["roles"]:
    role_meta[r["id"]] = r
for d in org["domain_views"]:
    for rid in d["role_ids"]:
        role_meta.setdefault(rid, {})["domain_view_id"] = d["id"]
        role_meta[rid]["domain_name"] = d["name"]
for p in org["planes"]:
    for rid in p["role_ids"]:
        role_meta.setdefault(rid, {})["plane_id"] = p["id"]
        role_meta[rid]["plane_name"] = p["name"]

missing_plane = [rid for rid, m in role_meta.items() if "plane_id" not in m]
print(f"岗位 {len(role_meta)} 个；缺面 {len(missing_plane)} 个 {missing_plane[:8]}")

def resolve(sid):
    resps = sorted(skill_to_resp.get(sid, ()))
    roles = sorted({r for resp in resps for r in resp_to_role.get(resp, ())})
    return resps, roles

print("\n=== 海外 222 ===")
stats = collections.Counter()
multi = []
zero = []
for s in cat["skills"]:
    resps, roles = resolve(s["name"])
    if not roles:
        stats["无岗位"] += 1
        zero.append(s["name"])
    else:
        stats["有岗位"] += 1
        if len(roles) > 1:
            multi.append((s["name"], roles))
        for r in roles:
            stats["面:" + role_meta.get(r, {}).get("plane_name", "?")] += 1
print(dict(stats))
print(f"跨岗 {len(multi)} 个，样例 {multi[:6]}")
print(f"零岗位 {len(zero)} 个：{zero[:20]}")

print("\n=== AI全栈 29 ===")
st2 = collections.Counter()
zero2 = []
for s in cat["skillsFs"]:
    resps, roles = resolve(s["name"])
    if roles:
        st2["有岗位"] += 1
    else:
        st2["无岗位"] += 1
        zero2.append(s["name"])
print(dict(st2), zero2[:20])

# --- 反向：50 个岗位里，出海目录能供给几个 ---
covered_roles = set()
for s in cat["skills"] + cat["skillsFs"]:
    _, roles = resolve(s["name"])
    covered_roles.update(roles)
all_roles = {r["id"] for r in catalog_roles["roles"]}
print(f"\n出海目录覆盖岗位 {len(covered_roles)}/{len(all_roles)}")
empty = sorted(all_roles - covered_roles)
print("零供给岗位:", [(r, role_meta.get(r, {}).get("plane_name"), role_meta.get(r, {}).get("domain_name")) for r in empty])
