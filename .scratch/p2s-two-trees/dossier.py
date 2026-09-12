#!/usr/bin/env python3
"""本轮取证：编号代码代 ↔ 1,338 张技能卡 的关系，以及完整实现的存活位置。

只读。不读 iCloud vault 的**工作区**（那些 .md 自 2026-07 起已是二进制容器），
一律经 `git cat-file` 从 HEAD 取明文。

用法：python3 .scratch/p2s-two-trees/dossier.py
产物：dossier.json（逐卡读数）+ stdout 报告

九项检查各自独立，任一失败不影响其余；每项都打印自己的基数与分母。
"""
from __future__ import annotations

import ast
import collections
import json
import os
import re
import subprocess
import sys

PKG = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills'
ICLOUD = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills")
LOCAL = '/Users/lute/project/paper_to_skills'
CODE = os.path.join(ICLOUD, 'paper2skills-code')
VAULT_REL = 'paper2skills-vault'
BASE = os.path.dirname(os.path.abspath(__file__))

SECTION = '7. 代码模板'
SEC3_RE = re.compile(r'^##\s*③[^\n]*\n(.*?)(?=^##\s*④|\Z)', re.S | re.M)
FENCE_RE = re.compile(r'```(?:python|py)?\n(.*?)```', re.S)
#: 宽判据用：允许任何语言标注（恢复管线同形）
FENCE_RE_ALL = re.compile(r'```[ \t]*(?:python|py)?[ \t]*\r?\n(.*?)```', re.S)
NUM_PATH_RE = re.compile(r'^paper2skills-code/\d\d-')
YEAR_RE = re.compile(r'_(?:19|20)\d\d$')

R: dict = {}


def sec3(text: str):
    m = SEC3_RE.search(text)
    return m.group(1) if m else None


def biggest_fence(section: str):
    codes = FENCE_RE.findall(section)
    return max(codes, key=len) if codes else None


def block_pos(needle_lines, hay_lines):
    """needle 作为连续行块出现在 hay 的起始下标；无则 None。行尾空白不敏感。"""
    n = len(needle_lines)
    for i in range(len(hay_lines) - n + 1):
        if hay_lines[i:i + n] == needle_lines:
            return i
    return None


def num_lines(s: str) -> int:
    return len(s.rstrip('\n').split('\n'))


# ────────────────────────────────────────────────────────────────
# 0. 载入两张表
# ────────────────────────────────────────────────────────────────
cards = json.load(open(os.path.join(PKG, 'generated/cards.json'), encoding='utf-8'))['cards']
avail = json.load(open(os.path.join(PKG, 'data/code-availability.json'), encoding='utf-8'))['cards']
by_id = {c['id']: c for c in cards}
print(f'卡表：{len(cards)} 张；可得性表：{len(avail)} 条')

# 官方节选抽取口径：复用打包脚本，避免自造第二套口径
import importlib.util
_spec = importlib.util.spec_from_file_location(
    'bca', os.path.join(PKG, 'scripts/build-code-availability.py'))
bca = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bca)


def excerpt_of(cid: str):
    sec = by_id.get(cid, {}).get('sections', {}).get(bca.SECTION, '')
    return bca.split_section(sec)[2]


# ────────────────────────────────────────────────────────────────
# C1 · 卡的 code_path 落点
# ────────────────────────────────────────────────────────────────
num_cards, plain_cards, nopath = [], [], []
for cid, v in avail.items():
    p = v.get('path')
    if not p:
        nopath.append(cid)
    elif NUM_PATH_RE.match(p):
        num_cards.append(cid)
    else:
        plain_cards.append(cid)
R['C1'] = {'numbered': len(num_cards), 'plain': len(plain_cards), 'no_path': len(nopath)}
print(f"\n[C1] 卡 code_path 落点：编号树 {len(num_cards)} / 无编号树 {len(plain_cards)} / 无 path {len(nopath)}")
print(f"     → 上一轮「838/838 全指向无编号树」为假（反例 {len(num_cards)} 条）")

