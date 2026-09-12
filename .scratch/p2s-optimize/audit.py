#!/usr/bin/env python3
"""对 1338 张 p2s 技能卡做只读体检。

只读：本脚本不写任何 SKILL.md，不碰 ~/.dsh。
输出：机器可读的摘要 + 人读的结论，落到 stdout / --json。
"""
from __future__ import annotations

import argparse
import glob
import html
import json
import os
import re
import statistics
import sys
from collections import Counter, defaultdict

SKILLS = os.path.expanduser("~/.dsh/skills")
PLACEHOLDER = "（卡页此段为占位内容"
FM_RE = re.compile(r"^---\n(.*?)\n---\n", re.S)
SEC_RE = re.compile(r"^##\s+(.+?)\s*$", re.M)
ENTITY_RE = re.compile(r"&#x?[0-9a-fA-F]+;|&amp;|&lt;|&gt;|&quot;")


def parse_frontmatter(text: str) -> dict[str, str]:
    m = FM_RE.match(text)
    if not m:
        return {}
    out: dict[str, str] = {}
    for line in m.group(1).split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        out[k.strip()] = v
    return out


def analyse(path: str) -> dict:
    raw = open(path, encoding="utf-8").read()
    fm = parse_frontmatter(raw)
    body = raw[FM_RE.match(raw).end():] if FM_RE.match(raw) else raw
    sections = SEC_RE.findall(body)

    # 占位段落：以 "## <标题>" 开头、正文首行含占位标记
    placeholder_sections = []
    for m in re.finditer(r"^##\s+(.+?)\s*$\n(.*?)(?=^##\s|\Z)", body, re.M | re.S):
        if PLACEHOLDER in m.group(2):
            placeholder_sections.append(m.group(1).strip())

    # 关联段落：同一目标同时以 X.html 与 X 出现 → 纯重复
    rel_dupes = 0
    assoc = re.search(r"^##\s+技能关联\s*$\n(.*?)(?=^##\s|\Z)", body, re.M | re.S)
    if assoc:
        targets = re.findall(r"Skill-[A-Za-z0-9_\u4e00-\u9fff-]+(?:\.html)?", assoc.group(1))
        base = Counter(t[:-5] if t.endswith(".html") else t for t in targets)
        rel_dupes = sum(c - 1 for c in base.values() if c > 1)

    code = re.search(r"^##\s+⑦?\s*代码模板\s*$\n(.*?)(?=^##\s|\Z)", body, re.M | re.S)
    code_txt = code.group(1) if code else ""
    fm_block = FM_RE.match(raw).group(1) if FM_RE.match(raw) else ""

    return {
        "dir": os.path.basename(os.path.dirname(path)),
        "bytes": len(raw.encode()),
        "chars": len(raw),
        "fm_bytes": len(fm_block.encode()),
        "body_bytes": len(body.encode()),
        "fm_fields": sorted(fm.keys()),
        "fm_missing": [k for k in (
            "name", "title", "description", "l1_plane", "l2_domain", "l3_business",
            "l3_all", "p2s_card_id", "p2s_src_domain", "user_summary", "user_try",
            "whenToUse", "workflow", "enabled", "disable-model-invocation", "user-invocable",
        ) if k not in fm],
        "l1_plane": fm.get("l1_plane", ""),
        "l2_domain": fm.get("l2_domain", ""),
        "l3_business": fm.get("l3_business", ""),
        "l3_all": fm.get("l3_all", ""),
        "src_domain": fm.get("p2s_src_domain", ""),
        "title": fm.get("title", ""),
        "card_id": fm.get("p2s_card_id", ""),
        "desc": fm.get("description", ""),
        "desc_chars": len(fm.get("description", "")),
        "user_summary_chars": len(fm.get("user_summary", "")),
        "name_len": len(fm.get("name", "")),
        "sections": sections,
        "n_sections": len(sections),
        "placeholder_sections": placeholder_sections,
        "n_placeholder": len(placeholder_sections),
        "code_bytes": len(code_txt.encode()),
        "code_has_entities": bool(ENTITY_RE.search(code_txt)),
        "code_lines": code_txt.count("\n"),
        "rel_dupes": rel_dupes,
        "has_assoc": bool(assoc),
        "enabled_quoted": bool(re.search(r'^enabled:\s*"', fm_block, re.M)),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", metavar="OUT")
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(SKILLS, "p2s-*/SKILL.md")))
    cards = [analyse(p) for p in paths]
    n = len(cards)
    R: dict = {"n": n}

    def pct(k: int) -> str:
        return f"{k}/{n} ({k * 100 // max(n, 1)}%)"

    # 体积
    b = [c["bytes"] for c in cards]
    R["bytes_total"] = sum(b)
    R["bytes_mean"] = int(statistics.mean(b))
    R["bytes_median"] = int(statistics.median(b))
    R["bytes_p90"] = sorted(b)[int(n * 0.9)]
    R["body_bytes_total"] = sum(c["body_bytes"] for c in cards)
    R["fm_bytes_total"] = sum(c["fm_bytes"] for c in cards)

    # frontmatter
    R["fm_missing_any"] = sum(1 for c in cards if c["fm_missing"])
    R["fm_missing_counter"] = Counter(k for c in cards for k in c["fm_missing"]).most_common()
    R["fm_field_counter"] = Counter(k for c in cards for k in c["fm_fields"]).most_common()

    # 占位
    R["cards_with_placeholder"] = sum(1 for c in cards if c["n_placeholder"])
    R["placeholder_section_counter"] = Counter(
        s for c in cards for s in c["placeholder_sections"]).most_common(20)
    R["placeholder_bytes"] = 0
    for path, c in zip(paths, cards):
        raw = open(path, encoding="utf-8").read()
        for m in re.finditer(r"^##\s+(.+?)\s*$\n(.*?)(?=^##\s|\Z)", raw, re.M | re.S):
            if PLACEHOLDER in m.group(2):
                R["placeholder_bytes"] += len(m.group(0).encode())

    # 代码模板
    R["cards_with_code"] = sum(1 for c in cards if c["code_bytes"] > 0)
    R["cards_code_entities"] = sum(1 for c in cards if c["code_has_entities"])
    R["code_bytes_total"] = sum(c["code_bytes"] for c in cards)

    # 关联重复
    R["cards_with_assoc"] = sum(1 for c in cards if c["has_assoc"])
    R["cards_rel_dupes"] = sum(1 for c in cards if c["rel_dupes"])
    R["rel_dupes_total"] = sum(c["rel_dupes"] for c in cards)

    # 分类
    R["l3_distinct"] = len({c["l3_business"] for c in cards})
    R["src_domain_distinct"] = len({c["src_domain"] for c in cards})
    R["plane_counter"] = Counter(c["l1_plane"] for c in cards).most_common()
    R["domain_counter"] = Counter(c["l2_domain"] for c in cards).most_common()
    R["unclassified"] = [c["dir"] for c in cards if not c["l3_business"]]
    R["l3_counter_top"] = Counter(c["l3_business"] for c in cards).most_common(20)
    R["l3_singleton"] = sum(1 for _, v in Counter(c["l3_business"] for c in cards).items() if v == 1)
    R["multi_l3"] = sum(1 for c in cards if "/" in c["l3_all"])
    R["l3_all_mismatch"] = sum(
        1 for c in cards if c["l3_all"] and c["l3_business"] not in c["l3_all"])

    # 身份唯一
    R["dir_unique"] = len({c["dir"] for c in cards}) == n
    R["name_unique"] = len({c["dir"][4:] for c in cards}) == n
    R["card_id_unique"] = len({c["card_id"] for c in cards}) == n
    R["card_id_blank"] = sum(1 for c in cards if not c["card_id"])
    base = Counter(re.sub(r"s$", "", re.sub(r"[^a-z0-9]", "", c["dir"][4:].lower())) for c in cards)
    R["near_dup_base"] = [(k, v) for k, v in base.items() if v > 1][:40]
    R["near_dup_base_n"] = sum(v - 1 for v in base.values() if v > 1)

    # 描述
    d = [c["desc_chars"] for c in cards]
    R["desc_mean"] = int(statistics.mean(d))
    R["desc_blank"] = sum(1 for x in d if x == 0)
    R["desc_short"] = sum(1 for x in d if 0 < x < 60)
    R["desc_no_trigger"] = sum(1 for c in cards if "触发" not in c["desc"])
    R["desc_no_boundary"] = sum(1 for c in cards if "何时不用" not in c["desc"])
    R["section_counter"] = Counter(s for c in cards for s in c["sections"]).most_common(30)
    R["n_sections_counter"] = Counter(c["n_sections"] for c in cards).most_common()

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({k: v for k, v in R.items()}, fh, ensure_ascii=False, indent=2)

    # ---- 人读输出 ----
    P = print
    P(f"卡数 {n}")
    P(f"语料 {R['bytes_total']:,} B = {R['bytes_total'] / 1048576:.1f} MB"
      f"（frontmatter {R['fm_bytes_total']:,} B / 正文 {R['body_bytes_total']:,} B）")
    P(f"单卡 中位 {R['bytes_median']:,} B · 均值 {R['bytes_mean']:,} B · P90 {R['bytes_p90']:,} B")
    P("")
    P("== frontmatter ==")
    P(f"  字段缺失的卡: {pct(R['fm_missing_any'])}  "
      f"缺失分布: {R['fm_missing_counter']}")
    P(f"  字段出现频次: {R['fm_field_counter'][:20]}")
    P("")
    P("== 占位段落 ==")
    P(f"  含占位正文的卡: {pct(R['cards_with_placeholder'])}"
      f"　占位字节合计 {R['placeholder_bytes']:,} B"
      f"（占全语料 {R['placeholder_bytes'] * 100 // max(R['bytes_total'], 1)}%）")
    for s, v in R["placeholder_section_counter"]:
        P(f"    {v:>4}  {s}")
    P("")
    P("== 代码模板 ==")
    P(f"  有代码段的卡: {pct(R['cards_with_code'])}　"
      f"含 HTML 实体的: {pct(R['cards_code_entities'])}　"
      f"代码字节合计 {R['code_bytes_total']:,} B"
      f"（{R['code_bytes_total'] * 100 // max(R['bytes_total'], 1)}%）")
    P("")
    P("== 技能关联 ==")
    P(f"  有关联段的卡: {pct(R['cards_with_assoc'])}　"
      f"含同名重复项的卡: {pct(R['cards_rel_dupes'])}　"
      f"重复行合计 {R['rel_dupes_total']:,}")
    P("")
    P("== 分类 ==")
    P(f"  面: {R['plane_counter']}")
    P(f"  责任域数 {R['domain_counter']}")
    P(f"  l3_business 去重后 {R['l3_distinct']} 个；只被 1 张卡用的 {R['l3_singleton']} 个")
    P(f"  未归类卡 {len(R['unclassified'])}: {R['unclassified'][:20]}")
    P(f"  l3_all 含多值 {R['multi_l3']} 张；l3_business 不在 l3_all 里 {R['l3_all_mismatch']} 张")
    P(f"  源域 {R['src_domain_distinct']} 个")
    P(f"  l3 头部: {R['l3_counter_top'][:12]}")
    P("")
    P("== 身份与去重 ==")
    P(f"  目录名唯一 {R['dir_unique']}　card_id 唯一 {R['card_id_unique']}"
      f"　card_id 空 {R['card_id_blank']}")
    P(f"  忽略复数/连字符后同基名的近重复 {R['near_dup_base_n']} 张：")
    for k, v in R["near_dup_base"][:25]:
        P(f"    {v}  {k}")
    P("")
    P("== 描述与章节 ==")
    P(f"  description 均长 {R['desc_mean']} 字　空 {R['desc_blank']}　<60 字 {R['desc_short']}")
    P(f"  含「触发」{n - R['desc_no_trigger']}　缺「触发」{R['desc_no_trigger']}"
      f"　缺「何时不用」{R['desc_no_boundary']}")
    P(f"  章节数分布: {R['n_sections_counter']}")
    P(f"  章节名: {R['section_counter'][:24]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
