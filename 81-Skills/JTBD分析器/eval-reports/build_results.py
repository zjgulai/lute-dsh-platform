#!/usr/bin/env python3
"""Build results.json from blind test results + backfill Excel."""
import json, openpyxl

# 3 rounds of conclusions (trigger/no-trigger/load)
# Extracted from盲测 subagent outputs

# Round 1 (21180c71)
r1_pos = {i: "触发" for i in range(1,33)}
r1_neg = {i: "不触发" for i in range(33,65)}
r1_near = {
    65:"触发",66:"触发",67:"触发",68:"不触发",69:"不触发",70:"触发",71:"触发",
    72:"不触发",73:"不触发",74:"不触发",75:"触发",76:"触发",77:"不触发",78:"不触发",
    79:"触发",80:"不触发",81:"不触发",82:"触发",83:"不触发",84:"不触发",85:"不触发",
    86:"不触发",87:"不触发",88:"不触发"
}
r1_bound = {
    89:"触发",90:"不触发",91:"不触发",92:"不触发",93:"触发",94:"触发",95:"触发",
    96:"不触发",97:"触发",98:"不触发",99:"触发",100:"触发"
}
r1_call = {"调用1":"加载","调用2":"加载","调用3":"加载"}

# Round 2 (4ec6e413)
r2_pos = {i: "触发" for i in range(1,33)}
r2_neg = {i: "不触发" for i in range(33,65)}
r2_near = {
    65:"触发",66:"触发",67:"触发",68:"不触发",69:"不触发",70:"触发",71:"不触发",
    72:"不触发",73:"不触发",74:"不触发",75:"触发",76:"不触发",77:"不触发",78:"不触发",
    79:"触发",80:"不触发",81:"不触发",82:"不触发",83:"不触发",84:"不触发",85:"不触发",
    86:"不触发",87:"不触发",88:"不触发"
}
r2_bound = {
    89:"触发",90:"不触发",91:"不触发",92:"不触发",93:"触发",94:"触发",95:"不触发",
    96:"不触发",97:"触发",98:"不触发",99:"触发",100:"触发"
}
r2_call = {"调用1":"加载","调用2":"加载","调用3":"加载"}

# Round 3 (10a5eb9e)
r3_pos = {i: "触发" for i in range(1,33)}
r3_neg = {i: "不触发" for i in range(33,65)}
r3_near = {
    65:"触发",66:"触发",67:"触发",68:"不触发",69:"不触发",70:"触发",71:"触发",
    72:"不触发",73:"不触发",74:"不触发",75:"触发",76:"触发",77:"不触发",78:"不触发",
    79:"触发",80:"不触发",81:"不触发",82:"触发",83:"不触发",84:"不触发",85:"不触发",
    86:"不触发",87:"不触发",88:"触发"
}
r3_bound = {
    89:"触发",90:"不触发",91:"不触发",92:"不触发",93:"触发",94:"触发",95:"不触发",
    96:"不触发",97:"触发",98:"不触发",99:"触发",100:"触发"
}
r3_call = {"调用1":"加载","调用2":"加载","调用3":"加载"}

# Merge (all keys as strings)
def strkey(d):
    return {str(k): v for k, v in d.items()}
r1_all = {**strkey(r1_pos), **strkey(r1_neg), **strkey(r1_near), **strkey(r1_bound), **strkey(r1_call)}
r2_all = {**strkey(r2_pos), **strkey(r2_neg), **strkey(r2_near), **strkey(r2_bound), **strkey(r2_call)}
r3_all = {**strkey(r3_pos), **strkey(r3_neg), **strkey(r3_near), **strkey(r3_bound), **strkey(r3_call)}

# Load case metadata
cases = json.load(open("/Users/lute/Desktop/skill-翻译/JTBD分析器/eval-reports/cases_a.json"))

# Build results
results = []
for c in cases:
    cid = str(c["id"])
    results.append({
        "id": cid,
        "type": c["type"],
        "title": c["title"],
        "expected": c["expected"],
        "tags": c["tags"],
        "rounds": [r1_all.get(cid,""), r2_all.get(cid,""), r3_all.get(cid,"")]
    })

output = {
    "skill_name": "JTBD分析器",
    "results": results
}

with open("/Users/lute/Desktop/skill-翻译/JTBD分析器/eval-reports/results.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print(f"[ok] results.json: {len(results)} results")

# Backfill Excel
wb = openpyxl.load_workbook("/Users/lute/Desktop/skill-翻译/JTBD分析器/eval-reports/JTBD分析器.xlsx")
ws = wb["Sheet1"]
for row_idx, c in enumerate(results, 2):
    ws.cell(row=row_idx, column=8, value=r1_all.get(c["id"],""))
    ws.cell(row=row_idx, column=9, value=r2_all.get(c["id"],""))
    ws.cell(row=row_idx, column=10, value=r3_all.get(c["id"],""))
    ws.cell(row=row_idx, column=11, value="2026-09-02")
wb.save("/Users/lute/Desktop/skill-翻译/JTBD分析器/eval-reports/JTBD分析器.xlsx")
print("[ok] Excel backfilled")