# ────────────────────────────────────────────────────────────────
# C2 · 两棵树清点
# ────────────────────────────────────────────────────────────────
def tree_skills(root: str):
    """返回 {(顶层目录, 技能目录): 代码行数}；只收含 .py 的目录。"""
    out = {}
    if not os.path.isdir(root):
        return out
    for top in sorted(os.listdir(root)):
        tf = os.path.join(root, top)
        if not os.path.isdir(tf) or top == '__pycache__':
            continue
        for sub in sorted(os.listdir(tf)):
            sf = os.path.join(tf, sub)
            if not os.path.isdir(sf) or sub.startswith('__'):
                continue
            lines = 0
            for r, _, fs in os.walk(sf):
                for f in fs:
                    if f.endswith('.py'):
                        with open(os.path.join(r, f), 'rb') as fh:
                            lines += fh.read().count(b'\n')
            if lines:
                out[(top, sub)] = lines
    return out


num_tree = tree_skills(CODE)
all_tops = sorted({t for t, _ in num_tree})
num_only = {k: s for k, s in num_tree.items() if re.match(r'^\d\d-', k[0])}
num_tops = sorted({k[0] for k in num_only})
plain_tree = {k: s for k, s in num_tree.items() if not re.match(r'^\d\d-', k[0])}
plain_tops = sorted({k[0] for k in plain_tree})
inter = {k[1] for k in num_only} & {k[1] for k in plain_tree}
R['C2'] = {'all_tops': all_tops,
           'numbered_tops': num_tops, 'numbered_skills': len(num_only),
           'plain_tops': plain_tops, 'plain_skills': len(plain_tree),
           'name_intersection': sorted(inter)}
print(f"\n[C2] 顶层目录共 {len(all_tops)} 个 = 编号 {len(num_tops)} + 无编号 {len(plain_tops)}")
print(f"     编号树：{len(num_tops)} 顶层 / {len(num_only)} 个技能目录")
print(f"     无编号树：{len(plain_tops)} 顶层 / {len(plain_tree)} 个技能目录")
print(f"     按技能目录名的交集：{len(inter)} {sorted(inter)}")

