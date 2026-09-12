#!/usr/bin/env bash
# 红测取证：对**已安装**的技能库逐个注入缺陷，证明 verify-install.mjs 的每条断言都会红。
# 每次注入后用 mktemp 备份原地还原（restore），跑完删备份；不写本包的 data/ 或 generated/。
# 前置：本包已 install:skills（样本取自 $HOME/.dsh/skills 里第一个 references/implementation.py）。
# 用法：bash .scratch/p2s-code-recovery/verify-install-red.sh
set -u
S="$HOME/.dsh/skills"
V="node scripts/verify-install.mjs"
DIR=$(find "$S" -name implementation.py | head -1 | xargs dirname)
SK=$(dirname "$DIR")
echo "样本：$SK"
BAK=$(mktemp -d); cp -R "$SK" "$BAK/"
run() { out=$($V 2>&1); n=$(echo "$out" | grep -c '^  - ' || true); echo "  [$1] 问题数=$n  $(echo "$out" | grep -m1 '^  - ' | cut -c1-110)"; }
restore() { rm -rf "$SK"; cp -R "$BAK/$(basename "$SK")" "$SK"; }

echo "=== 基线 ==="; run 基线

echo "=== 红测 1：往已装实现文件里注入密钥 ==="
printf '\napi_key = "sk-%s"\n' "$(printf 'a%.0s' {1..32})" >> "$DIR/implementation.py"
run "注入密钥"; restore

echo "=== 红测 2：改坏抬头首行 ==="
sed -i '' '1s/.*/# tampered/' "$DIR/implementation.py"
run "改坏抬头"; restore

echo "=== 红测 3：正文尾部追加一行（行数与索引不符）==="
printf '\n# extra\n' >> "$DIR/implementation.py"
run "行数不符"; restore

echo "=== 红测 4：删掉实现文件（索引说它该在）==="
rm -f "$DIR/implementation.py"
run "文件缺失"; restore

echo "=== 红测 5：把 ⑦ 段改回旧说法「完整实现不在本包内」 ==="
python3 - "$SK/SKILL.md" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
open(p,'w',encoding='utf-8').write(s.replace('references/implementation.py','references/implementation.py',1).replace('完整实现','完整实现',1)+'\n> 完整实现不在本包内\n')
PY
run "旧说法回潮"; restore

echo "=== 红测 6：删掉卡面节选与实现文件前缀的一致性（篡改正文首行）==="
python3 - "$DIR/implementation.py" <<'PY'
import sys
p=sys.argv[1]; L=open(p,encoding='utf-8').read().split('\n')
L[5]='# tampered first body line'
open(p,'w',encoding='utf-8').write('\n'.join(L))
PY
run "正文被篡改"; restore

echo "=== 还原后基线 ==="; run 还原
rm -rf "$BAK"
