#!/usr/bin/env python3
"""量化 p2s 卡语料里「模板填充」与「专属内容」的比例。

思路：把每张卡切成段落，跨卡统计同一段落的出现次数。
同一段落在 N 张卡里逐字出现 → 它是模板，不是这张卡的知识。
只读，不写盘。
"""
from __future__ import annotations

import glob
import os
import re
import sys
from collections import Counter, defaultdict

SKILLS = os.path.expanduser("~/.dsh/skills")
FM_RE = re.compile(r"^---\n.*?\n---\n", re.S)
SEC_RE = re.compile(r"^##\s+(.+?)\s*$", re.M)


def load(path: str):
    raw = open(path, encoding="utf-8").read()
    m = FM_RE.match(raw)
    body = raw[m.end():] if m else raw
    return raw, body


def split_sections(body: str):
    out = []
    marks = list(SEC_RE.finditer(body))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        out.append((m.group(1).strip(), body[m.end():end]))
    return out


def paras(text: str, minlen: int = 24):
    """粗切成块：按空行/列表项边界切；忽略代码与表格。"""
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"^\s*\|.*$", "", text, flags=re.M)
    chunks = []
    for blk in re.split(r"\n\s*\n", text):
        for line in re.split(r"\n(?=\s*[-*]\s|\s*\d+\.\s)", blk):
            s = re.sub(r"\s+", " ", line).strip()
            s = re.sub(r"^\s*[-*]\s*", "", s)
            if len(s) >= minlen:
                chunks.append(s)
    return chunks


def main() -> int:
    paths = sorted(glob.glob(os.path.join(SKILLS, "p2s-*/SKILL.md")))
    n = len(paths)

    para_cards: dict[str, set[str]] = defaultdict(set)
    card_unique_bytes = 0
    card_total_bytes = 0
    sec_boiler: dict[str, Counter] = defaultdict(Counter)
    sec_bytes: Counter = Counter()

    for p in paths:
        raw, body = load(p)
        card_total_bytes += len(raw.encode())
        secs = split_sections(body)
        seen_here = set()
        unique_bytes = 0
        for name, content in secs:
            sec_bytes[name] += len(content.encode())
            hit_boiler = 0
            for c in paras(content):
                para_cards[c].add(p)
                if c not in seen_here:
                    seen_here.add(c)
            for c in paras(content, 24):
                if len(para_cards[c]) > 1:
                    hit_boiler += 1
            sec_boiler[name][p] = hit_boiler
        card_unique_bytes += unique_bytes

    # 第二遍：按「跨卡出现次数」把段落分成模板/专属
    tmpl_bytes = 0
    tmpl_paras = 0
    uniq_bytes = 0
    uniq_paras = 0
    per_card_tmpl: dict[str, int] = defaultdict(int)
    for p in paths:
        raw, body = load(p)
        for name, content in split_sections(body):
            for c in paras(content):
                b = len(c.encode())
                k = len(para_cards[c])
                if k >= 20:          # 20 张以上的卡共用同一段落 → 模板
                    tmpl_bytes += b
                    tmpl_paras += 1
                    per_card_tmpl[p] += b
                else:
                    uniq_bytes += b
                    uniq_paras += 1

    print(f"卡 {n}")
    print(f"段落总数 {tmpl_paras + uniq_paras:,}")
    print(f"  模板段（≥20 张卡共用）{tmpl_paras:,}　占字节 {tmpl_bytes:,} "
          f"({tmpl_bytes * 100 // max(tmpl_bytes + uniq_bytes, 1)}%)")
    print(f"  专属段 {uniq_paras:,}　占字节 {uniq_bytes:,} "
          f"({uniq_bytes * 100 // max(tmpl_bytes + uniq_bytes, 1)}%)")
    print()

    print("== 出现最广的模板段（前 25）==")
    top = sorted(para_cards.items(), key=lambda kv: -len(kv[1]))[:25]
    for c, s in top:
        print(f"  {len(s):>5} 张卡　{len(c.encode()):>5} B　{c[:110]}")
    print()

    print("== 各段落被污染程度（含≥20 卡共用段的卡数 / 该段总字节）==")
    for name, cnt in sec_boiler.items():
        cards_hit = sum(1 for v in cnt.values() if v > 0)
        print(f"  {name:<24} {cards_hit:>5}/{n} 张含模板段　段总字节 {sec_bytes[name]:,}")
    print()

    print("== 每卡模板字节占比 ==")
    import statistics
    vals = sorted(per_card_tmpl.values())
    print(f"  中位 {int(statistics.median(vals)):,} B　均值 {sum(vals) // n:,} B"
          f"　最小 {vals[0]:,}　最大 {vals[-1]:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
