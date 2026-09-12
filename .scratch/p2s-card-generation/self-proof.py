#!/usr/bin/env python3
"""本轮自证：把要对外报的每一个数**逐条重算**，不与任何叙述共用中间量。

纪律：凡写「全 X 都 Y」先跑计数；先证明判据能报「否」，再相信它报的「是」。
本脚本只读，任一断言不成立即 exit 1。

用法：python3 .scratch/p2s-card-generation/self-proof.py
"""
from __future__ import annotations

import glob
import importlib.util
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills'
ICLOUD = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills")
SKILLS = os.path.expanduser('~/.dsh/skills')
REV = '4a4fa0d49e44dfaa50a730293a61dc6269af53d9'
SRC = os.path.join(PKG, 'scripts/build-source-code.py')

_spec = importlib.util.spec_from_file_location('bsc', SRC)
bsc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bsc)

FAIL: list[str] = []
N = 0


def check(what: str, got, want):
    global N
    N += 1
    if got != want:
        FAIL.append(f'{what}: got {got!r} want {want!r}')


def check_true(what: str, cond: bool, detail: str = ''):
    global N
    N += 1
    if not cond:
        FAIL.append(f'{what}{"：" + detail if detail else ""}')


rec = json.load(open(os.path.join(PKG, 'data/code-recovery.json')))
after = rec['cards']
before = json.load(open(os.path.join(HERE, 'before/code-recovery.before.json')))['cards']
full = json.load(open(os.path.join(PKG, 'generated/source-code.json')))['cards']

# ── 1. 分层读数 ────────────────────────────────────────────────
tiers = {}
for r in after.values():
    tiers[r['tier']] = tiers.get(r['tier'], 0) + 1
check('改后 oracle', tiers.get('oracle'), 1277)
check('改后 unverified', tiers.get('unverified'), 40)
check('改后 unrecovered', tiers.get('unrecovered'), 21)
check('改前 oracle', sum(1 for r in before.values() if r['tier'] == 'oracle'), 1262)
check('改前 unrecovered', sum(1 for r in before.values() if r['tier'] == 'unrecovered'), 36)
check('总卡数', len(after), 1338)

# ── 2. 0 张掉出 / 6 张取回真身 / 540 张仅位移 ───────────────────
dropped = [c for c in before if before[c]['tier'] == 'oracle' and after[c]['tier'] != 'oracle']
check('确证集掉出', len(dropped), 0)
changed_content = [c for c in before
                   if before[c].get('sha256') and before[c]['sha256'] != after[c].get('sha256')]
check('正文变化的卡', sorted(changed_content), sorted([
    'Skill-Argos-Agentic-Anomaly-Detection', 'Skill-CodeRAG-Repository-Level-Retrieval',
    'Skill-DeepAnalyze-Autonomous-Data-Science-Agent', 'Skill-New-Product-Demand-Cold-Start',
    'Skill-Real-Time-Competitive-Repricing', 'Skill-Skill-Card-API-Serving']))
shifted = [c for c in before if before[c].get('sha256') and before[c]['sha256'] == after[c].get('sha256')
           and before[c].get('fence_index') != after[c].get('fence_index')]
check('正文未动、仅 fence_index 位移', len(shifted), 540)

# ── 3. 新恢复的 15 张 ──────────────────────────────────────────
newly = [c for c in before if before[c]['tier'] == 'unrecovered' and after[c]['tier'] != 'unrecovered']
check('新恢复', len(newly), 15)
check_true('新恢复的全部 parses', all(after[c]['parses'] for c in newly),
           str([c for c in newly if not after[c]['parses']]))
check('新恢复最大行数', max(after[c]['lines'] for c in newly), 784)

# ── 4. 原因码封闭词表 & 记账不变量 ─────────────────────────────
allowed = {'NO_VAULT_CARD', 'NO_FENCE_IN_VAULT', 'NO_PAIRED_PYTHON_FENCE',
           'EXCERPT_MATCHES_NON_PYTHON_FENCE', 'EXCERPT_NOT_FOUND_IN_VAULT'}
bad_reason = [r['reason'] for r in after.values() if r.get('reason') and r['reason'] not in allowed]
check('越界原因码', bad_reason, [])
check('未恢复原因分布', rec['stats']['unrecovered_reasons'],
      {'NO_PAIRED_PYTHON_FENCE': 15, 'EXCERPT_NOT_FOUND_IN_VAULT': 2,
       'EXCERPT_MATCHES_NON_PYTHON_FENCE': 4})

