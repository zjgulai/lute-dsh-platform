#!/usr/bin/env python3
"""出海技能页 · 顶部裁切图的唯一产地。

为什么裁切也要有脚本：我在对话里发给用户看的是 `*-top.png`（1280x1200 / 1280x980
的顶部裁切），**整页 6000px 的图在聊天里看不清**。但这三张此前是临时命令切出来的，
没有任何东西约束它们真的来自磁盘上那张整页图——换一张上一轮的、切错偏移、
手抖截了中段，聊天里的「证据」与仓库里的证据就对不上了，而且**不会有任何提示**。

所以：产地收敛到本文件（确定性、只读整页图、只写裁切图），
出处由 `verify-pages.py` 逐像素复核（裁切必须逐像素等于整页图的顶部 N 行）。

只读整页图，不改它们；不写仓库，只写 .scratch 下的 acceptance/*-top.png。

用法：python3 .scratch/overseas-skills-refactor/crop-tops.py
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ACC = HERE / "acceptance"

# 每个状态只裁一张：够看清首屏（面板顶 + 第一屏内容），又不至于在聊天里糊成一条。
CROPS = {
    "page-light-drilled.png": 1200,
    "page-dark-drilled.png": 1200,
    "page-light-diagnostics.png": 980,
}

written = 0
for full_name, height in CROPS.items():
    src = ACC / full_name
    if not src.exists():
        print(f"FAIL {full_name} 不在——先跑 shoot-pages.sh")
        raise SystemExit(1)
    img = Image.open(src)
    if img.size[1] < height:
        print(f"FAIL {full_name} 只有 {img.size[1]}px 高，切不出 {height}px")
        raise SystemExit(1)
    out = ACC / (full_name[:-4] + "-top.png")
    img.crop((0, 0, img.size[0], height)).save(out)
    digest = hashlib.sha256(out.read_bytes()).hexdigest()[:16]
    print(f"ok   {out.name:34s} 取自 {full_name} 顶部 {height} 行 · sha256:{digest}")
    written += 1

print(f"CROP DONE（{written}/{len(CROPS)}）")
