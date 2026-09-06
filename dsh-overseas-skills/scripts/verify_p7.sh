#!/bin/bash
# verify_p7.sh — 重启后的运行时验收（只读 HTTP 检查，不改任何状态）
# 用法：bash scripts/verify_p7.sh
set -u
BASE="http://127.0.0.1:43120/api/dsh-overseas-skills"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
fail=0

echo "== 1. /list 可达性与规模 =="
curl -s --max-time 8 "$BASE/list" -o "$TMP" || { echo "list 请求失败"; exit 1; }
python3 - "$TMP" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1]))
groups = d.get("groups", [])
items = [i for g in groups for i in g.get("items", [])]
print(f"分组: {len(groups)} | 条目: {len(items)}")
new_cats = [g["key"] for g in groups if g["key"] in ("knowledge-engineering","skill-engineering","ecommerce-analytics")]
print(f"新分组就位: {new_cats}")
noicon = [g["key"] for g in groups if not g.get("icon")]
noicon_items = [i["name"] for i in items if not i.get("icon")]
print(f"无图标分组: {len(noicon)} | 无图标条目: {len(noicon_items)}")
b_titles = {i["name"]: i["title"] for i in items if i["name"] in ("copywriting","ecommerce-marketing","amz-product-optimizer","skill-creator","ecommerce-seo-optimizer","seo-page-audit","performance-tracking","brand-voice-glossary","international-shipping-customs","social-content","optimize-ecommerce-page-conversion","email-automation-flow-builder")}
print("B类标题抽查:", json.dumps(b_titles, ensure_ascii=False))
installed_81 = [i["name"] for i in items if i["name"] in ("geo-optimizer","jtbd-analyzer","voc-sentiment-analyzer","seo-controller","ecommerce-monthly-review","brand-mention-tracking") ]
print("C类抽查 installed:", [(n, next((i["installed"] for i in items if i["name"]==n), None)) for n in installed_81])
EOF
echo
echo "== 2. 防白屏：启动尾事件 =="
tail -1 "$HOME/Library/Application Support/DSH Desktop/lifecycle-events/startup.jsonl" | python3 -c "
import sys, json
e = json.loads(sys.stdin.read())
d = e.get('details', {})
print('finalStage:', d.get('finalStage'), '| renderer:', d.get('rendererStatus'))
" 
echo
echo "== 3. 预设就位 =="
ls "$HOME/.dsh/.agent-presets/brand-marketing-growth/" && echo "白名单行数: $(grep -c "'" "$HOME/.dsh/.agent-presets/brand-marketing-growth/agent.cordis.yml")"
