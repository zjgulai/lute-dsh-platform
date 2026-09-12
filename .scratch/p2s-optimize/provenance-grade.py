#!/usr/bin/env python3
"""p2s 卡出处分档（只读，产物落 .scratch/provenance.json）。

对每张带 arXiv ID 的卡，用**两条相互独立的证据**判定：
  证据一：⑧ 段写的 arXiv ID → 打 arXiv 查实（arxiv/metadata.json）
  证据二：② 段点名的论文（`论文：<标题> | 年份：`，217 张）→ 与查到的标题比相似度

判定拆成两个**正交**的量，不揉成一个分：
  grade  主题对不对：VERIFIED / LIKELY / UNDECIDABLE / MISMATCH
  flags  这个号能不能单独采信：not_found / fake_pattern / shared_by / id_vs_named_conflict

为什么要拆：一张卡可以「正文点名的论文是真的」而「⑧ 的 ID 指的是另一篇」
（实测 `Skill-AI-Generated-Content-Watermarking` 点名 HiDDeN: Hiding Data With Deep
Networks，ID 却是 1801.00926《Joint Optic Disc and Cup Segmentation》）。
揉成一个「可信度总分」会把这一层直接抹掉。
"""
from __future__ import annotations

import difflib
import json
import os
import re
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
CARDS = ("/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills/"
         "generated/cards.json")
META = os.path.join(ROOT, "arxiv", "metadata.json")
OUT = os.path.join(ROOT, "provenance.json")

FAKE_RE = re.compile(r"^\d{4}\.(12345|04567|09823|00000|11111)$")
# 只判「主题对不对」，故词表保守；判定所需的英文 token 数下限
MIN_TOKENS = 2
V_HI, V_LO = 0.34, 0.10
NAMED_HI, NAMED_LO = 0.72, 0.45

STOP = set("""a an the of for and to in with on at by from as is are was were be been
using use used based via towards toward new novel approach method model models framework
system systems learning deep neural network networks analysis study paper skill
data driven end""".split())


def toks(s: str) -> set[str]:
    out = set()
    for w in re.findall(r"[a-zA-Z][a-zA-Z0-9\-]{2,}", (s or "").lower()):
        w = w.strip("-")
        if len(w) < 3 or w in STOP:
            continue
        out.add(w[:-1] if len(w) > 4 and w.endswith("s") else w)
    return out


def sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


def main() -> int:
    cards = json.load(open(CARDS, encoding="utf-8"))["cards"]
    meta = json.load(open(META, encoding="utf-8"))

    claims: dict[str, list[str]] = defaultdict(list)
    for c in cards:
        for i in re.findall(r"\d{4}\.\d{4,5}", c["sections"].get("8. 论文来源") or ""):
            claims[i].append(c["id"])

    grade = Counter()
    flag = Counter()
    detail = []
    for c in cards:
        sec = c["sections"]
        ids = re.findall(r"\d{4}\.\d{4,5}", sec.get("8. 论文来源") or "")
        m = re.search(r"论文[：:]\s*([^|｜\n]{4,140})", sec.get("2. 核心算法逻辑") or "")
        named = m.group(1).strip().strip("“”\"'") if m else ""
        ct = toks(c["title"]) | toks(c["id"])

        row = {"id": c["id"], "title": c["title"], "src": c.get("src_domain", ""),
               "ids": ids, "named": named, "n_tokens": len(ct),
               "flags": [], "picks": []}
        if not ids:
            row.update(grade="NO_ID", why="卡页 ⑧ 段无 arXiv ID")
            grade["NO_ID"] += 1
            detail.append(row)
            continue

        for i in ids:
            p = meta.get(i)
            f = []
            if FAKE_RE.match(i):
                f.append("fake_pattern")
            if p is None:
                f.append("not_found")
            if len(claims[i]) > 1:
                f.append(f"shared_by_{len(claims[i])}")
            s = sim(named, p["title"]) if p else 0.0
            ov = 0.0
            if p and len(ct) >= MIN_TOKENS:
                pt = toks(p["title"]) | toks(p["abstract"][:1200])
                ov = len(ct & pt) / max(len(ct), 1)
            if named and p and s < NAMED_LO:
                f.append("id_vs_named_conflict")
            row["flags"] += f
            row["picks"].append({"arxiv": i, "paper": (p or {}).get("title", ""),
                                 "named": named, "sim": round(s, 3),
                                 "overlap": round(ov, 3),
                                 "exists": p is not None, "flags": f})

        # 取最好的一条 ID（按主题吻合度排序，平手时取无 not_found 的）
        def rank(x):
            if not x["exists"]:
                return -1.0
            return max(x["overlap"], x["sim"] if x["named"] else 0.0)

        best = max(row["picks"], key=rank)
        row["arxiv"] = best["arxiv"]
        row["paper"] = best["paper"]
        row["overlap"], row["sim"] = best["overlap"], best["sim"]
        row["flags"] = sorted(set(row["flags"]))

        if not best["exists"]:
            row.update(grade="NOT_FOUND", why=f"{best['arxiv']} 在 arXiv 查无此号")
        elif best["named"] and best["sim"] >= NAMED_HI:
            row.update(grade="VERIFIED", why=f"卡内点名论文与 {best['arxiv']} 标题相似 {best['sim']:.2f}")
        elif best["overlap"] >= V_HI:
            row.update(grade="VERIFIED", why=f"标题词重合 {best['overlap']:.2f}")
        elif best["named"] and best["sim"] >= NAMED_LO:
            row.update(grade="LIKELY", why=f"卡内点名相似 {best['sim']:.2f}")
        elif best["overlap"] >= V_LO:
            row.update(grade="LIKELY", why=f"标题词重合 {best['overlap']:.2f}")
        elif len(ct) < MIN_TOKENS and not best["named"]:
            row.update(grade="UNDECIDABLE",
                       why=f"卡片英文 token 仅 {len(ct)} 个，比值不可判（须人判）")
        else:
            row.update(grade="MISMATCH",
                       why=f"{best['arxiv']}《{best['paper'][:44]}》与卡片主题无交集")
        grade[row["grade"]] += 1
        for f in row["flags"]:
            flag[f.split("_by_")[0] if f.startswith("shared") else f] += 1
        detail.append(row)

    json.dump({"grade": dict(grade), "flags": dict(flag),
               "shared": {k: v for k, v in claims.items() if len(v) > 1},
               "detail": detail},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    n = len(cards)
    print(f"卡 {n}")
    print("\n== grade：主题对不对 ==")
    for g in ("VERIFIED", "LIKELY", "UNDECIDABLE", "MISMATCH", "NOT_FOUND", "NO_ID"):
        v = grade[g]
        print(f"  {g:<12} {v:>5}  ({v * 100 // n}%)")
    print("\n== flags：这个号能不能单独采信（可叠加）==")
    for k, v in sorted(flag.items(), key=lambda kv: -kv[1]):
        print(f"  {k:<24} {v:>5}")
    print()
    for g in ("VERIFIED", "LIKELY", "UNDECIDABLE", "MISMATCH"):
        print(f"== {g} 例 ==")
        for d in [x for x in detail if x["grade"] == g][:4]:
            print(f"  {d['id'][:40]:<40} {d['arxiv']:<11} {d['why'][:62]}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
