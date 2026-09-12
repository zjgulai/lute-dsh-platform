#!/usr/bin/env python3
"""build-code-availability.py — 编译**代码节选可得性表**（`data/code-availability.json`，入库）。

为什么需要它：卡页 ⑦ 段自称「代码模板」，但源站对代码预览设了硬上限。实测（见
`.scratch/p2s-code-recovery/`）：

  · 源站自述的行数**最大 60**，1,150/1,338 张卡正是 60 —— ⑦ 段是**节选**，不是「模板」。
    （自述行数记在卡页 `<span class=code-meta>60 行 · 可运行</span>`；抽取后落在 ⑦ 段
    第二行，形如 `Python60 行 · 可运行复制`。）
  · 我方卡转发的节选里，**457/1,283 连 `ast.parse` 都过不了** —— 在断点处被截断。
    把这种文本标成「可运行复制」，读者复制即 SyntaxError。
  · 808 张卡声明了一个具体代码位置（`路径：paper2skills-code/…`）。该路径指向的代码树
    **不在本包内**；即便取到（作者机器上在 iCloud），实测 838/838 能解析到目录，但其中
    90.7% 是通用脚手架，与本卡节选不是同一份 —— 同一个技能名下放着**另一份代码**，
    比悬空指针更危险（悬空会响亮报错，同名会静默给错）。
  · 卡页还声明「代码块数量：N」（最多 6），而每卡实际只发布了 1 个节选。

本表把上述四件事按**卡**量化，供装配器如实渲染，而不是转发源站的自述。
判据都取自卡自身（可复算、不依赖外部树）：

  declared_lines   源站自述的预览行数（上限判据用这个，不用内容行数：内容行数会因
                   尾部换行在 58–60 间浮动，而「N 行」是源站自己的口径）
  lines            节选实际内容行数
  capped           declared_lines >= 源站上限（= 后面还有代码，源站未发布）
  parses           `ast.parse` 是否通过；非 Python 片段记 null（本包不做语法断言）
  declared_blocks  卡页声明的代码块数量
  path / path_claimed  卡页记录的代码位置；`未检测到` 记为未声明

用法：
  python3 scripts/build-code-availability.py            # 重新编译 data/code-availability.json
  python3 scripts/build-code-availability.py --check    # 断言磁盘产物与本脚本一致（供门禁）
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(PKG, "generated", "cards.json")
OUT = os.path.join(PKG, "data", "code-availability.json")

SECTION = "7. 代码模板"

#: 源站代码预览的硬上限（自述行数）。实测 1,338 张卡最大 60、无一例外；
#: 编译器在下方两处守卫里断言这一点，源站若改口径会响亮失败而不是静默漂移。
SOURCE_CAP_LINES = 60

#: 源站把「没抽到代码」写成这两句；这类段落已由 `lib/card-render.js` 的占位判据接住。
PLACEHOLDER_RE = re.compile(r"请查看原始|未自动抽取|未抽取")

META_RE = re.compile(r"代码块数量：\s*(\d+)\s*·\s*路径：\s*(\S*)")
#: 第二行 `Python60 行 · 可运行复制` / `Code2 行 · 可运行复制`（lang 与行数之间无分隔，
#: 是源站 HTML 里 badge 与 meta 两个 span 拼接的残留）。
DECL_RE = re.compile(r"^([A-Za-z#+]*)\s*(\d+)\s*行")

NOT_DETECTED = "未检测到"


def split_section(sec: str):
    """⑦ 段 → (meta 行, 第二行, 代码正文或 None)。

    源站段落固定三行头：`代码块数量：N · 路径：…` / 空行 / `<Lang>N 行 · 可运行复制`。
    注意 meta 行在**占位卡**上同样有效（如 `代码块数量：0 · 路径：…`），不能丢。
    """
    lines = (sec or "").split("\n")
    if len(lines) < 3:
        return (lines[0] if lines else None), None, None
    meta, second = lines[0], lines[2]
    if PLACEHOLDER_RE.search(second):
        return meta, second, None
    code = re.sub(r"^\n+|\n+$", "", "\n".join(lines[3:]))
    return meta, second, (code or None)


def measure(sec: str) -> dict:
    meta, second, code = split_section(sec)
    m = META_RE.search(meta or "")
    declared_blocks = int(m.group(1)) if m else None
    raw_path = m.group(2) if m else ""
    claimed = bool(raw_path) and raw_path != NOT_DETECTED

    dm = DECL_RE.search((second or "").strip())
    lang = (dm.group(1).lower() if dm and dm.group(1) else None)
    declared_lines = int(dm.group(2)) if dm else None

    rec: dict = {
        "declared_lines": declared_lines,
        "lines": 0,
        "capped": False,
        "parses": None,
        "syntax_error": None,
        "declared_blocks": declared_blocks,
        "path": raw_path if claimed else None,
        "path_claimed": claimed,
        "lang": lang,
        # 源站自述原文留档：卡面按实测渲染，但审计要能回看源站到底写了什么。
        "raw_meta": (meta or "").strip(),
    }
    if code is None:
        return rec

    rec["lines"] = len(code.rstrip("\n").split("\n"))
    rec["capped"] = (declared_lines or 0) >= SOURCE_CAP_LINES
    if lang in ("python", "py"):
        try:
            ast.parse(code)
            rec["parses"] = True
        except SyntaxError as e:
            rec["parses"] = False
            rec["syntax_error"] = f"第 {e.lineno} 行：{e.msg}"
        except Exception as e:  # noqa: BLE001 — 记下就好，不让单卡炸掉整批
            rec["parses"] = False
            rec["syntax_error"] = f"{type(e).__name__}: {e}"
    return rec


def build() -> dict:
    cards = json.load(open(CARDS, encoding="utf-8"))["cards"]
    per: dict[str, dict] = {}
    for c in cards:
        sec = (c.get("sections") or {}).get(SECTION) or ""
        per[c["id"]] = measure(sec)

    # --- 上限守卫：源站若自述超过 60 行的预览，说明口径变了，必须响亮失败 ---
    over = [(k, v["declared_lines"]) for k, v in per.items() if (v["declared_lines"] or 0) > SOURCE_CAP_LINES]
    if over:
        print(
            f"✗ {len(over)} 张卡的源站自述行数超过上限 {SOURCE_CAP_LINES}：{over[:5]} …\n"
            "  源站预览口径可能已变，请复核 SOURCE_CAP_LINES 后再重跑。",
            file=sys.stderr,
        )
        raise SystemExit(1)

    # --- 逆向上限守卫：若一张都没顶到上限，说明判据失效（不是真没截断） ---
    n_capped = sum(1 for v in per.values() if v["capped"])
    if n_capped == 0:
        print(
            f"✗ 没有任何卡顶到上限 {SOURCE_CAP_LINES} —— 上限判据多半失效，"
            "请复核 DECL_RE / SOURCE_CAP_LINES。",
            file=sys.stderr,
        )
        raise SystemExit(1)

    with_code = [v for v in per.values() if v["lines"] > 0]
    py = [v for v in with_code if v["lang"] in ("python", "py")]
    stats = {
        "cards": len(per),
        "with_code": len(with_code),
        "capped": n_capped,
        "python": len(py),
        "unparseable": sum(1 for v in py if v["parses"] is False),
        "path_claimed": sum(1 for v in per.values() if v["path_claimed"]),
        "path_not_detected": sum(
            1 for v in per.values() if v["declared_blocks"] is not None and not v["path_claimed"]
        ),
    }
    return {
        "generated_from": os.path.relpath(CARDS, PKG),
        "source_cap_lines": SOURCE_CAP_LINES,
        "note": (
            "源站 ⑦ 段是**代码预览节选**（源站自述上限 60 行），不是完整实现；"
            "卡页 `路径：` 指向的代码树不在本包内。本表按卡记录实测值，供装配器如实渲染。"
        ),
        "stats": stats,
        "cards": dict(sorted(per.items())),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="断言磁盘产物与本脚本一致")
    args = ap.parse_args()

    data = build()
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"

    if args.check:
        if not os.path.exists(OUT):
            print(f"✗ 缺少 {os.path.relpath(OUT, PKG)}，先跑 build-code-availability.py", file=sys.stderr)
            return 1
        if open(OUT, encoding="utf-8").read() != text:
            print(
                f"✗ {os.path.relpath(OUT, PKG)} 与脚本不一致 —— "
                "改了判据或卡数据后要重跑 build-code-availability.py",
                file=sys.stderr,
            )
            return 1
        s = data["stats"]
        print(
            f"✓ 代码节选可得性表一致（{s['cards']} 张 · 有节选 {s['with_code']} · "
            f"顶上限 {s['capped']} · 不可解析 {s['unparseable']} · 声明路径 {s['path_claimed']}）"
        )
        return 0

    open(OUT, "w", encoding="utf-8").write(text)
    s = data["stats"]
    print(f"✓ 写出 {os.path.relpath(OUT, PKG)}")
    print(
        f"  卡 {s['cards']} · 有代码节选 {s['with_code']} · 顶到源站 {SOURCE_CAP_LINES} 行上限 {s['capped']}"
        f" · Python 节选中语法不完整 {s['unparseable']}/{s['python']}"
        f" · 声明代码路径 {s['path_claimed']} · 源站写「未检测到」{s['path_not_detected']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
