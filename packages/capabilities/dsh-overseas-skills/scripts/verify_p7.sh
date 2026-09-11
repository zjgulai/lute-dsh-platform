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
scen = d.get("scenarios", [])
groups = d.get("groups", [])
items = [i for s in scen for sub in s.get("subs", []) for i in sub.get("items", [])]
print(f"大场景: {len(scen)} | 细分场景: {len(groups)} | 条目: {len(items)}")
print(f"场景键: {[s['key'] for s in scen]}")
preset = [s["key"] for s in scen if "preset-" in s["key"]]
print(f"preset 残留: {preset}")
noicon_scen = [s["key"] for s in scen if not s.get("icon")]
print(f"无图标大场景: {noicon_scen}")
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
