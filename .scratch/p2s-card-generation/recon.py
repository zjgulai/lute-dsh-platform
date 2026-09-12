#!/usr/bin/env python3
"""本轮取证 R2：用**与恢复管线逐字相同**的口径，在 vault 全历史里找源站节选。

R1 用了自己写的围栏/节选提取，与管线不同口径 —— 那正是上一轮栽过的坑
（自写提取静默拿错）。这里直接 import 管线的 split_section / prefix_offset，
并把管线自己的围栏正则抄过来，口径不可能再分叉。

带两组对照：
  · 对照组 A（阳性）：从 oracle 集里抽 20 张，节选**应当**在 HEAD 命中。
  · 对照组 B（阴性）：把节选末尾接一行垃圾，**应当**全不命中。

只读。用法：python3 .scratch/p2s-card-generation/recon.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import random
import re
import subprocess
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills'
ICLOUD = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills")
REV = '4a4fa0d49e44dfaa50a730293a61dc6269af53d9'

# 从管线原样加载，避免口径分叉
_spec = importlib.util.spec_from_file_location('bsc', os.path.join(PKG, 'scripts/build-source-code.py'))
bsc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bsc)

SEC = re.compile(r'^##\s*([①②③④⑤⑥⑦⑧⑨])\s*([^\n]*)$', re.M)


def git(*args: str) -> str:
    p = subprocess.run(['git', '-c', 'core.quotepath=false', *args], cwd=ICLOUD,
                       capture_output=True)
    if p.returncode != 0:
        return ''
    return p.stdout.decode('utf-8', 'replace')


def blob(path: str, rev: str = REV) -> str | None:
    p = subprocess.run(['git', '-c', 'core.quotepath=false', 'cat-file', '-p', f'{rev}:{path}'],
                       cwd=ICLOUD, capture_output=True)
    if p.returncode != 0:
        return None
    if p.stdout[:3] == b'\x88}\x1c':
        raise SystemExit(f'FATAL: {path}@{rev} 是二进制容器')
    return p.stdout.decode('utf-8', 'replace')


def sec3(text: str) -> str:
    """vault 卡的 ③ 段（带圈数字），与 dossier 同形"""
    marks = [(m.start(), m.group(1)) for m in SEC.finditer(text)]
    for i, (pos, num) in enumerate(marks):
        if num == '③':
            end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
            return text[pos:end]
    return ''


def excerpt_of(card: dict) -> str | None:
    """源站卡 ⑦ 段 → 节选正文。**逐字用管线的 split_section**。"""
    return bsc.split_section(card['sections'].get(bsc.SECTION, ''))[2]


def hit(code: str, text: str):
    """节选是否为**整张卡**里某个围栏的开头；返回 (围栏位次, 围栏行数) 或 None。

    注意：管线是对整卡取围栏（build-source-code.py: fs = fences(text)），
    不是只取 ③ 段——实测有卡把代码放在 ② 段（如
    Skill-Supplier-Capacity-Booking-Engine 的标题是 ①②④⑤，没有 ③）。
    R1 只取 ③ 段，与管线口径分叉，对照组的 20 张里因此漏了 1 张。
    """
    for k, f in enumerate(bsc.fences(text)):
        if bsc.prefix_offset(code, f) is not None:
            return k, len(f.rstrip('\n').split('\n'))
    return None


def main() -> int:
    rec = json.load(open(os.path.join(PKG, 'data/code-recovery.json')))
    src = json.load(open(os.path.join(PKG, 'generated/cards.json')))['cards']
    by_id = {c['id']: c for c in src}
    R = {}

    # ── 对照组 A：oracle 卡在 HEAD 必须命中 ───────────────────────
    oracles = [c for c, v in rec['cards'].items() if v.get('tier') == 'oracle']
    random.seed(20260912)
    sample = random.sample(sorted(oracles), 20)
    a_ok = 0
    cache: dict[str, str] = {}

    def vault_text(path: str, rev: str = REV) -> str:
        key = f'{rev}:{path}'
        if key not in cache:
            cache[key] = blob(path, rev) or ''
        return cache[key]

    for cid in sample:
        path = rec['cards'][cid]['vault_path']
        ex = excerpt_of(by_id[cid])
        if ex and hit(ex, vault_text(path)):
            a_ok += 1
    R['control_A_positive'] = f'{a_ok}/20'
    print(f'对照组 A（阳性，oracle 抽样 20 张 @HEAD）: {a_ok}/20 命中'
          f'  {"✔ 方法可用" if a_ok == 20 else "✘ 方法本身有问题，停"}')
    if a_ok != 20:
        return 1

    # ── 对照组 B：篡改节选必须全不命中 ────────────────────────────
    b_hit = 0
    for cid in sample:
        path = rec['cards'][cid]['vault_path']
        ex = excerpt_of(by_id[cid])
        if ex and hit(ex + '\n# TAMPERED-CONTROL-LINE-9f3a', vault_text(path)):
            b_hit += 1
    R['control_B_negative'] = f'{b_hit}/20 误命中'
    print(f'对照组 B（阴性，节选尾接垃圾行）: {b_hit}/20 误命中'
          f'  {"✔ 不是橡皮图章" if b_hit == 0 else "✘ 判据太松"}')
    if b_hit:
        return 1
    print()

    # ── 主项：21 张 EXCERPT_NOT_FOUND 在 vault 全历史里的落点 ──────
    bad = sorted(c for c, v in rec['cards'].items()
                 if v.get('reason') == 'EXCERPT_NOT_FOUND_IN_VAULT')
    print(f'== 主项：{len(bad)} 张 EXCERPT_NOT_FOUND_IN_VAULT，逐版回溯 ==\n')

    rows = []
    for cid in bad:
        path = rec['cards'][cid]['vault_path']
        ex = excerpt_of(by_id[cid])
        ex_lines = len(ex.split('\n')) if ex else 0
        log = [l for l in git('log', '--format=%H|%ad|%s', '--date=short', REV, '--', path)
               .strip().split('\n') if l]

        head_hit = hit(ex, vault_text(path)) if ex else None
        hits = []
        for line in log:
            rev = line.split('|')[0]
            t = vault_text(path, rev)
            if not t:
                continue
            h = hit(ex, t) if ex else None
            if h:
                hits.append((rev, line.split('|')[1], h))
        rows.append(dict(card=cid, excerpt_lines=ex_lines, commits=len(log),
                         head_hit=head_hit, hist_hits=[(r, d, h) for r, d, h in hits]))
        tag = 'HEAD 命中(管线口径下不该在这)' if head_hit else (
            f'历史命中 @{hits[-1][1]}' if hits else '全历史无')
        print(f'{"✔" if hits else "✘"} {cid}')
        print(f'    节选 {ex_lines} 行 · {len(log)} 次提交 · {tag}'
              + (f' (共 {len(hits)} 版命中)' if len(hits) > 1 else ''))

    n_hist = sum(1 for r in rows if r['hist_hits'])
    n_head = sum(1 for r in rows if r['head_hit'])
    n_none = sum(1 for r in rows if not r['hist_hits'])
    R['main'] = dict(total=len(bad), hist=n_hist, head=n_head, none=n_none)
    print(f'\n小结：历史命中 {n_hist}/{len(bad)}；HEAD 命中 {n_head}；全历史无 {n_none}')

    json.dump(R | {'rows': rows}, open(os.path.join(HERE, 'recon-r2.json'), 'w'),
              ensure_ascii=False, indent=2)
    return 0


if __name__ == '__main__':
    sys.exit(main())
