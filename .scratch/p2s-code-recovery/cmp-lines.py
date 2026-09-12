#!/usr/bin/env python3
"""对照：playbook-data.json 的 code_preview 行数 vs 我方 cards.json 抽出的代码行数。

若我方系统性少行，说明抽取环节又丢了一次内容（静默截断），必须修。
"""
import json, os, re, collections

PKG = "/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills"
PB = "/Users/lute/project/paper_to_skills/playbook/assets/playbook-data.json"

cards = {c["id"]: c for c in json.load(open(f"{PKG}/generated/cards.json"))["cards"]}
pb = {s["skill_id"]: s for s in json.load(open(PB))["skills"]}

META = re.compile(r"代码块数量：\s*(\d+)\s*·\s*路径：\s*(\S*)")

def our_body(sec):
    lines = sec.split("\n")
    if len(lines) <= 3:
        return None
    code = "\n".join(lines[3:])
    code = re.sub(r"^\n+|\n+$", "", code)
    return code

diff = collections.Counter()
examples = []
n_ours = n_pb = 0
ours60 = pb60 = 0
for cid, c in cards.items():
    sec = (c.get("sections") or {}).get("7. 代码模板") or ""
    p = pb.get(cid)
    if not p or not p.get("code_preview"):
        continue
    b = our_body(sec)
    if b is None:
        continue
    lo = len(b.split("\n"))
    lp = len(p["code_preview"].split("\n"))
    n_ours += lo
    n_pb += lp
    if lo == 60:
        ours60 += 1
    if lp == 60:
        pb60 += 1
    d = lo - lp
    diff[d] += 1
    if d != 0 and len(examples) < 8:
        examples.append((cid, lp, lo, repr(p["code_preview"][-60:]), repr(b[-60:])))

tot = sum(diff.values())
print(f"可比对 {tot} 张")
print(f"  行数差分布（我方 - playbook）：{dict(sorted(diff.items())[:12])}")
print(f"  ==60 行：我方 {ours60} · playbook {pb60}")
print()
for cid, lp, lo, ep, eb in examples:
    print(f"  {cid[:44]:44s} pb={lp:3d} ours={lo:3d}")
    print(f"      pb 尾: {ep}")
    print(f"    我方尾: {eb}")
