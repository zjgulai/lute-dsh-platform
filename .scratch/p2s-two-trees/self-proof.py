#!/usr/bin/env python3
"""把 ADR-0049 / Note / README 里写下的每个数重算一遍，对不上就报。"""
import json, os, re, subprocess, collections, sys
P2S='/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills'
ICLOUD=os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills")
R=json.load(open('.scratch/p2s-two-trees/dossier.json'))
rec=json.load(open(os.path.join(P2S,'data/code-recovery.json'),encoding='utf-8'))
full=json.load(open(os.path.join(P2S,'generated/source-code.json'),encoding='utf-8'))
cards=json.load(open(os.path.join(P2S,'generated/cards.json'),encoding='utf-8'))['cards']
by_id={c['id']:c for c in cards}
ok=True
def claim(text, got, want):
    global ok
    good = got==want
    ok = ok and good
    print(f"  {'✓' if good else '✗'} {text}: 实测 {got} / 文档 {want}")

print("=== 全称断言逐条重算 ===")
claim('卡指向编号树', R['C1']['numbered'], 18)
claim('卡指向无编号树', R['C1']['plain'], 820)
claim('无 code_path', R['C1']['no_path'], 500)
claim('编号树顶层', len(R['C2']['numbered_tops']), 17)
claim('编号树技能目录', R['C2']['numbered_skills'], 41)
claim('无编号树顶层', len(R['C2']['plain_tops']), 23)
claim('无编号树技能目录', R['C2']['plain_skills'], 1012)
claim('两树技能名交集', len(R['C2']['name_intersection']), 1)
claim('有卡且带年份后缀（反例）', len(R['C3']['exceptions_with_card_year']), 0)
claim('无卡且无年份后缀（反例）', len(R['C3']['exceptions_no_card_no_year']), 0)
claim('有卡组中位行数', R['C3']['with_card_median'], 181)
claim('无卡组中位行数', R['C3']['no_card_median'], 597)
claim('vault .md 总数', R['C5']['vault_md_total'], 1545)
claim('二进制容器', R['C5']['binary'], 1353)
claim('真文本', R['C5']['text'], 192)
claim('git HEAD 定位到的卡', R['C6']['located'], 1338)

print("\n=== 恢复分层自洽 ===")
st=rec['stats']
claim('oracle', st['oracle'], 1262)
claim('unverified', st['unverified'], 40)
claim('unrecovered', st['unrecovered'], 36)
claim('三档之和 = 卡数', st['oracle']+st['unverified']+st['unrecovered'], len(cards))
claim('recovered 字段自洽', st['recovered'], st['oracle']+st['unverified'])
claim('unrecovered 明细和', sum(st['unrecovered_reasons'].values()), st['unrecovered'])
claim('正文份数 = 已恢复数', len(full['cards']), st['recovered'])

print("\n=== 偏移与行数（穷举，不是抽样）===")
offs={r.get('offset') for r in R['C7']['rows'] if r['verdict']=='BLOCK'}
claim('BLOCK 出现的偏移集合', sorted(x for x in offs if x is not None), [1])
claim('窄判据（仅 ③ 段）BLOCK 张数', sum(1 for r in R['C7']['rows'] if r['verdict']=='BLOCK'), 1252)
claim('宽判据（整卡围栏）前缀命中 = oracle 档', R['C7b']['oracle_prefix'], 1262)
claim('宽判据里无节选 = unverified 档', R['C7b']['no_excerpt'], 40)
claim('宽判据里未恢复 = 21 + 15', R['C7b']['no_match']+R['C7b']['no_fence'], 36)
claim('两种判据的差', 1262-1252, 10)
ol={r.get('offset') for r in rec['cards'].values() if r.get('tier')=='oracle'}
claim('索引里 oracle 的偏移集合', sorted(ol), [1])