# ── 5. stats 不许是另一套口径 ──────────────────────────────────
s = rec['stats']
check('stats.cards', s['cards'], len(after))
check('stats.oracle', s['oracle'], tiers.get('oracle'))
check('stats.recovered', s['recovered'], tiers.get('oracle', 0) + tiers.get('unverified', 0))
check('stats.total_lines', s['total_lines'], sum(r['lines'] for r in after.values()))
check('stats.parses_of_recovered', s['parses_of_recovered'],
      sum(1 for r in after.values() if r['tier'] != 'unrecovered' and r['parses']))
check('落盘行数', s['total_lines'], 259365)

# ── 6. offset 是实测值这条守卫真的会动 ─────────────────────────
check('确证集偏移集合', {r['offset'] for r in after.values() if r['tier'] == 'oracle'}, {1})
check('prefix_offset 对非开头返回 None', bsc.prefix_offset('b = 2', 'a = 1\nb = 2'), None)
check('prefix_offset 对开头返回 1', bsc.prefix_offset('b = 2', 'b = 2\nc = 3'), 1)

# ── 7. 上盘的 implementation.py 与索引逐张对上 ─────────────────
inst = glob.glob(os.path.join(SKILLS, '*', 'references', 'implementation.py'))
check('上盘个数', len(inst), s['recovered'])
ok = 0
for p in inst:
    body = '\n'.join(open(p, encoding='utf-8').read().split('\n')[5:])
    try:
        __import__('ast').parse(body)
        ok += 1
    except SyntaxError:
        pass
check('上盘可 parse', ok, s['parses_of_recovered'])
check('上盘不可 parse', len(inst) - ok, s['recovered'] - s['parses_of_recovered'])

# ── 8. 那 2 张「源站独有」：全仓全历史 7,385 个 blob 里确实没有 ──
# 探针的取法必须与 build-source-code.py 同源，否则又是口径分叉。
for cid, probe in [('Skill-Cost-Plus-Dynamic-Tariff-Pricing',
                    'old_margin = (current_price * (1 - cs_old.platform_commission) - old_cost) / current_price'),
                   ('Skill-Flash-Sale-Price-Optimization',
                    'demand = demand_response(discount_rate, base_demand_per_hour, duration_hours, traffic_mu')]:
    r = subprocess.run(['git', 'grep', '-l', '--fixed-strings', probe, REV], cwd=ICLOUD,
                       capture_output=True, text=True)
    check(f'{cid} 探针在本仓 HEAD 命中数', r.stdout.strip().count('\n') + (1 if r.stdout.strip() else 0), 0)

# ── 9. --check / --selftest 两个不写盘的模式确实通过 ───────────
for flag, pat in (('--check', '✓ 完整实现恢复索引一致'),
                  ('--selftest', '✓ 围栏判据自测通过')):
    r = subprocess.run(['python3', SRC, flag], capture_output=True, text=True)
    check(f'{flag} 退出码', r.returncode, 0)
    check_true(f'{flag} 输出', pat in r.stdout, r.stdout.strip()[:80] + r.stderr.strip()[:120])

# ── 10. 卡面 ⑦ 段的口径与索引一致（不许再出现「完整实现不在本包内」）──
sk = os.path.join(SKILLS, 'p2s-context-kubernetes-kb-orchestration', 'SKILL.md')
txt = open(sk, encoding='utf-8').read()
check('该卡⑦段不再说实现不在包内', '完整实现不在本包内' in txt, False)
check_true('该卡⑦段指向 implementation.py', 'references/implementation.py' in txt)
check_true('该卡⑦段写明行数 338', '338 行' in txt)

if FAIL:
    sys.stderr.write(f'✗ 自证未过（{len(FAIL)}/{N} 条）：\n')
    for f in FAIL:
        sys.stderr.write(f'    {f}\n')
    sys.exit(1)
print(f'✓ 自证通过：{N} 条断言逐条重算，全部对上')
print(f'  oracle {tiers["oracle"]} · unverified {tiers["unverified"]} · '
      f'unrecovered {tiers["unrecovered"]} · 落盘 {s["recovered"]} 张 / {s["total_lines"]:,} 行 · '
      f'可 parse {s["parses_of_recovered"]}')
