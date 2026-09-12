#!/usr/bin/env python3
"""侦察三：卡里的预览代码，在整个 iCloud 代码树里还剩多少？

把「代码树能不能补全预览」这件事量化，而不是靠一两个字符串下结论。
产出两代目录的对照 + 预览名的全树召回率。
"""
import json, os, re, collections

PB = "/Users/lute/project/paper_to_skills/playbook/assets/playbook-data.json"
IC = "/Users/lute/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills"
CODE = os.path.join(IC, "paper2skills-code")

d = json.load(open(PB))
skills = d["skills"]

# ---------- 1. 两代目录盘点 ----------
NUM = re.compile(r"^\d\d-")
gen = collections.Counter()
dirs_by_gen = collections.defaultdict(list)
for top in sorted(os.listdir(CODE)):
    p = os.path.join(CODE, top)
    if not os.path.isdir(p) or top in ("__pycache__", ".venv", "services"):
        continue
    g = "numbered(旧富代码)" if NUM.match(top) else "plain(新脚手架)"
    subs = [s for s in os.listdir(p) if os.path.isdir(os.path.join(p, s))]
    gen[g] += len(subs)
    for s in subs:
        dirs_by_gen[g].append(f"{top}/{s}")
print("=== 目录两代盘点 ===")
for k, v in gen.items():
    print(f"  {k:22s} {v} 个 skill 目录")
print(f"  services/ 另计\n")

# ---------- 2. 目录内容代表性命中 ----------
def read_dir(full):
    blob = ""
    for root, _, files in os.walk(full):
        for f in files:
            if f.endswith(".py"):
                blob += open(os.path.join(root, f), encoding="utf-8", errors="replace").read()
    return blob

def names(t):
    return set(re.findall(r"^\s*(?:def|class)\s+([A-Za-z_]\w*)", t, re.M))

for g, lst in dirs_by_gen.items():
    lens, scaf = [], 0
    for rel in lst:
        b = read_dir(os.path.join(CODE, rel))
        lens.append(b.count("\n"))
        if "Core algorithm implementation" in b and "def run_analysis(data)" in b:
            scaf += 1
    lens.sort()
    print(f"=== {g} 抽样全量 {len(lst)} 个 ===")
    print(f"  .py 总行数：中位 {lens[len(lens)//2]} · 最大 {max(lens)} · >200 行的 {sum(1 for x in lens if x>200)}")
    print(f"  脚手架命中：{scaf}/{len(lst)} ({scaf/len(lst)*100:.0f}%)")
    print()

# ---------- 3. 预览名的全树召回率 ----------
print("=== 建全树名字索引 ===")
index = collections.defaultdict(set)
nfile = 0
for root, dirs, files in os.walk(CODE):
    dirs[:] = [x for x in dirs if x not in ("__pycache__", ".venv")]
    for f in files:
        if not f.endswith(".py"):
            continue
        fp = os.path.join(root, f)
        try:
            t = open(fp, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        nfile += 1
        for nm in names(t):
            index[nm].add(fp)
print(f"  扫到 {nfile} 个 .py · 索引 {len(index)} 个不同 def/class 名\n")

common = {"__init__", "main", "run", "get", "set", "fit", "predict", "forward", "generate_data"}
tot_cards = tot_names = tot_hit = 0
hist = collections.Counter()
full_hit = partial = zero = 0
examples = []
for s in skills:
    pv = s.get("code_preview") or ""
    pn = names(pv) - common
    if not pn:
        continue
    hit = {n for n in pn if n in index}
    tot_cards += 1
    tot_names += len(pn)
    tot_hit += len(hit)
    r = len(hit) / len(pn)
    hist[min(10, int(r * 10))] += 1
    if r == 1.0:
        full_hit += 1
    elif r == 0:
        zero += 1
        if len(examples) < 6:
            examples.append((s["skill_id"], sorted(pn)[:3]))
    else:
        partial += 1

print("=== 预览里的 def/class 名，在整棵代码树中的召回 ===")
print(f"  参与统计 {tot_cards} 张卡 · 名字 {tot_names:,} 个 · 命中 {tot_hit:,} 个"
      f" → 总召回 {tot_hit/tot_names*100:.1f}%")
print(f"  全部命中 {full_hit} · 部分命中 {partial} · 零命中 {zero}")
print("  分布（召回率十分位 → 卡数）：")
for k in sorted(hist):
    print(f"    {k*10:3d}%-{k*10+9:3d}%  {hist[k]:5d}")
print("  零命中样本：")
for sid, ex in examples:
    print(f"    {sid[:44]:44s} {ex}")
