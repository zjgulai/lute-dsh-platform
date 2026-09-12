#!/usr/bin/env python3
"""Independent recomputation of the 算法技能 tree — evidence, not a second product.

Why this file exists: every check in the package's own test suite runs the
package's own code. That proves the code still does what it did, and it cannot
prove the code reads the corpus the way a human would. This script is a second,
deliberately unrelated implementation: plain Python, its own frontmatter
scanner, its own join, no import of anything under packages/. If the page and
this script agree, the tree is a property of the files on disk. If they disagree,
one of them is wrong and the diff says which cards.

It is NOT a replacement for the package tests and must not be turned into one —
a second implementation inside the product would be a second home for the same
fact (ADR-0009). It lives here, with the acceptance material it backs.

Inputs (read-only):
  ~/.dsh/skills/p2s-*/SKILL.md          the 1338 cards
  ~/.dsh/.agent-presets/agt-*/manifest.json   the 50 roles
  live-tree.json                        the payload the running host serves

Exit code 0 = every recomputed value equals the payload; 1 = a diff was found.
"""
import collections
import glob
import json
import os
import re
import sys

SKILLS = os.path.expanduser('~/.dsh/skills')
PRESETS = os.path.expanduser('~/.dsh/.agent-presets')
# `ALGO_PAYLOAD` exists so the check can be shown to fail: point it at a copy
# with one card moved and the mismatch must be reported. A checker that has
# never rejected anything is not evidence.
PAYLOAD = os.environ.get('ALGO_PAYLOAD') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'live-tree.json')

FRONTMATTER = re.compile(r'^---\n(.*?)\n---', re.S)
KEY = re.compile(r'^([A-Za-z0-9_-]+):\s*(.*)$')

failures = []


def check(what, got, want):
    """Record one equality; print either way so the run is readable."""
    ok = got == want
    if not ok:
        failures.append(what)
    print(f'  {"ok  " if ok else "FAIL"}  {what}: {got!r}' + ('' if ok else f' != payload {want!r}'))
    return ok


def unquote(value):
    """Strip one layer of matching quotes, as YAML would."""
    if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
        return value[1:-1]
    return value


def frontmatter(path):
    """key -> decoded value for one SKILL.md, or None when it has no block."""
    found = FRONTMATTER.match(open(path, encoding='utf-8').read())
    if found is None:
        return None
    out = {}
    for line in found.group(1).split('\n'):
        matched = KEY.match(line)
        if matched:
            out[matched.group(1)] = unquote(matched.group(2).strip())
    return out


# ── reading the corpus ──────────────────────────────────────────────────────
cards = {}
for directory in sorted(glob.glob(os.path.join(SKILLS, 'p2s-*'))):
    if os.path.isdir(directory):
        cards[os.path.basename(directory)] = frontmatter(os.path.join(directory, 'SKILL.md')) or {}

roles = []
for directory in sorted(glob.glob(os.path.join(PRESETS, 'agt-*'))):
    manifest_path = os.path.join(directory, 'manifest.json')
    if not os.path.exists(manifest_path):
        continue
    manifest = json.load(open(manifest_path, encoding='utf-8'))
    lute = manifest.get('x_lute', {})
    skills = lute.get('skills', {})
    names = (skills.get('material_skill_names')
             or [row.get('name') for row in skills.get('mapping', [])]
             or lute.get('squad', {}).get('skills', []))
    roles.append({
        'id': os.path.basename(directory),
        'order': lute.get('order', 0),
        'plane': lute.get('plane', {}).get('id'),
        'plane_name': lute.get('plane', {}).get('name'),
        'domain': lute.get('domain', {}).get('id'),
        'domain_name': lute.get('domain', {}).get('name'),
        'responsibilities': names,
        'subset': set(skills.get('subset', [])),
    })
roles.sort(key=lambda role: (role['order'], role['id']))

payload = json.load(open(PAYLOAD, encoding='utf-8'))

print(f'corpus: {len(cards)} p2s-* cards, {len(roles)} agt-* roles, payload from live-tree.json')
print('totals in payload:', json.dumps(payload['totals'], ensure_ascii=False))

