#!/usr/bin/env python3
"""复现上一轮的「787/805 悬空」，并对照 iCloud 全树，定位误差来源。

上一轮结论：卡里 `路径：` 指针 787/805 悬空（源树只有 199 个 .py）。
本轮假设：那个 805/787 是拿**本地残缺副本**当基准量出来的。
"""
import json, os, re

PB = "/Users/lute/project/paper_to_skills/playbook/assets/playbook-data.json"
LOCAL = "/Users/lute/project/paper_to_skills"                      # 本地副本（少量 .py）
IC = "/Users/lute/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills"  # iCloud 全量

d = json.load(open(PB))
skills = d["skills"]

paths = [s["code_path"] for s in skills if s.get("code_path")]
uniq = sorted(set(paths))
print(f"带 code_path 的卡 {len(paths)} · 去重路径 {len(uniq)}\n")

def resolve(root):
    ok = sum(1 for p in uniq if os.path.isdir(os.path.join(root, p)))
    return ok, len(uniq) - ok

for label, root in [("本地 /Users/lute/project/paper_to_skills", LOCAL),
                    ("iCloud Mobile Documents", IC)]:
    if not os.path.isdir(os.path.join(root, "paper2skills-code")):
        print(f"{label}: 无 paper2skills-code")
        continue
    n_py = sum(1 for r, _, fs in os.walk(os.path.join(root, "paper2skills-code"))
               for f in fs if f.endswith(".py"))
    ok, bad = resolve(root)
    print(f"{label}")
    print(f"   树内 .py = {n_py}")
    print(f"   解析成功 {ok}/{len(uniq)}   悬空 {bad}")
    print()

# 本地是不是 iCloud 的子集？
def dirs(root):
    base = os.path.join(root, "paper2skills-code")
    out = set()
    for top in os.listdir(base):
        tp = os.path.join(base, top)
        if os.path.isdir(tp) and top != "__pycache__":
            for s in os.listdir(tp):
                if os.path.isdir(os.path.join(tp, s)):
                    out.add(f"{top}/{s}")
    return out

L, I = dirs(LOCAL), dirs(IC)
print("=== 两棵树的关系 ===")
print(f"  本地 skill 目录 {len(L)} · iCloud {len(I)}")
print(f"  本地独有（iCloud 没有）: {len(L - I)}")
print(f"  差集样本: {sorted(L - I)[:5]}")
print(f"  iCloud 独有: {len(I - L)}")
