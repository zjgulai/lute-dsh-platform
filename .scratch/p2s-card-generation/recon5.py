#!/usr/bin/env python3
"""R7：那 2 张放宽后仍不命中的卡，其节选是否存在于**本地可读**的 paper_to_skills 树里。

本地那棵树 1,986 个文本文件（vault 全是明文，无二进制容器），
所以这里能直接 grep —— 若命中，说明节选来自本地那一代，而非 iCloud vault 的任何版本。

只读。用法：python3 .scratch/p2s-card-generation/recon5.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills'
LOCAL = '/Users/lute/project/paper_to_skills'

_spec = importlib.util.spec_from_file_location('bsc', os.path.join(PKG, 'scripts/build-source-code.py'))
bsc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bsc)

CARDS = ['Skill-Cost-Plus-Dynamic-Tariff-Pricing', 'Skill-Flash-Sale-Price-Optimization']
TEXT_EXT = ('.md', '.py', '.json', '.html', '.txt', '.js')


def probes(code: str) -> list[str]:
    out = []
    for raw in code.split('\n'):
        s = raw.strip()
        if len(s) >= 20 and not s.startswith('#'):
            out.append(s)
    return sorted(out, key=len, reverse=True)[:5]


def main() -> int:
    src = {c['id']: c for c in json.load(open(os.path.join(PKG, 'generated/cards.json')))['cards']}
    files: list[str] = []
    for root, _dirs, names in os.walk(LOCAL):
        if '/.git' in root:
            continue
        for n in names:
            if n.endswith(TEXT_EXT):
                files.append(os.path.join(root, n))
    print(f'本地可读文本文件 {len(files)} 个，开始逐个判定 …\n')

    for cid in CARDS:
        ex = bsc.split_section(src[cid]['sections'].get(bsc.SECTION, ''))[2] or ''
        ps = probes(ex)
        print(f'===== {cid}  （节选 {len(ex.split(chr(10)))} 行，探针 {len(ps)} 条）')
        for p in ps[:2]:
            print(f'   探针: {p[:88]}')
        found_full = found_probe = None
        for f in files:
            try:
                body = open(f, encoding='utf-8', errors='replace').read()
            except Exception:
                continue
            if bsc.prefix_offset(ex, body) is not None and found_full is None:
                found_full = f
            if found_probe is None and any(p in body for p in ps):
                found_probe = f
        print(f'   ▶ 整段节选作为文件前缀: {found_full or "无"}')
        print(f'   ▶ 任一探针行出现在:     {found_probe or "无"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