print("\n=== 体量（口径要说清是哪一批）===")
lines_recovered=sum(r['lines'] for r in rec['cards'].values() if r['tier']!='unrecovered')
lines_allseg=sum(x['vault_lines'] for x in R['C7']['rows'] if x['vault_lines'])
print(f"  · 已恢复（1,{st['recovered']} 张）行数合计 = {lines_recovered:,}")
print(f"  · 所有含代码段的卡（1,{lines_allseg and sum(1 for x in R['C7']['rows'] if x['vault_lines'])} 张）行数合计 = {lines_allseg:,}")
claim('文档写的 252,823 = 含代码段那一批', lines_allseg, 252823)
print(f"  · 恢复正文实际落盘行数 = {sum(r['lines'] for r in rec['cards'].values() if r['tier']!='unrecovered'):,}")

print("\n=== 出口零密钥（负结果必须验真）===")
# 不在这里写死 key：`.scratch/**` 在 .gitignore 里是**白名单**（`!.scratch/**`），
# 写进来就等于把凭证提交进仓库。改为从派生正文里现取一个样本。
src=open(os.path.join(P2S,'generated/source-code.json'),encoding='utf-8').read()
_keys=set(re.findall(r'sk-[a-f0-9]{32}', src))
if not _keys:
    print('  ✗ 派生正文里找不到任何 sk- 串——脱敏检测失去样本，无法证明出口是干净的'); ok=False
KEY=sorted(_keys)[0] if _keys else ''
claim('派生正文里的真实 key 出现次数（>0 才说明检测有效）', src.count(KEY) if KEY else 0, 3)
n=0
for r,_,fs in os.walk(os.path.join(P2S,'staging')):
    for f in fs:
        p=os.path.join(r,f)
        try: n+=open(p,encoding='utf-8',errors='replace').read().count(KEY)
        except Exception: pass
claim('key 在 staging（出口）里出现次数', n, 0)
hits=set()
for r,_,fs in os.walk(os.path.expanduser('~/.dsh/skills')):
    if 'implementation.py' in fs:
        t=open(os.path.join(r,'implementation.py'),encoding='utf-8',errors='replace').read()
        if KEY in t: hits.add(r)
claim('key 在已装技能库里出现次数', len(hits), 0)

print("\n=== 卡面节选 = 第 6 行起（先前手工跑过，这里并入自证）===")
import importlib.util
_s=importlib.util.spec_from_file_location('bca', os.path.join(P2S,'scripts/build-code-availability.py'))
bca=importlib.util.module_from_spec(_s); _s.loader.exec_module(bca)
cls=json.load(open(os.path.join(P2S,'data/classification.json'),encoding='utf-8'))
slug={i['id']:i.get('slug') for i in (cls['items'] if isinstance(cls,dict) else cls) if isinstance(i,dict)}
found={}
for r,_,fs in os.walk(os.path.join(P2S,'staging')):
    if 'implementation.py' in fs:
        found[os.path.basename(os.path.dirname(r))]=os.path.join(r,'implementation.py')
c=collections.Counter()
for cid,rr in rec['cards'].items():
    if rr['tier']=='unrecovered': continue
    p=found.get(slug.get(cid))
    if not p: c['NO_FILE']+=1; continue
    L=open(p,encoding='utf-8').read().split('\n')
    body='\n'.join(L[5:]).rstrip('\n')
    if len(body.split('\n'))!=rr['lines']: c['LINES_BAD']+=1; continue
    if rr['tier']=='oracle':
        ex=bca.split_section(by_id[cid]['sections'].get(bca.SECTION,''))[2]
        bl=[x.rstrip() for x in body.split('\n')]; el=[x.rstrip() for x in (ex or '').split('\n')]
        c['AT6' if bl[:len(el)]==el else ('AT6_REDACTED' if any('REDACTED' in x for x in bl[:len(el)]) else 'MISMATCH')]+=1
    else: c['unverified']+=1
print('  ', dict(c))
claim('无一例外', c.get('MISMATCH',0)+c.get('NO_FILE',0)+c.get('LINES_BAD',0), 0)
claim('对上的总数', c.get('AT6',0)+c.get('AT6_REDACTED',0)+c.get('unverified',0), st['recovered'])

print()
print('全部对账通过' if ok else '✗ 有对不上的项')
sys.exit(0 if ok else 1)
