#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase A-1：构建「出海技能 → 岗位」判定的证据包（只读，产物落 .scratch）。

输入（全部只读）：
  /tmp/overseas-catalog.json                     出海 222 + AI全栈 29 目录
  ~/.dsh/skills/<name>/SKILL.md                  技能正文（判定证据）
  /Users/lute/project/AI组织变革/docs/05-agents/role-catalog.json     50 岗位（使命/责任名/标准产物）
  /Users/lute/project/AI组织变革/docs/04-organization/organization-graph.json  面/责任域
  scripts/role-presets/skill-map.json            既有「责任名→技能」映射（强先验）

输出：
  evidence/roles.json           50 岗位词表（唯一允许出现的岗位 id 与责任名）
  evidence/all-skills.json      全部技能的可判定文本 + 既有映射
  evidence/batches/B01..B10.json  分批输入（每批 25 个海外技能；B10 = 29 个 AI全栈）
"""
import json
import os
import re
import math

ROOT = "/Users/lute/project/Magpie-Horch"
MAT = "/Users/lute/project/AI组织变革"
SKILLS = os.path.expanduser("~/.dsh/skills")
OUT = os.path.join(ROOT, ".scratch/overseas-skills-refactor/evidence")
CATALOG = "/tmp/overseas-catalog.json"

os.makedirs(os.path.join(OUT, "batches"), exist_ok=True)

cat = json.load(open(CATALOG))
skill_map = json.load(open(os.path.join(ROOT, "scripts/role-presets/skill-map.json")))
roles_src = json.load(open(os.path.join(MAT, "docs/05-agents/role-catalog.json")))
org = json.load(open(os.path.join(MAT, "docs/04-organization/organization-graph.json")))

# ---------- 岗位词表 ----------
plane_of, domain_of = {}, {}
for p in org["planes"]:
    for rid in p["role_ids"]:
        plane_of[rid] = (p["id"], p["name"])
for d in org["domain_views"]:
    for rid in d["role_ids"]:
        domain_of[rid] = (d["id"], d["name"])

roles = []
for r in roles_src["roles"]:
    pid, pname = plane_of.get(r["id"], ("", ""))
    did, dname = domain_of.get(r["id"], ("", ""))
    roles.append({
        "id": r["id"],
        "alias": r["alias"],
        "title": r["title"],
        "plane_id": pid,
        "plane": pname,
        "domain_id": did,
        "domain": dname,
        "mission": r["mission"],
        "artifact": r["artifact"],
        "responsibilities": list(r["skills"]),
        "boundary": r.get("boundary", ""),
    })
roles.sort(key=lambda x: x["id"])
json.dump(roles, open(os.path.join(OUT, "roles.json"), "w"), ensure_ascii=False, indent=1)

role_by_resp = {resp: r["id"] for r in roles for resp in r["responsibilities"]}
role_by_id = {r["id"]: r for r in roles}

# ---------- 既有映射：技能 → [(责任名, 岗位)] ----------
existing = {}
for resp, rec in skill_map["skills"].items():
    for sid in rec.get("supply", []):
        existing.setdefault(sid, []).append({"responsibility": resp, "role": role_by_resp.get(resp, "")})

FM = re.compile(r"^---\n(.*?)\n---\n", re.S)


ACCIO = os.path.expanduser("~/.accio/accounts/1786471462/skills")


def skill_path(name):
    """已安装的技能在 ~/.dsh/skills；未导入的工具型技能只有 Accio 源（15 个）。"""
    for root in (SKILLS, ACCIO):
        p = os.path.join(root, name, "SKILL.md")
        if os.path.exists(p):
            return p
    return None


def read_skill(name):
    """返回 (frontmatter字段, 正文摘录)；找不到文件时返回 (None, None)。"""
    p = skill_path(name)
    if p is None:
        return None, None
    raw = open(p, encoding="utf-8", errors="replace").read()
    fields, body = {}, raw
    m = FM.match(raw)
    if m:
        lines = m.group(1).splitlines()
        i = 0
        while i < len(lines):
            mm = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line := lines[i])
            if mm:
                key, val = mm.group(1), mm.group(2).strip()
                if val in ("|", ">", "|-", ">-"):  # YAML 块标量：吃掉后续缩进行
                    block, i = [], i + 1
                    while i < len(lines) and (lines[i].startswith("  ") or lines[i].strip() == ""):
                        block.append(lines[i].strip())
                        i += 1
                    val = " ".join(x for x in block if x)
                else:
                    i += 1
                fields[key] = val.strip('"')
            else:
                i += 1
        body = raw[m.end():]
    # 正文摘录：先取「适用场景/何时使用/触发」相关段落，不足则顺延取开头
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return fields, body


def skill_pack(s, catalog_kind):
    fields, body = read_skill(s["name"])
    desc = (fields or {}).get("description", "")
    summ = (fields or {}).get("user_summary", "")
    excerpt = body[:1400] if body else ""
    return {
        "name": s["name"],
        "title": s["title"],
        "catalog": catalog_kind,
        "scenario": s.get("category", ""),
        "scenario_title": s.get("categoryTitle", ""),
        "sub": s.get("subcategory", ""),
        "summary_zh": s.get("summaryZh", "") or summ,
        "tool_gap": s.get("toolGap", ""),
        "installed": bool(fields),
        "description": desc[:900],
        "body_excerpt": excerpt,
        "existing": existing.get(s["name"], []),
    }


overseas = [skill_pack(s, "overseas") for s in cat["skills"]]
fs = [skill_pack(s, "fs") for s in cat["skillsFs"]]
json.dump(overseas + fs, open(os.path.join(OUT, "all-skills.json"), "w"), ensure_ascii=False, indent=1)

BATCH = 25
batches = [overseas[i:i + BATCH] for i in range(0, len(overseas), BATCH)]
batches.append(fs)

for i, b in enumerate(batches, 1):
    json.dump(
        {"batch": f"B{i:02d}", "count": len(b), "skills": b},
        open(os.path.join(OUT, "batches", f"B{i:02d}.json"), "w"),
        ensure_ascii=False, indent=1,
    )

missing = [s["name"] for s in overseas + fs if not s["installed"]]
print(f"岗位词表 {len(roles)}；责任名 {len(role_by_resp)}")
print(f"海外 {len(overseas)}（有既有映射 {sum(1 for s in overseas if s['existing'])}）"
      f" + AI全栈 {len(fs)}（有既有映射 {sum(1 for s in fs if s['existing'])}）")
print(f"批次 {len(batches)}：{[len(b) for b in batches]}")
print(f"SKILL.md 缺失 {len(missing)}：{missing[:10]}")
print(f"输出目录 {OUT}")
