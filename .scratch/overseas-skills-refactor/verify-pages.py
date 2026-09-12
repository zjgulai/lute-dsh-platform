#!/usr/bin/env python3
"""出海技能页验收图 · 像素级自检（我不看图，所以量出来）。

为什么要有这一层：截图「文件存在」不等于「画对了」。本脚本对每张 png 量五件事，
每条都打印读数——不打印读数就等于没验：

  1. 尺寸与声明的视口一致；
  2. 面板横跨 800px（官方 .panel 宽度），左右边缘落在预期位置。
     实测口径：本测量把面板投影算进来（浅色 +5px/侧、深色 +1px/侧），
     所以 810 / 802 对应的都是 800。**投影本身就是 --dsw-elevation-prominent
     生效的证据**——若量出恰好 800 且边缘毫无过渡，反而说明 elevation token 没解析。
  3. 面板上下边缘落在图内（不限高的那几张不能被裁掉）；
  4. 内容列（页面座位 564px）右侧的 24px 内边距里没有墨迹——越过就是真溢出；
  5. 内容区确实有内容（非背景像素占比），且浅/深两版的面板区平均亮度显著不同。

所有裁剪都先量出面板矩形再取值：第一版直接按固定行取，把面板外的遮罩和投影
算进了「墨迹」，报出 6 张假失败。假读数比没读数更坏，所以这层必须先自证。

用法：python3 .scratch/overseas-skills-refactor/verify-pages.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ACC = HERE / "acceptance"

PANEL_W = 800
NAV_W = 188
OPTIONS_X = 24
PAGE_W = PANEL_W - NAV_W - OPTIONS_X * 2   # 564

EXPECT = {
    "page-light-firstpaint.png": (1280, 633, False),
    "page-light-planes.png": (1280, 633, False),
    "page-light-degraded.png": (1280, 633, False),
    "page-dark-firstpaint.png": (1280, 633, False),
    "page-light-drilled.png": (1280, 6000, True),
    "page-dark-drilled.png": (1280, 6000, True),
    "page-light-diagnostics.png": (1280, 6000, True),
}

# ── 0. 时效性：图必须比它描绘的东西新 ──────────────────────────────────────
#
# 补一个真实的空洞：**像素自检可以全绿，而绿是对着旧代码的画像绿的**。
# 实测依据——compose-page.mjs 14:29:31 产 HTML、14:29:32 HTML、14:29:33 起出图。
# 这个一秒钟的顺序本身就是不变量，只是此前没有任何东西断言它；改一行 client.js
# 再跑本脚本，七张图仍然「通过」，而它们画的已经是不存在的页面。
failures: list[str] = []
rows: list[str] = []

REPO = HERE.parent.parent
PKG = REPO / "packages/capabilities/dsh-overseas-skills"
SOURCES = [
    PKG / "lib/client.js",                    # 页面本体（bundle）
    PKG / "lib/index.js",                     # 宿主路由与负载
    PKG / "lib/org-tree.js",
    PKG / "lib/role-map.js",
    PKG / "lib/preset-roles.js",
    PKG / "lib/layer-icons.js",
    PKG / "lib/catalog.js",
    PKG / "manifest/role-assignments.json",
    HERE / "compose-page.mjs",                # 页面合成
    HERE / "crop-tops.py",                    # 裁切产地
    HERE / "shoot-pages.sh",                  # 真浏览器截图
]


def stamp(ts: float) -> str:
    return time.strftime("%H:%M:%S", time.localtime(ts))


inputs = [p for p in SOURCES if p.exists()]
absent = [p.name for p in SOURCES if not p.exists()]
newest = max(inputs, key=lambda p: p.stat().st_mtime)
print(f"时效基线：{len(inputs)} 个输入，最新的是 {newest.name} @ {stamp(newest.stat().st_mtime)}")
if absent:
    failures.append(f"时效基线缺输入：{'、'.join(absent)}——少了输入就量不准，不能静默跳过")

for name in EXPECT:
    png = ACC / name
    if not png.exists():
        continue                                  # 主循环会报「文件不存在」
    t_png = png.stat().st_mtime
    stale = [p for p in inputs if p.stat().st_mtime > t_png]
    if stale:
        worst = max(stale, key=lambda p: p.stat().st_mtime)
        failures.append(
            f"{name}: 比 {worst.name} 旧 {worst.stat().st_mtime - t_png:.0f}s"
            f"——这张图描绘的是已经不存在的代码（重跑 compose-page.mjs + shoot-pages.sh）"
        )
    html = png.with_suffix(".html")
    if not html.exists():
        failures.append(f"{name}: 配套 HTML {html.name} 不在（图无从复核）")
    elif html.stat().st_mtime > t_png:
        failures.append(f"{name}: 比它自己的 HTML 还旧 {html.stat().st_mtime - t_png:.0f}s（先出图、后改 HTML？）")

# HTML 是 compose-page.mjs 的产物：改脚本不重跑，HTML 就是上一个脚本的产物
compose_mjs = HERE / "compose-page.mjs"
if compose_mjs.exists():
    for html in sorted(ACC.glob("page-*.html")):
        delta = compose_mjs.stat().st_mtime - html.stat().st_mtime
        if delta > 0:
            failures.append(f"{html.name}: 比 compose-page.mjs 旧 {delta:.0f}s——HTML 是那个脚本的产物，得重跑")

if all((ACC / n).exists() for n in EXPECT):
    oldest = min((ACC / n).stat().st_mtime for n in EXPECT)
    print(f"时效余量：最老的一张图仍比输入基线新 {oldest - newest.stat().st_mtime:.0f}s")


def luminance(arr: np.ndarray) -> np.ndarray:
    return arr[..., :3].astype(np.float64) @ np.array([0.2126, 0.7152, 0.0722])


def panel_rect(img: np.ndarray):
    """量面板矩形。面板像素与遮罩（x=2 处的颜色）不同，投影会在边缘外扩几像素。"""
    lum = luminance(img)
    outside = lum[300, 2]   # 遮罩基准不能取 (2,2)：图顶 22px 是说明条
    row = lum[300]
    inside = np.where(np.abs(row - outside) > 3)[0]
    if inside.size == 0:
        return None
    left, right = int(inside.min()), int(inside.max())
    col = lum[:, left + 3]
    rows_inside = np.where(np.abs(col - outside) > 3)[0]
    rows_inside = rows_inside[rows_inside >= 30]   # 跳过顶部说明条
    if rows_inside.size == 0:
        return None
    return (left, right, int(rows_inside.min()), int(rows_inside.max()))


def ink_share(zone: np.ndarray, tol: float = 12.0):
    """返回（非背景像素占比, 背景基准亮度）。背景取该区域亮度中位数——
    区域以背景为主时中位数就是背景，内容溢出成多数时这里会自曝。"""
    lm = luminance(zone)
    bg = float(np.median(lm))
    return float((np.abs(lm - bg) > tol).mean()), bg


for name, (w, h, stretch) in EXPECT.items():
    path = ACC / name
    if not path.exists():
        failures.append(f"{name}: 文件不存在")
        continue
    img = np.array(Image.open(path).convert("RGB"))
    ih, iw = img.shape[:2]
    if (iw, ih) != (w, h):
        failures.append(f"{name}: 尺寸 {iw}x{ih}，期望 {w}x{h}")
        continue

    rect = panel_rect(img)
    if rect is None:
        failures.append(f"{name}: 找不到面板矩形")
        continue
    left, right, top, bottom = rect
    span = right - left + 1
    notes = []

    # ── 1. 面板几何 ────────────────────────────────────────────────────────
    if not (PANEL_W <= span <= PANEL_W + 14):
        failures.append(f"{name}: 面板横跨 {span}px（x {left}..{right}），期望 {PANEL_W}px + 投影余量")
        continue
    expect_left = (iw - PANEL_W) // 2
    if not (expect_left - 7 <= left <= expect_left + 1):
        failures.append(f"{name}: 面板左边缘 x={left}，期望 {expect_left}（±投影余量）")
        continue
    notes.append(f"面板 {span}px @ x{left}..{right}（含投影）")

    # ── 2. 面板上下边缘必须在图内 ──────────────────────────────────────────
    if stretch:
        if bottom >= ih - 8:
            failures.append(f"{name}: 面板底边 y={bottom} 顶到图底（图高 {ih}）——被裁了")
            continue
        if top <= 22:
            failures.append(f"{name}: 面板顶边 y={top} 顶到说明条——布局异常")
            continue
    notes.append(f"面板 y{top}..{bottom}")

    # ── 3. 内容列右侧内边距必须干净 ────────────────────────────────────────
    # 内容座位按面板真实左缘算，不是含投影的测量值——差 5px 就会把内容误判成溢出
    true_left = (iw - PANEL_W) // 2
    seat_left = true_left + NAV_W + OPTIONS_X
    seat_right = seat_left + PAGE_W
    r0, r1 = top + 24, bottom - 12
    pad = img[r0:r1, seat_right + 2: right - 8, :3]
    if pad.size:
        share, bg = ink_share(pad)
        notes.append(f"右侧内边距墨迹 {share * 100:.3f}%（bg {bg:.0f}）")
        if share > 0.002:
            failures.append(f"{name}: 内容列右侧 {OPTIONS_X}px 内边距里有 {share * 100:.3f}% 非背景像素（内容溢出页面座位）")

    # ── 4. 内容区确实有东西 ────────────────────────────────────────────────
    content = img[r0:r1, seat_left:seat_right, :3]
    share, _ = ink_share(content)
    notes.append(f"内容区墨迹 {share * 100:.2f}%")
    if share < 0.005:
        failures.append(f"{name}: 内容区几乎没有墨迹（{share * 100:.3f}%）——疑似空页")

    # ── 5. 面板区亮度（供浅/深对比）────────────────────────────────────────
    panel_area = img[top + 40: min(top + 500, bottom), true_left + NAV_W: true_left + PANEL_W - 8, :3]
    notes.append(f"面板区亮度 {float(np.median(luminance(panel_area))):.1f}")

    rows.append(f"{name:32s} " + " | ".join(notes))

print("\n".join(rows))


def med(name):
    img = np.array(Image.open(ACC / name).convert("RGB"))
    rect = panel_rect(img)
    assert rect is not None
    _left, _right, top, _bottom = rect
    true_left = (img.shape[1] - PANEL_W) // 2
    return float(np.median(luminance(img[top + 40: top + 500, true_left + NAV_W: true_left + PANEL_W - 8, :3])))


for light, dark in [("page-light-firstpaint.png", "page-dark-firstpaint.png"),
                    ("page-light-drilled.png", "page-dark-drilled.png")]:
    if (ACC / light).exists() and (ACC / dark).exists():
        a, b = med(light), med(dark)
        delta = abs(a - b)
        print(f"{light[:-4]} vs {dark[:-4]}: 面板区亮度 {a:.1f} vs {b:.1f}，差 {delta:.1f}")
        if delta < 40:
            failures.append(f"{light} / {dark}: 明暗差只有 {delta:.1f}，不像两套主题")

if (ACC / "page-light-firstpaint.png").exists() and (ACC / "page-light-degraded.png").exists():
    a = np.array(Image.open(ACC / "page-light-firstpaint.png").convert("RGB"))
    b = np.array(Image.open(ACC / "page-light-degraded.png").convert("RGB"))
    diff = float(np.abs(a.astype(int) - b.astype(int)).mean())
    print(f"首屏 vs 退化视图：逐像素平均差 {diff:.2f}")
    if diff < 1.0:
        failures.append("退化视图与首屏几乎相同——退化没有真的换渲染路径")

# ── 6. 裁切图的出处 ────────────────────────────────────────────────────────
# 发给用户看的就是这几张。整页 6000px 在聊天里看不清，所以给的是顶部裁切；
# 那么「裁切确实出自那张整页图」就必须被复核——否则聊天里的证据可以来自任何一版页面。
CROP_OF = {
    "page-light-drilled-top.png": "page-light-drilled.png",
    "page-dark-drilled-top.png": "page-dark-drilled.png",
    "page-light-diagnostics-top.png": "page-light-diagnostics.png",
}
for crop, full in CROP_OF.items():
    cp, fp = ACC / crop, ACC / full
    if not cp.exists():
        failures.append(f"{crop}: 裁切图不在（发给用户看的就是它；用 crop-tops.py 重建）")
        continue
    if not fp.exists():
        failures.append(f"{crop}: 整页图 {full} 不在，出处无从复核")
        continue
    a = np.array(Image.open(cp).convert("RGB"))
    b = np.array(Image.open(fp).convert("RGB"))
    h = a.shape[0]
    if a.shape[1] > b.shape[1] or h > b.shape[0]:
        failures.append(f"{crop}: {a.shape[1]}x{h} 比整页图 {b.shape[1]}x{b.shape[0]} 还大")
        continue
    if cp.stat().st_mtime < fp.stat().st_mtime:
        failures.append(f"{crop}: 比整页图 {full} 还旧——是上一轮留下的裁切")
        continue
    if np.array_equal(a, b[:h]):
        print(f"{crop:34s} 顶部 {h} 行与 {full} 逐像素相等 ✓")
    else:
        d = float(np.abs(a.astype(int) - b[:h].astype(int)).mean())
        failures.append(f"{crop}: 与 {full} 顶部 {h} 行不相等（平均差 {d:.3f}）——出处不明，不能当证据")

if failures:
    print("\n" + "\n".join("FAIL " + f for f in failures))
    sys.exit(1)
print(f"\n{len(EXPECT)}/{len(EXPECT)} 张图全部通过像素自检")
