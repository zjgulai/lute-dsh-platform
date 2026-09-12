#!/usr/bin/env python3
"""用字符 n-gram 覆盖法量化 p2s 语料的「模板骨架」占比。

上一版按整段匹配会漏掉「骨架固定、槽位替换」的段落
（例：`场景1：[核心业务场景] - 业务问题：… - 业务价值：<每卡不同>`）。
本版把每张卡每个字符位置上的 10 字 shingle 拿去全语料计数，
出现在 ≥N 张卡里的 shingle 判为模板，再看它覆盖了多少字符。

只读，不写盘。
"""
from __future__ import annotations

import glob
import os
import re
import sys
from collections import Counter

SKILLS = os.path.expanduser("~/.dsh/skills")
FM_RE = re.compile(r"^---\n.*?\n---\n", re.S)
SEC_RE = re.compile(r"^##\s+(.+?)\s*$", re.M)
K = 10          # shingle 长度（字符）
STRIDE = 3      # 计数时的采样步长（覆盖时再用步长 1）
MIN_CARDS = 50  # 出现在 ≥ 这么多张卡里 → 模板


def main() -> int:
    paths = sorted(glob.glob(os.path.join(SKILLS, "p2s-*/SKILL.md")))
    n = len(paths)
    bodies = []
    for p in paths:
        raw = open(p, encoding="utf-8").read()
        m = FM_RE.match(raw)
        bodies.append(raw[m.end():] if m else raw)

    cnt: Counter[str] = Counter()
    for b in bodies:
        for i in range(0, len(b) - K, STRIDE):
            cnt[b[i:i + K]] += 1

    boiler = {s for s, c in cnt.items() if c >= MIN_CARDS}
    print(f"卡 {n}　字符 {sum(len(b) for b in bodies):,}")
    print(f"shingle 去重 {len(cnt):,}　其中出现 ≥{MIN_CARDS} 次的模板 shingle {len(boiler):,}")

    total = 0
    templ = 0
    per_sec_templ: Counter = Counter()
    per_sec_total: Counter = Counter()
    per_card: list[tuple[int, int, str]] = []

    for p, b in zip(paths, bodies):
        cov = bytearray(len(b))
        for i in range(len(b) - K):
            if b[i:i + K] in boiler:
                for j in range(i, i + K):
                    cov[j] = 1
        total += len(b)
        t = sum(cov)
        templ += t
        per_card.append((t, len(b), os.path.basename(os.path.dirname(p))))

        marks = list(SEC_RE.finditer(b))
        for i, m in enumerate(marks):
            end = marks[i + 1].start() if i + 1 < len(marks) else len(b)
            name = m.group(1).strip()
            per_sec_total[name] += end - m.end()
            per_sec_templ[name] += sum(cov[m.end():end])

    print(f"模板骨架覆盖 {templ:,} / {total:,} 字符 = {templ * 100 // max(total, 1)}%")
    print()
    print("== 各段落模板占比 ==")
    for name, tot in per_sec_total.most_common():
        t = per_sec_templ[name]
        bar = "█" * (t * 20 // max(tot, 1))
        print(f"  {name:<22} {t * 100 // max(tot, 1):>3}%  {bar:<20} {t:>8,}/{tot:>8,} 字符")
    print()
    per_card.sort()
    print("== 最干净 5 张 ==")
    for t, tot, d in per_card[:5]:
        print(f"  {t * 100 // tot:>3}% 模板  {d}")
    print("== 最模板化 10 张 ==")
    for t, tot, d in per_card[-10:]:
        print(f"  {t * 100 // tot:>3}% 模板  {d}")
    import statistics
    print(f"中位模板占比 {statistics.median(t * 100 // tot for t, tot, _ in per_card)}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
