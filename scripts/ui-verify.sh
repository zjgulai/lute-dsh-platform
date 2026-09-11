#!/bin/bash
# UI 文本验证兜底管线（2026-09-11）：macos-harness 截图 → tesseract OCR → 关键字断言
# 依赖：Screen Recording 已授权给 macos-harness 宿主（DSH Desktop + uv python 二进制）
# 用法：ui-verify.sh "关键字1" "关键字2" ...   （全部命中才退出 0；未命中输出 OCR 全文片段）
set -u
KW=("$@"); [ ${#KW[@]} -gt 0 ] || { echo "用法: ui-verify.sh <关键字...>"; exit 2; }
SHOT=/tmp/ui-verify-$$.png
macos-harness <<'PY' 2>/dev/null
import os
cur=os.getppid(); APP=None
for _ in range(6):
    if cur<=1: break
    comm=subprocess.run(["ps","-o","comm=","-p",str(cur)],capture_output=True,text=True).stdout.strip()
    if "DSH" in comm and "MacOS" in comm: APP=str(cur); break
    cur=int(subprocess.run(["ps","-o","ppid=","-p",str(cur)],capture_output=True,text=True).stdout.strip() or 0)
shot=mac.see(APP)
p=shot.get("path")
if p: open(os.environ["UI_SHOT"],"w").write(p)
PY
UI_SHOT=$SHOT
# macos-harness 是独立进程：把截图路径透传重做（内嵌 python 写环境变量不可靠，直接回读已知路径）
# 若上面未产出，回退：让 harness 固定输出路径
if [ ! -s "$SHOT" ]; then
  macos-harness <<'PY' 2>/dev/null
import os
cur=os.getppid(); APP=None
for _ in range(6):
    if cur<=1: break
    comm=subprocess.run(["ps","-o","comm=","-p",str(cur)],capture_output=True,text=True).stdout.strip()
    if "DSH" in comm and "MacOS" in comm: APP=str(cur); break
    cur=int(subprocess.run(["ps","-o","ppid=","-p",str(cur)],capture_output=True,text=True).stdout.strip() or 0)
import subprocess as sp
shot=mac.see(APP)
p=shot.get("path")
if p:
    sp.run(["cp", p, "/tmp/ui-verify-fixed.png"])
    print("saved")
PY
  SHOT=/tmp/ui-verify-fixed.png
fi
[ -s "$SHOT" ] || { echo "截图失败（TCC 未授权？）"; exit 3; }
TXT=$(tesseract "$SHOT" - -l chi_sim+eng 2>/dev/null)
OK=1
for kw in "${KW[@]}"; do
  if echo "$TXT" | grep -q "$kw"; then echo "✓ 命中: $kw"; else echo "✗ 未命中: $kw"; OK=0; fi
done
if [ "$OK" != "1" ]; then echo "--- OCR 片段 ---"; echo "$TXT" | head -20; exit 1; fi
echo "UI 验证通过（${#KW[@]} 项）"
