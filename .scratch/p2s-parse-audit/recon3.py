#!/usr/bin/env python3
"""recon3 — 拿仓内真源码当外部真值，判「卡里的实现」是谁、到哪结束。

真值来源：vault 仓 git 历史里 `paper2skills-code/**/*.py`（1,288 个，rev 同管线）。
匹配：卡 ③ 段 meta 里的「代码路径」是卡自己的声明，优先用它；其次用 slug 猜。

三条量：
  P   卡实现是否为真源文件的**前缀**（忽略行尾空白）→ 是则截断位置可精确指出
  J   行签名 Jaccard（归一化后 ≥8 字符的非注释行集合）
  L   卡实现行数 / 真源行数
只读。输出 recon3.json。
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


def canonical_files():
    out = subprocess.run(['git', '-C', REPO, 'ls-tree', '-r', '--name-only', REV, 'paper2skills-code/'],
                         capture_output=True)
    paths = [p for p in out.stdout.decode('utf-8').split('\n') if p.endswith('.py')]
    spec = '\n'.join(f'{REV}:{p}' for p in paths) + '\n'
    got = subprocess.run(['git', '-C', REPO, 'cat-file', '--batch'],
                         input=spec.encode(), capture_output=True).stdout
    pos = 0
    files = {}
    for p in paths:
        nl = got.index(b'\n', pos)
        hdr = got[pos:nl].decode().split()
        size = int(hdr[2])
        files[p] = got[nl + 1:nl + 1 + size].decode('utf-8', 'replace')
        pos = nl + 1 + size + 1
    return files


def sig(text):
    out = set()
    for l in text.split('\n'):
        s = re.sub(r'\s+', '', l)
        if len(s) >= 8 and not s.startswith('#'):
            out.add(s)
    return out


def strip_path(p):
    return p.strip().strip('`').strip()


def code_path_of(card_text):
    """卡 ③ 段 meta 的「代码路径」声明（与 build-code-availability.py 同口径取 ⑦ 段）。"""
    m = re.search(r'\*\*代码路径\*\*\s*\|\s*`?([^`|\n]+?)`?\s*\|', card_text)
    return strip_path(m.group(1)) if m else None


def main():
    here = HERE
    blobs = pickle.load(open(os.path.join(here, 'vault-blobs.pkl'), 'rb'))
    rec = json.load(open(os.path.join(PKG, 'data', 'code-recovery.json'), encoding='utf-8'))['cards']
    full = json.load(open(os.path.join(PKG, 'generated', 'source-code.json'), encoding='utf-8'))['cards']
    canon = canonical_files()
    print('真源 py 文件: %d' % len(canon))
    by_base = {}
    for p, t in canon.items():
        by_base.setdefault(p, t)
    # 声明路径 → 真路径（声明里常是旧的中文域目录，按 basename 目录名兜底）
    dir_index = {}
    for p in canon:
        parts = p.split('/')
        dir_index.setdefault(parts[-2], []).append(p)

    def resolve(decl):
        if not decl:
            return None, 'no_decl'
        d = decl.strip()
        for cand in (d, 'paper2skills-code/' + d.lstrip('/')):
            if cand in canon:
                return cand, 'exact'
        # 去掉域目录那一段再试
        parts = d.split('/')
        if len(parts) >= 2:
            tail = parts[-1]
            for p in canon:
                if p.endswith('/' + tail) and len(parts) >= 3 and parts[-2] in p:
                    return p, 'tail'
        return None, 'unresolved'

    rows = []
    for cid, c in rec.items():
        if c.get('parses') is not False:
            continue
        text = blobs[c['vault_path']]
        code = full[cid]['code']
        decl = code_path_of(text)
        path, how = resolve(decl)
        r = {'card': cid, 'tier': c['tier'], 'declared': decl, 'how': how,
             'canonical': path, 'recovered_lines': len(code.split('\n')),
             'parses': False}
        if path:
            ct = canon[path]
            cl = [x.rstrip() for x in code.split('\n')]
            tl = [x.rstrip() for x in ct.split('\n')]
            n = 0
            while n < len(cl) and n < len(tl) and cl[n] == tl[n]:
                n += 1
            r['prefix_len'] = n
            r['is_prefix'] = (n == len(cl))
            r['canonical_lines'] = len(tl)
            s1, s2 = sig(code), sig(ct)
            r['jaccard'] = round(len(s1 & s2) / max(1, len(s1 | s2)), 3)
            r['coverage_of_card'] = round(len(s1 & s2) / max(1, len(s1)), 3)
            r['canonical_tail'] = tl[-3:]
        rows.append(r)

    json.dump({'rows': rows}, open(os.path.join(here, 'recon3.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    for r in rows:
        print('%-52s %-10s how=%-9s canon=%-4s prefix=%-6s cov=%-6s jac=%-6s %s' % (
            r['card'], r['tier'], r['how'], r.get('canonical_lines', '—'),
            r.get('is_prefix', '—'), r.get('coverage_of_card', '—'), r.get('jaccard', '—'),
            (r['canonical'] or r['declared'] or '')[:60]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
