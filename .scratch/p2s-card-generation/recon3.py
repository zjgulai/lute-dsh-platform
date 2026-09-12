#!/usr/bin/env python3
"""R4：源站 ⑦ 节选的**真实来源**是不是 paper2skills-code/？

卡面第 0 行自己写了路径（`代码块数量：N · 路径：paper2skills-code/<...>`）。
若节选正文是该目录下某个 .py 的开头，那么：
  · 「源站卡 ≠ vault 卡」这个提法本身是错的 —— 两个不是同一份东西的两代，
    而是**两个并行的代码库**（paper2skills-code 供预览 / vault 卡供完整实现）；
  · 那 21 张不需要「恢复」，需要的是**弄清哪一份才算数**。

判据与管线同口径（prefix_offset）。阴性对照：节选尾部接垃圾行必须全不命中。

只读。用法：python3 .scratch/p2s-card-generation/recon3.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills'
ICLOUD = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills")
CODE = os.path.join(ICLOUD, 'paper2skills-code')

_spec = importlib.util.spec_from_file_location('bsc', os.path.join(PKG, 'scripts/build-source-code.py'))
bsc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bsc)


def declared_dir(sec7: str) -> str | None:
    """⑦ 段第 0 行的 `路径：paper2skills-code/<...>`"""
    head = sec7.split('\n')[0] if sec7 else ''
    if '未检测到' in head:
        return None
    i = head.find('paper2skills-code/')
    return head[i:].strip() if i >= 0 else None


def py_files(rel: str) -> list[str]:
    d = os.path.join(ICLOUD, rel)
    if not os.path.isdir(d):
        return []
    return [os.path.join(rel, f) for f in sorted(os.listdir(d))
            if f.endswith('.py') and not f.startswith('__')]


def main() -> int:
    src = {c['id']: c for c in json.load(open(os.path.join(PKG, 'generated/cards.json')))['cards']}
    rec = json.load(open(os.path.join(PKG, 'data/code-recovery.json')))
    bad = sorted(c for c, v in rec['cards'].items()
                 if v.get('reason') == 'EXCERPT_NOT_FOUND_IN_VAULT')

    print('== R4：那 21 张的 ⑦ 节选 vs paper2skills-code/ 里它自己声明的目录 ==\n')
    rows = []
    n_hit = n_dir = n_nodir = 0
    neg_bad = 0
    for cid in bad:
        sec7 = src[cid]['sections'].get(bsc.SECTION, '')
        ex = bsc.split_section(sec7)[2]
        rel = declared_dir(sec7)
        files = py_files(rel) if rel else []
        found = None
        for f in files:
            body = open(os.path.join(ICLOUD, f), encoding='utf-8', errors='replace').read()
            if ex and bsc.prefix_offset(ex, body) is not None:
                found = f
                break
            if ex and bsc.prefix_offset(ex + '\n# TAMPERED', body) is not None:
                neg_bad += 1
        rows.append(dict(card=cid, declared=rel, files=len(files), hit=found))
        if rel:
            n_dir += 1
        else:
            n_nodir += 1
        if found:
            n_hit += 1
        tag = f'✔ {found}' if found else ('目录不存在' if rel and not files
                                     else ('未声明路径' if not rel else '目录在但节选不在'))
        print(f'  {cid[:54]:56s} {tag}')
        if rel:
            print(f'       声明 {rel}  ({len(files)} 个 .py)')

    print(f'\n有声明路径 {n_dir} · 未声明 {n_nodir} · 节选命中 {n_hit}/{len(bad)}')
    print(f'阴性对照误命中 {neg_bad}')

    # ── 阳性对照：oracle 集里抽 12 张，声明目录应当也命中 ─────────────
    oracles = sorted(c for c, v in rec['cards'].items() if v.get('tier') == 'oracle')[:12]
    pos_ok = pos_dir = 0
    print('\n== 阳性对照：oracle 前 12 张，同样对 paper2skills-code 判 ──')
    for cid in oracles:
        sec7 = src[cid]['sections'].get(bsc.SECTION, '')
        ex = bsc.split_section(sec7)[2]
        rel = declared_dir(sec7)
        files = py_files(rel) if rel else []
        if files:
            pos_dir += 1
        ok = False
        for f in files:
            body = open(os.path.join(ICLOUD, f), encoding='utf-8', errors='replace').read()
            if ex and bsc.prefix_offset(ex, body) is not None:
                ok = True
                break
        if ok:
            pos_ok += 1
        print(f'  {"✔" if ok else "✘"} {cid[:54]:56s} {rel or "(未声明)"}')
    print(f'  → 有目录 {pos_dir}/12，命中 {pos_ok}/12')

    json.dump(dict(stats=dict(total=len(bad), hit=n_hit, has_dir=n_dir, no_dir=n_nodir,
                              neg_bad=neg_bad, pos_ok=pos_ok, pos_dir=pos_dir),
                   rows=rows),
              open(os.path.join(HERE, 'recon-r4.json'), 'w'), ensure_ascii=False, indent=2)
    return 0


if __name__ == '__main__':
    sys.exit(main())
