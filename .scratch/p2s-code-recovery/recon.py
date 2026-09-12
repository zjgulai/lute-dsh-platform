#!/usr/bin/env python3
"""路径乙 · 下一入口侦察：卡里的代码预览 与 iCloud paper2skills-code 树 是什么关系。

只读。回答三个问题：
 Q1 卡的 code_path 在 iCloud 树里能解析到多少？
 Q2 解析到的目录里，代码内容与卡里的预览是同一份吗？
 Q3 若是同一份，预览的 60 行截断能否用树里的完整文件补全？
"""
import json, os, re, sys, collections

PB = "/Users/lute/project/paper_to_skills/playbook/assets/playbook-data.json"
IC = "/Users/lute/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills"

d = json.load(open(PB))
skills = d["skills"]
print(f"技能卡 {len(skills)} 张\n")

# ---------- Q1 解析率 ----------
no_path = [s for s in skills if not s.get("code_path")]
paths = [s["code_path"] for s in skills if s.get("code_path")]
uniq = sorted(set(paths))
print(f"Q1 路径指针：{len(paths)} 条（去重 {len(uniq)}）· 缺失 {len(no_path)}")

resolved_dir, resolved_py, unresolved = 0, 0, []
for p in uniq:
    full = os.path.join(IC, p)
    if os.path.isdir(full):
        resolved_dir += 1
        if any(f.endswith(".py") for f in os.listdir(full)):
            resolved_py += 1
    else:
        unresolved.append(p)
print(f"   目录存在   {resolved_dir}/{len(uniq)}  ({resolved_dir/len(uniq)*100:.1f}%)")
print(f"   含 .py     {resolved_py}/{len(uniq)}")
print(f"   未解析     {len(unresolved)}")
for p in unresolved[:10]:
    print(f"      · {p}")

# ---------- Q2 内容是否同一份 ----------
# 判据：预览里出现的 def/class 名，在对应目录的 .py 里能找到几个
def names(code):
    return set(re.findall(r"^\s*(?:def|class)\s+([A-Za-z_]\w*)", code, re.M))

import random
random.seed(42)
sample = [s for s in skills if s.get("code_path") and s.get("code_preview")]
random.shuffle(sample)
sample = sample[:120]

same, diff, empty = 0, 0, 0
per = []
for s in sample:
    full = os.path.join(IC, s["code_path"])
    if not os.path.isdir(full):
        continue
    blob = ""
    for root, _, files in os.walk(full):
        for f in files:
            if f.endswith(".py"):
                blob += open(os.path.join(root, f), encoding="utf-8", errors="replace").read()
    pn = names(s["code_preview"])
    if not pn:
        empty += 1
        continue
    hit = pn & names(blob)
    per.append((s["skill_id"], len(pn), len(hit), sorted(pn)[:4]))
    if len(hit) >= max(1, len(pn) // 2):
        same += 1
    else:
        diff += 1

print(f"\nQ2 抽样 {len(per)} 张（对照 def/class 名）")
print(f"   多数命中(同一份)  {same}")
print(f"   基本不命中(不同份) {diff}")
print(f"   预览无 def/class  {empty}")
print("   样本明细：")
for sid, n, h, ex in per[:14]:
    print(f"     {h:2d}/{n:2d}  {sid[:46]:46s} 例:{ex}")

# ---------- Q3 截断能否补全 ----------
def phys_lines(t):
    return len(t.split("\n"))

prev_lines = [phys_lines(s["code_preview"]) for s in skills if s.get("code_preview")]
cap = sum(1 for n in prev_lines if n >= 60)
print(f"\nQ3 预览物理行数：max={max(prev_lines)} · ==60 的 {cap} 张 · >60 的 {sum(1 for n in prev_lines if n > 60)} 张")
print(f"   预览总字符：{sum(len(s['code_preview']) for s in skills if s.get('code_preview')):,}")
