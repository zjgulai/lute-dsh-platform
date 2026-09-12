#!/usr/bin/env python3
"""R3（改）：决定性判据 —— 单遍扫描 vault 仓库**全部历史 blob**。

`git log -S` 要逐提交做 diff，238+ 提交下跑不完。改为：
  git rev-list --all --objects  → 去重 SHA
  git cat-file --batch          → 一次性流式读回
  对每个 blob 做 21 条探针的子串判定

与路径无关、与改名无关、与分支无关 —— 比 pickaxe 更强也更便宜。

只读。用法：python3 .scratch/p2s-card-generation/recon2.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills'
ICLOUD = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills")

_spec = importlib.util.spec_from_file_location('bsc', os.path.join(PKG, 'scripts/build-source-code.py'))
bsc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bsc)

BOILER = {
    'import numpy as np', 'import pandas as pd', 'from dataclasses import dataclass, field',
    'from typing import Optional', 'import json', 'import re', 'import math',
    'if __name__ == "__main__":', 'return result', 'else:', 'try:',
    'def __init__(self):', 'import logging',
}


def all_blobs() -> dict[str, str]:
    """{sha: 代表路径}（同一 sha 多路径只留一条）。

    收窄到 paper2skills-vault/ 与 paper2skills-code/ 下的文本后缀：
    全仓 31,507 个 blob 含 ~2.9 GB（papers/ 与资源图），在 iCloud 上读不完，
    而卡与代码只可能落在这两棵树下。
    """
    out = subprocess.run(['git', 'rev-list', '--all', '--objects'], cwd=ICLOUD,
                         capture_output=True).stdout.decode('utf-8', 'replace')
    seen: dict[str, str] = {}
    for line in out.split('\n'):
        if not line:
            continue
        parts = line.split(' ', 1)
        if len(parts) != 2:
            continue
        sha, path = parts
        if not path.endswith(('.md', '.py', '.json', '.html', '.txt')):
            continue
        if not (path.startswith('paper2skills-vault/') or path.startswith('paper2skills-code/')):
            continue
        seen.setdefault(sha, path)
    return seen


def cat_all(shas: list[str]):
    """一次性取回全部 blob。

    不能用「写 stdin → close → 读 stdout」的手写管道：7,385 个 SHA 约 300 KB，
    超过管道缓冲（64 KB），git 写 stdout 时填满、本进程又在写 stdin —— 实测死锁。
    `subprocess.run(input=…)` 走 communicate()，双向同时排空，不会卡。
    """
    inp = ('\n'.join(shas) + '\n').encode()
    p = subprocess.run(['git', 'cat-file', '--batch'], cwd=ICLOUD, input=inp,
                       capture_output=True)
    raw = p.stdout
    pos = 0
    for sha in shas:
        nl = raw.find(b'\n', pos)
        if nl < 0:
            break
        f = raw[pos:nl].split()
        pos = nl + 1
        if len(f) < 3 or f[1] != b'blob':
            continue
        size = int(f[2])
        yield sha, raw[pos:pos + size]
        pos += size + 1


def distinctive_line(code: str) -> str | None:
    cands = []
    for raw in code.split('\n'):
        s = raw.strip()
        if len(s) < 24 or s in BOILER or s.startswith('#') or s in ('"""', "'''"):
            continue
        cands.append(s)
    return max(cands, key=len) if cands else None


def main() -> int:
    rec = json.load(open(os.path.join(PKG, 'data/code-recovery.json')))
    src = {c['id']: c for c in json.load(open(os.path.join(PKG, 'generated/cards.json')))['cards']}

    def excerpt(cid: str) -> str:
        return bsc.split_section(src[cid]['sections'].get(bsc.SECTION, ''))[2] or ''

    bad = sorted(c for c, v in rec['cards'].items()
                 if v.get('reason') == 'EXCERPT_NOT_FOUND_IN_VAULT')
    oracles = sorted(c for c, v in rec['cards'].items() if v.get('tier') == 'oracle')[:12]

    probes: dict[str, str] = {}
    for cid in bad + oracles:
        line = distinctive_line(excerpt(cid))
        if line:
            probes[cid] = line
    print(f'探针 {len(probes)} 条（{len(bad)} 张未恢复 + {len(oracles)} 张 oracle 阳性对照）')

    blobs = all_blobs()
    print(f'历史 blob {len(blobs)} 个（去重后），开始单遍扫描 …')
    pb = {cid: s.encode('utf-8') for cid, s in probes.items()}
    neg = {cid: (s + '#ZZ9F').encode('utf-8') for cid, s in probes.items()}
    hit: dict[str, list[str]] = {cid: [] for cid in probes}
    neg_hit: dict[str, list[str]] = {cid: [] for cid in probes}
    n = 0
    for sha, data in cat_all(list(blobs)):
        n += 1
        for cid in probes:
            if pb[cid] in data:
                hit[cid].append(blobs[sha])
            if neg[cid] in data:
                neg_hit[cid].append(blobs[sha])
        if n % 5000 == 0:
            print(f'  … {n}/{len(blobs)}')

    print(f'扫完 {n} 个 blob\n')
    neg_bad = [c for c, v in neg_hit.items() if v]
    print(f'阴性对照（探针尾部加 #ZZ9F）: {len(neg_bad)}/{len(probes)} 误命中'
          f'  {"✔ 判据不是橡皮图章" if not neg_bad else "✘ 判据不可信"}')

    print('\n== A. oracle 阳性对照（应当全命中）==')
    a_ok = 0
    for cid in oracles:
        v = hit.get(cid, [])
        if v:
            a_ok += 1
        print(f'  {"✔" if v else "✘"} {cid}  ({len(v)} 个 blob)')
    print(f'  → {a_ok}/{len(oracles)}')

    print('\n== B. 那 21 张（决定性）==')
    b_ok = 0
    rows = []
    for cid in bad:
        v = hit.get(cid, [])
        if v:
            b_ok += 1
        rows.append(dict(card=cid, probe=probes.get(cid), blobs=v[:12], n_blobs=len(v)))
        print(f'  {"✔ 全仓历史有" if v else "✘ 全仓历史无"} {cid}  ({len(v)} 个 blob)')
        print(f'       探针: {(probes.get(cid) or "(无)")[:86]}')
        for p in v[:3]:
            print(f'       出现在: {p}')

    print(f'\n小结：21 张里 {b_ok} 张的探针在 vault 全仓全历史出现过；'
          f'阳性对照 {a_ok}/{len(oracles)}')
    json.dump({'stats': dict(blobs=len(blobs), bad_total=len(bad), bad_hit=b_ok,
                             pos_ok=a_ok, pos_total=len(oracles),
                             neg_bad=len(neg_bad)),
               'rows': rows},
              open(os.path.join(HERE, 'recon-r3.json'), 'w'), ensure_ascii=False, indent=2)
    return 0


if __name__ == '__main__':
    sys.exit(main())
