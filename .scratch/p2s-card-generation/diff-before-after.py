#!/usr/bin/env python3
"""R8：修围栏判据的前后逐卡对账。

不能只看总数涨了就算成功 —— 必须证明**没有卡被改坏**：
每个 tier/sha256/lines 的变化都要能解释。

只读。用法：python3 .scratch/p2s-card-generation/diff-before-after.py
"""
from __future__ import annotations

import collections
import json
import os
import sys

PKG = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills'
HERE = os.path.dirname(os.path.abspath(__file__))

before = json.load(open(os.path.join(HERE, 'before/code-recovery.before.json')))['cards']
after = json.load(open(os.path.join(PKG, 'data/code-recovery.json')))['cards']

assert set(before) == set(after), '卡集合变了'


def key(r):
    return (r.get('tier'), r.get('lines'), r.get('sha256'), r.get('fence_index'),
            r.get('reason'), r.get('offset'))


changed = [(c, before[c], after[c]) for c in sorted(before) if key(before[c]) != key(after[c])]
print(f'总卡数 {len(after)}；读数发生变化的 {len(changed)} 张\n')

kinds = collections.Counter()
for c, b, a in changed:
    kinds[(b.get('tier'), b.get('reason'), a.get('tier'), a.get('reason'))] += 1

print('== 变化分类（前 tier/reason → 后 tier/reason）==')
for (bt, br, at, ar), n in kinds.most_common():
    print(f'  {n:4d}  {bt or "-"}/{br or "-"}  →  {at or "-"}/{ar or "-"}')

# ① 从 oracle 掉出来的（最危险：已确证的东西被改坏）
drops = [(c, b, a) for c, b, a in changed
         if b.get('tier') == 'oracle' and a.get('tier') != 'oracle']
print(f'\n== ① 原本 oracle、现在不是 oracle：{len(drops)} 张 ==')
for c, b, a in drops:
    print(f'   {c}  lines {b["lines"]} → {a.get("lines")}  sha {str(b.get("sha256"))[:10]}'
          f' → {str(a.get("sha256"))[:10]}  reason={a.get("reason")}')

# ② oracle 之间内容变了（sha 变）
moves = [(c, b, a) for c, b, a in changed
         if b.get('tier') == 'oracle' and a.get('tier') == 'oracle'
         and b.get('sha256') != a.get('sha256')]
print(f'\n== ② oracle 且正文变了：{len(moves)} 张 ==')
for c, b, a in moves:
    print(f'   {c}  lines {b["lines"]} → {a["lines"]}  fence {b.get("fence_index")}'
          f' → {a.get("fence_index")}')

# ③ 只在 fence_index / offset 上变（正文没变）
meta = [(c, b, a) for c, b, a in changed
        if b.get('sha256') and b.get('sha256') == a.get('sha256')]
print(f'\n== ③ 正文未变、只是位次/偏移等元数据变了：{len(meta)} 张 ==')
for c, b, a in meta[:25]:
    print(f'   {c}  fence {b.get("fence_index")} → {a.get("fence_index")}'
          f'  offset {b.get("offset")} → {a.get("offset")}  cross {a.get("cross_check")}')
if len(meta) > 25:
    print(f'   … 其余 {len(meta) - 25} 张同类')

# ④ 新恢复的
new = [(c, b, a) for c, b, a in changed
       if b.get('tier') == 'unrecovered' and a.get('tier') != 'unrecovered']
print(f'\n== ④ 新恢复：{len(new)} 张 ==')
for c, b, a in new:
    print(f'   ✔ {c}  {a.get("lines")} 行  parses={a.get("parses")}  cross={a.get("cross_check")}'
          f'  (原 reason={b.get("reason")})')

# ⑤ 仍未恢复的 21 张去向
bad_before = {c for c, r in before.items() if r.get('reason') == 'EXCERPT_NOT_FOUND_IN_VAULT'}
print(f'\n== ⑤ 原 21 张 EXCERPT_NOT_FOUND 的去向 ==')
gone = collections.Counter()
for c in sorted(bad_before):
    a = after[c]
    gone[(a.get('tier'), a.get('reason'))] += 1
    print(f'   {c:56s} → {a.get("tier")}/{a.get("reason") or "-"}'
          + (f'  {a.get("lines")} 行' if a.get('lines') else ''))

print('\n== 汇总 ==')
sb = json.load(open(os.path.join(HERE, 'before/code-recovery.before.json')))['stats']
sa = json.load(open(os.path.join(PKG, 'data/code-recovery.json')))['stats']
for k in sorted(set(sb) | set(sa)):
    v1, v2 = sb.get(k), sa.get(k)
    mark = '  ' if v1 == v2 else '→ '
    print(f'   {mark}{k:26s} {v1} → {v2}')
