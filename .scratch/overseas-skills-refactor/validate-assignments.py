#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase A-3：机械校验「技能→岗位」判定产物（只读，不看解释只查事实）。

判据全部是确定性的：
  1. 覆盖：assignments 与批次输入同序同集（不增不删不重名）
  2. 词表：岗位 id 在 roles.json；responsibility 逐字属于该岗位三条之一
  3. 防伪造：from_skill / from_role 必须是两侧原文的连续子串
  4. 一致性：≥3 岗不得 high；roles 为空必须写 no_role_reason；drop_reasons 必须指向既有映射
用法：python3 validate-assignments.py [B01 B02 ...]（缺省校验全部已产出的批次）
"""
import json
import os
import sys
import collections

ROOT = "/Users/lute/project/Magpie-Horch"
BASE = os.path.join(ROOT, ".scratch/overseas-skills-refactor")
EV = os.path.join(BASE, "evidence")
ASG = os.path.join(BASE, "assignments")

roles = json.load(open(os.path.join(EV, "roles.json")))
role_by_id = {r["id"]: r for r in roles}


def role_text(r):
    return "\n".join([r["mission"], r["artifact"]] + list(r["responsibilities"]) + [r["alias"], r["title"], r["boundary"]])


def skill_text(s):
    return "\n".join([s["title"], s["summary_zh"], s["description"], s["body_excerpt"]])


def batches():
    d = os.path.join(EV, "batches")
    return sorted(f[:-5] for f in os.listdir(d) if f.endswith(".json"))


def validate(bid):
    errs, warns = [], []
    inp_path = os.path.join(EV, "batches", f"{bid}.json")
    out_path = os.path.join(ASG, f"{bid}.json")
    if not os.path.exists(out_path):
        return None, [f"{bid}: 未产出"], []
    inp = json.load(open(inp_path))
    try:
        out = json.load(open(out_path))
    except Exception as e:
        return None, [f"{bid}: JSON 解析失败 {e}"], []

    if out.get("batch") != bid:
        errs.append(f"{bid}: batch 字段为 {out.get('batch')!r}")
    skills = inp["skills"]
    asg = out.get("assignments", [])
    if [a.get("name") for a in asg] != [s["name"] for s in skills]:
        errs.append(f"{bid}: 技能集合/顺序不一致（输入 {len(skills)}，输出 {len(asg)}）")
        got, want = {a.get("name") for a in asg}, {s["name"] for s in skills}
        if got - want:
            errs.append(f"{bid}: 多出 {sorted(got - want)[:5]}")
        if want - got:
            errs.append(f"{bid}: 缺失 {sorted(want - got)[:5]}")
    by_name = {s["name"]: s for s in skills}

    stat = collections.Counter()
    role_hits = collections.Counter()
    for a in asg:
        name = a.get("name")
        s = by_name.get(name)
        if s is None:
            continue
        stext = skill_text(s)
        rs = a.get("roles") or []
        seen = set()
        for r in rs:
            rid = r.get("id")
            if rid not in role_by_id:
                errs.append(f"{bid}/{name}: 未知岗位 {rid!r}")
                continue
            if rid in seen:
                errs.append(f"{bid}/{name}: 岗位重复 {rid}")
            seen.add(rid)
            role_hits[rid] += 1
            resp = r.get("responsibility", "")
            if resp and resp not in role_by_id[rid]["responsibilities"]:
                errs.append(f"{bid}/{name}/{rid}: 责任名 {resp!r} 不在该岗三条之内")
            if not resp:
                warns.append(f"{bid}/{name}/{rid}: responsibility 为空")
            for side, text, key in (("from_skill", stext, "from_skill"), ("from_role", role_text(role_by_id[rid]), "from_role")):
                q = r.get(key) or ""
                if len(q) < 4 or len(q) > 30 or "\n" in q or '"' in q or "`" in q:
                    errs.append(f"{bid}/{name}/{rid}: {side} 形式不合规（{q!r}）")
                elif q not in text:
                    errs.append(f"{bid}/{name}/{rid}: {side} 不是原文子串（{q!r}）")
            if r.get("confidence") not in ("high", "medium", "low"):
                errs.append(f"{bid}/{name}/{rid}: confidence 非法 {r.get('confidence')!r}")
        if len(rs) >= 3:
            for r in rs:
                if r.get("confidence") == "high":
                    errs.append(f"{bid}/{name}: {len(rs)} 岗却标 high（{r.get('id')}）")
        if not rs:
            stat["无岗"] += 1
            if not a.get("no_role_reason"):
                errs.append(f"{bid}/{name}: 无岗却未写 no_role_reason")
            if a.get("no_role_kind") not in ("GENERIC_METHOD", "TOOL_ONLY", "OUT_OF_SCOPE", "OTHER"):
                errs.append(f"{bid}/{name}: no_role_kind 非法 {a.get('no_role_kind')!r}")
        else:
            stat["有岗"] += 1
            stat["挂载数"] += len(rs)
        # 既有映射的去留
        ex = {(e["role"], e["responsibility"]) for e in s["existing"] if e["role"]}
        kept = {(r.get("id"), r.get("responsibility", "")) for r in rs}
        dropped_roles = sorted({e[0] for e in ex if e[0] not in {k[0] for k in kept}})
        dr = {d.get("id") for d in (a.get("drop_reasons") or [])}
        for rid in dropped_roles:
            if rid not in dr:
                errs.append(f"{bid}/{name}: 静默删除既有映射 {rid}（未写 drop_reasons）")
        for rid in dr - {e[0] for e in ex}:
            errs.append(f"{bid}/{name}: drop_reasons 指向不存在的既有映射 {rid}")
    return stat, errs, warns


def main():
    want = sys.argv[1:] or batches()
    total = collections.Counter()
    all_err, all_warn = [], []
    for bid in want:
        stat, errs, warns = validate(bid)
        if stat is None:
            all_err += errs
            print(f"{bid}: ✗ {errs[0] if errs else ''}")
            continue
        total.update(stat)
        all_err += errs
        all_warn += warns
        flag = "✓" if not errs else "✗"
        print(f"{bid}: {flag} 有岗 {stat['有岗']} / 无岗 {stat['无岗']} / 挂载 {stat['挂载数']}"
              + (f" / 警告 {len(warns)}" if warns else "")
              + (f" / 错误 {len(errs)}" if errs else ""))
    print(f"\n合计：有岗 {total['有岗']} / 无岗 {total['无岗']} / 挂载 {total['挂载数']}")
    for e in all_err[:40]:
        print("  ✗", e)
    if len(all_err) > 40:
        print(f"  ... 另有 {len(all_err) - 40} 条")
    for w in all_warn[:10]:
        print("  ⚠", w)
    sys.exit(1 if all_err else 0)


main()
