#!/usr/bin/env python3
"""LUTE 运行时层补丁重放器（NM layer applier）

把 packaging/patches/nm/ 下的统一 diff 补丁确定性地应用到
源码构建 app 的 app.asar.unpacked/node_modules 上。

- 每补丁 = 一个目标文件（pristine→patched 的 unified diff，a/ b/ 标签为 NM 相对路径）
- 幂等：已应用的补丁用 --forward 跳过（patch 返回 1 且输出 "already applied"/"Reversed" 视为已应用）
- 顺序：按路径字典序（同一文件的多补丁已合并为单补丁，无顺序依赖）
- 与 assemble.sh BASE=source 主路径配套；BASE=dmg 兜底路径不调用本脚本
"""
import os
import subprocess
import sys

PATCH_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'patches', 'nm')


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
        if r.returncode == 0:
            applied += 1
        elif 'already applied' in r.stderr or 'Reversed' in r.stderr or 'previously applied' in r.stderr:
            skipped += 1
        else:
            failed += 1
            print(f"[nm-patches] FAIL {rel}: {r.stderr.strip()[:300]}")
    print(f"[nm-patches] 完成：applied={applied} skipped={skipped} failed={failed} total={len(patches)}")
    return 1 if failed else 0


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("用法: apply-nm-patches.py <app.asar.unpacked/node_modules>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
