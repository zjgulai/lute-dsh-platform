#!/usr/bin/env python3
"""recon2 — 判定 20 张 parses=False 的确切成因。

四把互不依赖的尺子：
  R1  卡内结构：被选中的围栏后面还有几个边界（能不能确定正文终点）
  R2  语法指纹：最后一行是不是断在表达式中间（开括号/逗号/运算符结尾）
  R3  闭合围栏后是否还残留代码行（= 围栏位置本身错位，不是判据错）
  R4  仓内真源：git 全历史里是否存在同名 model.py（能否拿真值做对照）

只读。输出 recon2.json。
"""
import json
import os
import pickle
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.normpath(os.path.join(HERE, '..', '..', 'packages', 'capabilities', 'dsh-paper2skills'))
REPO = '/Users/lute/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills'
REV = '4a4fa0d49e44dfaa50a730293a61dc6269af53d9'

BOUNDARY_RE = re.compile(r'^```(.*)$', re.M)
CUT_TAIL_RE = re.compile(r'[({\[,:+\-*/%=<>|&]\\?$|"""$|\'\'\'$')


def marks(text):
    return [(m.start(), m.end(), m.group(1).strip().lower()) for m in BOUNDARY_RE.finditer(text)]


def last_code_line(code):
    for l in reversed(code.split('\n')):
        if l.strip():
            return l
    return ''


def canonical_index():
    """git 全历史里出现过的 paper2skills-code/**/model.py 等真源路径。"""
    out = subprocess.run(
        ['git', '-C', REPO, 'log', '--all', '--pretty=format:', '--name-only'],
        capture_output=True)
    paths = set()
    for line in out.stdout.decode('utf-8', 'replace').split('\n'):
        line = line.strip().strip('"')
        if line.startswith('paper2skills-code/') and line.endswith('.py'):
            paths.add(line)
    return sorted(paths)


def main():
    blobs = pickle.load(open(os.path.join(HERE, 'vault-blobs.pkl'), 'rb'))
    rec = json.load(open(os.path.join(PKG, 'data', 'code-recovery.json'), encoding='utf-8'))['cards']
    full = json.load(open(os.path.join(PKG, 'generated', 'source-code.json'), encoding='utf-8'))['cards']

    canon = canonical_index()
    canon_names = {}
    for p in canon:
        canon_names.setdefault(os.path.basename(os.path.dirname(p)), []).append(p)
    print('git 全历史 paper2skills-code/**/*.py 路径: %d，目录名去重: %d'
          % (len(canon), len(canon_names)))

    fails = sorted([c for c in rec.values() if c.get('parses') is False],
                   key=lambda c: (c.get('tier'), c['card']))

    rows = []
    for c in fails:
        cid = c['card']
        text = blobs[c['vault_path']]
        lines = text.split('\n')
        ms = marks(text)
        fi = c.get('fence_index')
        code = full[cid]['code']
        cl = code.split('\n')
        last = last_code_line(code)

        # R1：被选中围栏之后的边界个数（0 或 1 = 能闭合；≥2 = 终点不确定）
        after = (len(ms) - 1 - fi) if fi is not None else None
        # R2：断尾指纹
        cut = bool(CUT_TAIL_RE.search(last.rstrip()))
        # R3：恢复区末行之后，到下一个 ## 之前，还有没有代码样的行
        tl = [l.rstrip() for l in lines]
        end = None
        needle = cl[[i for i, l in enumerate(cl) if l.strip()][-1]]
        for i in range(len(tl) - 1, -1, -1):
            if tl[i] == needle:
                end = i
                break
        stray = None
        if end is not None:
            j = end + 1
            while j < len(tl) and j < end + 30:
                s = tl[j].strip()
                if not s or s.startswith('```'):
                    j += 1
                    continue
                if s.startswith('##'):
                    break
                stray = (j + 1, s[:80])
                break
        # R4：仓内是否有同名目录的真源
        stem = cid.replace('Skill-', '')
        guess = re.sub(r'[^a-z0-9]+', '_', stem.lower()).strip('_')
        near = [p for d, ps in canon_names.items() if guess[:8] and guess[:8] in d for p in ps]
        rows.append({
            'card': cid, 'tier': c['tier'], 'fence_index': fi,
            'marks': len(ms), 'marks_after_chosen': after,
            'recovered_lines': len(cl), 'parses': False,
            'last_line': last[:110], 'cut_tail': cut,
            'stray_after_close': stray,
            'canonical_near': near[:3],
        })

    json.dump({'rows': rows}, open(os.path.join(HERE, 'recon2.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    print()
    print('%-52s %-10s %-4s %-6s %-8s %s' % ('card', 'tier', 'fi', 'after', 'cut', '真源'))
    for r in rows:
        print('%-52s %-10s %-4s %-6s %-8s %s' % (
            r['card'], r['tier'], r['fence_index'], r['marks_after_chosen'],
            r['cut_tail'], (r['canonical_near'] or ['—'])[0]))
    print()
    from collections import Counter
    print('断尾指纹 cut_tail:', Counter(r['cut_tail'] for r in rows))
    print('能否闭合(after<=1):', Counter((r['marks_after_chosen'] or -1) <= 1 for r in rows))
    print('有真源对照:', Counter(bool(r['canonical_near']) for r in rows))
    return 0


if __name__ == '__main__':
    sys.exit(main())
