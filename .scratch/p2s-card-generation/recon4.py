#!/usr/bin/env python3
"""R5：那 21 张究竟是「两代产物」还是**管线自己的语言标注判据漏读**？

假设 H：源站 ⑦ 发布的是 vault ③ 段里**第一个**代码块（不论语言标注），
       而管线的 FENCE_RE 只认 python/py 标注的围栏。
       于是当第一个块是 ```bash（如「运行方式」）时，节选根本不在候选集里。

判据：把围栏正则放宽到**任意语言标注**，再看 21 张是否命中。
对照组：oracle 抽样必须仍然全命中，且围栏位次不发生意外前移。

只读。用法：python3 .scratch/p2s-card-generation/recon4.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills'
ICLOUD = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills")
REV = '4a4fa0d49e44dfaa50a730293a61dc6269af53d9'

_spec = importlib.util.spec_from_file_location('bsc', os.path.join(PKG, 'scripts/build-source-code.py'))
bsc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bsc)

#: 任意语言标注（含 bash/sql/yaml/json/text/无标注），并**记下标注**
FENCE_ANY = re.compile(r'```[ \t]*([A-Za-z0-9_+#-]*)[ \t]*\r?\n(.*?)```', re.S)


def blob(path: str, rev: str = REV) -> str:
    p = subprocess.run(['git', '-c', 'core.quotepath=false', 'cat-file', '-p', f'{rev}:{path}'],
                       cwd=ICLOUD, capture_output=True)
    return p.stdout.decode('utf-8', 'replace') if p.returncode == 0 else ''


def fences_any(text: str):
    return [(m.group(1) or '(无)', m.group(2)) for m in FENCE_ANY.finditer(text)]


def main() -> int:
    rec = json.load(open(os.path.join(PKG, 'data/code-recovery.json')))
    src = {c['id']: c for c in json.load(open(os.path.join(PKG, 'generated/cards.json')))['cards']}
    bad = sorted(c for c, v in rec['cards'].items()
                 if v.get('reason') == 'EXCERPT_NOT_FOUND_IN_VAULT')
    oracles = sorted(c for c, v in rec['cards'].items() if v.get('tier') == 'oracle')

    def ex_of(cid):
        return bsc.split_section(src[cid]['sections'].get(bsc.SECTION, ''))[2]

    print('== R5：放宽到任意语言标注后，那 21 张的落点 ==\n')
    rows = []
    n_hit = 0
    for cid in bad:
        ex = ex_of(cid)
        text = blob(rec['cards'][cid]['vault_path'])
        fs = fences_any(text)
        strict = [(k, f) for k, f in enumerate(bsc.fences(text))
                  if ex and bsc.prefix_offset(ex, f) is not None]
        anyf = [(k, lang, f) for k, (lang, f) in enumerate(fs)
                if ex and bsc.prefix_offset(ex, f) is not None]
        hit = anyf[0] if anyf else None
        if hit:
            n_hit += 1
        rows.append(dict(card=cid, excerpt_lines=len(ex.split('\n')) if ex else 0,
                         strict=[k for k, _ in strict],
                         any_hit=dict(fence=hit[0], lang=hit[1]) if hit else None,
                         first_fence=dict(lang=fs[0][0],
                                          lines=len(fs[0][1].rstrip('\n').split('\n'))) if fs else None))
        print(f'  {"✔" if hit else "✘"} {cid}')
        print(f'       节选 {len(ex.split(chr(10))) if ex else 0} 行 · '
              f'本卡第一个围栏 = {fs[0][0] if fs else "(无)"}'
              f'({len(fs[0][1].rstrip(chr(10)).split(chr(10))) if fs else 0} 行)'
              + (f' · 命中 fence[{hit[0]}] 标注={hit[1]}' if hit else ' · 放宽后仍不命中'))

    print(f'\n小结：放宽语言标注后 {n_hit}/{len(bad)} 命中')

    # ── 对照组：oracle 抽样，放宽后必须仍命中，且位次不劣化 ──────────
    import random
    random.seed(7)
    sample = random.sample(oracles, 40)
    same = worse = better = 0
    for cid in sample:
        ex = ex_of(cid)
        text = blob(rec['cards'][cid]['vault_path'])
        s = next((k for k, f in enumerate(bsc.fences(text))
                  if ex and bsc.prefix_offset(ex, f) is not None), None)
        a = next((k for k, (lang, f) in enumerate(fences_any(text))
                  if ex and bsc.prefix_offset(ex, f) is not None), None)
        if a is None:
            worse += 1
        elif a == s:
            same += 1
        elif s is None:
            better += 1
        else:
            better += 1
    print(f'对照组（oracle 抽 40）：位次不变 {same} · 前移 {better} · 丢失 {worse}'
          f'  {"✔" if worse == 0 else "✘ 放宽反而丢，说明口径有问题"}')

    json.dump(dict(stats=dict(total=len(bad), hit=n_hit, ctrl_same=same, ctrl_worse=worse),
                   rows=rows),
              open(os.path.join(HERE, 'recon-r5.json'), 'w'), ensure_ascii=False, indent=2)
    return 0


if __name__ == '__main__':
    sys.exit(main())
