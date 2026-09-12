#!/usr/bin/env python3
"""recon1 — 给全部 1338 张卡的「恢复区」做结构定位：围栏是否闭合、恢复区是否吃进散文。

只读。输出 recon1.json。
"""
import json
import pickle
import re
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(HERE, '..', '..', 'packages', 'capabilities', 'dsh-paper2skills')
PKG = os.path.normpath(PKG)

BOUNDARY_RE = re.compile(r'^```(.*)$', re.M)

blobs = pickle.load(open(os.path.join(HERE, 'vault-blobs.pkl'), 'rb'))
rec = json.load(open(os.path.join(PKG, 'data', 'code-recovery.json'), encoding='utf-8'))['cards']
full = json.load(open(os.path.join(PKG, 'generated', 'source-code.json'), encoding='utf-8'))['cards']

# 散文指纹：这些行出现在恢复区里，几乎必然是「吃进了卡的正文」而不是实现
PROSE_PATTERNS = [
    (r'^#{2,4}\s', 'md-heading'),
    (r'^---\s*$', 'md-rule'),
    (r'^- \*\*[^*]+\*\*[：:]', 'md-bold-bullet'),
    (r'^\|\s*\*\*[^*]+\*\*\s*\|', 'md-table-bold'),
    (r'^\*\*(前置|延伸|可组合|ROI|实施难度|优先级|论文|领域|相关)', 'md-meta-bold'),
    (r'^\[\[Skill-', 'md-wikilink'),
    (r'^\|\s*字段\s*\|', 'md-meta-table'),
]
PROSE_RE = [(re.compile(p), n) for p, n in PROSE_PATTERNS]


def boundaries(text):
    return [(m.start(), m.end(), m.group(1).strip().lower()) for m in BOUNDARY_RE.finditer(text)]


def analyze(cid):
    c = rec[cid]
    text = blobs[c['vault_path']]
    lines = text.split('\n')
    marks = boundaries(text)
    n_marks = len(marks)
    # 该卡被选中的那个围栏
    fi = c.get('fence_index')
    py_idx = [i for i, m in enumerate(marks) if m[2] == 'python']
    chosen = None
    if fi is not None and 0 <= fi < n_marks:
        chosen = fi
    elif py_idx:
        chosen = py_idx[-1]

    # 恢复区（从 source-code.json 取，它是盘上真相）
    code = full.get(cid, {}).get('code')
    code_lines = code.split('\n') if code else []

    # 卡片自身的正文行集合：恢复区里命中的散文行
    prose_hits = []
    for i, l in enumerate(code_lines, 1):
        for rx, name in PROSE_RE:
            if rx.search(l):
                prose_hits.append((i, name, l[:90]))
                break

    # 闭合性：chosen 之后还有几个边界？mark 总数是奇数 = 至少一个围栏没配对
    after = n_marks - 1 - chosen if chosen is not None else 0
    return {
        'card': cid,
        'tier': c.get('tier'),
        'lines_card': len(lines),
        'marks': n_marks,
        'marks_parity': 'odd(有落单)' if n_marks % 2 else 'even',
        'chosen_fence_index': chosen,
        'chosen_lang': marks[chosen][2] if chosen is not None else None,
        'marks_after_chosen': after,
        'recovered_lines': len(code_lines),
        'parses': c.get('parses'),
        'prose_hits': len(prose_hits),
        'prose_sample': prose_hits[:3],
        'last_code_line': code_lines[-1][:100] if code_lines else None,
    }


def main():
    rows = [analyze(cid) for cid in rec]
    out = {
        'generated_from': {
            'vault_blobs': 'vault-blobs.pkl',
            'recovery_index': 'data/code-recovery.json',
        },
        'rows': rows,
    }
    json.dump(out, open(os.path.join(HERE, 'recon1.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    # 汇总
    from collections import Counter
    print('== 围栏落单（mark 数奇数）==')
    print(Counter(r['marks_parity'] for r in rows))
    print()
    print('== 恢复区吃进散文的卡片数 ==')
    dirty = [r for r in rows if r['prose_hits'] > 0]
    print('有散文命中:', len(dirty), '/', len(rows))
    print(Counter(r['parses'] for r in dirty))
    print()
    print('== parses=False 的 20 张，逐卡 ==')
    for r in rows:
        if r['parses'] is False:
            print('%-52s tier=%-10s marks=%-3d(%s) chosen=%-3s after=%-3d prose=%-3d lines=%d' % (
                r['card'], r['tier'], r['marks'], r['marks_parity'][:7],
                r['chosen_fence_index'], r['marks_after_chosen'], r['prose_hits'],
                r['recovered_lines']))
    print()
    print('== parses=True 但恢复区吃进散文的前 25 张（静默截断候选）==')
    silent = sorted([r for r in rows if r['parses'] is True and r['prose_hits'] > 0],
                    key=lambda r: -r['prose_hits'])
    print('总数:', len(silent))
    for r in silent[:25]:
        print('%-52s prose=%-4d lines=%-5d marks=%d%s' % (
            r['card'], r['prose_hits'], r['recovered_lines'], r['marks'],
            '(odd)' if r['marks'] % 2 else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
