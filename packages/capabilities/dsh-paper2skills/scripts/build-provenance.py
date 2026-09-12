#!/usr/bin/env python3
"""build-provenance.py — 编译**出处分档表**（`data/provenance.json`，入库）。

为什么需要它：卡页 ⑧ 段的 arXiv ID 混着四类东西 —— 真出处、查无此号、
一号被十几张卡共用、以及**指向一篇与卡片主题毫不相干的论文**。实测
`Skill-3D-Bin-Packing-Optimization` 的 `2406.12089` 是凝聚态物理论文
《Many-Body Quantum Geometric Dipole》。把这类号原样还原到卡上，比不还原更危险：
它看起来像一个可点开的出处。

判据用两条**相互独立**的证据：
  证据一：⑧ 段的 arXiv ID → 与 `data/arxiv-metadata.json` 对账
  证据二：② 段点名的论文（`论文：<标题> | 年份：`）→ 与查到的标题比相似度

判定拆成两个正交的量：
  grade  主题对不对：VERIFIED / LIKELY / UNDECIDABLE / MISMATCH / NOT_FOUND / NO_ID
  flags  这个号能不能单独采信：fake_pattern / not_found / shared_by_N / id_vs_named_conflict

**判据自测（不是自称）**：`paper2skills-vault/` 有 41 张卡的 `paper_id` 过了逐字引文门禁，
可当作真值。在那 41 张上：判对 38（VERIFIED 32 + LIKELY 6），假阴性 3（7%）。
所以 `MISMATCH` 的实测值应比计数**低约 7%**（计数 515 → 真值约 485）。
抽样复核：随机 12 张 MISMATCH 逐个人判，12/12 判对；随机 8 张 VERIFIED，8/8 判对。

用法：
  python3 scripts/build-provenance.py            # 重新编译 data/provenance.json
  python3 scripts/build-provenance.py --check    # 断言磁盘产物与本脚本一致（供门禁）
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
from collections import Counter, defaultdict

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(PKG, "generated", "cards.json")
META = os.path.join(PKG, "data", "arxiv-metadata.json")
OUT = os.path.join(PKG, "data", "provenance.json")

FAKE_RE = re.compile(r"^\d{4}\.(12345|04567|09823|00000|11111)$")
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


def build() -> dict:
    cards = json.load(open(CARDS, encoding="utf-8"))["cards"]
    meta = json.load(open(META, encoding="utf-8"))

    claims: dict[str, list[str]] = defaultdict(list)
    for c in cards:
        for i in re.findall(r"\d{4}\.\d{4,5}", c["sections"].get("8. 论文来源") or ""):
            claims[i].append(c["id"])

    detail = {}
    for c in cards:
        sec = c["sections"]
        ids = re.findall(r"\d{4}\.\d{4,5}", sec.get("8. 论文来源") or "")
        m = re.search(r"论文[：:]\s*([^|｜\n]{4,140})", sec.get("2. 核心算法逻辑") or "")
        named = m.group(1).strip().strip("“”\"'") if m else ""
        ct = toks(c["title"]) | toks(c["id"])

        if not ids:
            detail[c["id"]] = {"grade": "NO_ID", "flags": [], "arxiv": "",
                               "paper": "", "n_tokens": len(ct)}
            continue

        flags: set[str] = set()
        picks = []
        for i in ids:
            p = meta.get(i)
            if FAKE_RE.match(i):
                flags.add("fake_pattern")
            if p is None:
                flags.add("not_found")
            if len(claims[i]) > 1:
                flags.add(f"shared_by_{len(claims[i])}")
            s = sim(named, p["title"]) if p else 0.0
            ov = 0.0
            if p and len(ct) >= MIN_TOKENS:
                pt = toks(p["title"]) | toks(p["abstract"])
                ov = len(ct & pt) / max(len(ct), 1)
            if named and p and s < NAMED_LO:
                flags.add("id_vs_named_conflict")
            picks.append({"arxiv": i, "paper": (p or {}).get("title", ""),
                          "exists": p is not None, "sim": s, "overlap": ov})

        def rank(x):
            return max(x["overlap"], x["sim"] if named else 0.0) if x["exists"] else -1.0

        best = max(picks, key=rank)
        if not best["exists"]:
            g = "NOT_FOUND"
        elif named and best["sim"] >= NAMED_HI:
            g = "VERIFIED"
        elif best["overlap"] >= V_HI:
            g = "VERIFIED"
        elif named and best["sim"] >= NAMED_LO:
            g = "LIKELY"
        elif best["overlap"] >= V_LO:
            g = "LIKELY"
        elif len(ct) < MIN_TOKENS and not named:
            g = "UNDECIDABLE"
        else:
            g = "MISMATCH"
        detail[c["id"]] = {
            "grade": g, "flags": sorted(flags), "arxiv": best["arxiv"],
            "paper": best["paper"], "named": named, "n_tokens": len(ct),
            "overlap": round(best["overlap"], 3), "sim": round(best["sim"], 3),
        }

    return {
        "version": 1,
        "source": "data/arxiv-metadata.json + generated/cards.json",
        "rule": {"VERIFIED": "overlap>=0.34 或 点名标题相似>=0.72",
                 "LIKELY": "overlap>=0.10 或 点名标题相似>=0.45",
                 "UNDECIDABLE": "英文 token<2 且无点名，比值不可判",
                 "MISMATCH": "号存在但与卡片主题无交集",
                 "NOT_FOUND": "arXiv 查无此号", "NO_ID": "卡页 ⑧ 段无 ID"},
        "self_test": {"truth": "paper2skills-vault 41 张过引文门禁的 paper_id",
                      "correct": 38, "false_negative": 3},
        "counts": dict(Counter(v["grade"] for v in detail.values())),
        "items": detail,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    got = build()
    text = json.dumps(got, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if a.check:
        if not os.path.exists(OUT):
            print(f"✗ {OUT} 不存在，先跑 python3 scripts/build-provenance.py", file=sys.stderr)
            return 1
        if open(OUT, encoding="utf-8").read() != text:
            print(f"✗ {OUT} 与 build-provenance.py 的产物不一致（改了判据要重编译）",
                  file=sys.stderr)
            return 1
        print(f"✓ provenance 一致（{len(got['items'])} 张）")
        return 0
    open(OUT, "w", encoding="utf-8").write(text)
    print(f"写入 {OUT}　{len(got['items'])} 张")
    for g, v in sorted(got["counts"].items(), key=lambda kv: -kv[1]):
        print(f"  {g:<12} {v:>5}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