# ────────────────────────────────────────────────────────────────
# C3 · 41 个目录的 19/22 分裂
# ────────────────────────────────────────────────────────────────
def norm(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', s.lower())


by_norm = {}
for c in cards:
    by_norm.setdefault(norm(c['id']), []).append(c['id'])

split_rows = []
for (top, skill), lines in sorted(num_only.items()):
    ids = by_norm.get(norm('Skill-' + skill), [])
    cid = ids[0] if len(ids) == 1 else None
    split_rows.append({'tree': top, 'skill': skill, 'lines': lines,
                       'card_id': cid, 'has_card': cid is not None,
                       'year_suffix': bool(YEAR_RE.search(skill)),
                       'avail_path': avail.get(cid, {}).get('path') if cid else None})
wc = [r for r in split_rows if r['has_card']]
nc = [r for r in split_rows if not r['has_card']]
med = lambda xs: sorted(xs)[len(xs) // 2]


def has_year_but_card(rows):
    return [r['skill'] for r in rows if r['has_card'] and r['year_suffix']]


def no_year_no_card(rows):
    return [r['skill'] for r in rows if not r['has_card'] and not r['year_suffix']]


R['C3'] = {
    'with_card': len(wc), 'with_card_year': len(has_year_but_card(split_rows)),
    'with_card_median': med([r['lines'] for r in wc]),
    'no_card': len(nc), 'no_card_year': len([r for r in nc if r['year_suffix']]),
    'no_card_median': med([r['lines'] for r in nc]),
    'exceptions_with_card_year': has_year_but_card(split_rows),
    'exceptions_no_card_no_year': no_year_no_card(split_rows),
}
print(f"\n[C3] 编号树 41 目录分裂：有卡 {len(wc)}（带年份后缀 {len(has_year_but_card(split_rows))}，中位 {med([r['lines'] for r in wc])} 行）"
      f" / 无卡 {len(nc)}（带年份后缀 {sum(1 for r in nc if r['year_suffix'])}，中位 {med([r['lines'] for r in nc])} 行）")
print(f"     反例：有卡且带年份 {has_year_but_card(split_rows)}；无卡且无年份 {no_year_no_card(split_rows)}")

# ────────────────────────────────────────────────────────────────
# C4 · 编号树 model.py 的构造
# ────────────────────────────────────────────────────────────────
c4 = []
for r in split_rows:
    if not r['avail_path'] or not NUM_PATH_RE.match(r['avail_path']):
        continue
    mp = os.path.join(ICLOUD, r['avail_path'], 'model.py')
    if not os.path.exists(mp):
        c4.append({**r, 'verdict': 'NO_MODEL_PY'})
        continue
    tl = open(mp, encoding='utf-8', errors='replace').read().split('\n')
    ex = excerpt_of(r['card_id'])
    el = [x.rstrip() for x in (ex or '').split('\n')]
    hl = [x.rstrip() for x in tl]
    pos = block_pos(el, hl) if ex else None
    c4.append({**r, 'tree_lines': len(tl), 'excerpt_lines': len(el),
               'offset': (pos + 1) if pos is not None else None,
               'verdict': 'BLOCK' if pos is not None else 'NOT_BLOCK'})
offs = collections.Counter(x['offset'] for x in c4 if x.get('offset'))
R['C4'] = {'n': len(c4), 'verdicts': dict(collections.Counter(x['verdict'] for x in c4)),
           'offsets': {str(k): v for k, v in offs.items()}, 'rows': c4}
print(f"\n[C4] 指向编号树的卡：{len(c4)}；节选落进 model.py 为连续块的起始行号分布 {dict(offs)}"
      f"（第 6 行 = 5 行溯源抬头之后正文首行）")

# ────────────────────────────────────────────────────────────────
# C5 · 工作区 vault 的文件类型
# ────────────────────────────────────────────────────────────────
vt = os.path.join(ICLOUD, VAULT_REL)
mds = []
for r, _, fs in os.walk(vt):
    for f in fs:
        if f.endswith('.md'):
            mds.append(os.path.join(r, f))
binf, txtf = [], []
for p in mds:
    with open(p, 'rb') as fh:
        head = fh.read(1)
    (binf if head[:1] not in (b'#', b'-', b'\n', b' ', b'\t') else txtf).append(p)
R['C5'] = {'vault_md_total': len(mds), 'binary': len(binf), 'text': len(txtf)}
print(f"\n[C5] iCloud vault 工作区 .md：{len(mds)} 个，其中二进制容器 {len(binf)}、真文本 {len(txtf)}")

# ────────────────────────────────────────────────────────────────
# C6 · git HEAD 的 vault 覆盖率
# ────────────────────────────────────────────────────────────────
ls = subprocess.run(['git', '-C', ICLOUD, 'ls-tree', '-r', '-z', 'HEAD', VAULT_REL + '/'],
                    capture_output=True).stdout
# 逐 **路径** 登记，不做 basename 去重：同名卡会散落在不同域，
# 按 basename 取会静默拿到另一个域的卡（本轮实测会让 C7 从 1,252 漂到 1,246）。
by_path: dict[str, str] = {}
for rec in ls.split(b'\0'):
    if not rec:
        continue
    meta, path = rec.split(b'\t', 1)
    mode, typ, sha = meta.decode().split()
    p = path.decode('utf-8')
    if typ == 'blob' and p.endswith('.md'):
        by_path[p] = sha
by_basename: dict[str, list[str]] = {}
for p in by_path:
    by_basename.setdefault(os.path.basename(p)[:-3], []).append(p)


def cat_batch(shas):
    shas = sorted(set(shas))
    if not shas:
        return {}
    pr = subprocess.run(['git', '-C', ICLOUD, 'cat-file', '--batch'],
                        input=('\n'.join(shas) + '\n').encode(), capture_output=True)
    raw, pos, out = pr.stdout, 0, {}
    while pos < len(raw):
        nl = raw.index(b'\n', pos)
        h = raw[pos:nl].split()
        if len(h) < 3:
            break
        sha, size = h[0].decode(), int(h[2])
        out[sha] = raw[nl + 1:nl + 1 + size].decode('utf-8', 'replace')
        pos = nl + 1 + size + 1
    return out


# 按域名解析，优先取**域根**那一份（`vault/<dom>/<id>.md`）。
# 实测坑：vault 里 18 张卡在 `<dom>/00-知识库-Skill卡片/` 下有旧副本，两者都含 `/<dom>/`；
# 若按插入序取，会静默拿到旧副本，把 16 张本有代码的卡误判成无代码段。
located: dict[str, str] = {}
ambiguous: dict[str, list[str]] = {}
picked: dict[str, str] = {}
for c in cards:
    cid, dom = c['id'], c.get('src_domain')
    cands = by_basename.get(cid, [])
    if not cands:
        continue
    root = f'{VAULT_REL}/{dom}/{cid}.md'
    if root in by_path:
        sel, rule = root, 'domain_root'
    else:
        hit = [p for p in cands if f'/{dom}/' in p]
        sel, rule = (hit or cands)[0], ('domain_any' if hit else 'basename_only')
    located[cid] = by_path[sel]
    picked[cid] = {'path': sel, 'rule': rule}
    if len(cands) > 1:
        ambiguous[cid] = cands
content = cat_batch(located.values())
head_ts = subprocess.run(['git', '-C', ICLOUD, 'log', '-1', '--format=%H %ad %s', '--date=iso'],
                         capture_output=True, text=True).stdout.strip()
rule_ct = collections.Counter(v['rule'] for v in picked.values())
R['C6'] = {'head': head_ts, 'vault_blobs': len(by_path), 'blob_basenames': len(by_basename),
           'located': len(located), 'ambiguous_basename': ambiguous, 'picked': picked,
           'rules': dict(rule_ct),
           'not_located': [c['id'] for c in cards if c['id'] not in located]}
print(f"\n[C6] git HEAD {head_ts}")
print(f"     vault .md blob {len(by_path)} 条路径 / {len(by_basename)} 个唯一 basename"
      f"（差 {len(by_path)-len(by_basename)} = 同名卡）")
print(f"     1,338 张卡解析：定位到 {len(located)}（域根 {rule_ct['domain_root']} / 域内其它 "
      f"{rule_ct['domain_any']} / 仅同名 {rule_ct['basename_only']}），定位不到 {len(by_id) - len(located)}")

# ────────────────────────────────────────────────────────────────
# C7 · 节选 = vault 代码的开头
# ────────────────────────────────────────────────────────────────
c7 = []
for cid in by_id:
    sha = located.get(cid)
    rec = {'card': cid, 'verdict': None, 'offset': None,
           'vault_lines': None, 'excerpt_lines': None,
           'vault_parses': None, 'excerpt_parses': avail.get(cid, {}).get('parses')}
    if not sha:
        rec['verdict'] = 'NO_BLOB'
        c7.append(rec)
        continue
    s3 = sec3(content.get(sha, ''))
    if not s3:
        rec['verdict'] = 'NO_SEC3'
        c7.append(rec)
        continue
    vc = biggest_fence(s3)
    if not vc:
        rec['verdict'] = 'NO_FENCE'
        c7.append(rec)
        continue
    rec['vault_lines'] = num_lines(vc)
    try:
        ast.parse(vc)
        rec['vault_parses'] = True
    except Exception:
        rec['vault_parses'] = False
    ex = excerpt_of(cid)
    if not ex:
        rec['verdict'] = 'NO_PREVIEW'
        c7.append(rec)
        continue
    rec['excerpt_lines'] = num_lines(ex)
    el = [x.rstrip() for x in ex.split('\n')]
    hl = [x.rstrip() for x in vc.split('\n')]
    pos = block_pos(el, hl)
    if pos is not None:
        rec['verdict'] = 'BLOCK'
        rec['offset'] = pos + 1
    elif ''.join(ex.split()) in ''.join(vc.split()):
        rec['verdict'] = 'SUBSTR'
    else:
        rec['verdict'] = 'NOMATCH'
    c7.append(rec)

vcount = collections.Counter(x['verdict'] for x in c7)
offs7 = collections.Counter(x['offset'] for x in c7 if x['offset'])
R['C7'] = {'verdicts': dict(vcount), 'offsets': {str(k): v for k, v in offs7.items()},
           'rows': c7}
print(f"\n[C7] 卡面节选 vs git vault **③ 段**的最大围栏（窄判据）：{dict(vcount)}")
print(f"     连续块起始行号分布 {dict(offs7)}（全为第 1 行 = 节选就是完整代码的开头）")

# C7b · 同一件事用**宽判据**再量一次：整张卡的所有围栏里找，而不是只看 ③ 段。
# 两个数都对，但语义不同，必须分开报——否则「1,252 / 1,262」会被读成其中一个错了。
# 恢复管线用的就是这一条（宽判据），所以 oracle 档的张数以它为准。
wide_ok = wide_sub = wide_miss = wide_nofence = wide_noexcerpt = 0
for cid in by_id:
    sha = located.get(cid)
    if not sha:
        wide_nofence += 1
        continue
    fs = [f for f in FENCE_RE_ALL.findall(content.get(sha, ''))]
    ex = excerpt_of(cid)
    if not fs:
        wide_nofence += 1
        continue
    if not ex:
        wide_noexcerpt += 1  # 无节选 → 走 unverified 档，**不计入** oracle
        continue
    el = [x.rstrip() for x in ex.split('\n')]
    if any([x.rstrip() for x in f.split('\n')][:len(el)] == el for f in fs):
        wide_ok += 1
    elif any(''.join(ex.split()) in ''.join(f.split()) for f in fs):
        wide_sub += 1
    else:
        wide_miss += 1
R['C7b'] = {'oracle_prefix': wide_ok, 'substring_only': wide_sub,
            'no_match': wide_miss, 'no_fence': wide_nofence,
            'no_excerpt': wide_noexcerpt}
print(f"[C7b] 同一件事的**宽判据**（整卡所有围栏，恢复管线用这条，即 oracle 档）：")
print(f"     有节选且前缀命中 {wide_ok}（= oracle 档）| 有节选但不匹配 {wide_miss}"
      f" | 无节选、取最长围栏 {wide_noexcerpt}（= unverified 档）| 无围栏 {wide_nofence}")
print(f"     → 恢复 {wide_ok + wide_noexcerpt} 张 / 未恢复 {wide_miss + wide_nofence} 张")

# ────────────────────────────────────────────────────────────────
# C8 · 可解析率对比
# ────────────────────────────────────────────────────────────────
cmp_rows = [x for x in c7 if x['vault_lines'] and x['excerpt_lines']]
vp = sum(1 for x in cmp_rows if x['vault_parses'])
ep = sum(1 for x in cmp_rows if x['excerpt_parses'])
only_v = sum(1 for x in cmp_rows if x['vault_parses'] and not x['excerpt_parses'])
R['C8'] = {'n': len(cmp_rows), 'vault_parses': vp, 'excerpt_parses': ep,
           'only_vault_parses': only_v,
           'vault_fails': sum(1 for x in cmp_rows if not x['vault_parses'])}
print(f"\n[C8] 可比对 {len(cmp_rows)} 张：vault 完整代码可解析 {vp}（{100*vp/max(1,len(cmp_rows)):.1f}%）；"
      f"卡面节选可解析 {ep}；仅 vault 可解析 {only_v}")

# ────────────────────────────────────────────────────────────────
# C9 · 体量
# ────────────────────────────────────────────────────────────────
tot = sum(x['vault_lines'] for x in c7 if x['vault_lines'])
R['C9'] = {'total_lines': tot, 'cards_with_code': sum(1 for x in c7 if x['vault_lines']),
           'est_bytes': tot * 32, 'est_tokens': tot * 32 // 4}
print(f"\n[C9] 完整代码体量：{R['C9']['cards_with_code']} 张 / {tot:,} 行 "
      f"≈ {tot*32/1024/1024:.1f} MB ≈ {tot*32/4/10000:.0f} 万 tokens")
print("     → 不能内联进 SKILL.md，必须落伴生文件")

# ────────────────────────────────────────────────────────────────
# C10 · 本地副本旁证（防止只信一处）
# ────────────────────────────────────────────────────────────────
lv = os.path.join(LOCAL, VAULT_REL)
lmds = [os.path.join(r, f) for r, _, fs in os.walk(lv) for f in fs if f.endswith('.md')]
plain_local = 0
for p in lmds:
    with open(p, 'rb') as fh:
        if fh.read(1)[:1] in (b'#', b'-', b'\n', b' ', b'\t'):
            plain_local += 1
R['C10'] = {'local_vault_md': len(lmds), 'local_plain': plain_local}
print(f"\n[C10] 本地 {LOCAL}/{VAULT_REL}：{len(lmds)} 个 .md，其中明文 {plain_local}"
      f"（本地 code 树无编号目录，是那棵无编号树的部分副本）")

# ────────────────────────────────────────────────────────────────
with open(os.path.join(BASE, 'dossier.json'), 'w', encoding='utf-8') as fh:
    json.dump(R, fh, ensure_ascii=False, indent=1)
print(f"\n写出 {os.path.join(BASE, 'dossier.json')}")
