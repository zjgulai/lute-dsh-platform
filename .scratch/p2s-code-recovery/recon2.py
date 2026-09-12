#!/usr/bin/env python3
"""侦察二：iCloud paper2skills-code 树是「同一代」还是「后一代脚手架」？

判据（可证伪）：
  - 若树是预览那一代，预览里的 def/class 名应普遍命中 → 已否（7%）。
  - 若树是后一代脚手架，应普遍含脚手架标记串，且各 skill 目录结构同构。
再查：有没有备份 / 归档 / git 历史能拿回预览那一代。
"""
import json, os, re, collections, subprocess

PB = "/Users/lute/project/paper_to_skills/playbook/assets/playbook-data.json"
IC = "/Users/lute/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills"
CODE = os.path.join(IC, "paper2skills-code")

d = json.load(open(PB))
skills = d["skills"]
dirs = sorted({s["code_path"] for s in skills if s.get("code_path")})
base = os.path.basename  # noqa

SCAFFOLD = [
    "Core algorithm implementation",
    "def run_analysis(data)",
    "def generate_",  # 前缀
    "测试通过",
]

rows = []
for p in dirs:
    full = os.path.join(IC, p)
    pys, total_lines, blob = [], 0, ""
    for root, _, files in os.walk(full):
        for f in files:
            if f.endswith(".py"):
                fp = os.path.join(root, f)
                t = open(fp, encoding="utf-8", errors="replace").read()
                pys.append(os.path.relpath(fp, full))
                total_lines += t.count("\n")
                blob += t
    marks = sum(1 for m in SCAFFOLD[:2] if m in blob)
    rows.append({
        "path": p, "n_py": len(pys), "lines": total_lines,
        "files": sorted(pys), "scaffold": marks == 2,
        "has_docstring_author": "Author: paper2skills" in blob,
    })

n = len(rows)
scaf = sum(1 for r in rows if r["scaffold"])
auth = sum(1 for r in rows if r["has_docstring_author"])
print(f"=== iCloud 树：{n} 个 skill 目录 ===")
print(f"含脚手架标记('Core algorithm implementation' + 'def run_analysis(data)')：{scaf}/{n} ({scaf/n*100:.1f}%)")
print(f"含 'Author: paper2skills' 抬头：{auth}/{n}")
print()

# 文件清单是常量吗？
sig = collections.Counter(tuple(r["files"]) for r in rows)
print("目录内文件清单的形态分布（前 8）：")
for k, v in sig.most_common(8):
    print(f"  {v:5d}  {list(k)}")
print()

nl = collections.Counter(r["lines"] for r in rows)
print("目录内 .py 总行数分布（前 8）：")
for k, v in nl.most_common(8):
    print(f"  {v:5d}  行数={k}")
print()

# 行数是否与预览对得上？
prev = {s["skill_id"]: s.get("code_preview") or "" for s in skills}
by_path = collections.defaultdict(list)
for s in skills:
    if s.get("code_path"):
        by_path[s["code_path"]].append(s)
match_longer = sum(1 for r in rows if r["lines"] > 60)
print(f"树里 .py 总行数 > 60 的目录：{match_longer}/{n}")
tot = sum(r["lines"] for r in rows)
print(f"树里代码总行数：{tot:,}  · 预览总字符 {sum(len(v) for v in prev.values()):,}")

print("\n=== 备份 / 归档 / 版本历史线索 ===")
for probe in ["git -C", "bak", "tar", "zip"]:
    pass
r = subprocess.run(["bash", "-lc",
    f'find "{IC}" -maxdepth 4 \\( -name "*.bak" -o -name "*.tar*" -o -name "*.zip" -o -name "*.orig" \\) '
    f'-not -path "*/.venv/*" -not -path "*/__pycache__/*" 2>/dev/null | head -20'],
    capture_output=True, text=True)
print("归档/备份候选：")
print(r.stdout or "  （无）")

r = subprocess.run(["bash", "-lc", f'ls -d "{IC}/.git" 2>&1; ls -d "{CODE}/.git" 2>&1'],
                   capture_output=True, text=True)
print("git 仓库：")
print(r.stdout, r.stderr)
