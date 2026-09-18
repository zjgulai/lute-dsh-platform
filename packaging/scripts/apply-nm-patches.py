#!/usr/bin/env python3
"""LUTE 运行时层补丁重放器（NM layer applier）

把 packaging/patches/nm/ 下的统一 diff 补丁确定性地应用到
app node_modules 上（布局由 assemble.sh §1b 以 scripts/lib/app-resources.mjs
探测后传入：no-ASAR Resources/app ⇄ 旧 app.asar.unpacked 双形态）。

- 每补丁 = 一个目标文件（pristine→patched 的 unified diff，a/ b/ 标签为 NM 相对路径）
- 幂等：已应用的补丁用 --forward 跳过（见 _classify）
- 顺序：按路径字典序（同一文件的多补丁已合并为单补丁，无顺序依赖）
- 与 assemble.sh BASE=source 主路径配套；BASE=dmg 兜底路径不调用本脚本

诊断纪律（2026-09-17，2.0.10 重锚轮实证）：GNU patch 的 hunk 级结果写在
stdout（rc 不可分辨「整体失败」与「部分 hunk 失败」——部分失败时文件已被
改写）。旧实现只看 returncode 且只打 stderr，把「4 个 already-applied」与
「部分应用后的复合态」全部误报成同一形态的 FAIL，人眼再猜。现在：
capture_output 合并双流 → 按 stdout 文本分类 → 失败时原样打印 patch 的
hunk 摘要行。
"""
import os
import re
import subprocess
import sys

PATCH_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'patches', 'nm')


def _classify(rc: int, out: str):
    """→ (state, reason)．state ∈ applied | skipped | failed"""
    if rc == 0:
        return 'applied', 'clean'
    if 'previously applied' in out or 'Reversed' in out or 'Ignoring previously applied' in out:
        return 'skipped', 'already applied (--forward)'
    m = re.search(r'(\d+ out of \d+ hunks? (?:failed|ignored))', out)
    if m:
        note = m.group(1)
        if 'ignored' in note and 'failed' not in out:
            return 'skipped', note
        return 'failed', note
    return 'failed', (out.strip().splitlines() or ['unknown'])[-1]


def main(nm_root: str) -> int:
    if not os.path.isdir(nm_root):
        print(f"[nm-patches] NM root 不存在: {nm_root}")
        return 1
    patches = []
    for dirpath, _dirnames, filenames in os.walk(PATCH_ROOT):
        for fn in filenames:
            if fn.endswith('.patch'):
                patches.append(os.path.join(dirpath, fn))
    patches.sort()
    if not patches:
        print("[nm-patches] 无补丁文件")
        return 0
    failed = 0
    applied = 0
    skipped = 0
    for pf in patches:
        rel = os.path.relpath(pf, PATCH_ROOT)[:-len('.patch')]
        target = os.path.join(nm_root, rel)
        if not os.path.isfile(target):
            print(f"[nm-patches] SKIP {rel}（目标不存在，可能包结构变化）")
            continue
        r = subprocess.run(
            ['patch', '-p1', '--forward', '--quiet', '-i', pf],
            cwd=nm_root, capture_output=True, text=True,
        )
        out = (r.stdout or '') + (r.stderr or '')
        state, reason = _classify(r.returncode, out)
        if state == 'applied':
            applied += 1
        elif state == 'skipped':
            skipped += 1
            print(f"[nm-patches] skip  {rel}（{reason}）")
        else:
            failed += 1
            print(f"[nm-patches] FAIL  {rel}（{reason}）")
    print(f"[nm-patches] 完成：applied={applied} skipped={skipped} failed={failed} total={len(patches)}")
    return 1 if failed else 0


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("用法: apply-nm-patches.py <app .../node_modules>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