# ── pass 1: the skeleton ────────────────────────────────────────────────────
print('\npass 1 — skeleton recomputed from card frontmatter')
planes = collections.defaultdict(set)
domains = collections.defaultdict(set)
slices = set()
for fields in cards.values():
    plane, plane_name = fields.get('l1_id'), fields.get('l1_plane')
    domain, domain_name = fields.get('l2_id'), fields.get('l2_domain')
    if plane:
        planes[plane].add(plane_name)
    if domain:
        domains[domain].add(domain_name)
    if plane and domain:
        slices.add((plane, domain))

payload_planes = {plane['id']: plane['name'] for plane in payload['planes']}
payload_domains, payload_slices = set(), set()
for plane in payload['planes']:
    for domain in plane['domains']:
        payload_domains.add(domain['id'])
        payload_slices.add((plane['id'], domain['id']))

check('plane count', len(planes), len(payload_planes))
check('plane names', {next(iter(names)) for names in planes.values()}, set(payload_planes.values()))
check('domain ids', set(domains), payload_domains)
check('plane×domain slices', slices, payload_slices)
check('slices carrying a card', len(slices), payload['totals']['domainSlices'])
check('distinct domains', len(domains), payload['totals']['distinctDomains'])

# ── pass 2: the join, rebuilt from the preset manifests ─────────────────────
print('\npass 2 — role placement recomputed from preset manifests')
owner, duplicates = {}, []
for role in roles:
    for name in role['responsibilities']:
        if name in owner and owner[name] != role['id']:
            duplicates.append((name, owner[name], role['id']))
            continue
        owner[name] = role['id']

check('responsibility names indexing roles', len(owner), 151)
check('names claimed by two roles', len(duplicates), 0)

placed, unplaced = collections.defaultdict(set), []
for name, fields in cards.items():
    l3 = (fields.get('l3_business') or '').split(' / ')[0].strip()
    if l3 in owner:
        placed[owner[l3]].add(name)
    else:
        unplaced.append((name, l3))

check('placed cards', sum(len(group) for group in placed.values()), payload['totals']['placed'])
check('unplaced cards', len(unplaced), payload['totals']['unplaced'])
check('unplaced set', {name for name, _ in unplaced}, {row['name'] for row in payload['unplaced']})

differing, wired_mismatch = 0, 0
for plane in payload['planes']:
    for domain in plane['domains']:
        for role in domain['roles']:
            served = {skill['name'] for skill in role['skills']}
            if served != placed.get(role['id'], set()):
                differing += 1
                print(f'    DIFF {role["agt"]}: payload-only={sorted(served - placed.get(role["id"], set()))[:3]} '
                      f'disk-only={sorted(placed.get(role["id"], set()) - served)[:3]}')
            subset = next((role_row['subset'] for role_row in roles if role_row['id'] == role['id']), set())
            for skill in role['skills']:
                if skill['wired'] != (skill['name'] in subset):
                    wired_mismatch += 1
check('roles whose card set differs', differing, 0)
check('cards whose wired flag differs', wired_mismatch, 0)
check('roles', len(roles), payload['totals']['roles'])
check('empty roles', sum(1 for role in roles if not placed.get(role['id'])), payload['totals']['emptyRoles'])

# ── pass 3: the one key the page can write ─────────────────────────────────
print('\npass 3 — the switch key, as spelled in every card')
forms = collections.Counter()
for name in cards:
    text = open(os.path.join(SKILLS, name, 'SKILL.md'), encoding='utf-8').read()
    matched = re.search(r'^disable-model-invocation:\s*(.*)$', text, re.M)
    forms[(matched.group(1).strip() if matched else '<absent>')] += 1
print(f'  spellings: {dict(forms)}')
reading = {fields.get('disable-model-invocation', 'false') for fields in cards.values()}
check('distinct decoded values of the switch key', reading, {'true'})

print()
if failures:
    print(f'FAIL — {len(failures)} check(s) disagree with the payload: {failures}')
    sys.exit(1)
print('PASS — every recomputed value equals the payload the page renders.')
