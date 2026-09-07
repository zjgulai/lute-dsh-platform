#!/usr/bin/env python3
"""契约三键应用：把 input_contract/output_contract/example 追加进 frontmatter。
用法: python3 skill-contract-apply.py [--apply]
幂等：三键任一已存在则跳过该技能；.bak 已存在不覆盖（Tier1 建的原始备份保留）。
"""
import os, re, sys, json, glob

APPLY = "--apply" in sys.argv
SUG_DIR = "/tmp/skill-contract"
ROOT = os.path.expanduser("~/.dsh/skills")

suggestions = []
for f in sorted(glob.glob(os.path.join(SUG_DIR, "sug*.json"))):
    suggestions.extend(json.load(open(f, encoding="utf-8")))

results = {"applied": [], "skipped": [], "invalid": []}
for sug in suggestions:
    if sug.get("skip") is True:
        results["skipped"].append(sug.get("skill", "") + "(skip)")
        continue
    name = sug.get("skill", "")
    f = os.path.join(ROOT, name, "SKILL.md")
    if not os.path.isfile(f):
        results["invalid"].append((name, "missing"))
        continue
    text = open(f, encoding="utf-8").read()
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    if not m:
        results["invalid"].append((name, "no frontmatter"))
        continue
    fm = m.group(1)
    # 幂等：任一键已存在跳过
    if any(re.search(rf"^{k}:", fm, re.M) for k in ("input_contract", "output_contract", "example")):
        results["skipped"].append(name)
        continue
    # 校验三键存在且非空
    ic = (sug.get("input_contract") or "").strip()
    oc = (sug.get("output_contract") or "").strip()
    ex = (sug.get("example") or "").strip()
    if not (ic and oc and ex):
        results["invalid"].append((name, "empty field"))
        continue
    # 长度约束（≤50 字按字符粗略计）
    if len(ic) > 60 or len(oc) > 60 or len(ex) > 80:
        results["invalid"].append((name, "too long"))
        continue
    # YAML 安全转义（值含特殊字符用双引号包裹）
    def esc(v):
        if re.search(r'[:#\[\]{}&*!|>@`"]', v):
            return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'
        return v
    add = (f'input_contract: {esc(ic)}\n'
           f'output_contract: {esc(oc)}\n'
           f'example: {esc(ex)}\n')
    results["applied"].append((name, ic[:30], oc[:30]))
    if APPLY:
        new_fm = fm.rstrip() + "\n" + add
        open(f, "w", encoding="utf-8").write(text.replace(fm, new_fm, 1))

print(json.dumps({
    "mode": "apply" if APPLY else "dry-run",
    "total": len(suggestions),
    "applied_count": len(results["applied"]),
    "applied": results["applied"],
    "skipped": results["skipped"],
    "invalid": results["invalid"],
}, ensure_ascii=False, indent=1))
