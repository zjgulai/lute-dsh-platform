#!/usr/bin/env python3
"""对我方产出卡（staging/**/SKILL.md）量化 ⑦ 代码段，作为 ADR 的证据表。

只读。回答：
  E1 ⑦ 段里 `路径：` 声明的形态（多少张在声明一个代码位置）
  E2 节选行数分布 —— 是否硬顶在 60
  E3 节选能否 ast.parse（不能 = 读者复制即 SyntaxError）
  E4 `代码块数量：N` 声明 vs 实际围栏数
"""
import ast, collections, glob, json, os, re, sys

ROOT = "/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills/staging"
files = [p for p in glob.glob(f"{ROOT}/**/SKILL.md", recursive=True) if "/backup/" not in p]
print(f"卡 {len(files)} 张\n")

SEC = re.compile(r"^## ⑦[^\n]*\n(.*?)(?=^## ⑧|\Z)", re.S | re.M)
META = re.compile(r"代码块数量：\s*(\d+)\s*·\s*路径：\s*(\S*)")
FENCE = re.compile(r"```(\w*)\n(.*?)\n```", re.S)

n_sec = n_path = n_undetected = 0
lens = []
cnt_declared = collections.Counter()
parses = collections.Counter()
fence_counts = collections.Counter()
undetected = []
declare_full = 0   # 声明了一个具体代码路径
for fp in files:
    t = open(fp, encoding="utf-8", errors="replace").read()
    m = SEC.search(t)
    if not m:
        continue
    n_sec += 1
    body = m.group(1)
    mm = META.search(body)
    if mm:
        n_path += 1
        cnt_declared[int(mm.group(1))] += 1
        p = mm.group(2)
        if p.startswith("未检测到") or p in ("", "—"):
            n_undetected += 1
            undetected.append(os.path.basename(os.path.dirname(fp)))
        else:
            declare_full += 1
    fs = FENCE.findall(body)
    fence_counts[len(fs)] += 1
    # 取最大的 python 围栏做语法检查（nlargest 用行数）
    py = [c for lang, c in fs if lang in ("python", "py")]
    if not py:
        continue
    code = max(py, key=lambda c: c.count("\n"))
    lens.append(code.count("\n") + 1)
    try:
        ast.parse(code)
        parses["ok"] += 1
    except SyntaxError:
        parses["SyntaxError"] += 1
    except Exception as e:  # noqa: BLE001
        parses[f"other:{type(e).__name__}"] += 1

print(f"E1 ⑦ 段存在：{n_sec}/{len(files)}")
print(f"   段内声明 `路径：`：{n_path}")
print(f"     其中 `未检测到`：{n_undetected}")
print(f"     指向具体代码路径：{declare_full}  ← 这些卡在向读者承诺一个代码位置")
print(f"   `代码块数量：N` 分布：{dict(cnt_declared.most_common(6))}")

print(f"\nE2 节选行数：计数 {len(lens)}")
if lens:
    lens.sort()
    c = collections.Counter(lens)
    print(f"   min={lens[0]} 中位={lens[len(lens)//2]} max={lens[-1]}")
    print(f"   ==60 行（顶到源站上限）：{c[60]}   合计占比 {c[60]/len(lens)*100:.1f}%")
    print(f"   行数分布 top8：{c.most_common(8)}")

print(f"\nE3 语法检查（最大 python 围栏）：{dict(parses)}")
if parses.get("ok"):
    print(f"   可解析率 {parses['ok']/(parses['ok']+parses.get('SyntaxError',0))*100:.1f}%")

print(f"\nE4 每卡围栏数分布：{dict(fence_counts.most_common(6))}")
